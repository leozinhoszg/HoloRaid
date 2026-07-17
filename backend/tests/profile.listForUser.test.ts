import 'dotenv/config';
import { db } from '../src/db/db';
import { createRaidRepo } from '../src/db/repositories/raidRepo';
import { createRaidPlayerRepo } from '../src/db/repositories/raidPlayerRepo';
import { createPersonagemRepo } from '../src/db/repositories/personagemRepo';
import { createUserRepo } from '../src/db/repositories/userRepo';

const raidRepo = createRaidRepo(db);
const raidPlayerRepo = createRaidPlayerRepo(db);
const personagemRepo = createPersonagemRepo(db);
const userRepo = createUserRepo(db);

const MARK = 'PROF8';
const created = { users: [] as number[], raids: [] as number[] };

async function mkUser(tag: string) {
  const u = await userRepo.upsertByDiscordId({ discord_id: `${MARK}-${tag}`, username: `${MARK}_${tag}`, nickname: null, avatar: null, email: null, role: 'user' });
  created.users.push(u.id); return u;
}
async function mkRaid(startAt: Date, createdBy: number) {
  const r = await raidRepo.create({ codigo: `${MARK}${created.raids.length}`, operation: 'Dread Palace', difficulty: 'HM', size: 8, faction: 'Republic', minimum_tier: 0, check_composition: false, slots_tank: 2, slots_heal: 2, slots_dps: 4, notes: null, start_at: startAt, created_by: createdBy } as any);
  created.raids.push(r.id); return r;
}

afterAll(async () => {
  for (const id of created.raids) await raidRepo.delete(id);
  if (created.users.length) await db.deleteFrom('usuarios').where('id', 'in', created.users).execute();
  await db.destroy();
});

describe('raidRepo.listForUser', () => {
  it('une raids criadas e entradas, com created/myStatus e ordem desc', async () => {
    const me = await mkUser('me');
    const other = await mkUser('other');
    const meChar = await personagemRepo.create({ usuario_id: me.id, nome: 'Me', faccao: 'Republic', classe: 'Guardian', especializacao: null, role: 'Tank', origin_story: null, item_level: 340 } as any);

    const base = Date.now();
    const rCriei = await mkRaid(new Date(base + 3 * 3600_000), me.id);
    const rEntrei = await mkRaid(new Date(base + 2 * 3600_000), other.id);
    const rAmbos = await mkRaid(new Date(base + 1 * 3600_000), me.id);
    const rAlheia = await mkRaid(new Date(base + 4 * 3600_000), other.id);

    await raidPlayerRepo.create({ raid_id: rEntrei.id, usuario_id: me.id, personagem_id: meChar.id, role: 'Tank', status: 'confirmed', joined_at: new Date() });
    await raidPlayerRepo.create({ raid_id: rAmbos.id, usuario_id: me.id, personagem_id: meChar.id, role: 'Tank', status: 'waitlist', joined_at: new Date() });

    const mine = await raidRepo.listForUser(me.id);
    const byId = new Map(mine.map((r) => [r.id, r]));

    expect(byId.has(rAlheia.id)).toBe(false);
    expect(byId.get(rCriei.id)).toMatchObject({ created: true, myStatus: null });
    expect(byId.get(rEntrei.id)).toMatchObject({ created: false, myStatus: 'confirmed' });
    expect(byId.get(rAmbos.id)).toMatchObject({ created: true, myStatus: 'waitlist' });

    const nossos = mine.filter((r) => [rCriei.id, rEntrei.id, rAmbos.id].includes(r.id));
    expect(nossos).toHaveLength(3);

    const idxCriei = nossos.findIndex((r) => r.id === rCriei.id);
    const idxAmbos = nossos.findIndex((r) => r.id === rAmbos.id);
    expect(idxCriei).toBeLessThan(idxAmbos);
  });
});
