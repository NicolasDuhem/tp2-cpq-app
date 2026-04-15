'use client';

import { useMemo, useState } from 'react';

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
    label: 'CPQ - UI Docs',
    purpose: 'Internal page to map labels to code + data sources.',
    codeSource: 'components/shared/app-navigation.tsx',
    dataSource: 'Static links array.',
    notes: 'Route: /cpq/ui-docs',
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
    subsection: 'Toolbar',
    label: 'Sync from sampler results',
    purpose: 'Seed/update image management rows from sampler data.',
    codeSource: 'components/setup/cpq-setup-page.tsx',
    dataSource: 'POST /api/cpq/setup/picture-management/sync -> lib/cpq/setup/service.ts syncImageManagementFromSampler.',
    notes: 'Preserves existing sync flow.',
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
];

export default function UiDocsPage() {
  const [query, setQuery] = useState('');

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
