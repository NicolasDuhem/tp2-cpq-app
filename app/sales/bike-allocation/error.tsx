'use client';

export default function SalesBikeAllocationError({ error }: { error: Error & { digest?: string } }) {
  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>Failed to load Sales - bike allocation</h2>
      <p style={{ marginBottom: 0, color: '#666' }}>{error.message || 'Unexpected error occurred.'}</p>
    </div>
  );
}
