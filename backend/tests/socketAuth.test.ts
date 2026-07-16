import { createSocketAuth, registerSubscriptions } from '../src/realtime/socketServer';

function fakeSocket(token?: string) {
  const joined: string[] = [];
  const left: string[] = [];
  const handlers: Record<string, (payload: any, ack?: () => void) => void> = {};
  return {
    handshake: { auth: token ? { token } : {} },
    data: {} as any,
    join: (r: string) => joined.push(r),
    leave: (r: string) => left.push(r),
    on: (ev: string, fn: any) => { handlers[ev] = fn; },
    joined, left, handlers,
  };
}

describe('socket auth', () => {
  it('recusa sem token', () => {
    const mw = createSocketAuth(() => ({ sub: 1, role: 'user' }));
    let err: Error | undefined;
    mw(fakeSocket() as any, (e?: Error) => { err = e; });
    expect(err?.message).toBe('unauthorized');
  });

  it('recusa token inválido', () => {
    const mw = createSocketAuth(() => { throw new Error('bad'); });
    let err: Error | undefined;
    mw(fakeSocket('t') as any, (e?: Error) => { err = e; });
    expect(err?.message).toBe('unauthorized');
  });

  it('aceita token válido e anexa user', () => {
    const mw = createSocketAuth(() => ({ sub: 42, role: 'admin' }));
    const s = fakeSocket('t') as any;
    let err: Error | undefined = new Error('x');
    mw(s, (e?: Error) => { err = e; });
    expect(err).toBeUndefined();
    expect(s.data.user).toEqual({ sub: 42, role: 'admin' });
  });
});

describe('subscriptions', () => {
  it('subscribe:raid entra na sala e ack', () => {
    const s = fakeSocket('t') as any;
    registerSubscriptions(s);
    let acked = false;
    s.handlers['subscribe:raid']({ id: 5 }, () => { acked = true; });
    expect(s.joined).toContain('raid:5');
    expect(acked).toBe(true);
    s.handlers['unsubscribe:raid']({ id: 5 });
    expect(s.left).toContain('raid:5');
    s.handlers['subscribe:lobby']();
    expect(s.joined).toContain('raids');
  });
});
