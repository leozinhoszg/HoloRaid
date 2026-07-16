import { createRaidBroadcaster, noopBroadcaster } from '../src/realtime/broadcaster';

type Emit = { room: string; event: string; payload: unknown };

function fakeIo() {
  const emits: Emit[] = [];
  const io = { to: (room: string) => ({ emit: (event: string, payload: unknown) => emits.push({ room, event, payload }) }) };
  return { io, emits };
}

const detail = { id: 7, codigo: 'x', roster: [] } as any;

describe('RaidBroadcaster', () => {
  it('raidUpdated emite o evento na sala da raid e raidUpdated no lobby', () => {
    const { io, emits } = fakeIo();
    createRaidBroadcaster(io).raidUpdated(detail, 'playerJoined');
    expect(emits).toContainEqual({ room: 'raid:7', event: 'playerJoined', payload: { raid: detail } });
    expect(emits).toContainEqual({ room: 'raids', event: 'raidUpdated', payload: { raid: detail } });
  });

  it('raidCreated vai para o lobby', () => {
    const { io, emits } = fakeIo();
    createRaidBroadcaster(io).raidCreated(detail);
    expect(emits).toEqual([{ room: 'raids', event: 'raidCreated', payload: { raid: detail } }]);
  });

  it('raidRemoved vai para lobby e sala da raid', () => {
    const { io, emits } = fakeIo();
    createRaidBroadcaster(io).raidRemoved(7);
    expect(emits).toContainEqual({ room: 'raids', event: 'raidRemoved', payload: { id: 7 } });
    expect(emits).toContainEqual({ room: 'raid:7', event: 'raidRemoved', payload: { id: 7 } });
  });

  it('noopBroadcaster não lança', () => {
    expect(() => { noopBroadcaster.raidCreated(detail); noopBroadcaster.raidUpdated(detail, 'x'); noopBroadcaster.raidRemoved(1); }).not.toThrow();
  });
});
