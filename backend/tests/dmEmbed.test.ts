import { buildDmEmbed } from '../src/push/dmGateway';

describe('buildDmEmbed', () => {
  it('monta titulo, descricao e link da raid', () => {
    const e = buildDmEmbed(
      { title: "You're in!", body: 'A spot opened up.', data: { raidId: '7', codigo: 'X7', event: 'slotConfirmed' } },
      'https://holoraid.fun',
    );
    expect(e.data.title).toBe("You're in!");
    expect(e.data.description).toBe('A spot opened up.');
    expect(e.data.url).toBe('https://holoraid.fun/r/X7');
  });

  it('sem codigo → sem url (nao quebra)', () => {
    const e = buildDmEmbed({ title: 'T', body: 'B' }, 'https://holoraid.fun');
    expect(e.data.title).toBe('T');
    expect(e.data.url).toBeUndefined();
  });
});
