import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { World, type SystemContext } from '@g-game-farm/ribs';
import { describe, expect, it } from 'vitest';
import { Position } from '../components.js';
import { SentinelMelee } from './combat-components.js';
import { parseCombatData } from './combat-data.js';
import { createDamageUiSystem, DamageNumber, DamageRoll, HpBar, rollDamage, spawnDamageNumber, DAMAGE_NUMBER_MS } from './damage-ui.js';
import { damageSentinel } from './spells.js';

const combat = parseCombatData(JSON.parse(readFileSync(resolve(__dirname, '../../../public/game/data/combat.json'), 'utf8')), 'combat.json');
const world = (random?: number) => {
  const w = new World();
  if (random !== undefined) w.set(w.createEntity(), DamageRoll, { random: () => random });
  return w;
};
const tick = (w: World, ms: number) => createDamageUiSystem(combat).run({ world: w, deltaMs: ms } as unknown as SystemContext);

describe('hit feedback (D-044)', () => {
  it('every hit varies ±5%, rounded, never below 1', () => {
    expect(rollDamage(world(0.5), 70)).toBe(70);
    expect(rollDamage(world(0), 70)).toBe(67); // 66.5
    expect(rollDamage(world(0.999999), 70)).toBe(73); // 73.5 -> 73 (r just under 1)
    expect(rollDamage(world(0), 1)).toBe(1);
  });

  it('damage is 10x: the melee sentinel has 80, the big pillar 70', () => {
    expect(combat.enemies['sentinel-melee'].hp).toBe(80);
    expect(combat.combo.finishPillar.damage).toBe(70);
    expect(combat.spells.quick.damage).toBe(10);
  });

  it('numbers born together fan out sideways, and go after 0.6s', () => {
    const w = world();
    for (let i = 0; i < 3; i++) spawnDamageNumber(w, 10, 'normal', { x: 100, y: 50 });
    expect([...w.query([DamageNumber] as const)].map(([, n]) => n.x)).toEqual([100, 106, 94]);
    tick(w, DAMAGE_NUMBER_MS);
    expect([...w.query([DamageNumber] as const)]).toHaveLength(0);
  });

  it('a hit shows the bar, its number, and a white trail that holds, then drains down to the health', () => {
    const w = world(0.5);
    const id = w.createEntity();
    w.set(id, Position, { x: 0, y: 0 });
    w.set(id, SentinelMelee, { state: 'wait', framesLeft: 99, hp: 80 } as SentinelMelee);
    damageSentinel(w, id, w.get(id, SentinelMelee) as SentinelMelee, 30, { x: 0, y: -10 }, 'burn');
    expect(w.get(id, SentinelMelee)?.hp).toBe(50);
    expect(w.get(id, HpBar)?.ghost).toBe(80);
    expect([...w.query([DamageNumber] as const)][0][1]).toMatchObject({ value: 30, kind: 'burn' });
    tick(w, 200);
    expect(w.get(id, HpBar)?.ghost).toBe(80); // holding
    for (let i = 0; i < 60; i++) tick(w, 1000 / 60);
    expect(w.get(id, HpBar)?.ghost).toBe(50);
  });

  it('an unhurt enemy has no bar ("onHit")', () => {
    const w = world();
    const id = w.createEntity();
    w.set(id, SentinelMelee, { state: 'wait', framesLeft: 99, hp: 80 } as SentinelMelee);
    tick(w, 16);
    expect(w.get(id, HpBar)).toBeUndefined();
  });
});
