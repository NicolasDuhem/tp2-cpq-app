import { BikeBuilderFeature, BikeBuilderFeatureOption, CpqApiEnvelope, NormalizedBikeBuilderState } from '@/types/cpq';

const asArray = (value: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
};

const asString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
const asBoolean = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined);

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
  return undefined;
};

const pick = (obj: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const key of keys) {
    if (key in obj) return obj[key];
  }
  return undefined;
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;

const normalizeText = (value: string | undefined): string | undefined => value?.trim().toLowerCase();

const flattenRecords = (value: unknown, matches: (key: string) => boolean): Record<string, unknown>[] => {
  const results: Record<string, unknown>[] = [];
  const queue: unknown[] = [value];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    const record = asRecord(current);
    if (!record) continue;

    for (const [key, child] of Object.entries(record)) {
      if (matches(key) && Array.isArray(child)) {
        results.push(...asArray(child));
      }
      queue.push(child);
    }
  }

  return results;
};

const toCustomProperties = (value: unknown): Record<string, string> => {
  const record = asRecord(value);
  if (!record) return {};

  return Object.entries(record).reduce<Record<string, string>>((acc, [key, val]) => {
    if (typeof val === 'string') acc[key] = val;
    else if (typeof val === 'number' || typeof val === 'boolean') acc[key] = String(val);
    return acc;
  }, {});
};

const findSessionId = (root: Record<string, unknown>): { value?: string; field?: string } => {
  const directCandidates: Array<[string, unknown]> = [
    ['SessionId', pick(root, 'SessionId', 'sessionId')],
    ['ConfigurationSessionId', pick(root, 'ConfigurationSessionId', 'configurationSessionId')],
  ];

  for (const [field, value] of directCandidates) {
    const cast = asString(value);
    if (cast) return { value: cast, field };
  }

  const queue: Array<{ path: string; value: unknown }> = [{ path: 'root', value: root }];
  const preferredKeys = new Set(['sessionid', 'configurationsessionid']);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    if (Array.isArray(current.value)) {
      current.value.forEach((child, idx) => queue.push({ path: `${current.path}[${idx}]`, value: child }));
      continue;
    }

    const record = asRecord(current.value);
    if (!record) continue;

    for (const [key, val] of Object.entries(record)) {
      const keyNormalized = key.toLowerCase();
      if (preferredKeys.has(keyNormalized)) {
        const cast = asString(val);
        if (cast) return { value: cast, field: `${current.path}.${key}` };
      }
      queue.push({ path: `${current.path}.${key}`, value: val });
    }
  }

  return {};
};

const findDetailId = (root: Record<string, unknown>): { value?: string; field?: string } => {
  const directCandidates: Array<[string, unknown]> = [
    ['DetailId', pick(root, 'DetailId', 'detailId')],
    ['ConfigurationId', pick(root, 'ConfigurationId', 'configurationId')],
  ];

  for (const [field, value] of directCandidates) {
    const cast = asString(value);
    if (cast) return { value: cast, field };
  }

  const queue: Array<{ path: string; value: unknown }> = [{ path: 'root', value: root }];
  const preferredKeys = new Set(['detailid', 'configurationid']);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    if (Array.isArray(current.value)) {
      current.value.forEach((child, idx) => queue.push({ path: `${current.path}[${idx}]`, value: child }));
      continue;
    }

    const record = asRecord(current.value);
    if (!record) continue;

    const caption = asString(pick(record, 'Caption', 'caption'));
    if (caption && caption.trim().toLowerCase() === 'detailid') {
      const captionValue = asString(pick(record, 'Value', 'value'));
      if (captionValue) {
        return { value: captionValue, field: `${current.path}.Caption/Value` };
      }
    }

    for (const [key, val] of Object.entries(record)) {
      const keyNormalized = key.toLowerCase();
      if (preferredKeys.has(keyNormalized)) {
        const cast = asString(val);
        if (cast) return { value: cast, field: `${current.path}.${key}` };
      }
      queue.push({ path: `${current.path}.${key}`, value: val });
    }
  }

  return {};
};

const findHeaderId = (root: Record<string, unknown>): { value?: string; field?: string } => {
  const directCandidates: Array<[string, unknown]> = [
    ['HeaderId', pick(root, 'HeaderId', 'headerId')],
    ['SourceHeaderId', pick(root, 'SourceHeaderId', 'sourceHeaderId')],
  ];

  for (const [field, value] of directCandidates) {
    const cast = asString(value);
    if (cast) return { value: cast, field };
  }

  const queue: Array<{ path: string; value: unknown }> = [{ path: 'root', value: root }];
  const preferredKeys = new Set(['headerid', 'sourceheaderid']);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    if (Array.isArray(current.value)) {
      current.value.forEach((child, idx) => queue.push({ path: `${current.path}[${idx}]`, value: child }));
      continue;
    }
    const record = asRecord(current.value);
    if (!record) continue;

    for (const [key, val] of Object.entries(record)) {
      if (preferredKeys.has(key.toLowerCase())) {
        const cast = asString(val);
        if (cast) return { value: cast, field: `${current.path}.${key}` };
      }
      queue.push({ path: `${current.path}.${key}`, value: val });
    }
  }

  return {};
};

