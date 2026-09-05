import type { AssetRef, ContentItem, PublishMediaMode } from '../core/types';
import { AppError } from '../core/errors';

export interface PlatformPublishingPlan {
  platform: string;
  mediaMode: PublishMediaMode;
  assets: AssetRef[];
}

export function buildPlatformPublishingPlan(content: ContentItem, rawPlatform: string): PlatformPublishingPlan {
  const platform = rawPlatform.trim().toLowerCase();
  const assets = publishingAssetsForPlatform(content.assets ?? [], platform);
  const explicit = content.package.platformCopies?.[platform]?.mediaMode;

  switch (platform) {
    case 'facebook':
      return socialPlan(platform, assets, explicit, 30);
    case 'instagram':
      return socialPlan(platform, assets, explicit, 10);
    case 'pinterest': {
      const images = assets.filter((asset) => asset.kind === 'image');
      if (images.length < 1) throw missing(platform, 'one image');
      return { platform, mediaMode: 'single_image', assets: [images[0]!] };
    }
    case 'tiktok':
    case 'youtube': {
      const videos = assets.filter((asset) => asset.kind === 'video');
      if (videos.length !== 1) throw missing(platform, 'one video');
      return { platform, mediaMode: 'reel', assets: [videos[0]!] };
    }
    default:
      throw new AppError(`Platform ${platform} has no publishing media contract.`, 409, 'PUBLISHING_MEDIA_UNSUPPORTED');
  }
}

export function publishingAssetsForPlatform(assets: AssetRef[], platform: string): AssetRef[] {
  const publishable = assets.filter((asset) =>
    asset.provider !== 'canva'
    && (asset.kind === 'image' || asset.kind === 'video')
    && Boolean(asset.url?.trim()),
  );
  const target = (asset: AssetRef) => (asset.platforms ?? [])
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const exact = publishable.filter((asset) => target(asset).includes(platform));
  if (exact.length > 0) return exact;
  return publishable.filter((asset) => target(asset).length === 0);
}

function socialPlan(
  platform: 'facebook' | 'instagram',
  assets: AssetRef[],
  explicit: PublishMediaMode | undefined,
  maxCarouselImages: number,
): PlatformPublishingPlan {
  const images = assets.filter((asset) => asset.kind === 'image');
  const videos = assets.filter((asset) => asset.kind === 'video');
  const inferred: PublishMediaMode | undefined = explicit
    ?? (videos.length === 1 && images.length === 0 ? 'reel'
      : images.length === 1 && videos.length === 0 ? 'single_image'
        : images.length >= 2 && videos.length === 0 ? 'carousel'
          : undefined);

  if (!inferred) {
    throw new AppError(
      `${platform} media must resolve to one image, 2-${maxCarouselImages} carousel images, or one reel video.`,
      409,
      'PUBLISHING_MEDIA_AMBIGUOUS',
    );
  }

  if (inferred === 'single_image') {
    if (images.length !== 1 || videos.length !== 0) throw missing(platform, 'exactly one image');
    return { platform, mediaMode: inferred, assets: [images[0]!] };
  }
  if (inferred === 'carousel') {
    if (videos.length !== 0 || images.length < 2 || images.length > maxCarouselImages) {
      throw missing(platform, `2-${maxCarouselImages} images for a carousel`);
    }
    return { platform, mediaMode: inferred, assets: images };
  }
  if (inferred === 'reel') {
    if (videos.length !== 1 || images.length !== 0) throw missing(platform, 'exactly one reel video');
    return { platform, mediaMode: inferred, assets: [videos[0]!] };
  }

  throw new AppError(`${platform} does not support media mode ${inferred}.`, 409, 'PUBLISHING_MEDIA_UNSUPPORTED');
}

function missing(platform: string, requirement: string): AppError {
  return new AppError(
    `${platform} requires ${requirement} before READY.`,
    409,
    'MISSING_PUBLISHABLE_MEDIA',
  );
}
