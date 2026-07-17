import { EmbedBuilder, type Client } from 'discord.js';
import type { PushMessage } from './gateway';
import { logger } from '../common/logger/logger';

export interface DmGateway {
  // Nunca lança: falha por usuário é logada internamente e não impede os demais.
  send(discordIds: string[], msg: PushMessage): Promise<void>;
}

export const noopDmGateway: DmGateway = {
  async send() {},
};

// Puro (testável): o titulo vira link direto para a raid.
export function buildDmEmbed(msg: PushMessage, appPublicUrl: string): EmbedBuilder {
  const e = new EmbedBuilder().setTitle(msg.title).setDescription(msg.body);
  const codigo = msg.data?.codigo;
  if (codigo) e.setURL(`${appPublicUrl}/r/${codigo}`);
  return e;
}

export function createDiscordDmGateway(client: Client, appPublicUrl: string): DmGateway {
  return {
    async send(discordIds, msg) {
      const embed = buildDmEmbed(msg, appPublicUrl);
      for (const id of discordIds) {
        try {
          const user = await client.users.fetch(id);
          await user.send({ embeds: [embed] });
        } catch (err) {
          // 50007 = DMs desativadas ou sem servidor em comum. Best-effort: segue para o próximo.
          logger.warn({ err, discordId: id }, 'discord: DM não entregue');
        }
      }
    },
  };
}
