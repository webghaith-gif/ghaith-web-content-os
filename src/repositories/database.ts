import type { ContentItem, Opportunity, PublicationLog, Report } from '../core/types';

export interface DatabaseShape {
  reports: Report[];
  opportunities: Opportunity[];
  contents: ContentItem[];
  logs: PublicationLog[];
}

export interface DatabaseBackend {
  read(): Promise<DatabaseShape>;
  mutate<T>(fn: (db: DatabaseShape) => T | Promise<T>): Promise<T>;
}

export const emptyDb = (): DatabaseShape => ({ reports: [], opportunities: [], contents: [], logs: [] });

export function normalizeDb(value: Partial<DatabaseShape> | undefined | null): DatabaseShape {
  return {
    reports: Array.isArray(value?.reports) ? value.reports : [],
    opportunities: Array.isArray(value?.opportunities) ? value.opportunities : [],
    contents: Array.isArray(value?.contents) ? value.contents : [],
    logs: Array.isArray(value?.logs) ? value.logs : [],
  };
}
