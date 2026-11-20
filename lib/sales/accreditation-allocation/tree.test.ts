import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildActiveSetLookup,
  buildCategoryIndex,
  buildCategoryPath,
  categoryMatchesSearch,
  computeEffectiveActiveIds,
  eligibilityCellKey,
  flattenBcCategoryTree,
  getAncestorIds,
  getDescendantIds,
  isEffectivelyActive,
  normalizeLevelCode,
  parseCsvParam,
  selectVisibleCategoryIds,
} from './tree.ts';

/** Shape returned by BigCommerce GET /v3/catalog/trees/{tree_id}/categories (trimmed). */
const BC_TREE = [
  {
    id: 10,
    parent_id: 0,
    name: 'Bikes',
    is_visible: true,
    children: [
      { id: 11, parent_id: 10, name: 'C Line', is_visible: true, children: [] },
      { id: 12, parent_id: 10, name: 'P Line', is_visible: true },
    ],
  },
  {
    id: 20,
    parent_id: 0,
    name: 'Parts and accessories',
    is_visible: true,
    children: [
      {
        id: 21,
        parent_id: 20,
        name: 'Parts',
        children: [
          { id: 22, parent_id: 21, name: 'Brakes', is_visible: false },
          { id: 23, parent_id: 21, name: 'Cables' },
        ],
      },
    ],
  },
  { name: 'no id, skipped', children: [{ id: 99, name: 'orphan of skipped node' }] },
];

describe('flattenBcCategoryTree', () => {
  it('flattens nested nodes in tree order with computed depth and parent', () => {
    const flat = flattenBcCategoryTree(BC_TREE);
    assert.deepEqual(
      flat.map((c) => [c.categoryId, c.parentId, c.depth, c.name]),
      [
        [10, 0, 1, 'Bikes'],
        [11, 10, 2, 'C Line'],
        [12, 10, 2, 'P Line'],
        [20, 0, 1, 'Parts and accessories'],
        [21, 20, 2, 'Parts'],
        [22, 21, 3, 'Brakes'],
        [23, 21, 3, 'Cables'],
      ],
    );
    assert.deepEqual(flat.map((c) => c.sortIndex), [0, 1, 2, 3, 4, 5, 6]);
    assert.equal(flat.find((c) => c.categoryId === 22)?.isVisible, false);
    assert.equal(flat.find((c) => c.categoryId === 23)?.isVisible, true);
  });

  it('tolerates non-array input and duplicate ids', () => {
    assert.deepEqual(flattenBcCategoryTree(null), []);
    assert.deepEqual(flattenBcCategoryTree({}), []);
    const flat = flattenBcCategoryTree([{ id: 1, name: 'A' }, { id: 1, name: 'A again' }, { category_id: 2, name: '' }]);
    assert.deepEqual(flat.map((c) => [c.categoryId, c.name]), [[1, 'A'], [2, 'Category 2']]);
  });
});

describe('category index helpers', () => {
  const index = buildCategoryIndex(flattenBcCategoryTree(BC_TREE));

  it('orders depth-first and exposes roots/children', () => {
    assert.deepEqual(index.rootIds, [10, 20]);
    assert.deepEqual(index.orderedIds, [10, 11, 12, 20, 21, 22, 23]);
    assert.deepEqual(index.childrenById.get(21), [22, 23]);
  });

  it('resolves ancestors and descendants', () => {
    assert.deepEqual(getAncestorIds(index, 22), [21, 20]);
    assert.deepEqual(getAncestorIds(index, 10), []);
    assert.deepEqual(getDescendantIds(index, 20), [21, 22, 23]);
    assert.deepEqual(getDescendantIds(index, 23), []);
  });

  it('builds a readable path', () => {
    assert.equal(buildCategoryPath(index, 22), 'Parts and accessories › Parts › Brakes');
    assert.equal(buildCategoryPath(index, 404), '404');
  });

  it('promotes children of a missing parent to roots', () => {
    const partial = buildCategoryIndex([
      { categoryId: 5, parentId: 4, name: 'Child', depth: 2, sortIndex: 1, isVisible: true },
    ]);
    assert.deepEqual(partial.rootIds, [5]);
    assert.deepEqual(getAncestorIds(partial, 5), []);
  });

  it('survives a parent cycle', () => {
    const cyclic = buildCategoryIndex([
      { categoryId: 1, parentId: 2, name: 'A', depth: 1, sortIndex: 0, isVisible: true },
      { categoryId: 2, parentId: 1, name: 'B', depth: 1, sortIndex: 1, isVisible: true },
    ]);
    assert.equal(cyclic.orderedIds.length, 2);
    assert.ok(getAncestorIds(cyclic, 1).length <= 1);
  });
});

describe('isEffectivelyActive', () => {
  const index = buildCategoryIndex(flattenBcCategoryTree(BC_TREE));

  it('requires the category and every ancestor to be active', () => {
    assert.equal(isEffectivelyActive(index, new Set([20, 21, 22]), 22), true);
    assert.equal(isEffectivelyActive(index, new Set([21, 22]), 22), false);
    assert.equal(isEffectivelyActive(index, new Set([20, 21]), 22), false);
    assert.equal(isEffectivelyActive(index, new Set([10]), 10), true);
  });

  it('matches the single-pass computation', () => {
    const own = new Set([10, 12, 21, 22, 23]);
    const effective = computeEffectiveActiveIds(index, own);
    assert.deepEqual([...effective].sort((a, b) => a - b), [10, 12]);
    for (const id of index.orderedIds) assert.equal(effective.has(id), isEffectivelyActive(index, own, id));
  });
});

describe('selectVisibleCategoryIds', () => {
  const index = buildCategoryIndex(flattenBcCategoryTree(BC_TREE));

  it('returns null without a predicate', () => {
    assert.equal(selectVisibleCategoryIds(index, null), null);
  });

  it('keeps ancestors of matches so the tree stays readable', () => {
    const visible = selectVisibleCategoryIds(index, (c) => categoryMatchesSearch(c, 'brak'));
    assert.deepEqual([...(visible ?? [])].sort((a, b) => a - b), [20, 21, 22]);
  });

  it('matches by id prefix', () => {
    const visible = selectVisibleCategoryIds(index, (c) => categoryMatchesSearch(c, '1'));
    assert.deepEqual([...(visible ?? [])].sort((a, b) => a - b), [10, 11, 12]);
  });
});

describe('small helpers', () => {
  it('normalizes level codes', () => {
    assert.equal(normalizeLevelCode(' Gold '), 'GOLD');
    assert.equal(normalizeLevelCode('Gold plus!'), 'GOLD_PLUS');
    assert.equal(normalizeLevelCode('Élite tier'), 'ELITE_TIER');
    assert.equal(normalizeLevelCode('---'), '');
  });

  it('builds cell keys and active lookups', () => {
    assert.equal(eligibilityCellKey('gb', 3, 22), 'GB|3|22');
    const lookup = buildActiveSetLookup({ gb: { '1': [10, 11] } });
    assert.equal(lookup.get('GB|1')?.has(11), true);
    assert.equal(lookup.get('GB|2'), undefined);
  });

  it('parses comma lists', () => {
    assert.deepEqual(parseCsvParam(' GB, FR ,GB,,'), ['GB', 'FR']);
    assert.deepEqual(parseCsvParam(undefined), []);
  });
});
