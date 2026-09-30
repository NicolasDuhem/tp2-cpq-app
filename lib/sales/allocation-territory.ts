/**
 * Pure helpers shared by the Sales allocation pages.
 *
 * This module is intentionally dependency-free (no `@/` imports, no DB, no React)
 * so it can be unit tested directly with `node --test`.
 */

export type TerritoryRegion = {
  region: string;
  subRegions: Array<{ subRegion: string; countries: string[] }>;
};

export type TerritoryMappingInput = {
  region?: string | null;
  sub_region?: string | null;
  country_code?: string | null;
};

export type AllocationStatusValue = 'active' | 'not_active' | 'not_configured';

export const OTHER_REGION_LABEL = 'Other';
export const UNMAPPED_SUB_REGION_LABEL = 'Unmapped';

const trimmed = (value: unknown) => String(value ?? '').trim();

/**
 * Group the country codes actually present in the dataset into
 * Region -> Sub-region -> Country using `cpq_country_mappings` rows.
 *
 * Countries with no mapping row are grouped under `Other -> Unmapped` so no
 * country can ever disappear from the selector.
 */
export function buildTerritoryRegions(
  mappings: TerritoryMappingInput[],
  usedCountryCodes: string[],
): TerritoryRegion[] {
  const used = new Set(usedCountryCodes.map((code) => trimmed(code).toUpperCase()).filter(Boolean));
  const regionMap = new Map<string, Map<string, string[]>>();

  for (const mapping of mappings) {
    const countryCode = trimmed(mapping.country_code).toUpperCase();
    if (!countryCode || !used.has(countryCode)) continue;

    const region = trimmed(mapping.region) || OTHER_REGION_LABEL;
    const subRegion = trimmed(mapping.sub_region) || OTHER_REGION_LABEL;
    const subRegionMap = regionMap.get(region) ?? new Map<string, string[]>();
    const countries = subRegionMap.get(subRegion) ?? [];
    if (!countries.includes(countryCode)) {
      countries.push(countryCode);
      countries.sort((a, b) => a.localeCompare(b));
    }
    subRegionMap.set(subRegion, countries);
    regionMap.set(region, subRegionMap);
  }

  const mapped = new Set<string>();
  const regions: TerritoryRegion[] = [...regionMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([region, subRegionMap]) => ({
      region,
      subRegions: [...subRegionMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([subRegion, countries]) => {
          countries.forEach((countryCode) => mapped.add(countryCode));
          return { subRegion, countries };
        }),
    }));

  const unmapped = [...used].filter((countryCode) => !mapped.has(countryCode)).sort((a, b) => a.localeCompare(b));
  if (unmapped.length) {
    const existingOther = regions.find((entry) => entry.region === OTHER_REGION_LABEL);
    if (existingOther) {
      existingOther.subRegions.push({ subRegion: UNMAPPED_SUB_REGION_LABEL, countries: unmapped });
      existingOther.subRegions.sort((a, b) => a.subRegion.localeCompare(b.subRegion));
    } else {
      regions.push({
        region: OTHER_REGION_LABEL,
        subRegions: [{ subRegion: UNMAPPED_SUB_REGION_LABEL, countries: unmapped }],
      });
    }
  }

  return regions;
}

/** Country codes in a territory hierarchy, flattened and de-duplicated. */
export function flattenTerritoryCountries(regions: TerritoryRegion[]): string[] {
  return [...new Set(regions.flatMap((region) => region.subRegions.flatMap((subRegion) => subRegion.countries)))];
}

/**
 * Narrow the hierarchy to countries matching a search term.
 * Search never mutates the selection: it only hides options from view.
 */
export function filterTerritoryRegions(regions: TerritoryRegion[], search: string): TerritoryRegion[] {
  const needle = trimmed(search).toLowerCase();
  if (!needle) return regions;

  return regions
    .map((region) => ({
      region: region.region,
      subRegions: region.subRegions
        .map((subRegion) => ({
          subRegion: subRegion.subRegion,
          countries: subRegion.countries.filter((countryCode) => countryCode.toLowerCase().includes(needle)),
        }))
        .filter((subRegion) => subRegion.countries.length > 0),
    }))
    .filter((region) => region.subRegions.length > 0);
}

