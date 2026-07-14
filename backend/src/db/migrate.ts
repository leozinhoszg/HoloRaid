import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Kysely } from 'kysely';
import { db } from './db';

// Tipos de migration definidos localmente: no Kysely 0.29 eles vivem no subpath
// 'kysely/migration', que a resolução clássica de tipos não enxerga.
type MigrationFn = (db: Kysely<any>) => Promise<void>;
type Migration = { up: MigrationFn; down?: MigrationFn };
type MigrationProvider = { getMigrations(): Promise<Record<string, Migration>> };

// Kysely 0.29 moveu Migrator para o subpath 'kysely/migration' (correção das
// advisories de SQL injection). O resolvedor de tipos clássico não lê exports maps,
// mas o Node resolve o subpath em runtime — por isso carregamos via require.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Migrator } = require('kysely/migration');

type MigrationResult = { status: 'Success' | 'Error' | 'NotExecuted'; migrationName: string };

const migrationFolder = path.join(__dirname, 'migrations');

// Provider próprio: o FileMigrationProvider do Kysely passa caminhos absolutos crus
// ('D:\...') ao import() do ESM, o que quebra no Windows. Convertendo com
// pathToFileURL garantimos um esquema file:// válido em qualquer plataforma.
const provider: MigrationProvider = {
  async getMigrations(): Promise<Record<string, Migration>> {
    const files = await fs.readdir(migrationFolder);
    const migrations: Record<string, Migration> = {};
    for (const file of files.sort()) {
      if (file.endsWith('.d.ts') || !/\.(ts|js)$/.test(file)) continue;
      const name = file.replace(/\.(ts|js)$/, '');
      const mod = await import(pathToFileURL(path.join(migrationFolder, file)).href);
      migrations[name] = { up: mod.up, down: mod.down };
    }
    return migrations;
  },
};

export async function migrateToLatest(): Promise<void> {
  const migrator = new Migrator({ db, provider });
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
