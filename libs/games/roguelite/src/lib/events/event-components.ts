import { defineComponent, type EntityId } from '@g-game-farm/ribs';

/** While locked, the player's intents are ignored (event spec §3: lockInput/unlockInput). Singleton per room. */
export interface InputLock {
  readonly locked: boolean;
}
export const InputLock = defineComponent<InputLock>('roguelite:InputLock');

/**
 * Where the camera looks, kept by the simulation so events can pan it
 * (event spec §3 camera.*). `follow` tracks an actor (default the player)
 * every step; `fixed` holds x,y while a pan tweens them. x,y are always the
 * current camera center. Singleton per room; the camera render system uses it.
 */
export interface CameraDirector {
  readonly mode: 'follow' | 'fixed';
  readonly target: string;
  readonly x: number;
  readonly y: number;
}
export const CameraDirector = defineComponent<CameraDirector>('roguelite:CameraDirector');

/** A full-screen fade owned by events (black, or white for the form-change flash). Singleton while any is visible. */
export interface EventFade {
  readonly color: 'black' | 'white';
  readonly alpha: number;
}
export const EventFade = defineComponent<EventFade>('roguelite:EventFade');

/** Room ambient light level set by events (light.ambient), overriding the room's base ambient. Singleton. */
export interface AmbientOverride {
  readonly level: number;
}
export const AmbientOverride = defineComponent<AmbientOverride>('roguelite:AmbientOverride');

/** Names an entity so event scripts can refer to it ("companion", "artifact", "far-glimmer"). The player is always "player"/"ember". */
export interface EventActor {
  readonly id: string;
}
export const EventActor = defineComponent<EventActor>('roguelite:EventActor');

/** A head-top emote bubble (event spec §4): pops in 0.1s, holds, pops out 0.1s. */
export interface Emote {
  readonly icon: 'ellipsis' | 'exclaim' | 'question';
  readonly framesLeft: number;
  readonly totalF: number;
}
export const Emote = defineComponent<Emote>('roguelite:Emote');

/**
 * The companion ("small light", graybox: a gold-white dot + light). Its
 * brightness steps down when it goes quiet ({dim}, setBrightness — bible §7).
 * Once `following`, it floats `followDistance` px behind the player, bobbing.
 */
export interface Companion {
  readonly brightness: number;
  readonly following: boolean;
}
export const Companion = defineComponent<Companion>('roguelite:Companion');

/** A slow sine pulse on an entity's LightEmitter radius (the artifact). */
export interface LightPulse {
  readonly base: number;
  readonly amplitude: number;
  readonly periodMs: number;
  readonly phaseMs: number;
}
export const LightPulse = defineComponent<LightPulse>('roguelite:LightPulse');

/** A glowing dot drawn at an entity — spawned lights, the artifact. Color as 0..1 RGB. */
export interface GlowDot {
  readonly size: number;
  readonly color: readonly [number, number, number];
}
export const GlowDot = defineComponent<GlowDot>('roguelite:GlowDot');

/**
 * Burnable vines blocking a passage (opening scene E-2): their cells are
 * solid in the room grid until a quick spell touches them. `touching` tracks
 * contact so each new bump counts once toward the "vine-touch" fail count.
 */
export interface Vine {
  readonly cells: readonly { readonly column: number; readonly row: number }[];
  readonly box: Readonly<{ x: number; y: number; width: number; height: number }>;
  readonly touching: boolean;
  /** Its sprites, one per cell (event-art.ts); empty = graybox. */
  readonly sprites?: readonly EntityId[];
  /** Set: once burnt it stays burnt for the run (session.flags) — a vine you come back past. */
  readonly progressFlag?: string;
  /** Hits still needed before it burns (the hub's vine door: 3). Undefined = 1. */
  readonly hitsLeft?: number;
  /** Set once burning: ms since the spell touched it. The way opens at the burn clip's burn:clear. */
  readonly burningMs?: number;
}
export const Vine = defineComponent<Vine>('roguelite:Vine');

/** Per-room trigger bookkeeping (event spec §2). Singleton per room. */
export interface RoomEvents {
  readonly roomId: string;
  readonly started: boolean;
  readonly idleMs: number;
  readonly failCounts: Readonly<Record<string, number>>;
}
export const RoomEvents = defineComponent<RoomEvents>('roguelite:RoomEvents');

export const EVENT_COMPONENTS = [InputLock, CameraDirector, EventFade, AmbientOverride, EventActor, Emote, Companion, LightPulse, GlowDot, Vine, RoomEvents] as const;
