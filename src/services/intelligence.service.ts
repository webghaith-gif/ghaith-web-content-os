import type { OpportunityScore } from '../core/types';
import { Store } from '../repositories/store';
import { OpenAIAdapter } from '../integrations/openai.adapter';

export class IntelligenceService {
  constructor(private readonly store: Store, private readonly ai = new OpenAIAdapter()) {}

  async extractOpportunities(reportId: string, oidcToken?: string) {
    const report = await this.store.getReport(reportId);
    const candidates = this.ai.enabledFor(oidcToken)
      ? await this.extractWithAi(report.body, oidcToken)
      : heuristicCandidates(report.body);

    const saved = [];
    for (const candidate of candidates.slice(0, 10)) {
      saved.push(await this.store.saveOpportunity({
        reportId,
        title: candidate.title,
        rationale: candidate.rationale,
        score: scoreOpportunity(candidate.title + ' ' + candidate.rationale),
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

function scoreOpportunity(text: string): OpportunityScore {
  const lengthSignal = Math.min(10, Math.max(4, Math.round(text.length / 40)));
  const commercial = /بيع|شراء|سعر|منتج|خدمة|profit|sell|buy|product/i.test(text) ? 9 : 6;
  const ai = /ai|ذكاء|chatgpt|automation|أتمتة/i.test(text) ? 9 : 7;
  const values = {
    problemStrength: lengthSignal,
    frequency: 7,
    interest: ai,
    purchaseIntent: commercial,
    contentPotential: 9,
    productPotential: commercial,
    brandFit: 9,
    easeOfExecution: 8,
    freshness: 7,
  };
  return { ...values, total: Math.round(Object.values(values).reduce((a, b) => a + b, 0) / Object.values(values).length * 10) / 10 };
}
