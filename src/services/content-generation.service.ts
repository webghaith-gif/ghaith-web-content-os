import { Store } from '../repositories/store';
import { OpenAIAdapter } from '../integrations/openai.adapter';
import { GoogleDriveAdapter } from '../integrations/google-drive.adapter';
import { ContentArchiveService } from './content-archive.service';
import { NotificationService } from './notification.service';
import { AssetService } from './asset.service';

export class ContentGenerationService {
  private readonly archive: ContentArchiveService;
  private readonly notifications: NotificationService;
  private readonly assets: AssetService;

  constructor(
    private readonly store: Store,
    private readonly ai = new OpenAIAdapter(),
  ) {
    this.archive = new ContentArchiveService(store, new GoogleDriveAdapter(store));
    this.notifications = new NotificationService(store);
    this.assets = new AssetService(store);
  }

  async createFromOpportunity(opportunityId: string, platforms: string[], oidcToken?: string) {
    const opportunity = await this.store.getOpportunity(opportunityId);
    const report = await this.store.getReport(opportunity.reportId);
    const generated = this.ai.enabledFor(oidcToken)
      ? await this.generateWithAi({
          opportunityTitle: opportunity.title,
          opportunityRationale: opportunity.rationale,
          reportTitle: report.title,
          reportBody: report.body,
          reportSource: report.source,
          platforms,
          oidcToken,
        })
      : fallbackPackage(opportunity.title);

    const created = await this.store.createContent({
      title: opportunity.title,
      topic: opportunity.title,
      sourceReportId: opportunity.reportId,
      opportunityId,
      targetAudience: 'Ghaith Web audience',
      objective: 'education/engagement/traffic/sales test',
      platforms: platforms.map((x) => x.toLowerCase()),
      contentType: 'multi-platform-package',
      package: generated,
      assets: [],
      googleDriveUrls: [],
      status: 'IN_REVIEW',
    });

    const archived = await this.archive.archive(created.id);

    let completed = archived.content;
    try {
      completed = await this.assets.requestAssets(created.id);
    } catch (error) {
      console.warn('Automatic media generation failed after content archive', error);
    }

    try {
      const latest = await this.store.getContent(created.id);
      const imageCount = latest.assets.filter((asset) => asset.kind === 'image').length;
      const carouselCount = latest.assets.filter((asset) => asset.kind === 'carousel').length;
      const videoCount = latest.assets.filter((asset) => asset.kind === 'video').length;
      await this.notifications.send({
        title: imageCount || carouselCount || videoCount
          ? 'المحتوى وملفاته حُفظت تلقائيًا ✅'
          : 'المحتوى حُفظ تلقائيًا في Google Drive ✅',
        body: `${latest.title} — صور ${imageCount}، كاروسيل ${carouselCount}، فيديو ${videoCount}.`,
        url: archived.folderUrl,
        tag: `content-review-${latest.id}`,
      });
      completed = latest;
    } catch (error) {
      console.warn('Immediate content push notification failed', error);
    }

    return completed;
  }

