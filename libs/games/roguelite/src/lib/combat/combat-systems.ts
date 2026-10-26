import { overlaps, type ComponentType, type EntityId, type System, type World } from '@g-game-farm/ribs';
import { ScriptedClip } from '../events/event-components.js';
import { comboBreak, comboCastUsed, comboLevel, comboMoveDone, comboParried, comboPress, comboTick, EMPTY_COMBO, type ComboBonus } from '../rules/combo.js';
import { playClip, syncClipToTag } from '../anim/play-clip.js';
import { Animator, Flags, LightEmitter, Position, SpriteRender } from '../components.js';
import {
  CombatCheckpoint,
  CombatPlayer,
  CombatStats,
  HitStop,
  ParrySpark,
  ScreenFade,
  ScreenShake,
  SentinelAwakened,
  SentinelMelee,
  type PlayerAction,
  type PillarShot,
} from './combat-components.js';
import { combatDataForDevice, type CombatData, type PlayerFormKey } from './combat-data.js';
import { boxAt, boxCenter, fourWay, isHitStopped, movePoint, normalize, sentinelAttackBox } from './combat-geometry.js';
import { identityIntentTransform, readIntent, updateInputBuffer, type IntentTransform, type PlayerIntent } from './intent.js';
import { clampCastAim, fireCastSpell, fireFan, fireQuickSpell } from './spells.js';
import { InputLock } from '../events/event-components.js';
import { ExamineState } from '../world/world-components.js';

/** What the player "wants" while an event holds the input: nothing. */
const LOCKED_INTENT: PlayerIntent = { moveX: 0, moveY: 0, dash: false, parry: false, quickSpell: false, quickSpellHeld: false, castSpell: false, aim: undefined, touch: false };

/** Every step is one spec frame: the engine runs at 60Hz (see combat-data.ts). */
const STEPS_PER_SECOND = 60;
const PARRY_SPARK_F = 12;
/** Where the child's hand flame is relative to its anchor, facing right — quick-spell shots start here. */
const QUICK_SPELL_HAND = { x: 12, y: -9 } as const;

function singleton<T>(world: World, type: ComponentType<T>): [EntityId, T] | undefined {
  for (const [id, value] of world.query([type] as const)) {
    return [id, value];
  }
  return undefined;
}

function bumpStats(world: World, change: Partial<Record<keyof CombatStats, number>>): void {
  const found = singleton(world, CombatStats);
  if (!found) return;
  const [id, stats] = found;
  const next = { ...stats };
  for (const [key, delta] of Object.entries(change) as [keyof CombatStats, number][]) {
    next[key] = stats[key] + delta;
  }
  world.set(id, CombatStats, next);
}

/** The clip a form shows for an action. The ember look splits the dash into phase clips; the child form's dash clip already covers all three. */
export function clipForAction(form: PlayerFormKey, action: PlayerAction): string {
  if (form === 'child') {
    if (action.kind === 'dash') return 'dash';
    if (action.kind === 'parry') return 'parry';
    return 'float'; // free, casting (no cast pose yet), respawning
  }
  if (action.kind === 'dash') return action.phase; // charge | travel | recover
  return 'idle';
}

/**
 * Input phase, first: turns HitStop.framesLeft into `frozen` for exactly
 * that many steps (see the HitStop component).
 */
export const hitStopClockSystem: System = {
  name: 'roguelite:combat/hit-stop-clock',
  order: -100,
  run: (ctx) => {
    const found = singleton(ctx.world, HitStop);
    if (!found) return;
    const [id, stop] = found;
    if (stop.framesLeft > 0) {
      ctx.world.set(id, HitStop, { framesLeft: stop.framesLeft - 1, frozen: true });
    } else if (stop.frozen) {
      ctx.world.set(id, HitStop, { framesLeft: 0, frozen: false });
    }
  },
};

/** How long a finisher's bonus icon shows by the hand (27_skill-combo §4). */
export const COMBO_FLASH_F = 30;

/** A quick-spell press (L) through the combo grammar: arms the windup; on a finisher the pending shot becomes the fan. */
function pressQuick(data: CombatData, player: CombatPlayer, aim: Readonly<{ x: number; y: number }> | undefined): CombatPlayer {
  const pressed = comboPress(player.combo ?? EMPTY_COMBO, 'L', comboLevel(data.combo, player.form), data.combo);
  return {
    ...player,
    combo: pressed.state,
    quickFinish: pressed.move.kind === 'finish' ? pressed.move.bonus : undefined,
    quickCooldownF: data.spells.quick.cooldownF,
    quickWindupF: data.spells.quick.windupF,
    quickAim: aim,
  };
}

/**
 * A finisher went off: show its bonus; switch (and rhythm) slip away in an
 * automatic short dash — the way the player is moving, else back from the
 * aim; rhythm also earns embers (27_skill-combo §3).
 */
