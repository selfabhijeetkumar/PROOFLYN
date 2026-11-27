/**
 * PROOFLYN — Database migration CLI entrypoint
 */
import { createDb, runMigrations } from './schema';

const db = createDb();
runMigrations(db);
db.close();
console.log('Database migrations applied successfully.');
