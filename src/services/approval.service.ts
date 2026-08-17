import type { ContentItem } from '../core/types';
import { ApprovalRequiredError, AppError } from '../core/errors';
import { Store } from '../repositories/store';
import { ClickUpAdapter } from '../integrations/clickup.adapter';
import { env } from '../config/env';

export class ApprovalService {
  constructor(private readonly store: Store, private readonly clickup = new ClickUpAdapter()) {}

  async submitForReview(id: string): Promise<ContentItem> {
    const content = await this.store.getContent(id);
    if (content.status === 'PUBLISHED' || content.status === 'ARCHIVED') throw new AppError('Published/archived content cannot be sent back to review.', 409);
    return this.store.updateContent(id, { status: 'IN_REVIEW' });
  }

  async approve(id: string, approvedBy = 'user'): Promise<ContentItem> {
    const content = await this.store.getContent(id);
    if (content.status !== 'IN_REVIEW') throw new AppError('Only IN_REVIEW content can be approved.', 409, 'INVALID_TRANSITION');
    if (content.clickupTaskId) await this.clickup.updateStatus(content.clickupTaskId, env.CLICKUP_STATUS_READY);
    return this.store.updateContent(id, { status: 'READY', approvedAt: new Date().toISOString(), approvedBy });
  }

  ensureReady(content: ContentItem): void {
    if (content.status !== 'READY') throw new ApprovalRequiredError();
  }
}