function applyFinish(data: CombatData, player: CombatPlayer, bonus: ComboBonus, at: Position, move: Readonly<{ x: number; y: number }>, aim: Readonly<{ x: number; y: number }> | undefined): CombatPlayer {
  let next: CombatPlayer = { ...player, comboFlash: { bonus, framesLeft: COMBO_FLASH_F } };
  if (bonus === 'rhythm') next = { ...next, embers: Math.min(data.embers.max, next.embers + data.combo.rhythm.embers) };
  if (bonus === 'switch' || bonus === 'rhythm') {
    const away = aim ? normalize(at.x - aim.x, at.y - aim.y) : normalize(-player.facingX, -player.facingY);
    const dir = move.x !== 0 || move.y !== 0 ? normalize(move.x, move.y) : away.x !== 0 || away.y !== 0 ? away : { x: -1, y: 0 };
    const dash = data.combo.switchDash;
    next = { ...next, action: { kind: 'dash', phase: 'travel', framesLeft: dash.travelF, dirX: dir.x, dirY: dir.y, auto: { stepPx: dash.distance / Math.max(1, dash.travelF) } } };
  }
  return next;
}

/** A pillar went off (instantly or at the end of its cast): the combo window opens; a finisher sets the cast cooldown and applies its bonus. */
function afterPillar(data: CombatData, player: CombatPlayer, shot: PillarShot, at: Position, move: Readonly<{ x: number; y: number }>, aim: Readonly<{ x: number; y: number }>): CombatPlayer {
  const done: CombatPlayer = { ...player, combo: comboMoveDone(player.combo ?? EMPTY_COMBO, data.combo) };
  if (!shot.finish) return done;
  return applyFinish(data, { ...done, castCooldownF: data.spells.cast.cooldownF }, shot.finish, at, move, aim);
}

