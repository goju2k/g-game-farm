import type { SnapshotStore, SystemContext, TextureHandle } from '@g-game-farm/ribs';
import type { RogueliteAssetKey } from '../assets.js';
import { Chaser, PlayerControlled } from '../components.js';
import { spawnMonsterWave } from '../monsters/monster-wave.js';
import type { PlayerFormId, RogueliteSession } from '../session.js';
import { transformPlayerForm } from '../systems/transform-player-form.js';
import { EMPTY_DIALOGUE_STATE, type DialogueState } from './dialogue-state.js';

/**
 * The game-specific vocabulary plugged into the engine's generic
 * `ScenarioCommand<TCustom>.custom` slot — the engine has no idea what a
 * "wave" or a "room" is, only that a game supplies its own command union.
 */
export type RogueliteScenarioCommand =
  | { readonly kind: 'spawnWave'; readonly count: number }
  | { readonly kind: 'waitForNoMonsters' }
  | { readonly kind: 'showDialogue'; readonly text: string }
  | { readonly kind: 'transformPlayer'; readonly form: PlayerFormId };

/** Everything runRogueliteCommand needs beyond the command itself and the tick's SystemContext. */
export interface ScenarioRunnerDeps {
  readonly textures: Record<RogueliteAssetKey, TextureHandle>;
  readonly random: () => number;
  readonly formTextures: Readonly<Record<PlayerFormId, TextureHandle>>;
  readonly session: RogueliteSession;
  readonly dialogueStore: SnapshotStore<DialogueState>;
}

/**
 * The `runCustom` handler stepScenario calls once per tick while `pc` points
 * at a `custom` command — see interpreter.ts's ScenarioStepContext.runCustom
 * doc comment for the true/false contract this must honor.
 */
export function runRogueliteCommand(
  command: RogueliteScenarioCommand,
  ctx: SystemContext,
  deps: ScenarioRunnerDeps,
): boolean {
  switch (command.kind) {
    case 'spawnWave':
      spawnMonsterWave(ctx.world, deps.textures, command.count, deps.random);
      return true;

    case 'waitForNoMonsters':
      return [...ctx.world.query([Chaser] as const)].length === 0;

    case 'showDialogue': {
      const showing = deps.dialogueStore.getSnapshot();
      if (!(showing.visible && showing.text === command.text)) {
        deps.dialogueStore.set({ visible: true, text: command.text });
        return false;
      }
      if (ctx.input.keyboard.justPressed.has('KeyE')) {
        deps.dialogueStore.set(EMPTY_DIALOGUE_STATE);
        return true;
      }
      return false;
    }

    case 'transformPlayer': {
      const playerMatch = [...ctx.world.query([PlayerControlled] as const)][0];
      if (!playerMatch) {
        return true; // defensive — every room spawns exactly one player entity
      }
      transformPlayerForm(ctx.world, playerMatch[0], command.form, deps.formTextures, deps.session);
      return true;
    }
  }
}
