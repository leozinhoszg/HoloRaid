import type { DiscordGateway } from '../../src/discord/gateway';
import type { RaidEmbed } from '../../src/discord/embed';

export type GatewayCall =
  | { kind: 'post'; channelId: string; embed: RaidEmbed }
  | { kind: 'edit'; channelId: string; messageId: string; embed: RaidEmbed }
  | { kind: 'delete'; channelId: string; messageId: string }
  | { kind: 'message'; channelId: string; content: string };

export function makeFakeGateway(opts: { failChannels?: string[] } = {}): DiscordGateway & { calls: GatewayCall[] } {
  const calls: GatewayCall[] = [];
  let seq = 1;
  const failIf = (channelId: string) => { if (opts.failChannels?.includes(channelId)) throw new Error('boom ' + channelId); };
  return {
    calls,
    async postEmbed(channelId, embed) { failIf(channelId); calls.push({ kind: 'post', channelId, embed }); return 'msg-' + seq++; },
    async editEmbed(channelId, messageId, embed) { failIf(channelId); calls.push({ kind: 'edit', channelId, messageId, embed }); },
    async deleteMessage(channelId, messageId) { failIf(channelId); calls.push({ kind: 'delete', channelId, messageId }); },
    async postMessage(channelId, content) { failIf(channelId); calls.push({ kind: 'message', channelId, content }); },
  };
}
