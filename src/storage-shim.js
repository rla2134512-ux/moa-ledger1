// App.jsx was originally built inside Claude Artifacts, which provides a
// built-in `window.storage` API. That API doesn't exist in a normal browser,
// so this file recreates the same interface using real localStorage —
// no changes needed anywhere else in App.jsx.
const PREFIX = "moa:";

window.storage = {
  async get(key) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw !== null ? { key, value: raw } : null;
    } catch (e) {
      return null;
    }
  },
  async set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, value);
      return { key, value };
    } catch (e) {
      return null;
    }
  },
  async delete(key) {
    localStorage.removeItem(PREFIX + key);
    return { key, deleted: true };
  },
  async list(prefix = "") {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX + prefix)) keys.push(k.slice(PREFIX.length));
    }
    return { keys };
  },
};
