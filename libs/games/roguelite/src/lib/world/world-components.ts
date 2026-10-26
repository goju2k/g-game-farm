import { defineComponent, type AABB, type EntityId } from '@g-game-farm/ribs';

/**
 * Wayfinding objects (demo level design 31 §0, §5, D-034): traces you
 * examine, braziers fire lights, seal doors that open on progress flags,
 * cracked walls only the big pillar breaks, skill pickups — and the arena
 * lock. Each lives in one room; what must outlive the room goes to
 * session.flags (see world-systems.ts).
 */

/** Cells of the room grid an object occupies (solid while it blocks), and their bounding box. */
export interface CellSpan {
  readonly cells: readonly { readonly column: number; readonly row: number }[];
  readonly box: AABB;
}

/** Can be examined (E / click it / tap) from within `range` px of its Position — fires its EventActor id's `interact` events. */
export interface Examinable {
  readonly range: number;
  /** Its clickable box, around Position. */
  readonly halfWidth: number;
  readonly height: number;
}
export const Examinable = defineComponent<Examinable>('roguelite:Examinable');

/** A trace (scratched wall, broken tablet, mural): drawn from its art id, or as a graybox slab. */
export interface Trace {
  readonly art?: string;
  /** Its record (data/events/records.json): examining it opens the record panel. */
  readonly record?: string;
}
export const Trace = defineComponent<Trace>('roguelite:Trace');

/** A cold brazier: fire (a quick shot or a pillar) lights it, which sets its progress flag. */
export interface Brazier {
  readonly flag: string;
  readonly lit: boolean;
  /** Hit by fire this step — the brazier system lights it. */
  readonly ignited?: boolean;
  /** Where its warmth runs once lit (back toward the hub). */
  readonly trail?: readonly { readonly x: number; readonly y: number }[];
}
export const Brazier = defineComponent<Brazier>('roguelite:Brazier');

/** An empty pedestal by the hub's seal door: a flame shows on it once its brazier's flag is set. */
export interface BrazierPedestal {
  readonly flag: string;
  readonly lit: boolean;
}
export const BrazierPedestal = defineComponent<BrazierPedestal>('roguelite:BrazierPedestal');

/** A seal door: solid until every one of its progress flags is set. */
export interface SealDoor extends CellSpan {
  readonly flags: readonly string[];
  readonly open: boolean;
  /** Opening (its flags just came true): ms so far — the way opens at the art's open:passable. */
  readonly openingMs?: number;
}
export const SealDoor = defineComponent<SealDoor>('roguelite:SealDoor');

/** A cracked wall: solid until a combo-finisher big pillar touches it; then its progress flag keeps it broken. */
export interface CrackedWall extends CellSpan {
  readonly flag: string;
  readonly broken: boolean;
  /** Only an event brings it down (`collapse`) — fire doesn't (the vista's wall, D-040). */
  readonly eventOnly?: boolean;
  /** Hit by a big pillar this step. */
  readonly struck?: boolean;
  /** Collapsing: ms so far — the way opens at the art's collapse:passable. */
  readonly collapsingMs?: number;
}
export const CrackedWall = defineComponent<CrackedWall>('roguelite:CrackedWall');

/** A skill on a pedestal (the shrine's pillar): examining it unlocks the skill. */
export interface SkillPickup {
  readonly skill: string;
  readonly taken: boolean;
}
export const SkillPickup = defineComponent<SkillPickup>('roguelite:SkillPickup');

/** An arena holding its exits shut (lockRoom / unlockRoom). Singleton per room. */
export interface RoomLock {
  readonly locked: boolean;
}
export const RoomLock = defineComponent<RoomLock>('roguelite:RoomLock');

/** This step's examine: what the player is close enough to examine, what they examined, and a click examine holding the quick spell off until released. Singleton per room. */
export interface ExamineState {
  readonly near?: EntityId;
  readonly examined?: string;
  readonly holdingClick: boolean;
}
export const ExamineState = defineComponent<ExamineState>('roguelite:ExamineState');

/** A lit brazier's warmth running back toward the hub (31 §2 progress cue): a light moving along `path`. */
export interface WarmTrail {
  readonly path: readonly { readonly x: number; readonly y: number }[];
  readonly speed: number;
  readonly travelled: number;
}
export const WarmTrail = defineComponent<WarmTrail>('roguelite:WarmTrail');

export const WORLD_COMPONENTS = [Examinable, Trace, Brazier, BrazierPedestal, SealDoor, CrackedWall, SkillPickup, RoomLock, ExamineState, WarmTrail] as const;
