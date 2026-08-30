export type PlayerFormId = 'flame' | 'mage';

/**
 * State that must survive a room transition — `SceneManager.load()` does a
 * full `world.clear()` between rooms (confirmed in the engine), so anything
 * that needs to outlive that wipe cannot live as ECS component state. This
 * is a plain mutable object living outside `World` entirely, created once
 * per game session and threaded by closure into every room's scene setup.
 *
 * Mutated directly in place, not through World.set()'s immutable-replace
 * convention — that convention exists specifically to keep World.snapshot()
 * safe and doesn't apply outside World. Same idiom as SnapshotStore's own
 * internal `value`.
 */
export interface RogueliteSession {
  currentForm: PlayerFormId;
  /** Set by roomExitTriggerSystem right before requestSceneChange(); consumed by createRoomScene's setup() to pick which RoomEntryPoint to spawn at. undefined on cold boot (first room uses its default entry point). */
  pendingEntryId: string | undefined;
}

export function createRogueliteSession(): RogueliteSession {
  return { currentForm: 'flame', pendingEntryId: undefined };
}
