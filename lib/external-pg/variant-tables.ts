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
