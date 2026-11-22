import React from 'react';
import { shouldHandleClientNavigation } from '../lib/libraryHelpers.js';

/**
 * Specification reference and related course resource links rendered beneath filtered catalog tables.
 */
export function ArchiveContextStrip({ archiveContextInfo }) {
  if (!archiveContextInfo) return null;

  return (
    <section className="archive-context-strip" aria-label="Archive specifications and related resources">
      <div className="archive-context-copy">
        <div className="archive-context-eyebrow">Specification &amp; Archive Reference</div>
        <h2 className="archive-context-heading">{archiveContextInfo.heading}</h2>
        {archiveContextInfo.legacyInfo && (
          <p className="archive-context-legacy">{archiveContextInfo.legacyInfo}</p>
        )}
        <p className="archive-context-note">{archiveContextInfo.note}</p>
      </div>
      {archiveContextInfo.links.length > 0 && (
        <nav className="archive-context-links" aria-label="Related course resources">
          {archiveContextInfo.links.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="archive-context-link"
              onClick={(e) => {
                if (!shouldHandleClientNavigation(e)) return;
                e.preventDefault();
                item.onClick();
              }}
            >
              {item.label} →
            </a>
          ))}
        </nav>
      )}
    </section>
  );
}
