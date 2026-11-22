import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';

function readSavedTheme() {
  try {
    const match = typeof document !== 'undefined' ? document.cookie.match(/(?:^|; )cs_theme=([^;]*)/) : null;
    const cookieTheme = match ? decodeURIComponent(match[1]) : null;
    if (cookieTheme === 'dark' || cookieTheme === 'light' || cookieTheme === 'oled') return cookieTheme;
    const localTheme = typeof localStorage !== 'undefined' ? localStorage.getItem('cs_theme') : null;
    if (localTheme === 'dark' || localTheme === 'light' || localTheme === 'oled') return localTheme;
  } catch {
    // Ignore storage errors
  }
  return null;
}

function getSystemTheme() {
  try {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
  } catch {
    // Ignore matchMedia errors
  }
  return 'light';
}

function getMetaThemeColor(theme) {
  if (theme === 'oled') return '#000000';
  return theme === 'dark' ? '#121417' : '#6F1D2B';
}

/**
 * Manages 3-state academic theme ('light' | 'dark' | 'oled') persistence,
 * View Transitions S-curve animation, meta theme-color sync, and modal-open scroll-root class.
 */
export function useTheme({ isPreviewOpen = false } = {}) {
  const [theme, setTheme] = useState(() => readSavedTheme() || getSystemTheme());
  const hasExplicitThemeRef = useRef(Boolean(readSavedTheme()));
  const themeSwitchRafRef = useRef(null);
  const activeThemeTransitionRef = useRef(null);
  const didMountThemeRef = useRef(false);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('modal-open', isPreviewOpen);
    return () => root.classList.remove('modal-open');
  }, [isPreviewOpen]);

  useLayoutEffect(() => {
    try {
      const root = document.documentElement;
      const isThemeChange = didMountThemeRef.current;
      didMountThemeRef.current = true;
      const isViewTransitionActive = root.classList.contains('theme-vt');

      if (isThemeChange && !isViewTransitionActive) {
        root.classList.add('theme-switching');
      }
      if (root.getAttribute('data-theme') !== theme) {
        root.setAttribute('data-theme', theme);
      }
      const metaTheme = document.getElementById('meta-theme-color');
      const metaColor = getMetaThemeColor(theme);
      if (metaTheme && metaTheme.getAttribute('content') !== metaColor) {
        metaTheme.setAttribute('content', metaColor);
      }

      if (isThemeChange && !isViewTransitionActive) {
        if (themeSwitchRafRef.current) {
          cancelAnimationFrame(themeSwitchRafRef.current);
        }
        themeSwitchRafRef.current = requestAnimationFrame(() => {
          themeSwitchRafRef.current = requestAnimationFrame(() => {
            root.classList.remove('theme-switching');
            themeSwitchRafRef.current = null;
          });
        });
      }
    } catch {
      // Ignore DOM sync errors
    }
  }, [theme]);

  useEffect(() => {
    return () => {
      if (themeSwitchRafRef.current) {
        cancelAnimationFrame(themeSwitchRafRef.current);
        themeSwitchRafRef.current = null;
      }
      if (activeThemeTransitionRef.current) {
        try {
          activeThemeTransitionRef.current.skipTransition();
        } catch {
          // Ignore stale transition cleanup
        }
        activeThemeTransitionRef.current = null;
      }
      document.documentElement.classList.remove('theme-vt', 'theme-switching');
    };
  }, []);

  useEffect(() => {
    if (!hasExplicitThemeRef.current) return;
    try {
      localStorage.setItem('cs_theme', theme);
      document.cookie = `cs_theme=${theme}; max-age=31536000; path=/; SameSite=Lax`;
    } catch {
      // Ignore storage errors
    }
  }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = (e) => {
      if (hasExplicitThemeRef.current) return;
      setTheme(e.matches ? 'dark' : 'light');
    };
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handleSystemThemeChange);
      return () => mql.removeEventListener('change', handleSystemThemeChange);
    }
    if (typeof mql.addListener === 'function') {
      mql.addListener(handleSystemThemeChange);
      return () => mql.removeListener(handleSystemThemeChange);
    }
    return undefined;
  }, []);

  const toggleTheme = useCallback(() => {
    hasExplicitThemeRef.current = true;
    const nextTheme = theme === 'light' ? 'dark' : theme === 'dark' ? 'oled' : 'light';
    const root = typeof document !== 'undefined' ? document.documentElement : null;
    const prefersReduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!root || prefersReduced || typeof document.startViewTransition !== 'function') {
      setTheme(nextTheme);
      return;
    }

    if (activeThemeTransitionRef.current) {
      try {
        activeThemeTransitionRef.current.skipTransition();
      } catch {
        // Ignore stale transition state
      }
      activeThemeTransitionRef.current = null;
    }

    root.classList.add('theme-vt', 'theme-switching');
    try {
      const vt = document.startViewTransition(() => {
        flushSync(() => {
          setTheme(nextTheme);
        });
        root.setAttribute('data-theme', nextTheme);
        const metaTheme = document.getElementById('meta-theme-color');
        if (metaTheme) metaTheme.setAttribute('content', getMetaThemeColor(nextTheme));
      });
      activeThemeTransitionRef.current = vt;
      vt.finished.finally(() => {
        if (activeThemeTransitionRef.current === vt) {
          activeThemeTransitionRef.current = null;
          root.classList.remove('theme-vt', 'theme-switching');
        }
      });
    } catch {
      activeThemeTransitionRef.current = null;
      root.classList.remove('theme-vt', 'theme-switching');
      setTheme(nextTheme);
    }
  }, [theme]);

  return { theme, toggleTheme };
}