/** Spec §2-3: movement, dash (charge -> travel -> recover, cooldown), parry (startup -> active -> recovery), with a 6f input buffer. */
export function createPlayerCombatSystem(baseData: CombatData, transform: IntentTransform = identityIntentTransform): System {
  const touchData = combatDataForDevice(baseData, true);
  function startBuffered(data: CombatData, world: World, player: CombatPlayer, intent: PlayerIntent, position: Position): CombatPlayer {
    const buffered = player.buffer;
    if (!buffered) return player;
    const form = data.playerForms[player.form];
    if (buffered.action === 'parry') {
      bumpStats(world, { parryAttempts: 1 });
      return { ...player, buffer: undefined, action: { kind: 'parry', phase: 'startup', framesLeft: data.parry.startupF } };
    }
    if (buffered.action === 'dash' && player.dashCooldownF === 0) {
      const dir = intent.moveX !== 0 || intent.moveY !== 0 ? normalize(intent.moveX, intent.moveY) : normalize(player.facingX, player.facingY);
      bumpStats(world, { dashes: 1 });
      const charge = form.dash.chargeF;
      return {
        ...player,
        buffer: undefined,
        action: charge > 0 ? { kind: 'dash', phase: 'charge', framesLeft: charge, dirX: dir.x, dirY: dir.y } : { kind: 'dash', phase: 'travel', framesLeft: form.dash.travelF, dirX: dir.x, dirY: dir.y },
      };
    }
    // Spells (spec §5) — Act 2+ only: the ember has none.
    if (!data.embers.enabledForms.includes(player.form) || !intent.aim) return player;
    const hand = boxCenter(boxAt(position, form.hurtbox));
    if (buffered.action === 'quickSpell' && player.quickCooldownF === 0 && player.quickWindupF === 0) {
      return { ...pressQuick(data, player, intent.aim), buffer: undefined };
    }
    if (buffered.action === 'castSpell' && player.canCast === false) return { ...player, buffer: undefined }; // no pillar yet
    if (buffered.action === 'castSpell' && player.castCooldownF === 0) {
      const cast = data.spells.cast;
      const aim = clampCastAim(hand, intent.aim, data);
      const afterParry = [...world.query([SentinelMelee] as const)].some(([, sentinel]) => sentinel.state === 'stunned');
      const level = comboLevel(data.combo, player.form);
      if (level > 0) {
        // Skill combo (27_skill-combo §3): a link R is the quick pillar, a finisher R the big one.
        const pressed = comboPress(player.combo ?? EMPTY_COMBO, 'R', level, data.combo);
        let combo = pressed.state;
        let embers = player.embers;
        let shot: PillarShot;
        let delayF: number;
        let usedEmber = false;
        if (pressed.move.kind === 'link') {
          const link = data.combo.linkPillar;
          shot = { radius: link.radius, damage: link.damage, art: 'quick' };
          delayF = link.castDelayF;
        } else {
          const finish = data.combo.finishPillar;
          const focus = pressed.move.bonus === 'focus' ? data.combo.focus : { damageMul: 1, sizeMul: 1 };
          shot = { radius: finish.radius * focus.sizeMul, damage: finish.damage * focus.damageMul, burn: finish.burn, finish: pressed.move.bonus, art: 'big' };
          delayF = finish.castDelayF;
        }
        if (combo.nextCastInstant) {
          // A parry success: this cast skips its cast time.
          combo = comboCastUsed(combo);
          delayF = 0;
        } else if (pressed.move.kind === 'finish' && cast.emberCost > 0 && embers >= cast.emberCost) {
          // An ember fires the big pillar at once (spec §4).
          embers -= cast.emberCost;
          delayF = 0;
          usedEmber = true;
        }
        bumpStats(world, { castsStarted: 1, castsWithEmber: usedEmber ? 1 : 0, castsAfterParry: afterParry ? 1 : 0 });
        const next: CombatPlayer = { ...player, buffer: undefined, combo, embers };
        if (delayF > 0) return { ...next, action: { kind: 'casting', framesLeft: delayF, aimX: aim.x, aimY: aim.y, pillar: shot } };
        fireCastSpell(world, aim, data, shot);
        return afterPillar(data, next, shot, position, { x: intent.moveX, y: intent.moveY }, aim);
      }
      if (player.embers >= cast.emberCost && cast.emberCost > 0) {
        // Spending an ember skips the cast delay entirely (spec §4).
        fireCastSpell(world, aim, data);
        bumpStats(world, { castsStarted: 1, castsWithEmber: 1, castsAfterParry: afterParry ? 1 : 0 });
        return { ...player, buffer: undefined, embers: player.embers - cast.emberCost, castCooldownF: cast.cooldownF };
      }
      bumpStats(world, { castsStarted: 1, castsAfterParry: afterParry ? 1 : 0 });
      return { ...player, buffer: undefined, action: { kind: 'casting', framesLeft: cast.castDelayF, aimX: aim.x, aimY: aim.y } };
    }
    return player;
  }

  return {
    name: 'roguelite:combat/player',
    run: (ctx) => {
      if (isHitStopped(ctx.world)) return;
      for (const [id, start, position] of ctx.world.query([CombatPlayer, Position] as const)) {
        // An event holding the input (lockInput) leaves the player standing still.
        const locked = [...ctx.world.query([InputLock] as const)][0]?.[1].locked ?? false;
        const read = locked ? LOCKED_INTENT : transform(readIntent(ctx.input));
        // A click that examined something (or is still held from it) isn't a quick spell.
        const examine = [...ctx.world.query([ExamineState] as const)][0]?.[1];
        const intent = examine && (examine.examined !== undefined || examine.holdingClick) ? { ...read, quickSpell: false, quickSpellHeld: false } : read;
        // Input-feel numbers follow the device the player is using (touch spec §4); everything else is the same data.
        const data = intent.touch ? touchData : baseData;
        const form = data.playerForms[start.form];
        let player: CombatPlayer = {
          ...start,
          buffer: updateInputBuffer(start.buffer, intent, data.inputBufferF),
          dashCooldownF: Math.max(0, start.dashCooldownF - 1),
          quickCooldownF: Math.max(0, start.quickCooldownF - 1),
          castCooldownF: Math.max(0, start.castCooldownF - 1),
          invulnerableF: Math.max(0, start.invulnerableF - 1),
        };
        let pos = position;

        if (intent.moveX !== 0 || intent.moveY !== 0) {
          player = { ...player, facingX: intent.moveX, facingY: intent.moveY };
        }

        const action = player.action;
        if (action.kind === 'respawning') {
          player = { ...player, buffer: undefined };
        } else if (action.kind === 'dash') {
          const dash = form.dash;
          if (action.phase === 'travel') {
            const step = action.auto ? action.auto.stepPx : dash.distance / dash.travelF;
            const moved = movePoint(ctx.world, pos, form.wallCollider, action.dirX * step, action.dirY * step);
            pos = { x: moved.x, y: moved.y };
            const left = action.framesLeft - 1;
            const ended: PlayerAction = action.auto ? { kind: 'free' } : { kind: 'dash', phase: 'recover', framesLeft: dash.recoverF, dirX: action.dirX, dirY: action.dirY };
            player = { ...player, action: left > 0 && !moved.blocked ? { ...action, framesLeft: left } : ended };
          } else if (action.framesLeft > 1) {
            player = { ...player, action: { ...action, framesLeft: action.framesLeft - 1 } };
          } else if (action.phase === 'charge') {
            player = { ...player, action: { ...action, phase: 'travel', framesLeft: dash.travelF } };
          } else {
            player = { ...player, action: { kind: 'free' }, dashCooldownF: dash.cooldownF };
          }
        } else if (action.kind === 'casting') {
          // Rooted; when the delay runs out the pillar goes off at the aim fixed at cast start.
          if (action.framesLeft > 1) {
            player = { ...player, action: { ...action, framesLeft: action.framesLeft - 1 } };
          } else if (action.pillar) {
            const aim = { x: action.aimX, y: action.aimY };
            fireCastSpell(ctx.world, aim, data, action.pillar);
            player = afterPillar(data, { ...player, action: { kind: 'free' } }, action.pillar, pos, { x: intent.moveX, y: intent.moveY }, aim);
          } else {
            fireCastSpell(ctx.world, { x: action.aimX, y: action.aimY }, data);
            player = { ...player, action: { kind: 'free' }, castCooldownF: data.spells.cast.cooldownF };
          }
        } else if (action.kind === 'parry') {
          if (action.framesLeft > 1) {
            player = { ...player, action: { ...action, framesLeft: action.framesLeft - 1 } };
          } else if (action.phase === 'startup') {
            player = { ...player, action: { kind: 'parry', phase: 'active', framesLeft: data.parry.activeF } };
          } else if (action.phase === 'active') {
            // The window closed on nothing: a missed parry breaks the combo (27_skill-combo §3).
            player = { ...player, action: { kind: 'parry', phase: 'recovery', framesLeft: data.parry.whiffRecoveryF }, combo: comboBreak(player.combo ?? EMPTY_COMBO) };
          } else {
            player = { ...player, action: { kind: 'free' } };
          }
        }

        if (player.action.kind === 'free') {
          // Recovering into free acts on a buffered press the same step (spec §1).
          player = startBuffered(data, ctx.world, player, intent, pos);
        }
        // Quick spell (D-025): a trigger starts a windupF windup and the shot leaves the hand at its end
        // (the fire clip's fire:release), aimed where the player aims *then*. Held, it re-triggers every
        // cooldownF while moving at full speed. Dash, parry or a cast cut a pending shot.
        if (data.embers.enabledForms.includes(player.form)) {
          if (player.action.kind !== 'free') {
            // A dash, parry or cast cut the pending shot: that press is spent, the combo window opens.
            if (player.quickWindupF > 0) player = { ...player, quickWindupF: 0, quickFinish: undefined, combo: comboMoveDone(player.combo ?? EMPTY_COMBO, data.combo) };
          } else {
            const startedByPress = start.quickWindupF === 0 && player.quickWindupF > 0; // via the input buffer, this step
            if (player.quickWindupF > 0 && !startedByPress) {
              const left = player.quickWindupF - 1;
              player = { ...player, quickWindupF: left };
              if (left === 0) {
                // From the hand flame: anchor + (12, -9) facing right (asset note), mirrored facing left.
                const facing = player.facingX < 0 ? -1 : 1;
                const hand = { x: pos.x + facing * QUICK_SPELL_HAND.x, y: pos.y + QUICK_SPELL_HAND.y };
                const aim = intent.aim ?? player.quickAim ?? { x: hand.x + facing * 16, y: hand.y + player.facingY * 16 };
                const finish = player.quickFinish;
                if (finish) fireFan(ctx.world, hand, aim, data, finish === 'focus');
                else fireQuickSpell(ctx.world, hand, aim, data);
                player = { ...player, quickFinish: undefined, combo: comboMoveDone(player.combo ?? EMPTY_COMBO, data.combo) };
                if (finish) player = applyFinish(data, player, finish, pos, { x: intent.moveX, y: intent.moveY }, aim);
              }
            }
            if (!startedByPress && player.action.kind === 'free' && intent.quickSpellHeld && player.quickCooldownF === 0 && player.quickWindupF === 0) {
              player = pressQuick(data, player, intent.aim); // held: L, L, ... (27_skill-combo §3)
            }
            // While firing, face the aim — moving keeps its speed, only the look turns.
            if ((intent.quickSpellHeld || player.quickWindupF > 0) && intent.aim) {
              const hand = boxCenter(boxAt(pos, form.hurtbox));
              const look = Math.sign(intent.aim.x - hand.x);
              if (look !== 0) player = { ...player, facingX: look };
            }
          }
        }
        // The combo's continue window runs once the last move is over: free, and the quick spell ready again (a dash pauses it).
        if (player.combo) player = { ...player, combo: comboTick(player.combo, player.action.kind === 'free' && player.quickWindupF === 0 && player.quickCooldownF === 0) };
        if (player.comboFlash) player = { ...player, comboFlash: player.comboFlash.framesLeft > 1 ? { ...player.comboFlash, framesLeft: player.comboFlash.framesLeft - 1 } : undefined };
        if (player.action.kind === 'free' && (intent.moveX !== 0 || intent.moveY !== 0)) {
          const dir = normalize(intent.moveX, intent.moveY);
          const speed = form.moveSpeed / STEPS_PER_SECOND;
          const moved = movePoint(ctx.world, pos, form.wallCollider, dir.x * speed, dir.y * speed);
          pos = { x: moved.x, y: moved.y };
        }

        ctx.world.set(id, CombatPlayer, player);
        if (pos !== position) {
          ctx.world.set(id, Position, pos);
        }

        const sprite = ctx.world.get(id, SpriteRender);
        const flipX = player.facingX < 0 ? true : player.facingX > 0 ? false : sprite?.flipX;
        if (sprite && flipX !== sprite.flipX) {
          ctx.world.set(id, SpriteRender, { ...sprite, flipX });
        }
        const animator = ctx.world.get(id, Animator);
        // A shot just triggered: the child's fire clip (D-025), held until it finishes, then back to float.
        const shotStarted = start.quickWindupF === 0 && player.quickWindupF > 0;
        const firing = player.form === 'child' && player.action.kind === 'free' && animator !== undefined && 'fire' in animator.clips && (shotStarted || (animator.current === 'fire' && !animator.state.finished));
        const quickDash = player.action.kind === 'dash' && player.action.auto !== undefined && animator !== undefined && 'dash-quick' in animator.clips;
        const clip = firing ? 'fire' : quickDash ? 'dash-quick' : clipForAction(player.form, player.action);
        const restartDash = player.action.kind === 'dash' && start.action.kind !== 'dash';
        // An event's clip on the player (anim / setForm intro) plays out first — or stays, if held.
        const scripted = ctx.world.get(id, ScriptedClip);
        const scriptedOn = scripted !== undefined && animator?.current === scripted.clip && (scripted.hold || !animator.state.finished);
        if (scripted && !scriptedOn) ctx.world.remove(id, ScriptedClip);
        if (!scriptedOn && animator && clip in animator.clips && (animator.current !== clip || restartDash || (firing && shotStarted))) {
          playClip(ctx.world, id, clip);
        }
        // The child's single dash clip: the simulation's phase clock leads, the art jumps to match
        // (planning D-021 — its drawn charge is still longer than the 5f data charge).
        const now = player.action;
        const before = start.action;
        if (player.form === 'child' && !quickDash && now.kind === 'dash' && (before.kind !== 'dash' || before.phase !== now.phase) && now.phase !== 'charge') {
          syncClipToTag(ctx.world, id, `dash:${now.phase}`);
        }
        const wasCasting = start.action.kind === 'casting';
        const isCasting = player.action.kind === 'casting';
        if (data.embers.enabledForms.includes(player.form) && wasCasting !== isCasting) {
          // The hand flame swells while casting — the enemy-readable "danger now" cue (spec §5). Only on the
          // change, so an event's light.tween on the hand flame (the first warm light) isn't overwritten.
          const light = ctx.world.get(id, LightEmitter);
          const radius = isCasting ? data.handFlame.castingRadius : data.handFlame.radius;
          if (light && light.radius !== radius) ctx.world.set(id, LightEmitter, { ...light, radius });
        }
      }
    },
  };
}

