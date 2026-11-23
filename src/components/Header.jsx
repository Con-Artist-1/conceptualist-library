import React from 'react';
import { BOARD_IDS, getBoardConfig } from '../data/boards.js';
import { shouldHandleClientNavigation } from '../lib/libraryHelpers.js';
import { ThemeToggleButton } from './ThemeToggleButton.jsx';
import { Breadcrumbs } from './Breadcrumbs.jsx';

/**
 * Top institution bar with international board switcher (Edexcel | Cambridge),
 * coverage badge, 3-state theme cycle toggle, About/Library navigation button,
 * and integrated Mobile Header Breadcrumb Strip.
 */
export function Header({
  isMobile,
  showWelcome,
  isNotFound,
  currentTab,
  activeBoard = 'edexcel',
  onSwitchBoard,
  navigateToHome,
  activeDateText,
  theme,
  onToggleTheme,
  onToggleNavTab,
  breadcrumbProps
}) {
  const boardCfg = getBoardConfig(activeBoard);
  const homeHref = activeBoard === 'cambridge' ? '/cambridge' : '/';
  const hideTopRowOnMobile = !showWelcome && !isNotFound && currentTab === 'library';

  return (
    <header className="header-top">
      <div className={`header-top-row ${hideTopRowOnMobile ? 'mobile-hidden' : ''}`}>
        <div className="header-left-group">
          <a
            href={homeHref}
            className="brand-section"
            onClick={navigateToHome}
            aria-label="Conceptualist Systems - Library Home"
          >
            <div className="brand-logo-text">
              Conceptualist <span className="brand-logo-accent">Systems</span>
            </div>
            <div className="brand-tagline">
              <span className="title">INTERNATIONAL ARCHIVE</span>
              <span>{boardCfg.label}</span>
            </div>
          </a>

          {onSwitchBoard && (
            <nav
              className="board-switcher desktop-board-switcher"
              aria-label="Select examination board"
            >
              {BOARD_IDS.map((bId) => {
                const cfg = getBoardConfig(bId);
                const isActive = activeBoard === bId;
                const href = bId === 'cambridge' ? '/cambridge' : '/';
                return (
                  <a
                    key={bId}
                    href={href}
                    className={`board-switch-btn ${isActive ? 'active' : ''}`}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={(e) => {
                      if (!shouldHandleClientNavigation(e)) return;
                      e.preventDefault();
                      onSwitchBoard(bId);
                    }}
                  >
                    {cfg.shortLabel}
                  </a>
                );
              })}
            </nav>
          )}
        </div>

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
            href={currentTab !== 'library' ? homeHref : '/about'}
            className={`header-nav-btn ${currentTab !== 'library' ? 'active' : ''}`}
            onClick={(e) => {
              if (!shouldHandleClientNavigation(e)) return;
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

      {isMobile && onSwitchBoard && !hideTopRowOnMobile && (
        <nav className="mobile-board-switcher-bar" aria-label="Select examination board">
          <div className="board-switcher mobile-board-switcher">
            {BOARD_IDS.map((bId) => {
              const cfg = getBoardConfig(bId);
              const isActive = activeBoard === bId;
              const href = bId === 'cambridge' ? '/cambridge' : '/';
              return (
                <a
                  key={bId}
                  href={href}
                  className={`board-switch-btn ${isActive ? 'active' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={(e) => {
                    if (!shouldHandleClientNavigation(e)) return;
                    e.preventDefault();
                    onSwitchBoard(bId);
                  }}
                >
                  {cfg.label}
                </a>
              );
            })}
          </div>
        </nav>
      )}

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
