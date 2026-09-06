import type { AssetRef, ContentItem, PlatformContentVariant } from '../core/types';
import { AppError } from '../core/errors';

export interface ClickUpWatchPlan {
  platform: string;
  finalName: string;
  holdName: string;
  description: string;
  asset: AssetRef;
  fileName: string;
}

type Contract = {
  prefix: string;
  mediaKind: 'image' | 'video';
};

const CONTRACTS: Record<string, Contract> = {
  facebook: { prefix: '[FB]', mediaKind: 'image' },
  instagram: { prefix: '[IG]', mediaKind: 'image' },
  tiktok: { prefix: '[TT]', mediaKind: 'video' },
  pinterest: { prefix: '[PIN]', mediaKind: 'image' },
  youtube: { prefix: '[YT]', mediaKind: 'video' },
};

export function buildClickUpWatchPlans(content: ContentItem): ClickUpWatchPlan[] {
  const platforms = [...new Set(content.platforms.map((value) => value.trim().toLowerCase()).filter(Boolean))];
  if (platforms.length === 0) throw new AppError('Content has no target platforms.', 400, 'CLICKUP_PREFLIGHT_FAILED');

  return platforms.map((platform) => {
    const contract = CONTRACTS[platform];
    if (!contract) {
      throw new AppError(
        `Platform ${platform} is not supported by the fixed ClickUp → Make scenario. Add a Make route before using it in clickup_watch mode.`,
        409,
        'CLICKUP_CONTRACT_UNSUPPORTED_PLATFORM',
      );
    }

    const asset = preferredPublishingAsset(content.assets, contract.mediaKind, platform);
    if (!asset) {
      throw new AppError(
        `${platform} requires one ${contract.mediaKind} attachment before READY.`,
        409,
        'CLICKUP_PREFLIGHT_MISSING_MEDIA',
      );
    }

    const description = platformDescription(content, platform).trim();
    if (!description) {
      throw new AppError(`${platform} requires platform text before READY.`, 409, 'CLICKUP_PREFLIGHT_MISSING_TEXT');
    }

    const platformTitle = content.package.platformCopies?.[platform]?.title?.trim();
    return {
      platform,
      finalName: `${contract.prefix} ${platformTitle || content.title}`,
      holdName: `[GW-HOLD] ${platform.toUpperCase()} — ${platformTitle || content.title}`,
      description,
      asset,
      fileName: assetFileName(asset, contract.mediaKind, platform),
    };
  });
}

function preferredPublishingAsset(assets: AssetRef[], mediaKind: 'image' | 'video', platform: string): AssetRef | undefined {
  const candidates = assets.filter((candidate) => candidate.kind === mediaKind && Boolean(candidate.url?.trim()));
  const targetsPlatform = (candidate: AssetRef) => {
    const targets = (candidate.platforms ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean);
    return targets.length > 0 && targets.includes(platform);
  };
  const isGlobal = (candidate: AssetRef) => (candidate.platforms ?? []).length === 0;

  // Prefer the exact visual GPT/Canva assigned to this platform. Fall back to a global asset only
  // for legacy packages that predate platform-level asset metadata.
  const ordered = [
    ...candidates.filter(targetsPlatform),
    ...candidates.filter(isGlobal),
  ];

  // Generated binaries are stored privately in Drive. providerId is the Drive file ID
  // for google-drive and remotion assets, so the publisher can download them with OAuth.
  const driveBacked = ordered.find((candidate) =>
    Boolean(candidate.providerId)
    && (candidate.provider === 'google-drive' || candidate.provider === 'remotion'),
  );
  if (driveBacked) return driveBacked;

  // HeyGen and explicit external URLs are expected to be directly downloadable.
  const direct = ordered.find((candidate) => candidate.provider === 'heygen' || candidate.provider === 'external');
  if (direct) return direct;

  // Legacy assets without provider metadata may still be direct binary URLs.
  return ordered.find((candidate) => !candidate.provider);
}

function platformDescription(content: ContentItem, platform: string): string {
  const pkg = content.package;
  const variant = pkg.platformCopies?.[platform];
  if (variant) return variantDescription(variant, platform, pkg.cta);

  let base: string;
  switch (platform) {
    case 'youtube':
      base = pkg.description ?? pkg.caption ?? pkg.script ?? content.title;
      break;
    case 'tiktok':
      base = pkg.caption ?? pkg.description ?? pkg.hook ?? content.title;
      break;
    case 'pinterest':
      base = pkg.description ?? pkg.caption ?? pkg.hook ?? content.title;
      break;
    case 'facebook':
    case 'instagram':
    default:
      base = pkg.caption ?? pkg.description ?? pkg.hook ?? content.title;
      break;
  }

  const cta = pkg.cta?.trim();
  if (cta && !base.includes(cta)) return `${base.trim()}\n\n${cta}`;
  return base.trim();
}

function variantDescription(variant: PlatformContentVariant, platform: string, fallbackCta?: string): string {
  let base = platform === 'youtube' || platform === 'pinterest'
    ? variant.description ?? variant.caption ?? variant.hook ?? ''
    : variant.caption ?? variant.description ?? variant.hook ?? '';
  const cta = variant.cta?.trim() || fallbackCta?.trim();
  if (cta && !base.includes(cta)) base = `${base.trim()}\n\n${cta}`;
  const tags = (variant.hashtags ?? [])
    .map((tag) => tag.trim().replace(/^#/, ''))
    .filter(Boolean)
    .map((tag) => `#${tag.replace(/\s+/g, '_')}`);
  if (tags.length > 0) base = `${base.trim()}\n\n${tags.join(' ')}`;
  if (platform === 'pinterest') return base.slice(0, 800).trim();
  return base.trim();
}

function assetFileName(asset: AssetRef, mediaKind: 'image' | 'video', platform: string): string {
  try {
    const pathname = new URL(asset.url).pathname;
    const raw = decodeURIComponent(pathname.split('/').filter(Boolean).pop() ?? '');
    if (/\.[A-Za-z0-9]{2,5}$/.test(raw)) return raw;
  } catch {
    // Use a safe filename fallback below.
  }
  return `ghaith-web-${platform}.${mediaKind === 'video' ? 'mp4' : 'jpg'}`;
}
