/**
 * Event scripts: lists of data commands run in order on simulation time —
 * the engine half of an event/dialogue system. The engine knows only flow
 * (`wait`, `parallel`, `async`); every other command (say, camera, lights…)
 * is registered by the game, so nothing here knows what a dialogue is.
 *
 * A command is plain data `{ cmd: 'name', ...args }` (JSON-friendly, so
 * scripts live in data files). A handler turns one into either nothing
 * (instant) or a task that is updated every step until it reports done.
 * Skipping (a "skip scene" button) runs every remaining command to its end
 * state immediately via each task's `finish`.
 */

export interface EventCommand {
  readonly cmd: string;
  readonly [arg: string]: unknown;
}

export interface CommandTask<Ctx> {
  /** Advance by deltaMs; true when done. */
  update(ctx: Ctx, deltaMs: number): boolean;
  /** Jump to the end state (skip). Default: nothing more to apply. */
  finish?(ctx: Ctx): void;
}

export interface CommandHandlerTools<Ctx> {
  /** A nested command list as one task — for handlers with sub-sequences (e.g. a game's `if`). */
  sequence(commands: readonly EventCommand[]): CommandTask<Ctx>;
}

export type CommandHandler<Ctx> = (command: EventCommand, ctx: Ctx, tools: CommandHandlerTools<Ctx>) => CommandTask<Ctx> | void;

const BUILT_INS = new Set(['wait', 'parallel', 'async']);

function nestedLists(command: EventCommand): readonly (readonly EventCommand[])[] {
  const lists: (readonly EventCommand[])[] = [];
  for (const value of Object.values(command)) {
    if (Array.isArray(value) && value.every((v) => typeof v === 'object' && v !== null && 'cmd' in v)) {
      lists.push(value as readonly EventCommand[]);
    }
  }
  return lists;
}

function numberArg(command: EventCommand, name: string): number {
  const value = command[name];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`event command "${command.cmd}": "${name}" must be a number.`);
  }
  return value;
}

export class EventRegistry<Ctx> {
  private readonly handlers = new Map<string, CommandHandler<Ctx>>();

  register(name: string, handler: CommandHandler<Ctx>): this {
    if (BUILT_INS.has(name) || this.handlers.has(name)) {
      throw new Error(`event command "${name}" is already defined.`);
    }
    this.handlers.set(name, handler);
    return this;
  }

  /** Throws listing every unknown command (recursing into nested lists) — call when loading scripts, so a typo fails at load. */
  validate(commands: readonly EventCommand[], label: string): void {
    const unknown = new Set<string>();
    const walk = (list: readonly EventCommand[]) => {
      for (const command of list) {
        if (typeof command?.cmd !== 'string') {
          unknown.add(JSON.stringify(command));
          continue;
        }
        if (!BUILT_INS.has(command.cmd) && !this.handlers.has(command.cmd)) unknown.add(command.cmd);
        nestedLists(command).forEach(walk);
      }
    };
    walk(commands);
    if (unknown.size > 0) {
      throw new Error(`${label}: unknown event commands: ${[...unknown].join(', ')}`);
    }
  }

  /** Starts running a command list. */
  start(commands: readonly EventCommand[]): EventInstance<Ctx> {
    return new EventInstance(this, commands);
  }

  /** @internal */
  begin(command: EventCommand, ctx: Ctx, instance: EventInstance<Ctx>): CommandTask<Ctx> | void {
    switch (command.cmd) {
      case 'wait': {
        const ms = numberArg(command, 'ms');
        let elapsed = 0;
        return { update: (_ctx, dt) => (elapsed += dt) >= ms };
      }
      case 'parallel': {
        const tasks = ((command['do'] as readonly EventCommand[] | undefined) ?? []).map((c) => new SequenceTask(this, [c], instance));
        return {
          update: (c, dt) => tasks.map((task) => task.update(c, dt)).every(Boolean),
          finish: (c) => tasks.forEach((task) => task.finish(c)),
        };
      }
      case 'async':
        instance.detach(new SequenceTask(this, (command['do'] as readonly EventCommand[] | undefined) ?? [], instance));
        return;
    }
    const handler = this.handlers.get(command.cmd);
    if (!handler) {
      throw new Error(`unknown event command "${command.cmd}".`);
    }
    return handler(command, ctx, { sequence: (list) => new SequenceTask(this, list, instance) });
  }
}

/** Runs a list one command at a time; finishing one starts the next in the same step. */
class SequenceTask<Ctx> implements CommandTask<Ctx> {
  private index = 0;
  private current: CommandTask<Ctx> | undefined;

  constructor(
    private readonly registry: EventRegistry<Ctx>,
    private readonly commands: readonly EventCommand[],
    private readonly instance: EventInstance<Ctx>,
  ) {}

  update(ctx: Ctx, deltaMs: number): boolean {
    let dt = deltaMs;
    for (;;) {
      if (!this.current) {
        if (this.index >= this.commands.length) return true;
        const task = this.registry.begin(this.commands[this.index], ctx, this.instance);
        if (!task) {
          this.index++;
          continue; // instant
        }
        this.current = task;
      }
      if (!this.current.update(ctx, dt)) return false;
      this.current = undefined;
      this.index++;
      dt = 0; // the next command starts this step, but this step's time is spent
    }
  }

  finish(ctx: Ctx): void {
    this.current?.finish?.(ctx);
    this.current = undefined;
    for (this.index++; this.index < this.commands.length; this.index++) {
      const task = this.registry.begin(this.commands[this.index], ctx, this.instance);
      task?.finish?.(ctx);
    }
  }
}

/** One running event: its main sequence plus any `async` branches it started. */
export class EventInstance<Ctx> {
  private readonly main: SequenceTask<Ctx>;
  private readonly detached: SequenceTask<Ctx>[] = [];
  private mainDone = false;

  constructor(registry: EventRegistry<Ctx>, commands: readonly EventCommand[]) {
    this.main = new SequenceTask(registry, commands, this);
  }

  /** @internal */
  detach(task: SequenceTask<Ctx>): void {
    this.detached.push(task);
  }

  /** True once the main sequence and every async branch have finished. */
  update(ctx: Ctx, deltaMs: number): boolean {
    if (!this.mainDone) this.mainDone = this.main.update(ctx, deltaMs);
    for (let i = this.detached.length - 1; i >= 0; i--) {
      if (this.detached[i].update(ctx, deltaMs)) this.detached.splice(i, 1);
    }
    return this.mainDone && this.detached.length === 0;
  }

  /** Whether the main sequence is still running (async tails may continue after it). */
  get mainRunning(): boolean {
    return !this.mainDone;
  }

  /** Runs everything left to its end state, now. */
  skip(ctx: Ctx): void {
    // Branches already running were started earlier than anything left in the main sequence,
    // so they settle first and the main sequence's later commands win where both touch the same thing.
    const earlier = this.detached.splice(0);
    earlier.forEach((task) => task.finish(ctx));
    if (!this.mainDone) {
      this.main.finish(ctx);
      this.mainDone = true;
    }
    // ...then whatever finishing the main sequence started.
    while (this.detached.length > 0) {
      this.detached.shift()?.finish(ctx);
    }
  }
}

export function createEventRegistry<Ctx>(): EventRegistry<Ctx> {
  return new EventRegistry<Ctx>();
}
