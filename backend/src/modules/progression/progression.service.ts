import type { UserRepo } from '../../db/repositories/userRepo';
import type { BossRepo } from '../../db/repositories/bossRepo';
import type { UserBossRepo, CompletedBossRow } from '../../db/repositories/userBossRepo';
import { NotFoundError } from '../../common/errors/AppError';

type Deps = { userRepo: UserRepo; bossRepo: BossRepo; userBossRepo: UserBossRepo };

export function createProgressionService(deps: Deps) {
  async function recomputeTotal(usuarioId: number): Promise<number> {
    const bossIds = await deps.userBossRepo.listBossIds(usuarioId);
    const bosses = await deps.bossRepo.findByIds(bossIds);
    const total = bosses.reduce((s, b) => s + b.points, 0);
    await deps.userRepo.updateTotalPoints(usuarioId, total);
    return total;
  }

  async function ensureExists(usuarioId: number) {
    if (!(await deps.userRepo.findById(usuarioId))) throw new NotFoundError('Usuário não encontrado');
  }

  return {
    async award(usuarioId: number, bossIds: number[]): Promise<{ awarded: number; total_points: number }> {
      await ensureExists(usuarioId);
      const existing = new Set(await deps.userBossRepo.listBossIds(usuarioId));
      const validBosses = await deps.bossRepo.findByIds([...new Set(bossIds)]);
      const toAdd = validBosses.map((b) => b.id).filter((id) => !existing.has(id));
      await deps.userBossRepo.insertMany(usuarioId, toAdd);
      const total_points = await recomputeTotal(usuarioId);
      return { awarded: toAdd.length, total_points };
    },
    async revoke(usuarioId: number, bossId: number): Promise<{ total_points: number }> {
      await ensureExists(usuarioId);
      await deps.userBossRepo.deleteOne(usuarioId, bossId);
      return { total_points: await recomputeTotal(usuarioId) };
    },
    async history(usuarioId: number): Promise<CompletedBossRow[]> {
      await ensureExists(usuarioId);
      return deps.userBossRepo.listWithBoss(usuarioId);
    },
    async setCompletions(usuarioId: number, bossIds: number[]): Promise<{ awarded: number; removed: number; total_points: number }> {
      await ensureExists(usuarioId);
      const validIds = (await deps.bossRepo.findByIds([...new Set(bossIds)])).map((b) => b.id);
      const desired = new Set(validIds);
      const current = new Set(await deps.userBossRepo.listBossIds(usuarioId));
      const toAdd = [...desired].filter((id) => !current.has(id));
      const toRemove = [...current].filter((id) => !desired.has(id));
      await deps.userBossRepo.insertMany(usuarioId, toAdd);
      for (const id of toRemove) await deps.userBossRepo.deleteOne(usuarioId, id);
      const total_points = await recomputeTotal(usuarioId);
      return { awarded: toAdd.length, removed: toRemove.length, total_points };
    },
  };
}

export type ProgressionService = ReturnType<typeof createProgressionService>;
