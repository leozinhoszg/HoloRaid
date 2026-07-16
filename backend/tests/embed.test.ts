import { buildRaidEmbed } from '../src/discord/embed';

const detail = {
  id: 1, codigo: 'ABC123', operation: 'Dread Palace', difficulty: 'HM', size: 8, faction: 'Republic',
  minimum_tier: 2, check_composition: false, slots_tank: 2, slots_heal: 2, slots_dps: 4, notes: null,
  start_at: new Date('2026-08-01T20:30:00Z'), status: 'OPEN', created_by: 1,
  roster: [{ status: 'confirmed', role: 'DPS' }, { status: 'waitlist', role: 'DPS' }],
} as any;

describe('buildRaidEmbed', () => {
  it('monta título, link e campos em inglês', () => {
    const e = buildRaidEmbed(detail, 'https://holoraid.fun');
    expect(e.title).toContain('HoloRaid');
    expect(e.joinUrl).toBe('https://holoraid.fun/r/ABC123');
    const f = Object.fromEntries(e.fields.map((x) => [x.name, x.value]));
    expect(f['Operation']).toBe('Dread Palace');
    expect(f['Difficulty']).toBe('Veteran');
    expect(f['Faction']).toBe('Republic');
    expect(f['Minimum Tier']).toBe('Tier 2');
    expect(f['Signed']).toBe('1/8'); // só confirmados
    expect(f['Status']).toBe('OPEN');
  });

  it('usa timestamp do Discord (<t:unix>) para o horário', () => {
    const e = buildRaidEmbed(detail, 'https://holoraid.fun');
    const time = e.fields.find((x) => x.name === 'Time')!.value;
    const unix = Math.floor(new Date('2026-08-01T20:30:00Z').getTime() / 1000);
    expect(time).toContain(`<t:${unix}:F>`);
  });
});
