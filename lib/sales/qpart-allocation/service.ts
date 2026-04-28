import { sql } from '@/lib/db/client';
import { listMetadataDefinitions } from '@/lib/qpart/metadata/service';
import { syncQPartCountryAllocationRows } from '@/lib/qpart/allocation/service';
import { listCountryMappings } from '@/lib/cpq/setup/service';

export type QPartAllocationStatus = 'active' | 'inactive';

export type SalesQPartAllocationRow = {
  partId: number;
  partNumber: string;
  englishTitle: string;
  hierarchyLevels: string[];
  hierarchySummary: string;
  metadataValues: Record<string, string[]>;
  countryStatuses: Record<string, QPartAllocationStatus>;
};

export type SalesQPartTerritoryFilterRegion = {
  region: string;
  subRegions: Array<{
    subRegion: string;
    countries: string[];
  }>;
};

export type SalesQPartAllocationFilterOptions = {
  countries: string[];
  territoryRegions: SalesQPartTerritoryFilterRegion[];
  metadataFields: Array<{ key: string; label: string }>;
};

export type SalesQPartAllocationPageData = {
  rows: SalesQPartAllocationRow[];
  countries: string[];
  filterOptions: SalesQPartAllocationFilterOptions;
};

type PartAllocationRow = {
  part_id: number;
  part_number: string;
  default_name: string;
  country_code: string;
  active: boolean;
  hierarchy_1: string | null;
  hierarchy_2: string | null;
  hierarchy_3: string | null;
  hierarchy_4: string | null;
  hierarchy_5: string | null;
  hierarchy_6: string | null;
  hierarchy_7: string | null;
};

const asTrimmed = (value: unknown) => String(value ?? '').trim();

function normalizeStatus(value: unknown): QPartAllocationStatus {
  return value === true || value === 'true' || value === 't' || value === 1 || value === '1' ? 'active' : 'inactive';
}

async function listPartAllocationRows(): Promise<PartAllocationRow[]> {
  return (await sql`
    select
      p.id as part_id,
      p.part_number,
      p.default_name,
      allocation.country_code,
      allocation.active,
      coalesce(case when n0.level = 1 then n0.label_en end, case when n1.level = 1 then n1.label_en end, case when n2.level = 1 then n2.label_en end, case when n3.level = 1 then n3.label_en end, case when n4.level = 1 then n4.label_en end, case when n5.level = 1 then n5.label_en end, case when n6.level = 1 then n6.label_en end) as hierarchy_1,
      coalesce(case when n0.level = 2 then n0.label_en end, case when n1.level = 2 then n1.label_en end, case when n2.level = 2 then n2.label_en end, case when n3.level = 2 then n3.label_en end, case when n4.level = 2 then n4.label_en end, case when n5.level = 2 then n5.label_en end, case when n6.level = 2 then n6.label_en end) as hierarchy_2,
      coalesce(case when n0.level = 3 then n0.label_en end, case when n1.level = 3 then n1.label_en end, case when n2.level = 3 then n2.label_en end, case when n3.level = 3 then n3.label_en end, case when n4.level = 3 then n4.label_en end, case when n5.level = 3 then n5.label_en end, case when n6.level = 3 then n6.label_en end) as hierarchy_3,
      coalesce(case when n0.level = 4 then n0.label_en end, case when n1.level = 4 then n1.label_en end, case when n2.level = 4 then n2.label_en end, case when n3.level = 4 then n3.label_en end, case when n4.level = 4 then n4.label_en end, case when n5.level = 4 then n5.label_en end, case when n6.level = 4 then n6.label_en end) as hierarchy_4,
      coalesce(case when n0.level = 5 then n0.label_en end, case when n1.level = 5 then n1.label_en end, case when n2.level = 5 then n2.label_en end, case when n3.level = 5 then n3.label_en end, case when n4.level = 5 then n4.label_en end, case when n5.level = 5 then n5.label_en end, case when n6.level = 5 then n6.label_en end) as hierarchy_5,
      coalesce(case when n0.level = 6 then n0.label_en end, case when n1.level = 6 then n1.label_en end, case when n2.level = 6 then n2.label_en end, case when n3.level = 6 then n3.label_en end, case when n4.level = 6 then n4.label_en end, case when n5.level = 6 then n5.label_en end, case when n6.level = 6 then n6.label_en end) as hierarchy_6,
      coalesce(case when n0.level = 7 then n0.label_en end, case when n1.level = 7 then n1.label_en end, case when n2.level = 7 then n2.label_en end, case when n3.level = 7 then n3.label_en end, case when n4.level = 7 then n4.label_en end, case when n5.level = 7 then n5.label_en end, case when n6.level = 7 then n6.label_en end) as hierarchy_7
    from qpart_parts p
    join qpart_country_allocation allocation on allocation.part_id = p.id
    left join qpart_hierarchy_nodes n0 on n0.id = p.hierarchy_node_id
    left join qpart_hierarchy_nodes n1 on n1.id = n0.parent_id
    left join qpart_hierarchy_nodes n2 on n2.id = n1.parent_id
    left join qpart_hierarchy_nodes n3 on n3.id = n2.parent_id
    left join qpart_hierarchy_nodes n4 on n4.id = n3.parent_id
    left join qpart_hierarchy_nodes n5 on n5.id = n4.parent_id
    left join qpart_hierarchy_nodes n6 on n6.id = n5.parent_id
    order by p.part_number, allocation.country_code
  `) as PartAllocationRow[];
}

