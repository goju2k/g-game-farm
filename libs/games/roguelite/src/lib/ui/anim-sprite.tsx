'use client';
import { useEffect, useState } from 'react';

/** One clip of an anim asset (contract 1), for drawing in the DOM. */
export interface UiClip {
  readonly url: string;
  readonly frames: readonly { readonly sx: number; readonly sy: number; readonly sWidth: number; readonly sHeight: number; readonly durationMs: number }[];
  readonly loop: boolean;
  /** The sheet's size, so the background can be scaled. */
  readonly sheet: readonly [number, number];
}

/** The clips of an anim asset, read for DOM use (undefined if it can't be loaded). */
export async function loadUiClips(baseUrl: string, folder: string, id: string): Promise<Readonly<Record<string, UiClip>> | undefined> {
  try {
    const response = await fetch(`${baseUrl}${folder}/${id}.anim.json`);
    if (!response.ok) return undefined;
    const anim = (await response.json()) as { texture: string; clips: Record<string, { loop: boolean; frames: UiClip['frames'] }> };
    const all = Object.values(anim.clips).flatMap((c) => c.frames);
    const sheet: [number, number] = [Math.max(...all.map((f) => f.sx + f.sWidth)), Math.max(...all.map((f) => f.sy + f.sHeight))];
    const url = `${baseUrl}${folder}/${anim.texture}`;
    return Object.fromEntries(Object.entries(anim.clips).map(([name, clip]) => [name, { url, frames: clip.frames, loop: clip.loop, sheet }]));
  } catch {
    return undefined;
  }
}

/** Plays a clip as a CSS sprite at an integer scale (pixel art stays crisp). */
export function AnimSprite({ clip, scale }: { clip: UiClip; scale: number }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => setFrame(0), [clip]);
  useEffect(() => {
    if (clip.frames.length < 2) return;
    const last = frame >= clip.frames.length - 1;
    if (last && !clip.loop) return;
    const timer = setTimeout(() => setFrame((f) => (f + 1) % clip.frames.length), clip.frames[frame]?.durationMs ?? 100);
    return () => clearTimeout(timer);
  }, [frame, clip]);
  const f = clip.frames[frame] ?? clip.frames[0];
  return (
    <span
      style={{
        display: 'inline-block',
        width: f.sWidth * scale,
        height: f.sHeight * scale,
        backgroundImage: `url(${clip.url})`,
        backgroundSize: `${clip.sheet[0] * scale}px ${clip.sheet[1] * scale}px`,
        backgroundPosition: `-${f.sx * scale}px -${f.sy * scale}px`,
        imageRendering: 'pixelated',
      }}
    />
  );
}
