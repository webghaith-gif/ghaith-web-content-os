import { env } from '../config/env';
import { fetchJson } from '../utils/http';

interface ClickUpTaskResponse { id: string; url?: string; status?: { status?: string } | string; }

export class ClickUpAdapter {
  get enabled() { return Boolean(env.CLICKUP_API_TOKEN && env.CLICKUP_LIST_ID); }

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

  async attachTaskFileFromUrl(taskId: string, fileUrl: string, fileName: string): Promise<void> {
    if (!env.CLICKUP_API_TOKEN) return;

    const source = await fetch(fileUrl);
    if (!source.ok) throw new Error(`Unable to download publishing asset (${source.status}) from ${fileUrl}`);

    const bytes = await source.arrayBuffer();
    const contentType = source.headers.get('content-type') || 'application/octet-stream';
    const form = new FormData();
    form.append('attachment', new Blob([bytes], { type: contentType }), fileName);

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
}
