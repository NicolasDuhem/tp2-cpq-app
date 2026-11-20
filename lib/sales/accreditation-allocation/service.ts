import 'server-only';

import { sql, sqlTransaction } from '@/lib/db/client';
import { listCountryMappings } from '@/lib/cpq/setup/service';
import { buildTerritoryRegions, type TerritoryRegion } from '@/lib/sales/allocation-territory';
import {
  fetchAccreditationCategoryTree,
  getConfiguredAccreditationChannelId,
  resolveAccreditationChannelTree,
} from '@/lib/bigcommerce/categories';
import {
  deleteExternalAccreditationLevel,
  readExternalAccreditationStatus,
  replaceExternalAccreditationCountries,
  type ExternalAccreditationRow,
} from '@/lib/external-pg/accreditation-eligibility';
import {
  buildCategoryIndex,
  isEffectivelyActive,
  normalizeLevelCode,
  type AccreditationCategory,
} from '@/lib/sales/accreditation-allocation/tree';

/**
 * Accreditation allocation service.
 *
 * Neon is the master copy:
 *   accreditation_levels, accreditation_bc_categories,
 *   accreditation_category_eligibility, accreditation_allocation_audit_log.
 * External PostgreSQL receives a per-country snapshot of the effective state
 * (see lib/external-pg/accreditation-eligibility.ts).
 *
 * Fully isolated from bike/QPart allocation: no shared table is written.
 */

export const ACCREDITATION_PAGE_PATH = '/sales/accreditation-allocation';
const MAX_CELLS_PER_MUTATION = 60_000;

export type AccreditationActor = { userId?: string | null; email?: string | null; displayName?: string | null } | null;

export type AccreditationLevel = {
  id: number;
  code: string;
  label: string;
  displayOrder: number;
  isActive: boolean;
};

export type AccreditationChannelInfo = {
  channelId: number | null;
  treeId: number | null;
  treeName: string | null;
  lastSyncedAt: string | null;
  /** Where the channel id came from. */
  source: 'env' | 'last_sync' | 'none';
};

export type AccreditationAllocationPageData = {
  /** Set when the Neon migration has not been applied yet. */
  setupError: string | null;
  channel: AccreditationChannelInfo;
  /** Active levels, in display order: the matrix columns. */
  levels: AccreditationLevel[];
  /** All levels including removed ones, for the Manage levels panel. */
  allLevels: AccreditationLevel[];
  categories: AccreditationCategory[];
  countryCodes: string[];
  territoryRegions: TerritoryRegion[];
  /** country -> levelId -> active category ids (missing = inactive). */
  activeCells: Record<string, Record<string, number[]>>;
};

export type ExternalSyncCountryState = { countryCode: string; state: 'pushed' | 'error'; message: string; rowCount: number };

export type ExternalSyncSummary = {
  attempted: number;
  pushed: number;
  errors: number;
  countries: ExternalSyncCountryState[];
};

const asTrim = (value: unknown) => String(value ?? '').trim();
const asNumber = (value: unknown) => Number(value);
const asBool = (value: unknown) => value === true || value === 't' || value === 'true' || value === 1;

export function isMissingAccreditationTablesError(error: unknown): boolean {
  const err = error as { code?: string; message?: string } | null;
  if (err?.code === '42P01') return true;
  const message = String(err?.message ?? '');
  return /relation "?accreditation_[a-z_]+"? does not exist/i.test(message);
}

const SETUP_ERROR_MESSAGE =
  'Accreditation tables are missing in Neon. Run sql/migrations/2026-11-20_accreditation_allocation.sql, then reload this page.';

// --- reads -------------------------------------------------------------------

function mapLevel(row: Record<string, unknown>): AccreditationLevel {
  return {
    id: asNumber(row.id),
    code: asTrim(row.code),
    label: asTrim(row.label),
    displayOrder: asNumber(row.display_order) || 0,
    isActive: asBool(row.is_active),
  };
}

