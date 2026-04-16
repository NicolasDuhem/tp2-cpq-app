'use client';

import { useMemo, useState } from 'react';
import { useAdminMode } from '@/components/shared/admin-mode-context';

type UiDocEntry = {
  page: string;
  section: string;
  subsection: string;
  label: string;
  purpose: string;
  codeSource: string;
  dataSource: string;
  notes: string;
};

const entries: UiDocEntry[] = [
  {
    page: 'Global navigation',
    section: 'Primary navigation',
    subsection: 'Top tabs',
    label: 'CPQ - Bike Builder',
    purpose: 'Main manual CPQ lifecycle page.',
    codeSource: 'components/shared/app-navigation.tsx',
    dataSource: 'Static links array.',
    notes: 'Route: /cpq',
  },
  {
    page: 'Global navigation',
    section: 'Primary navigation',
    subsection: 'Top tabs',
    label: 'CPQ - Setup',
    purpose: 'Opens setup/admin page for account, rulesets, and pictures.',
    codeSource: 'components/shared/app-navigation.tsx',
    dataSource: 'Static links array.',
    notes: 'Route: /cpq/setup',
  },
  {
    page: 'Global navigation',
    section: 'Primary navigation',
    subsection: 'Top tabs',
    label: 'CPQ - Sampler Results',
    purpose: 'Opens historical sampler matrix.',
    codeSource: 'components/shared/app-navigation.tsx',
    dataSource: 'Static links array.',
    notes: 'Route: /cpq/results',
  },
  {
    page: 'Global navigation',
    section: 'Primary navigation',
    subsection: 'Top tabs',
    label: 'CPQ - Process',
    purpose: 'Opens business SOP/instruction guide for setup and configuration workflows.',
    codeSource: 'components/shared/app-navigation.tsx',
    dataSource: 'Static links array.',
    notes: 'Route: /cpq/process',
  },
  {
    page: 'Global navigation',
    section: 'Primary navigation',
    subsection: 'Top tabs',
    label: 'CPQ - UI Docs',
    purpose: 'Internal page to map labels to code + data sources.',
    codeSource: 'components/shared/app-navigation.tsx',
    dataSource: 'Static links array.',
    notes: 'Route: /cpq/ui-docs',
  },
  {
    page: 'CPQ - Bike Builder',
    section: 'Layered Product Preview',
    subsection: 'Header',
    label: 'Layered Product Preview',
    purpose: 'Shows the composed product viewer for current CPQ selections.',
    codeSource: 'components/cpq/bike-builder-page.tsx',
    dataSource: 'POST /api/cpq/image-layers using current selected options derived from parsed CPQ state.',
    notes: 'Visual-only additive card; does not alter Start/Configure/Finalize/Save/Retrieve flows.',
  },
  {
    page: 'CPQ - Bike Builder',
    section: 'Layered Product Preview',
    subsection: 'Action',
    label: 'Download current preview',
    purpose: 'Exports the currently layered viewer as one PNG image.',
    codeSource: 'components/cpq/bike-builder-page.tsx',
    dataSource: 'Client-side canvas render of resolved layer URLs from image layer API response.',
    notes: 'User click only; no auto-download on config changes.',
  },
  {
    page: 'CPQ - Bike Builder',
    section: 'Layered Product Preview',
    subsection: 'Viewer state',
    label: 'No image layers available.',
    purpose: 'Empty state when no matching picture-management rows/links are found.',
    codeSource: 'components/cpq/bike-builder-page.tsx',
    dataSource: 'Resolved `layers.length === 0` from POST /api/cpq/image-layers.',
    notes: 'Presented inside fixed-size product-viewer area.',
  },
  {
    page: 'CPQ - Bike Builder',
    section: 'Layered Product Preview',
    subsection: 'Metadata chips',
    label: 'Layers / Matched mappings / Unmatched selections',
    purpose: 'Quickly communicates match quality for current configuration.',
    codeSource: 'components/cpq/bike-builder-page.tsx',
    dataSource: 'Counts from image layer resolution payload (`layers`, `matchedSelections`, `unmatchedSelections`).',
    notes: 'Read-only indicators.',
  },
  {
    page: 'CPQ - Bike Builder',
    section: 'Layered Product Preview',
    subsection: 'Details',
    label: 'Preview matching details',
    purpose: 'Small optional debug/trace panel for mapping and ordering transparency.',
    codeSource: 'components/cpq/bike-builder-page.tsx',
    dataSource: 'Lists matched selection triplets and current layer ordering rule.',
    notes: 'Order rule: current selected-option order, then picture_link_1..4 slot order.',
  },

  {
    page: 'Global navigation',
    section: 'Primary navigation',
    subsection: 'Admin mode controls',
    label: 'Open as admin',
    purpose: 'Prompts for internal admin password and enables admin mode visibility.',
    codeSource: 'components/shared/app-navigation.tsx',
    dataSource: 'Client-side password check (`Br0mpt0n`) + sessionStorage admin flag.',
    notes: 'UI visibility gate only (not enterprise authentication).',
  },
  {
    page: 'Global navigation',
    section: 'Primary navigation',
    subsection: 'Admin mode controls',
    label: 'Admin mode / Close admin mode',
    purpose: 'Shows active admin state and allows returning to standard mode.',
    codeSource: 'components/shared/app-navigation.tsx',
    dataSource: 'AdminMode context state from components/shared/admin-mode-context.tsx.',
    notes: 'In standard mode only Process/Bike Builder/Setup tabs are shown.',
  },
  {
    page: 'CPQ - Bike Builder',
    section: 'Manual lifecycle header',
    subsection: 'Compact control strip',
    label: 'Account code / Ruleset / primary actions',
    purpose: 'Compact top control area tuned for practical desktop usage.',
    codeSource: 'components/cpq/bike-builder-page.tsx',
    dataSource: 'Account contexts, rulesets, and existing lifecycle actions.',
    notes: 'Keeps existing flow actions while reducing vertical space use.',
  },
  {
    page: 'CPQ - Bike Builder',
    section: 'Main workspace',
    subsection: 'Two-column layout',
    label: 'Configurator (left) + Layered Product Preview (right)',
    purpose: 'Keeps selection workflow and visual preview visible together.',
    codeSource: 'components/cpq/bike-builder-page.tsx',
    dataSource: 'Configurator from normalized CPQ state + image layer API results.',
    notes: 'Configurator and combinations each use internal scroll containers as needed.',
  },
  {
    page: 'CPQ - Bike Builder',
    section: 'Manual lifecycle status',
    subsection: 'Admin-only technical details',
    label: 'Session / DetailId / IPN / Save-Retrieve-Bulk internals',
    purpose: 'Shows technical runtime diagnostics only for admin troubleshooting.',
    codeSource: 'components/cpq/bike-builder-page.tsx',
    dataSource: 'In-memory runtime state and CPQ API response trackers.',
    notes: 'Hidden in non-admin mode to keep business UI lighter.',
  },
  {
    page: 'CPQ - Bike Builder',
    section: 'Debug',
    subsection: 'Admin-only timeline',
    label: 'CPQ debug timeline',
    purpose: 'Displays recent CPQ request/response debug entries for diagnostics.',
    codeSource: 'components/cpq/bike-builder-page.tsx',
    dataSource: 'Local debugEntries collection (when NEXT_PUBLIC_CPQ_DEBUG=true).',
    notes: 'Timeline visibility additionally requires admin mode.',
  },

  {
    page: 'CPQ - Process',
    section: 'Process SOP',
    subsection: 'Section navigation',
    label: 'Overview / Step links',
    purpose: 'Allows users to jump quickly between SOP sections by role and step.',
    codeSource: 'components/docs/process-page.tsx',
    dataSource: 'Static anchor link definitions.',
    notes: 'Top anchor section linking to #overview, #step-0, #step-0-1, #step-1, #step-1-1, #notes, #roles.',
  },
  {
    page: 'CPQ - Process',
    section: 'Process SOP',
    subsection: 'Role-based guidance',
    label: 'Step 0 / Step 0.1 / Step 1 / Step 1.1',
    purpose: 'Documents operating flow for CPQ admin and Product team users in non-technical language.',
    codeSource: 'components/docs/process-page.tsx',
    dataSource: 'Static instructional content authored for business users.',
    notes: 'Read-only help content; no API calls and no runtime behavior changes.',
  },
  {
    page: 'CPQ Setup',
    section: 'Setup tabs',
    subsection: 'Section switcher',
    label: 'Account code management',
    purpose: 'Switch to account context section.',
    codeSource: 'components/setup/cpq-setup-page.tsx',
    dataSource: 'Local state: tab.',
    notes: 'Tab key: accounts',
  },
  {
    page: 'CPQ Setup',
    section: 'Setup tabs',
    subsection: 'Section switcher',
    label: 'Ruleset management',
    purpose: 'Switch to ruleset section.',
    codeSource: 'components/setup/cpq-setup-page.tsx',
    dataSource: 'Local state: tab.',
    notes: 'Tab key: rulesets',
  },
  {
    page: 'CPQ Setup',
    section: 'Setup tabs',
    subsection: 'Section switcher',
    label: 'Picture management',
    purpose: 'Switch to feature-tabbed picture manager.',
    codeSource: 'components/setup/cpq-setup-page.tsx',
    dataSource: 'Local state: tab.',
    notes: 'Tab key: pictures',
  },
  {
    page: 'CPQ Setup',
    section: 'Picture management',
    subsection: 'Feature-level behavior',
    label: 'Ignore during /configure',
    purpose: 'Marks an entire feature as skipped during bulk Configure all ticked items.',
    codeSource: 'components/setup/cpq-setup-page.tsx',
    dataSource: 'PUT /api/cpq/setup/picture-management/feature-flags -> cpq_image_management.ignore_during_configure.',
    notes: 'Feature-level toggle (not option-level); updates all rows under one feature label.',
  },
  {
    page: 'CPQ Setup',
    section: 'Picture management',
    subsection: 'Toolbar',
    label: 'Sync from sampler results',
    purpose: 'Seed/update image management rows from sampler data.',
    codeSource: 'components/setup/cpq-setup-page.tsx',
    dataSource: 'POST /api/cpq/setup/picture-management/sync -> lib/cpq/setup/service.ts syncImageManagementFromSampler.',
    notes: 'Preserves existing sync flow.',
  },
  {
    page: 'CPQ - Bike Builder',
    section: 'Generated combinations',
    subsection: 'Grid controls',
    label: 'Show selected only',
    purpose: 'Filters generated combinations to only rows where main Select is ticked.',
    codeSource: 'components/cpq/bike-builder-page.tsx',
    dataSource: 'Local state showSelectedRowsOnly over combinationDataset.rows[].selected.',
    notes: 'Toggle is client-side and reversible.',
  },
  {
    page: 'CPQ - Bike Builder',
    section: 'Generated combinations',
    subsection: 'Grid controls',
    label: 'Columns',
    purpose: 'Show/hide feature and country columns in the combinations grid.',
    codeSource: 'components/cpq/bike-builder-page.tsx',
    dataSource: 'Local hiddenFeatureColumnKeys + hiddenCountryColumns with dynamic account-context country list.',
    notes: 'Core operational columns (Select + Status) remain always visible.',
  },
  {
    page: 'CPQ - Bike Builder',
    section: 'Generated combinations',
    subsection: 'Country assignments',
    label: '<country_code>',
    purpose: 'Per-row country assignment checkboxes; one column per setup account context country.',
    codeSource: 'components/cpq/bike-builder-page.tsx',
    dataSource: 'Distinct country codes from GET /api/cpq/setup/account-context?activeOnly=true.',
    notes: 'Dynamic country columns are not hardcoded.',
  },
  {
    page: 'CPQ - Bike Builder',
    section: 'Generated combinations',
    subsection: 'Validation',
    label: 'Please select at least one valid country for each selected row (missing country).',
    purpose: 'Blocks bulk run when a selected row has no country assignment.',
    codeSource: 'components/cpq/bike-builder-page.tsx',
    dataSource: 'Local pre-run validation over combinationDataset.rows[].countries.',
    notes: 'Invalid rows are highlighted in red.',
  },
  {
    page: 'CPQ - Bike Builder',
    section: 'Generated combinations',
    subsection: 'Row status',
    label: 'failed · <stage> + Inspect failure',
    purpose: 'Makes bulk row failures visible and directly inspectable from the row.',
    codeSource: 'components/cpq/bike-builder-page.tsx',
    dataSource: 'Local row diagnostics state fed by per-row-country Bulk API requests/responses.',
    notes: 'Failure modal includes stage, country, execution key, summary, trace/session IDs, and last 2 requests/responses.',
  },
  {
    page: 'CPQ - Bike Builder',
    section: 'Generated combinations',
    subsection: 'Post-run view',
    label: 'Rows: <filtered> / <total>',
    purpose: 'Shows active filter result counts against full generated dataset after/before bulk execution.',
    codeSource: 'components/cpq/bike-builder-page.tsx',
    dataSource: 'filteredCombinationRows length over combinationDataset.rows length.',
    notes: 'Dataset remains intact; selected-only toggle narrows the visible set.',
  },
  {
    page: 'CPQ Setup',
    section: 'Picture management',
    subsection: 'Toolbar',
    label: 'Search feature, option, or value',
    purpose: 'Local filter over loaded picture rows.',
    codeSource: 'components/setup/cpq-setup-page.tsx',
    dataSource: 'Local state pictureSearch + computed visiblePictureRows.',
    notes: 'Searchable across feature_label, option_label, option_value.',
  },
  {
    page: 'CPQ Setup',
    section: 'Picture management',
    subsection: 'Toolbar',
    label: 'Missing all picture links only',
    purpose: 'Only display rows with 0/4 links.',
    codeSource: 'components/setup/cpq-setup-page.tsx',
    dataSource: 'Local state onlyMissingPicture + GET /api/cpq/setup/picture-management?onlyMissingPicture=true.',
    notes: 'Server filter preserved.',
  },
  {
    page: 'CPQ Setup',
    section: 'Picture management',
    subsection: 'Feature tabs',
    label: '<dynamic feature label>',
    purpose: 'Show rows for one feature only (e.g., Add Rack).',
    codeSource: 'components/setup/cpq-setup-page.tsx',
    dataSource: 'Computed from visiblePictureRows[].feature_label via featureTabs.',
    notes: 'Built dynamically; no hardcoded feature names.',
  },
  {
    page: 'CPQ Setup',
    section: 'Picture management',
    subsection: 'Summary block',
    label: 'Total items',
    purpose: 'Count of option/value tiles in selected feature.',
    codeSource: 'components/setup/cpq-setup-page.tsx',
    dataSource: 'Computed from featureRows.length.',
    notes: 'Feature scoped.',
  },
  {
    page: 'CPQ Setup',
    section: 'Picture management',
    subsection: 'Summary block',
    label: 'Missing pictures',
    purpose: 'Count with 0 links out of 4.',
    codeSource: 'components/setup/cpq-setup-page.tsx',
    dataSource: 'Computed using countPictureLinks(row) === 0.',
    notes: 'Matches requirement for missing definition.',
  },
  {
    page: 'CPQ Setup',
    section: 'Picture management',
    subsection: 'Summary block',
    label: 'With pictures',
    purpose: 'Count with at least one link.',
    codeSource: 'components/setup/cpq-setup-page.tsx',
    dataSource: 'Computed using countPictureLinks(row) > 0.',
    notes: 'Matches completion definition (has at least one).',
  },
  {
    page: 'CPQ Setup',
    section: 'Picture management',
    subsection: 'Summary block',
    label: 'Completion',
    purpose: 'Percentage of rows with at least one picture link.',
    codeSource: 'components/setup/cpq-setup-page.tsx',
    dataSource: 'Computed: withPictures / total * 100.',
    notes: 'One decimal place.',
  },
  {
    page: 'CPQ Setup',
    section: 'Picture management',
    subsection: 'Summary block',
    label: 'Fully complete (4/4)',
    purpose: 'Count rows where all 4 links are filled.',
    codeSource: 'components/setup/cpq-setup-page.tsx',
    dataSource: 'Computed using countPictureLinks(row) === 4.',
    notes: 'Optional metric kept compact.',
  },
  {
    page: 'CPQ Setup',
    section: 'Picture management',
    subsection: 'Tile',
    label: '<option label> / <option value>',
    purpose: 'Represents one unique option/value mapping record.',
    codeSource: 'components/setup/cpq-setup-page.tsx',
    dataSource: 'Rows from GET /api/cpq/setup/picture-management.',
    notes: 'Click tile to edit in modal.',
  },
  {
    page: 'CPQ Setup',
    section: 'Picture management',
    subsection: 'Tile',
    label: '0/4 pictures, 2/4 pictures, 4/4 pictures',
    purpose: 'Shows count of populated links.',
    codeSource: 'components/setup/cpq-setup-page.tsx',
    dataSource: 'Computed by countPictureLinks helper over picture_link_1..4.',
    notes: 'Visual status text is Ready/Missing.',
  },
  {
    page: 'CPQ Setup',
    section: 'Picture management',
    subsection: 'Tile status indicator',
    label: 'Status dot',
    purpose: 'Red for 0 links, green for 1+ links.',
    codeSource: 'components/setup/cpq-setup-page.tsx + app/globals.css',
    dataSource: 'Computed boolean hasPictures.',
    notes: 'Minimum required red/green behavior.',
  },
  {
    page: 'CPQ Setup',
    section: 'Picture management',
    subsection: 'Edit modal',
    label: 'Feature / Option / Value',
    purpose: 'Identifies current row being edited.',
    codeSource: 'components/setup/cpq-setup-page.tsx',
    dataSource: 'Selected row copied into local pictureDraft state.',
    notes: 'Read-only metadata inside modal.',
  },
  {
    page: 'CPQ Setup',
    section: 'Picture management',
    subsection: 'Edit modal',
    label: 'Picture link 1..4',
    purpose: 'Editable URL fields used by layer resolver.',
    codeSource: 'components/setup/cpq-setup-page.tsx',
    dataSource: 'pictureDraft local state; persisted via PUT /api/cpq/setup/picture-management/:id.',
    notes: 'Inputs support straightforward copy/paste.',
  },
  {
    page: 'CPQ Setup',
    section: 'Picture management',
    subsection: 'Edit modal',
    label: 'Active',
    purpose: 'Enable/disable mapping row.',
    codeSource: 'components/setup/cpq-setup-page.tsx',
    dataSource: 'pictureDraft.is_active; persisted in cpq_image_management.is_active.',
    notes: 'Preserved existing semantics.',
  },
  {
    page: 'CPQ Setup',
    section: 'Picture management',
    subsection: 'Edit modal',
    label: 'Save / Cancel',
    purpose: 'Persist changes or close without save.',
    codeSource: 'components/setup/cpq-setup-page.tsx',
    dataSource: 'savePictureRow uses existing update endpoint and service method updateImageManagementRow.',
    notes: 'Closes modal on successful save.',
  },
  {
    page: 'CPQ Setup',
    section: 'Picture management',
    subsection: 'Sync feedback',
    label: 'Scanned sampler rows / inserted / current total rows',
    purpose: 'Displays sync outcome metrics.',
    codeSource: 'components/setup/cpq-setup-page.tsx',
    dataSource: 'syncSummary returned by POST /api/cpq/setup/picture-management/sync.',
    notes: 'Errors shown in separate note block.',
  },
  {
    page: 'CPQ - Sampler Results',
    section: 'Filters',
    subsection: 'Header filter row',
    label: 'ruleset / bike_type / sku_code search / country presence',
    purpose: 'Filters matrix rows before rendering table output.',
    codeSource: 'components/cpq/cpq-results-matrix.client.tsx',
    dataSource: 'Client-side filters over server-provided matrix rows from lib/cpq/results/service.ts.',
    notes: 'All filters are combinable.',
  },
  {
    page: 'CPQ - Sampler Results',
    section: 'Matrix',
    subsection: 'Identity note',
    label: 'Rows are grouped by sku_code + ruleset + feature signature...',
    purpose: 'Explains stable row grouping used before country pivot.',
    codeSource: 'lib/cpq/results/service.ts',
    dataSource: 'rowIdentityDescription returned by getCpqResultsPageData().',
    notes: 'Rendered by components/cpq/cpq-results-matrix.client.tsx.',
  },
  {
    page: 'CPQ - Bike Builder',
    section: 'Combination table',
    subsection: 'Bulk action',
    label: 'Configure all ticked items',
    purpose: 'Runs per-row fresh session Start/Configure/Finalize/save lifecycle.',
    codeSource: 'components/cpq/bike-builder-page.tsx',
    dataSource: 'Uses runtime APIs (/init, /configure, /finalize, /configuration-references, /sampler-result).',
    notes: 'Respects ignore-during-configure feature flags from setup.',
  },
];

