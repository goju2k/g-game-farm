/**
 * Published by the running room's `showDialogue` custom command (see
 * scenario-commands.ts) and read by dialogue-box.tsx via useSnapshotStore —
 * same one-way "game state -> React UI" channel monster-count-hud.ts
 * established. No reverse channel: advancing/dismissing is read directly
 * off `ctx.input.keyboard.justPressed` inside the scenario system, not via
 * a React callback (see scenario-commands.ts's 'showDialogue' case).
 */
export interface DialogueState {
  readonly visible: boolean;
  readonly text: string;
}

export const EMPTY_DIALOGUE_STATE: DialogueState = { visible: false, text: '' };
