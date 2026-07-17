export type PushMessage = { title: string; body: string; data?: Record<string, string> };

export interface PushGateway {
  send(tokens: string[], msg: PushMessage): Promise<{ invalidTokens: string[] }>;
}

export const noopPushGateway: PushGateway = {
  async send() { return { invalidTokens: [] }; },
};
