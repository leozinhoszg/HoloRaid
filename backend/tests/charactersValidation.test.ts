import { createCharacterSchema } from '../src/modules/characters/characters.schemas';

const base = { nome: 'Kira', faccao: 'Republic', classe: 'Guardian', role: 'Tank', item_level: 340 };

describe('createCharacterSchema', () => {
  it('aceita caminho feliz sem disciplina', () => {
    expect(createCharacterSchema.safeParse(base).success).toBe(true);
  });

  it('aceita com disciplina coerente', () => {
    const r = createCharacterSchema.safeParse({ ...base, especializacao: 'Defense' });
    expect(r.success).toBe(true);
  });

  it('rejeita combat style de outra facção', () => {
    const r = createCharacterSchema.safeParse({ ...base, classe: 'Juggernaut' }); // Empire
    expect(r.success).toBe(false);
  });

  it('rejeita role não permitida pela classe', () => {
    const r = createCharacterSchema.safeParse({ ...base, classe: 'Sentinel', role: 'Tank' }); // Sentinel só DPS
    expect(r.success).toBe(false);
  });

  it('rejeita disciplina fora da classe', () => {
    const r = createCharacterSchema.safeParse({ ...base, especializacao: 'Immortal' }); // Immortal é Juggernaut
    expect(r.success).toBe(false);
  });

  it('rejeita disciplina cuja role diverge da role escolhida', () => {
    const r = createCharacterSchema.safeParse({ ...base, classe: 'Guardian', role: 'DPS', especializacao: 'Defense' }); // Defense é Tank
    expect(r.success).toBe(false);
  });
});
