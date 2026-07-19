import type { PersonagemRepo, PersonagemRecord, PersonagemInput } from '../../db/repositories/personagemRepo';
import type { RaidPlayerRepo } from '../../db/repositories/raidPlayerRepo';
import type { UserRepo } from '../../db/repositories/userRepo';
import { calcularTier, pointsToNextTier } from '../../common/progression/tier';
import { combatStyleByName, disciplineByName } from '../../reference/swtor';
import { NotFoundError, ForbiddenError, ValidationError, ConflictError } from '../../common/errors/AppError';

// total_points vem da CONTA (mesmo Tier em todos os personagens do usuário).
export type CharacterView = PersonagemRecord & { total_points: number; tier: number; pointsToNextTier: number | null };

const view = (p: PersonagemRecord, points: number): CharacterView => ({
  ...p, total_points: points, tier: calcularTier(points), pointsToNextTier: pointsToNextTier(points),
});

// Revalida coerência cross-field (usado no update sobre o registro mesclado).
function assertCoerente(p: Pick<PersonagemRecord, 'faccao' | 'classe' | 'role' | 'especializacao' | 'origin_story'>) {
  const style = combatStyleByName(p.classe);
  if (!style || style.faccao !== p.faccao) throw new ValidationError('Combat Style inválido para a facção');
  if (!style.allowedRoles.includes(p.role)) throw new ValidationError('Role não permitida para a classe');
  if (p.origin_story && p.origin_story !== style.originStory) throw new ValidationError('Origin Story não bate com a classe');
  if (p.especializacao) {
    const disc = disciplineByName(p.especializacao);
    if (!disc || disc.combatStyle !== p.classe) throw new ValidationError('Disciplina não pertence à classe');
    if (disc.role !== p.role) throw new ValidationError('Role da disciplina diverge da role');
  }
}

export function createCharacterService(deps: { personagemRepo: PersonagemRepo; raidPlayerRepo: RaidPlayerRepo; userRepo: UserRepo }) {
  async function owned(actorId: number, id: number): Promise<PersonagemRecord> {
    const p = await deps.personagemRepo.findById(id);
    if (!p) throw new NotFoundError('Personagem não encontrado');
    if (p.usuario_id !== actorId) throw new ForbiddenError('Personagem de outro usuário');
    return p;
  }
  async function pointsOf(usuarioId: number): Promise<number> {
    return (await deps.userRepo.findById(usuarioId))?.total_points ?? 0;
  }

  return {
    async create(usuarioId: number, input: Omit<PersonagemInput, 'usuario_id'>): Promise<CharacterView> {
      const created = await deps.personagemRepo.create({ ...input, usuario_id: usuarioId });
      return view(created, await pointsOf(usuarioId));
    },
    async list(usuarioId: number): Promise<CharacterView[]> {
      const pts = await pointsOf(usuarioId);
      return (await deps.personagemRepo.findByUsuario(usuarioId)).map((p) => view(p, pts));
    },
    async get(id: number): Promise<CharacterView> {
      const p = await deps.personagemRepo.findById(id);
      if (!p) throw new NotFoundError('Personagem não encontrado');
      return view(p, await pointsOf(p.usuario_id));
    },
    async update(actorId: number, id: number, patch: Partial<PersonagemInput>): Promise<CharacterView> {
      const current = await owned(actorId, id);
      const merged = { ...current, ...patch } as PersonagemRecord;
      assertCoerente(merged);
      await deps.personagemRepo.update(id, patch);
      return view(merged, await pointsOf(actorId));
    },
    async remove(actorId: number, id: number): Promise<void> {
      await owned(actorId, id);
      // A FK fk_rp_personagem (007) recusaria isso no banco; aqui viramos um 409 de domínio.
      if (await deps.raidPlayerRepo.existsByPersonagem(id)) {
        throw new ConflictError('Este personagem está inscrito em uma raid. Saia da raid antes de apagá-lo.');
      }
      await deps.personagemRepo.delete(id);
    },
    async assertOwner(actorId: number, id: number): Promise<void> {
      await owned(actorId, id);
    },
  };
}

export type CharacterService = ReturnType<typeof createCharacterService>;