  private async generateWithAi(input: {
    opportunityTitle: string;
    opportunityRationale: string;
    reportTitle: string;
    reportBody: string;
    reportSource?: string;
    platforms: string[];
    oidcToken?: string;
  }) {
    const text = await this.ai.generateText(
      [
        'You are the senior editorial and content-quality engine for Ghaith Web.',
        'Create an original, polished Arabic content package grounded strictly in the supplied source report and opportunity.',
        'Do not invent facts, statistics, certifications, prices, legal claims, product availability, testimonials, or links not supported by the source.',
        'Prefer useful practical value over hype. Avoid repetition and generic AI wording.',
        'Return JSON only. No markdown fences.',
        'Top-level keys: hook, caption, cta, description, script, keywords, imagePrompt, videoPrompt, carouselSlides, videoScenes, platformCopies, qualityReview.',
        'carouselSlides: exactly 5 objects. Each has title, body, points. Make the flow coherent: hook/problem -> insight -> practical steps -> value -> CTA.',
        'videoScenes: exactly 3 objects with title and body, optimized for a short vertical video without music.',
        'platformCopies: ALWAYS include facebook, instagram, threads, x, pinterest, tiktok, youtube.',
        'Each platform copy must be genuinely adapted, not duplicated. Keys allowed per platform: title, hook, caption, description, cta, hashtags.',
        'Facebook: useful conversational post with context and clear CTA.',
        'Instagram: concise visual-first caption with a strong opening and a small set of relevant hashtags.',
        'Threads: natural conversational text, short and discussion-oriented; avoid looking like an ad unless the source goal is sales.',
        'X: very concise, high-information copy suitable for the character limit; no hashtag stuffing.',
        'Pinterest: searchable title and description, title <= 100 characters and description <= 800 characters.',
        'TikTok: short spoken/social caption and hook that matches the video script.',
        'YouTube: clear title plus searchable description matching a Short/video.',
        'qualityReview: object with score from 0-100, strengths array, issuesFixed array, sourceFaithful boolean, platformAdapted boolean, nonRepetitive boolean.',
        'Before returning, silently self-review language, spelling, source fidelity, platform fit, CTA consistency, and repetition. Fix issues first, then report the qualityReview.',
        'Use Modern Standard Arabic that is clear to audiences in Tunisia and the Arab world unless the source itself requires a localized wording.',
      ].join(' '),
      [
        `SOURCE REPORT TITLE: ${input.reportTitle}`,
        `SOURCE REPORT: ${input.reportBody}`,
        `SOURCE NOTE: ${input.reportSource ?? 'not provided'}`,
        `SELECTED OPPORTUNITY: ${input.opportunityTitle}`,
        `OPPORTUNITY RATIONALE: ${input.opportunityRationale}`,
        `CURRENT TARGET PLATFORMS: ${input.platforms.join(', ')}`,
      ].join('\n\n'),
      input.oidcToken,
    );
    try {
      const parsed = JSON.parse(text);
      return normalizePackage(parsed, input.opportunityTitle);
    } catch {
      return fallbackPackage(input.opportunityTitle);
    }
  }
}

function normalizePackage(value: any, title: string) {
  const fallback = fallbackPackage(title);
  const slides = Array.isArray(value?.carouselSlides) ? value.carouselSlides.slice(0, 5) : [...fallback.carouselSlides];
  while (slides.length < 5) slides.push(fallback.carouselSlides[slides.length]!);
  const scenes = Array.isArray(value?.videoScenes) ? value.videoScenes.slice(0, 3) : [...fallback.videoScenes];
  while (scenes.length < 3) scenes.push(fallback.videoScenes[scenes.length]!);
  const platformCopies = normalizePlatformCopies(value?.platformCopies, fallback.platformCopies);
  const quality = value?.qualityReview && typeof value.qualityReview === 'object' ? value.qualityReview : {};

  return {
    hook: typeof value?.hook === 'string' ? value.hook : fallback.hook,
    caption: typeof value?.caption === 'string' ? value.caption : fallback.caption,
    cta: typeof value?.cta === 'string' ? value.cta : fallback.cta,
    description: typeof value?.description === 'string' ? value.description : fallback.description,
    script: typeof value?.script === 'string' ? value.script : fallback.script,
    keywords: Array.isArray(value?.keywords) ? value.keywords.map(String).slice(0, 20) : fallback.keywords,
    imagePrompt: typeof value?.imagePrompt === 'string' ? value.imagePrompt : fallback.imagePrompt,
    videoPrompt: typeof value?.videoPrompt === 'string' ? value.videoPrompt : fallback.videoPrompt,
    carouselSlides: slides.map(normalizeSlide),
    videoScenes: scenes.map(normalizeScene),
    platformCopies,
    qualityReview: {
      score: clampScore(quality.score),
      strengths: stringArray(quality.strengths),
      issuesFixed: stringArray(quality.issuesFixed),
      sourceFaithful: quality.sourceFaithful !== false,
      platformAdapted: quality.platformAdapted !== false,
      nonRepetitive: quality.nonRepetitive !== false,
    },
  };
}

