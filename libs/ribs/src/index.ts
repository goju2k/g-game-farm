/**
 * ribs is deliberately thin — a re-export of engine-react (which itself
 * re-exports engine's full surface, so the whole ecosystem is reachable
 * through this one import). Whether ribs needs bespoke top-level API of
 * its own (a higher-level "one-shot" convenience layer above GameCanvas)
 * is an open question, left for actual game development against this
 * package to answer — not decided up front.
 */
export * from '@g-game-farm/engine-react';
