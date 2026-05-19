'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [me, setMe] = useState<any>(null);
  const router = useRouter();

  const submit = async () => {
    setError('');
    const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const json = await res.json();
    if (!res.ok) return setError(json.error || 'Login failed');
    router.push('/sales/bike-allocation');
    router.refresh();
  };

  const testLogin = async () => {
    const res = await fetch('/api/auth/me', { cache: 'no-store' });
    setMe(await res.json());
  };

  return <main className='page'><h1>Login</h1><div className='card' style={{ maxWidth: 520 }}><label>Email<input value={email} onChange={e => setEmail(e.target.value)} /></label><label>Password<input type='password' value={password} onChange={e => setPassword(e.target.value)} /></label>{error ? <p>{error}</p> : null}<div className='toolbar'><button className='primary' onClick={submit}>Login</button><button onClick={testLogin}>Test current login</button></div>{me ? <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(me, null, 2)}</pre> : null}</div></main>;
}
