import { createRequire } from 'node:module';
import { BALANCE } from './balance-data.js';
import { BALANCE_JSON } from './balance.generated.js';
import { armorReduction, burnTicks, castFrames, chargesAt, hitDamageBase, intervalFrames, levelDamageMul, maxHealth, nextCastBreakpoint, reloadFrames, rollHit, takeHit } from './formulas.js';
import { computeStats, realSkillLevel, type StatId } from './stats.js';

/**
 * The engine's growth formulas against the planning room's calculator
 * (calc.js, synced by `npm run sync-balance`): same inputs, same numbers.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = BALANCE_JSON as any;
const data = BALANCE;
const g = data.globals;
const { makeCalc } = createRequire(__filename)('../../test-support/balance-calc.cjs') as { makeCalc: (d: unknown) => CalcApi };
const calc = makeCalc(json);

interface CalcApi {
  levelDamageMul(L: number): number;
  chargesAt(s: unknown, L: number, extra?: number): number;
  castFrames(baseF: number, castPct: number): number;
  calc(s: unknown, c: Record<string, unknown>): { hit: number; castF: number; intervalF: number; reloadF: number; charges: number };
  survive(sc: Record<string, unknown>, v: Record<string, unknown>): { red: number; taken: number; hp: number };
}

/** A calculator condition for these stats (critical hits off: the calculator uses the expected value). */
const ctl = (level: number, s: Partial<Record<StatId, number>> = {}) => ({
  level,
  power: (s.power ?? 0) + (s.dmgFire ?? 0),
  proj: 0,
  cast: s.castSpeed ?? 0,
  rate: s.fireRate ?? 0,
  reload: s.reloadSpeed ?? 0,
  range: 0,
  charges: s.charges ?? 0,
  duration: s.duration ?? 0,
  crit: 0,
});
const statsWith = (s: Partial<Record<StatId, number>>) => computeStats({ base: { critChance: 0, critDamage: 50 }, other: [{ stats: s }] }).values;

const LEVELS = [1, 2, 5, 9, 10, 15, 19, 20, 21, 25, 30];
const STAT_CASES: Partial<Record<StatId, number>>[] = [{}, { power: 25, dmgFire: 10 }, { castSpeed: 37, fireRate: 22, reloadSpeed: 40 }, { charges: 2, duration: 30 }];

