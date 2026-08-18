import { Store } from '../repositories/store';
import { OpenAIAdapter } from '../integrations/openai.adapter';

export class ContentGenerationService {
  constructor(
    private readonly store: Store,
    private readonly ai = new OpenAIAdapter(),
  ) {}

  async createFromOpportunity(opportunityId: string, platforms: string[]) {
    const opportunity = await this.store.getOpportunity(opportunityId);
    const generated = this.ai.enabled
      ? await this.generateWithAi(opportunity.title, opportunity.rationale, platforms)
      : fallbackPackage(opportunity.title);

    return this.store.createContent({
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
  }

  private async generateWithAi(title: string, rationale: string, platforms: string[]) {
    const text = await this.ai.generateText(
      [
        'Create a concise multi-platform content package for Ghaith Web.',
        'Return JSON only with keys: hook, caption, cta, description, script, keywords, imagePrompt, videoPrompt, carouselSlides, videoScenes.',
        'carouselSlides must contain exactly 5 objects with keys title, body, points (points is an array).',
        'videoScenes must contain exactly 3 objects with keys title and body.',
        'Keep Arabic copy clear and platform-ready. Do not include markdown fences.',
      ].join(' '),
      `Opportunity: ${title}\nRationale: ${rationale}\nPlatforms: ${platforms.join(', ')}`,
    );
    try {
      const parsed = JSON.parse(text);
      return normalizePackage(parsed, title);
    } catch {
      return fallbackPackage(title);
    }
  }
}

function normalizePackage(value: any, title: string) {
  const fallback = fallbackPackage(title);
  const slides = Array.isArray(value?.carouselSlides) ? value.carouselSlides.slice(0, 5) : fallback.carouselSlides;
  while (slides.length < 5) slides.push(fallback.carouselSlides[slides.length]!);
  const scenes = Array.isArray(value?.videoScenes) ? value.videoScenes.slice(0, 3) : fallback.videoScenes;
  while (scenes.length < 3) scenes.push(fallback.videoScenes[scenes.length]!);
  return {
    hook: typeof value?.hook === 'string' ? value.hook : fallback.hook,
    caption: typeof value?.caption === 'string' ? value.caption : fallback.caption,
    cta: typeof value?.cta === 'string' ? value.cta : fallback.cta,
    description: typeof value?.description === 'string' ? value.description : fallback.description,
    script: typeof value?.script === 'string' ? value.script : fallback.script,
    keywords: Array.isArray(value?.keywords) ? value.keywords.map(String) : fallback.keywords,
    imagePrompt: typeof value?.imagePrompt === 'string' ? value.imagePrompt : fallback.imagePrompt,
    videoPrompt: typeof value?.videoPrompt === 'string' ? value.videoPrompt : fallback.videoPrompt,
    carouselSlides: slides,
    videoScenes: scenes,
  };
}

function fallbackPackage(title: string) {
  return {
    hook: title,
    caption: `محتوى جاهز للمراجعة حول: ${title}`,
    cta: 'احفظ المنشور وشاركنا رأيك.',
    description: title,
    script: `Hook: ${title}\nProblem → practical value → CTA.`,
    keywords: [title, 'Ghaith Web'],
    imagePrompt: `Professional branded social media visual for Ghaith Web about: ${title}`,
    videoPrompt: `Short vertical educational video for Ghaith Web about: ${title}`,
    carouselSlides: [
      { title, body: `لماذا يهمك هذا الموضوع؟ ${title}`, points: [] },
      { title: 'المشكلة', body: `المشكلة الأساسية المرتبطة بـ ${title}`, points: ['النقطة الأولى', 'النقطة الثانية'] },
      { title: '3 خطوات عملية', body: '', points: ['الخطوة الأولى', 'الخطوة الثانية', 'الخطوة الثالثة'] },
      { title: 'ماذا ستكسب؟', body: `الفائدة العملية المتوقعة من تطبيق ${title}`, points: [] },
      { title: 'الخطوة التالية', body: 'طبّق الفكرة واحفظ المحتوى للرجوع إليه.', points: [] },
    ],
    videoScenes: [
      { title, body: `افتتاحية قصيرة حول ${title}` },
      { title: 'الفكرة الأساسية', body: `القيمة العملية التي يحتاجها الجمهور حول ${title}` },
      { title: 'الخطوة التالية', body: 'طبّق الفكرة الآن واحفظ المحتوى.' },
    ],
  };
}
