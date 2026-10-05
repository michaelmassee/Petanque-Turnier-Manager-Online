import { isAutumnSeason } from '../lib/seasonal.js';

const MAPLE_PATH = 'M16 2l2.5 6 3.5-2-1 6 5-2-2 4.5 4 1.5-6 4 1 3-5-1v6h-2v-6l-5 1 1-3-6-4 4-1.5-2-4.5 5 2-1-6 3.5 2z';

function MapleLeaf({ className, color }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d={MAPLE_PATH} fill={color} />
    </svg>
  );
}

function PumpkinIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M16 8c0-3 1-5 4-6" stroke="#3f6b2a" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <ellipse cx="9.5" cy="19" rx="7" ry="9" fill="#e8700c" />
      <ellipse cx="22.5" cy="19" rx="7" ry="9" fill="#e8700c" />
      <ellipse cx="16" cy="19" rx="7.5" ry="10" fill="#ff8a1f" />
      <path d="M10 16l3 3h-4zM22 16l1 3h-4zM10 23c3 3 9 3 12 0l-2 1-1-1-1 1-2-1-2 1-1-1-1 1z" fill="#2b1a0e" />
    </svg>
  );
}

export function AutumnPumpkin({ date }) {
  if (!isAutumnSeason(date)) return null;
  return <PumpkinIcon className="autumn-pumpkin" />;
}

// Kleine statische Zierleiste (Blätter + Kürbis), z. B. am Ende von Menüs.
export function AutumnGarland({ date }) {
  if (!isAutumnSeason(date)) return null;
  return (
    <div className="autumn-garland" aria-hidden="true">
      <MapleLeaf className="autumn-garland-leaf autumn-garland-leaf-left" color="#d9661f" />
      <MapleLeaf className="autumn-garland-leaf" color="#e8a31c" />
      <PumpkinIcon className="autumn-garland-pumpkin" />
      <MapleLeaf className="autumn-garland-leaf" color="#b5401f" />
      <MapleLeaf className="autumn-garland-leaf autumn-garland-leaf-right" color="#8a5a2b" />
    </div>
  );
}
