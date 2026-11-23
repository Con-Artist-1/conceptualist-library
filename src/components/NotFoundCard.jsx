import React from 'react';
import { shouldHandleClientNavigation } from '../lib/libraryHelpers.js';

const NOT_FOUND_ROUTES = [
  { href: '/ial', label: 'Edexcel IAL', action: 'ial' },
  { href: '/igcse', label: 'Edexcel IGCSE', action: 'igcse' },
  { href: '/cambridge', label: 'Cambridge International', action: 'cambridge' },
  { href: '/textbooks', label: 'Textbooks', action: 'textbooks' },
  { href: '/data-files', label: 'Data Files', action: 'data-files' },
  { href: '/audio', label: 'Audio Archive', action: 'audio' }
];

/**
 * Lazy-loaded 404 recovery card shown when an unknown URL path is requested.
 */
export default function NotFoundCard({ seoMeta, onNavigateHome, onQuickRoute }) {
  return (
    <div className="not-found-card" role="region" aria-label="Page not found">
      <span className="not-found-badge">404 • Route Not Found</span>
      <h1>{seoMeta.h1}</h1>
      <p>{seoMeta.subtitle}</p>
      <div className="not-found-actions">
        <a href="/" className="search-button" onClick={onNavigateHome}>
          Return to Library Home
        </a>
        {NOT_FOUND_ROUTES.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="filter-btn"
            onClick={(e) => {
              if (!shouldHandleClientNavigation(e)) return;
              e.preventDefault();
              onQuickRoute(item.action);
            }}
          >
            {item.label}
          </a>
        ))}
      </div>
    </div>
  );
}