const findSourceDetailId = (root: Record<string, unknown>): { value?: string; field?: string } => {
  const directCandidates: Array<[string, unknown]> = [['SourceDetailId', pick(root, 'SourceDetailId', 'sourceDetailId')]];

  for (const [field, value] of directCandidates) {
    const cast = asString(value);
    if (cast) return { value: cast, field };
  }

  const queue: Array<{ path: string; value: unknown }> = [{ path: 'root', value: root }];
  const preferredKeys = new Set(['sourcedetailid']);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    if (Array.isArray(current.value)) {
      current.value.forEach((child, idx) => queue.push({ path: `${current.path}[${idx}]`, value: child }));
      continue;
    }
    const record = asRecord(current.value);
    if (!record) continue;

    for (const [key, val] of Object.entries(record)) {
      if (preferredKeys.has(key.toLowerCase())) {
        const cast = asString(val);
        if (cast) return { value: cast, field: `${current.path}.${key}` };
      }
      queue.push({ path: `${current.path}.${key}`, value: val });
    }
  }

  return {};
};

const findConfigurationReference = (root: Record<string, unknown>): { value?: string; field?: string } => {
  const directCandidates: Array<[string, unknown]> = [
    ['ConfigurationReference', pick(root, 'ConfigurationReference', 'configurationReference')],
    ['ConfigurationRef', pick(root, 'ConfigurationRef', 'configurationRef')],
    ['Barcode', pick(root, 'Barcode', 'barcode')],
    ['ConsumerConfigurationReference', pick(root, 'ConsumerConfigurationReference', 'consumerConfigurationReference')],
  ];

  for (const [field, value] of directCandidates) {
    const cast = asString(value);
    if (cast) return { value: cast, field };
  }

  const queue: Array<{ path: string; value: unknown }> = [{ path: 'root', value: root }];
  const preferredKeys = new Set([
    'configurationreference',
    'configurationref',
    'consumerconfigurationreference',
    'barcode',
  ]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    if (Array.isArray(current.value)) {
      current.value.forEach((child, idx) => queue.push({ path: `${current.path}[${idx}]`, value: child }));
      continue;
    }
    const record = asRecord(current.value);
    if (!record) continue;
    for (const [key, val] of Object.entries(record)) {
      if (preferredKeys.has(key.toLowerCase())) {
        const cast = asString(val);
        if (cast) return { value: cast, field: `${current.path}.${key}` };
      }
      queue.push({ path: `${current.path}.${key}`, value: val });
    }
  }

  return {};
};

type CandidateFeature = BikeBuilderFeature & {
  stableFeatureKey: string;
  traversalIndex: number;
};

type IpnExtractionResult = {
  ipnCode?: string;
  source?: string;
  snippet?: unknown;
};

const optionFromSelectable = (selectable: Record<string, unknown>): BikeBuilderFeatureOption => {
  const customProperties = toCustomProperties(pick(selectable, 'CustomProperties', 'customProperties'));

  return {
    optionId:
      customProperties.OptionID ?? asString(pick(selectable, 'OptionID', 'optionId', 'Value', 'value', 'Id', 'ID')) ?? 'unknown-option',
    label: asString(pick(selectable, 'Caption', 'caption', 'Name', 'name', 'Value', 'value')) ?? 'Unknown option',
    value: asString(pick(selectable, 'Value', 'value')),
    isSelectable: asBoolean(pick(selectable, 'IsEnabled', 'isEnabled')) ?? true,
    isVisible: asBoolean(pick(selectable, 'IsVisible', 'isVisible')) ?? true,
    isEnabled: asBoolean(pick(selectable, 'IsEnabled', 'isEnabled')) ?? true,
    metadata: {
      FeatureID: customProperties.FeatureID,
      FeatureQuestion: customProperties.FeatureQuestion,
      FeatureSequence: asNumber(customProperties.FeatureSequence),
      LongDescription: customProperties.LongDescription,
      IPNCode: customProperties.IPNCode,
      MSRP: customProperties.MSRP,
      Price: customProperties.Price,
      PriceOption: customProperties.PriceOption,
      UnitWeight: customProperties.UnitWeight,
      ForecastAs: customProperties.ForecastAs,
      ShortDescription: customProperties.ShortDescription,
      OptionID: customProperties.OptionID,
    },
  };
};

