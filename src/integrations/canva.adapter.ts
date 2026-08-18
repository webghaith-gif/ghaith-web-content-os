import { env } from '../config/env';

export type CanvaAssetKind = 'social' | 'carousel' | 'video';
type CanvaSource = { type: 'design' | 'brand_template'; id: string };

export interface CanvaConnectionProbe {
  ok: boolean;
  enabled: boolean;
  mode: 'api' | 'webhook' | 'none';
  brandKitId?: string;
  sources: { social: boolean; carousel: boolean; video: boolean };
  message?: string;
}

export interface CanvaDesignResult {
  kind: CanvaAssetKind;
  designId: string;
  title: string;
  editUrl?: string;
  viewUrl?: string;
  exportFormat: 'png' | 'mp4';
  exportUrls: string[];
  sourceType?: CanvaSource['type'];
  sourceId?: string;
}

interface CanvaJob<T = any> {
  id?: string;
  status?: 'in_progress' | 'success' | 'failed';
  result?: T;
  error?: unknown;
  urls?: string[];
}

export class CanvaAdapter {
  get mode(): CanvaConnectionProbe['mode'] {
    if (env.CANVA_ACCESS_TOKEN) return 'api';
    if (env.CANVA_AUTOMATION_WEBHOOK_URL) return 'webhook';
    return 'none';
  }

  get enabled() { return this.mode !== 'none'; }

  async testConnection(): Promise<CanvaConnectionProbe> {
    const base = {
      enabled: this.enabled,
      mode: this.mode,
      brandKitId: env.CANVA_BRAND_KIT_ID,
      sources: {
        social: Boolean(this.sourceFor('social')),
        carousel: Boolean(this.sourceFor('carousel')),
        video: Boolean(this.sourceFor('video')),
      },
    } as const;
    if (this.mode === 'none') return { ok: false, ...base, message: 'Canva is not configured.' };
    if (this.mode === 'webhook') return { ok: true, ...base };
    try {
      const response = await this.api('/users/me');
      if (!response.ok) return { ok: false, ...base, message: `Canva returned ${response.status}.` };
      return { ok: true, ...base };
    } catch (error) {
      return { ok: false, ...base, message: error instanceof Error ? error.message : String(error) };
    }
  }

  async requestDesign(payload: Record<string, unknown>): Promise<CanvaDesignResult | unknown | undefined> {
    if (this.mode === 'none') return undefined;
    if (this.mode === 'webhook') {
      const response = await fetch(env.CANVA_AUTOMATION_WEBHOOK_URL!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`Canva automation failed: ${response.status}`);
      return response.json().catch(() => ({}));
    }

    const kind = explicitOrInferredKind(payload);
    const title = stringValue(payload.title) || 'Ghaith Web Content OS';
    const source = this.sourceFor(kind);
    const design = source
      ? await this.createFromSource(source, title, payload)
      : await this.createFallbackDesign(kind, title);

    const exportFormat = kind === 'video' ? 'mp4' : 'png';
    const exportUrls = await this.exportDesign(design.id, exportFormat);
    return {
      kind,
      designId: design.id,
      title,
      editUrl: design.urls?.edit_url,
      viewUrl: design.urls?.view_url,
      exportFormat,
      exportUrls,
      ...(source ? { sourceType: source.type, sourceId: source.id } : {}),
    };
  }

  private sourceFor(kind: CanvaAssetKind): CanvaSource | undefined {
    if (kind === 'social') {
      if (env.CANVA_SOCIAL_DESIGN_ID) return { type: 'design', id: env.CANVA_SOCIAL_DESIGN_ID };
      if (env.CANVA_SOCIAL_TEMPLATE_ID) return { type: 'brand_template', id: env.CANVA_SOCIAL_TEMPLATE_ID };
    }
    if (kind === 'carousel') {
      if (env.CANVA_CAROUSEL_DESIGN_ID) return { type: 'design', id: env.CANVA_CAROUSEL_DESIGN_ID };
      if (env.CANVA_CAROUSEL_TEMPLATE_ID) return { type: 'brand_template', id: env.CANVA_CAROUSEL_TEMPLATE_ID };
    }
    if (kind === 'video') {
      if (env.CANVA_VIDEO_DESIGN_ID) return { type: 'design', id: env.CANVA_VIDEO_DESIGN_ID };
      if (env.CANVA_VIDEO_TEMPLATE_ID) return { type: 'brand_template', id: env.CANVA_VIDEO_TEMPLATE_ID };
    }
    return undefined;
  }

