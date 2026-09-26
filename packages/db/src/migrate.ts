import { migrate } from 'drizzle-orm/postgres-js/migrator';
import path from 'path';
import { db, conn } from './client';

export interface MigrationOptions {
  migrationsFolder?: string;
}

/**
 * Programmatic Drizzle Migration Runner for AristoColors Database.
 * Applies SQL migrations from packages/db/drizzle onto PostgreSQL 16 with pgvector.
 */
export async function runMigrations(options?: MigrationOptions): Promise<void> {
  const migrationsFolder = options?.migrationsFolder || path.resolve(__dirname, '../drizzle');
  console.log(`[Drizzle Migrator] Applying migrations from: ${migrationsFolder}`);

  try {
    await migrate(db, { migrationsFolder });
    console.log('[Drizzle Migrator] PostgreSQL schema and pgvector migrations applied successfully.');
  } catch (error) {
    console.error('[Drizzle Migrator] Migration failed:', error);
    throw error;
  }
}

// Auto-run when executed directly via CLI
if (
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('migrate.ts') || process.argv[1].endsWith('migrate.js'))
) {
  runMigrations()
    .then(async () => {
      console.log('[Drizzle Migrator] Migration completed. Closing connection pool...');
      await conn.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[Drizzle Migrator] Fatal migration error:', err);
      try {
        await conn.end();
      } catch {
        // ignore
      }
      process.exit(1);
    });
}
