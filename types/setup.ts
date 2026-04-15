export type CpqAccountContextRecord = {
  id: number;
  account_code: string;
  customer_id: string;
  currency: string;
  language: string;
  country_code: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type CpqRulesetRecord = {
  id: number;
  cpq_ruleset: string;
  description: string | null;
  bike_type: string | null;
  namespace: string;
  header_id: string;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

export type CpqImageManagementRecord = {
  id: number;
  feature_label: string;
  option_label: string;
  option_value: string;
  ignore_during_configure: boolean;
  picture_link_1: string | null;
  picture_link_2: string | null;
  picture_link_3: string | null;
  picture_link_4: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type CpqImageSelectionLookup = {
  featureLabel: string;
  optionLabel: string;
  optionValue: string;
};

export type CpqResolvedImageLayer = {
  featureLabel: string;
  optionLabel: string;
  optionValue: string;
  slot: 1 | 2 | 3 | 4;
  pictureLink: string;
};

export type CpqImageLayerResolution = {
  layers: CpqResolvedImageLayer[];
  matchedSelections: CpqImageSelectionLookup[];
  unmatchedSelections: CpqImageSelectionLookup[];
};
