import { Store } from '../repositories/store';

export class MetricsService {
  constructor(private readonly store: Store) {}

  async get() {
    const [contents, logs] = await Promise.all([this.store.listContents(), this.store.listLogs()]);
    const byStatus = Object.fromEntries(['DRAFT','IN_PROGRESS','IN_REVIEW','READY','PUBLISHED','ARCHIVED'].map((s) => [s, contents.filter((c) => c.status === s).length]));
    const byPlatform: Record<string, number> = {};
    for (const log of logs) byPlatform[log.platform] = (byPlatform[log.platform] ?? 0) + 1;
    const success = logs.filter((l) => l.result === 'SUCCESS').length;
    const warning = logs.filter((l) => l.result === 'WARNING').length;
    const error = logs.filter((l) => l.result === 'ERROR').length;
    const totalFinished = success + warning + error;
    return {
      totalContent: contents.length,
      ...byStatus,
      success, warning, error,
      publishingSuccessRate: totalFinished ? Math.round((success / totalFinished) * 10000) / 100 : 0,
      publishingByPlatform: byPlatform,
      totalLogs: logs.length,
    };
  }
}
