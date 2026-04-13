export type BikeBuilderContext = {
  accountCode: string;
  customerId?: string;
  currency?: string;
  language?: string;
  countryCode?: string;
};

export type BikeBuilderOptionMetadata = {
  FeatureID?: string;
  FeatureQuestion?: string;
  FeatureSequence?: number;
  LongDescription?: string;
  IPNCode?: string;
  MSRP?: string;
  Price?: string;
  PriceOption?: string;
  UnitWeight?: string;
  ForecastAs?: string;
  ShortDescription?: string;
  OptionID?: string;
};

export type BikeBuilderFeatureOption = {
  optionId: string;
  label: string;
  value?: string;
  isSelectable?: boolean;
  selected?: boolean;
  isVisible?: boolean;
  isEnabled?: boolean;
  metadata?: BikeBuilderOptionMetadata;
};

export type BikeBuilderFeature = {
  featureId: string;
  featureName?: string;
  featureLabel: string;
  featureSequence?: number;
  selectedOptionId?: string;
  selectedValue?: string;
  selectedMatchSource?: string;
  currentValue?: string;
  displayType?: string;
  isVisible?: boolean;
  isEnabled?: boolean;
  availableOptions: BikeBuilderFeatureOption[];
};

export type CpqParsingDebug = {
  sessionIdField?: string;
  rawFeatureCount: number;
  dedupedFeatureCount: number;
  visibleFeatureCount: number;
  hiddenFeatureCount: number;
  ipnCodeSource?: string;
  ipnCodeSnippet?: unknown;
};

export type NormalizedBikeBuilderState = {
  sessionId: string;
  detailId?: string;
  ruleset: string;
  pages: Record<string, unknown>[];
  screens: Record<string, unknown>[];
  screenOptions: Record<string, unknown>[];
  productDescription?: string;
  ipnCode?: string;
  configuredPrice?: number;
  totalWeight?: number;
  bikeImageUrl?: string;
  selectedOptionIds?: string[];
  features: BikeBuilderFeature[];
  hiddenOrSystemFeatures?: BikeBuilderFeature[];
  debug?: CpqParsingDebug;
  raw?: unknown;
};

export type InitConfiguratorRequest = {
  ruleset: string;
  namespace?: string;
  partName?: string;
  headerId?: string;
  detailId?: string;
  sourceHeaderId?: string;
  sourceDetailId?: string;
  profile?: string;
  instance?: string;
  context?: Partial<BikeBuilderContext>;
};

export type ConfigureConfiguratorRequest = {
  sessionId: string;
  featureId: string;
  optionValue?: string;
  optionId?: string;
  ruleset?: string;
  context?: Partial<BikeBuilderContext>;
};

export type CpqApiEnvelope = {
  [key: string]: unknown;
};

export type CpqClientConfig = {
  baseUrl: string;
  ionApiToken?: string;
  username?: string;
  password?: string;
  timeoutMs?: number;
};
