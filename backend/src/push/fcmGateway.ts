import { initializeApp, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import type { PushGateway } from './gateway';

// Códigos do FCM que significam "esse token morreu" → apagar do banco.
const INVALID = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

export function createFcmGateway(serviceAccountBase64: string): PushGateway {
  const json = JSON.parse(Buffer.from(serviceAccountBase64, 'base64').toString('utf8'));
  const app = initializeApp({ credential: cert(json) });
  const messaging = getMessaging(app);

  return {
    async send(tokens, msg) {
      if (!tokens.length) return { invalidTokens: [] };
      const res = await messaging.sendEachForMulticast({
        tokens,
        notification: { title: msg.title, body: msg.body },
        data: msg.data,
      });
      const invalidTokens: string[] = [];
      res.responses.forEach((r, i) => {
        if (!r.success && r.error && INVALID.has(r.error.code)) invalidTokens.push(tokens[i]!);
      });
      return { invalidTokens };
    },
  };
}