export async function listAccreditationLevels(includeInactive = true): Promise<AccreditationLevel[]> {
  const rows = (await sql`
    select id, code, label, display_order, is_active
    from accreditation_levels
    where (${includeInactive}::boolean = true or is_active = true)
    order by display_order, label, id
  `) as Record<string, unknown>[];
  return rows.map(mapLevel);
}

export async function resolveAccreditationChannel(): Promise<AccreditationChannelInfo> {
  const configured = getConfiguredAccreditationChannelId();
  if (configured) {
    const rows = (await sql`
      select tree_id, tree_name, max(synced_at) as last_synced_at
      from accreditation_bc_categories
      where channel_id = ${configured}
      group by tree_id, tree_name
      order by max(synced_at) desc
      limit 1
    `) as Record<string, unknown>[];
    const row = rows[0];
    return {
      channelId: configured,
      treeId: row ? asNumber(row.tree_id) : null,
      treeName: row ? asTrim(row.tree_name) || null : null,
      lastSyncedAt: row?.last_synced_at ? new Date(String(row.last_synced_at)).toISOString() : null,
      source: 'env',
    };
  }

  const rows = (await sql`
    select channel_id, tree_id, tree_name, max(synced_at) as last_synced_at
    from accreditation_bc_categories
    group by channel_id, tree_id, tree_name
    order by max(synced_at) desc
    limit 1
  `) as Record<string, unknown>[];
  const row = rows[0];
  if (!row) return { channelId: null, treeId: null, treeName: null, lastSyncedAt: null, source: 'none' };
  return {
    channelId: asNumber(row.channel_id),
    treeId: asNumber(row.tree_id),
    treeName: asTrim(row.tree_name) || null,
    lastSyncedAt: row.last_synced_at ? new Date(String(row.last_synced_at)).toISOString() : null,
    source: 'last_sync',
  };
}

export async function listAccreditationCategories(channelId: number): Promise<AccreditationCategory[]> {
  const rows = (await sql`
    select category_id, parent_id, name, depth, sort_index, is_visible
    from accreditation_bc_categories
    where channel_id = ${channelId} and is_deleted = false
    order by sort_index, category_id
  `) as Record<string, unknown>[];
  return rows.map((row) => ({
    categoryId: asNumber(row.category_id),
    parentId: asNumber(row.parent_id) || 0,
    name: asTrim(row.name),
    depth: asNumber(row.depth) || 1,
    sortIndex: asNumber(row.sort_index) || 0,
    isVisible: asBool(row.is_visible),
  }));
}

