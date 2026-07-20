import type { RaidRepo } from '../../db/repositories/raidRepo';
import type { RaidPlayerRepo, Role } from '../../db/repositories/raidPlayerRepo';
import type { PersonagemRepo } from '../../db/repositories/personagemRepo';
import type { UserRepo } from '../../db/repositories/userRepo';
import { calcularTier } from '../../common/progression/tier';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../../common/errors/AppError';

type Deps = { raidRepo: RaidRepo; raidPlayerRepo: RaidPlayerRepo; personagemRepo: PersonagemRepo; userRepo: UserRepo };

export function createRaidJoinService(deps: Deps) {
  function slotFor(raid: { slots_tank: number; slots_heal: number; slots_dps: number }, role: Role): number {
    return role === 'Tank' ? raid.slots_tank : role === 'Healer' ? raid.slots_heal : raid.slots_dps;
  }

  return {
    async join(actorId: number, raidId: number, personagemId: number): Promise<{ status: 'confirmed' | 'waitlist' }> {
      const raid = await deps.raidRepo.findById(raidId);
      if (!raid) throw new NotFoundError('Raid not found');
      if (raid.status !== 'OPEN') throw new ConflictError('This raid is not open for sign-ups');

      const pers = await deps.personagemRepo.findById(personagemId);
      if (!pers) throw new NotFoundError('Character not found');
      if (pers.usuario_id !== actorId) throw new ForbiddenError('You can only sign up your own character');
      if (pers.faccao !== raid.faction) throw new ValidationError(`Personagem é ${pers.faccao}; a raid é ${raid.faction}`);

      const user = await deps.userRepo.findById(actorId);
      const tier = calcularTier(user?.total_points ?? 0);
      if (tier < raid.minimum_tier) {
        throw new ValidationError(`Sua conta possui Tier ${tier}. Esta raid exige Tier ${raid.minimum_tier} ou superior.`);
      }
      if (await deps.raidPlayerRepo.findByRaidAndUser(raidId, actorId)) throw new ConflictError('You are already in this raid');

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

    async leave(actorId: number, raidId: number): Promise<{ promoted?: number }> {
      const raid = await deps.raidRepo.findById(raidId);
      if (!raid) throw new NotFoundError('Raid not found');
      if (raid.status !== 'OPEN') throw new ConflictError('You can only leave an open raid');
      const me = await deps.raidPlayerRepo.findByRaidAndUser(raidId, actorId);
      if (!me) throw new NotFoundError('You are not in this raid');

      const wasConfirmed = me.status === 'confirmed';
      const freedRole = me.role;
      await deps.raidPlayerRepo.deleteByRaidAndUser(raidId, actorId);

      if (wasConfirmed) {
        const waitlist = (await deps.raidPlayerRepo.listByRaid(raidId)).filter((p) => p.status === 'waitlist'); // já ordenado por joined_at
        const candidate = raid.check_composition ? waitlist.find((p) => p.role === freedRole) : waitlist[0];
        if (candidate) {
          await deps.raidPlayerRepo.updateStatus(candidate.id, 'confirmed');
          return { promoted: candidate.usuario_id };
        }
      }
      return {};
    },
  };
}

export type RaidJoinService = ReturnType<typeof createRaidJoinService>;
