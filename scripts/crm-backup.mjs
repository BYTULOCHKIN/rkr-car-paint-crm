import { DatabaseSync, backup } from 'node:sqlite';
import { mkdir, mkdtemp, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

// Use SQLite's online backup API: copying a live .sqlite file can omit WAL data.
const source = resolve(process.argv[2] || process.env.CRM_DATABASE_PATH || 'data/crm.sqlite');
const destination = resolve(process.argv[3] || 'backups');
const base = basename(source);
const files = (await readdir(dirname(source), { withFileTypes: true }))
  .filter(
    (entry) =>
      entry.isFile() &&
      (entry.name === base ||
        (entry.name.startsWith(`${base}.org-`) && entry.name.endsWith('.sqlite')))
  )
  .map((entry) => entry.name)
  .sort();

if (!files.length) throw new Error('No CRM databases found; backup was not created.');

await mkdir(destination, { recursive: true, mode: 0o700 });
const staging = await mkdtemp(join(destination, '.incomplete-'));
try {
  for (const filename of files) {
    const db = new DatabaseSync(join(dirname(source), filename), { readOnly: true });
    try {
      await backup(db, join(staging, filename));
    } finally {
      db.close();
    }
    const copy = new DatabaseSync(join(staging, filename), { readOnly: true });
    try {
      const result = copy.prepare('PRAGMA integrity_check').all();
      if (result.length !== 1 || result[0].integrity_check !== 'ok') {
        throw new Error(`Integrity check failed for ${filename}`);
      }
    } finally {
      copy.close();
    }
  }
  const createdAt = new Date().toISOString();
  await writeFile(
    join(staging, 'manifest.json'),
    JSON.stringify({ createdAt, databases: files }, null, 2),
    { mode: 0o600 }
  );
  const completed = join(
    destination,
    `crm-${createdAt.replaceAll(':', '-')}-${basename(staging).slice(-6)}`
  );
  await rename(staging, completed);
  process.stdout.write(`${completed}\n`);
} catch (error) {
  await rm(staging, { recursive: true, force: true });
  throw error;
}
