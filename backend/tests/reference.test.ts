import { COMBAT_STYLES, DISCIPLINES, combatStyleByName, disciplinesOfStyle } from '../src/reference/swtor';
import { BOSSES_SEED } from '../src/reference/bossesSeed';

describe('reference swtor', () => {
  it('tem 16 combat styles e 48 disciplinas', () => {
    expect(COMBAT_STYLES).toHaveLength(16);
    expect(DISCIPLINES).toHaveLength(48);
  });

  it('cada disciplina pertence a um combat style existente', () => {
    const names = new Set(COMBAT_STYLES.map((c) => c.name));
    for (const d of DISCIPLINES) expect(names.has(d.combatStyle)).toBe(true);
  });

  it('Guardian permite Tank e DPS; tem 3 disciplinas', () => {
    expect(combatStyleByName('Guardian')?.allowedRoles).toEqual(['Tank', 'DPS']);
    expect(disciplinesOfStyle('Guardian').map((d) => d.name)).toEqual(['Defense', 'Vigilance', 'Focus']);
  });

  it('roles das disciplinas: 6 Tank, 6 Healer, 36 DPS', () => {
    const by = (r: string) => DISCIPLINES.filter((d) => d.role === r).length;
    expect(by('Tank')).toBe(6);
    expect(by('Healer')).toBe(6);
    expect(by('DPS')).toBe(36);
  });
});

describe('bosses seed', () => {
  it('soma exatamente 105 pontos (invariante do Tier 6)', () => {
    expect(BOSSES_SEED.reduce((s, b) => s + b.points, 0)).toBe(105);
  });

  it('contagem por tipo: boss=88, timer=8, lair=9', () => {
    const by = (t: string) => BOSSES_SEED.filter((b) => b.type === t).reduce((s, b) => s + b.points, 0);
    expect(by('boss')).toBe(88);
    expect(by('timer')).toBe(8);
    expect(by('lair')).toBe(9);
  });

  it('timers não têm dificuldade', () => {
    expect(BOSSES_SEED.filter((b) => b.type === 'timer').every((b) => b.difficulty === null)).toBe(true);
  });
});
