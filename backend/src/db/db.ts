import { Kysely, MysqlDialect, type MysqlPool } from 'kysely';
import { createPool } from 'mysql2';
import { getConfig } from '../config';
import type { DB } from './schema';

export function createDb(): Kysely<DB> {
  const dialect = new MysqlDialect({
    // Cast na fronteira do driver: os typings do mysql2 divergem nominalmente da
    // interface MysqlPool do Kysely. A execução é idêntica e as queries continuam
    // parametrizadas pelo Kysely.
    pool: createPool({ uri: getConfig().DATABASE_URL, connectionLimit: 10 }) as unknown as MysqlPool,
  });
  return new Kysely<DB>({ dialect });
}

export const db = createDb();
