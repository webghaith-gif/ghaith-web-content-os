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
}