describe('growth formulas = the balance calculator (D-073)', () => {
  it('level damage: +8%/level to 20, +4% after', () => {
    for (const L of LEVELS) expect(levelDamageMul(g, L)).toBeCloseTo(calc.levelDamageMul(L), 10);
    expect(levelDamageMul(g, 30)).toBeCloseTo(2.92, 10);
  });

  for (const skill of data.skills) {
    it(`${skill.id}: charges, cast, interval, reload and one hit match at every level`, () => {
      const raw = json.skills.find((s: { id: string }) => s.id === skill.id);
      for (const L of LEVELS) {
        for (const s of STAT_CASES) {
          const c = calc.calc(raw, ctl(L, s));
          const stats = statsWith(s);
          expect(chargesAt(g, skill, L, s.charges ?? 0)).toBe(c.charges);
          expect(castFrames(g, skill.castF, stats.castSpeed)).toBe(c.castF);
          expect(intervalFrames(g, skill, L, stats.fireRate)).toBeCloseTo(c.intervalF, 9);
          expect(reloadFrames(g, skill, L, stats.reloadSpeed)).toBeCloseTo(c.reloadF, 9);
          // The calculator folds burn x (1 + duration) into one hit; the engine deals it as ticks — same total.
          const burnTotal = burnTicks(hitDamageBase(g, skill.burn, L, stats), 2, stats.duration).reduce((a, b) => a + b, 0);
          expect(hitDamageBase(g, skill.damage, L, stats) + burnTotal).toBeCloseTo(c.hit, 6);
        }
      }
    });
  }

  it('cast breakpoints: the next one takes exactly one frame off; at the floor there is none ("max")', () => {
    for (const skill of data.skills.filter((s) => s.castF > 2)) {
      for (const p of [0, 10, 33, 60, 99]) {
        const next = nextCastBreakpoint(g, skill.castF, p);
        const now = castFrames(g, skill.castF, p);
        if (next === undefined) {
          expect(now).toBe(Math.floor((skill.castF * g.castMinPct) / 100));
        } else {
          expect(castFrames(g, skill.castF, next)).toBe(now - 1);
          expect(castFrames(g, skill.castF, next - 1)).toBe(now);
        }
      }
    }
  });

  it('burn: whole ticks, then a small last one for the remainder (46 ★4)', () => {
    expect(burnTicks(20, 2, 0)).toEqual([10, 10]);
    const ticks = burnTicks(20, 2, 15);
    expect(ticks.slice(0, 2)).toEqual([10, 10]);
    expect(ticks[2]).toBeCloseTo(3, 9); // 0.3 of a tick
    expect(ticks.reduce((a, b) => a + b, 0)).toBeCloseTo(23, 9);
  });

  it('a hit on the player: armour, then shield, then health — as the calculator reduces it', () => {
    for (const tier of [1, 3, 8]) {
      for (const armor of [0, 40, 150, 900]) {
        const sv = calc.survive({ enemyDamage: 20, count: 1, attackEveryF: 120 }, { zone: tier, armor, hpAdd: 0, hpPct: 0, shield: 0, hitRate: 100, parryEvery: 0, baseHp: 100 });
        expect(armorReduction(g, armor, tier)).toBeCloseTo(sv.red, 12);
        const raw = 20 * Math.pow(g.zoneDmgMul, tier - 1);
        expect(takeHit(g, { hp: 100, shield: 0 }, raw, armor, tier).lost).toBeCloseTo(sv.taken, 9);
      }
    }
    expect(armorReduction(g, 1e9, 1)).toBe(0.75); // the cap
    const hit = takeHit(g, { hp: 100, shield: 8 }, 20, 0, 1);
    expect(hit).toMatchObject({ absorbed: 8, lost: 12, hp: 88, shield: 0 });
  });

  it('max health: (form base + flat) x (1 + %)', () => {
    const stats = statsWith({ maxHp: 20, maxHpPct: 10 });
    const sv = calc.survive({ enemyDamage: 0, count: 0 }, { zone: 1, armor: 0, hpAdd: 20, hpPct: 10, shield: 0, hitRate: 0, parryEvery: 0, baseHp: 100 });
    expect(maxHealth(100, stats)).toBe(Math.round(sv.hp));
  });

  it('the roll: ±5% first, then the crit, then rounded (46 ★5)', () => {
    const stats = computeStats({}).values; // crit 5% for +50%
    const seq = (...v: number[]) => () => v.shift() as number;
    expect(rollHit(100, stats, seq(0.5, 0.99))).toEqual({ damage: 100, crit: false });
    expect(rollHit(100, stats, seq(0, 0.99))).toEqual({ damage: 95, crit: false });
    expect(rollHit(100, stats, seq(0.75, 0.01))).toEqual({ damage: 154, crit: true }); // 102.5 x 1.5 = 153.75 -> 154
    expect(rollHit(0.2, stats, seq(0.5, 0.99)).damage).toBe(1);
  });

  it('stats: items are capped per option before the base; skill level = picked (max 20) + bonuses, at most 30', () => {
    const s = computeStats({ items: [{ stats: { power: 30 }, skillLevels: { pillar: 3 } }, { stats: { power: 30 }, skillLevels: { fire: 2 } }], itemCaps: { power: 50 }, other: [{ stats: { power: 5 } }] });
    expect(s.values.power).toBe(55);
    expect(s.values.critChance).toBe(5);
    expect(realSkillLevel(20, s, 'pillar')).toBe(25);
    expect(realSkillLevel(25, s, 'firebolt')).toBe(22); // picked caps at 20
    expect(realSkillLevel(20, computeStats({ items: [{ skillLevels: { pillar: 15 } }] }), 'pillar')).toBe(30);
  });
});
