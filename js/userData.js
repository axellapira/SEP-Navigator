// Tiny localStorage-backed store for per-user state (no accounts).
// Tracks: articles read, articles saved (favorites).
// All consumers subscribe to changes for reactive UI updates.

const READ_KEY = 'sep-read-v1';
const SAVED_KEY = 'sep-saved-v1';

function loadSet(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (_) {
    return new Set();
  }
}

function saveSet(key, set) {
  try { localStorage.setItem(key, JSON.stringify(Array.from(set))); } catch (_) {}
}

const state = {
  read: loadSet(READ_KEY),
  saved: loadSet(SAVED_KEY)
};

const listeners = new Set();
function emit() { listeners.forEach(fn => { try { fn(state); } catch (_) {} }); }

// We store per-article metadata for saved items so the reading list can render
// titles/categories even without a fresh data load.
const META_KEY = 'sep-saved-meta-v1';
const savedMeta = (() => {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) { return {}; }
})();
function saveMeta() {
  try { localStorage.setItem(META_KEY, JSON.stringify(savedMeta)); } catch (_) {}
}

const userData = {
  // Visited state (was "read")
  isVisited(id) { return state.read.has(id); },
  isRead(id)    { return state.read.has(id); }, // alias for back-compat
  markVisited(id, meta) {
    if (!id) return;
    const wasVisited = state.read.has(id);
    state.read.add(id);
    if (meta) {
      savedMeta[id] = { ...savedMeta[id], ...meta };
      saveMeta();
    }
    if (!wasVisited) {
      saveSet(READ_KEY, state.read);
      emit();
    } else if (meta) {
      emit();
    }
  },
  markRead(id, meta) { return this.markVisited(id, meta); }, // alias
  unmarkVisited(id) {
    if (!id || !state.read.has(id)) return;
    state.read.delete(id);
    saveSet(READ_KEY, state.read);
    emit();
  },
  unmarkRead(id) { return this.unmarkVisited(id); },
  allVisited() { return state.read; },
  allRead() { return state.read; },
  clearAllVisited() {
    if (state.read.size === 0) return;
    state.read.clear();
    saveSet(READ_KEY, state.read);
    emit();
  },
  allVisitedWithMeta() {
    return Array.from(state.read).map(id => ({
      id,
      ...(savedMeta[id] || { name: id })
    }));
  },

  // Saved/favorites state. meta is optional: {name, url, category, broaderCategory}
  isSaved(id) { return state.saved.has(id); },
  saveItem(id, meta) {
    if (!id) return;
    state.saved.add(id);
    if (meta) {
      savedMeta[id] = { ...savedMeta[id], ...meta };
      saveMeta();
    }
    saveSet(SAVED_KEY, state.saved);
    emit();
  },
  unsaveItem(id) {
    if (!id) return;
    state.saved.delete(id);
    delete savedMeta[id];
    saveMeta();
    saveSet(SAVED_KEY, state.saved);
    emit();
  },
  toggleSave(id, meta) {
    if (this.isSaved(id)) this.unsaveItem(id);
    else this.saveItem(id, meta);
  },
  allSaved() { return state.saved; },
  getMeta(id) { return savedMeta[id]; },
  allSavedWithMeta() {
    return Array.from(state.saved).map(id => ({
      id,
      ...(savedMeta[id] || { name: id })
    }));
  },

  // Subscribe to any change. Returns unsubscribe fn.
  subscribe(fn) {
    listeners.add(fn);
    fn(state);
    return () => listeners.delete(fn);
  },

  // Clear everything (used by Settings -> reset).
  reset() {
    state.read.clear();
    state.saved.clear();
    saveSet(READ_KEY, state.read);
    saveSet(SAVED_KEY, state.saved);
    try { localStorage.removeItem(META_KEY); } catch (_) {}
    Object.keys(savedMeta).forEach(k => delete savedMeta[k]);
    emit();
  }
};

export default userData;
