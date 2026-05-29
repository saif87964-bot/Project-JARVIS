// ── JARVIS — src/core/bus.js ──────────────────────────────────
// Minimal pub/sub event bus for decoupled cross-module communication.
// Modules emit events instead of importing each other directly.
//
// Usage:
//   bus.on('tasks:changed', data => ...)  // subscribe
//   bus.emit('tasks:changed', { count })  // publish
//
// Current events:
//   route:changed   { viewId }           — SPA navigation
//   cmd:response    { msg, err? }        — show message in command bar

const _listeners = Object.create(null);

export const bus = {
  /**
   * Subscribe to an event.
   * @returns {Function} Unsubscribe function
   */
  on(event, fn) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(fn);
    return () => {
      _listeners[event] = (_listeners[event] || []).filter(f => f !== fn);
    };
  },

  /** Publish an event, synchronously invoking all current subscribers. */
  emit(event, data) {
    (_listeners[event] || []).slice().forEach(fn => fn(data));
  },
};
