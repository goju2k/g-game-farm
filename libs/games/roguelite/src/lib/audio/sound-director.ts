import { AnimationFrameTag, type EntityId, type System } from '@g-game-farm/ribs';
import { CombatPlayer, CombatStats, SentinelAwakened } from '../combat/combat-components.js';
import { Position } from '../components.js';
import { HitFlash } from '../fx/fx-components.js';
import { ExamineState } from '../world/world-components.js';
import type { SoundQueue } from './sound-cues.js';

/**
 * Turns what happened this simulation step into sound cues (Demo 0 sound
 * list, asset room sfx v1 timing notes). Two sources:
 * - animation frame tags (data: sounds.json "tags", e.g. "windup:cue" ->
 *   "sentinel-cue") — the sound lands on the drawn frame;
 * - state changes it sees step to step (a dash or parry starting and how it
 *   ends, a hit taken, an ember gained, a sentinel waking...) — so combat
 *   code stays free of sound. The player's own moves are read from state,
 *   not tags, because the ember form has no tagged art.
 * Runs late in the simulation phase, after everything moved and animated.
 */
export const SFX = {
  dashOut: 'dash-scatter',
  dashIn: 'dash-gather',
  parryTry: 'parry-try',
  parrySuccess: 'parry-success',
  parryFail: 'parry-fail',
  playerHit: 'player-hit',
  playerDown: 'player-down',
  emberGain: 'ember-gain',
  pillarCharge: 'pillar-charge',
  enemyHit: 'sentinel-hit',
  awaken: 'sentinel-awaken',
  moveHum: 'move-hum',
  comboSlot: 'combo-slot',
  comboFocus: 'combo-focus',
  comboSwitch: 'combo-switch',
  inspect: 'inspect',
} as const;

interface Seen {
  stats?: CombatStats;
  player?: { id: EntityId; hp: number | undefined; embers: number; parryActive: boolean; dashPhase: string | undefined; x: number; y: number; respawning: boolean; presses: number; flashing: boolean };
  awake: Set<EntityId>;
  flashed: Set<EntityId>;
  humming: boolean;
}

export function createSoundDirectorSystem(sound: SoundQueue, tagSounds: Readonly<Record<string, string>>): System {
  let seen: Seen = { awake: new Set(), flashed: new Set(), humming: false };
  return {
    name: 'roguelite:sound-director',
    order: 50,
    run: (ctx) => {
      for (const event of ctx.events.read(AnimationFrameTag)) {
        const asset = event.clip.split(':')[0];
        for (const tag of event.tags) {
          // "asset/tag" first (two pillars share pillar:start), then the bare tag.
          const id = tagSounds[`${asset}/${tag}`] ?? tagSounds[tag];
          if (id) sound.sfx(id);
        }
      }

      const stats = [...ctx.world.query([CombatStats] as const)][0]?.[1];
      const playerRow = [...ctx.world.query([CombatPlayer, Position] as const)][0];
      // A new room (the player entity changed): start fresh, don't diff across rooms.
      if (playerRow && seen.player && seen.player.id !== playerRow[0]) seen = { awake: new Set(), flashed: new Set(), humming: seen.humming };

      if (stats && seen.stats) {
        if (stats.parryAttempts > seen.stats.parryAttempts) sound.sfx(SFX.parryTry);
        if (stats.parrySuccesses > seen.stats.parrySuccesses) sound.sfx(SFX.parrySuccess);
        if (stats.hitsTaken > seen.stats.hitsTaken) sound.sfx(SFX.playerHit);
        if (stats.castsStarted > seen.stats.castsStarted) sound.sfx(SFX.pillarCharge);
      }

      let humming = false;
      if (playerRow) {
        const [id, player, position] = playerRow;
        const parryActive = player.action.kind === 'parry' && player.action.phase === 'active';
        const respawning = player.action.kind === 'respawning';
        const dashPhase = player.action.kind === 'dash' ? player.action.phase : undefined;
        const before = seen.player;
        if (before && before.id === id) {
          // The parry window closed without a success: the miss sound.
          if (before.parryActive && !parryActive && !(stats && seen.stats && stats.parrySuccesses > seen.stats.parrySuccesses)) sound.sfx(SFX.parryFail);
          if (respawning && !before.respawning) sound.sfx(SFX.playerDown);
          // Combo (27_skill-combo §4): a soft tick per press, the bonus sound on a finisher.
          const presses = player.combo?.presses.length ?? 0;
          if (presses > before.presses) sound.sfx(SFX.comboSlot);
          if (player.comboFlash && !before.flashing) sound.sfx(player.comboFlash.bonus === 'focus' ? SFX.comboFocus : SFX.comboSwitch);
          // Dash: scatter as it leaves, gather as it lands.
          if (dashPhase !== undefined && before.dashPhase === undefined) sound.sfx(SFX.dashOut);
          if (dashPhase === 'recover' && before.dashPhase !== 'recover') sound.sfx(SFX.dashIn);
          if (player.embers > before.embers) sound.sfx(SFX.emberGain);
          humming = !respawning && (Math.abs(position.x - before.x) > 0.05 || Math.abs(position.y - before.y) > 0.05);
        }
        seen.player = { id, hp: player.hp, embers: player.embers, parryActive, dashPhase, x: position.x, y: position.y, respawning, presses: player.combo?.presses.length ?? 0, flashing: player.comboFlash !== undefined };
      } else {
        seen.player = undefined;
      }
      if (humming !== seen.humming) sound.loop(SFX.moveHum, humming);
      seen.humming = humming;
      seen.stats = stats;

      // Examining something (E / click / tap).
      if ([...ctx.world.query([ExamineState] as const)][0]?.[1].examined !== undefined) sound.sfx(SFX.inspect);

      // Enemies: a fresh hit flash is a hit; a sleeper starting to wake is the awaken cue.
      const flashed = new Set<EntityId>();
      for (const [id] of ctx.world.query([HitFlash] as const)) {
        if (playerRow && id === playerRow[0]) continue;
        flashed.add(id);
        if (!seen.flashed.has(id)) sound.sfx(SFX.enemyHit);
      }
      seen.flashed = flashed;
      const awake = new Set<EntityId>();
      for (const [id, sentinel] of ctx.world.query([SentinelAwakened] as const)) {
        if (sentinel.state === 'asleep') continue;
        awake.add(id);
        if (!seen.awake.has(id) && sentinel.state === 'waking') sound.sfx(SFX.awaken);
      }
      seen.awake = awake;
    },
  };
}
