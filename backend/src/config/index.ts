import * as dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DB_HOST: z.string().min(1).default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_USER: z.string().min(1).default('root'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().min(1).default('holoraid'),
  JWT_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_CLIENT_SECRET: z.string().min(1),
  DISCORD_REDIRECT_URI: z.string().url(),
  ADMIN_DISCORD_IDS: z.string().default('').transform(csv),
  CORS_ORIGINS: z.string().default('').transform(csv),
  DISCORD_BOT_TOKEN: z.string().min(1).optional(),
  APP_PUBLIC_URL: z.string().url().default('https://holoraid.fun'),
  FIREBASE_SERVICE_ACCOUNT: z.string().min(1).optional(),
});

export type AppConfig = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const fields = JSON.stringify(parsed.error.flatten().fieldErrors);
    throw new Error(`Configuração de ambiente inválida: ${fields}`);
  }
  return parsed.data;
}

let cached: AppConfig | null = null;
export function getConfig(): AppConfig {
  if (!cached) cached = loadConfig();
  return cached;
}
