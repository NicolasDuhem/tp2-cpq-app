import { NextResponse } from 'next/server';
import { runExternalPgDiagnostics } from '@/lib/external-pg/diagnostics';

export const runtime = 'nodejs';

function statusFromFailureType(failureType: string | null): number {
  if (!failureType) return 200;
  if (failureType === 'missing_env') return 400;
  if (failureType === 'source_data_mapping' || failureType === 'missing_unique_index') return 422;
  if (failureType === 'auth_failure') return 401;
  if (failureType === 'network_unreachable' || failureType === 'ssl_error' || failureType === 'connection_failure') return 502;
  if (failureType === 'connection_timeout') return 504;
  return 500;
}

async function runDiagnosticResponse() {
  const result = await runExternalPgDiagnostics();
  const status = result.success ? 200 : statusFromFailureType(result.final_failure_type);
  return NextResponse.json(result, { status });
}

export async function GET() {
  return runDiagnosticResponse();
}

export async function POST() {
  return runDiagnosticResponse();
}
