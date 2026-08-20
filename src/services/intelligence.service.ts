import type { OpportunityScore } from '../core/types';
import { Store } from '../repositories/store';
import { OpenAIAdapter } from '../integrations/openai.adapter';
import { SemrushAdapter, type SemrushKeywordMetrics } from '../integrations/semrush.adapter';
import { env } from '../config/env';

export class IntelligenceService {
  constructor(
    private readonly store: Store,
    private readonly ai = new OpenAIAdapter(),
    private readonly semrush = new SemrushAdapter(),
  ) {}

  async extractOpportunities(reportId: string, oidcToken?: string) {
    const report = await this.store.getReport(reportId);
    const candidates = this.ai.enabledFor(oidcToken)
      ? await this.extractWithAi(report.body, oidcToken)
      : heuristicCandidates(report.body);

    const ranked = candidates.slice(0, 10)
      .map((candidate) => ({ candidate, preliminary: scoreOpportunity(`${candidate.title} ${candidate.rationale}`) }))
      .sort((a, b) => b.preliminary.total - a.preliminary.total);
    const metrics = new Map<string, SemrushKeywordMetrics>();
    if (this.semrush.enabled && env.SEMRUSH_ENRICHMENT_LIMIT > 0) {
      for (const item of ranked.slice(0, env.SEMRUSH_ENRICHMENT_LIMIT)) {
        const result = await this.semrush.enrichKeyword(item.candidate.title).catch(() => undefined);
        if (result) metrics.set(item.candidate.title, result);
      }
    }

    const saved = [];
    for (const { candidate } of ranked) {
      const semrush = metrics.get(candidate.title);
      saved.push(await this.store.saveOpportunity({
        reportId,
        title: candidate.title,
        rationale: candidate.rationale,
        score: scoreOpportunity(`${candidate.title} ${candidate.rationale}`, semrush),
        ...(semrush ? { semrush } : {}),
      }));
    }
    return saved;
  }

  private async extractWithAi(body: string, oidcToken?: string): Promise<Array<{ title: string; rationale: string }>> {
    const text = await this.ai.generateText(
      'Extract up to 10 actionable content/product opportunities for Ghaith Web. Return JSON only: [{"title":"...","rationale":"..."}]. Focus on digital products, AI, education, entrepreneurship and practical user problems.',
      body,
      oidcToken,
    );
    try {
      const parsed = JSON.parse(text) as Array<{ title: string; rationale: string }>;
      return Array.isArray(parsed) ? parsed : heuristicCandidates(body);
    } catch {
      return heuristicCandidates(body);
    }
  }
}

function heuristicCandidates(body: string): Array<{ title: string; rationale: string }> {
  return body.split(/\n+/).map((x) => x.replace(/^[-*#\d.)\s]+/, '').trim()).filter((x) => x.length > 20).slice(0, 10).map((x) => ({ title: x.slice(0, 100), rationale: x }));
}

function scoreOpportunity(text: string, semrush?: SemrushKeywordMetrics): OpportunityScore {
  const lengthSignal = Math.min(10, Math.max(4, Math.round(text.length / 40)));
  const commercial = /بيع|شراء|سعر|منتج|خدمة|profit|sell|buy|product/i.test(text) ? 9 : 6;
  const ai = /ai|ذكاء|chatgpt|automation|أتمتة/i.test(text) ? 9 : 7;
  const volumeSignal = searchVolumeScore(semrush?.searchVolume);
  const intentSignal = semrush?.intents?.some((intent) => ['COMMERCIAL', 'TRANSACTIONAL'].includes(intent.toUpperCase())) ? 9 : commercial;
  const values = {
    problemStrength: lengthSignal,
    frequency: volumeSignal ?? 7,
    interest: volumeSignal ?? ai,
    purchaseIntent: intentSignal,
    contentPotential: 9,
    productPotential: commercial,
    brandFit: 9,
    easeOfExecution: 8,
    freshness: 7,
  };
  return { ...values, total: Math.round(Object.values(values).reduce((a, b) => a + b, 0) / Object.values(values).length * 10) / 10 };
}

function searchVolumeScore(volume?: number): number | undefined {
  if (volume === undefined) return undefined;
  if (volume <= 0) return 4;
  return Math.max(4, Math.min(10, Math.round(4 + Math.log10(volume + 1) * 1.35)));
}
