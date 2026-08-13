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
    const res = await fetch('/api/auth/login', { method: 'POST', cache: 'no-store', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const json = await res.json();
    if (!res.ok) return setError(json.error || 'Login failed');
    window.dispatchEvent(new Event('auth:changed'));
    router.push('/sales/bike-allocation');
    router.refresh();
  };

  const testLogin = async () => {
    const res = await fetch('/api/auth/me', { cache: 'no-store', credentials: 'include' });
    setMe(await res.json());
  };

  return (
    <main className="opPage">
      <header className="opHeader">
        <div className="opHeaderMain">
          <h1>Login</h1>
          <p>Sign in with your Brompton Operations account.</p>
        </div>
      </header>

      <section className="opPanel opPanelStack" style={{ maxWidth: 460 }}>
        <form
          className="opPanelStack"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className="opField">
            Email
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="opField">
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error ? (
            <div className="opMessage opMessageError" role="alert">
              {error}
            </div>
          ) : null}

          <div className="opBar">
            <button className="btn btnPrimary" type="submit">
              Login
            </button>
            <button className="btn" type="button" onClick={() => void testLogin()}>
              Test current login
            </button>
          </div>
        </form>

        {me ? (
          <details open>
            <summary className="opSectionTitle" style={{ cursor: 'pointer' }}>Current session</summary>
            <pre className="apiDocsExample" style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{JSON.stringify(me, null, 2)}</pre>
          </details>
        ) : null}
      </section>
    </main>
  );
}