export default function UiDocsPage() {
  const { isAdminMode } = useAdminMode();
  const [query, setQuery] = useState('');

  if (!isAdminMode) {
    return (
      <main className="page">
        <h1 style={{ marginTop: 0 }}>CPQ UI Docs</h1>
        <p className="subtle">This page is admin-only. Use <strong>Open as admin</strong> in the top ribbon to access UI mapping details.</p>
      </main>
    );
  }


  const filteredEntries = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return entries;

    return entries.filter((entry) =>
      [entry.page, entry.section, entry.subsection, entry.label, entry.purpose, entry.codeSource, entry.dataSource, entry.notes]
        .join(' ')
        .toLowerCase()
        .includes(value),
    );
  }, [query]);

  return (
    <main className="pageRoot">
      <section className="compactCard compactSection">
        <div className="pageHeader">
          <h1>CPQ UI Documentation Map</h1>
          <p>
            Internal reference for visible UI labels and where they come from in code/data. Governance rule: every UI change must also update this page.
          </p>
        </div>

        <div className="toolbar compactToolbar" style={{ marginTop: 8 }}>
          <label className="pictureSearchField">
            Search labels, routes, components, or data sources
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search UI docs" />
          </label>
          <span className="summaryChip">Rows: {filteredEntries.length}</span>
        </div>

        <div className="note compactNote">
          Implementation standard: when adding/changing labels, sections, tabs, forms, or modals, update this table in the same pull request.
        </div>

        <div className="tableWrap" style={{ maxHeight: 620 }}>
          <table>
            <thead>
              <tr>
                <th>UI page</th>
                <th>Section</th>
                <th>Subsection / tab</th>
                <th>Visible label on UI</th>
                <th>Meaning / purpose</th>
                <th>Code source</th>
                <th>Data source</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry, index) => (
                <tr key={`${entry.page}-${entry.label}-${index}`}>
                  <td>{entry.page}</td>
                  <td>{entry.section}</td>
                  <td>{entry.subsection}</td>
                  <td>{entry.label}</td>
                  <td>{entry.purpose}</td>
                  <td className="codeCell">{entry.codeSource}</td>
                  <td>{entry.dataSource}</td>
                  <td>{entry.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
