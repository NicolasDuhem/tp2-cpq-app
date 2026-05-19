import "server-only";
import { sql } from "@/lib/db/client";
import { withExternalPgClient } from "@/lib/external-pg/client";
import { normalizeExternalPgError } from "@/lib/external-pg/errors";

export type BcIdsLookupResult = {
  bcVariantId: number | null;
  bcProductId: number | null;
};

export type ExternalVariantEligibilityInput = {
  sku: string;
  countryCode: string;
  detailId: string;
  isActive: boolean;
};

export type ExternalVariantEligibilityStatusInput = {
  sku: string;
  countryCode: string;
};

export type ExternalVariantEligibilityStatus = {
  sku: string;
  countryCode: string;
  exists: boolean;
  isActive: boolean | null;
};

const EXTERNAL_ELIGIBILITY_STATUS_CHUNK_SIZE = 1000;
export const EXTERNAL_VARIANT_TABLE_WRITE_CONCURRENCY = Number(process.env.EXTERNAL_VARIANT_TABLE_WRITE_CONCURRENCY ?? 5);
const EXTERNAL_VARIANT_TABLE_SYNC_CHUNK_SIZE = 1000;

export type ExternalVariantInput = {
  sku: string;
  bcVariantId: number;
  bcProductId: number;
  forecastCtyCode: string;
  bblRuleSetItem: string;
};

export type ExternalVariantEligibilitySyncResult = {
  action: "inserted" | "updated" | "skipped";
  businessKey: {
    sku: string;
    countryCode: string;
  };
  message?: string;
};

export type ExternalVariantSyncResult = {
  action: "inserted" | "updated" | "skipped";
  businessKey: {
    sku: string;
  };
  message?: string;
};

export type ExternalVariantTablesSyncResult = {
  ok: boolean;
  skipped: boolean;
  message: string;
  variantResult: ExternalVariantSyncResult;
  eligibilityResult: ExternalVariantEligibilitySyncResult;
};

export type ExternalVariantTablesBatchInput = ExternalVariantEligibilityInput & {
  bcVariantId: number;
  bcProductId: number;
  forecastCtyCode: string;
  bblRuleSetItem: string;
};

export type ExternalVariantTablesBatchSummary = {
  variantsInserted: number;
  variantsUpdated: number;
  eligibilityInserted: number;
  eligibilityUpdated: number;
  skipped: number;
};

export type ExternalVariantTablesBatchResult = {
  results: ExternalVariantTablesSyncResult[];
  summary: ExternalVariantTablesBatchSummary;
};

export type ExternalVariantWriteDiagnosticResult = {
  rolledBack: true;
  tableNames: string[];
  durationMs: number;
  variantResult: ExternalVariantSyncResult;
  eligibilityResult: ExternalVariantEligibilitySyncResult;
};

type ExternalVariantPushStage =
  | "begin_start"
  | "begin_success"
  | "select_start"
  | "select_success"
  | "insert_start"
  | "insert_success"
  | "update_start"
  | "update_success"
  | "sync_start"
  | "sync_success"
  | "rollback_start"
  | "rollback_success";

type ExternalPgClient = Parameters<Parameters<typeof withExternalPgClient>[0]>[0];

type ExternalVariantPushOptions = {
  onStage?: (
    stage:
      | ExternalVariantPushStage
      | import("@/lib/external-pg/client").ExternalPgStage,
    details?: Record<string, unknown>,
  ) => void;
};

const FORECAST_CTY_CODE = "F_BB";
const asTrimmed = (value: unknown) => String(value ?? "").trim();

function quoteIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid PostgreSQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

