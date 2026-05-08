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
  bcVariantId: number | null;
  bcProductId: number | null;
  forecastCtyCode: string | null;
  bblRuleSetItem: string;
};

export type ExternalVariantEligibilityUpsertResult = {
  action: "inserted" | "updated";
  businessKey: {
    sku: string;
    countryCode: string;
  };
};

export type ExternalVariantUpsertResult = {
  action: "inserted" | "updated";
  businessKey: {
    sku: string;
  };
};

export type ExternalVariantWriteDiagnosticResult = {
  rolledBack: true;
  tableName: string;
  durationMs: number;
};

type ExternalVariantPushStage =
  | "begin_start"
  | "begin_success"
  | "upsert_start"
  | "upsert_success"
  | "rollback_start"
  | "rollback_success";

type ExternalVariantPushOptions = {
  onStage?: (
    stage:
      | ExternalVariantPushStage
      | import("@/lib/external-pg/client").ExternalPgStage,
    details?: Record<string, unknown>,
  ) => void;
};

const asTrimmed = (value: unknown) => String(value ?? "").trim();

function quoteIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid PostgreSQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

function qualifiedTableName(
  schema: string,
  table: "variant_eligibility" | "variants",
): string {
  return `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
}

function ensureEligibilityInput(input: ExternalVariantEligibilityInput) {
  if (!asTrimmed(input.sku))
    throw new Error("sku is required for external push");
  if (!asTrimmed(input.countryCode))
    throw new Error("countryCode is required for external push");
  if (!asTrimmed(input.detailId))
    throw new Error("detailId is required for external push");
}

function ensureVariantInput(input: ExternalVariantInput) {
  if (!asTrimmed(input.sku))
    throw new Error("sku is required for external push");
  if (!asTrimmed(input.bblRuleSetItem))
    throw new Error("bblRuleSetItem is required for external push");
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
    select ruleset
    from public.cpq_sampler_result
    where coalesce(trim(ipn_code), '') = ${sku}
    order by updated_at desc nulls last, created_at desc nulls last, id desc
    limit 1
  `) as Array<{ ruleset: string | null }>;

  return asTrimmed(rows[0]?.ruleset) || null;
}

export async function upsertExternalVariantEligibility(
  input: ExternalVariantEligibilityInput,
  options: ExternalVariantPushOptions = {},
): Promise<ExternalVariantEligibilityUpsertResult> {
  ensureEligibilityInput(input);
  const payload = {
    sku: asTrimmed(input.sku),
    countryCode: asTrimmed(input.countryCode).toUpperCase(),
    detailId: asTrimmed(input.detailId),
    isActive: input.isActive === true,
  };

  return withExternalPgClient(async (client, schema) => {
    const tableName = qualifiedTableName(schema, "variant_eligibility");
    options.onStage?.("upsert_start", { tableName });

    let result;
    try {
      result = await client.query(
        `
        insert into ${tableName} (
          "Sku",
          "CountryCode",
          "DetailID",
          "IsActive"
        ) values (
          $1,
          $2,
          $3,
          $4
        )
        on conflict ("Sku", "CountryCode")
        do update set
          "DetailID" = excluded."DetailID",
          "IsActive" = excluded."IsActive"
        returning (xmax = 0) as inserted
        `,
        [payload.sku, payload.countryCode, payload.detailId, payload.isActive],
      );
    } catch (error) {
      throw normalizeExternalPgError(error, { stage: "upsert_execute" });
    }

    const row = result.rows[0] as { inserted?: boolean } | undefined;
    if (!row)
      throw new Error(
        "No result returned by external variant_eligibility upsert",
      );

    const action = row.inserted ? "inserted" : "updated";
    const businessKey = { sku: payload.sku, countryCode: payload.countryCode };
    options.onStage?.("upsert_success", { action, businessKey });
    return { action, businessKey };
  }, options);
}

