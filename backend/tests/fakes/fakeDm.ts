import type { DmGateway } from '../../src/push/dmGateway';
import type { PushMessage } from '../../src/push/gateway';

export type DmSend = { discordIds: string[]; msg: PushMessage };

export function makeFakeDmGateway(opts: { fail?: boolean; failFor?: string[] } = {}): DmGateway & { sends: DmSend[] } {
  const sends: DmSend[] = [];
  return {
    sends,
    async send(discordIds, msg) {
      if (opts.fail) throw new Error('dm boom');
      // failFor simula o best-effort da impl real: quem falha é pulado, o resto recebe.
      const entregues = discordIds.filter((id) => !(opts.failFor ?? []).includes(id));
      sends.push({ discordIds: entregues, msg });
    },
  };
}
