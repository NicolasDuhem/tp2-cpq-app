import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { buildQpartExternalSamplerPayload } from "@/lib/external-pg/cpq-sampler-result";
import {
  lookupBcIds,
  upsertExternalVariant,
  upsertExternalVariantEligibility,
} from "@/lib/external-pg/variant-tables";
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

    stage("bc_ids_lookup_start", { sku: payload.ipnCode });
    const { bcVariantId, bcProductId } = await lookupBcIds(payload.ipnCode);
    stage("bc_ids_lookup_success", {
      sku: payload.ipnCode,
      hasBcVariantId: bcVariantId != null,
      hasBcProductId: bcProductId != null,
    });

    stage("eligibility_upsert_start");
    const eligibilityResult = await upsertExternalVariantEligibility(
      {
        sku: payload.ipnCode,
        countryCode: payload.countryCode,
        detailId: payload.detailId,
        isActive: payload.active,
      },
      {
        onStage: (name, details) => stage(`eligibility_${name}`, details),
      },
    );

    stage("variant_upsert_start");
    const variantResult = await upsertExternalVariant(
      {
        sku: payload.ipnCode,
        bcVariantId,
        bcProductId,
        forecastCtyCode: null,
        bblRuleSetItem: payload.ruleset,
      },
      {
        onStage: (name, details) => stage(`variant_${name}`, details),
      },
    );

    revalidatePath("/sales/qpart-allocation");
    stage("response_send", {
      ok: true,
      eligibilityAction: eligibilityResult.action,
      variantAction: variantResult.action,
    });

    return NextResponse.json({ eligibilityResult, variantResult });
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
