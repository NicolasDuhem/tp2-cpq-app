-- Sequence drift inspection/resync helpers for manual Neon data operations.

create or replace function app_list_pk_sequence_health()
returns table (
  table_schema text,
  table_name text,
  pk_column text,
  sequence_schema text,
  sequence_name text,
  sequence_fq_name text,
  sequence_last_value bigint,
  sequence_is_called boolean,
  sequence_next_value bigint,
  table_max_id bigint,
  expected_next_value bigint,
  status text
)
language plpgsql
as $$
declare
  row record;
  max_id bigint;
  last_value bigint;
  is_called boolean;
  next_value bigint;
begin
  for row in
    select
      n.nspname as table_schema,
      c.relname as table_name,
      a.attname as pk_column,
      split_part(pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname), '.', 1) as sequence_schema,
      split_part(pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname), '.', 2) as sequence_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_index i on i.indrelid = c.oid and i.indisprimary
    join pg_attribute a on a.attrelid = c.oid and a.attnum = i.indkey[0]
    join pg_type t on t.oid = a.atttypid
    where c.relkind = 'r'
      and n.nspname = 'public'
      and i.indnatts = 1
      and t.typname in ('int2', 'int4', 'int8')
      and pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) is not null
  loop
    execute format('select coalesce(max(%I), 0)::bigint from %I.%I', row.pk_column, row.table_schema, row.table_name)
      into max_id;

    execute format('select last_value::bigint, is_called from %I.%I', row.sequence_schema, row.sequence_name)
      into last_value, is_called;

    next_value := case when is_called then last_value + 1 else last_value end;

    return query
    select
      row.table_schema::text,
      row.table_name::text,
      row.pk_column::text,
      row.sequence_schema::text,
      row.sequence_name::text,
      format('%I.%I', row.sequence_schema, row.sequence_name)::text,
      last_value,
      is_called,
      next_value,
      max_id,
      greatest(max_id + 1, 1),
      case when next_value <= max_id then 'out_of_sync' else 'in_sync' end;
  end loop;
end;
$$;

create or replace function app_resync_pk_sequence(target_schema text, target_table text)
returns table (
  table_schema text,
  table_name text,
  pk_column text,
  sequence_schema text,
  sequence_name text,
  sequence_fq_name text,
  previous_sequence_next_value bigint,
  set_to_value bigint,
  sequence_last_value bigint,
  sequence_is_called boolean,
  sequence_next_value bigint,
  table_max_id bigint,
  expected_next_value bigint,
  status text
)
language plpgsql
as $$
declare
  pk_column_name text;
  seq_regclass text;
  sequence_schema_name text;
  sequence_name_value text;
  max_id bigint;
  applied_value bigint;
  last_value bigint;
  is_called boolean;
  previous_next bigint;
  next_value bigint;
begin
  select
    a.attname,
    pg_get_serial_sequence(format('%I.%I', target_schema, target_table), a.attname)
  into pk_column_name, seq_regclass
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_index i on i.indrelid = c.oid and i.indisprimary
  join pg_attribute a on a.attrelid = c.oid and a.attnum = i.indkey[0]
  join pg_type t on t.oid = a.atttypid
  where c.relkind = 'r'
    and n.nspname = target_schema
    and c.relname = target_table
    and i.indnatts = 1
    and t.typname in ('int2', 'int4', 'int8')
  limit 1;

  if pk_column_name is null or seq_regclass is null then
    raise exception 'No sequence-backed integer primary key found for %.%', target_schema, target_table;
  end if;

  sequence_schema_name := split_part(seq_regclass, '.', 1);
  sequence_name_value := split_part(seq_regclass, '.', 2);

  execute format('select coalesce(max(%I), 0)::bigint from %I.%I', pk_column_name, target_schema, target_table)
    into max_id;

  execute format('select last_value::bigint, is_called from %I.%I', sequence_schema_name, sequence_name_value)
    into last_value, is_called;
  previous_next := case when is_called then last_value + 1 else last_value end;

  select setval(
    seq_regclass,
    greatest(max_id, 1),
    max_id > 0
  ) into applied_value;

  execute format('select last_value::bigint, is_called from %I.%I', sequence_schema_name, sequence_name_value)
    into last_value, is_called;
  next_value := case when is_called then last_value + 1 else last_value end;

  return query
  select
    target_schema,
    target_table,
    pk_column_name,
    sequence_schema_name,
    sequence_name_value,
    format('%I.%I', sequence_schema_name, sequence_name_value),
    previous_next,
    applied_value,
    last_value,
    is_called,
    next_value,
    max_id,
    greatest(max_id + 1, 1),
    case when next_value <= max_id then 'out_of_sync' else 'in_sync' end;
end;
$$;