/** Where sentinels aim: the center of the player's hurtbox. */
function playerTarget(world: World, data: CombatData): { position: { x: number; y: number }; respawning: boolean } | undefined {
  for (const [, player, position] of world.query([CombatPlayer, Position] as const)) {
    return { position: boxCenter(boxAt(position, data.playerForms[player.form].hurtbox)), respawning: player.action.kind === 'respawning' };
  }
  return undefined;
}

/** Spec §8-2 melee sentinel: approach -> windup (cue in the last frames) -> active -> recovery -> wait; parry stuns or stops it. */
export function createSentinelMeleeSystem(data: CombatData): System {
  const stats = data.enemies['sentinel-melee'];
  // Start the windup only where the attack box can actually land: attackRange,
  // capped by the box's reach (half body + depth) so a player standing still is hit.
  const engageRange = Math.min(stats.attackRange, Math.min(stats.body.width, stats.body.height) / 2 + stats.attackBox.depth);
  return {
    name: 'roguelite:combat/sentinel-melee',
    order: 0.5,
    run: (ctx) => {
      if (isHitStopped(ctx.world)) return;
      const target = playerTarget(ctx.world, data);
      for (const [id, sentinel, position] of ctx.world.query([SentinelMelee, Position] as const)) {
        let next: SentinelMelee = sentinel;
        let pos = position;
        const tick = () => sentinel.framesLeft - 1;
        switch (sentinel.state) {
          case 'dormant':
            break;
          case 'defeated':
            // Test room: back at its post with full health after reviveF; otherwise it stays down.
            if (sentinel.reviveF !== undefined) {
              if (tick() > 0) next = { ...sentinel, framesLeft: tick() };
              else {
                next = { ...sentinel, state: 'wait', framesLeft: stats.intervalF - stats.recoveryF, hp: stats.hp, attackSpent: true };
                pos = sentinel.home;
              }
            }
            break;
          case 'approach': {
            if (!target || target.respawning) break;
            const toX = target.position.x - pos.x;
            const toY = target.position.y - pos.y;
            if (Math.hypot(toX, toY) <= engageRange) {
              const dir = fourWay(toX, toY);
              next = { ...sentinel, state: 'windup', framesLeft: sentinel.windupF ?? stats.windupF, dirX: dir.x, dirY: dir.y };
            } else {
              const dir = normalize(toX, toY);
              const speed = stats.moveSpeed / STEPS_PER_SECOND;
              const half = { offsetX: -stats.body.width / 2, offsetY: -stats.body.height / 2, width: stats.body.width, height: stats.body.height };
              const moved = movePoint(ctx.world, pos, half, dir.x * speed, dir.y * speed);
              pos = { x: moved.x, y: moved.y };
            }
            break;
          }
          case 'windup':
            next = tick() > 0 ? { ...sentinel, framesLeft: tick() } : { ...sentinel, state: 'active', framesLeft: stats.activeF, attackSpent: false };
            break;
          case 'active':
            next = tick() > 0 ? { ...sentinel, framesLeft: tick() } : { ...sentinel, state: 'recovery', framesLeft: stats.recoveryF };
            break;
          case 'recovery':
            next = tick() > 0 ? { ...sentinel, framesLeft: tick() } : { ...sentinel, state: 'wait', framesLeft: stats.intervalF - stats.recoveryF };
            break;
          case 'wait':
          case 'stunned':
            next = tick() > 0 ? { ...sentinel, framesLeft: tick() } : { ...sentinel, state: 'approach', framesLeft: 0 };
            break;
        }
        if (next !== sentinel) ctx.world.set(id, SentinelMelee, next);
        if (pos !== position) ctx.world.set(id, Position, pos);

        // The seal light reads the windup: brighter as the attack nears, brightest on the cue.
        const light = ctx.world.get(id, LightEmitter);
        if (light) {
          const cueF = next.cueF ?? stats.cueF;
          const radius = next.state === 'windup' ? (next.framesLeft <= cueF ? 30 : 18 + 8 * (1 - next.framesLeft / (next.windupF ?? stats.windupF))) : next.state === 'active' ? 28 : next.state === 'dormant' ? 8 : 14;
          if (radius !== light.radius) ctx.world.set(id, LightEmitter, { ...light, radius });
        }
      }
    },
  };
}

