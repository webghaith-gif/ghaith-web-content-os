
declare const process: { env: Record<string, string | undefined>; exitCode?: number; version: string };
declare const __dirname: string;
declare const Buffer: any;
type Buffer = any;
declare const crypto: { randomUUID(): string };
declare namespace NodeJS { interface ErrnoException extends Error { code?: string } }
declare module "node:http" { export type IncomingMessage = any; export type ServerResponse = any; export const createServer: any; }
declare module "node:fs/promises" { export const readFile: any; export const writeFile: any; export const mkdir: any; export const rename: any; }
declare module "node:fs" { export const promises: any; }
declare module "node:path" { const path: any; export default path; }
declare module "node:os" { const os: any; export default os; }
declare module "node:crypto" { export const randomUUID: () => string; export const createHash: any; }
declare module "node:test" { const test: any; export default test; export const describe: any; export const it: any; }
declare module "node:assert/strict" { const assert: any; export default assert; }
declare module "pg" {
  export class Pool {
    constructor(config?: any);
    query<T = any>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
    connect(): Promise<{ query<T = any>(text: string, values?: unknown[]): Promise<{ rows: T[] }>; release(): void }>;
    end(): Promise<void>;
    on?(event: string, listener: (error: Error) => void): void;
  }
}
