export const CONTENT_STATUSES = [
  'DRAFT',
  'IN_PROGRESS',
  'IN_REVIEW',
  'READY',
  'PUBLISHED',
  'ARCHIVED',
] as const;

export type ContentStatus = (typeof CONTENT_STATUSES)[number];
export type PublishResult = 'SUCCESS' | 'WARNING' | 'ERROR';

export interface Report {
  id: string;
  title: string;
  body: string;
  source?: string;
  createdAt: string;
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
  createdAt: string;
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
}

export interface AssetRef {
  kind: 'image' | 'carousel' | 'video' | 'document' | 'other';
  url: string;
  provider?: 'google-drive' | 'canva' | 'heygen' | 'external';
  providerId?: string;
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
  clickupTaskId?: string;
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
