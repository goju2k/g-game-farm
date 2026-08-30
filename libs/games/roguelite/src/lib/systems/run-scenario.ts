import { stepScenario, type System } from '@g-game-farm/ribs';
import { ScenarioRunner } from '../components.js';
import { createRoomFlagWriter } from '../rooms/room-flags.js';
import { runRogueliteCommand, type ScenarioRunnerDeps } from '../scenario/scenario-commands.js';

/**
 * Advances this room's ScenarioRunner (there's exactly one per room, same
 * singleton-entity idiom as RoomTileLayout/RoomExits/Flags) by one tick.
 *
 * order: 2 — after collectPickupsSystem/createRoomExitTriggerSystem (order 1),
 * so a flag a pickup or exit trigger sets this same tick is already visible
 * to a `waitUntil`/`if` this system evaluates in the same tick, not one tick
 * late.
 */
export function createRunScenarioSystem(deps: ScenarioRunnerDeps): System {
  return {
    name: 'roguelite:run-scenario',
    order: 2,
    run: (ctx) => {
      for (const [id, runner] of ctx.world.query([ScenarioRunner] as const)) {
        if (runner.state.finished) {
          continue;
        }
        const flags = createRoomFlagWriter(ctx.world);
        const state = stepScenario(runner.state, runner.program, {
          deltaMs: ctx.deltaMs,
          flags,
          runCustom: (command) => runRogueliteCommand(command, ctx, deps),
        });
        ctx.world.set(id, ScenarioRunner, { ...runner, state });
      }
    },
  };
}
