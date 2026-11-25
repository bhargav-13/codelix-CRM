// Shimmer placeholders shown while a list or card grid loads.
// (the `.skeleton` class and its `shimmer` keyframes live in the stylesheets.)

// Rows — list / table pages
export default function LoadingSpinner({ rows = 5 }) {
  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 52, borderRadius: 'var(--r-md)', opacity: Math.max(0.3, 1 - i * 0.12) }} />
      ))}
    </div>
  );
}

// Card grid — card-layout pages
export function CardGridSkeleton({ cols = 3, count = 6 }) {
  return (
    <div style={{ padding: 12 }} aria-busy="true" aria-label="Loading">
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${Math.round(900 / cols)}px), 1fr))`, gap: 14 }}>
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="skeleton" style={{ height: 160, borderRadius: 'var(--r-lg)' }} />
        ))}
      </div>
    </div>
  );
}