async function listActiveCountryCodes(): Promise<{ codes: string[]; mappings: Awaited<ReturnType<typeof listCountryMappings>> }> {
  const mappings = await listCountryMappings(true);
  const codes = [...new Set(mappings.map((row) => asTrim(row.country_code).toUpperCase()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
  return { codes, mappings };
}

async function loadActiveCells(channelId: number, countryCodes: string[] | null) {
  const hasFilter = Array.isArray(countryCodes);
  const rows = (await sql`
    select country_code, accreditation_level_id, category_id
    from accreditation_category_eligibility
    where channel_id = ${channelId}
      and is_active = true
      and (${hasFilter}::boolean = false or country_code = any(${countryCodes ?? []}::text[]))
  `) as Record<string, unknown>[];
  const out: Record<string, Record<string, number[]>> = {};
  for (const row of rows) {
    const country = asTrim(row.country_code).toUpperCase();
    const levelId = String(asNumber(row.accreditation_level_id));
    out[country] ??= {};
    (out[country][levelId] ??= []).push(asNumber(row.category_id));
  }
  return out;
}

export async function getAccreditationAllocationPageData(): Promise<AccreditationAllocationPageData> {
  const { codes, mappings } = await listActiveCountryCodes();
  const territoryRegions = buildTerritoryRegions(mappings, codes);
  const empty: AccreditationAllocationPageData = {
    setupError: null,
    channel: { channelId: null, treeId: null, treeName: null, lastSyncedAt: null, source: 'none' },
    levels: [],
    allLevels: [],
    categories: [],
    countryCodes: codes,
    territoryRegions,
    activeCells: {},
  };

  try {
    const [allLevels, channel] = await Promise.all([listAccreditationLevels(true), resolveAccreditationChannel()]);
    const levels = allLevels.filter((level) => level.isActive);
    if (!channel.channelId) return { ...empty, allLevels, levels, channel };
    const [categories, activeCells] = await Promise.all([
      listAccreditationCategories(channel.channelId),
      loadActiveCells(channel.channelId, null),
    ]);
    return { ...empty, allLevels, levels, channel, categories, activeCells };
  } catch (error) {
    if (isMissingAccreditationTablesError(error)) return { ...empty, setupError: SETUP_ERROR_MESSAGE };
    throw error;
  }
}

// --- audit -------------------------------------------------------------------

type AuditRow = {
  action_type: string;
  channel_id: number | null;
  country_code: string | null;
  accreditation_level_code: string | null;
  category_id: number | null;
  status_before: boolean | null;
  status_after: boolean | null;
  metadata: Record<string, unknown>;
};

function buildAuditInsert(actor: AccreditationActor, rows: AuditRow[]) {
  const payload = rows.map((row) => ({ ...row, metadata: JSON.stringify(row.metadata ?? {}) }));
  return sql`
    insert into accreditation_allocation_audit_log (
      actor_user_id, actor_email, actor_display_name, action_type, channel_id, country_code,
      accreditation_level_code, category_id, status_before, status_after, metadata
    )
    select ${asTrim(actor?.userId) || null}, ${asTrim(actor?.email) || null}, ${asTrim(actor?.displayName) || null},
      p.action_type, p.channel_id, p.country_code, p.accreditation_level_code, p.category_id,
      p.status_before, p.status_after, coalesce(p.metadata, '{}')::jsonb
    from jsonb_to_recordset(${JSON.stringify(payload)}::jsonb) as p(
      action_type text, channel_id bigint, country_code text, accreditation_level_code text,
      category_id bigint, status_before boolean, status_after boolean, metadata text
    )
  `;
}

async function insertAudit(actor: AccreditationActor, rows: AuditRow[]) {
  if (!rows.length) return;
  await buildAuditInsert(actor, rows);
}

// --- validation helpers ------------------------------------------------------

async function requireChannelId(): Promise<number> {
  const channel = await resolveAccreditationChannel();
  if (!channel.channelId) throw new Error('No BigCommerce categories yet. Click "Sync categories from BigCommerce" first.');
  return channel.channelId;
}

async function validateCountryCodes(input: unknown[]): Promise<string[]> {
  const requested = [...new Set(input.map((value) => asTrim(value).toUpperCase()).filter(Boolean))];
  if (!requested.length) throw new Error('Select at least one country.');
  const { codes } = await listActiveCountryCodes();
  const allowed = new Set(codes);
  const invalid = requested.filter((code) => !allowed.has(code));
  if (invalid.length) throw new Error(`Unknown or inactive country code(s): ${invalid.join(', ')}`);
  return requested;
}

// --- cell mutations -------------------------------------------------------------

type DesiredCell = { countryCode: string; levelId: number; categoryId: number; active: boolean };

/**
 * Write only the cells whose state actually changes, plus one audit row per change,
 * in a single Neon transaction. Missing rows count as inactive, so "set inactive" on a
 * cell with no row is a no-op.
 */
async function applyDesiredCells(input: {
  channelId: number;
  desired: DesiredCell[];
  levelsById: Map<number, AccreditationLevel>;
  categoriesById: Map<number, AccreditationCategory>;
  actor: AccreditationActor;
  actionType: string;
  metadata?: Record<string, unknown>;
}) {
  const countries = [...new Set(input.desired.map((cell) => cell.countryCode))];
  const existingRows = (await sql`
    select country_code, accreditation_level_id, category_id, is_active
    from accreditation_category_eligibility
    where channel_id = ${input.channelId} and country_code = any(${countries}::text[])
  `) as Record<string, unknown>[];
  const existing = new Map<string, boolean>();
  for (const row of existingRows) {
    existing.set(`${asTrim(row.country_code).toUpperCase()}|${asNumber(row.accreditation_level_id)}|${asNumber(row.category_id)}`, asBool(row.is_active));
  }

  const changed = input.desired.filter(
    (cell) => (existing.get(`${cell.countryCode}|${cell.levelId}|${cell.categoryId}`) ?? false) !== cell.active,
  );
  if (!changed.length) return { changedCount: 0, changedCountries: [] as string[] };

  const payload = changed.map((cell) => ({
    channel_id: input.channelId,
    country_code: cell.countryCode,
    level_id: cell.levelId,
    category_id: cell.categoryId,
    is_active: cell.active,
  }));
  const auditRows: AuditRow[] = changed.map((cell) => ({
    action_type: input.actionType,
    channel_id: input.channelId,
    country_code: cell.countryCode,
    accreditation_level_code: input.levelsById.get(cell.levelId)?.code ?? null,
    category_id: cell.categoryId,
    status_before: existing.get(`${cell.countryCode}|${cell.levelId}|${cell.categoryId}`) ?? false,
    status_after: cell.active,
    metadata: { categoryName: input.categoriesById.get(cell.categoryId)?.name ?? null, ...(input.metadata ?? {}) },
  }));

  await sqlTransaction([
    sql`
      insert into accreditation_category_eligibility (
        channel_id, country_code, accreditation_level_id, category_id, is_active,
        updated_by_user_id, updated_by_email, updated_at
      )
      select p.channel_id, p.country_code, p.level_id, p.category_id, p.is_active,
        ${asTrim(input.actor?.userId) || null}, ${asTrim(input.actor?.email) || null}, now()
      from jsonb_to_recordset(${JSON.stringify(payload)}::jsonb) as p(
        channel_id bigint, country_code text, level_id bigint, category_id bigint, is_active boolean
      )
      on conflict (channel_id, country_code, accreditation_level_id, category_id) do update
      set is_active = excluded.is_active,
          updated_by_user_id = excluded.updated_by_user_id,
          updated_by_email = excluded.updated_by_email,
          updated_at = now()
    `,
    buildAuditInsert(input.actor, auditRows),
  ]);

  return { changedCount: changed.length, changedCountries: [...new Set(changed.map((cell) => cell.countryCode))] };
}

async function loadMutationContext() {
  const channelId = await requireChannelId();
  const [levels, categories] = await Promise.all([listAccreditationLevels(false), listAccreditationCategories(channelId)]);
  return {
    channelId,
    levels,
    categories,
    levelsById: new Map(levels.map((level) => [level.id, level])),
    categoriesById: new Map(categories.map((category) => [category.categoryId, category])),
  };
}

/**
 * Set Active/Inactive for every (country x level x category) combination given.
 * Used by the single-cell toggle (one country/level, the category plus optional
 * sub-categories) and by bulk actions.
 */
export async function setAccreditationEligibility(input: {
  countryCodes: unknown[];
  levelIds: unknown[];
  categoryIds: unknown[];
  targetStatus: 'active' | 'not_active';
  actor: AccreditationActor;
  actionType: 'toggle' | 'bulk_update';
}) {
  const context = await loadMutationContext();
  const countryCodes = await validateCountryCodes(input.countryCodes);

  const levelIds = [...new Set(input.levelIds.map(asNumber).filter((id) => Number.isFinite(id) && id > 0))];
  if (!levelIds.length) throw new Error('Select at least one accreditation level.');
  const unknownLevels = levelIds.filter((id) => !context.levelsById.has(id));
  if (unknownLevels.length) throw new Error(`Unknown or removed accreditation level id(s): ${unknownLevels.join(', ')}`);

  const categoryIds = [...new Set(input.categoryIds.map(asNumber).filter((id) => Number.isFinite(id) && id > 0))];
  if (!categoryIds.length) throw new Error('Select at least one category.');
  const unknownCategories = categoryIds.filter((id) => !context.categoriesById.has(id));
  if (unknownCategories.length) {
    throw new Error(`Category id(s) not in the synced channel tree: ${unknownCategories.slice(0, 10).join(', ')}. Re-sync categories.`);
  }

  const cellCount = countryCodes.length * levelIds.length * categoryIds.length;
  if (cellCount > MAX_CELLS_PER_MUTATION) {
    throw new Error(`Too many cells in one action (${cellCount}). Narrow the countries, levels or categories (max ${MAX_CELLS_PER_MUTATION}).`);
  }

  const active = input.targetStatus === 'active';
  const desired: DesiredCell[] = [];
  for (const countryCode of countryCodes)
    for (const levelId of levelIds) for (const categoryId of categoryIds) desired.push({ countryCode, levelId, categoryId, active });

  const result = await applyDesiredCells({
    channelId: context.channelId,
    desired,
    levelsById: context.levelsById,
    categoriesById: context.categoriesById,
    actor: input.actor,
    actionType: input.actionType,
  });

  const externalSync = result.changedCount ? await pushAccreditationCountriesSafe(result.changedCountries) : null;
  return {
    targetStatus: input.targetStatus,
    cellCount,
    changedCount: result.changedCount,
    countryCount: countryCodes.length,
    levelCount: levelIds.length,
    categoryCount: categoryIds.length,
    externalSync,
  };
}

/**
 * Copy the full matrix of one country onto other countries: for every active level
 * and every current category, the target gets exactly the source's state (overwrite).
 */
export async function copyAccreditationCountry(input: { sourceCountryCode: unknown; targetCountryCodes: unknown[]; actor: AccreditationActor }) {
  const context = await loadMutationContext();
  const [sourceCountryCode] = await validateCountryCodes([input.sourceCountryCode]);
  const targets = (await validateCountryCodes(input.targetCountryCodes)).filter((code) => code !== sourceCountryCode);
  if (!targets.length) throw new Error('Select at least one target country different from the source.');
  if (!context.levels.length) throw new Error('No active accreditation levels.');
  if (!context.categories.length) throw new Error('No categories synced for this channel.');

  const sourceCells = await loadActiveCells(context.channelId, [sourceCountryCode]);
  const sourceByLevel = sourceCells[sourceCountryCode] ?? {};

  const desired: DesiredCell[] = [];
  for (const countryCode of targets) {
    for (const level of context.levels) {
      const activeIds = new Set(sourceByLevel[String(level.id)] ?? []);
      for (const category of context.categories) {
        desired.push({ countryCode, levelId: level.id, categoryId: category.categoryId, active: activeIds.has(category.categoryId) });
      }
    }
  }
  if (desired.length > MAX_CELLS_PER_MUTATION) {
    throw new Error(`Too many cells in one copy (${desired.length}). Copy to fewer countries at a time.`);
  }

  const result = await applyDesiredCells({
    channelId: context.channelId,
    desired,
    levelsById: context.levelsById,
    categoriesById: context.categoriesById,
    actor: input.actor,
    actionType: 'copy_country',
    metadata: { sourceCountryCode },
  });

  // Push every target (even unchanged ones) so the external copy matches the source too.
  const externalSync = await pushAccreditationCountriesSafe(targets);
  return { sourceCountryCode, targetCountryCodes: targets, changedCount: result.changedCount, externalSync };
}

// --- external push / status ---------------------------------------------------

async function buildExternalRows(channelId: number, countryCodes: string[]) {
  const [levels, categories, activeCells] = await Promise.all([
    listAccreditationLevels(false),
    listAccreditationCategories(channelId),
    loadActiveCells(channelId, countryCodes),
  ]);
  const index = buildCategoryIndex(categories);
  const rows: ExternalAccreditationRow[] = [];
  for (const countryCode of countryCodes) {
    for (const level of levels) {
      const activeIds = new Set(activeCells[countryCode]?.[String(level.id)] ?? []);
      for (const categoryId of index.orderedIds) {
        const category = index.byId.get(categoryId)!;
        rows.push({
          countryCode,
          levelCode: level.code,
          categoryId,
          parentCategoryId: category.parentId,
          categoryName: category.name,
          categoryDepth: category.depth,
          isActive: isEffectivelyActive(index, activeIds, categoryId),
        });
      }
    }
  }
  return rows;
}

export async function pushAccreditationCountries(countryCodesInput: unknown[]): Promise<ExternalSyncSummary> {
  const channelId = await requireChannelId();
  const countryCodes = await validateCountryCodes(countryCodesInput);
  const rows = await buildExternalRows(channelId, countryCodes);
  const results = await replaceExternalAccreditationCountries(channelId, countryCodes, rows);
  const countries: ExternalSyncCountryState[] = results.map((result) => ({
    countryCode: result.countryCode,
    state: result.ok ? 'pushed' : 'error',
    message: result.ok ? `${result.rowCount} row(s) pushed` : result.error ?? 'External push failed',
    rowCount: result.rowCount,
  }));
  return {
    attempted: countries.length,
    pushed: countries.filter((country) => country.state === 'pushed').length,
    errors: countries.filter((country) => country.state === 'error').length,
    countries,
  };
}

/**
 * Integrated push after a Neon change. External failures never roll back the Neon
 * change: they are reported per country as `error` so the operator can retry.
 */
async function pushAccreditationCountriesSafe(countryCodes: string[]): Promise<ExternalSyncSummary> {
  try {
    return await pushAccreditationCountries(countryCodes);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'External push failed';
    return {
      attempted: countryCodes.length,
      pushed: 0,
      errors: countryCodes.length,
      countries: countryCodes.map((countryCode) => ({ countryCode, state: 'error', message, rowCount: 0 })),
    };
  }
}

export async function getAccreditationExternalStatus(countryCodesInput: unknown[]) {
  const channelId = await requireChannelId();
  const countryCodes = await validateCountryCodes(countryCodesInput);
  const items = await readExternalAccreditationStatus(channelId, countryCodes);
  return { channelId, countryCodes, rowCount: items.length, items };
}

// --- BigCommerce category sync ----------------------------------------------------

export async function syncAccreditationCategoriesFromBigCommerce(actor: AccreditationActor) {
  const tree = await resolveAccreditationChannelTree();
  const categories = await fetchAccreditationCategoryTree(tree.treeId);
  // Safety: never mark the whole tree deleted because of an empty/odd response.
  if (!categories.length) throw new Error(`BigCommerce returned no categories for tree ${tree.treeId}. Nothing was changed.`);

  const existingRows = (await sql`
    select category_id, name, parent_id, is_deleted
    from accreditation_bc_categories
    where channel_id = ${tree.channelId}
  `) as Record<string, unknown>[];
  const existingLive = new Map<number, { name: string; parentId: number }>();
  for (const row of existingRows) {
    if (!asBool(row.is_deleted)) existingLive.set(asNumber(row.category_id), { name: asTrim(row.name), parentId: asNumber(row.parent_id) });
  }
  const incomingIds = categories.map((category) => category.categoryId);
  const incomingSet = new Set(incomingIds);
  const added = categories.filter((category) => !existingLive.has(category.categoryId)).length;
  const removed = [...existingLive.keys()].filter((id) => !incomingSet.has(id)).length;
  const changed = categories.filter((category) => {
    const previous = existingLive.get(category.categoryId);
    return previous && (previous.name !== category.name || previous.parentId !== category.parentId);
  }).length;

  const payload = categories.map((category) => ({
    category_id: category.categoryId,
    parent_id: category.parentId,
    name: category.name,
    depth: category.depth,
    sort_index: category.sortIndex,
    is_visible: category.isVisible,
  }));

  await sqlTransaction([
    sql`
      insert into accreditation_bc_categories (
        channel_id, tree_id, tree_name, category_id, parent_id, name, depth, sort_index, is_visible, is_deleted, synced_at, updated_at
      )
      select ${tree.channelId}, ${tree.treeId}, ${tree.treeName}, p.category_id, p.parent_id, p.name, p.depth, p.sort_index, p.is_visible, false, now(), now()
      from jsonb_to_recordset(${JSON.stringify(payload)}::jsonb) as p(
        category_id bigint, parent_id bigint, name text, depth integer, sort_index integer, is_visible boolean
      )
      on conflict (channel_id, category_id) do update
      set tree_id = excluded.tree_id,
          tree_name = excluded.tree_name,
          parent_id = excluded.parent_id,
          name = excluded.name,
          depth = excluded.depth,
          sort_index = excluded.sort_index,
          is_visible = excluded.is_visible,
          is_deleted = false,
          synced_at = now(),
          updated_at = now()
    `,
    sql`
      update accreditation_bc_categories
      set is_deleted = true, updated_at = now()
      where channel_id = ${tree.channelId}
        and is_deleted = false
        and not (category_id = any(${incomingIds}::bigint[]))
    `,
    buildAuditInsert(actor, [
      {
        action_type: 'category_sync',
        channel_id: tree.channelId,
        country_code: null,
        accreditation_level_code: null,
        category_id: null,
        status_before: null,
        status_after: null,
        metadata: { treeId: tree.treeId, treeName: tree.treeName, total: categories.length, added, removed, changed },
      },
    ]),
  ]);

  const maxDepth = categories.reduce((max, category) => Math.max(max, category.depth), 0);
  return { ...tree, total: categories.length, added, removed, changed, maxDepth };
}

// --- level management -------------------------------------------------------------

export async function createAccreditationLevel(input: { label: unknown; code?: unknown; actor: AccreditationActor }) {
  const label = asTrim(input.label);
  if (!label) throw new Error('Level name is required.');
  const code = normalizeLevelCode(asTrim(input.code) || label);
  if (!code) throw new Error('Level code must contain letters or numbers.');

  const existing = (await sql`select id, is_active from accreditation_levels where code = ${code} limit 1`) as Record<string, unknown>[];
  if (existing[0]) {
    throw new Error(
      asBool(existing[0].is_active)
        ? `A level with code ${code} already exists.`
        : `Level ${code} exists but was removed. Restore it from Manage levels instead.`,
    );
  }

  const rows = (await sql`
    insert into accreditation_levels (code, label, display_order, is_active)
    select ${code}, ${label}, coalesce(max(display_order), 0) + 10, true from accreditation_levels
    returning id, code, label, display_order, is_active
  `) as Record<string, unknown>[];
  const level = mapLevel(rows[0]);
  await insertAudit(input.actor, [
    { action_type: 'level_create', channel_id: null, country_code: null, accreditation_level_code: code, category_id: null, status_before: null, status_after: true, metadata: { label } },
  ]);
  return level;
}

export async function updateAccreditationLevel(input: {
  id: unknown;
  label?: unknown;
  displayOrder?: unknown;
  isActive?: unknown;
  actor: AccreditationActor;
}) {
  const id = asNumber(input.id);
  if (!Number.isFinite(id) || id <= 0) throw new Error('Level id is required.');
  const rows = (await sql`select id, code, label, display_order, is_active from accreditation_levels where id = ${id}`) as Record<string, unknown>[];
  if (!rows[0]) throw new Error('Level not found.');
  const before = mapLevel(rows[0]);

  const label = input.label === undefined ? before.label : asTrim(input.label);
  if (!label) throw new Error('Level name cannot be empty.');
  const displayOrderRaw = input.displayOrder === undefined ? before.displayOrder : Number(input.displayOrder);
  if (!Number.isFinite(displayOrderRaw)) throw new Error('Display order must be a number.');
  const displayOrder = Math.trunc(displayOrderRaw);
  const isActive = input.isActive === undefined ? before.isActive : asBool(input.isActive);

  const updated = (await sql`
    update accreditation_levels
    set label = ${label}, display_order = ${displayOrder}, is_active = ${isActive}, updated_at = now()
    where id = ${id}
    returning id, code, label, display_order, is_active
  `) as Record<string, unknown>[];
  const level = mapLevel(updated[0]);

  const actionType = before.isActive && !isActive ? 'level_remove' : !before.isActive && isActive ? 'level_restore' : 'level_update';
  await insertAudit(input.actor, [
    {
      action_type: actionType,
      channel_id: null,
      country_code: null,
      accreditation_level_code: level.code,
      category_id: null,
      status_before: before.isActive,
      status_after: isActive,
      metadata: { before: { label: before.label, displayOrder: before.displayOrder }, after: { label, displayOrder } },
    },
  ]);

  // A removed level must disappear from the external mirror; restoring it is
  // published again by the next push of each country.
  let external: { state: 'skipped' | 'deleted' | 'error'; message: string } = { state: 'skipped', message: '' };
  if (actionType === 'level_remove') {
    try {
      const channel = await resolveAccreditationChannel();
      if (channel.channelId) {
        const deleted = await deleteExternalAccreditationLevel(channel.channelId, level.code);
        external = { state: 'deleted', message: `${deleted} external row(s) removed for ${level.code}.` };
      }
    } catch (error) {
      external = { state: 'error', message: error instanceof Error ? error.message : 'External cleanup failed.' };
    }
  } else if (actionType === 'level_restore') {
    external = { state: 'skipped', message: 'Level restored. Push countries to publish it externally again.' };
  }

  return { level, actionType, external };
}

// --- export ---------------------------------------------------------------------------

export async function listAccreditationExportRows(filters: { countryCodes: string[]; levelIds: number[] }) {
  const data = await getAccreditationAllocationPageData();
  if (data.setupError) throw new Error(data.setupError);
  const index = buildCategoryIndex(data.categories);
  const countries = filters.countryCodes.length ? data.countryCodes.filter((code) => filters.countryCodes.includes(code)) : data.countryCodes;
  const levels = filters.levelIds.length ? data.levels.filter((level) => filters.levelIds.includes(level.id)) : data.levels;
  const territoryByCountry = new Map<string, { region: string; subRegion: string }>();
  for (const region of data.territoryRegions)
    for (const subRegion of region.subRegions)
      for (const code of subRegion.countries) territoryByCountry.set(code, { region: region.region, subRegion: subRegion.subRegion });

  const rows: Array<Record<string, unknown>> = [];
  for (const countryCode of countries) {
    for (const level of levels) {
      const activeIds = new Set(data.activeCells[countryCode]?.[String(level.id)] ?? []);
      for (const categoryId of index.orderedIds) {
        const category = index.byId.get(categoryId)!;
        const names: string[] = [];
        let cursor: AccreditationCategory | undefined = category;
        const guard = new Set<number>();
        while (cursor && !guard.has(cursor.categoryId)) {
          guard.add(cursor.categoryId);
          names.unshift(cursor.name);
          cursor = cursor.parentId ? index.byId.get(cursor.parentId) : undefined;
        }
        rows.push({
          channelId: data.channel.channelId,
          countryCode,
          region: territoryByCountry.get(countryCode)?.region ?? '',
          subRegion: territoryByCountry.get(countryCode)?.subRegion ?? '',
          levelCode: level.code,
          levelLabel: level.label,
          categoryId,
          parentCategoryId: category.parentId,
          depth: category.depth,
          categoryPath: names.join(' > '),
          ownActive: activeIds.has(categoryId),
          effectiveActive: isEffectivelyActive(index, activeIds, categoryId),
        });
      }
    }
  }
  return rows;
}