/**
 * The player takes a hit from something at `from` (spec §7). Act 1 (ember):
 * no health, a soft restart. Act 2+ (child): -1 health, 60f invulnerable,
 * 16px knockback, -1 ember, a cast in progress is cancelled (no refund); at 0
 * health, back to the checkpoint. Returns false if invulnerability ate it.
 */
function hitPlayer(world: World, playerId: EntityId, player: CombatPlayer, data: CombatData, from: Readonly<{ x: number; y: number }>): boolean {
  if (player.invulnerableF > 0) return false;
  bumpStats(world, { hitsTaken: 1 });
  if (player.hp !== undefined) {
    const health = data.childHealth;
    const position = world.get(playerId, Position);
    if (position) {
      const away = normalize(position.x - from.x, position.y - from.y);
      const pushed = movePoint(world, position, data.playerForms[player.form].wallCollider, away.x * health.knockbackPx, away.y * health.knockbackPx);
      world.set(playerId, Position, { x: pushed.x, y: pushed.y });
    }
    if (player.action.kind === 'casting') bumpStats(world, { castsCancelled: 1 });
    const hp = player.hp - 1;
    const embers = Math.max(0, player.embers + data.embers.onHit);
    const cancelled: PlayerAction = player.action.kind === 'casting' ? { kind: 'free' } : player.action;
    if (hp > 0) {
      world.set(playerId, CombatPlayer, { ...player, hp, embers, invulnerableF: health.invulnerableF, action: cancelled, combo: comboBreak(player.combo ?? EMPTY_COMBO), quickWindupF: 0, quickFinish: undefined });
      return true;
    }
    world.set(playerId, CombatPlayer, { ...player, hp: 0, embers: 0, action: { kind: 'respawning' }, buffer: undefined });
  } else {
    world.set(playerId, CombatPlayer, { ...player, action: { kind: 'respawning' }, buffer: undefined });
  }
  const total = data.act1Respawn.fadeOutF;
  const fade = singleton(world, ScreenFade);
  if (fade) world.set(fade[0], ScreenFade, { phase: 'out', framesLeft: total, totalF: total });
  else world.set(world.createEntity(), ScreenFade, { phase: 'out', framesLeft: total, totalF: total });
  return true;
}