async function listPartMetadataMap() {
  const rows = (await sql`
    select
      mv.part_id,
      definitions.key,
      coalesce(
        nullif(trim(mv.value_text), ''),
        case when mv.value_number is null then null else mv.value_number::text end,
        case when mv.value_boolean is null then null when mv.value_boolean then 'true' else 'false' end,
        case when mv.value_date is null then null else mv.value_date::text end,
        case when mv.value_json is null then null else mv.value_json::text end
      ) as resolved_value
    from qpart_part_metadata_values mv
    join qpart_metadata_definitions definitions on definitions.id = mv.metadata_definition_id
    where definitions.is_active = true
  `) as Array<{ part_id: number; key: string; resolved_value: string | null }>;

  const map = new Map<number, Record<string, Set<string>>>();
  for (const row of rows) {
    const value = asTrimmed(row.resolved_value);
    if (!value) continue;
    const partMetadata = map.get(row.part_id) ?? {};
    const definitionValues = partMetadata[row.key] ?? new Set<string>();
    definitionValues.add(value);
    partMetadata[row.key] = definitionValues;
    map.set(row.part_id, partMetadata);
  }

  return map;
}

export async function getSalesQPartAllocationPageData(): Promise<SalesQPartAllocationPageData> {
  await syncQPartCountryAllocationRows();

  const [allocations, metadataMap, metadataDefinitions, countryMappings] = await Promise.all([
    listPartAllocationRows(),
    listPartMetadataMap(),
    listMetadataDefinitions(true),
    listCountryMappings(true),
  ]);

  const countries = [...new Set(allocations.map((row) => asTrimmed(row.country_code)).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );

  const rowMap = new Map<number, SalesQPartAllocationRow>();
  for (const row of allocations) {
    const existing =
      rowMap.get(row.part_id) ??
      {
        partId: row.part_id,
        partNumber: row.part_number,
        englishTitle: row.default_name,
        hierarchyLevels: [row.hierarchy_1, row.hierarchy_2, row.hierarchy_3, row.hierarchy_4, row.hierarchy_5, row.hierarchy_6, row.hierarchy_7].map(
          (value) => asTrimmed(value),
        ),
        hierarchySummary: [row.hierarchy_1, row.hierarchy_2, row.hierarchy_3, row.hierarchy_4, row.hierarchy_5, row.hierarchy_6, row.hierarchy_7]
          .map((value) => asTrimmed(value))
          .filter(Boolean)
          .join(' > '),
        metadataValues: {},
        countryStatuses: {},
      };

    existing.countryStatuses[asTrimmed(row.country_code)] = normalizeStatus(row.active);
    rowMap.set(row.part_id, existing);
  }

  const rows = [...rowMap.values()]
    .map((row) => {
      const partMetadata = metadataMap.get(row.partId) ?? {};
      const metadataValues = Object.fromEntries(
        Object.entries(partMetadata).map(([key, values]) => [key, [...values].sort((a, b) => a.localeCompare(b))]),
      );

      return {
        ...row,
        metadataValues,
        countryStatuses: Object.fromEntries(
          countries.map((countryCode) => [countryCode, row.countryStatuses[countryCode] ?? 'inactive']),
        ) as Record<string, QPartAllocationStatus>,
      };
    })
    .sort((a, b) => a.partNumber.localeCompare(b.partNumber));

  const usedCountries = new Set(countries);
  const regionMap = new Map<string, Map<string, string[]>>();

  for (const mapping of countryMappings) {
    const countryCode = asTrimmed(mapping.country_code).toUpperCase();
    if (!usedCountries.has(countryCode)) continue;

    const region = asTrimmed(mapping.region) || 'Other';
    const subRegion = asTrimmed(mapping.sub_region) || 'Other';
    const subRegionMap = regionMap.get(region) ?? new Map<string, string[]>();
    const subRegionCountries = subRegionMap.get(subRegion) ?? [];
    if (!subRegionCountries.includes(countryCode)) {
      subRegionCountries.push(countryCode);
      subRegionCountries.sort((a, b) => a.localeCompare(b));
    }
    subRegionMap.set(subRegion, subRegionCountries);
    regionMap.set(region, subRegionMap);
  }

  const mappedCountries = new Set<string>();
  const territoryRegions: SalesQPartTerritoryFilterRegion[] = [...regionMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([region, subRegionMap]) => ({
      region,
      subRegions: [...subRegionMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([subRegion, values]) => {
          values.forEach((countryCode) => mappedCountries.add(countryCode));
          return {
            subRegion,
            countries: values,
          };
        }),
    }));

  const unmappedCountries = countries.filter((countryCode) => !mappedCountries.has(countryCode));
  if (unmappedCountries.length) {
    territoryRegions.push({
      region: 'Other',
      subRegions: [
        {
          subRegion: 'Unmapped',
          countries: unmappedCountries,
        },
      ],
    });
  }

  return {
    rows,
    countries,
    filterOptions: {
      countries,
      territoryRegions,
      metadataFields: metadataDefinitions.map((definition) => ({ key: definition.key, label: definition.label_en })),
    },
  };
}

export async function toggleQPartCountryAllocation(input: { partId: number; countryCode: string; targetStatus: QPartAllocationStatus }) {
  const partId = Number(input.partId);
  const countryCode = asTrimmed(input.countryCode).toUpperCase();

  if (!Number.isFinite(partId)) throw new Error('partId is required');
  if (!countryCode) throw new Error('countryCode is required');

  const targetActive = input.targetStatus === 'active';

  const rows = (await sql`
    update qpart_country_allocation
    set active = ${targetActive},
        updated_at = now()
    where part_id = ${partId}
      and country_code = ${countryCode}
    returning id
  `) as Array<{ id: number }>;

  return {
    updatedCount: rows.length,
    targetStatus: input.targetStatus,
  };
}

export async function bulkUpdateQPartCountryAllocation(input: {
  partIds: number[];
  countryCodes: string[];
  targetStatus: QPartAllocationStatus;
}) {
  const partIds = [...new Set(input.partIds.map((value) => Number(value)).filter(Number.isFinite))];
  const countryCodes = [...new Set(input.countryCodes.map((value) => asTrimmed(value).toUpperCase()).filter(Boolean))];

  if (!partIds.length) throw new Error('partIds is required');
  if (!countryCodes.length) throw new Error('countryCodes is required');

  const rows = (await sql`
    with target_parts as (
      select value::bigint as part_id
      from jsonb_array_elements_text(${JSON.stringify(partIds)}::jsonb)
    ),
    target_countries as (
      select value::text as country_code
      from jsonb_array_elements_text(${JSON.stringify(countryCodes)}::jsonb)
    )
    update qpart_country_allocation allocation
    set active = ${input.targetStatus === 'active'},
        updated_at = now()
    where allocation.part_id in (select part_id from target_parts)
      and allocation.country_code in (select country_code from target_countries)
    returning id
  `) as Array<{ id: number }>;

  return {
    updatedCount: rows.length,
    partCount: partIds.length,
    countryCount: countryCodes.length,
    targetStatus: input.targetStatus,
  };
}
