import { NextRequest, NextResponse } from "next/server";
import {
  buildBikeExternalSamplerPayload,
  buildQpartExternalSamplerPayload,
} from "@/lib/external-pg/cpq-sampler-result";
import {
  lookupBcIds,
  lookupLatestSamplerRuleset,
  runExternalVariantTablesWriteDiagnostic,
} from "@/lib/external-pg/variant-tables";
import { toExternalPgApiError } from "@/lib/external-pg/errors";

export const runtime = "nodejs";

type PayloadMode = "deterministic" | "bike" | "qpart";

function asPayloadMode(value: unknown): PayloadMode {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "bike") return "bike";
  if (normalized === "qpart") return "qpart";
  return "deterministic";
}

export async function POST(req: NextRequest) {
  let currentStage = "request_received";
  const startedAt = Date.now();
  const stage = (name: string, details?: Record<string, unknown>) => {
    currentStage = name;
    const elapsedMs = Math.max(0, Date.now() - startedAt);
    if (details) {
      console.info("[external-postgres-write-test]", name, {
        elapsedMs,
        ...details,
      });
      return;
    }
    console.info("[external-postgres-write-test]", name, { elapsedMs });
  };

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const mode = asPayloadMode(body.mode);

  try {
    stage("payload_build", { mode });
    const payload =
      mode === "bike"
        ? await buildBikeExternalSamplerPayload({
            ruleset: String(body.ruleset ?? ""),
            ipnCode: String(body.ipnCode ?? ""),
            countryCode: String(body.countryCode ?? ""),
          })
        : mode === "qpart"
          ? await buildQpartExternalSamplerPayload({
              partId: Number(body.partId),
              countryCode: String(body.countryCode ?? ""),
            })
          : {
              ipnCode: "__write_test__",
              countryCode: "ZZ",
              detailId: "__diagnostic__",
              active: false,
            };

    const bcIds =
      mode === "deterministic"
        ? { bcVariantId: 1778151766, bcProductId: 1778151766 }
        : await lookupBcIds(payload.ipnCode);
    const ruleset =
      mode === "deterministic"
        ? "diagnostic"
        : await lookupLatestSamplerRuleset(payload.ipnCode);

    if (bcIds.bcVariantId == null || bcIds.bcProductId == null) {
      throw new Error(
        `Write diagnostic requires bc_product_id and bc_variant_id for ${payload.ipnCode}`,
      );
    }
    if (!ruleset) {
      throw new Error(
        `Write diagnostic requires a cpq_sampler_result ruleset for ${payload.ipnCode}`,
      );
    }

    stage("client_create");
    const diagnostic = await runExternalVariantTablesWriteDiagnostic(
      {
        sku: payload.ipnCode,
        countryCode: payload.countryCode,
        detailId: payload.detailId,
        isActive: payload.active,
        bcVariantId: bcIds.bcVariantId,
        bcProductId: bcIds.bcProductId,
        forecastCtyCode: "F_BB",
        bblRuleSetItem: ruleset,
      },
      {
        onStage: (name, details) => {
          if (name === "client_create") {
            stage("client_create", details);
            return;
          }
          if (name === "client_connect_start") {
            stage("client_connect_start", details);
            return;
          }
          if (name === "client_connect_success") {
            stage("client_connect_success", details);
            return;
          }
          if (name === "begin_start") {
            stage("begin_start", details);
            return;
          }
          if (name === "begin_success") {
            stage("begin_success", details);
            return;
          }
          if (
            name === "select_start" ||
            name === "select_success" ||
            name === "insert_start" ||
            name === "insert_success" ||
            name === "update_start" ||
            name === "update_success"
          ) {
            stage(name, details);
            return;
          }
          if (name === "rollback_start") {
            stage("rollback_start", details);
            return;
          }
          if (name === "rollback_success") {
            stage("rollback_success", details);
            return;
          }
          stage(name, details);
        },
      },
    );

    stage("response_send", {
      mode,
      rolledBack: diagnostic.rolledBack,
      tableNames: diagnostic.tableNames,
    });
    return NextResponse.json({
      ok: true,
      mode,
      stage: "response_send",
      diagnostic,
      message:
        "Write diagnostic against variants and variant_eligibilities succeeded in mandatory order and transaction was rolled back.",
    });
  } catch (error) {
    stage("failed", { stage: currentStage });
    const apiError = toExternalPgApiError(error, { stage: currentStage });
    return NextResponse.json(
      {
        ok: false,
        stage: apiError.errorStage ?? currentStage,
        error: apiError.error,
        errorType: apiError.errorType,
        errorCode: apiError.errorCode,
        errorDetail: apiError.errorDetail,
        errorHint: apiError.errorHint,
      },
      { status: apiError.status },
    );
  }
}
