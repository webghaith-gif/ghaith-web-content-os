import path from 'node:path';
import { addBundleToSandbox, createSandbox, renderMediaOnVercel } from '@remotion/vercel';
import { env } from '../config/env';
import type { ContentItem, VideoSceneContent } from '../core/types';

export interface RemotionConnectionProbe {
  ok: boolean;
  enabled: boolean;
  mode: 'vercel-sandbox' | 'disabled';
  engine: 'remotion';
  message?: string;
}

export class RemotionAdapter {
  get enabled() { return env.REMOTION_ENABLED; }

  configuration(): RemotionConnectionProbe {
    return {
      ok: this.enabled,
      enabled: this.enabled,
      mode: this.enabled ? 'vercel-sandbox' : 'disabled',
      engine: 'remotion',
      message: this.enabled ? undefined : 'Remotion is enabled automatically on Vercel or with REMOTION_ENABLED=true.',
    };
  }

  async testConnection(): Promise<RemotionConnectionProbe> {
    const base = this.configuration();
    if (!this.enabled) return base;
    let sandbox: Awaited<ReturnType<typeof createSandbox>> | undefined;
    try {
      sandbox = await createSandbox({ timeoutInMilliseconds: 90_000 });
      return { ...base, ok: true, message: 'Vercel Sandbox created successfully.' };
    } catch (error) {
      return { ...base, ok: false, message: error instanceof Error ? error.message : String(error) };
    } finally {
      await sandbox?.stop().catch(() => undefined);
    }
  }

  async renderVideo(content: ContentItem): Promise<Uint8Array> {
    if (!this.enabled) throw new Error('Remotion is not enabled in this runtime.');
    const bundleDir = path.join(__dirname, '..', '..', 'remotion-bundle');
    const sandbox = await createSandbox({ timeoutInMilliseconds: 12 * 60_000, resources: { vcpus: 4 } });
    try {
      await addBundleToSandbox({ sandbox, bundleDir });
      const result = await renderMediaOnVercel({
        sandbox,
        compositionId: 'GhaithVertical',
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
      return new Uint8Array(buffer);
    } finally {
      await sandbox.stop().catch(() => undefined);
    }
  }
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
