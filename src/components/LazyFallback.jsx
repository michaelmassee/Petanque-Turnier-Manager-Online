export function LazyFallback({ label }) {
  return <div className="lazy-fallback" role="status" aria-live="polite">{label}</div>;
}
