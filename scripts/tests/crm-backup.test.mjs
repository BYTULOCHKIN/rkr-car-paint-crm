import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../crm-backup.mjs', import.meta.url));

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'crm-backup-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const data = join(root, 'data');
  mkdirSync(data);
  return { data, backups: join(root, 'backups') };
}

test('backs up legacy and organization databases, including uncheckpointed WAL data', (t) => {
  const { data, backups } = fixture(t);
  const filenames = ['crm.sqlite', 'crm.sqlite.org-example.sqlite'];
  const sources = filenames.map((filename) => {
    const db = new DatabaseSync(join(data, filename));
    db.exec(
      'PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE records(value TEXT)'
    );
    db.prepare('INSERT INTO records VALUES (?)').run(filename);
    return db;
  });
  t.after(() => sources.forEach((db) => db.close()));
  writeFileSync(join(data, 'unrelated.sqlite'), 'not a CRM database');
  const result = spawnSync(process.execPath, [script, join(data, 'crm.sqlite'), backups], {
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
  const completed = result.stdout.trim();
  const manifest = JSON.parse(readFileSync(join(completed, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.databases, filenames);
  for (const filename of filenames) {
    const restored = new DatabaseSync(join(completed, filename), { readOnly: true });
    try {
      assert.equal(restored.prepare('SELECT value FROM records').get().value, filename);
      assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    } finally {
      restored.close();
    }
  }
  assert.equal(readdirSync(backups).length, 1);
});

test('does not report success or create an empty database when source is missing', (t) => {
  const { data, backups } = fixture(t);
  const result = spawnSync(process.execPath, [script, join(data, 'crm.sqlite'), backups], {
    encoding: 'utf8'
  });
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.deepEqual(readdirSync(data), []);
});

test('does not publish a partial snapshot when one database is corrupt', (t) => {
  const { data, backups } = fixture(t);
  const db = new DatabaseSync(join(data, 'crm.sqlite'));
  db.exec('CREATE TABLE records(value TEXT)');
  db.close();
  writeFileSync(join(data, 'crm.sqlite.org-broken.sqlite'), 'corrupt');
  const result = spawnSync(process.execPath, [script, join(data, 'crm.sqlite'), backups], {
    encoding: 'utf8'
  });
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.deepEqual(readdirSync(backups), []);
});
