import React from 'react';
import '../styles/secondary.css';
import {
  APP_VERSION,
  BUILD_TIMESTAMP,
  formatUpdateTimestamp,
  forcePurgeCacheAndReload
} from '../lib/appMeta.js';
import { CHANGELOG_HISTORY } from '../data/changelogHistory.js';

const ChangelogPage = ({ onGoHome }) => {
  return (
    <div className="about-container">
      <div className="about-card">
        <div className="changelog-header-top">
          <div>
            <h1 className="about-title">Site Changelog & Update History</h1>
            <p className="about-lead">
              Complete log of speed optimizations, index updates, bug fixes, and UI improvements deployed to Conceptualist Systems.
            </p>
          </div>
          <div className="changelog-build-box">
            <div className="changelog-build-version">Current Build: <strong>{APP_VERSION}</strong></div>
            <div className="changelog-build-time">Deployed: {formatUpdateTimestamp(BUILD_TIMESTAMP)}</div>
            <button type="button" className="changelog-purge-btn" onClick={forcePurgeCacheAndReload}>
              Clear Cache &amp; Force Reload
            </button>
          </div>
        </div>

        <hr className="about-divider" />

        <div className="changelog-list">
          {CHANGELOG_HISTORY.map((entry, idx) => (
            <div key={entry.version} className={`changelog-entry ${idx === 0 ? 'latest' : ''}`}>
              <div className="changelog-entry-header">
                <div className="changelog-version-group">
                  <span className={`changelog-badge ${idx === 0 ? 'latest' : ''}`}>
                    {entry.version} {idx === 0 ? '• Latest' : ''}
                  </span>
                  <h2 className="changelog-entry-title">{entry.title}</h2>
                </div>
                <span className="changelog-entry-date">{formatUpdateTimestamp(entry.date)}</span>
              </div>
              <p className="changelog-entry-summary">{entry.summary}</p>
              <ul className="changelog-bullets">
                {entry.changes.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '28px' }}>
          <button
            type="button"
            className="search-button return-to-library-btn"
            onClick={onGoHome}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            <span>Return to Library Repository</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChangelogPage;
