import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { buildQpartExternalSamplerPayload } from "@/lib/external-pg/cpq-sampler-result";
import { syncExternalVariantTablesForPayload } from "@/lib/external-pg/variant-tables";
import { toExternalPgApiError } from "@/lib/external-pg/errors";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let currentStage = "request_received";
  const stageStartedAt = Date.now();
  const stage = (name: string, details?: Record<string, unknown>) => {
    currentStage = name;
    const elapsedMs = Math.max(0, Date.now() - stageStartedAt);
    if (details) {
      console.info("[qpart-allocation-push]", name, { elapsedMs, ...details });
      return;
    }
    console.info("[qpart-allocation-push]", name, { elapsedMs });
  };

  stage("request_received");
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    stage("payload_build");
    const payload = await buildQpartExternalSamplerPayload(
      {
        partId: Number(body.partId),
        countryCode: String(body.countryCode ?? ""),
      },
      { onStage: (name, details) => stage(name, details) },
    );
    stage("payload_build", { ok: true });

    stage("external_variant_tables_sync_start", {
      sku: payload.ipnCode,
      countryCode: payload.countryCode,
    });
    const result = await syncExternalVariantTablesForPayload(
      {
        sku: payload.ipnCode,
        countryCode: payload.countryCode,
        detailId: "Qpart",
        isActive: payload.active,
        forecastCtyCodeOverride: "Qpart",
        bblRuleSetItemOverride: "Qpart",
      },
      { onStage: (name, details) => stage(`external_${name}`, details) },
    );

    revalidatePath("/sales/qpart-allocation");
    stage("response_send", {
      ok: result.ok,
      skipped: result.skipped,
      eligibilityAction: result.eligibilityResult.action,
      variantAction: result.variantResult.action,
    });

    return NextResponse.json({ result });
  } catch (error) {
    stage("failed", { stage: currentStage });
    const apiError = toExternalPgApiError(error, { stage: currentStage });
    console.error("[qpart-allocation-push] error", {
      stage: currentStage,
      errorType: apiError.errorType,
      errorCode: apiError.errorCode,
      errorDetail: apiError.errorDetail,
      errorHint: apiError.errorHint,
      errorStage: apiError.errorStage,
      message: apiError.error,
    });
    return NextResponse.json(
      {
        error: apiError.error,
        errorType: apiError.errorType,
        errorCode: apiError.errorCode,
        errorDetail: apiError.errorDetail,
        errorHint: apiError.errorHint,
        stage: apiError.errorStage ?? currentStage,
      },
      { status: apiError.status },
    );
  }
}
