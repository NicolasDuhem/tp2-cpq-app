export type QPartStatus = 'active' | 'inactive' | 'draft';

export type QPartHierarchyNode = {
  id: number;
  level: number;
  code: string;
  label_en: string;
  parent_id: number | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  parent_path?: string;
};

export type QPartMetadataDefinition = {
  id: number;
  key: string;
  label_en: string;
  field_type: 'text' | 'long_text' | 'number' | 'boolean' | 'date' | 'single_select' | 'multi_select';
  is_translatable: boolean;
  is_required: boolean;
  is_active: boolean;
  display_order: number;
  validation_json: Record<string, unknown>;
  options_json: Array<{ value: string; label?: string }>;
  created_at?: string;
  updated_at?: string;
};

export type QPartRecord = {
  id: number;
  part_number: string;
  status: QPartStatus;
  default_name: string;
  default_description: string | null;
  hierarchy_node_id: number | null;
  hierarchy_path: string | null;
  bike_types: string[];
  compatibility_count: number;
  created_at?: string;
  updated_at?: string;
};

export type QPartTranslation = {
  locale: string;
  name: string | null;
  description: string | null;
};

export type QPartMetadataValue = {
  metadata_definition_id: number;
  locale: string;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_date: string | null;
  value_json: unknown;
};

export type QPartCompatibilityRule = {
  bike_type: string;
  feature_label: string;
  option_value: string;
  option_label: string | null;
  source: 'derived' | 'reference' | 'manual';
  is_active: boolean;
};

export type QPartPartDetail = {
  part: QPartRecord;
  translations: QPartTranslation[];
  metadata_values: QPartMetadataValue[];
  bike_types: string[];
  compatibility_rules: QPartCompatibilityRule[];
};

export type QPartCompatibilityCandidate = {
  bike_type: string;
  feature_label: string;
  option_value: string;
  option_label: string | null;
  source: 'derived' | 'reference';
};