const buildFeatureCandidate = (screenOption: Record<string, unknown>, traversalIndex: number): CandidateFeature => {
  const selectableValues = asArray(pick(screenOption, 'SelectableValues', 'selectableValues', 'Values', 'values'));
  const currentValue = asString(pick(screenOption, 'CurrentValue', 'currentValue', 'SelectedValue', 'selectedValue', 'Value', 'value'));
  const screenCustomProps = toCustomProperties(pick(screenOption, 'CustomProperties', 'customProperties'));
  const options = selectableValues.map(optionFromSelectable);

  const exactMatchByValue = options.find((option) => option.value !== undefined && option.value === currentValue);
  const exactMatchByNormalizedValue = options.find(
    (option) => normalizeText(option.value) && normalizeText(option.value) === normalizeText(currentValue),
  );
  const exactMatch = exactMatchByValue ?? exactMatchByNormalizedValue;
  const fallbackOption = options.find((option) => option.isVisible !== false && option.isEnabled !== false);
  const selected = exactMatch ?? fallbackOption;
  const selectedMatchSource = exactMatchByValue
    ? 'screenOption.value === option.value'
    : exactMatchByNormalizedValue
      ? 'normalized screenOption.value === option.value'
      : fallbackOption
        ? 'fallback:first-visible-enabled'
        : 'none';
  const selectedOptionId = selected?.optionId;
  const selectedOptions = options.map((option) => ({ ...option, selected: Boolean(selectedOptionId && option.optionId === selectedOptionId) }));

  const firstMetadata = selectedOptions.find((opt) => opt.metadata)?.metadata;
  const featureId = screenCustomProps.FeatureID ?? firstMetadata?.FeatureID ?? asString(pick(screenOption, 'ID', 'Id', 'id'));
  const featureName = asString(pick(screenOption, 'Name', 'name'));
  const stableFeatureKey = featureId ?? featureName ?? asString(pick(screenOption, 'ID', 'Id', 'id')) ?? `unknown-feature-${traversalIndex + 1}`;

  return {
    stableFeatureKey,
    traversalIndex,
    featureId: stableFeatureKey,
    featureName,
    featureLabel: asString(pick(screenOption, 'Caption', 'caption')) ?? featureName ?? 'Unknown feature',
    featureSequence: firstMetadata?.FeatureSequence,
    selectedOptionId,
    selectedValue: selected?.value,
    selectedMatchSource,
    currentValue,
    displayType: asString(pick(screenOption, 'DisplayType', 'displayType')),
    isVisible: asBoolean(pick(screenOption, 'IsVisible', 'isVisible')) ?? true,
    isEnabled: asBoolean(pick(screenOption, 'IsEnabled', 'isEnabled')) ?? true,
    availableOptions: selectedOptions,
  };
};

const findIpnCode = (root: Record<string, unknown>): IpnExtractionResult => {
  const directCandidates: Array<[string, unknown]> = [
    ['root.IPNCode', pick(root, 'IPNCode', 'ipnCode', 'IPN', 'ipn', 'ItemNumber', 'itemNumber')],
  ];

  for (const [source, value] of directCandidates) {
    const code = asString(value);
    if (code) return { ipnCode: code, source, snippet: { value: code } };
  }

  const queue: Array<{ path: string; value: unknown }> = [{ path: 'root', value: root }];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    if (Array.isArray(current.value)) {
      current.value.forEach((child, idx) => queue.push({ path: `${current.path}[${idx}]`, value: child }));
      continue;
    }

    const record = asRecord(current.value);
    if (!record) continue;

    const caption = asString(pick(record, 'Caption', 'caption', 'Name', 'name', 'Label', 'label'));
    const normalizedCaption = normalizeText(caption);
    const valueCandidate = asString(pick(record, 'Value', 'value', 'CurrentValue', 'currentValue', 'DisplayValue', 'displayValue'));
    if (normalizedCaption === 'ipn code' && valueCandidate) {
      return {
        ipnCode: valueCandidate,
        source: `${current.path}.${caption ? 'Caption=IPN Code' : 'name=IPN Code'}`,
        snippet: { Caption: caption, Value: valueCandidate, path: current.path },
      };
    }

    for (const [key, val] of Object.entries(record)) {
      const normalizedKey = key.toLowerCase();
      if ((normalizedKey === 'ipncode' || normalizedKey === 'ipn') && typeof val === 'string' && val.trim()) {
        return {
          ipnCode: val,
          source: `${current.path}.${key}`,
          snippet: { [key]: val, path: current.path },
        };
      }
      queue.push({ path: `${current.path}.${key}`, value: val });
    }
  }

  return {};
};

const scoreFeatureCandidate = (feature: CandidateFeature): [number, number, number] => {
  const visibleScore = feature.isVisible === false ? 0 : 1;
  const optionCount = feature.availableOptions.length;
  const firstSeenScore = -feature.traversalIndex;
  return [visibleScore, optionCount, firstSeenScore];
};

