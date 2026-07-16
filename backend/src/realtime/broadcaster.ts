import type { RaidDetail } from '../modules/raids/raids.service';

export interface RaidBroadcaster {
  raidCreated(raid: RaidDetail): void;
  raidUpdated(detail: RaidDetail, event: string): void;
  raidRemoved(id: number): void;
}

export const noopBroadcaster: RaidBroadcaster = {
  raidCreated() {},
  raidUpdated() {},
  raidRemoved() {},
};

// Superfície mínima do io para testabilidade; o Server do socket.io a satisfaz
// estruturalmente (any[]/unknown evitam atrito com os generics do socket.io).
type Emitter = { to(room: string): { emit(event: string, ...args: any[]): unknown } };

export function createRaidBroadcaster(io: Emitter): RaidBroadcaster {
  return {
    raidCreated(raid) {
      io.to('raids').emit('raidCreated', { raid });
    },
    raidUpdated(detail, event) {
      io.to(`raid:${detail.id}`).emit(event, { raid: detail });
      io.to('raids').emit('raidUpdated', { raid: detail });
    },
    raidRemoved(id) {
      io.to('raids').emit('raidRemoved', { id });
      io.to(`raid:${id}`).emit('raidRemoved', { id });
    },
  };
}
