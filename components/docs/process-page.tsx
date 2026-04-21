const anchorLinks = [
  { href: '#overview', label: 'Overview' },
  { href: '#step-0', label: 'Step 0 — CPQ admin setup' },
  { href: '#step-0-1', label: 'Step 0.1 — Picture management' },
  { href: '#step-1', label: 'Step 1 — Manual single-bike process' },
  { href: '#step-1-1', label: 'Step 1.1 — Bulk configuration process' },
  { href: '#notes', label: 'Notes, tips, and warnings' },
  { href: '#roles', label: 'Roles and responsibilities' },
];

export default function ProcessPage() {
  return (
    <main className="page processPage">
      <header className="processHeader">
        <h1>Process</h1>
        <p>
          Internal SOP for CPQ admin and Product team users. Use this page as the standard way to prepare
          setup data, configure bikes, and avoid common execution issues.
        </p>
      </header>

      <nav className="processAnchorNav" aria-label="Process page sections">
        {anchorLinks.map((item) => (
          <a key={item.href} href={item.href} className="processAnchorLink">
            {item.label}
          </a>
        ))}
      </nav>

      <section id="overview" className="processSectionCard">
        <h2>Overview</h2>
        <p>
          This tool supports two operating audiences: CPQ admins (master data and technical setup quality) and
          Product team users (manual and bulk configuration execution). A clean setup is required before any
          configuration run.
        </p>
        <ul>
          <li>Use setup first, then run configuration.</li>
          <li>Use manual flow when creating one exact bike configuration.</li>
          <li>Use bulk flow when running multiple combinations and countries at scale.</li>
        </ul>
      </section>

      <section id="step-0" className="processSectionCard">
        <h2>Step 0 — CPQ admin setup</h2>
        <p>
          <strong>Owner:</strong> CPQ admin
        </p>
        <p>
          Before Product team users configure bikes, the <strong>CPQ Setup</strong> area must contain complete and
          accurate master data.
        </p>
        <div className="processMiniGrid">
          <article className="processMiniCard">
            <h3>Account code management</h3>
            <p>Maintain one valid CSI-backed account per country so configuration can execute correctly.</p>
            <ul>
              <li>Click <strong>Create account</strong> to add a new account context.</li>
              <li>Edit existing accounts when country, currency, or account details change.</li>
              <li>Account setup must exist before any CPQ configuration run can succeed.</li>
            </ul>
          </article>
          <article className="processMiniCard">
            <h3>Ruleset management</h3>
            <p>Keep CPQ rulesets current and well ordered for reliable user selection.</p>
            <ul>
              <li>Maintain correct ruleset master data.</li>
              <li>Keep the <strong>Sort</strong> value accurate and consistent.</li>
              <li>Good sort order keeps ruleset selection clean and easy for business users.</li>
            </ul>
          </article>
        </div>
      </section>

      <section id="step-0-1" className="processSectionCard">
        <h2>Step 0.1 — Picture management</h2>
        <p>
          <strong>Owner:</strong> typically CPQ admin or advanced admin user
        </p>
        <p>
          In <strong>CPQ Setup → Picture management</strong>, upload transparent-background option pictures so the Bike
          Builder preview can render complete product visuals.
        </p>
        <ol>
          <li>Select a feature tab.</li>
          <li>
            Maintain <strong>Layer order (1 = top layer)</strong> at feature level.
            <ul>
              <li>Lower number means the feature is rendered closer to the top in bike preview.</li>
              <li>Allowed values: integers <strong>1 to 20</strong>; default is <strong>10</strong>.</li>
              <li>This field is owned by CPQ admin and must be maintained for correct visual stacking.</li>
            </ul>
          </li>
          <li>Review each option tile.</li>
          <li>
            Status indicator:
            <ul>
              <li>
                <strong>Red dot</strong> = no picture uploaded yet
              </li>
              <li>
                <strong>Green dot</strong> = at least one picture link is available
              </li>
            </ul>
          </li>
          <li>Open a tile, update picture links, and click <strong>Save</strong>.</li>
        </ol>
        <div className="processCallout processCalloutWarn">
          <strong>Advanced setting:</strong> <strong>Ignore during /configure</strong> is feature-level and affects
          automated configure behavior. Use this only when needed to prevent known failures (for example, specific
          gearing scenarios).
        </div>
        <div className="processCallout processCalloutInfo">
          <strong>Preview stacking rule:</strong> in Bike Builder layered preview, feature order <strong>1</strong> is
          the top-most layer, then 2, then 3, and so on.
        </div>
      </section>

      <section id="step-1" className="processSectionCard">
        <h2>Step 1 — Product team manual single-bike process</h2>
        <p>
          <strong>Owner:</strong> Product team
        </p>
        <p>
          Use <strong>CPQ - Bike Builder</strong> when you need to configure one specific bike for a specific country
          context.
        </p>
        <ol>
          <li>Select a ruleset in <strong>CPQ manual configuration lifecycle</strong>.</li>
          <li>Select an account code.</li>
          <li>Use the <strong>Configurator</strong> section to choose options one by one.</li>
          <li>Click <strong>Save configuration</strong>.</li>
          <li>Then click <strong>Save current configuration to sampler</strong>.</li>
        </ol>
        <div className="processCallout processCalloutInfo">
          <strong>Important:</strong> <strong>Save configuration</strong> and <strong>Save current configuration to
          sampler</strong> are two separate actions and both are expected in the single-bike SOP.
        </div>
      </section>

      <section id="step-1-1" className="processSectionCard">
        <h2>Step 1.1 — Product team bulk configuration process</h2>
        <p>
          Use this process in <strong>CPQ - Bike Builder</strong> when multiple combinations need to run across one or
          more countries.
        </p>
        <ol>
          <li>Select the ruleset.</li>
          <li>Generate combinations via <strong>Generate configuration combinations</strong>.</li>
          <li>
            Use <strong>Feature filters</strong> to narrow combinations by option values (multi-select is allowed per
            feature).
          </li>
          <li>Click <strong>Select all visible rows</strong> (or manually tick specific rows).</li>
          <li>
            Use <strong>Visible-row country actions</strong> to tick/untick one or more countries for visible selected
            rows.
          </li>
          <li>
            Use optional helpers to simplify selection:
            <ul>
              <li><strong>Show selected only</strong></li>
              <li>column show/hide</li>
              <li>feature filter summary + clear filters</li>
            </ul>
          </li>
          <li>Confirm each selected row has at least one country.</li>
          <li>Click <strong>Configure all ticked items</strong> when all selections are complete.</li>
        </ol>
        <div className="processCallout processCalloutWarn">
          <strong>Validation rule:</strong> every selected row must have at least one selected country. Rows missing
          country assignment are highlighted in red and should be fixed before running.
        </div>
        <p className="subtle">
          Country selection defines actual execution targets. If one row has three countries selected, that row runs
          three separate country-specific configurations.
        </p>
      </section>

      <section id="notes" className="processSectionCard">
        <h2>Notes, tips, and warnings</h2>
        <ul>
          <li>Configuration depends on valid account setup and current rulesets.</li>
          <li>Picture completeness directly improves the rendered bike preview quality.</li>
          <li>Ignore-during-configure should be treated as an advanced admin control.</li>
          <li>Bulk runs require both row selection and country selection.</li>
          <li>Use manual flow for one exact bike; use bulk flow for operational scale.</li>
        </ul>
      </section>

      <section id="roles" className="processSectionCard">
        <h2>Roles and responsibilities summary</h2>
        <div className="processRoleGrid">
          <article className="processRoleCard">
            <h3>CPQ admin</h3>
            <ul>
              <li>Maintains account code and ruleset master data.</li>
              <li>Maintains picture links, feature layer order, and advanced configure exclusions.</li>
              <li>Keeps setup quality high so downstream execution is reliable.</li>
            </ul>
          </article>
          <article className="processRoleCard">
            <h3>Product team</h3>
            <ul>
              <li>Runs single-bike manual configuration lifecycle.</li>
              <li>Runs bulk combination workflows with explicit country targets.</li>
              <li>Uses setup data as provided by CPQ admin.</li>
            </ul>
          </article>
        </div>
      </section>
    </main>
  );
}
