// Global HTMLAudioElement lifecycle guard:
// Guarantees at most one audio element plays at a time and synchronously pauses,
// clears `src`, flushes media pipelines (`load()`), and releases MediaSession on
// track switches, unmounts, modal closes, route changes, or page unloads.

const registeredAudioElements = new Set();
let unloadGuardAttached = false;

function clearMediaSessionState() {
  try {
    if (typeof navigator !== 'undefined' && navigator.mediaSession) {
      navigator.mediaSession.playbackState = 'none';
    }
  } catch {
    // Ignore MediaSession errors in restricted environments
  }
}

export function hardStopAudioElement(el) {
  if (!el) return;
  try {
    el.autoplay = false;
    el.pause();
  } catch {
    // Ignore pause errors
  }
  try {
    if (el.readyState > 0 && el.currentTime !== 0) {
      el.currentTime = 0;
    }
  } catch {
    // Ignore seek reset errors before metadata is ready
  }
  try {
    if (el.srcObject) {
      el.srcObject = null;
    }
    const hasSrc = Boolean(el.getAttribute('src') || el.currentSrc);
    if (hasSrc) {
      el.removeAttribute('src');
      el.load();
    }
  } catch {
    // Ignore media pipeline flush errors
  }
}

export function stopAllSiteAudio({ except = null } = {}) {
  const candidates = new Set(registeredAudioElements);
  if (typeof document !== 'undefined') {
    document.querySelectorAll('audio').forEach((el) => candidates.add(el));
  }

  candidates.forEach((el) => {
    if (!el || el === except) return;
    if (!el.isConnected) {
      hardStopAudioElement(el);
      registeredAudioElements.delete(el);
      return;
    }
    if (except) {
      try {
        el.autoplay = false;
        if (!el.paused) el.pause();
      } catch {
        // Ignore pause errors
      }
    } else {
      hardStopAudioElement(el);
    }
  });

  if (!except) {
    clearMediaSessionState();
  }
}

function ensureUnloadGuard() {
  if (unloadGuardAttached || typeof window === 'undefined') return;
  unloadGuardAttached = true;
  const handleUnload = () => stopAllSiteAudio();
  window.addEventListener('pagehide', handleUnload);
  window.addEventListener('beforeunload', handleUnload);
}

export function registerAudioElement(el) {
  if (!el) return () => {};
  ensureUnloadGuard();
  registeredAudioElements.add(el);

  const handlePlay = () => {
    stopAllSiteAudio({ except: el });
  };
  el.addEventListener('play', handlePlay);

  return () => {
    el.removeEventListener('play', handlePlay);
    hardStopAudioElement(el);
    registeredAudioElements.delete(el);
    if (registeredAudioElements.size === 0) {
      clearMediaSessionState();
    }
  };
}
