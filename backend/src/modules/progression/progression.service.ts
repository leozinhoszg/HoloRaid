import type { PersonagemRepo } from '../../db/repositories/personagemRepo';
import type { BossRepo } from '../../db/repositories/bossRepo';
import type { CharacterBossRepo, CompletedBossRow } from '../../db/repositories/characterBossRepo';
import { NotFoundError } from '../../common/errors/AppError';

type Deps = { personagemRepo: PersonagemRepo; bossRepo: BossRepo; charBossRepo: CharacterBossRepo };

export function createProgressionService(deps: Deps) {
  async function recomputeTotal(personagemId: number): Promise<number> {
    const bossIds = await deps.charBossRepo.listBossIds(personagemId);
    const bosses = await deps.bossRepo.findByIds(bossIds);
    const total = bosses.reduce((s, b) => s + b.points, 0);
    await deps.personagemRepo.updateTotalPoints(personagemId, total);
    return total;
  }

  async function ensureExists(personagemId: number) {
    if (!(await deps.personagemRepo.findById(personagemId))) throw new NotFoundError('Personagem não encontrado');
  }

  return {
    async award(personagemId: number, bossIds: number[]): Promise<{ awarded: number; total_points: number }> {
      await ensureExists(personagemId);
      const existing = new Set(await deps.charBossRepo.listBossIds(personagemId));
      const validBosses = await deps.bossRepo.findByIds([...new Set(bossIds)]);
      const toAdd = validBosses.map((b) => b.id).filter((id) => !existing.has(id));
      await deps.charBossRepo.insertMany(personagemId, toAdd);
      const total_points = await recomputeTotal(personagemId);
      return { awarded: toAdd.length, total_points };
    },
    async revoke(personagemId: number, bossId: number): Promise<{ total_points: number }> {
      await ensureExists(personagemId);
      await deps.charBossRepo.deleteOne(personagemId, bossId);
      return { total_points: await recomputeTotal(personagemId) };
    },
    async history(personagemId: number): Promise<CompletedBossRow[]> {
      await ensureExists(personagemId);
      return deps.charBossRepo.listWithBoss(personagemId);
    },
    async setCompletions(personagemId: number, bossIds: number[]): Promise<{ awarded: number; removed: number; total_points: number }> {
      await ensureExists(personagemId);
      const validIds = (await deps.bossRepo.findByIds([...new Set(bossIds)])).map((b) => b.id);
      const desired = new Set(validIds);
      const current = new Set(await deps.charBossRepo.listBossIds(personagemId));
      const toAdd = [...desired].filter((id) => !current.has(id));
      const toRemove = [...current].filter((id) => !desired.has(id));
      await deps.charBossRepo.insertMany(personagemId, toAdd);
      for (const id of toRemove) await deps.charBossRepo.deleteOne(personagemId, id);
      const total_points = await recomputeTotal(personagemId);
      return { awarded: toAdd.length, removed: toRemove.length, total_points };
    },
  };
}

export type ProgressionService = ReturnType<typeof createProgressionService>;
