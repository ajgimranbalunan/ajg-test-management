import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const databasePath = path.resolve(here, '../data/qa-management.sqlite');
for (const file of [databasePath, `${databasePath}-shm`, `${databasePath}-wal`]) {
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
await import('./database.js');
console.log('Database reset and sample data restored.');
