import { createRaidEventBus } from '../src/realtime/eventBus';
import type { RaidBroadcaster } from '../src/realtime/broadcaster';

function recorder() {
  const calls: string[] = [];
  const b: RaidBroadcaster = {
    raidCreated: () => calls.push('created'),
    raidUpdated: (_d, e) => calls.push('updated:' + e),
    raidRemoved: () => calls.push('removed'),
  };
  return { b, calls };
}
const detail = { id: 1, roster: [] } as any;

describe('RaidEventBus', () => {
  it('faz fan-out para todos os ouvintes', () => {
    const a = recorder(); const b = recorder();
    const bus = createRaidEventBus(a.b, b.b);
    bus.raidCreated(detail);
    bus.raidUpdated(detail, 'playerJoined');
    bus.raidRemoved(1);
    expect(a.calls).toEqual(['created', 'updated:playerJoined', 'removed']);
    expect(b.calls).toEqual(['created', 'updated:playerJoined', 'removed']);
  });

  it('um ouvinte que lança não impede os outros', () => {
    const bad: RaidBroadcaster = { raidCreated: () => { throw new Error('x'); }, raidUpdated: () => {}, raidRemoved: () => {} };
    const good = recorder();
    const bus = createRaidEventBus(bad, good.b);
    expect(() => bus.raidCreated(detail)).not.toThrow();
    expect(good.calls).toEqual(['created']);
  });
});
