import type { Server, Socket } from 'socket.io';
import type { AccessClaims } from '../common/security/jwt';

type AuthNext = (err?: Error) => void;

export function createSocketAuth(verify: (token: string) => AccessClaims) {
  return (socket: Socket, next: AuthNext) => {
    const token = (socket.handshake.auth as { token?: string })?.token;
    if (!token) return next(new Error('unauthorized'));
    try {
      socket.data.user = verify(token);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  };
}

export function registerSubscriptions(socket: Socket) {
  const ack = (cb?: unknown) => { if (typeof cb === 'function') (cb as () => void)(); };
  socket.on('subscribe:raid', (payload: { id?: number }, cb?: unknown) => {
    if (payload?.id) socket.join(`raid:${payload.id}`);
    ack(cb);
  });
  socket.on('unsubscribe:raid', (payload: { id?: number }, cb?: unknown) => {
    if (payload?.id) socket.leave(`raid:${payload.id}`);
    ack(cb);
  });
  socket.on('subscribe:lobby', (cb?: unknown) => { socket.join('raids'); ack(cb); });
  socket.on('unsubscribe:lobby', (cb?: unknown) => { socket.leave('raids'); ack(cb); });
}

export function registerSocket(io: Server, deps: { verify: (token: string) => AccessClaims }) {
  io.use(createSocketAuth(deps.verify));
  io.on('connection', (socket) => registerSubscriptions(socket));
}