/** The awakened sentinel's contact box around its body center. */
export function awakenedHitbox(center: Position, data: CombatData) {
  const { width, height } = data.enemies['sentinel-awakened'].hitbox;
  return { x: center.x - width / 2, y: center.y - height / 2, width, height };
}

/** Spec §8-1: asleep -> (player within wakeRange) waking wakeF -> chase; past giveUpRange -> return home -> asleep. */
export function createSentinelAwakenedSystem(data: CombatData): System {
  const stats = data.enemies['sentinel-awakened'];
  const half = { offsetX: -stats.body.width / 2, offsetY: -stats.body.height / 2, width: stats.body.width, height: stats.body.height };
  return {
    name: 'roguelite:combat/sentinel-awakened',
    order: 0.6,
    run: (ctx) => {
      if (isHitStopped(ctx.world)) return;
      const target = playerTarget(ctx.world, data);
      for (const [id, sentinel, position] of ctx.world.query([SentinelAwakened, Position] as const)) {
        let next: SentinelAwakened = sentinel;
        let pos = position;
        const distance = target ? Math.hypot(target.position.x - pos.x, target.position.y - pos.y) : Infinity;
        const stepToward = (x: number, y: number) => {
          const dir = normalize(x - pos.x, y - pos.y);
          const speed = Math.min(stats.moveSpeed / STEPS_PER_SECOND, Math.hypot(x - pos.x, y - pos.y));
          const moved = movePoint(ctx.world, pos, half, dir.x * speed, dir.y * speed);
          pos = { x: moved.x, y: moved.y };
        };
        if (sentinel.state === 'asleep') {
          if (target && !target.respawning && distance <= stats.wakeRange) next = { ...sentinel, state: 'waking', framesLeft: stats.wakeF };
        } else if (sentinel.state === 'waking') {
          next = sentinel.framesLeft > 1 ? { ...sentinel, framesLeft: sentinel.framesLeft - 1 } : { ...sentinel, state: 'chase', framesLeft: 0 };
        } else if (sentinel.state === 'chase') {
          if (!target || target.respawning || distance > stats.giveUpRange) next = { ...sentinel, state: 'return' };
          else stepToward(target.position.x, target.position.y);
        } else {
          stepToward(sentinel.home.x, sentinel.home.y);
          if (Math.hypot(pos.x - sentinel.home.x, pos.y - sentinel.home.y) < 0.5) next = { ...sentinel, state: 'asleep' };
        }
        if (next !== sentinel) ctx.world.set(id, SentinelAwakened, next);
        if (pos !== position) ctx.world.set(id, Position, pos);
      }
    },
  };
}

