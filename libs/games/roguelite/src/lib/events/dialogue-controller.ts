import { createSnapshotStore, type SnapshotStore } from '@g-game-farm/ribs';

/**
 * Bridges `say` (simulation, event commands) and the dialogue panel (React
 * overlay — static content, allowed by the UI principle). The command shows
 * a line and waits; the panel types it out and reports when the reader
 * moved on. Also carries the long-press "skip scene" request and {dim}
 * markers reached while typing.
 */

export interface DialogueLine {
  /** Increments per line — lets the panel restart typing and the command know its own line was answered. */
  readonly seq: number;
  readonly speaker: string;
  readonly text: string;
  /** Advance by itself this long after the text is fully shown (event spec §5 auto). */
  readonly autoMs?: number;
  /** Input is locked (cutscene): tap anywhere / Space / click advance and the skip button shows. Otherwise only the panel itself takes taps. */
  readonly locked: boolean;
}

export interface DialogueView {
  readonly line: DialogueLine | undefined;
  /** An event that can be skipped is running (input locked). */
  readonly skippable: boolean;
}

export interface DialogueController {
  readonly view: SnapshotStore<DialogueView>;
  show(line: Omit<DialogueLine, 'seq'>): number;
  hide(): void;
  /** Panel: the reader advanced past line `seq`. */
  complete(seq: number): void;
  isComplete(seq: number): boolean;
  /** Panel: typing reached a {dim} marker in line `seq`. */
  dim(seq: number): void;
  /** Command: how many {dim} markers of line `seq` were reached and not yet applied (resets the count). */
  takeDims(seq: number): number;
  setSkippable(skippable: boolean): void;
  /** Panel: the skip button was held long enough. */
  requestSkip(): void;
  /** Director: was a skip requested since last asked (resets it). */
  takeSkip(): boolean;
}

export function createDialogueController(): DialogueController {
  const view = createSnapshotStore<DialogueView>({ line: undefined, skippable: false });
  let seq = 0;
  let completed = -1;
  const dims = new Map<number, number>();
  let skip = false;
  return {
    view,
    show(line) {
      seq += 1;
      view.set({ ...view.getSnapshot(), line: { ...line, seq } });
      return seq;
    },
    hide() {
      view.set({ ...view.getSnapshot(), line: undefined });
    },
    complete(done) {
      completed = Math.max(completed, done);
    },
    isComplete(which) {
      return completed >= which;
    },
    dim(which) {
      dims.set(which, (dims.get(which) ?? 0) + 1);
    },
    takeDims(which) {
      const n = dims.get(which) ?? 0;
      dims.delete(which);
      return n;
    },
    setSkippable(skippable) {
      if (view.getSnapshot().skippable !== skippable) view.set({ ...view.getSnapshot(), skippable });
    },
    requestSkip() {
      skip = true;
    },
    takeSkip() {
      const was = skip;
      skip = false;
      return was;
    },
  };
}

/** Splits a line into text and its inline markers: {pause:ms} and {dim} (event spec §5). */
export type LinePart = { readonly kind: 'text'; readonly text: string } | { readonly kind: 'pause'; readonly ms: number } | { readonly kind: 'dim' };

export function parseLine(text: string): LinePart[] {
  const parts: LinePart[] = [];
  const pattern = /\{(pause:(\d+)|dim)\}/g;
  let last = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (match.index > last) parts.push({ kind: 'text', text: text.slice(last, match.index) });
    parts.push(match[2] !== undefined ? { kind: 'pause', ms: Number(match[2]) } : { kind: 'dim' });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts;
}

/** The visible text of a line (markers removed). */
export function plainText(text: string): string {
  return parseLine(text)
    .map((part) => (part.kind === 'text' ? part.text : ''))
    .join('');
}
