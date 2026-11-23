import React from 'react';
import { ThemeToggleButton } from './ThemeToggleButton.jsx';
import { Breadcrumbs } from './Breadcrumbs.jsx';

/**
 * Top institution bar with coverage badge, 3-state theme cycle toggle, About/Library
 * navigation button, and integrated Mobile Header Breadcrumb Strip.
 */
export function Header({
  isMobile,
  showWelcome,
  isNotFound,
  currentTab,
  navigateToHome,
  activeDateText,
  theme,
  onToggleTheme,
  onToggleNavTab,
  breadcrumbProps
}) {
  return (
    <header className="header-top">
      <div className={`header-top-row ${!showWelcome && !isNotFound && currentTab === 'library' ? 'mobile-hidden' : ''}`}>
        <a
          href="/"
          className="brand-section"
          onClick={navigateToHome}
          aria-label="Conceptualist Systems - Library Home"
        >
          <div className="brand-logo-text">
            Conceptualist <span className="brand-logo-accent">Systems</span>
          </div>
          <div className="brand-tagline">
            <span className="title">EDEXCEL LIBRARY</span>
            <span>Past Exam Papers & Resources</span>
          </div>
        </a>

        <div className="header-right-group">
          <div className="header-coverage-badge">
            <strong>{activeDateText}</strong>
          </div>
          <ThemeToggleButton
            theme={theme}
            onToggle={onToggleTheme}
            className="header-theme-btn"
            iconSize={14}
            ariaLabel="Toggle Theme"
          />
          <a
            href={currentTab !== 'library' ? '/' : '/about'}
            className={`header-nav-btn ${currentTab !== 'library' ? 'active' : ''}`}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
              e.preventDefault();
              onToggleNavTab();
            }}
          >
            {currentTab !== 'library' ? (
              <>
                <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="15 18 9 12 15 6" /></svg>
                <span>Library</span>
              </>
            ) : (
              'About'
            )}
          </a>
        </div>
      </div>

      {isMobile && currentTab === 'library' && !showWelcome && !isNotFound && (
        <div className="mobile-header-breadcrumb">
          <Breadcrumbs {...breadcrumbProps} classNameAdd="mobile-header-breadcrumb-content" />
          <ThemeToggleButton
            theme={theme}
            onToggle={onToggleTheme}
            className="mobile-breadcrumb-theme-btn"
            iconSize={13}
            compactTitle={true}
            ariaLabel={`Switch color theme (current: ${theme})`}
          />
        </div>
      )}
    </header>
  );
}