/**
 * Page numbers to render in a pagination bar. Gaps between consecutive
 * entries are rendered as an ellipsis by the caller.
 */
export function buildPaginationItems(page: number, totalPages: number): number[] {
  const total = Math.max(1, Math.floor(totalPages) || 1);
  const current = Math.min(total, Math.max(1, Math.floor(page) || 1));
  const around = [current - 1, current, current + 1, current + 2].filter((value) => value >= 1 && value <= total);
  return [...new Set([1, ...around, total])].sort((a, b) => a - b);
}

/** Flag image URL for a country code. `EL` (Greece, non-ISO usage) maps to `gr`. */
export function getCountryFlagUrl(countryCode: string): string {
  const normalized = trimmed(countryCode).toUpperCase();
  const flagCode = normalized === 'EL' ? 'gr' : normalized.toLowerCase();
  return `https://flagcdn.com/${flagCode}.svg`;
}

/**
 * Allocation-status matching for a bike row.
 *
 * Semantics: a row matches when **any** country in scope has **any** of the
 * selected statuses. Country scope is the explicit territory selection when one
 * exists, otherwise every country column.
 */
export function rowMatchesAllocationStatuses(
  countryStatuses: Record<string, AllocationStatusValue>,
  selectedCountries: string[],
  allCountries: string[],
  selectedStatuses: AllocationStatusValue[],
): boolean {
  if (!selectedStatuses.length) return true;
  const scope = selectedCountries.length ? selectedCountries : allCountries;
  if (!scope.length) return false;
  return scope.some((countryCode) => selectedStatuses.includes(countryStatuses[countryCode] ?? 'not_configured'));
}

/**
 * Percent-encode a segment for the feature-filter value.
 *
 * `encodeURIComponent` leaves `~` untouched, and `~` is our pair separator, so
 * it is escaped explicitly. `;` (the segment separator) is already escaped.
 */
function encodeSegment(value: string): string {
  return encodeURIComponent(value).replace(/~/g, '%7E');
}

/**
 * Serialize `{ featureLabel: containsText }` pairs into one URL-safe value.
 * Labels and values are percent-encoded so arbitrary feature labels are safe.
 */
export function encodeFeatureFilters(featureFilters: Record<string, string>): string {
  return Object.entries(featureFilters)
    .map(([label, value]) => [trimmed(label), trimmed(value)] as const)
    .filter(([label, value]) => label && value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, value]) => `${encodeSegment(label)}~${encodeSegment(value)}`)
    .join(';');
}

/** Inverse of `encodeFeatureFilters`; invalid segments are dropped. */
export function decodeFeatureFilters(value: string | undefined | null): Record<string, string> {
  const result: Record<string, string> = {};
  for (const segment of trimmed(value).split(';')) {
    if (!segment) continue;
    const separatorIndex = segment.indexOf('~');
    if (separatorIndex <= 0) continue;
    try {
      const label = decodeURIComponent(segment.slice(0, separatorIndex)).trim();
      const search = decodeURIComponent(segment.slice(separatorIndex + 1)).trim();
      if (label && search) result[label] = search;
    } catch {
      // Malformed percent-encoding: ignore this segment rather than failing the page.
    }
  }
  return result;
}

/** Normalize a comma-separated URL list: trim, drop blanks, de-duplicate, sort. */
export function parseUrlList(value: string | undefined | null): string[] {
  return [
    ...new Set(
      trimmed(value)
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));
}

/** Parse a comma-separated allocation-status list, ignoring unknown values. */
export function parseAllocationStatuses(value: string | undefined | null): AllocationStatusValue[] {
  const allowed: AllocationStatusValue[] = ['active', 'not_active', 'not_configured'];
  return parseUrlList(value)
    .map((entry) => entry.toLowerCase())
    .filter((entry): entry is AllocationStatusValue => (allowed as string[]).includes(entry));
}
