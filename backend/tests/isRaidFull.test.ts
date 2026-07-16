import { isRaidFull } from '../src/modules/raids/raids.service';

const base = (over: any) => ({ id: 1, size: 8, check_composition: false, slots_tank: 2, slots_heal: 2, slots_dps: 4, roster: [], ...over } as any);
const player = (role: string, status = 'confirmed') => ({ role, status });

describe('isRaidFull', () => {
  it('headcount: cheio quando confirmados == size', () => {
    expect(isRaidFull(base({ roster: Array.from({ length: 8 }, () => player('DPS')) }))).toBe(true);
    expect(isRaidFull(base({ roster: Array.from({ length: 7 }, () => player('DPS')) }))).toBe(false);
  });

  it('waitlist não conta no headcount', () => {
    const roster = [...Array.from({ length: 7 }, () => player('DPS')), player('DPS', 'waitlist')];
    expect(isRaidFull(base({ roster }))).toBe(false);
  });

  it('check_composition: cheio quando cada role bate sua quota', () => {
    const full = base({ check_composition: true, roster: [player('Tank'), player('Tank'), player('Healer'), player('Healer'), player('DPS'), player('DPS'), player('DPS'), player('DPS')] });
    expect(isRaidFull(full)).toBe(true);
    const missingTank = base({ check_composition: true, roster: [player('Tank'), player('Healer'), player('Healer'), player('DPS'), player('DPS'), player('DPS'), player('DPS')] });
    expect(isRaidFull(missingTank)).toBe(false);
  });
});
