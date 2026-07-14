import { COMBAT_STYLES, DISCIPLINES, combatStyleByName, disciplinesOfStyle } from '../src/reference/swtor';

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
