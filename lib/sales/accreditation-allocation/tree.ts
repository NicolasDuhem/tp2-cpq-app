/**
 * Pure helpers for the Accreditation allocation page.
 *
 * Dependency-free (no `@/` imports, no DB, no React) so it can be unit tested
 * directly with `node --test`, and imported by both server and client code.
 *
 * Model recap:
 * - BigCommerce categories for one channel form a tree of at most 3 levels
 *   (e.g. "Parts and accessories" > "Parts" > "Brakes").
 * - An eligibility cell is (country, accreditation level, category) -> active.
 *   A missing cell means inactive.
 * - A category is *effectively* active only when it and every ancestor are active
 *   for the same country/level. The effective state is what is pushed externally.
 */

export type AccreditationCategory = {
  categoryId: number;
  /** 0 for a top-level category. */
  parentId: number;
  name: string;
  /** 1-based depth in the channel tree. */
  depth: number;
  /** Position in BigCommerce tree order; used to keep siblings in BC order. */
  sortIndex: number;
  isVisible: boolean;
};

export type CategoryIndex = {
  byId: Map<number, AccreditationCategory>;
  childrenById: Map<number, number[]>;
  /** Top-level category ids, in tree order. */
  rootIds: number[];
  /** Every category id in depth-first tree order (parents before children). */
  orderedIds: number[];
};

export type EligibilityStatusFilter = 'active' | 'not_active';

const trimmed = (value: unknown) => String(value ?? '').trim();

function toInt(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

/**
 * Flatten the nested payload of BigCommerce `GET /v3/catalog/trees/{tree_id}/categories`
 * into rows. Accepts `id` or `category_id`, recomputes depth from nesting, and keeps
 * BigCommerce's sibling order as `sortIndex`. Nodes without a usable id are skipped
 * (with their subtree) rather than failing the whole sync.
 */
export function flattenBcCategoryTree(nodes: unknown): AccreditationCategory[] {
  const out: AccreditationCategory[] = [];
  const seen = new Set<number>();

  const visit = (list: unknown, parentId: number, depth: number) => {
    if (!Array.isArray(list)) return;
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const node = raw as Record<string, unknown>;
      const categoryId = toInt(node.id ?? node.category_id);
      if (categoryId === null || categoryId <= 0 || seen.has(categoryId)) continue;
      seen.add(categoryId);
      out.push({
        categoryId,
        parentId,
        name: trimmed(node.name) || `Category ${categoryId}`,
        depth,
        sortIndex: out.length,
        isVisible: node.is_visible === undefined ? true : node.is_visible === true,
      });
      visit(node.children, categoryId, depth + 1);
    }
  };

  visit(nodes, 0, 1);
  return out;
}

/** Build lookup maps and a stable depth-first order from flat category rows. */
export function buildCategoryIndex(categories: AccreditationCategory[]): CategoryIndex {
  const byId = new Map<number, AccreditationCategory>();
  for (const category of categories) byId.set(category.categoryId, category);

  const childrenById = new Map<number, number[]>();
  const rootIds: number[] = [];
  const sorted = [...byId.values()].sort((a, b) => a.sortIndex - b.sortIndex || a.categoryId - b.categoryId);
  for (const category of sorted) {
    // A parent that is not in the set (e.g. deleted in BC) promotes the child to a root,
    // so no category can disappear from the page.
    if (category.parentId > 0 && byId.has(category.parentId)) {
      const siblings = childrenById.get(category.parentId) ?? [];
      siblings.push(category.categoryId);
      childrenById.set(category.parentId, siblings);
    } else {
      rootIds.push(category.categoryId);
    }
  }

  const orderedIds: number[] = [];
  const guard = new Set<number>();
  const walk = (id: number) => {
    if (guard.has(id)) return;
    guard.add(id);
    orderedIds.push(id);
    for (const childId of childrenById.get(id) ?? []) walk(childId);
  };
  rootIds.forEach(walk);
  // Defensive: anything unreachable (cycles) is appended so it is still shown.
  for (const category of sorted) if (!guard.has(category.categoryId)) walk(category.categoryId);

  return { byId, childrenById, rootIds, orderedIds };
}

/** Ancestor ids of a category, nearest parent first. Cycle-safe. */
export function getAncestorIds(index: CategoryIndex, categoryId: number): number[] {
  const ancestors: number[] = [];
  const guard = new Set<number>([categoryId]);
  let current = index.byId.get(categoryId);
  while (current && current.parentId > 0 && index.byId.has(current.parentId) && !guard.has(current.parentId)) {
    ancestors.push(current.parentId);
    guard.add(current.parentId);
    current = index.byId.get(current.parentId);
  }
  return ancestors;
}

