export type DataPoint = {
  label: string;
  componentType: string;
  behavior: string;
  source: string;
  target?: string;
  process?: string;
  readOnly: boolean;
  dynamic: boolean;
  derived?: boolean;
  dependencies?: string;
};

export type PageContract = {
  pageName: string;
  route: string;
  purpose: string;
  access: string;
  featureFlags?: string[];
  dataPoints: DataPoint[];
};

export const PAGE_DATA_CONTRACTS: PageContract[] = [
  {
    pageName: 'Dashboard',
    route: '/dashboard',
    purpose: 'Operational KPI + territory and bike-type health monitoring with drill-down links.',
    access: 'Visible to all users (no server-side RBAC).',
    dataPoints: [
      { label: 'KPI cards', componentType: 'cards', behavior: 'Displays total rows, active %, coverage counts.', source: 'lib/dashboard/service.ts aggregates CPQ_sampler_result + cpq_country_mappings + CPQ_setup_ruleset', readOnly: true, dynamic: true, derived: true },
      { label: 'Country coverage map', componentType: 'heatmap/table', behavior: 'Shows active/inactive/not-configured by country.', source: 'dashboard service grouped aggregation from sampler rows by country_code with territory metadata.', readOnly: true, dynamic: true, derived: true, dependencies: 'country mappings exist' },
      { label: 'Drill-down links', componentType: 'link', behavior: 'Navigate to sales/setup with prefilled query params.', source: 'rendered by dashboard-page.tsx', target: '/sales/bike-allocation?country_code=... | /cpq/setup?...', process: 'Operator opens detail flow from KPI anomaly.', readOnly: true, dynamic: true },
    ],
  },
  {
    pageName: 'CPQ - Bike Builder',
    route: '/cpq',
    purpose: 'Run init/configure/finalize lifecycle, save canonical references, replay from sales.',
    access: 'Visible to all; admin mode reveals extra debug sections.',
    featureFlags: ['NEXT_PUBLIC_CPQ_DEBUG', 'CPQ_USE_MOCK'],
    dataPoints: [
      { label: 'Account code selector', componentType: 'dropdown', behavior: 'Selects account context and triggers init.', source: 'CPQ_setup_account_context via /api/cpq/setup/account-context', target: 'POST /api/cpq/init context.accountCode', process: 'Start session in selected account context.', readOnly: false, dynamic: true },
      { label: 'Ruleset selector', componentType: 'dropdown', behavior: 'Selects ruleset and re-inits session.', source: 'CPQ_setup_ruleset via /api/cpq/setup/rulesets', target: 'POST /api/cpq/init ruleset', process: 'Switch model/ruleset context.', readOnly: false, dynamic: true },
      { label: 'Feature option controls', componentType: 'dropdown/radios', behavior: 'Captures feature choices and sends configure calls.', source: 'response.parsed.features/options from /api/cpq/init|configure', target: 'POST /api/cpq/configure', process: 'Updates CPQ session state.', readOnly: false, dynamic: true, dependencies: 'sessionId, selected feature' },
      { label: 'Save configuration', componentType: 'button', behavior: 'Finalizes then upserts canonical reference + sampler support row.', source: 'current active session and configure snapshot', target: 'cpq_configuration_references + CPQ_sampler_result', process: 'POST /api/cpq/finalize -> /api/cpq/configuration-references -> /api/cpq/sampler-result', readOnly: false, dynamic: true, derived: true },
      { label: 'Retrieve by reference', componentType: 'input + button', behavior: 'Loads canonical row and starts a new CPQ session with replayed options.', source: 'cpq_configuration_references via /api/cpq/retrieve-configuration', target: 'Active in-memory CPQ session state', process: 'Used for support replay / sales launch.', readOnly: false, dynamic: true },
      { label: 'Layered image preview', componentType: 'image stack', behavior: 'Shows composed picture layers for selected options.', source: 'cpq_image_management via /api/cpq/image-layers', readOnly: true, dynamic: true, derived: true },
    ],
  },
  {
    pageName: 'CPQ - Setup',
    route: '/cpq/setup',
    purpose: 'Manage account context, rulesets, country mappings, and image management metadata.',
    access: 'Visible to all (operationally admin function).',
    dataPoints: [
      { label: 'Account context table/form', componentType: 'table + form', behavior: 'CRUD account rows (language, currency, account code).', source: 'CPQ_setup_account_context', target: 'POST/PUT/DELETE /api/cpq/setup/account-context*', process: 'Master-data maintenance.', readOnly: false, dynamic: true },
      { label: 'Ruleset table/form', componentType: 'table + form', behavior: 'CRUD ruleset and bike_type mapping.', source: 'CPQ_setup_ruleset', target: 'POST/PUT/DELETE /api/cpq/setup/rulesets*', process: 'Defines CPQ model availability.', readOnly: false, dynamic: true },
      { label: 'Country mapping table', componentType: 'table + form', behavior: 'CRUD country code + territory enablement.', source: 'cpq_country_mappings', target: 'POST/PUT/DELETE /api/cpq/setup/country-mappings*', process: 'Territory availability + dashboard/sales scope.', readOnly: false, dynamic: true },
      { label: 'Picture management grid', componentType: 'table', behavior: 'Edit layer order and image URLs by option.', source: 'cpq_image_management', target: 'PUT /api/cpq/setup/picture-management/[id]', process: 'Controls preview composition.', readOnly: false, dynamic: true },
      { label: 'Ignored features / feature flags', componentType: 'list + toggle', behavior: 'Mark feature labels ignored during configure and set feature-level layer order.', source: 'cpq_image_management feature-level aggregate', target: 'PUT /api/cpq/setup/picture-management/feature-flags', process: 'Affects configure replay and image ordering.', readOnly: false, dynamic: true, derived: true },
    ],
  },
  {
    pageName: 'Sales - bike allocation',
    route: '/sales/bike-allocation',
    purpose: 'Matrix of bike x country activity state with bulk/toggle/push and CPQ launch replay.',
    access: 'Visible to all users.',
    dataPoints: [
      { label: 'Ruleset/country/bike-type filters', componentType: 'list filters', behavior: 'Narrows matrix rows and columns.', source: 'URL query params + server loader options from setup tables/sampler', target: 'server-side filtered query in sales service', process: 'Focused operations by territory or bike family.', readOnly: false, dynamic: true },
      { label: 'Matrix status cell', componentType: 'table cell/pill', behavior: 'Shows Active/Inactive/Not configured.', source: 'CPQ_sampler_result.active; no row => Not configured', target: 'toggle API writes active true/false', process: 'POST /api/sales/bike-allocation/toggle', readOnly: false, dynamic: true, derived: true },
      { label: 'Bulk update controls', componentType: 'multi-select + action', behavior: 'Bulk set status across selected rows/countries.', source: 'current matrix selection', target: 'POST /api/sales/bike-allocation/bulk-update', process: 'Mass status operation.', readOnly: false, dynamic: true },
      { label: 'Launch CPQ action', componentType: 'button/link', behavior: 'Resolves launch context and replay payload then opens /cpq.', source: 'launch-context API resolves account + selectedOptions from sampler json_result', target: 'sessionStorage replay payload consumed by /cpq', process: 'Not configured/on-demand correction workflow.', readOnly: false, dynamic: true, derived: true },
      { label: 'External Push', componentType: 'button', behavior: 'Upserts one row-country record into external postgres.', source: 'selected matrix cell payload', target: 'external pg cpq_sampler_result via /api/sales/bike-allocation/push', process: 'Downstream synchronization.', readOnly: false, dynamic: true },
    ],
  },
  {
    pageName: 'Sales - QPart allocation',
    route: '/sales/qpart-allocation',
    purpose: 'Matrix of spare part x country active/inactive allocation with external push.',
    access: 'Visible to all users.',
    dataPoints: [
      { label: 'Part/country matrix', componentType: 'table', behavior: 'Shows active/inactive only; no not-configured state.', source: 'qpart_country_allocation joined with qpart_parts + active cpq_country_mappings', target: 'toggle/bulk APIs write qpart_country_allocation.active', process: 'Territory publishing control.', readOnly: false, dynamic: true },
      { label: 'Bulk action controls', componentType: 'toolbar action', behavior: 'Set statuses over selected part-country cells.', source: 'client selection state', target: 'POST /api/sales/qpart-allocation/bulk-update', process: 'Mass edit.', readOnly: false, dynamic: true },
      { label: 'External Push', componentType: 'button', behavior: 'Pushes qpart row-country to external postgres.', source: 'cell payload (namespace/ipn/country/status)', target: '/api/sales/qpart-allocation/push -> external pg', process: 'Downstream replication.', readOnly: false, dynamic: true },
    ],
  },
  {
    pageName: 'QPart pages',
    route: '/qpart/*',
    purpose: 'Spare parts PIM: parts CRUD, metadata, hierarchy, compatibility, translation, CSV.',
    access: 'Visible to all users; admin sequence utility under /qpart/admin/sequences.',
    dataPoints: [
      { label: 'Parts table + filters', componentType: 'table + search/filter', behavior: 'Lists parts by part_number, title, hierarchy, status.', source: 'qpart_parts + qpart_part_translations + hierarchy joins', target: 'row click to /qpart/parts/[id]', process: 'Part maintenance entrypoint.', readOnly: true, dynamic: true },
      { label: 'Part form fields', componentType: 'inputs/textarea/checkboxes/select', behavior: 'Create/edit core part attributes and metadata values.', source: 'form state + metadata definitions', target: '/api/qpart/parts write to qpart_parts/qpart_part_metadata_values/translations', process: 'Core PIM authoring.', readOnly: false, dynamic: true },
      { label: 'AI translate actions', componentType: 'button per field', behavior: 'Fill missing locale values from base text.', source: 'OPENAI + locales from CPQ_setup_account_context.language', target: 'client form translations then save to qpart_part_translations', process: 'POST /api/qpart/translations/field', readOnly: false, dynamic: true, derived: true },
      { label: 'Compatibility selectors', componentType: 'multi-select dependent pickers', behavior: 'Choose bike types then compatible feature/options.', source: 'bike types from CPQ_setup_ruleset, derived options from CPQ_sampler_result json_result + qpart_compatibility_reference_values', target: 'qpart_part_compatibility', process: 'Compatibility persistence.', readOnly: false, dynamic: true, dependencies: 'selected bike type' },
      { label: 'CSV export/import', componentType: 'buttons/upload', behavior: 'Export flat CSV and import with dry-run/apply.', source: 'qpart services flatten normalized tables', target: 'upsert by part_number across normalized qpart tables', process: '/api/qpart/parts/export + /api/qpart/parts/import', readOnly: false, dynamic: true },
    ],
  },
];
