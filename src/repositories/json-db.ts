import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ContentItem, Opportunity, PublicationLog, Report } from '../core/types';

export interface DatabaseShape {
  reports: Report[];
  opportunities: Opportunity[];
  contents: ContentItem[];
  logs: PublicationLog[];
}

const emptyDb = (): DatabaseShape => ({ reports: [], opportunities: [], contents: [], logs: [] });

export class JsonDb {
  constructor(private readonly filePath: string) {}

  async read(): Promise<DatabaseShape> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      return { ...emptyDb(), ...JSON.parse(raw) };
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        await this.write(emptyDb());
        return emptyDb();
      }
      throw error;
    }
  }

  async write(data: DatabaseShape): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await fs.rename(tmp, this.filePath);
  }

  async mutate<T>(fn: (db: DatabaseShape) => T | Promise<T>): Promise<T> {
    const db = await this.read();
    const result = await fn(db);
    await this.write(db);
    return result;
  }
}
