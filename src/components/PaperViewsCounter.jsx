import React from 'react';

// Compact Single-Line Question Paper Views Counter Pill
export const PaperViewsCounter = React.memo(({ count = 0, variant = 'table' }) => {
  const safeCount = Number.isFinite(Number(count)) && Number(count) > 0 ? Number(count) : 0;
  const labelText = safeCount === 1 ? 'VIEW' : 'VIEWS';
  return (
    <div
      className={`paper-views-counter ${variant}`}
      title={`${safeCount.toLocaleString()} question paper ${safeCount === 1 ? 'view' : 'views'}`}
      aria-label={`${safeCount.toLocaleString()} ${safeCount === 1 ? 'view' : 'views'}`}
    >
      <svg
        className="paper-views-icon"
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      <div className="paper-views-meta">
        <span className="paper-views-num">{safeCount.toLocaleString()}</span>
        <span className="paper-views-label">{labelText}</span>
      </div>
    </div>
  );
});