function normalizePlatformCopies(value: any, fallback: Record<string, any>) {
  const required = ['facebook', 'instagram', 'threads', 'x', 'pinterest', 'tiktok', 'youtube'];
  return Object.fromEntries(required.map((platform) => {
    const raw = value?.[platform] && typeof value[platform] === 'object' ? value[platform] : {};
    const base = fallback[platform] ?? {};
    const variant = {
      title: str(raw.title) || base.title,
      hook: str(raw.hook) || base.hook,
      caption: str(raw.caption) || base.caption,
      description: str(raw.description) || base.description,
      cta: str(raw.cta) || base.cta,
      hashtags: stringArray(raw.hashtags).slice(0, platform === 'instagram' ? 8 : 5),
    };
    if (platform === 'pinterest') {
      variant.title = (variant.title || titleFromVariant(variant)).slice(0, 100);
      variant.description = (variant.description || variant.caption || '').slice(0, 800);
    }
    if (platform === 'x') {
      variant.caption = (variant.caption || variant.hook || '').slice(0, 260);
    }
    return [platform, variant];
  }));
}

function normalizeSlide(value: any) {
  return {
    title: str(value?.title),
    body: str(value?.body),
    points: stringArray(value?.points).slice(0, 5),
  };
}

function normalizeScene(value: any) {
  return { title: str(value?.title), body: str(value?.body) };
}

function fallbackPackage(title: string) {
  const generic = {
    title,
    hook: title,
    caption: `محتوى جاهز للمراجعة حول: ${title}`,
    description: title,
    cta: 'احفظ المحتوى وشاركنا رأيك.',
    hashtags: ['غيث_ويب'],
  };
  return {
    hook: title,
    caption: generic.caption,
    cta: generic.cta,
    description: title,
    script: `Hook: ${title}\nProblem → practical value → CTA.`,
    keywords: [title, 'Ghaith Web'],
    imagePrompt: `Professional branded social media visual for Ghaith Web about: ${title}`,
    videoPrompt: `Short vertical educational video for Ghaith Web about: ${title}; no music.`,
    carouselSlides: [
      { title, body: `لماذا يهمك هذا الموضوع؟ ${title}`, points: [] as string[] },
      { title: 'المشكلة', body: `المشكلة الأساسية المرتبطة بـ ${title}`, points: ['النقطة الأولى', 'النقطة الثانية'] },
      { title: '3 خطوات عملية', body: '', points: ['الخطوة الأولى', 'الخطوة الثانية', 'الخطوة الثالثة'] },
      { title: 'ماذا ستكسب؟', body: `الفائدة العملية المتوقعة من تطبيق ${title}`, points: [] as string[] },
      { title: 'الخطوة التالية', body: 'طبّق الفكرة واحفظ المحتوى للرجوع إليه.', points: [] as string[] },
    ],
    videoScenes: [
      { title, body: `افتتاحية قصيرة حول ${title}` },
      { title: 'الفكرة الأساسية', body: `القيمة العملية التي يحتاجها الجمهور حول ${title}` },
      { title: 'الخطوة التالية', body: 'طبّق الفكرة الآن واحفظ المحتوى.' },
    ],
    platformCopies: {
      facebook: { ...generic }, instagram: { ...generic }, threads: { ...generic }, x: { ...generic },
      pinterest: { ...generic }, tiktok: { ...generic }, youtube: { ...generic },
    },
    qualityReview: {
      score: 50,
      strengths: ['Fallback package available'],
      issuesFixed: [],
      sourceFaithful: true,
      platformAdapted: false,
      nonRepetitive: false,
    },
  };
}

function str(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.map(String).map((x) => x.trim()).filter(Boolean) : []; }
function clampScore(value: unknown): number {
  const score = Number(value);
  return Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0;
}
function titleFromVariant(value: { title?: string; hook?: string; caption?: string }) { return value.title || value.hook || value.caption || ''; }
