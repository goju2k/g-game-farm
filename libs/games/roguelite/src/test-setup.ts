/**
 * jsdom implements no Gamepad API at all (navigator.getGamepads is simply
 * undefined) — mirrors engine-react's own test-setup.ts, kept here too in
 * case any test in this package ends up driving a real InputCapture.
 */
if (typeof navigator !== 'undefined' && typeof navigator.getGamepads !== 'function') {
  Object.defineProperty(navigator, 'getGamepads', {
    value: () => [],
    configurable: true,
  });
}
