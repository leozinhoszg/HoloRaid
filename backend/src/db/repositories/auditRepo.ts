import type { Kysely } from 'kysely';
import type { DB } from '../schema';

export function createAuditLog(db: Kysely<DB>) {
  return async (e: { actor_id: number; action: string; target_id: number | null; metadata?: unknown }) => {
    await db.insertInto('admin_audit_log').values({
      actor_id: e.actor_id,
      action: e.action,
      target_id: e.target_id,
      metadata: e.metadata !== undefined ? JSON.stringify(e.metadata) : null,
    }).execute();
  };
}