  private async createFromSource(source: CanvaSource, title: string, payload: Record<string, unknown>): Promise<any> {
    const data = buildAutofillData(payload, title);
    if (source.type === 'design') {
      const supportedData = await this.filterByDesignDataset(source.id, data);
      if (Object.keys(supportedData).length > 0) {
        const response = await this.api('/autofills', {
          method: 'POST',
          body: JSON.stringify({ type: 'create_from_design', design_id: source.id, title, data: supportedData }),
        });
        if (!response.ok) throw new Error(`Canva design autofill failed: ${response.status} ${await response.text()}`);
        const initial = await response.json() as { job?: CanvaJob };
        const job = await this.waitForJob(`/autofills/${initial.job?.id}`, initial.job);
        const design = (job as any)?.result?.design ?? (job as any)?.design;
        if (!design?.id) throw new Error('Canva autofill did not return a design ID.');
        return design;
      }

      const copyResponse = await this.api('/designs', {
        method: 'POST',
        body: JSON.stringify({ type: 'design', design_id: source.id }),
      });
      if (!copyResponse.ok) throw new Error(`Canva design copy failed: ${copyResponse.status} ${await copyResponse.text()}`);
      const copied = await copyResponse.json() as { design?: any };
      if (!copied.design?.id) throw new Error('Canva did not return a copied design ID.');
      return copied.design;
    }

    if (Object.keys(data).length > 0) {
      const response = await this.api('/autofills', {
        method: 'POST',
        body: JSON.stringify({ type: 'create_from_brand_template', brand_template_id: source.id, title, data }),
      });
      if (response.ok) {
        const initial = await response.json() as { job?: CanvaJob };
        const job = await this.waitForJob(`/autofills/${initial.job?.id}`, initial.job);
        const design = (job as any)?.result?.design ?? (job as any)?.design;
        if (design?.id) return design;
      }
    }

    const copyResponse = await this.api('/designs', {
      method: 'POST',
      body: JSON.stringify({ type: 'brand_template', brand_template_id: source.id }),
    });
    if (!copyResponse.ok) throw new Error(`Canva brand-template copy failed: ${copyResponse.status} ${await copyResponse.text()}`);
    const copied = await copyResponse.json() as { design?: any };
    if (!copied.design?.id) throw new Error('Canva did not return a design ID.');
    return copied.design;
  }

  private async filterByDesignDataset(designId: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await this.api(`/designs/${designId}/dataset`);
    if (!response.ok) throw new Error(`Canva design dataset check failed: ${response.status} ${await response.text()}`);
    const body = await response.json() as { dataset?: Record<string, unknown> };
    const allowed = new Set(Object.keys(body.dataset ?? {}));
    return Object.fromEntries(Object.entries(data).filter(([key]) => allowed.has(key)));
  }

  private async createFallbackDesign(kind: CanvaAssetKind, title: string): Promise<any> {
    const size = kind === 'video'
      ? { width: 1080, height: 1920 }
      : kind === 'carousel'
        ? { width: 1080, height: 1350 }
        : { width: 1080, height: 1080 };
    const response = await this.api('/designs', {
      method: 'POST',
      body: JSON.stringify({ type: 'type_and_asset', design_type: { type: 'custom', ...size }, title }),
    });
    if (!response.ok) throw new Error(`Canva design creation failed: ${response.status} ${await response.text()}`);
    const data = await response.json() as { design?: any };
    if (!data.design?.id) throw new Error('Canva did not return a design ID.');
    return data.design;
  }

  private async exportDesign(designId: string, format: 'png' | 'mp4'): Promise<string[]> {
    const exportFormat = format === 'mp4'
      ? { type: 'mp4', quality: env.CANVA_VIDEO_EXPORT_QUALITY }
      : { type: 'png' };
    const response = await this.api('/exports', {
      method: 'POST',
      body: JSON.stringify({ design_id: designId, format: exportFormat }),
    });
    if (!response.ok) throw new Error(`Canva export failed: ${response.status} ${await response.text()}`);
    const initial = await response.json() as { job?: CanvaJob };
    const job = await this.waitForJob(`/exports/${initial.job?.id}`, initial.job);
    const urls = (job as any)?.urls ?? (job as any)?.result?.urls ?? [];
    return Array.isArray(urls) ? urls.filter((x): x is string => typeof x === 'string') : [];
  }

