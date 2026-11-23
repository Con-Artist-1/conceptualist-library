import React from 'react';
import { APP_VERSION, BUILD_TIMESTAMP, formatUpdateTimestamp } from '../lib/appMeta.js';
import { shouldHandleClientNavigation } from '../lib/libraryHelpers.js';

/**
 * Global institutional footer with version/update trigger, dual-board non-affiliation notice,
 * and balanced 9-item archive quick links (renders cleanly as 3x3 grid on mobile).
 */
export function Footer({ onNavigateQuickFilter, onOpenTab }) {
  const quickLinks = [
    { href: '/ial', label: 'Edexcel IAL', action: () => onNavigateQuickFilter('ial') },
    { href: '/igcse', label: 'Edexcel IGCSE', action: () => onNavigateQuickFilter('igcse') },
    { href: '/cambridge', label: 'Cambridge', action: () => onNavigateQuickFilter('cambridge') },
    { href: '/textbooks', label: 'Textbooks', action: () => onNavigateQuickFilter('textbooks') },
    { href: '/audio', label: 'Audio', action: () => onNavigateQuickFilter('audio') },
    { href: '/data-files', label: 'Data Files', action: () => onNavigateQuickFilter('data-files') },
    { href: '/changelog', label: 'Changelog', action: () => onOpenTab('changelog') },
    { href: '/about', label: 'About Us', action: () => onOpenTab('about') }
  ];

  return (
    <footer className="footer-bottom">
      <div className="footer-left-col">
        <div>© 2026 <strong>Conceptualist Systems</strong> — Independent International Study Archive</div>
        <button
          type="button"
          className="footer-update-micro"
          onClick={() => onOpenTab('changelog')}
          title="Click to view full site changelog & version history"
        >
          {APP_VERSION} · Updated {formatUpdateTimestamp(BUILD_TIMESTAMP)} · Not affiliated with Pearson/Edexcel or Cambridge (CAIE)
        </button>
      </div>
      <div className="footer-links">
        {quickLinks.map((item) => (
          <React.Fragment key={item.href}>
            <a
              href={item.href}
              className="footer-link"
              onClick={(e) => {
                if (!shouldHandleClientNavigation(e)) return;
                e.preventDefault();
                item.action();
              }}
            >
              {item.label}
            </a>
            <span className="footer-sep" aria-hidden="true">•</span>
          </React.Fragment>
        ))}
        <a href="mailto:diavlon.pxa@gmail.com" className="footer-link">
          Contact Us
        </a>
      </div>
    </footer>
  );
}
