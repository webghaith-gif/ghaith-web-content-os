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
      'Create a concise multi-platform content package. Return JSON only with keys hook, caption, cta, description, script, keywords, imagePrompt, videoPrompt.',
      `Opportunity: ${title}\nRationale: ${rationale}\nPlatforms: ${platforms.join(', ')}`,
    );
    try { return JSON.parse(text); } catch { return fallbackPackage(title); }
  }
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
  };
}
