import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildPaginationItems,
  buildTerritoryRegions,
  decodeFeatureFilters,
  encodeFeatureFilters,
  filterTerritoryRegions,
  flattenTerritoryCountries,
  getCountryFlagUrl,
  parseAllocationStatuses,
  parseUrlList,
  rowMatchesAllocationStatuses,
  type AllocationStatusValue,
} from './allocation-territory.ts';

const MAPPINGS = [
  { region: 'EMEA', sub_region: 'UK & Ireland', country_code: 'GB' },
  { region: 'EMEA', sub_region: 'UK & Ireland', country_code: 'IE' },
  { region: 'EMEA', sub_region: 'Southern Europe', country_code: 'EL' },
  { region: 'EMEA', sub_region: 'Southern Europe', country_code: 'IT' },
  { region: 'APAC', sub_region: 'Oceania', country_code: 'AU' },
  { region: '', sub_region: '', country_code: 'XX' },
];

describe('buildTerritoryRegions', () => {
  it('groups used countries as Region -> Sub-region -> Country, sorted', () => {
    const regions = buildTerritoryRegions(MAPPINGS, ['GB', 'IE', 'EL', 'IT', 'AU']);
    assert.deepEqual(
      regions.map((region) => region.region),
      ['APAC', 'EMEA'],
    );
    const emea = regions.find((region) => region.region === 'EMEA');
    assert.deepEqual(
      emea?.subRegions.map((subRegion) => subRegion.subRegion),
      ['Southern Europe', 'UK & Ireland'],
    );
    assert.deepEqual(emea?.subRegions[0].countries, ['EL', 'IT']);
    assert.deepEqual(emea?.subRegions[1].countries, ['GB', 'IE']);
  });

  it('ignores mapped countries that are not in the dataset', () => {
    const regions = buildTerritoryRegions(MAPPINGS, ['GB']);
    assert.deepEqual(flattenTerritoryCountries(regions), ['GB']);
  });

  it('places countries without hierarchy data under Other -> Unmapped', () => {
    const regions = buildTerritoryRegions(MAPPINGS, ['GB', 'ZZ']);
    const other = regions.find((region) => region.region === 'Other');
    assert.ok(other, 'expected an Other region');
    const unmapped = other?.subRegions.find((subRegion) => subRegion.subRegion === 'Unmapped');
    assert.deepEqual(unmapped?.countries, ['ZZ']);
  });

  it('merges blank-region mappings and unmapped countries under one Other region', () => {
    const regions = buildTerritoryRegions(MAPPINGS, ['XX', 'ZZ']);
    const otherRegions = regions.filter((region) => region.region === 'Other');
    assert.equal(otherRegions.length, 1);
    assert.deepEqual(
      otherRegions[0].subRegions.map((subRegion) => subRegion.subRegion),
      ['Other', 'Unmapped'],
    );
  });

  it('never loses a country: every used code appears exactly once', () => {
    const used = ['GB', 'IE', 'EL', 'IT', 'AU', 'XX', 'ZZ'];
    const flattened = flattenTerritoryCountries(buildTerritoryRegions(MAPPINGS, used));
    assert.deepEqual([...flattened].sort(), [...used].sort());
  });

  it('normalizes lowercase input codes', () => {
    const regions = buildTerritoryRegions(MAPPINGS, ['gb']);
    assert.deepEqual(flattenTerritoryCountries(regions), ['GB']);
  });
});

describe('filterTerritoryRegions', () => {
  const regions = buildTerritoryRegions(MAPPINGS, ['GB', 'IE', 'EL', 'IT', 'AU']);

  it('returns the hierarchy unchanged for an empty search', () => {
    assert.deepEqual(filterTerritoryRegions(regions, '   '), regions);
  });

  it('keeps only matching countries and drops empty groups', () => {
    const filtered = filterTerritoryRegions(regions, 'i');
    assert.deepEqual(
      filtered.flatMap((region) => region.subRegions.flatMap((subRegion) => subRegion.countries)).sort(),
      ['IE', 'IT'],
    );
  });

  it('is case-insensitive', () => {
    assert.deepEqual(flattenTerritoryCountries(filterTerritoryRegions(regions, 'gb')), ['GB']);
  });

  it('does not mutate the source hierarchy, so hidden selections survive', () => {
    const before = JSON.stringify(regions);
    filterTerritoryRegions(regions, 'gb');
    assert.equal(JSON.stringify(regions), before);
  });
});

