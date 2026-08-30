/**
 * jsdom implements no Gamepad API at all (navigator.getGamepads is simply
 * undefined) — createInputCapture()'s gamepad sub-capture calls it
 * unconditionally every poll(), so any test that drives a real
 * InputCapture needs this stubbed, not just gamepad-specific tests.
 */
if (typeof navigator !== 'undefined' && typeof navigator.getGamepads !== 'function') {
  Object.defineProperty(navigator, 'getGamepads', {
    value: () => [],
    configurable: true,
  });
}
