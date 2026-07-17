import type { PushMessage } from './gateway';

export interface DmGateway {
  // Nunca lança: falha por usuário é logada internamente e não impede os demais.
  send(discordIds: string[], msg: PushMessage): Promise<void>;
}

export const noopDmGateway: DmGateway = {
  async send() {},
};
