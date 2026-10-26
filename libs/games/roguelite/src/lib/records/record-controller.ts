import { createSnapshotStore, type SnapshotStore } from '@g-game-farm/ribs';

/**
 * Bridges the `record` command (simulation) and the stone record panel
 * (React overlay — static content). The command opens a record and waits;
 * the panel shows it in the ancient glyphs and reports when it's closed.
 * While one is open the game is paused (demo level design 31 §0).
 */

export interface RecordEntry {
  /** Korean source text — shown as glyphs unless readable. */
  readonly text: string;
  /** Deciphered (after the ending): shown as written. */
  readonly readable: boolean;
}

export interface RecordView {
  readonly open: (RecordEntry & { readonly id: string; readonly seq: number }) | undefined;
}

export interface RecordController {
  readonly view: SnapshotStore<RecordView>;
  /** Command: open record `id`; returns its seq. An unknown id opens nothing (and counts as closed). */
  show(id: string): number;
  /** Panel / skip: close record `seq`. */
  close(seq: number): void;
  isClosed(seq: number): boolean;
  /** Records data (data/events/records.json), replaced once loaded. */
  setRecords(records: Readonly<Record<string, RecordEntry>>): void;
}

export function createRecordController(): RecordController {
  const view = createSnapshotStore<RecordView>({ open: undefined });
  let records: Readonly<Record<string, RecordEntry>> = {};
  let seq = 0;
  let closed = 0;
  return {
    view,
    show(id) {
      seq += 1;
      const entry = records[id];
      if (!entry) {
        closed = seq;
        return seq;
      }
      view.set({ open: { ...entry, id, seq } });
      return seq;
    },
    close(which) {
      if (which > closed) closed = which;
      if (view.getSnapshot().open?.seq === which) view.set({ open: undefined });
    },
    isClosed: (which) => which <= closed,
    setRecords(next) {
      records = next;
    },
  };
}

/** Parses data/events/records.json: { "records": { id: { "text", "readable" } } }. Bad entries are skipped. */
export function parseRecords(json: unknown): Record<string, RecordEntry> {
  const raw = (json as { records?: unknown })?.records;
  if (typeof raw !== 'object' || raw === null) return {};
  const out: Record<string, RecordEntry> = {};
  for (const [id, value] of Object.entries(raw)) {
    const entry = value as { text?: unknown; readable?: unknown };
    if (typeof entry?.text === 'string') out[id] = { text: entry.text, readable: entry.readable === true };
  }
  return out;
}

export async function loadRecords(url: string): Promise<Record<string, RecordEntry>> {
  try {
    const response = await fetch(url);
    return response.ok ? parseRecords(await response.json()) : {};
  } catch {
    return {};
  }
}