  private async waitForJob(path: string, initial?: CanvaJob): Promise<CanvaJob> {
    if (!initial?.id) throw new Error('Canva asynchronous job did not return an ID.');
    let job = initial;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (job.status === 'success') return job;
      if (job.status === 'failed') throw new Error(`Canva job failed: ${JSON.stringify(job.error ?? {})}`);
      await delay(Math.min(250 + attempt * 150, 1500));
      const response = await this.api(path);
      if (!response.ok) throw new Error(`Canva job polling failed: ${response.status} ${await response.text()}`);
      const data = await response.json() as { job?: CanvaJob };
      job = data.job ?? job;
    }
    throw new Error('Canva job timed out.');
  }

  private api(path: string, init: RequestInit = {}) {
    if (!env.CANVA_ACCESS_TOKEN) throw new Error('CANVA_ACCESS_TOKEN is not configured.');
    return fetch(`https://api.canva.com/rest/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${env.CANVA_ACCESS_TOKEN}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    });
  }
}

function buildAutofillData(payload: Record<string, unknown>, fallbackTitle: string): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const title = stringValue(payload.hook) || fallbackTitle;
  const body = stringValue(payload.caption) || stringValue(payload.body) || stringValue(payload.description);
  const cta = stringValue(payload.cta);
  if (title) data[env.CANVA_AUTOFILL_TITLE_FIELD] = { type: 'text', text: title };
  if (body) data[env.CANVA_AUTOFILL_BODY_FIELD] = { type: 'text', text: body };
  if (cta) data[env.CANVA_AUTOFILL_CTA_FIELD] = { type: 'text', text: cta };

  const slides = Array.isArray(payload.carouselSlides) ? payload.carouselSlides as Array<Record<string, unknown>> : [];
  addText(data, 'SLIDE2_TITLE', slides[1]?.title);
  addText(data, 'SLIDE2_BODY', slides[1]?.body);
  addText(data, 'SLIDE2_POINT1', firstPoint(slides[1], 0));
  addText(data, 'SLIDE2_POINT2', firstPoint(slides[1], 1));
  addText(data, 'SLIDE3_TITLE', slides[2]?.title);
  addText(data, 'SLIDE3_STEP1', firstPoint(slides[2], 0));
  addText(data, 'SLIDE3_STEP2', firstPoint(slides[2], 1));
  addText(data, 'SLIDE3_STEP3', firstPoint(slides[2], 2));
  addText(data, 'SLIDE4_TITLE', slides[3]?.title);
  addText(data, 'SLIDE4_BODY', slides[3]?.body);
  addText(data, 'SLIDE5_BODY', slides[4]?.body);

  const scenes = Array.isArray(payload.videoScenes) ? payload.videoScenes as Array<Record<string, unknown>> : [];
  addText(data, 'SCENE2_TITLE', scenes[1]?.title);
  addText(data, 'SCENE2_BODY', scenes[1]?.body);
  addText(data, 'SCENE3_BODY', scenes[2]?.body);

  const mediaAssetId = stringValue(payload.canvaMediaAssetId);
  if (mediaAssetId) data[env.CANVA_AUTOFILL_MEDIA_FIELD] = { type: payload.mediaType === 'video' ? 'video' : 'image', asset_id: mediaAssetId };
  return data;
}

function explicitOrInferredKind(payload: Record<string, unknown>): CanvaAssetKind {
  const explicit = stringValue(payload.assetKind).toLowerCase();
  if (explicit === 'social' || explicit === 'carousel' || explicit === 'video') return explicit;
  const contentType = stringValue(payload.contentType).toLowerCase();
  const platforms = Array.isArray(payload.platforms) ? payload.platforms.map((x) => String(x).toLowerCase()) : [];
  if (contentType.includes('video') || contentType.includes('reel') || contentType.includes('short') || platforms.some((p) => ['tiktok', 'youtube'].includes(p))) return 'video';
  if (contentType.includes('carousel')) return 'carousel';
  return 'social';
}

function addText(data: Record<string, unknown>, key: string, value: unknown) {
  const text = stringValue(value);
  if (text) data[key] = { type: 'text', text };
}

function firstPoint(slide: Record<string, unknown> | undefined, index: number): unknown {
  const points = Array.isArray(slide?.points) ? slide!.points as unknown[] : [];
  return points[index];
}

function stringValue(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function delay(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }
