import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Migrator, FileMigrationProvider } from 'kysely';
import { db } from './db';

export async function migrateToLatest(): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname, 'migrations'),
    }),
  });
  const { error, results } = await migrator.migrateToLatest();
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
