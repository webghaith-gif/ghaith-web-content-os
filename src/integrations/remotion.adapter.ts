import path from 'node:path';
import { env } from '../config/env';
import type { ContentItem, VideoSceneContent } from '../core/types';

type RemotionVercelModule = typeof import('@remotion/vercel');
type RemotionSandbox = Awaited<ReturnType<RemotionVercelModule['createSandbox']>>;

let remotionVercelModule: Promise<RemotionVercelModule> | undefined;

function loadRemotionVercel() {
  remotionVercelModule ??= import('@remotion/vercel');
  return remotionVercelModule;
}

export interface RemotionConnectionProbe {
  ok: boolean;
  enabled: boolean;
  mode: 'vercel-sandbox' | 'disabled';
  engine: 'remotion';
  message?: string;
}

export type RemotionFormat = 'vertical' | 'landscape' | 'square' | 'portrait' | 'pinterest';

export interface RemotionRenderedVideo {
  format: RemotionFormat;
  ratio: '9:16' | '16:9' | '1:1' | '4:5' | '2:3';
  compositionId: string;
  width: number;
  height: number;
  platforms: string[];
  bytes: Uint8Array;
}

export interface RemotionRenderBatch {
  videos: RemotionRenderedVideo[];
  errors: Array<{ format: RemotionFormat; message: string }>;
}

const FORMAT_PRESETS: Record<RemotionFormat, Omit<RemotionRenderedVideo, 'bytes'>> = {
  vertical: { format: 'vertical', ratio: '9:16', compositionId: 'GhaithVertical', width: 1080, height: 1920, platforms: ['instagram', 'tiktok', 'youtube'] },
  landscape: { format: 'landscape', ratio: '16:9', compositionId: 'GhaithLandscape', width: 1920, height: 1080, platforms: ['youtube', 'facebook', 'x'] },
  square: { format: 'square', ratio: '1:1', compositionId: 'GhaithSquare', width: 1080, height: 1080, platforms: ['facebook', 'instagram'] },
  portrait: { format: 'portrait', ratio: '4:5', compositionId: 'GhaithPortrait', width: 1080, height: 1350, platforms: ['instagram', 'facebook'] },
  pinterest: { format: 'pinterest', ratio: '2:3', compositionId: 'GhaithPinterest', width: 1000, height: 1500, platforms: ['pinterest'] },
};

export class RemotionAdapter {
  get enabled() { return env.REMOTION_ENABLED; }

  configuration(): RemotionConnectionProbe {
    return {
      ok: this.enabled,
      enabled: this.enabled,
      mode: this.enabled ? 'vercel-sandbox' : 'disabled',
      engine: 'remotion',
      message: this.enabled ? 'Multi-format rendering: 9:16, 16:9, 1:1, 4:5 and 2:3.' : 'Remotion is enabled automatically on Vercel or with REMOTION_ENABLED=true.',
    };
  }

  async testConnection(): Promise<RemotionConnectionProbe> {
    const base = this.configuration();
    if (!this.enabled) return base;
    let sandbox: RemotionSandbox | undefined;
    try {
      const { addBundleToSandbox, createSandbox } = await loadRemotionVercel();
      sandbox = await createSandbox({ timeoutInMilliseconds: 90_000 });
      const bundleDir = path.join(__dirname, '..', '..', 'remotion-bundle');
      await prepareSandboxBundle(sandbox, bundleDir, addBundleToSandbox);
      return { ...base, ok: true, message: 'Vercel Sandbox created and the Remotion bundle loaded successfully.' };
    } catch (error) {
      return { ...base, ok: false, message: error instanceof Error ? error.message : String(error) };
    } finally {
      await sandbox?.stop().catch(() => undefined);
    }
  }

