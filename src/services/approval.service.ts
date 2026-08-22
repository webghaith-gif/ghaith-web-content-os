import type { ContentItem } from '../core/types';
import { ApprovalRequiredError, AppError } from '../core/errors';
import { Store } from '../repositories/store';

const MIN_CONTENT_QUALITY_SCORE = 70;

function qualityReviewFailures(content: ContentItem): string[] {
  const review = content.package.qualityReview;
  if (!review) return [];

  const failures: string[] = [];
  if (typeof review.score === 'number' && review.score < MIN_CONTENT_QUALITY_SCORE) {
    failures.push(`score ${review.score}/${MIN_CONTENT_QUALITY_SCORE}`);
  }
  if (review.sourceFaithful === false) failures.push('sourceFaithful=false');
  if (review.platformAdapted === false) failures.push('platformAdapted=false');
  if (review.nonRepetitive === false) failures.push('nonRepetitive=false');
  return failures;
}

export class ApprovalService {
  constructor(private readonly store: Store) {}

  async submitForReview(id: string): Promise<ContentItem> {
    const content = await this.store.getContent(id);
    if (content.status === 'PUBLISHED' || content.status === 'ARCHIVED') throw new AppError('Published/archived content cannot be sent back to review.', 409);
    return this.store.updateContent(id, { status: 'IN_REVIEW' });
  }

  async approve(id: string, approvedBy = 'user'): Promise<ContentItem> {
    const content = await this.store.getContent(id);
    if (content.status !== 'IN_REVIEW') throw new AppError('Only IN_REVIEW content can be approved.', 409, 'INVALID_TRANSITION');

    const qualityFailures = qualityReviewFailures(content);
    if (qualityFailures.length) {
      throw new AppError(
        `Content quality review must pass before READY: ${qualityFailures.join(', ')}.`,
        409,
        'QUALITY_REVIEW_FAILED',
      );
    }

    return this.store.updateContent(id, { status: 'READY', approvedAt: new Date().toISOString(), approvedBy });
  }

  ensureReady(content: ContentItem): void {
    if (content.status !== 'READY') throw new ApprovalRequiredError();
  }
}
