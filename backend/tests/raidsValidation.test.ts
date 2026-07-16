import { raidCreateSchema } from '../src/modules/raids/raids.schemas';
import { defaultSlots, generateRaidCode } from '../src/modules/raids/raids.util';

const base = {
  operation: 'Dread Palace', difficulty: 'HM', size: 8, faction: 'Republic',
  minimum_tier: 2, check_composition: true, slots_tank: 2, slots_heal: 2, slots_dps: 4,
  start_at: '2026-08-01T20:30:00.000Z',
};

describe('raidCreateSchema', () => {
  it('aceita raid válida (slots somam size)', () => {
    expect(raidCreateSchema.safeParse(base).success).toBe(true);
  });
  it('rejeita slots que não somam o size', () => {
    expect(raidCreateSchema.safeParse({ ...base, slots_dps: 5 }).success).toBe(false);
  });
  it('rejeita size inválido', () => {
    expect(raidCreateSchema.safeParse({ ...base, size: 10, slots_dps: 6 }).success).toBe(false);
  });
  it('rejeita operation fora da lista', () => {
    expect(raidCreateSchema.safeParse({ ...base, operation: 'Inexistente' }).success).toBe(false);
  });
});

describe('utils', () => {
  it('defaultSlots(8) = 2/2/4 e (16) = 2/4/10', () => {
    expect(defaultSlots(8)).toEqual({ slots_tank: 2, slots_heal: 2, slots_dps: 4 });
    expect(defaultSlots(16)).toEqual({ slots_tank: 2, slots_heal: 4, slots_dps: 10 });
  });
  it('generateRaidCode gera códigos distintos de 8 chars', () => {
    const a = generateRaidCode(); const b = generateRaidCode();
    expect(a).toHaveLength(8);
    expect(a).not.toBe(b);
  });
});
