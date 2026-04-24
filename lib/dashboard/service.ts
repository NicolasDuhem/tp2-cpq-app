import { sql } from '@/lib/db/client';

export type DashboardKpi = {
  activeConfigurations: number;
  inactiveConfigurations: number;
  territoriesCovered: number;
  bikeTypesCovered: number;
  territoriesWithGaps: number;
  featuresMissingPictures: number;
  pictureCoveragePct: number;
};

export type DashboardTerritoryPoint = {
  countryCode: string;
  countryName: string;
  region: string;
  subRegion: string;
  x: number;
  y: number;
  totalBikeTypes: number;
  activeBikeTypes: number;
  inactiveBikeTypes: number;
  readinessScore: number;
};

export type DashboardCoverageRow = {
  countryCode: string;
  countryName: string;
  bikeType: string;
  activeCount: number;
  inactiveCount: number;
  totalCount: number;
  health: 'strong' | 'mixed' | 'weak' | 'none';
  healthScore: number;
};

export type DashboardPictureFeature = {
  featureLabel: string;
  configured: number;
  missing: number;
  total: number;
  completionPct: number;
};

export type DashboardGapItem = {
  label: string;
  value: number;
  hint: string;
  href: string;
};

export type DashboardLeaderboardItem = {
  rank: number;
  label: string;
  metricLabel: string;
  metricValue: number;
  href: string;
};

export type DashboardPageData = {
  generatedAt: string;
  kpi: DashboardKpi;
  bikeTypes: string[];
  countries: string[];
  territoryPoints: DashboardTerritoryPoint[];
  coverageRows: DashboardCoverageRow[];
  pictureFeatures: DashboardPictureFeature[];
  gaps: DashboardGapItem[];
  leaderboards: {
    territoriesMissingCoverage: DashboardLeaderboardItem[];
    bikeTypesWeakCoverage: DashboardLeaderboardItem[];
    featuresMissingPictures: DashboardLeaderboardItem[];
    inactiveHeavyCombos: DashboardLeaderboardItem[];
  };
  extras: {
    activeSharePct: number;
    inactiveSharePct: number;
    rulesetsByBikeType: Array<{ bikeType: string; rulesetCount: number }>;
  };
  notes: {
    heatmapLogic: string;
    bikeTypeMappingSource: string;
    pictureCompletenessLogic: string;
  };
};

type CountryMappingRow = {
  country_code: string;
  region: string;
  sub_region: string;
};

type SamplerAggregateRow = {
  country_code: string;
  ruleset: string;
  active_count: number;
  inactive_count: number;
  total_count: number;
};

const asTrimmed = (value: unknown) => String(value ?? '').trim();

const REGION_COORDINATES: Record<string, { lon: number; lat: number }> = {
  europe: { lon: 10, lat: 51 },
  'north america': { lon: -100, lat: 45 },
  'south america': { lon: -60, lat: -17 },
  asia: { lon: 95, lat: 35 },
  africa: { lon: 20, lat: 2 },
  oceania: { lon: 135, lat: -24 },
  'middle east': { lon: 45, lat: 26 },
};