/** Post-simulation: live sentinel attacks against the player — parry, dodge (dash travel), or hit. */
export function createCombatResolveSystem(data: CombatData): System {
  const stats = data.enemies['sentinel-melee'];
  return {
    name: 'roguelite:combat/resolve',
    run: (ctx) => {
      if (isHitStopped(ctx.world)) return;
      for (const [playerId, player, playerPos] of ctx.world.query([CombatPlayer, Position] as const)) {
        const form = data.playerForms[player.form];
        const hurtbox = boxAt(playerPos, form.hurtbox);
        for (const [sentinelId, sentinel, sentinelPos] of ctx.world.query([SentinelMelee, Position] as const)) {
          if (sentinel.state !== 'active' || sentinel.attackSpent) continue;
          if (!overlaps(sentinelAttackBox(sentinelPos, sentinel.dirX, sentinel.dirY, stats), hurtbox)) continue;
          const current = ctx.world.get(playerId, CombatPlayer) ?? player;
          if (current.action.kind === 'respawning') continue;

          if (current.action.kind === 'parry' && current.action.phase === 'active' && stats.parryable) {
            const parriesTaken = sentinel.parriesTaken + 1;
            const stop = sentinel.parriesToStop !== undefined && parriesTaken >= sentinel.parriesToStop;
            ctx.world.set(sentinelId, SentinelMelee, {
              ...sentinel,
              attackSpent: true,
              parriesTaken,
              state: stop ? 'dormant' : 'stunned',
              framesLeft: stop ? 0 : stats.parryStunF,
            });
            const away = normalize(sentinelPos.x - playerPos.x, sentinelPos.y - (playerPos.y - 6));
            const pushed = movePoint(ctx.world, sentinelPos, { offsetX: -stats.body.width / 2, offsetY: -stats.body.height / 2, width: stats.body.width, height: stats.body.height }, away.x * data.parry.pushPx, away.y * data.parry.pushPx);
            ctx.world.set(sentinelId, Position, { x: pushed.x, y: pushed.y });
            const embers = data.embers.enabledForms.includes(current.form) ? Math.min(data.embers.max, current.embers + data.embers.onParry) : current.embers;
            ctx.world.set(playerId, CombatPlayer, { ...current, action: { kind: 'free' }, embers, ...(current.combo ? { combo: comboParried(current.combo, data.combo) } : { combo: comboParried(EMPTY_COMBO, data.combo) }) });

            const stop1 = singleton(ctx.world, HitStop);
            if (stop1) ctx.world.set(stop1[0], HitStop, { ...stop1[1], framesLeft: data.parry.hitstopF });
            const shake = singleton(ctx.world, ScreenShake);
            if (shake) ctx.world.set(shake[0], ScreenShake, { framesLeft: data.parry.shakeF, px: data.parry.shakePx });
            const center = boxCenter(hurtbox);
            ctx.world.set(ctx.world.createEntity(), ParrySpark, { x: (center.x + sentinelPos.x) / 2, y: (center.y + sentinelPos.y) / 2, framesLeft: PARRY_SPARK_F, totalF: PARRY_SPARK_F });
            bumpStats(ctx.world, { parrySuccesses: 1 });
            continue;
          }

          if (current.action.kind === 'dash' && current.action.phase === 'travel' && form.dash.travelInvulnerable) {
            continue; // scattered into embers: the attack passes through
          }

          ctx.world.set(sentinelId, SentinelMelee, { ...sentinel, attackSpent: true });
          hitPlayer(ctx.world, playerId, current, data, sentinelPos);
        }

        // Awakened sentinels hurt on contact while chasing (not parryable, spec §8-1).
        for (const [, awakened, awakenedPos] of ctx.world.query([SentinelAwakened, Position] as const)) {
          if (awakened.state !== 'chase') continue;
          const current = ctx.world.get(playerId, CombatPlayer) ?? player;
          if (current.action.kind === 'respawning') break;
          if (current.action.kind === 'dash' && current.action.phase === 'travel' && form.dash.travelPassEnemies) continue;
          if (overlaps(awakenedHitbox(awakenedPos, data), hurtbox) && hitPlayer(ctx.world, playerId, current, data, awakenedPos)) {
            break;
          }
        }
      }
    },
  };
}

