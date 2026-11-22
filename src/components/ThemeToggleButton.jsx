import React from 'react';

const FULL_TOOLTIPS = {
  light: 'Current: Academic Light - Click for Dark Mode',
  dark: 'Current: Academic Dark - Click for Pure OLED Mode',
  oled: 'Current: Pure OLED - Click for Light Mode'
};

const COMPACT_TOOLTIPS = {
  light: 'Current: Light - Tap for Dark',
  dark: 'Current: Dark - Tap for Pure OLED',
  oled: 'Current: OLED - Tap for Light'
};

const LABELS = {
  light: 'Light',
  dark: 'Dark',
  oled: 'OLED'
};

/**
 * Shared 3-state theme cycle button (Light -> Dark -> OLED) used across Desktop Header,
 * Mobile Breadcrumb Strip, and Study Modal Header.
 */
export function ThemeToggleButton({
  theme = 'light',
  onToggle,
  className = 'header-theme-btn',
  iconSize = 14,
  hideLabelOnMobile = false,
  compactTitle = false,
  ariaLabel = 'Toggle Theme'
}) {
  const tooltips = compactTitle ? COMPACT_TOOLTIPS : FULL_TOOLTIPS;
  const label = LABELS[theme] || LABELS.light;

  return (
    <button
      type="button"
      className={className}
      onClick={onToggle}
      title={tooltips[theme] || tooltips.light}
      aria-label={ariaLabel}
    >
      {theme === 'light' ? (
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0 }}
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : theme === 'dark' ? (
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0 }}
          aria-hidden="true"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0 }}
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3v18A9 9 0 0 0 12 3z" fill="currentColor" />
        </svg>
      )}
      {hideLabelOnMobile ? (
        <span className="btn-desktop-text">{label}</span>
      ) : (
        <span>{label}</span>
      )}
    </button>
  );
}
