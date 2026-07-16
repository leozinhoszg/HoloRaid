import { Kysely, MysqlDialect, type MysqlPool } from 'kysely';
import { createPool } from 'mysql2';
import { getConfig } from '../config';
import type { DB } from './schema';

export function createDb(): Kysely<DB> {
  const cfg = getConfig();
  const dialect = new MysqlDialect({
    // Campos discretos (não URI): a senha entra crua, sem percent-encoding — evita
    // a classe de bug em que caracteres especiais (ex.: '@') quebram a conexão.
    // Cast na fronteira do driver: os typings do mysql2 divergem nominalmente da
    // interface MysqlPool do Kysely; a execução é idêntica e as queries continuam
    // parametrizadas pelo Kysely.
    pool: createPool({
      host: cfg.DB_HOST,
      port: cfg.DB_PORT,
      user: cfg.DB_USER,
      password: cfg.DB_PASSWORD,
      database: cfg.DB_NAME,
      connectionLimit: 10,
      timezone: 'Z',
    }) as unknown as MysqlPool,
  });
  return new Kysely<DB>({ dialect });
}

export const db = createDb();
