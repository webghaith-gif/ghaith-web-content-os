import { env } from '../config/env';
import { fetchJson } from '../utils/http';

interface ClickUpTaskResponse { id: string; url?: string; status?: { status?: string } | string; }
interface ClickUpListResponse { id: string; name?: string; }
interface ClickUpTeamsResponse { teams?: Array<{ id: string | number; name?: string }>; }
interface ClickUpWebhookRecord {
  id?: string;
  endpoint?: string;
  status?: string;
  events?: string[];
  webhook?: { id?: string; endpoint?: string; status?: string; events?: string[]; secret?: string };
}
interface ClickUpWebhooksResponse { webhooks?: ClickUpWebhookRecord[]; }

export interface ClickUpStatusWebhook {
  id: string;
  secret: string;
  endpoint: string;
  workspaceId: string;
}

export interface ClickUpConnectionProbe {
  ok: boolean;
  enabled: boolean;
  listId?: string;
  listName?: string;
  reason?: 'NOT_CONFIGURED' | 'CONNECTION_FAILED';
}

export class ClickUpAdapter {
  get enabled() { return Boolean(env.CLICKUP_API_TOKEN && env.CLICKUP_LIST_ID); }

  async testConnection(): Promise<ClickUpConnectionProbe> {
    if (!env.CLICKUP_API_TOKEN || !env.CLICKUP_LIST_ID) {
      return { ok: false, enabled: false, reason: 'NOT_CONFIGURED' };
    }

    try {
      const list = await fetchJson<ClickUpListResponse>(`https://api.clickup.com/api/v2/list/${env.CLICKUP_LIST_ID}`, {
        headers: { Authorization: env.CLICKUP_API_TOKEN },
      });
      return {
        ok: true,
        enabled: true,
        listId: list.id,
        listName: list.name,
      };
    } catch {
      return {
        ok: false,
        enabled: true,
        listId: env.CLICKUP_LIST_ID,
        reason: 'CONNECTION_FAILED',
      };
    }
  }

  async getWorkspaceId(): Promise<string> {
    if (!env.CLICKUP_API_TOKEN) throw new Error('ClickUp is not configured.');
    const response = await fetchJson<ClickUpTeamsResponse>('https://api.clickup.com/api/v2/team', {
      headers: { Authorization: env.CLICKUP_API_TOKEN },
    });
    const id = response.teams?.[0]?.id;
    if (id === undefined || id === null) throw new Error('No ClickUp Workspace is available for this token.');
    return String(id);
  }

  async listWebhooks(workspaceId: string): Promise<Array<{ id: string; endpoint?: string; status?: string; events?: string[] }>> {
    if (!env.CLICKUP_API_TOKEN) return [];
    const response = await fetchJson<ClickUpWebhooksResponse>(`https://api.clickup.com/api/v2/team/${encodeURIComponent(workspaceId)}/webhook`, {
      headers: { Authorization: env.CLICKUP_API_TOKEN },
    });
    return (response.webhooks ?? []).flatMap((entry) => {
      const value = entry.webhook ?? entry;
      const id = value.id ?? entry.id;
      if (!id) return [];
      return [{ id: String(id), endpoint: value.endpoint ?? entry.endpoint, status: value.status ?? entry.status, events: value.events ?? entry.events }];
    });
  }

  async createStatusWebhook(endpoint: string, workspaceId: string): Promise<ClickUpStatusWebhook> {
    if (!env.CLICKUP_API_TOKEN || !env.CLICKUP_LIST_ID) throw new Error('ClickUp is not configured.');
    const response = await fetchJson<ClickUpWebhookRecord>(`https://api.clickup.com/api/v2/team/${encodeURIComponent(workspaceId)}/webhook`, {
      method: 'POST',
      headers: { Authorization: env.CLICKUP_API_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint,
        events: ['taskStatusUpdated'],
        list_id: Number(env.CLICKUP_LIST_ID),
      }),
    });
    const value = response.webhook ?? response;
    const id = value.id ?? response.id;
    const secret = value.secret ?? response.webhook?.secret;
    if (!id || !secret) throw new Error('ClickUp created a webhook without returning an id/secret.');
    return { id: String(id), secret, endpoint, workspaceId };
  }

  async deleteWebhook(webhookId: string): Promise<void> {
    if (!env.CLICKUP_API_TOKEN) return;
    await fetchJson(`https://api.clickup.com/api/v2/webhook/${encodeURIComponent(webhookId)}`, {
      method: 'DELETE',
      headers: { Authorization: env.CLICKUP_API_TOKEN },
    });
  }

  async createContentTask(name: string, description: string, status = 'draft'): Promise<ClickUpTaskResponse | undefined> {
    if (!env.CLICKUP_API_TOKEN || !env.CLICKUP_LIST_ID) return undefined;
    return fetchJson<ClickUpTaskResponse>(`https://api.clickup.com/api/v2/list/${env.CLICKUP_LIST_ID}/task`, {
      method: 'POST',
      headers: { Authorization: env.CLICKUP_API_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, status }),
    });
  }

  async getTask(taskId: string): Promise<ClickUpTaskResponse | undefined> {
    if (!env.CLICKUP_API_TOKEN) return undefined;
    return fetchJson<ClickUpTaskResponse>(`https://api.clickup.com/api/v2/task/${taskId}`, {
      headers: { Authorization: env.CLICKUP_API_TOKEN },
    });
  }

  async updateStatus(taskId: string, status: string): Promise<void> {
    if (!env.CLICKUP_API_TOKEN) return;
    await fetchJson(`https://api.clickup.com/api/v2/task/${taskId}`, {
      method: 'PUT',
      headers: { Authorization: env.CLICKUP_API_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  }

  async finalizeTask(taskId: string, name: string, description: string, status: string): Promise<void> {
    if (!env.CLICKUP_API_TOKEN) return;
    await fetchJson(`https://api.clickup.com/api/v2/task/${taskId}`, {
      method: 'PUT',
      headers: { Authorization: env.CLICKUP_API_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, status }),
    });
  }

  async attachTaskFile(taskId: string, bytes: Uint8Array, fileName: string, contentType = 'application/octet-stream'): Promise<void> {
    if (!env.CLICKUP_API_TOKEN) return;

    const binary = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(binary).set(bytes);
    const form = new FormData();
    form.append('attachment', new Blob([binary], { type: contentType }), fileName);

    const response = await fetch(`https://api.clickup.com/api/v2/task/${taskId}/attachment`, {
      method: 'POST',
      headers: { Authorization: env.CLICKUP_API_TOKEN },
      body: form,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`ClickUp attachment upload failed (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`);
    }
  }

  async attachTaskFileFromUrl(taskId: string, fileUrl: string, fileName: string): Promise<void> {
    if (!env.CLICKUP_API_TOKEN) return;

    const source = await fetch(fileUrl);
    if (!source.ok) throw new Error(`Unable to download publishing asset (${source.status}) from ${fileUrl}`);

    const bytes = new Uint8Array(await source.arrayBuffer());
    const contentType = source.headers.get('content-type') || 'application/octet-stream';
    await this.attachTaskFile(taskId, bytes, fileName, contentType);
  }
}