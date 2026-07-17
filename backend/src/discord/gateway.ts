import { Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, type TextChannel } from 'discord.js';
import type { RaidEmbed } from './embed';

export interface DiscordGateway {
  postEmbed(channelId: string, embed: RaidEmbed): Promise<string>;
  editEmbed(channelId: string, messageId: string, embed: RaidEmbed): Promise<void>;
  deleteMessage(channelId: string, messageId: string): Promise<void>;
  postMessage(channelId: string, content: string): Promise<void>;
}

export const noopGateway: DiscordGateway = {
  async postEmbed() { return ''; },
  async editEmbed() {},
  async deleteMessage() {},
  async postMessage() {},
};

function render(embed: RaidEmbed) {
  const e = new EmbedBuilder().setTitle(embed.title);
  for (const f of embed.fields) e.addFields({ name: f.name, value: f.value, inline: true });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`hr:join:${embed.codigo}`).setLabel('Join').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`hr:leave:${embed.codigo}`).setLabel('Leave').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setLabel('View on web').setStyle(ButtonStyle.Link).setURL(embed.joinUrl),
  );
  return { embeds: [e], components: [row] };
}

export function createDiscordJsGateway(client: Client): DiscordGateway {
  const channel = async (id: string) => (await client.channels.fetch(id)) as TextChannel;
  return {
    async postEmbed(channelId, embed) {
      const msg = await (await channel(channelId)).send(render(embed));
      return msg.id;
    },
    async editEmbed(channelId, messageId, embed) {
      const ch = await channel(channelId);
      const msg = await ch.messages.fetch(messageId);
      await msg.edit(render(embed));
    },
    async deleteMessage(channelId, messageId) {
      const ch = await channel(channelId);
      const msg = await ch.messages.fetch(messageId);
      await msg.delete();
    },
    async postMessage(channelId, content) {
      await (await channel(channelId)).send(content);
    },
  };
}