/** All descendant ids of a category in depth-first order (excluding the category itself). */
export function getDescendantIds(index: CategoryIndex, categoryId: number): number[] {
  const out: number[] = [];
  const guard = new Set<number>([categoryId]);
  const walk = (id: number) => {
    for (const childId of index.childrenById.get(id) ?? []) {
      if (guard.has(childId)) continue;
      guard.add(childId);
      out.push(childId);
      walk(childId);
    }
  };
  walk(categoryId);
  return out;
}

/** Human readable path, e.g. `Parts and accessories › Parts › Brakes`. */
export function buildCategoryPath(index: CategoryIndex, categoryId: number): string {
  const self = index.byId.get(categoryId);
  if (!self) return String(categoryId);
  const names = getAncestorIds(index, categoryId)
    .reverse()
    .map((id) => index.byId.get(id)?.name ?? String(id));
  return [...names, self.name].join(' › ');
}

/**
 * A category is effectively active only when it is active itself and every
 * ancestor is active, for the same country and level.
 */
export function isEffectivelyActive(index: CategoryIndex, activeIds: Set<number>, categoryId: number): boolean {
  if (!activeIds.has(categoryId)) return false;
  return getAncestorIds(index, categoryId).every((ancestorId) => activeIds.has(ancestorId));
}

/**
 * Ids to render for a filter: every category the predicate matches plus its
 * ancestors, so the tree structure stays readable. Returns `null` when the
 * predicate is absent (= show everything).
 */
export function selectVisibleCategoryIds(
  index: CategoryIndex,
  predicate: ((category: AccreditationCategory) => boolean) | null,
): Set<number> | null {
  if (!predicate) return null;
  const visible = new Set<number>();
  for (const id of index.orderedIds) {
    const category = index.byId.get(id);
    if (!category || !predicate(category)) continue;
    visible.add(id);
    for (const ancestorId of getAncestorIds(index, id)) visible.add(ancestorId);
  }
  return visible;
}

/** Case-insensitive name contains, or exact/prefix category id match. */
export function categoryMatchesSearch(category: AccreditationCategory, search: string): boolean {
  const needle = trimmed(search).toLowerCase();
  if (!needle) return true;
  if (category.name.toLowerCase().includes(needle)) return true;
  return String(category.categoryId).startsWith(needle);
}

/**
 * Normalise a level label into a stable code, e.g. `Gold plus` -> `GOLD_PLUS`.
 * Codes are what external systems receive, so they never change on rename.
 */
export function normalizeLevelCode(value: unknown): string {
  return trimmed(value)
    .toUpperCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

/** Stable key for one eligibility cell. */
export function eligibilityCellKey(countryCode: string, levelId: number | string, categoryId: number | string): string {
  return `${trimmed(countryCode).toUpperCase()}|${trimmed(levelId)}|${trimmed(categoryId)}`;
}

/**
 * Compact "active ids" payload -> lookup set, keyed `${country}|${levelId}`.
 * The page ships only active category ids per country/level to keep the payload small.
 */
export function buildActiveSetLookup(activeCells: Record<string, Record<string, number[]>>): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  for (const [countryCode, byLevel] of Object.entries(activeCells ?? {})) {
    for (const [levelId, categoryIds] of Object.entries(byLevel ?? {})) {
      out.set(`${countryCode.toUpperCase()}|${levelId}`, new Set((categoryIds ?? []).map(Number)));
    }
  }
  return out;
}

/** Parse a comma-separated URL list into unique trimmed values. */
export function parseCsvParam(value: unknown): string[] {
  return [...new Set(trimmed(value).split(',').map((entry) => entry.trim()).filter(Boolean))];
}

/**
 * Effective-active ids for one country/level in a single pass over the tree
 * (parents are visited before children in `orderedIds`).
 */
export function computeEffectiveActiveIds(index: CategoryIndex, activeIds: Set<number>): Set<number> {
  const effective = new Set<number>();
  for (const id of index.orderedIds) {
    if (!activeIds.has(id)) continue;
    const parentId = index.byId.get(id)?.parentId ?? 0;
    const parentInTree = parentId > 0 && index.byId.has(parentId);
    if (!parentInTree || effective.has(parentId)) effective.add(id);
  }
  return effective;
}