  async renderVideos(content: ContentItem): Promise<RemotionRenderBatch> {
    if (!this.enabled) throw new Error('Remotion is not enabled in this runtime.');
    const { addBundleToSandbox, createSandbox, renderMediaOnVercel } = await loadRemotionVercel();
    const bundleDir = path.join(__dirname, '..', '..', 'remotion-bundle');
    const sandbox = await createSandbox({ timeoutInMilliseconds: 12 * 60_000, resources: { vcpus: 4 } });
    const videos: RemotionRenderedVideo[] = [];
    const errors: RemotionRenderBatch['errors'] = [];
    try {
      await prepareSandboxBundle(sandbox, bundleDir, addBundleToSandbox);
      for (const format of selectRemotionFormats(content)) {
        const preset = FORMAT_PRESETS[format];
        try {
          const result = await renderMediaOnVercel({
            sandbox,
            compositionId: preset.compositionId,
            outputFile: `/tmp/ghaith-${format}.mp4`,
            codec: 'h264',
            x264Preset: 'medium',
            crf: 20,
            concurrency: 2,
            timeoutInMilliseconds: 120_000,
            inputProps: {
              title: clean(content.title, 100),
              hook: clean(content.package.hook || content.title, 90),
              cta: clean(content.package.cta || 'احفظ الفكرة وابدأ الآن', 100),
              scenes: normalizedScenes(content.package.videoScenes, content.package.script || content.package.caption),
            },
          });
          const buffer = await sandbox.fs.readFile(result.sandboxFilePath);
          if (!buffer?.length) throw new Error('Remotion returned an empty video file.');
          videos.push({ ...preset, bytes: new Uint8Array(buffer) });
        } catch (error) {
          errors.push({ format, message: error instanceof Error ? error.message : String(error) });
        }
      }
      return { videos, errors };
    } finally {
      await sandbox.stop().catch(() => undefined);
    }
  }

  async renderVideo(content: ContentItem): Promise<Uint8Array> {
    const result = await this.renderVideos(content);
    if (!result.videos.length) throw new Error(result.errors.map((item) => `${item.format}: ${item.message}`).join('; ') || 'Remotion did not render a video.');
    return result.videos[0]!.bytes;
  }
}

async function prepareSandboxBundle(
  sandbox: RemotionSandbox,
  bundleDir: string,
  addBundleToSandbox: RemotionVercelModule['addBundleToSandbox'],
) {
  // @remotion/vercel 4.0.506 creates nested paths below this directory but
  // does not create the root itself. Vercel Sandbox mkdir is not recursive.
  await sandbox.mkDir('remotion-bundle');
  await addBundleToSandbox({ sandbox, bundleDir });
}

export function selectRemotionFormats(content: ContentItem): RemotionFormat[] {
  const platforms = new Set(content.platforms.map((platform) => platform.toLowerCase()));
  const type = `${content.contentType ?? ''} ${content.package.videoPrompt ?? ''}`.toLowerCase();
  const shortForm = /short|reel|story|عمودي|قصير/.test(type);
  const formats = new Set<RemotionFormat>();
  if (platforms.has('tiktok')) formats.add('vertical');
  if (platforms.has('youtube')) formats.add(shortForm ? 'vertical' : 'landscape');
  if (platforms.has('instagram')) formats.add(shortForm ? 'vertical' : 'portrait');
  if (platforms.has('facebook')) formats.add(shortForm ? 'vertical' : 'square');
  if (platforms.has('pinterest')) formats.add('pinterest');
  if (platforms.has('x')) formats.add('landscape');
  if (!formats.size) formats.add('vertical');
  return (['vertical', 'landscape', 'square', 'portrait', 'pinterest'] as RemotionFormat[]).filter((format) => formats.has(format));
}

function normalizedScenes(scenes: VideoSceneContent[] | undefined, fallback?: string) {
  return Array.from({ length: 3 }, (_, index) => ({
    title: clean(scenes?.[index]?.title || `الخطوة ${index + 1}`, 64),
    body: clean(scenes?.[index]?.body || fallback || 'حوّل الفكرة إلى خطوة عملية قابلة للتنفيذ.', 170),
  }));
}

function clean(value: string, max: number) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}
