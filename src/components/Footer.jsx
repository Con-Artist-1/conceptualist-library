import React from 'react';
import { APP_VERSION, BUILD_TIMESTAMP, formatUpdateTimestamp } from '../lib/appMeta.js';
import { shouldHandleClientNavigation } from '../lib/libraryHelpers.js';

/**
 * Global institutional footer with version/update trigger and archive quick links.
 */
export function Footer({ onNavigateQuickFilter, onOpenTab }) {
  return (
    <footer className="footer-bottom">
      <div className="footer-left-col">
        <div>© 2026 <strong>Conceptualist Systems</strong> — Independent Study Archive</div>
        <button
          type="button"
          className="footer-update-micro"
          onClick={() => onOpenTab('changelog')}
          title="Click to view full site changelog & version history"
        >
          {APP_VERSION} · Updated {formatUpdateTimestamp(BUILD_TIMESTAMP)} · Not affiliated with Pearson or Edexcel
        </button>
      </div>
      <div className="footer-links">
        <a
          href="/ial"
          className="footer-link"
          onClick={(e) => {
            if (!shouldHandleClientNavigation(e)) return;
            e.preventDefault();
            onNavigateQuickFilter('ial');
          }}
        >
          Edexcel IAL
        </a>
        <span className="footer-sep" aria-hidden="true">•</span>
        <a
          href="/igcse"
          className="footer-link"
          onClick={(e) => {
            if (!shouldHandleClientNavigation(e)) return;
            e.preventDefault();
            onNavigateQuickFilter('igcse');
          }}
        >
          Edexcel IGCSE
        </a>
        <span className="footer-sep" aria-hidden="true">•</span>
        <a
          href="/textbooks"
          className="footer-link"
          onClick={(e) => {
            if (!shouldHandleClientNavigation(e)) return;
            e.preventDefault();
            onNavigateQuickFilter('textbooks');
          }}
        >
          Textbooks
        </a>
        <span className="footer-sep" aria-hidden="true">•</span>
        <a
          href="/changelog"
          className="footer-link"
          onClick={(e) => {
            if (!shouldHandleClientNavigation(e)) return;
            e.preventDefault();
            onOpenTab('changelog');
          }}
        >
          Changelog
        </a>
        <span className="footer-sep" aria-hidden="true">•</span>
        <a
          href="/about"
          className="footer-link"
          onClick={(e) => {
            if (!shouldHandleClientNavigation(e)) return;
            e.preventDefault();
            onOpenTab('about');
          }}
        >
          About Us &amp; Team
        </a>
        <span className="footer-sep" aria-hidden="true">•</span>
        <a href="mailto:diavlon.pxa@gmail.com" className="footer-link">
          Contact Us
        </a>
      </div>
    </footer>
  );
}
