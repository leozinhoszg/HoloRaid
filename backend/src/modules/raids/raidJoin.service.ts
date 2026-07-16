import type { RaidRepo } from '../../db/repositories/raidRepo';
import type { RaidPlayerRepo, Role } from '../../db/repositories/raidPlayerRepo';
import type { PersonagemRepo } from '../../db/repositories/personagemRepo';
import { calcularTier } from '../../common/progression/tier';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../../common/errors/AppError';

type Deps = { raidRepo: RaidRepo; raidPlayerRepo: RaidPlayerRepo; personagemRepo: PersonagemRepo };

export function createRaidJoinService(deps: Deps) {
  function slotFor(raid: { slots_tank: number; slots_heal: number; slots_dps: number }, role: Role): number {
    return role === 'Tank' ? raid.slots_tank : role === 'Healer' ? raid.slots_heal : raid.slots_dps;
  }

  return {
    async join(actorId: number, raidId: number, personagemId: number): Promise<{ status: 'confirmed' | 'waitlist' }> {
      const raid = await deps.raidRepo.findById(raidId);
      if (!raid) throw new NotFoundError('Raid não encontrada');
      if (raid.status !== 'OPEN') throw new ConflictError('A raid não está aberta para inscrições');

      const pers = await deps.personagemRepo.findById(personagemId);
      if (!pers) throw new NotFoundError('Personagem não encontrado');
      if (pers.usuario_id !== actorId) throw new ForbiddenError('Você só inscreve o seu personagem');
      if (pers.faccao !== raid.faction) throw new ValidationError(`Personagem é ${pers.faccao}; a raid é ${raid.faction}`);

      const tier = calcularTier(pers.total_points);
      if (tier < raid.minimum_tier) {
        throw new ValidationError(`Seu personagem possui Tier ${tier}. Esta raid exige Tier ${raid.minimum_tier} ou superior.`);
      }
      if (await deps.raidPlayerRepo.findByRaidAndUser(raidId, actorId)) throw new ConflictError('Você já está nesta raid');

      const confirmed = (await deps.raidPlayerRepo.listByRaid(raidId)).filter((p) => p.status === 'confirmed');
      let status: 'confirmed' | 'waitlist';
      if (raid.check_composition) {
        const inRole = confirmed.filter((p) => p.role === pers.role).length;
        status = inRole < slotFor(raid, pers.role) ? 'confirmed' : 'waitlist';
      } else {
        status = confirmed.length < raid.size ? 'confirmed' : 'waitlist';
      }
      await deps.raidPlayerRepo.create({ raid_id: raidId, usuario_id: actorId, personagem_id: personagemId, role: pers.role, status, joined_at: new Date() });
      return { status };
    },

    async leave(actorId: number, raidId: number): Promise<void> {
      const raid = await deps.raidRepo.findById(raidId);
      if (!raid) throw new NotFoundError('Raid não encontrada');
      if (raid.status !== 'OPEN') throw new ConflictError('Só é possível sair de uma raid aberta');
      const me = await deps.raidPlayerRepo.findByRaidAndUser(raidId, actorId);
      if (!me) throw new NotFoundError('Você não está nesta raid');

      const wasConfirmed = me.status === 'confirmed';
      const freedRole = me.role;
      await deps.raidPlayerRepo.deleteByRaidAndUser(raidId, actorId);

      if (wasConfirmed) {
        const waitlist = (await deps.raidPlayerRepo.listByRaid(raidId)).filter((p) => p.status === 'waitlist'); // já ordenado por joined_at
        const candidate = raid.check_composition ? waitlist.find((p) => p.role === freedRole) : waitlist[0];
        if (candidate) await deps.raidPlayerRepo.updateStatus(candidate.id, 'confirmed');
      }
    },
  };
}

export type RaidJoinService = ReturnType<typeof createRaidJoinService>;
