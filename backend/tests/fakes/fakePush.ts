import type { PushGateway, PushMessage } from '../../src/push/gateway';

export type PushSend = { tokens: string[]; msg: PushMessage };

export function makeFakePushGateway(opts: { invalidTokens?: string[]; fail?: boolean } = {}): PushGateway & { sends: PushSend[] } {
  const sends: PushSend[] = [];
  return {
    sends,
    async send(tokens, msg) {
      if (opts.fail) throw new Error('push boom');
      sends.push({ tokens, msg });
      return { invalidTokens: (opts.invalidTokens ?? []).filter((t) => tokens.includes(t)) };
    },
  };
}