/** Post-simulation, after resolve: runs the soft-restart fade and the parry sparks' lifetimes. */
export function createCombatUpkeepSystem(data: CombatData): System {
  return {
    name: 'roguelite:combat/upkeep',
    order: 1,
    run: (ctx) => {
      for (const [id, spark] of ctx.world.query([ParrySpark] as const)) {
        if (spark.framesLeft <= 1) ctx.world.destroyEntity(id);
        else ctx.world.set(id, ParrySpark, { ...spark, framesLeft: spark.framesLeft - 1 });
      }
      for (const [id, shake] of ctx.world.query([ScreenShake] as const)) {
        if (shake.framesLeft > 0) ctx.world.set(id, ScreenShake, { ...shake, framesLeft: shake.framesLeft - 1 });
      }

      const fade = singleton(ctx.world, ScreenFade);
      if (!fade) return;
      const [fadeId, state] = fade;
      if (state.framesLeft > 1) {
        ctx.world.set(fadeId, ScreenFade, { ...state, framesLeft: state.framesLeft - 1 });
        return;
      }
      if (state.phase === 'out') {
        // Bottom of the fade: back to the entrance, sentinels back to their posts (stopped ones stay stopped).
        const checkpoint = singleton(ctx.world, CombatCheckpoint);
        for (const [id] of ctx.world.query([CombatPlayer] as const)) {
          if (checkpoint) ctx.world.set(id, Position, { x: checkpoint[1].x, y: checkpoint[1].y });
        }
        const attempt = (singleton(ctx.world, CombatStats)?.[1].hitsTaken ?? 0) + 1; // the try that starts now
        for (const [id, sentinel] of ctx.world.query([SentinelMelee] as const)) {
          if (sentinel.state === 'dormant') continue;
          const assist = sentinel.assist;
          const cueF = assist ? Math.min(assist.maxCueF, assist.baseCueF + assist.stepF * Math.max(0, attempt - assist.fromAttempt + 1)) : sentinel.cueF;
          ctx.world.set(id, Position, sentinel.home);
          ctx.world.set(id, SentinelMelee, {
            ...sentinel,
            state: 'wait',
            framesLeft: data.enemies['sentinel-melee'].intervalF,
            attackSpent: true,
            ...(cueF !== undefined ? { cueF } : {}),
            ...(sentinel.hp !== undefined ? { hp: data.enemies['sentinel-melee'].hp } : {}),
          });
        }
        for (const [id, awakened] of ctx.world.query([SentinelAwakened] as const)) {
          ctx.world.set(id, Position, awakened.home);
          ctx.world.set(id, SentinelAwakened, { ...awakened, state: 'asleep', framesLeft: 0 });
        }
        const total = data.act1Respawn.fadeInF;
        ctx.world.set(fadeId, ScreenFade, { phase: 'in', framesLeft: total, totalF: total });
        return;
      }
      ctx.world.destroyEntity(fadeId);
      for (const [id, player] of ctx.world.query([CombatPlayer] as const)) {
        if (player.action.kind !== 'respawning') continue;
        // Back at the checkpoint: full health, no embers (spec §4, §7).
        const restored = player.hp !== undefined ? { hp: data.childHealth.maxHp, embers: 0, invulnerableF: 0 } : {};
        ctx.world.set(id, CombatPlayer, { ...player, ...restored, action: { kind: 'free' } });
      }
    },
  };
}

/** The flag a combat room's exits wait on — see zoneClearSystem. */
export const ZONE_CLEARED_FLAG = 'cleared';

/**
 * Sets the room flag "cleared" once every sentinel that can be stopped
 * (parriesToStop set) has stopped — Zone 6/7 exits open on it (spec §9).
 */
export const zoneClearSystem: System = {
  name: 'roguelite:combat/zone-clear',
  order: 2,
  run: (ctx) => {
    let stoppable = 0;
    let stopped = 0;
    for (const [, sentinel] of ctx.world.query([SentinelMelee] as const)) {
      // Stopped by parries (Zones 6/7), or beaten down (health, Part 1 — but not the test room's reviving one).
      if (sentinel.parriesToStop !== undefined) {
        stoppable++;
        if (sentinel.state === 'dormant') stopped++;
      } else if (sentinel.hp !== undefined && sentinel.reviveF === undefined) {
        stoppable++;
        if (sentinel.state === 'defeated') stopped++;
      }
    }
    if (stoppable === 0 || stopped < stoppable) return;
    for (const [id, flags] of ctx.world.query([Flags] as const)) {
      if (!flags.values[ZONE_CLEARED_FLAG]) ctx.world.set(id, Flags, { values: { ...flags.values, [ZONE_CLEARED_FLAG]: true } });
    }
  },
};

/** The singletons the combat systems expect in a combat room. */
export function spawnCombatSingletons(world: World, checkpoint: { x: number; y: number }): void {
  world.set(world.createEntity(), HitStop, { framesLeft: 0, frozen: false });
  world.set(world.createEntity(), ScreenShake, { framesLeft: 0, px: 0 });
  world.set(world.createEntity(), CombatCheckpoint, checkpoint);
  world.set(world.createEntity(), CombatStats, { parryAttempts: 0, parrySuccesses: 0, hitsTaken: 0, dashes: 0, castsStarted: 0, castsWithEmber: 0, castsAfterParry: 0, castsCancelled: 0 });
}

