import { sql } from '@/lib/db/client';
import { QPartHierarchyNode } from '@/types/qpart';

const asTrimmedText = (value: unknown) => String(value ?? '').trim();
const asBool = (value: unknown, fallback = true) => (typeof value === 'boolean' ? value : fallback);

export async function listHierarchyNodes(level?: number) {
  const hasLevelFilter = Number.isInteger(level) && (level ?? 0) >= 1 && (level ?? 0) <= 7;

  if (hasLevelFilter) {
    return (await sql`
      with recursive node_path as (
        select n.id, n.parent_id, n.level, n.code, n.label_en,
               format('%s:%s', n.level, n.label_en) as path
        from qpart_hierarchy_nodes n
        where n.parent_id is null
        union all
        select c.id, c.parent_id, c.level, c.code, c.label_en,
               np.path || ' > ' || format('%s:%s', c.level, c.label_en)
        from qpart_hierarchy_nodes c
        join node_path np on np.id = c.parent_id
      )
      select n.id, n.level, n.code, n.label_en, n.parent_id, n.is_active, n.created_at, n.updated_at, np.path as parent_path
      from qpart_hierarchy_nodes n
      left join node_path np on np.id = n.id
      where n.level = ${level}
      order by n.level, coalesce(np.path, n.label_en)
    `) as QPartHierarchyNode[];
  }

  return (await sql`
    with recursive node_path as (
      select n.id, n.parent_id, n.level, n.code, n.label_en,
             format('%s:%s', n.level, n.label_en) as path
      from qpart_hierarchy_nodes n
      where n.parent_id is null
      union all
      select c.id, c.parent_id, c.level, c.code, c.label_en,
             np.path || ' > ' || format('%s:%s', c.level, c.label_en)
      from qpart_hierarchy_nodes c
      join node_path np on np.id = c.parent_id
    )
    select n.id, n.level, n.code, n.label_en, n.parent_id, n.is_active, n.created_at, n.updated_at, np.path as parent_path
    from qpart_hierarchy_nodes n
    left join node_path np on np.id = n.id
    order by n.level, coalesce(np.path, n.label_en)
  `) as QPartHierarchyNode[];
}

export async function createHierarchyNode(input: Record<string, unknown>) {
  const level = Number(input.level ?? 0);
  const code = asTrimmedText(input.code);
  const label = asTrimmedText(input.label_en);
  const parentId = input.parent_id === null || input.parent_id === '' ? null : Number(input.parent_id);
  const isActive = asBool(input.is_active, true);

  if (!Number.isInteger(level) || level < 1 || level > 7) throw new Error('level must be an integer between 1 and 7');
  if (!code) throw new Error('code is required');
  if (!label) throw new Error('label_en is required');
  if (parentId !== null && !Number.isFinite(parentId)) throw new Error('parent_id must be numeric');

  const rows = (await sql`
    insert into qpart_hierarchy_nodes (level, code, label_en, parent_id, is_active)
    values (${level}, ${code}, ${label}, ${parentId}, ${isActive})
    returning id, level, code, label_en, parent_id, is_active, created_at, updated_at
  `) as QPartHierarchyNode[];

  return rows[0];
}

export async function updateHierarchyNode(id: number, input: Record<string, unknown>) {
  const level = Number(input.level ?? 0);
  const code = asTrimmedText(input.code);
  const label = asTrimmedText(input.label_en);
  const parentId = input.parent_id === null || input.parent_id === '' ? null : Number(input.parent_id);
  const isActive = asBool(input.is_active, true);

  if (!Number.isInteger(level) || level < 1 || level > 7) throw new Error('level must be an integer between 1 and 7');
  if (!code) throw new Error('code is required');
  if (!label) throw new Error('label_en is required');
  if (parentId !== null && !Number.isFinite(parentId)) throw new Error('parent_id must be numeric');

  const rows = (await sql`
    update qpart_hierarchy_nodes
    set level = ${level},
        code = ${code},
        label_en = ${label},
        parent_id = ${parentId},
        is_active = ${isActive},
        updated_at = now()
    where id = ${id}
    returning id, level, code, label_en, parent_id, is_active, created_at, updated_at
  `) as QPartHierarchyNode[];

  return rows[0] ?? null;
}

export async function deleteHierarchyNode(id: number) {
  await sql`delete from qpart_hierarchy_nodes where id = ${id}`;
}
