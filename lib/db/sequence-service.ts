import { sql } from '@/lib/db/client';

export type SequenceHealthRow = {
  table_schema: string;
  table_name: string;
  pk_column: string;
  sequence_schema: string;
  sequence_name: string;
  sequence_fq_name: string;
  sequence_last_value: number;
  sequence_is_called: boolean;
  sequence_next_value: number;
  table_max_id: number;
  expected_next_value: number;
  status: 'in_sync' | 'out_of_sync';
};

export type SequenceResyncRow = SequenceHealthRow & {
  previous_sequence_next_value: number;
  set_to_value: number;
};

const asQualifiedName = (schema: string, table: string) => `${schema}.${table}`;

const normalizeTarget = (target: string) => {
  const trimmed = String(target ?? '').trim();
  if (!trimmed) throw new Error('Target table is required.');

  const [schemaMaybe, tableMaybe] = trimmed.split('.');
  if (tableMaybe) {
    return {
      table_schema: schemaMaybe,
      table_name: tableMaybe,
      qualified_name: asQualifiedName(schemaMaybe, tableMaybe),
    };
  }

  return {
    table_schema: 'public',
    table_name: schemaMaybe,
    qualified_name: asQualifiedName('public', schemaMaybe),
  };
};

export async function listPrimaryKeySequences(): Promise<SequenceHealthRow[]> {
  const rows = (await sql`
    select *
    from app_list_pk_sequence_health()
    order by table_schema, table_name
  `) as SequenceHealthRow[];

  return rows;
}

export async function resyncPrimaryKeySequence(target: string): Promise<SequenceResyncRow> {
  const normalized = normalizeTarget(target);
  const rows = (await sql`
    select *
    from app_resync_pk_sequence(${normalized.table_schema}, ${normalized.table_name})
  `) as SequenceResyncRow[];

  const row = rows[0];
  if (!row) throw new Error(`No sequence-backed integer primary key found for ${normalized.qualified_name}.`);
  return row;
}

export async function resyncAllPrimaryKeySequences() {
  const rows = await listPrimaryKeySequences();
  const results: SequenceResyncRow[] = [];

  for (const row of rows) {
    results.push(await resyncPrimaryKeySequence(asQualifiedName(row.table_schema, row.table_name)));
  }

  return results;
}
