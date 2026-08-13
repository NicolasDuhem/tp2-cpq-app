'use client';
import { Fragment, useEffect, useMemo, useState } from 'react';
type Perm = 'none' | 'read' | 'edit' | 'admin';

const PERM_OPTIONS: Perm[] = ['none', 'read', 'edit', 'admin'];

// Presentation only: maps a permission level to a pill tone so read/edit/admin/none
// are distinguishable at a glance. Does not affect permission evaluation.
const PERM_PILL: Record<Perm, string> = {
  none: 'pill pillOutline',
  read: 'pill pillInfo',
  edit: 'pill pillWarn',
  admin: 'pill pillOk',
};

export default function UserManagementPage({ canEdit = true, permissionLevel = 'admin' }: { canEdit?: boolean; permissionLevel?: 'none' | 'read' | 'edit' | 'admin' }) {
  const [users, setUsers] = useState<any[]>([]);
  const [pages, setPages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState<any>({ displayName: '', email: '', password: '', isActive: true, isSystemAdmin: false, permissions: {} });
  const [editing, setEditing] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [u, p] = await Promise.all([fetch('/api/setup/users', { cache: 'no-store' }), fetch('/api/setup/permission-pages', { cache: 'no-store' })]);
      const uj = await u.json();
      const pj = await p.json();
      setUsers(uj.users ?? []);
      setPages(pj.pages ?? []);
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const save = async () => {
    setMsg('');
    const method = editing ? 'PUT' : 'POST';
    const url = editing ? `/api/setup/users/${editing}` : '/api/setup/users';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const json = await res.json();
    if (!res.ok) return setMsg(json.error || 'Failed');
    setMsg('Saved');
    setForm({ displayName: '', email: '', password: '', isActive: true, isSystemAdmin: false, permissions: {} });
    setEditing(null);
    await load();
  };

  const resetForm = () => {
    setForm({ displayName: '', email: '', password: '', isActive: true, isSystemAdmin: false, permissions: {} });
    setEditing(null);
    setMsg('');
  };

  // Presentation only: groups the same rows by their existing navGroup so the matrix
  // is scannable. No filtering — every page row is still rendered.
  const groupedPages = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const page of pages) {
      const key = String(page.navGroup ?? '').trim() || 'Other';
      groups.set(key, [...(groups.get(key) ?? []), page]);
    }
    return [...groups.entries()];
  }, [pages]);

  const grantedCount = useMemo(
    () => pages.filter((p: any) => (form.permissions[p.pageKey] ?? 'none') !== 'none').length,
    [pages, form.permissions],
  );

  const editDisabledTitle = !canEdit ? 'You need Edit access for this action.' : undefined;

  return (
    <main className="opPage">
      <header className="opHeader">
        <div className="opHeaderMain">
          <h1>Setup · Users</h1>
          <p>Manage local users and their per-page permission levels.</p>
        </div>
        <div className="opHeaderActions">
          <span className="opCount">Access: {permissionLevel[0].toUpperCase() + permissionLevel.slice(1)}</span>
          <button type="button" className="btn" data-read-allowed onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </header>

      {msg ? <div className={`opMessage ${msg === 'Saved' ? 'opMessageSuccess' : 'opMessageError'}`}>{msg}</div> : null}

      <section className="opPanel opPanelStack">
        <div className="opSectionTitleRow">
          <h2 className="opSectionTitle">{editing ? 'Edit user' : 'New user'}</h2>
          <div className="opBarGroup">
            <span className="opCount">{grantedCount} of {pages.length} pages granted</span>
            {editing ? (
              <button type="button" className="btn btnSmall" onClick={resetForm}>
                Cancel edit
              </button>
            ) : null}
            <button
              type="button"
              className="btn btnPrimary"
              title={editDisabledTitle}
              disabled={!canEdit}
              onClick={save}
            >
              {editing ? 'Save changes' : 'Create user'}
            </button>
          </div>
        </div>

        <div className="usersFormGrid">
          <label className="opField">
            Display name
            <input placeholder="Display name" value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} />
          </label>
          <label className="opField">
            Email
            <input placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="opField">
            {editing ? 'New password (optional)' : 'Password'}
            <input placeholder={editing ? 'Leave blank to keep current' : 'Password'} type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
          </label>
          <div className="opField">
            Account flags
            <div className="opBarGroup" style={{ minHeight: 30 }}>
              <label className="opCheckOption">
                <input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} />
                Active
              </label>
              <label className="opCheckOption">
                <input type="checkbox" checked={form.isSystemAdmin} onChange={e => setForm({ ...form, isSystemAdmin: e.target.checked })} />
                System admin
              </label>
            </div>
          </div>
        </div>

        {form.isSystemAdmin ? (
          <div className="opMessage opMessageInfo">
            System admins bypass every page permission below.
          </div>
        ) : null}

        <div className="opTableWrap opTableWrapViewport">
          <table className="opTable">
            <thead>
              <tr>
                <th>Page</th>
                <th>Route</th>
                <th style={{ width: 150 }}>Permission</th>
                <th style={{ width: 90 }}>Current</th>
              </tr>
            </thead>
            <tbody>
              {groupedPages.map(([group, groupPages]) => (
                <Fragment key={`group-${group}`}>
                  <tr>
                    <td colSpan={4} style={{ background: '#f5f8ff', padding: '4px 9px' }}>
                      <span className="opSectionTitle">{group}</span>
                    </td>
                  </tr>
                  {groupPages.map((p: any) => {
                    const level = (form.permissions[p.pageKey] || 'none') as Perm;
                    return (
                      <tr key={p.pageKey}>
                        <td>
                          <span className="emphasis">{p.pageLabel}</span>
                          <div className="secondaryText">{p.pageKey}</div>
                        </td>
                        <td className="secondaryText nowrapCell">{p.routePath}</td>
                        <td>
                          <select
                            aria-label={`Permission level for ${p.pageLabel}`}
                            value={level}
                            onChange={e => setForm({ ...form, permissions: { ...form.permissions, [p.pageKey]: e.target.value as Perm } })}
                            style={{ width: '100%', padding: '4px 8px', fontSize: 12 }}
                          >
                            {PERM_OPTIONS.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <span className={PERM_PILL[level]}>{level}</span>
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
              {!pages.length ? (
                <tr>
                  <td colSpan={4}>
                    <div className="opEmpty"><strong>No permission pages</strong>Run the permission page migration to populate this matrix.</div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="opPanel opPanelStack">
        <div className="opSectionTitleRow">
          <h2 className="opSectionTitle">Users ({users.length})</h2>
        </div>
        {loading ? (
          <p className="opLoading">Loading users…</p>
        ) : !users.length ? (
          <div className="opEmpty"><strong>No users yet</strong>Create the first user with the form above.</div>
        ) : (
          <div className="opTableWrap">
            <table className="opTable">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Role</th>
                  <th>Last login</th>
                  <th>Created</th>
                  <th style={{ width: 70 }} />
                </tr>
              </thead>
              <tbody>
                {users.map((u: any) => (
                  <tr key={u.id} className={editing === u.id ? 'isSelected' : undefined}>
                    <td className="emphasis">{u.displayName}</td>
                    <td className="secondaryText">{u.email}</td>
                    <td>
                      <span className={u.isActive ? 'pill pillOk' : 'pill pillNeutral'}>{u.isActive ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td>
                      <span className={u.isSystemAdmin ? 'pill pillWarn' : 'pill pillOutline'}>{u.isSystemAdmin ? 'System admin' : 'Standard'}</span>
                    </td>
                    <td className="secondaryText nowrapCell">{u.lastLoginAt ?? '—'}</td>
                    <td className="secondaryText nowrapCell">{u.createdAt}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btnSmall"
                        title={editDisabledTitle}
                        disabled={!canEdit}
                        onClick={async () => {
                          const r = await fetch(`/api/setup/users/${u.id}`, { cache: 'no-store' });
                          const p = await r.json();
                          const perms = Object.fromEntries((p.permissions || []).map((x: any) => [x.page_key, x.permission_level]));
                          setForm({ displayName: p.row.display_name, email: p.row.email, password: '', isActive: p.row.is_active, isSystemAdmin: p.row.is_system_admin, permissions: perms });
                          setEditing(u.id);
                        }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
