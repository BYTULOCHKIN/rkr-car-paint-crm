import { loadEnvConfig } from '@next/env';
import { createClerkClient } from '@clerk/nextjs/server';
import { backup, DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { parseArgs } from 'node:util';
import {
  defaultDemoCounts,
  generateDemoData,
  importDemoData,
  removeDemoData
} from '../src/features/crm/server/demo-data';
import type { HistoryActor } from '../src/features/crm/api/types';

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  const { values } = parseArgs({
    options: {
      organization: { type: 'string' },
      'run-id': { type: 'string', default: 'avto-farba-demo-v1' },
      apply: { type: 'boolean', default: false },
      remove: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false }
    }
  });
  if (values.help || !values.organization) {
    console.log(
      'node --import tsx scripts/crm-demo.ts --organization "АВТО ФАРБА" [--apply] [--remove] [--run-id NAME]'
    );
    if (!values.help) process.exitCode = 1;
    return;
  }
  if (!process.env.CLERK_SECRET_KEY) throw new Error('Не задано CLERK_SECRET_KEY');
  const client = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const matches: { id: string; name: string }[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await client.organizations.getOrganizationList({ limit: 100, offset });
    matches.push(
      ...page.data
        .filter((org) => org.name === values.organization || org.id === values.organization)
        .map((org) => ({ id: org.id, name: org.name }))
    );
    if (offset + page.data.length >= page.totalCount || !page.data.length) break;
  }
  if (matches.length !== 1)
    throw new Error('Потрібна рівно одна організація з цією назвою; вкажіть її ID');
  const organization = matches[0];
  const assignees: HistoryActor[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await client.organizations.getOrganizationMembershipList({
      organizationId: organization.id,
      limit: 100,
      offset
    });
    for (const member of page.data) {
      const user = member.publicUserData;
      if (user && ['org:admin', 'org:member'].includes(member.role))
        assignees.push({
          id: user.userId,
          name:
            [user.firstName, user.lastName].filter(Boolean).join(' ') ||
            user.identifier ||
            user.userId
        });
    }
    if (offset + page.data.length >= page.totalCount || !page.data.length) break;
  }
  if (!assignees.length) throw new Error('В організації немає доступних виконавців');
  const base = resolve(process.env.CRM_DATABASE_PATH || 'data/crm.sqlite');
  const candidates = readdirSync(dirname(base))
    .filter(
      (name) =>
        name === basename(base) ||
        (name.startsWith(`${basename(base)}.org-`) && name.endsWith('.sqlite'))
    )
    .map((name) => join(dirname(base), name));
  const targets = candidates.filter((filename) => {
    const db = new DatabaseSync(filename, { readOnly: true });
    try {
      return (
        db.prepare("SELECT value FROM crm_settings WHERE key='organization'").get()?.value ===
        organization.id
      );
    } finally {
      db.close();
    }
  });
  // The app always prefers a bound legacy database over an unused scoped file.
  const target = targets.includes(base) ? base : targets.length === 1 ? targets[0] : undefined;
  if (!target) throw new Error('Не вдалося однозначно знайти наявну базу організації');
  const runId = values['run-id'];
  console.log(
    JSON.stringify(
      {
        organization,
        database: target,
        runId,
        action: values.remove ? 'remove' : 'seed',
        counts: defaultDemoCounts,
        assignees,
        apply: values.apply
      },
      null,
      2
    )
  );
  if (!values.apply) return;
  const source = new DatabaseSync(target, { readOnly: true });
  const backupDirectory = join(dirname(target), 'backups');
  mkdirSync(backupDirectory, { recursive: true });
  const backupPath = join(backupDirectory, `${organization.id}-${Date.now()}.sqlite`);
  try {
    await backup(source, backupPath);
  } finally {
    source.close();
  }
  console.log(`Резервна копія: ${backupPath}`);
  if (values.remove) {
    removeDemoData(target, organization.id, runId);
  } else {
    const directory = mkdtempSync(join(tmpdir(), 'crm-demo-'));
    try {
      const staged = join(directory, 'demo.sqlite');
      generateDemoData(staged, assignees);
      importDemoData(target, staged, organization.id, runId);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
  console.log(values.remove ? 'Тестові дані видалено.' : 'Тестові дані завантажено.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Не вдалося виконати операцію');
  process.exitCode = 1;
});