export async function upsertExternalVariant(
  input: ExternalVariantInput,
  options: ExternalVariantPushOptions = {},
): Promise<ExternalVariantUpsertResult> {
  ensureVariantInput(input);
  const payload = {
    sku: asTrimmed(input.sku),
    bcVariantId: input.bcVariantId,
    bcProductId: input.bcProductId,
    forecastCtyCode:
      input.forecastCtyCode == null
        ? null
        : asTrimmed(input.forecastCtyCode) || null,
    bblRuleSetItem: asTrimmed(input.bblRuleSetItem),
  };

  return withExternalPgClient(async (client, schema) => {
    const tableName = qualifiedTableName(schema, "variants");
    options.onStage?.("upsert_start", { tableName });

    let result;
    try {
      result = await client.query(
        `
        insert into ${tableName} (
          "Sku",
          "BcVariantID",
          "BcProductID",
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
          now(),
          now()
        )
        on conflict ("Sku")
        do update set
          "BcVariantID" = excluded."BcVariantID",
          "BcProductID" = excluded."BcProductID",
          "ForecastCtyCode" = excluded."ForecastCtyCode",
          "BblRuleSetItem" = excluded."BblRuleSetItem",
          "UpdatedAt" = now()
        returning (xmax = 0) as inserted
        `,
        [
          payload.sku,
          payload.bcVariantId,
          payload.bcProductId,
          payload.forecastCtyCode,
          payload.bblRuleSetItem,
        ],
      );
    } catch (error) {
      throw normalizeExternalPgError(error, { stage: "upsert_execute" });
    }

    const row = result.rows[0] as { inserted?: boolean } | undefined;
    if (!row) throw new Error("No result returned by external variants upsert");

    const action = row.inserted ? "inserted" : "updated";
    const businessKey = { sku: payload.sku };
    options.onStage?.("upsert_success", { action, businessKey });
    return { action, businessKey };
  }, options);
}

export async function runExternalVariantEligibilityWriteDiagnostic(
  input: ExternalVariantEligibilityInput,
  options: ExternalVariantPushOptions = {},
): Promise<ExternalVariantWriteDiagnosticResult> {
  ensureEligibilityInput(input);
  const startedAt = Date.now();
  const payload = {
    sku: asTrimmed(input.sku),
    countryCode: asTrimmed(input.countryCode).toUpperCase(),
    detailId: asTrimmed(input.detailId),
    isActive: input.isActive === true,
  };

  return withExternalPgClient(async (client, schema) => {
    const tableName = qualifiedTableName(schema, "variant_eligibility");
    options.onStage?.("begin_start", {
      tableName,
      mode: "write_diagnostic_rollback",
    });
    try {
      await client.query("begin");
      options.onStage?.("begin_success", {
        tableName,
        mode: "write_diagnostic_rollback",
      });
      options.onStage?.("upsert_start", {
        tableName,
        mode: "write_diagnostic_rollback",
      });
      await client.query(
        `
        insert into ${tableName} (
          "Sku",
          "CountryCode",
          "DetailID",
          "IsActive"
        ) values (
          $1,
          $2,
          $3,
          $4
        )
        on conflict ("Sku", "CountryCode")
        do update set
          "DetailID" = excluded."DetailID",
          "IsActive" = excluded."IsActive"
        `,
        [payload.sku, payload.countryCode, payload.detailId, payload.isActive],
      );
      options.onStage?.("upsert_success", {
        tableName,
        mode: "write_diagnostic_rollback",
      });
      options.onStage?.("rollback_start", {
        tableName,
        mode: "write_diagnostic_rollback",
      });
      await client.query("rollback");
      options.onStage?.("rollback_success", {
        tableName,
        mode: "write_diagnostic_rollback",
      });
      return {
        rolledBack: true,
        tableName,
        durationMs: Math.max(0, Date.now() - startedAt),
      };
    } catch (error) {
      options.onStage?.("rollback_start", {
        tableName,
        mode: "write_diagnostic_rollback",
        from: "catch",
      });
      await client.query("rollback").catch(() => undefined);
      options.onStage?.("rollback_success", {
        tableName,
        mode: "write_diagnostic_rollback",
        from: "catch",
      });
      throw normalizeExternalPgError(error, { stage: "upsert_execute" });
    }
  }, options);
}
