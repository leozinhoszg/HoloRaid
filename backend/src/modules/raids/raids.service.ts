import type { RaidRepo, RaidRecord, RaidStatus, NewRaid } from '../../db/repositories/raidRepo';
import type { RaidPlayerRepo, RosterRow } from '../../db/repositories/raidPlayerRepo';
import { calcularTier } from '../../common/progression/tier';
import { generateRaidCode } from './raids.util';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../../common/errors/AppError';

export type Actor = { sub: number; role: 'user' | 'admin' };
export type RaidDetail = RaidRecord & { roster: (RosterRow & { tier: number })[] };
type CreateInput = Omit<NewRaid, 'codigo' | 'created_by'>;

const TRANSITIONS: Record<'start' | 'finish' | 'cancel', { from: RaidStatus[]; to: RaidStatus }> = {
  start: { from: ['OPEN'], to: 'RUNNING' },
  finish: { from: ['OPEN', 'RUNNING'], to: 'FINISHED' },
  cancel: { from: ['OPEN', 'RUNNING'], to: 'CANCELLED' },
};

export function createRaidService(deps: { raidRepo: RaidRepo; raidPlayerRepo: RaidPlayerRepo }) {
  function canManage(actor: Actor, raid: RaidRecord) {
    if (raid.created_by !== actor.sub && actor.role !== 'admin') throw new ForbiddenError('Apenas o líder ou um admin');
  }
  async function detail(raid: RaidRecord): Promise<RaidDetail> {
    const roster = (await deps.raidPlayerRepo.listRoster(raid.id)).map((r) => ({ ...r, tier: calcularTier(r.total_points) }));
    return { ...raid, roster };
  }
  async function load(id: number): Promise<RaidRecord> {
    const raid = await deps.raidRepo.findById(id);
    if (!raid) throw new NotFoundError('Raid não encontrada');
    return raid;
  }

  return {
    async create(actor: Actor, input: CreateInput): Promise<RaidDetail> {
      const raid = await deps.raidRepo.create({ ...input, codigo: generateRaidCode(), created_by: actor.sub });
      return detail(raid);
    },
    async list(filter: { status?: string; faction?: string; operation?: string }): Promise<RaidRecord[]> {
      return deps.raidRepo.list(filter);
    },
    async getDetail(id: number): Promise<RaidDetail> {
      return detail(await load(id));
    },
    async getByCodigo(codigo: string): Promise<RaidDetail> {
      const raid = await deps.raidRepo.findByCodigo(codigo);
      if (!raid) throw new NotFoundError('Raid não encontrada');
      return detail(raid);
    },
    async update(actor: Actor, id: number, patch: Partial<CreateInput>): Promise<RaidDetail> {
      const raid = await load(id);
      canManage(actor, raid);
      if (raid.status !== 'OPEN') throw new ConflictError('Só é possível editar uma raid OPEN');
      const merged = { ...raid, ...patch };
      if (merged.slots_tank + merged.slots_heal + merged.slots_dps !== merged.size) {
        throw new ValidationError('slots devem somar o size');
      }
      // não reduzir slots abaixo dos confirmados de cada role
      const confirmed = (await deps.raidPlayerRepo.listByRaid(id)).filter((p) => p.status === 'confirmed');
      for (const [role, slots] of [['Tank', merged.slots_tank], ['Healer', merged.slots_heal], ['DPS', merged.slots_dps]] as const) {
        if (confirmed.filter((p) => p.role === role).length > slots) throw new ValidationError(`slots de ${role} abaixo dos confirmados`);
      }
      await deps.raidRepo.update(id, patch);
      return detail(await load(id));
    },
    async remove(actor: Actor, id: number): Promise<void> {
      const raid = await load(id);
      canManage(actor, raid);
      await deps.raidRepo.delete(id);
    },
    async transition(actor: Actor, id: number, action: 'start' | 'finish' | 'cancel'): Promise<RaidDetail> {
      const raid = await load(id);
      canManage(actor, raid);
      const t = TRANSITIONS[action];
      if (!t.from.includes(raid.status)) throw new ConflictError(`Não é possível ${action} a partir de ${raid.status}`);
      await deps.raidRepo.updateStatus(id, t.to);
      return detail(await load(id));
    },
    async duplicate(actor: Actor, id: number): Promise<RaidDetail> {
      const r = await load(id);
      const created = await deps.raidRepo.create({
        codigo: generateRaidCode(), operation: r.operation, difficulty: r.difficulty, size: r.size,
        faction: r.faction, minimum_tier: r.minimum_tier, check_composition: r.check_composition,
        slots_tank: r.slots_tank, slots_heal: r.slots_heal, slots_dps: r.slots_dps, notes: r.notes,
        start_at: r.start_at, created_by: actor.sub,
      });
      return detail(created);
    },
  };
}

export type RaidService = ReturnType<typeof createRaidService>;
