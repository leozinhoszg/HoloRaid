import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { db } from './db';

// Kysely 0.29 moveu Migrator/FileMigrationProvider para o subpath 'kysely/migration'
// (correção das advisories de SQL injection). O resolvedor de tipos clássico
// (moduleResolution: node) não lê exports maps, mas o Node resolve o subpath em
// runtime. Como este é um script de migração que roda só em Node, carregamos via
// require e tipamos os resultados localmente — sem forçar mudança de resolução no
// projeto inteiro.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Migrator, FileMigrationProvider } = require('kysely/migration');

type MigrationResult = { status: 'Success' | 'Error' | 'NotExecuted'; migrationName: string };

export async function migrateToLatest(): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname, 'migrations'),
    }),
  });
  const { error, results } = (await migrator.migrateToLatest()) as {
    error?: unknown;
    results?: MigrationResult[];
  };
  results?.forEach((r) => {
    console.log(`${r.status === 'Success' ? 'OK' : 'FALHA'}: ${r.migrationName}`);
  });
  if (error) {
    console.error('Migration falhou:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  migrateToLatest().then(() => db.destroy());
}
