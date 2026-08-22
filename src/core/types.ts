export const CONTENT_STATUSES = [
  'DRAFT',
  'IN_PROGRESS',
  'IN_REVIEW',
  'READY',
  'PUBLISHED',
  'ARCHIVED',
] as const;

export const PRODUCT_STATUSES = [
  'IN_REVIEW',
  'APPROVED',
  'PRODUCT_READY',
  'ARCHIVED',
] as const;

export type ContentStatus = (typeof CONTENT_STATUSES)[number];
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export type PublishResult = 'SUCCESS' | 'WARNING' | 'ERROR';

export interface ReportAutomationState {
  version: number;
  opportunityId?: string;
  opportunitiesReadyAt?: string;
  contentId?: string;
  contentReadyAt?: string;
  assetsReadyAt?: string;
  productId?: string;
  productReadyForReviewAt?: string;
  /** GPT explicitly decided this opportunity does not justify a product draft. */
  productSkippedAt?: string;
  completedAt?: string;
  lastError?: string;
  lastErrorAt?: string;
}

export interface Report {
  id: string;
  title: string;
  body: string;
  source?: string;
  createdAt: string;
  googleDriveUrl?: string;
  googleDriveFolderUrl?: string;
  automation?: ReportAutomationState;
}

export interface OpportunityScore {
  problemStrength: number;
  frequency: number;
  interest: number;
  purchaseIntent: number;
  contentPotential: number;
  productPotential: number;
  brandFit: number;
  easeOfExecution: number;
  freshness: number;
  total: number;
}

export interface Opportunity {
  id: string;
  reportId: string;
  title: string;
  rationale: string;
  score: OpportunityScore;
  semrush?: {
    keyword: string;
    country: string;
    searchVolume?: number;
    keywordDifficulty?: number;
    competitiveDensity?: number;
    cpcUsdCents?: number;
    intents?: string[];
    trends?: number[];
    fetchedAt: string;
  };
  createdAt: string;
}

export interface ProductQualityReview {
  score?: number;
  strengths?: string[];
  risks?: string[];
  sourceFaithful?: boolean;
  usefulWithoutHype?: boolean;
  readyForHumanReview?: boolean;
}

export interface ProductDraft {
  id: string;
  reportId: string;
  opportunityId: string;
  title: string;
  productType: string;
  targetAudience: string;
  problem: string;
  promise: string;
  deliverables: string[];
  outline: string[];
  draftBody: string;
  coverPrompt?: string;
  qualityReview?: ProductQualityReview;
  status: ProductStatus;
  googleDriveUrl?: string;
  googleDriveFolderUrl?: string;
  approvedAt?: string;
  approvedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CarouselSlideContent {
  title?: string;
  body?: string;
  points?: string[];
}

export interface VideoSceneContent {
  title?: string;
  body?: string;
}

export interface PlatformContentVariant {
  hook?: string;
  caption?: string;
  description?: string;
  cta?: string;
  title?: string;
  hashtags?: string[];
}

export interface ContentQualityReview {
  score?: number;
  strengths?: string[];
  issuesFixed?: string[];
  sourceFaithful?: boolean;
  platformAdapted?: boolean;
  nonRepetitive?: boolean;
}

export interface ContentPackage {
  hook?: string;
  caption?: string;
  cta?: string;
  description?: string;
  script?: string;
  keywords?: string[];
  imagePrompt?: string;
  videoPrompt?: string;
  /** Structured 5-page carousel data for Canva Autofill or a fallback renderer. */
  carouselSlides?: CarouselSlideContent[];
  /** Structured 3-scene multi-format video data for Canva Autofill or Remotion. */
  videoScenes?: VideoSceneContent[];
  /** Platform-specific final copy. Used before the generic fields when available. */
  platformCopies?: Record<string, PlatformContentVariant>;
  /** AI self-review metadata kept with the package for audit and later refinement. */
  qualityReview?: ContentQualityReview;
}

export interface AssetRef {
  kind: 'image' | 'carousel' | 'video' | 'document' | 'other';
  url: string;
  provider?: 'google-drive' | 'canva' | 'heygen' | 'remotion' | 'external';
  providerId?: string;
  format?: '9:16' | '16:9' | '1:1' | '4:5' | '2:3';
  width?: number;
  height?: number;
  platforms?: string[];
}

export interface ContentItem {
  id: string;
  title: string;
  topic: string;
  sourceReportId?: string;
  opportunityId?: string;
  targetAudience?: string;
  objective?: string;
  platforms: string[];
  contentType?: string;
  package: ContentPackage;
  assets: AssetRef[];
  googleDriveUrls: string[];
  /** Legacy single-task link retained for backward compatibility. */
  clickupTaskId?: string;
  /** Canonical ClickUp publishing task per target platform. */
  clickupTaskIds?: Record<string, string>;
  status: ContentStatus;
  approvedAt?: string;
  approvedBy?: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export interface PublicationLog {
  id: string;
  contentId: string;
  platform: string;
  result: PublishResult;
  timestamp: string;
  originalTaskId?: string;
  makeExecutionId?: string;
  attempt: number;
  publicUrl?: string;
  errorCode?: string;
  errorMessage?: string;
  processed: boolean;
  idempotencyKey: string;
}

export interface PublishRequest {
  contentId: string;
  clickupTaskId?: string;
  platform: string;
  title: string;
  caption?: string;
  description?: string;
  mediaUrls: string[];
  mediaType?: string;
  status: ContentStatus;
  idempotencyKey: string;
}

export interface PublishResponse {
  success: boolean;
  platform: string;
  publicUrl?: string;
  executionId?: string;
  warning?: string;
  raw?: unknown;
  dryRun?: boolean;
}
