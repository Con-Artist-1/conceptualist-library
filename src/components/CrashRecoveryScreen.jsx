import React, { useEffect } from 'react';
import { forcePurgeCacheAndReload } from '../lib/appMeta.js';

/**
 * Institutional Crash / Stale Cache Recovery Screen with automatic one-shot chunk recovery.
 */
export const CrashRecoveryScreen = ({ errorMsg }) => {
  useEffect(() => {
    const isChunkError = /dynamically imported module|Loading chunk|Failed to fetch|preload/i.test(errorMsg || '');
    if (!isChunkError) return;
    try {
      if (!sessionStorage.getItem('cs_auto_healed')) {
        sessionStorage.setItem('cs_auto_healed', '1');
        forcePurgeCacheAndReload();
      }
    } catch {
      // Ignore storage access errors
    }
  }, [errorMsg]);

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: 'var(--bg-page, #F2F1ED)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: 'Roboto, Inter, sans-serif'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-surface, #FFFFFF)',
        border: '1px solid var(--border-medium, #C8C4BC)',
        borderTop: '4px solid var(--mcmaster-maroon, #6F1D2B)',
        borderRadius: '3px',
        maxWidth: '540px',
        width: '100%',
        padding: '32px',
        boxShadow: '0 2px 6px rgba(0,0,0,0.08)'
      }}>
        <div style={{
          fontSize: '11px',
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.6px',
          color: 'var(--text-link, #6F1D2B)',
          marginBottom: '6px'
        }}>
          Conceptualist Systems — Repository Recovery
        </div>
        <h1 style={{
          fontSize: '20px',
          fontWeight: 800,
          color: 'var(--text-primary, #1A1D20)',
          marginBottom: '10px'
        }}>
          Outdated Browser Cache Detected
        </h1>
        <p style={{
          fontSize: '14px',
          color: 'var(--text-secondary, #2E343B)',
          lineHeight: 1.55,
          marginBottom: '20px'
        }}>
          Your browser attempted to load an older cached version of the repository index after a recent site update. Click the button below to purge stale cache data and load the latest catalog.
        </p>
        {errorMsg && (
          <div style={{
            fontSize: '11.5px',
            fontFamily: 'Roboto Mono, monospace',
            backgroundColor: 'var(--bg-subtle, #F2F1ED)',
            border: '1px solid var(--border-light, #E2DFD9)',
            padding: '8px 12px',
            color: 'var(--text-muted, #525860)',
            marginBottom: '20px',
            wordBreak: 'break-word'
          }}>
            Diagnostic: {errorMsg}
          </div>
        )}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={forcePurgeCacheAndReload}
            style={{
              backgroundColor: '#6F1D2B',
              color: '#FFFFFF',
              border: '1px solid #6F1D2B',
              borderRadius: '2px',
              padding: '10px 20px',
              fontSize: '13.5px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Clear Cache &amp; Force Reload
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              backgroundColor: '#FFFFFF',
              color: '#1A1D20',
              border: '1px solid #C8C4BC',
              borderRadius: '2px',
              padding: '10px 16px',
              fontSize: '13.5px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Standard Refresh
          </button>
        </div>
      </div>
    </div>
  );
};

export class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorMsg: error?.message || 'Unexpected runtime error' };
  }

  render() {
    if (this.state.hasError) {
      return <CrashRecoveryScreen errorMsg={this.state.errorMsg} />;
    }
    return this.props.children;
  }
}
