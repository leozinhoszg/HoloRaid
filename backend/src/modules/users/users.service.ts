import type { UserRepo, UserRecord } from '../../db/repositories/userRepo';
import { NotFoundError, BadRequestError } from '../../common/errors/AppError';

type AuditEvent = { actor_id: number; action: string; target_id: number | null; metadata?: unknown };
type Deps = { userRepo: UserRepo; auditLog: (e: AuditEvent) => Promise<void> };

export function createUserService(deps: Deps) {
  return {
    async getMe(userId: number): Promise<UserRecord> {
      const u = await deps.userRepo.findById(userId);
      if (!u) throw new NotFoundError('Usuário não encontrado');
      return u;
    },
    async list(): Promise<UserRecord[]> {
      return deps.userRepo.list();
    },
    async promote(actorId: number, targetId: number): Promise<void> {
      const target = await deps.userRepo.findById(targetId);
      if (!target) throw new NotFoundError('Usuário alvo não encontrado');
      await deps.userRepo.updateRole(targetId, 'admin');
      await deps.auditLog({ actor_id: actorId, action: 'promote', target_id: targetId });
    },
    async demote(actorId: number, targetId: number): Promise<void> {
      if (actorId === targetId) throw new BadRequestError('Você não pode rebaixar a si mesmo');
      const target = await deps.userRepo.findById(targetId);
      if (!target) throw new NotFoundError('Usuário alvo não encontrado');
      await deps.userRepo.updateRole(targetId, 'user');
      await deps.auditLog({ actor_id: actorId, action: 'demote', target_id: targetId });
    },
    async setPushEnabled(userId: number, enabled: boolean): Promise<void> {
      await deps.userRepo.setPushEnabled(userId, enabled);
    },
  };
}

export type UserService = ReturnType<typeof createUserService>;
