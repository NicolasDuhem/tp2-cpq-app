'use client';
import { useEffect, useState } from 'react';
type Perm = 'none' | 'read' | 'edit' | 'admin';

export default function UserManagementPage() {
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

  return <main className='page'><h1>Setup · User</h1><p className='subtle'>{msg}</p><div className='toolbar'><button onClick={() => void load()}>Refresh users</button></div><div className='card'><input placeholder='Display name' value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} /><input placeholder='Email' value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /><input placeholder={editing ? 'New password (optional)' : 'Password'} type='password' value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /><label><input type='checkbox' checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} />Active</label><label><input type='checkbox' checked={form.isSystemAdmin} onChange={e => setForm({ ...form, isSystemAdmin: e.target.checked })} />System admin</label><table className='table'><thead><tr><th>Page</th><th>Route</th><th>Group</th><th>Permission</th></tr></thead><tbody>{pages.map((p: any) => <tr key={p.pageKey}><td>{p.pageLabel}</td><td>{p.routePath}</td><td>{p.navGroup}</td><td><select value={form.permissions[p.pageKey] || 'none'} onChange={e => setForm({ ...form, permissions: { ...form.permissions, [p.pageKey]: e.target.value as Perm } })}><option>none</option><option>read</option><option>edit</option><option>admin</option></select></td></tr>)}</tbody></table><button className='primary' onClick={save}>Save</button></div><h2>Users</h2>{loading ? <p className='subtle'>Loading users…</p> : <table className='table'><thead><tr><th>Name</th><th>Email</th><th>Active</th><th>System admin</th><th>Last login</th><th>Created</th><th /></tr></thead><tbody>{users.map((u: any) => <tr key={u.id}><td>{u.displayName}</td><td>{u.email}</td><td>{u.isActive ? 'Yes' : 'No'}</td><td>{u.isSystemAdmin ? 'Yes' : 'No'}</td><td>{u.lastLoginAt ?? '-'}</td><td>{u.createdAt}</td><td><button onClick={async () => { const r = await fetch(`/api/setup/users/${u.id}`, { cache: 'no-store' }); const p = await r.json(); const perms = Object.fromEntries((p.permissions || []).map((x: any) => [x.page_key, x.permission_level])); setForm({ displayName: p.row.display_name, email: p.row.email, password: '', isActive: p.row.is_active, isSystemAdmin: p.row.is_system_admin, permissions: perms }); setEditing(u.id); }}>Edit</button></td></tr>)}</tbody></table>}</main>;
}
