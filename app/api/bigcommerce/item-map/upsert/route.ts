import { NextRequest, NextResponse } from "next/server";
import {
  upsertBigCommerceItemMap,
  type BCItemType,
  type ItemMapUpsertedRow,
} from "@/lib/bigcommerce/item-map";
import {
  lookupLatestSamplerRuleset,
  upsertExternalVariant,
} from "@/lib/external-pg/variant-tables";

function parseItemType(value: unknown): BCItemType | null {
  const itemType = String(value ?? "")
    .trim()
    .toUpperCase();
  if (
    itemType === "BIKE" ||
    itemType === "QPART" ||
    itemType === "PNA" ||
    itemType === "UNKNOWN"
  )
    return itemType;
  return null;
}

type ExternalVariantUpdateWarning = {
  sku: string;
  error: string;
};

function shouldPushExternalVariant(row: ItemMapUpsertedRow): boolean {
  return row.bcVariantId != null || row.bcProductId != null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unknown external variants update error";
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    itemType?: unknown;
    sourcePage?: unknown;
    items?: unknown;
  };

  const itemType = parseItemType(body.itemType);
  if (!itemType)
    return NextResponse.json(
      { error: "itemType is required" },
      { status: 400 },
    );
  if (
    !body.items ||
    typeof body.items !== "object" ||
    Array.isArray(body.items)
  ) {
    return NextResponse.json(
      { error: "items must be an object map keyed by SKU" },
      { status: 400 },
    );
  }

  const result = await upsertBigCommerceItemMap({
    itemType,
    sourcePage: String(body.sourcePage ?? "").trim(),
    items: body.items as Record<string, Record<string, unknown>>,
  });

  const externalVariantCandidates = result.rows.filter(
    shouldPushExternalVariant,
  );
  const externalVariantSettled = await Promise.allSettled(
    externalVariantCandidates.map(async (row) => {
      const ruleset =
        (await lookupLatestSamplerRuleset(row.skuCode)) ?? "Unknown";
      return upsertExternalVariant({
        sku: row.skuCode,
        bcVariantId: row.bcVariantId,
        bcProductId: row.bcProductId,
        forecastCtyCode: null,
        bblRuleSetItem: ruleset,
      });
    }),
  );

  const externalVariantWarnings: ExternalVariantUpdateWarning[] = [];
  externalVariantSettled.forEach((settled, index) => {
    if (settled.status === "rejected") {
      const sku = externalVariantCandidates[index]?.skuCode ?? "unknown";
      const warning = { sku, error: errorMessage(settled.reason) };
      externalVariantWarnings.push(warning);
      console.warn(
        "[bigcommerce-item-map-upsert] external variants update failed",
        warning,
      );
    }
  });

  return NextResponse.json({
    ok: true,
    upserted: result.upserted,
    externalVariantUpdates: {
      attempted: externalVariantCandidates.length,
      succeeded: externalVariantSettled.filter(
        (settled) => settled.status === "fulfilled",
      ).length,
      failed: externalVariantWarnings.length,
      warnings: externalVariantWarnings,
    },
  });
}
