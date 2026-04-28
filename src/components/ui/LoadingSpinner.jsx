// ─── Shimmer skeleton — used for list/table in-page loading ──────────────────
export default function LoadingSpinner({ rows = 5 }) {
  return (
    <div style={{ padding: '24px 32px' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{
          height: 52, borderRadius: 12, marginBottom: 10,
          background: 'linear-gradient(90deg,rgba(0,0,0,0.04) 25%,rgba(0,0,0,0.07) 50%,rgba(0,0,0,0.04) 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.4s infinite',
          opacity: 1 - i * 0.12,
        }} />
      ))}
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
    </div>
  );
}

// ─── Card grid skeleton — used for card-layout pages ─────────────────────────
export function CardGridSkeleton({ cols = 3, count = 6 }) {
  return (
    <div style={{ padding: '24px 32px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: 14 }}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} style={{
            height: 160, borderRadius: 16,
            background: 'linear-gradient(90deg,rgba(0,0,0,0.04) 25%,rgba(0,0,0,0.07) 50%,rgba(0,0,0,0.04) 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.4s infinite',
          }} />
        ))}
      </div>
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
    </div>
  );
}
