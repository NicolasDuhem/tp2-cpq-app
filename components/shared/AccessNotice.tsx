import Link from 'next/link';

/**
 * Shared presentation for the "please login" / "access denied" states that every
 * permission-gated page renders. Presentation only — it does not evaluate permissions.
 */
export default function AccessNotice({ kind }: { kind: 'login' | 'denied' }) {
  const isLogin = kind === 'login';
  return (
    <main className="opPage">
      <div className="accessNotice">
        <div className="accessNoticeIcon" aria-hidden="true">{isLogin ? '🔒' : '⛔'}</div>
        <h1>{isLogin ? 'Please log in' : 'Access denied'}</h1>
        <p>
          {isLogin
            ? 'You must be logged in to access this page.'
            : 'You do not have permission to view this page. Ask an administrator to grant access.'}
        </p>
        {isLogin ? (
          <Link className="btn btnPrimary" href="/login">
            Go to login
          </Link>
        ) : null}
      </div>
    </main>
  );
}
