import { useEffect } from 'react';

/**
 * Global keyboard shortcuts: '/' and Ctrl+K / Cmd+K focus the search bar.
 * Guarded against active modal dialogs, editable fields, and modifier combinations.
 */
export function useKeyboardShortcuts({ searchInputRef, isPreviewOpen }) {
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (isPreviewOpen) return;

      const activeEl = document.activeElement;
      const tagName = activeEl?.tagName || '';
      const isEditable =
        tagName === 'INPUT' ||
        tagName === 'TEXTAREA' ||
        tagName === 'SELECT' ||
        Boolean(activeEl?.isContentEditable);

      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (
        e.key === '/' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !isEditable
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [searchInputRef, isPreviewOpen]);
}
