import { env } from '../config/env';
import { JsonDb } from '../repositories/json-db';
import { PostgresDb } from '../repositories/postgres-db';

function hasData(state: { reports: unknown[]; opportunities: unknown[]; contents: unknown[]; logs: unknown[] }): boolean {
  return state.reports.length + state.opportunities.length + state.contents.length + state.logs.length > 0;
}

async function main() {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required for migration.');

  const source = new JsonDb(env.DATA_FILE);
  const target = new PostgresDb(env.DATABASE_URL, env.DATABASE_SSL, env.DATABASE_SSL_REJECT_UNAUTHORIZED);

  try {
    const sourceState = await source.read();
    const targetState = await target.read();
    const force = ['1', 'true', 'yes', 'on'].includes((process.env.MIGRATION_FORCE ?? '').trim().toLowerCase());

    if (hasData(targetState) && !force) {
      throw new Error('PostgreSQL already contains data. Set MIGRATION_FORCE=true only if you intentionally want to replace it.');
    }

    await target.mutate((state) => {
      state.reports = sourceState.reports;
      state.opportunities = sourceState.opportunities;
      state.contents = sourceState.contents;
      state.logs = sourceState.logs;
    });

    console.log(JSON.stringify({
      migrated: true,
      reports: sourceState.reports.length,
      opportunities: sourceState.opportunities.length,
      contents: sourceState.contents.length,
      logs: sourceState.logs.length,
    }));
  } finally {
    await target.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
