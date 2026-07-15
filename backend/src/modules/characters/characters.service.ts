import type { PersonagemRepo, PersonagemRecord, PersonagemInput } from '../../db/repositories/personagemRepo';
import { calcularTier, pointsToNextTier } from '../../common/progression/tier';
import { combatStyleByName, disciplineByName } from '../../reference/swtor';
import { NotFoundError, ForbiddenError, ValidationError } from '../../common/errors/AppError';

export type CharacterView = PersonagemRecord & { tier: number; pointsToNextTier: number | null };

const view = (p: PersonagemRecord): CharacterView => ({
  ...p, tier: calcularTier(p.total_points), pointsToNextTier: pointsToNextTier(p.total_points),
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

export function createCharacterService(deps: { personagemRepo: PersonagemRepo }) {
  async function owned(actorId: number, id: number): Promise<PersonagemRecord> {
    const p = await deps.personagemRepo.findById(id);
    if (!p) throw new NotFoundError('Personagem não encontrado');
    if (p.usuario_id !== actorId) throw new ForbiddenError('Personagem de outro usuário');
    return p;
  }

  return {
    async create(usuarioId: number, input: Omit<PersonagemInput, 'usuario_id'>): Promise<CharacterView> {
      const created = await deps.personagemRepo.create({ ...input, usuario_id: usuarioId });
      return view(created);
    },
    async list(usuarioId: number): Promise<CharacterView[]> {
      return (await deps.personagemRepo.findByUsuario(usuarioId)).map(view);
    },
    async get(id: number): Promise<CharacterView> {
      const p = await deps.personagemRepo.findById(id);
      if (!p) throw new NotFoundError('Personagem não encontrado');
      return view(p);
    },
    async update(actorId: number, id: number, patch: Partial<PersonagemInput>): Promise<CharacterView> {
      const current = await owned(actorId, id);
      const merged = { ...current, ...patch } as PersonagemRecord;
      assertCoerente(merged);
      await deps.personagemRepo.update(id, patch);
      return view(merged);
    },
    async remove(actorId: number, id: number): Promise<void> {
      await owned(actorId, id);
      await deps.personagemRepo.delete(id);
    },
    async assertOwner(actorId: number, id: number): Promise<void> {
      await owned(actorId, id);
    },
  };
}

export type CharacterService = ReturnType<typeof createCharacterService>;