describe('buildPaginationItems', () => {
  it('returns a single page when there is only one', () => {
    assert.deepEqual(buildPaginationItems(1, 1), [1]);
  });

  it('returns every page without gaps for small page counts', () => {
    assert.deepEqual(buildPaginationItems(1, 4), [1, 2, 3, 4]);
  });

  it('includes first, last and a window around the current page', () => {
    assert.deepEqual(buildPaginationItems(10, 30), [1, 9, 10, 11, 12, 30]);
  });

  it('leaves a gap that the caller renders as an ellipsis', () => {
    const items = buildPaginationItems(10, 30);
    const gaps = items.filter((item, index) => index > 0 && item - items[index - 1] > 1);
    assert.deepEqual(gaps, [9, 30]);
  });

  it('has no gap when the current page is near the start', () => {
    const items = buildPaginationItems(2, 5);
    assert.deepEqual(items, [1, 2, 3, 4, 5]);
  });

  it('clamps a current page beyond the total', () => {
    assert.deepEqual(buildPaginationItems(99, 3), [1, 2, 3]);
  });

  it('survives zero/NaN input', () => {
    assert.deepEqual(buildPaginationItems(0, 0), [1]);
    assert.deepEqual(buildPaginationItems(Number.NaN, Number.NaN), [1]);
  });
});

describe('getCountryFlagUrl', () => {
  it('lowercases the ISO code', () => {
    assert.equal(getCountryFlagUrl('GB'), 'https://flagcdn.com/gb.svg');
  });

  it('maps the non-standard EL code to the Greek flag', () => {
    assert.equal(getCountryFlagUrl('EL'), 'https://flagcdn.com/gr.svg');
    assert.equal(getCountryFlagUrl('el'), 'https://flagcdn.com/gr.svg');
  });

  it('does not rewrite the real GR code', () => {
    assert.equal(getCountryFlagUrl('GR'), 'https://flagcdn.com/gr.svg');
  });
});

describe('rowMatchesAllocationStatuses', () => {
  const statuses: Record<string, AllocationStatusValue> = {
    GB: 'active',
    IE: 'not_active',
    IT: 'not_configured',
  };
  const all = ['GB', 'IE', 'IT'];

  it('keeps every row when no status is selected', () => {
    assert.equal(rowMatchesAllocationStatuses(statuses, [], all, []), true);
    assert.equal(rowMatchesAllocationStatuses(statuses, ['IT'], all, []), true);
  });

  it('matches when any country in scope has any selected status', () => {
    assert.equal(rowMatchesAllocationStatuses(statuses, [], all, ['active']), true);
    assert.equal(rowMatchesAllocationStatuses(statuses, [], all, ['not_configured']), true);
  });

  it('narrows evaluation to the territory selection when one exists', () => {
    assert.equal(rowMatchesAllocationStatuses(statuses, ['IE'], all, ['active']), false);
    assert.equal(rowMatchesAllocationStatuses(statuses, ['IE'], all, ['not_active']), true);
    assert.equal(rowMatchesAllocationStatuses(statuses, ['GB', 'IE'], all, ['active']), true);
  });

  it('keeps Inactive and Not configured distinct', () => {
    assert.equal(rowMatchesAllocationStatuses(statuses, ['IT'], all, ['not_active']), false);
    assert.equal(rowMatchesAllocationStatuses(statuses, ['IT'], all, ['not_configured']), true);
    assert.equal(rowMatchesAllocationStatuses(statuses, ['IE'], all, ['not_configured']), false);
  });

  it('treats a country with no recorded status as Not configured', () => {
    assert.equal(rowMatchesAllocationStatuses(statuses, ['FR'], ['FR'], ['not_configured']), true);
    assert.equal(rowMatchesAllocationStatuses(statuses, ['FR'], ['FR'], ['active']), false);
  });

  it('matches nothing when there is no country scope at all', () => {
    assert.equal(rowMatchesAllocationStatuses(statuses, [], [], ['active']), false);
  });
});

describe('feature filter URL encoding', () => {
  it('round-trips labels and values containing delimiters', () => {
    const input = { 'Frame ~ Colour;Trim': 'Racing; Green ~ Gloss', Size: 'M' };
    const decoded = decodeFeatureFilters(encodeFeatureFilters(input));
    assert.deepEqual(decoded, input);
  });

  it('drops blank labels and values', () => {
    assert.equal(encodeFeatureFilters({ Size: '   ', '': 'x' }), '');
  });

  it('is deterministic regardless of key insertion order', () => {
    assert.equal(encodeFeatureFilters({ a: '1', b: '2' }), encodeFeatureFilters({ b: '2', a: '1' }));
  });

  it('ignores malformed segments instead of throwing', () => {
    assert.deepEqual(decodeFeatureFilters('nosep;~novalue;%E0%A4%A~bad;Size~M'), { Size: 'M' });
  });

  it('decodes empty input to an empty object', () => {
    assert.deepEqual(decodeFeatureFilters(undefined), {});
    assert.deepEqual(decodeFeatureFilters(''), {});
  });
});

describe('URL list parsing', () => {
  it('trims, de-duplicates and sorts', () => {
    assert.deepEqual(parseUrlList(' b , a ,b,, '), ['a', 'b']);
  });

  it('returns an empty list for missing input', () => {
    assert.deepEqual(parseUrlList(undefined), []);
  });

  it('keeps only known allocation statuses', () => {
    assert.deepEqual(parseAllocationStatuses('active,bogus,NOT_CONFIGURED'), ['active', 'not_configured']);
  });

  it('ignores an entirely invalid status list', () => {
    assert.deepEqual(parseAllocationStatuses('deleted,;'), []);
  });
});