function qualifiedTableName(
  schema: string,
  table: "variant_eligibilities" | "variants",
): string {
  return `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
}

function currentExternalTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

function ensureEligibilityInput(input: ExternalVariantEligibilityInput) {
  if (!asTrimmed(input.sku)) {
    throw new Error("sku is required for external variant_eligibilities sync");
  }
  if (!asTrimmed(input.countryCode)) {
    throw new Error("countryCode is required for external variant_eligibilities sync");
  }
  if (!asTrimmed(input.detailId)) {
    throw new Error("detailId is required for external variant_eligibilities sync");
  }
}

function ensureVariantInput(input: ExternalVariantInput) {
  if (!asTrimmed(input.sku)) {
    throw new Error("sku is required for external variants sync");
  }
  if (!Number.isFinite(input.bcVariantId)) {
    throw new Error("bcVariantId is required for external variants sync");
  }
  if (!Number.isFinite(input.bcProductId)) {
    throw new Error("bcProductId is required for external variants sync");
  }
  if (!asTrimmed(input.forecastCtyCode)) {
    throw new Error("forecastCtyCode is required for external variants sync");
  }
  if (!asTrimmed(input.bblRuleSetItem)) {
    throw new Error("bblRuleSetItem is required for external variants sync");
  }
}

export async function lookupBcIds(skuCode: string): Promise<BcIdsLookupResult> {
  const sku = asTrimmed(skuCode);
  if (!sku) throw new Error("skuCode is required");

  const rows = (await sql`
    select
      bc_variant_id,
      bc_product_id
    from public.bc_item_variant_map
    where sku_code = ${sku}
    order by updated_at desc nulls last, id desc
    limit 1
  `) as Array<{ bc_variant_id: number | null; bc_product_id: number | null }>;

  const row = rows[0];
  return {
    bcVariantId: row?.bc_variant_id ?? null,
    bcProductId: row?.bc_product_id ?? null,
  };
}

export async function lookupLatestSamplerRuleset(
  skuCode: string,
): Promise<string | null> {
  const sku = asTrimmed(skuCode);
  if (!sku) throw new Error("skuCode is required");

  const rows = (await sql`
    select csr.ruleset
    from public.cpq_sampler_result csr
    join public.bc_item_variant_map map
      on coalesce(trim(csr.ipn_code), '') = coalesce(trim(map.sku_code), '')
    where coalesce(trim(map.sku_code), '') = ${sku}
      and coalesce(trim(csr.ruleset), '') <> ''
    group by csr.ruleset
    order by
      max(csr.updated_at) desc nulls last,
      max(csr.created_at) desc nulls last,
      csr.ruleset asc
    limit 1
  `) as Array<{ ruleset: string | null }>;

  return asTrimmed(rows[0]?.ruleset) || null;
}


async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const concurrency = Math.max(1, Math.trunc(limit));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

function normalizeWriteConcurrency(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 5;
}

async function lookupExistingVariantsWithClient(
  client: ExternalPgClient,
  tableName: string,
  skus: string[],
  options: ExternalVariantPushOptions,
): Promise<Set<string>> {
  const existing = new Set<string>();
  const uniqueSkus = [...new Set(skus.map(asTrimmed).filter(Boolean))];
  for (let index = 0; index < uniqueSkus.length; index += EXTERNAL_VARIANT_TABLE_SYNC_CHUNK_SIZE) {
    const chunk = uniqueSkus.slice(index, index + EXTERNAL_VARIANT_TABLE_SYNC_CHUNK_SIZE);
    options.onStage?.("select_start", { tableName, offset: index, skuCount: chunk.length, batch: true });
    const response = await client.query(
      `
        with requested as (
          select nullif(trim(value::text), '') as sku
          from jsonb_array_elements_text($1::jsonb)
        )
        select distinct trim(variant."Sku") as "Sku"
        from ${tableName} variant
        join requested on trim(variant."Sku") = requested.sku
        where requested.sku is not null
      `,
      [JSON.stringify(chunk)],
    );
    for (const row of response.rows as Array<{ Sku: string | null }>) {
      const sku = asTrimmed(row.Sku);
      if (sku) existing.add(sku);
    }
    options.onStage?.("select_success", { tableName, offset: index, skuCount: chunk.length, foundCount: existing.size, batch: true });
  }
  return existing;
}

async function lookupExistingEligibilitiesWithClient(
  client: ExternalPgClient,
  tableName: string,
  pairs: Array<{ sku: string; countryCode: string }>,
  options: ExternalVariantPushOptions,
): Promise<Set<string>> {
  const existing = new Set<string>();
  const normalizedPairMap = new Map<string, { sku: string; countryCode: string }>();
  for (const pair of pairs) {
    const sku = asTrimmed(pair.sku);
    const countryCode = asTrimmed(pair.countryCode).toUpperCase();
    if (!sku || !countryCode) continue;
    normalizedPairMap.set(`${sku}::${countryCode}`, { sku, countryCode });
  }
  const normalizedPairs = [...normalizedPairMap.values()];

  for (let index = 0; index < normalizedPairs.length; index += EXTERNAL_VARIANT_TABLE_SYNC_CHUNK_SIZE) {
    const chunk = normalizedPairs.slice(index, index + EXTERNAL_VARIANT_TABLE_SYNC_CHUNK_SIZE);
    options.onStage?.("select_start", { tableName, offset: index, pairCount: chunk.length, batch: true });
    const response = await client.query(
      `
        with requested as (
          select
            nullif(trim(input."Sku"), '') as sku,
            nullif(trim(input."CountryCode"), '') as country_code
          from jsonb_to_recordset($1::jsonb) as input("Sku" text, "CountryCode" text)
        )
        select distinct
          trim(eligibility."Sku") as "Sku",
          trim(eligibility."CountryCode") as "CountryCode"
        from ${tableName} eligibility
        join requested
          on trim(eligibility."Sku") = requested.sku
         and trim(eligibility."CountryCode") = requested.country_code
        where requested.sku is not null
          and requested.country_code is not null
      `,
      [JSON.stringify(chunk.map((pair) => ({ Sku: pair.sku, CountryCode: pair.countryCode })))],
    );
    for (const row of response.rows as Array<{ Sku: string | null; CountryCode: string | null }>) {
      const sku = asTrimmed(row.Sku);
      const countryCode = asTrimmed(row.CountryCode).toUpperCase();
      if (sku && countryCode) existing.add(`${sku}::${countryCode}`);
    }
    options.onStage?.("select_success", { tableName, offset: index, pairCount: chunk.length, foundCount: existing.size, batch: true });
  }
  return existing;
}

async function writeExternalVariantWithKnownExistence(
  client: ExternalPgClient,
  tableName: string,
  input: ExternalVariantInput,
  exists: boolean,
  options: ExternalVariantPushOptions,
): Promise<ExternalVariantSyncResult> {
  ensureVariantInput(input);
  const payload = {
    sku: asTrimmed(input.sku),
    bcVariantId: input.bcVariantId,
    bcProductId: input.bcProductId,
    forecastCtyCode: asTrimmed(input.forecastCtyCode),
    bblRuleSetItem: asTrimmed(input.bblRuleSetItem),
  };
  const timestamp = currentExternalTimestamp();
  const businessKey = { sku: payload.sku };
  try {
    if (exists) {
      options.onStage?.("update_start", { tableName, businessKey, batch: true });
      await client.query(
        `
        update ${tableName}
        set
          "BcVariantId" = $2,
          "BcProductId" = $3,
          "ForecastCtyCode" = $4,
          "BblRuleSetItem" = $5,
          "UpdatedAt" = $6
        where "Sku" = $1
        `,
        [payload.sku, payload.bcVariantId, payload.bcProductId, payload.forecastCtyCode, payload.bblRuleSetItem, timestamp],
      );
      const result = { action: "updated" as const, businessKey };
      options.onStage?.("update_success", { tableName, ...result, batch: true });
      return result;
    }

    options.onStage?.("insert_start", { tableName, businessKey, batch: true });
    await client.query(
      `
      insert into ${tableName} (
        "Sku", "BcVariantId", "BcProductId", "ForecastCtyCode", "BblRuleSetItem", "CreatedAt", "UpdatedAt"
      ) values ($1, $2, $3, $4, $5, $6, $7)
      `,
      [payload.sku, payload.bcVariantId, payload.bcProductId, payload.forecastCtyCode, payload.bblRuleSetItem, timestamp, timestamp],
    );
    const result = { action: "inserted" as const, businessKey };
    options.onStage?.("insert_success", { tableName, ...result, batch: true });
    return result;
  } catch (error) {
    throw normalizeExternalPgError(error, { stage: "variants_sync_execute" });
  }
}

async function writeExternalVariantEligibilityWithKnownExistence(
  client: ExternalPgClient,
  tableName: string,
  input: ExternalVariantEligibilityInput,
  exists: boolean,
  options: ExternalVariantPushOptions,
): Promise<ExternalVariantEligibilitySyncResult> {
  ensureEligibilityInput(input);
  const payload = {
    sku: asTrimmed(input.sku),
    countryCode: asTrimmed(input.countryCode).toUpperCase(),
    detailId: asTrimmed(input.detailId),
    isActive: input.isActive === true,
  };
  const businessKey = { sku: payload.sku, countryCode: payload.countryCode };
  try {
    if (exists) {
      options.onStage?.("update_start", { tableName, businessKey, batch: true });
      await client.query(
        `
        update ${tableName}
        set "DetailId" = $3, "IsActive" = $4
        where "Sku" = $1
          and "CountryCode" = $2
        `,
        [payload.sku, payload.countryCode, payload.detailId, payload.isActive],
      );
      const result = { action: "updated" as const, businessKey };
      options.onStage?.("update_success", { tableName, ...result, batch: true });
      return result;
    }

    options.onStage?.("insert_start", { tableName, businessKey, batch: true });
    await client.query(
      `
      insert into ${tableName} ("Sku", "CountryCode", "DetailId", "IsActive")
      values ($1, $2, $3, $4)
      `,
      [payload.sku, payload.countryCode, payload.detailId, payload.isActive],
    );
    const result = { action: "inserted" as const, businessKey };
    options.onStage?.("insert_success", { tableName, ...result, batch: true });
    return result;
  } catch (error) {
    throw normalizeExternalPgError(error, { stage: "variant_eligibilities_sync_execute" });
  }
}

async function syncExternalVariantWithClient(
  client: ExternalPgClient,
  tableName: string,
  input: ExternalVariantInput,
  options: ExternalVariantPushOptions,
): Promise<ExternalVariantSyncResult> {
  ensureVariantInput(input);
  const payload = {
    sku: asTrimmed(input.sku),
    bcVariantId: input.bcVariantId,
    bcProductId: input.bcProductId,
    forecastCtyCode: asTrimmed(input.forecastCtyCode),
    bblRuleSetItem: asTrimmed(input.bblRuleSetItem),
  };
  const timestamp = currentExternalTimestamp();

  try {
    options.onStage?.("select_start", {
      tableName,
      businessKey: { sku: payload.sku },
    });
    const existing = await client.query(
      `select "Sku" from ${tableName} where "Sku" = $1 limit 1`,
      [payload.sku],
    );
    const exists = existing.rows.length > 0;
    options.onStage?.("select_success", {
      tableName,
      exists,
      businessKey: { sku: payload.sku },
    });

    if (exists) {
      options.onStage?.("update_start", {
        tableName,
        businessKey: { sku: payload.sku },
      });
      await client.query(
        `
        update ${tableName}
        set
          "BcVariantId" = $2,
          "BcProductId" = $3,
          "ForecastCtyCode" = $4,
          "BblRuleSetItem" = $5,
          "UpdatedAt" = $6
        where "Sku" = $1
        `,
        [
          payload.sku,
          payload.bcVariantId,
          payload.bcProductId,
          payload.forecastCtyCode,
          payload.bblRuleSetItem,
          timestamp,
        ],
      );
      const result = {
        action: "updated" as const,
        businessKey: { sku: payload.sku },
      };
      options.onStage?.("update_success", { tableName, ...result });
      return result;
    }

    options.onStage?.("insert_start", {
      tableName,
      businessKey: { sku: payload.sku },
    });
    await client.query(
      `
      insert into ${tableName} (
        "Sku",
        "BcVariantId",
        "BcProductId",
        "ForecastCtyCode",
        "BblRuleSetItem",
        "CreatedAt",
        "UpdatedAt"
      ) values (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7
      )
      `,
      [
        payload.sku,
        payload.bcVariantId,
        payload.bcProductId,
        payload.forecastCtyCode,
        payload.bblRuleSetItem,
        timestamp,
        timestamp,
      ],
    );
    const result = {
      action: "inserted" as const,
      businessKey: { sku: payload.sku },
    };
    options.onStage?.("insert_success", { tableName, ...result });
    return result;
  } catch (error) {
    throw normalizeExternalPgError(error, { stage: "variants_sync_execute" });
  }
}

async function syncExternalVariantEligibilityWithClient(
  client: ExternalPgClient,
  tableName: string,
  input: ExternalVariantEligibilityInput,
  options: ExternalVariantPushOptions,
): Promise<ExternalVariantEligibilitySyncResult> {
  ensureEligibilityInput(input);
  const payload = {
    sku: asTrimmed(input.sku),
    countryCode: asTrimmed(input.countryCode).toUpperCase(),
    detailId: asTrimmed(input.detailId),
    isActive: input.isActive === true,
  };

  try {
    const businessKey = { sku: payload.sku, countryCode: payload.countryCode };
    options.onStage?.("select_start", { tableName, businessKey });
    const existing = await client.query(
      `select "Sku" from ${tableName} where "Sku" = $1 and "CountryCode" = $2 limit 1`,
      [payload.sku, payload.countryCode],
    );
    const exists = existing.rows.length > 0;
    options.onStage?.("select_success", { tableName, exists, businessKey });

    if (exists) {
      options.onStage?.("update_start", { tableName, businessKey });
      await client.query(
        `
        update ${tableName}
        set
          "DetailId" = $3,
          "IsActive" = $4
        where "Sku" = $1
          and "CountryCode" = $2
        `,
        [payload.sku, payload.countryCode, payload.detailId, payload.isActive],
      );
      const result = { action: "updated" as const, businessKey };
      options.onStage?.("update_success", { tableName, ...result });
      return result;
    }

    options.onStage?.("insert_start", { tableName, businessKey });
    await client.query(
      `
      insert into ${tableName} (
        "Sku",
        "CountryCode",
        "DetailId",
        "IsActive"
      ) values (
        $1,
        $2,
        $3,
        $4
      )
      `,
      [payload.sku, payload.countryCode, payload.detailId, payload.isActive],
    );
    const result = { action: "inserted" as const, businessKey };
    options.onStage?.("insert_success", { tableName, ...result });
    return result;
  } catch (error) {
    throw normalizeExternalPgError(error, {
      stage: "variant_eligibilities_sync_execute",
    });
  }
}

export async function syncExternalVariant(
  input: ExternalVariantInput,
  options: ExternalVariantPushOptions = {},
): Promise<ExternalVariantSyncResult> {
  return withExternalPgClient(async (client, schema) => {
    return syncExternalVariantWithClient(
      client,
      qualifiedTableName(schema, "variants"),
      input,
      options,
    );
  }, options);
}

export async function syncExternalVariantEligibility(
  input: ExternalVariantEligibilityInput,
  options: ExternalVariantPushOptions = {},
): Promise<ExternalVariantEligibilitySyncResult> {
  return withExternalPgClient(async (client, schema) => {
    return syncExternalVariantEligibilityWithClient(
      client,
      qualifiedTableName(schema, "variant_eligibilities"),
      input,
      options,
    );
  }, options);
}

export async function syncExternalVariantTablesForPayload(
  input: ExternalVariantEligibilityInput & { forecastCtyCodeOverride?: string; bblRuleSetItemOverride?: string },
  options: ExternalVariantPushOptions = {},
): Promise<ExternalVariantTablesSyncResult> {
  ensureEligibilityInput(input);
  const sku = asTrimmed(input.sku);
  const countryCode = asTrimmed(input.countryCode).toUpperCase();
  const businessKey = { sku, countryCode };

  const { bcVariantId, bcProductId } = await lookupBcIds(sku);
  if (bcVariantId == null || bcProductId == null) {
    const missing = [
      bcProductId == null ? "bc_product_id" : null,
      bcVariantId == null ? "bc_variant_id" : null,
    ]
      .filter((value): value is string => Boolean(value))
      .join(" and ");
    const message = `External PostgreSQL push skipped for ${sku}: missing ${missing} in Neon bc_item_variant_map.`;
    return {
      ok: true,
      skipped: true,
      message,
      variantResult: { action: "skipped", businessKey: { sku }, message },
      eligibilityResult: { action: "skipped", businessKey, message },
    };
  }

  const ruleset = asTrimmed(input.bblRuleSetItemOverride) || (await lookupLatestSamplerRuleset(sku));
  if (!ruleset) {
    throw new Error(`No cpq_sampler_result ruleset found for SKU ${sku}`);
  }
  const forecastCtyCode = asTrimmed(input.forecastCtyCodeOverride) || FORECAST_CTY_CODE;

  return withExternalPgClient(async (client, schema) => {
    const variantsTableName = qualifiedTableName(schema, "variants");
    const eligibilityTableName = qualifiedTableName(schema, "variant_eligibilities");
    options.onStage?.("sync_start", {
      sku,
      countryCode,
      order: ["variants", "variant_eligibilities"],
    });
    const variantResult = await syncExternalVariantWithClient(
      client,
      variantsTableName,
      {
        sku,
        bcVariantId,
        bcProductId,
        forecastCtyCode,
        bblRuleSetItem: ruleset,
      },
      options,
    );
    const eligibilityResult = await syncExternalVariantEligibilityWithClient(
      client,
      eligibilityTableName,
      {
        sku,
        countryCode,
        detailId: input.detailId,
        isActive: input.isActive,
      },
      options,
    );
    options.onStage?.("sync_success", {
      sku,
      countryCode,
      variantAction: variantResult.action,
      eligibilityAction: eligibilityResult.action,
    });
    return {
      ok: true,
      skipped: false,
      message: `External PostgreSQL push completed for ${sku} / ${countryCode}.`,
      variantResult,
      eligibilityResult,
    };
  }, options);
}


export async function syncExternalVariantTablesBatch(
  inputs: ExternalVariantTablesBatchInput[],
  options: ExternalVariantPushOptions & { writeConcurrency?: number } = {},
): Promise<ExternalVariantTablesBatchResult> {
  const normalizedInputs = inputs.map((input) => ({
    sku: asTrimmed(input.sku),
    countryCode: asTrimmed(input.countryCode).toUpperCase(),
    detailId: asTrimmed(input.detailId),
    isActive: input.isActive === true,
    bcVariantId: input.bcVariantId,
    bcProductId: input.bcProductId,
    forecastCtyCode: asTrimmed(input.forecastCtyCode),
    bblRuleSetItem: asTrimmed(input.bblRuleSetItem),
  }));

  for (const input of normalizedInputs) {
    ensureEligibilityInput(input);
    ensureVariantInput(input);
  }

  if (!normalizedInputs.length) {
    return {
      results: [],
      summary: { variantsInserted: 0, variantsUpdated: 0, eligibilityInserted: 0, eligibilityUpdated: 0, skipped: 0 },
    };
  }

  const writeConcurrency = normalizeWriteConcurrency(options.writeConcurrency ?? EXTERNAL_VARIANT_TABLE_WRITE_CONCURRENCY);

  return withExternalPgClient(async (client, schema) => {
    const variantsTableName = qualifiedTableName(schema, "variants");
    const eligibilityTableName = qualifiedTableName(schema, "variant_eligibilities");
    options.onStage?.("sync_start", {
      targetCount: normalizedInputs.length,
      order: ["variants", "variant_eligibilities"],
      writeConcurrency,
      batch: true,
    });

    const variantInputs = [...new Map(normalizedInputs.map((input) => [input.sku, {
      sku: input.sku,
      bcVariantId: input.bcVariantId,
      bcProductId: input.bcProductId,
      forecastCtyCode: input.forecastCtyCode,
      bblRuleSetItem: input.bblRuleSetItem,
    }])).values()];

    const existingVariants = await lookupExistingVariantsWithClient(
      client,
      variantsTableName,
      variantInputs.map((input) => input.sku),
      options,
    );
    const existingEligibilities = await lookupExistingEligibilitiesWithClient(
      client,
      eligibilityTableName,
      normalizedInputs.map((input) => ({ sku: input.sku, countryCode: input.countryCode })),
      options,
    );

    const variantResults = new Map<string, ExternalVariantSyncResult>();
    const variantErrors = new Map<string, string>();
    await mapWithConcurrency(variantInputs, writeConcurrency, async (input) => {
      try {
        const result = await writeExternalVariantWithKnownExistence(
          client,
          variantsTableName,
          input,
          existingVariants.has(input.sku),
          options,
        );
        variantResults.set(input.sku, result);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "External variants write failed.";
        variantErrors.set(input.sku, message);
        return { action: "skipped" as const, businessKey: { sku: input.sku }, message };
      }
    });

    const eligibilityResults = new Map<string, ExternalVariantEligibilitySyncResult>();
    const eligibilityErrors = new Map<string, string>();
    await mapWithConcurrency(normalizedInputs, writeConcurrency, async (input) => {
      const key = `${input.sku}::${input.countryCode}`;
      if (variantErrors.has(input.sku)) {
        const message = variantErrors.get(input.sku) ?? "External variants write failed.";
        eligibilityErrors.set(key, message);
        return { action: "skipped" as const, businessKey: { sku: input.sku, countryCode: input.countryCode }, message };
      }
      try {
        const result = await writeExternalVariantEligibilityWithKnownExistence(
          client,
          eligibilityTableName,
          input,
          existingEligibilities.has(key),
          options,
        );
        eligibilityResults.set(key, result);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "External variant_eligibilities write failed.";
        eligibilityErrors.set(key, message);
        return { action: "skipped" as const, businessKey: { sku: input.sku, countryCode: input.countryCode }, message };
      }
    });

    const results = normalizedInputs.map((input) => {
      const key = `${input.sku}::${input.countryCode}`;
      const variantError = variantErrors.get(input.sku);
      const eligibilityError = eligibilityErrors.get(key);
      const variantResult = variantResults.get(input.sku) ?? {
        action: "skipped" as const,
        businessKey: { sku: input.sku },
        message: variantError,
      };
      const eligibilityResult = eligibilityResults.get(key) ?? {
        action: "skipped" as const,
        businessKey: { sku: input.sku, countryCode: input.countryCode },
        message: eligibilityError,
      };
      const errorMessage = variantError || eligibilityError;
      return {
        ok: !errorMessage,
        skipped: false,
        message: errorMessage ?? `External PostgreSQL push completed for ${input.sku} / ${input.countryCode}.`,
        variantResult,
        eligibilityResult,
      };
    });

    const summary = {
      variantsInserted: [...variantResults.values()].filter((result) => result.action === "inserted").length,
      variantsUpdated: [...variantResults.values()].filter((result) => result.action === "updated").length,
      eligibilityInserted: [...eligibilityResults.values()].filter((result) => result.action === "inserted").length,
      eligibilityUpdated: [...eligibilityResults.values()].filter((result) => result.action === "updated").length,
      skipped: results.filter((result) => result.skipped).length,
    };

    options.onStage?.("sync_success", { ...summary, targetCount: normalizedInputs.length, batch: true });
    return { results, summary };
  }, options);
}

export async function runExternalVariantTablesWriteDiagnostic(
  input: ExternalVariantInput & ExternalVariantEligibilityInput,
  options: ExternalVariantPushOptions = {},
): Promise<ExternalVariantWriteDiagnosticResult> {
  ensureVariantInput(input);
  ensureEligibilityInput(input);
  const startedAt = Date.now();

  return withExternalPgClient(async (client, schema) => {
    const variantsTableName = qualifiedTableName(schema, "variants");
    const eligibilityTableName = qualifiedTableName(schema, "variant_eligibilities");
    options.onStage?.("begin_start", {
      tableNames: [variantsTableName, eligibilityTableName],
      mode: "write_diagnostic_rollback",
    });
    try {
      await client.query("begin");
      options.onStage?.("begin_success", {
        tableNames: [variantsTableName, eligibilityTableName],
        mode: "write_diagnostic_rollback",
      });
      const variantResult = await syncExternalVariantWithClient(
        client,
        variantsTableName,
        input,
        options,
      );
      const eligibilityResult = await syncExternalVariantEligibilityWithClient(
        client,
        eligibilityTableName,
        input,
        options,
      );
      options.onStage?.("rollback_start", {
        tableNames: [variantsTableName, eligibilityTableName],
        mode: "write_diagnostic_rollback",
      });
      await client.query("rollback");
      options.onStage?.("rollback_success", {
        tableNames: [variantsTableName, eligibilityTableName],
        mode: "write_diagnostic_rollback",
      });
      return {
        rolledBack: true,
        tableNames: [variantsTableName, eligibilityTableName],
        durationMs: Math.max(0, Date.now() - startedAt),
        variantResult,
        eligibilityResult,
      };
    } catch (error) {
      options.onStage?.("rollback_start", {
        tableNames: [variantsTableName, eligibilityTableName],
        mode: "write_diagnostic_rollback",
        from: "catch",
      });
      await client.query("rollback").catch(() => undefined);
      options.onStage?.("rollback_success", {
        tableNames: [variantsTableName, eligibilityTableName],
        mode: "write_diagnostic_rollback",
        from: "catch",
      });
      throw normalizeExternalPgError(error, { stage: "write_diagnostic_execute" });
    }
  }, options);
}


export async function lookupExternalVariantEligibilityStatuses(
  pairs: ExternalVariantEligibilityStatusInput[],
  options: ExternalVariantPushOptions = {},
): Promise<ExternalVariantEligibilityStatus[]> {
  const normalizedPairs = new Map<string, ExternalVariantEligibilityStatusInput>();
  for (const pair of pairs) {
    const sku = asTrimmed(pair.sku);
    const countryCode = asTrimmed(pair.countryCode);
    if (!sku || !countryCode) continue;
    normalizedPairs.set(`${sku}::${countryCode}`, { sku, countryCode });
  }

  const requestedPairs = [...normalizedPairs.values()];
  if (!requestedPairs.length) return [];

  return withExternalPgClient(async (client, schema) => {
    const tableName = qualifiedTableName(schema, "variant_eligibilities");
    const results = new Map<string, ExternalVariantEligibilityStatus>();

    for (let index = 0; index < requestedPairs.length; index += EXTERNAL_ELIGIBILITY_STATUS_CHUNK_SIZE) {
      const chunk = requestedPairs.slice(index, index + EXTERNAL_ELIGIBILITY_STATUS_CHUNK_SIZE);
      options.onStage?.("select_start", {
        table: tableName,
        offset: index,
        pairCount: chunk.length,
      });

      const response = await client.query(
        `
          with requested as (
            select
              nullif(trim(input."Sku"), '') as sku,
              nullif(trim(input."CountryCode"), '') as country_code
            from jsonb_to_recordset($1::jsonb) as input("Sku" text, "CountryCode" text)
          ),
          matched as (
            select
              trim(eligibility."Sku") as sku,
              trim(eligibility."CountryCode") as country_code,
              bool_or(eligibility."IsActive" is true) as is_active
            from ${tableName} eligibility
            join requested
              on trim(eligibility."Sku") = requested.sku
             and trim(eligibility."CountryCode") = requested.country_code
            group by trim(eligibility."Sku"), trim(eligibility."CountryCode")
          )
          select
            requested.sku as "Sku",
            requested.country_code as "CountryCode",
            matched.is_active as "IsActive",
            (matched.sku is not null) as "Exists"
          from requested
          left join matched
            on matched.sku = requested.sku
           and matched.country_code = requested.country_code
          where requested.sku is not null
            and requested.country_code is not null
        `,
        [JSON.stringify(chunk.map((pair) => ({ Sku: pair.sku, CountryCode: pair.countryCode })))],
      );

      for (const row of response.rows as Array<{ Sku: string; CountryCode: string; IsActive: boolean | null; Exists: boolean }>) {
        const sku = asTrimmed(row.Sku);
        const countryCode = asTrimmed(row.CountryCode);
        if (!sku || !countryCode) continue;
        results.set(`${sku}::${countryCode}`, {
          sku,
          countryCode,
          exists: row.Exists === true,
          isActive: row.Exists === true ? row.IsActive === true : null,
        });
      }

      options.onStage?.("select_success", {
        table: tableName,
        offset: index,
        pairCount: chunk.length,
      });
    }

    return requestedPairs.map((pair) =>
      results.get(`${pair.sku}::${pair.countryCode}`) ?? {
        sku: pair.sku,
        countryCode: pair.countryCode,
        exists: false,
        isActive: null,
      },
    );
  }, options);
}
