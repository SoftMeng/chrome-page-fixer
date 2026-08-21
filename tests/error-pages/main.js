// Intentional error fixtures for Phase 1 manual verification.
// Each entry has a clear source so the extension can be inspected line by line.

console.error("[fixture] console.error: typed-string-mismatch");

setTimeout(() => {
  throw new Error("[fixture] window.onerror: uncaught-throw");
}, 0);

Promise.reject(new Error("[fixture] unhandledrejection: async-failed"));

fetch("https://example.invalid/phase-1-missing.json").catch(() => {
  // Swallowed so the page keeps running; the network failure is the test target.
});