const SUB_REGION_COORDINATE_OFFSETS: Record<string, { lon: number; lat: number }> = {
  'western europe': { lon: -6, lat: 2 },
  'northern europe': { lon: 2, lat: 7 },
  'southern europe': { lon: 4, lat: -6 },
  'eastern europe': { lon: 12, lat: 2 },
  'north america': { lon: -5, lat: 0 },
  'central america': { lon: 8, lat: -14 },
  'south america': { lon: 0, lat: -2 },
  'eastern asia': { lon: 20, lat: 3 },
  'south-eastern asia': { lon: 16, lat: -9 },
  'southern asia': { lon: 6, lat: -6 },
  'western asia': { lon: -8, lat: 2 },
  'northern africa': { lon: 3, lat: 9 },
  'sub-saharan africa': { lon: 8, lat: -5 },
  'australia and new zealand': { lon: 14, lat: -5 },
};

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function hashCode(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function projectToMap(lon: number, lat: number) {
  const x = ((lon + 180) / 360) * 100;
  const y = ((90 - lat) / 180) * 100;
  return { x, y };
}

function resolveCountryName(countryCode: string): string {
  try {
    const formatter = new Intl.DisplayNames(['en'], { type: 'region' });
    return formatter.of(countryCode) ?? countryCode;
  } catch {
    return countryCode;
  }
}

export async function getDashboardPageData(): Promise<DashboardPageData> {
  const [countryMappingsRaw, samplerAggRowsRaw, rulesetRowsRaw, pictureRowsRaw] = await Promise.all([
    sql`
      select distinct country_code, region, sub_region
      from cpq_country_mappings
      where is_active = true
        and coalesce(trim(country_code), '') <> ''
    `,
    sql`
      select
        upper(trim(country_code)) as country_code,
        trim(ruleset) as ruleset,
        sum(case when active = true then 1 else 0 end)::int as active_count,
        sum(case when active = false then 1 else 0 end)::int as inactive_count,
        count(*)::int as total_count
      from CPQ_sampler_result
      where coalesce(trim(country_code), '') <> ''
        and coalesce(trim(ruleset), '') <> ''
      group by upper(trim(country_code)), trim(ruleset)
    `,
    sql`
      select cpq_ruleset, bike_type
      from CPQ_setup_ruleset
      where coalesce(trim(cpq_ruleset), '') <> ''
    `,
    sql`
      select feature_label, picture_link_1, picture_link_2, picture_link_3, picture_link_4
      from cpq_image_management
      where is_active = true
    `,
  ]);
  const countryMappings = countryMappingsRaw as CountryMappingRow[];
  const samplerAggRows = samplerAggRowsRaw as SamplerAggregateRow[];
  const rulesetRows = rulesetRowsRaw as Array<{ cpq_ruleset: string | null; bike_type: string | null }>;
  const pictureRows = pictureRowsRaw as Array<{
    feature_label: string | null;
    picture_link_1: string | null;
    picture_link_2: string | null;
    picture_link_3: string | null;
    picture_link_4: string | null;
  }>;

  const rulesetToBikeType = new Map<string, string>();
  const rulesetsByBikeTypeCounter = new Map<string, Set<string>>();
  for (const row of rulesetRows) {
    const ruleset = asTrimmed(row.cpq_ruleset);
    if (!ruleset) continue;
    const bikeType = asTrimmed(row.bike_type) || 'Unmapped';
    rulesetToBikeType.set(ruleset, bikeType);
    if (!rulesetsByBikeTypeCounter.has(bikeType)) rulesetsByBikeTypeCounter.set(bikeType, new Set());
    rulesetsByBikeTypeCounter.get(bikeType)?.add(ruleset);
  }

  const bikeTypesSet = new Set<string>();
  for (const row of samplerAggRows) {
    const bikeType = rulesetToBikeType.get(asTrimmed(row.ruleset)) ?? 'Unmapped';
    bikeTypesSet.add(bikeType);
  }
  for (const bikeType of rulesetsByBikeTypeCounter.keys()) bikeTypesSet.add(bikeType);
  const bikeTypes = [...bikeTypesSet].sort((a, b) => a.localeCompare(b));

  const countryMeta = new Map<string, { region: string; subRegion: string }>();
  for (const row of countryMappings) {
    const code = asTrimmed(row.country_code).toUpperCase();
    if (!code) continue;
    countryMeta.set(code, { region: asTrimmed(row.region), subRegion: asTrimmed(row.sub_region) });
  }

  for (const row of samplerAggRows) {
    const code = asTrimmed(row.country_code).toUpperCase();
    if (!code || countryMeta.has(code)) continue;
    countryMeta.set(code, { region: 'Unknown', subRegion: 'Unknown' });
  }

  const countries = [...countryMeta.keys()].sort((a, b) => a.localeCompare(b));

  const coverageRows: DashboardCoverageRow[] = [];
  let totalActiveConfigurations = 0;
  let totalInactiveConfigurations = 0;

  const aggregateByPair = new Map<string, { active: number; inactive: number; total: number }>();
  for (const row of samplerAggRows) {
    const countryCode = asTrimmed(row.country_code).toUpperCase();
    const bikeType = rulesetToBikeType.get(asTrimmed(row.ruleset)) ?? 'Unmapped';
    const key = `${countryCode}::${bikeType}`;
    const existing = aggregateByPair.get(key) ?? { active: 0, inactive: 0, total: 0 };
    existing.active += Number(row.active_count ?? 0);
    existing.inactive += Number(row.inactive_count ?? 0);
    existing.total += Number(row.total_count ?? 0);
    aggregateByPair.set(key, existing);

    totalActiveConfigurations += Number(row.active_count ?? 0);
    totalInactiveConfigurations += Number(row.inactive_count ?? 0);
  }

  for (const countryCode of countries) {
    for (const bikeType of bikeTypes) {
      const bucket = aggregateByPair.get(`${countryCode}::${bikeType}`) ?? { active: 0, inactive: 0, total: 0 };
      const health: DashboardCoverageRow['health'] =
        bucket.total === 0 ? 'none' : bucket.active === 0 ? 'weak' : bucket.inactive === 0 ? 'strong' : 'mixed';
      const healthScore = bucket.total === 0 ? 0 : bucket.active === 0 ? 0.35 : bucket.inactive === 0 ? 1 : 0.65;
      coverageRows.push({
        countryCode,
        countryName: resolveCountryName(countryCode),
        bikeType,
        activeCount: bucket.active,
        inactiveCount: bucket.inactive,
        totalCount: bucket.total,
        health,
        healthScore,
      });
    }
  }

  const coverageByCountry = new Map<string, { activeBikeTypes: number; inactiveBikeTypes: number; readiness: number; totalPairs: number }>();
  for (const countryCode of countries) {
    const rows = coverageRows.filter((row) => row.countryCode === countryCode);
    const activeBikeTypes = rows.filter((row) => row.activeCount > 0).length;
    const inactiveBikeTypes = rows.filter((row) => row.totalCount > 0 && row.activeCount === 0).length;
    const readiness = rows.length ? rows.reduce((sum, row) => sum + row.healthScore, 0) / rows.length : 0;
    coverageByCountry.set(countryCode, { activeBikeTypes, inactiveBikeTypes, readiness, totalPairs: rows.length });
  }

  const territoryPoints: DashboardTerritoryPoint[] = countries.map((countryCode) => {
    const meta = countryMeta.get(countryCode) ?? { region: 'Unknown', subRegion: 'Unknown' };
    const regionSeed = REGION_COORDINATES[normalizeKey(meta.region)] ?? { lon: 0, lat: 10 };
    const subRegionShift = SUB_REGION_COORDINATE_OFFSETS[normalizeKey(meta.subRegion)] ?? { lon: 0, lat: 0 };
    const jitterSeed = hashCode(countryCode);
    const jitterLon = ((jitterSeed % 9) - 4) * 1.2;
    const jitterLat = ((Math.floor(jitterSeed / 10) % 9) - 4) * 0.8;
    const lon = Math.max(-170, Math.min(170, regionSeed.lon + subRegionShift.lon + jitterLon));
    const lat = Math.max(-72, Math.min(72, regionSeed.lat + subRegionShift.lat + jitterLat));
    const projected = projectToMap(lon, lat);
    const coverage = coverageByCountry.get(countryCode) ?? { activeBikeTypes: 0, inactiveBikeTypes: 0, readiness: 0, totalPairs: 0 };

    return {
      countryCode,
      countryName: resolveCountryName(countryCode),
      region: meta.region,
      subRegion: meta.subRegion,
      x: projected.x,
      y: projected.y,
      totalBikeTypes: coverage.totalPairs,
      activeBikeTypes: coverage.activeBikeTypes,
      inactiveBikeTypes: coverage.inactiveBikeTypes,
      readinessScore: coverage.readiness,
    };
  });

  const pictureFeatureMap = new Map<string, { configured: number; missing: number; total: number }>();
  for (const row of pictureRows) {
    const featureLabel = asTrimmed(row.feature_label) || 'Unknown feature';
    const links = [row.picture_link_1, row.picture_link_2, row.picture_link_3, row.picture_link_4].map((entry) => asTrimmed(entry));
    const hasAnyPicture = links.some(Boolean);
    const bucket = pictureFeatureMap.get(featureLabel) ?? { configured: 0, missing: 0, total: 0 };
    bucket.total += 1;
    if (hasAnyPicture) bucket.configured += 1;
    else bucket.missing += 1;
    pictureFeatureMap.set(featureLabel, bucket);
  }

  const pictureFeatures: DashboardPictureFeature[] = [...pictureFeatureMap.entries()]
    .map(([featureLabel, value]) => ({
      featureLabel,
      configured: value.configured,
      missing: value.missing,
      total: value.total,
      completionPct: value.total ? (value.configured / value.total) * 100 : 0,
    }))
    .sort((a, b) => b.missing - a.missing || a.featureLabel.localeCompare(b.featureLabel));

  const territoriesCovered = countries.filter((countryCode) => {
    const coverage = coverageByCountry.get(countryCode);
    return (coverage?.activeBikeTypes ?? 0) + (coverage?.inactiveBikeTypes ?? 0) > 0;
  }).length;
  const bikeTypesCovered = bikeTypes.filter((bikeType) => coverageRows.some((row) => row.bikeType === bikeType && row.totalCount > 0)).length;
  const territoriesWithGaps = countries.filter((countryCode) => {
    const coverage = coverageByCountry.get(countryCode);
    return (coverage?.activeBikeTypes ?? 0) < bikeTypes.length;
  }).length;

  const pictureTotals = pictureFeatures.reduce(
    (acc, item) => {
      acc.configured += item.configured;
      acc.missing += item.missing;
      acc.total += item.total;
      return acc;
    },
    { configured: 0, missing: 0, total: 0 },
  );

  const kpi: DashboardKpi = {
    activeConfigurations: totalActiveConfigurations,
    inactiveConfigurations: totalInactiveConfigurations,
    territoriesCovered,
    bikeTypesCovered,
    territoriesWithGaps,
    featuresMissingPictures: pictureFeatures.filter((feature) => feature.missing > 0).length,
    pictureCoveragePct: pictureTotals.total ? (pictureTotals.configured / pictureTotals.total) * 100 : 0,
  };

  const gaps: DashboardGapItem[] = [];
  const bottomCountries = countries
    .map((countryCode) => {
      const coverage = coverageByCountry.get(countryCode) ?? { activeBikeTypes: 0, inactiveBikeTypes: 0, readiness: 0, totalPairs: 0 };
      return { countryCode, ...coverage };
    })
    .sort((a, b) => a.readiness - b.readiness)
    .slice(0, 5);
  for (const row of bottomCountries) {
    gaps.push({
      label: `${row.countryCode} readiness`,
      value: Math.round(row.readiness * 100),
      hint: `${row.activeBikeTypes}/${bikeTypes.length} bike types active`,
      href: `/sales/bike-allocation?country_code=${encodeURIComponent(row.countryCode)}`,
    });
  }

  const weakestBikeTypes = bikeTypes
    .map((bikeType) => {
      const rows = coverageRows.filter((row) => row.bikeType === bikeType);
      const missingCount = rows.filter((row) => row.totalCount === 0).length;
      return { bikeType, missingCount };
    })
    .sort((a, b) => b.missingCount - a.missingCount)
    .slice(0, 3);
  for (const row of weakestBikeTypes) {
    gaps.push({
      label: `${row.bikeType} territory gaps`,
      value: row.missingCount,
      hint: `${row.missingCount} countries without any configuration`,
      href: `/sales/bike-allocation?bike_type=${encodeURIComponent(row.bikeType)}`,
    });
  }

  const topMissingFeatures = pictureFeatures.filter((feature) => feature.missing > 0).slice(0, 3);
  for (const feature of topMissingFeatures) {
    gaps.push({
      label: `${feature.featureLabel} missing pictures`,
      value: feature.missing,
      hint: `${feature.configured}/${feature.total} configured`,
      href: `/cpq/setup?tab=pictures&feature=${encodeURIComponent(feature.featureLabel)}&onlyMissingPicture=true`,
    });
  }

  const territoriesMissingCoverage = countries
    .map((countryCode) => {
      const rows = coverageRows.filter((row) => row.countryCode === countryCode);
      const missing = rows.filter((row) => row.totalCount === 0).length;
      return { label: `${countryCode} · ${resolveCountryName(countryCode)}`, metricValue: missing, href: `/sales/bike-allocation?country_code=${encodeURIComponent(countryCode)}` };
    })
    .sort((a, b) => b.metricValue - a.metricValue)
    .slice(0, 10)
    .map((item, index) => ({ rank: index + 1, label: item.label, metricLabel: 'Missing bike types', metricValue: item.metricValue, href: item.href }));

  const bikeTypesWeakCoverage = bikeTypes
    .map((bikeType) => {
      const rows = coverageRows.filter((row) => row.bikeType === bikeType);
      const activeTerritories = rows.filter((row) => row.activeCount > 0).length;
      const weak = countries.length - activeTerritories;
      return { bikeType, weak };
    })
    .sort((a, b) => b.weak - a.weak)
    .slice(0, 10)
    .map((item, index) => ({
      rank: index + 1,
      label: item.bikeType,
      metricLabel: 'Territories without active coverage',
      metricValue: item.weak,
      href: `/sales/bike-allocation?bike_type=${encodeURIComponent(item.bikeType)}`,
    }));

  const featuresMissingPictures = pictureFeatures
    .slice(0, 10)
    .map((item, index) => ({
      rank: index + 1,
      label: item.featureLabel,
      metricLabel: 'Missing picture links',
      metricValue: item.missing,
      href: `/cpq/setup?tab=pictures&feature=${encodeURIComponent(item.featureLabel)}&onlyMissingPicture=true`,
    }));

  const inactiveHeavyCombos = coverageRows
    .filter((row) => row.totalCount > 0)
    .map((row) => ({
      label: `${row.countryCode} · ${row.bikeType}`,
      inactiveShare: row.totalCount ? row.inactiveCount / row.totalCount : 0,
      inactiveCount: row.inactiveCount,
      href: `/sales/bike-allocation?country_code=${encodeURIComponent(row.countryCode)}&bike_type=${encodeURIComponent(row.bikeType)}`,
    }))
    .sort((a, b) => b.inactiveShare - a.inactiveShare || b.inactiveCount - a.inactiveCount)
    .slice(0, 10)
    .map((item, index) => ({
      rank: index + 1,
      label: item.label,
      metricLabel: 'Inactive ratio %',
      metricValue: Math.round(item.inactiveShare * 100),
      href: item.href,
    }));

  const totalConfigurations = totalActiveConfigurations + totalInactiveConfigurations;
  const extras = {
    activeSharePct: totalConfigurations ? (totalActiveConfigurations / totalConfigurations) * 100 : 0,
    inactiveSharePct: totalConfigurations ? (totalInactiveConfigurations / totalConfigurations) * 100 : 0,
    rulesetsByBikeType: [...rulesetsByBikeTypeCounter.entries()]
      .map(([bikeType, set]) => ({ bikeType, rulesetCount: set.size }))
      .sort((a, b) => b.rulesetCount - a.rulesetCount || a.bikeType.localeCompare(b.bikeType)),
  };

  return {
    generatedAt: new Date().toISOString(),
    kpi,
    bikeTypes,
    countries,
    territoryPoints,
    coverageRows,
    pictureFeatures,
    gaps,
    leaderboards: {
      territoriesMissingCoverage,
      bikeTypesWeakCoverage,
      featuresMissingPictures,
      inactiveHeavyCombos,
    },
    extras,
    notes: {
      heatmapLogic:
        'Cell health uses country+bike-type aggregate: none (no rows), weak (rows exist but all inactive), mixed (both active and inactive), strong (all active). Scores: 0 / 0.35 / 0.65 / 1.0.',
      bikeTypeMappingSource: 'CPQ_setup_ruleset.cpq_ruleset -> CPQ_setup_ruleset.bike_type',
      pictureCompletenessLogic:
        'A picture-management row is configured when any of picture_link_1..4 contains a non-empty value. Missing means all four links are blank.',
    },
  };
}