const dedupeFeatureCandidates = (candidates: CandidateFeature[]) => {
  const grouped = new Map<string, CandidateFeature[]>();

  candidates.forEach((candidate) => {
    const arr = grouped.get(candidate.stableFeatureKey) ?? [];
    arr.push(candidate);
    grouped.set(candidate.stableFeatureKey, arr);
  });

  const deduped: CandidateFeature[] = [];
  const hiddenOrSystem: CandidateFeature[] = [];

  for (const group of grouped.values()) {
    const selected = [...group].sort((a, b) => {
      const [aVisible, aOptions, aFirst] = scoreFeatureCandidate(a);
      const [bVisible, bOptions, bFirst] = scoreFeatureCandidate(b);
      if (aVisible !== bVisible) return bVisible - aVisible;
      if (aOptions !== bOptions) return bOptions - aOptions;
      return bFirst - aFirst;
    })[0];

    deduped.push(selected);
    group.forEach((candidate) => {
      if (candidate !== selected || candidate.isVisible === false) hiddenOrSystem.push(candidate);
    });
  }

  const sortBySequence = (a: CandidateFeature, b: CandidateFeature) => {
    if (a.featureSequence !== undefined && b.featureSequence !== undefined) return a.featureSequence - b.featureSequence;
    if (a.featureSequence !== undefined) return -1;
    if (b.featureSequence !== undefined) return 1;
    return a.traversalIndex - b.traversalIndex;
  };

  return {
    deduped: deduped.sort(sortBySequence),
    hiddenOrSystem: hiddenOrSystem.sort(sortBySequence),
  };
};

export const mapCpqToNormalizedState = (payload: CpqApiEnvelope, ruleset: string): NormalizedBikeBuilderState => {
  const root = payload as Record<string, unknown>;
  const pages = flattenRecords(root, (key) => key.toLowerCase() === 'pages');
  const screens = flattenRecords(root, (key) => key.toLowerCase() === 'screens');

  const screenOptionsFromScreens = screens.flatMap((screen) => asArray(pick(screen, 'ScreenOptions', 'screenOptions')));
  const screenOptionsFromPages = pages.flatMap((page) =>
    asArray(pick(page, 'Screens', 'screens')).flatMap((screen) => asArray(pick(screen, 'ScreenOptions', 'screenOptions'))),
  );

  const screenOptions =
    screenOptionsFromPages.length || screenOptionsFromScreens.length
      ? [...screenOptionsFromPages, ...screenOptionsFromScreens]
      : flattenRecords(root, (key) => key.toLowerCase() === 'screenoptions');

  const rawCandidates = screenOptions.map((screenOption, index) => buildFeatureCandidate(screenOption, index));
  const { deduped, hiddenOrSystem } = dedupeFeatureCandidates(rawCandidates);
  const visibleFeatures = deduped.filter((feature) => feature.isVisible !== false);
  const session = findSessionId(root);
  const detail = findDetailId(root);
  const header = findHeaderId(root);
  const sourceDetail = findSourceDetailId(root);
  const configurationReference = findConfigurationReference(root);
  const ipn = findIpnCode(root);

  return {
    sessionId: session.value ?? 'unknown-session',
    detailId: detail.value,
    sourceHeaderId: header.value,
    sourceDetailId: sourceDetail.value,
    configurationReference: configurationReference.value,
    ruleset,
    namespace: asString(pick(root, 'Namespace', 'namespace')),
    pages,
    screens,
    screenOptions,
    productDescription: asString(pick(root, 'productDescription', 'description', 'Description')),
    ipnCode: ipn.ipnCode ?? asString(pick(root, 'ipnCode', 'ipn', 'itemNumber', 'IPN')),
    configuredPrice: asNumber(pick(root, 'configuredPrice', 'price', 'netPrice', 'Price')),
    totalWeight: asNumber(pick(root, 'totalWeight', 'weight', 'Weight')),
    bikeImageUrl: asString(pick(root, 'bikeImageUrl', 'imageUrl', 'ImageUrl')),
    selectedOptionIds: visibleFeatures.map((feature) => feature.selectedOptionId).filter((id): id is string => Boolean(id)),
    features: visibleFeatures,
    hiddenOrSystemFeatures: hiddenOrSystem,
    debug: {
      sessionIdField: session.field,
      rawFeatureCount: rawCandidates.length,
      dedupedFeatureCount: deduped.length,
      visibleFeatureCount: visibleFeatures.length,
      hiddenFeatureCount: hiddenOrSystem.length,
      ipnCodeSource: ipn.source,
      ipnCodeSnippet: ipn.snippet,
    },
    raw: payload,
  };
};
