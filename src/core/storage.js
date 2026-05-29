// ── JARVIS — src/core/storage.js ─────────────────────────────
// Typed localStorage wrapper.
// Centralises JSON.parse/stringify so callers never touch raw storage.

export const storage = {
  /**
   * Read and JSON-parse a key.
   * Returns `fallback` on missing key or malformed JSON.
   */
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },

  /** JSON-stringify `value` and write it to localStorage. */
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
};
