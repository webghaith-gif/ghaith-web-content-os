import type { DarsKitFormState, LearningDocument, LearningQuestion, Subject } from "./types";

export const SUBJECTS: Subject[] = ["العربية", "الرياضيات", "الإيقاظ العلمي", "التربية الإسلامية", "التربية التشكيلية", "التربية الموسيقية"];
export const DOCUMENT_TYPES = {
  worksheet: "ورقة عمل",
  lesson_plan: "مذكرة درس",
  assessment: "تقويم",
  source_pack: "سند وأنشطة",
} as const;
export const DESIGN_STYLES = { classic: "كلاسيكي", light: "هادئ", school: "مدرسي", ink: "حبر للطباعة" } as const;

const defaults: Record<Subject, {source: string; competency: string; objective: string}> = {
  "العربية": { source: "أقرأ السند قراءة متأنية، أحدد فكرته العامة، ثم أستخرج المعطيات الدالة على فهمي للنص.", competency: "يفهم سندًا مناسبًا لمستواه ويوظف معطياته في إنتاج إجابات سليمة.", objective: "أن يفهم المتعلم السند ويستخرج معطياته ويوظفها في إجابات واضحة." },
  "الرياضيات": { source: "أحل الوضعية خطوةً خطوة، أختار العملية المناسبة، أتحقق من النتيجة، ثم أفسر طريقة الحل.", competency: "يحل وضعيات رياضية موظفًا استراتيجيات مناسبة ويتحقق من النتائج.", objective: "أن يحل المتعلم وضعية مرتبطة بالدرس ويبرر خطواته." },
  "الإيقاظ العلمي": { source: "ألاحظ الظاهرة، أقارن المعطيات، أصوغ فرضية، ثم أستنتج قاعدة أو تفسيرًا مبسطًا.", competency: "يمارس ملاحظة علمية منظمة ويبني استنتاجًا اعتمادًا على قرائن.", objective: "أن يلاحظ المتعلم الظاهرة ويقارن المعطيات ويستنتج العلاقة المطلوبة." },
  "التربية الإسلامية": { source: "أقرأ الموقف، أحدد السلوك المناسب، أربطه بالقيمة المستهدفة، ثم أذكر أثره في حياة الفرد والجماعة.", competency: "يميز السلوك القيمي ويوظفه في مواقف حياتية.", objective: "أن يميز المتعلم السلوك السليم ويعلل اختياره بقيمة مناسبة." },
  "التربية التشكيلية": { source: "ألاحظ الألوان والخطوط والأشكال، أختار تنظيمًا بصريًا متوازنًا، ثم أنجز عملاً يعبر عن الفكرة.", competency: "يوظف عناصر التشكيل في إنجاز متوازن ودال.", objective: "أن يوظف المتعلم اللون والخط والشكل في إنتاج تشكيلي منظم." },
  "التربية الموسيقية": { source: "أستمع إلى النموذج، أميز الإيقاع واللحن، أقلد المقطع تدريجيًا، ثم أؤديه بوضوح وانسجام.", competency: "يميز عناصر موسيقية بسيطة ويؤديها بإيقاع منظم.", objective: "أن يميز المتعلم النمط الإيقاعي ويؤديه أداءً منظمًا." },
};

function clean(text: string) { return text.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim(); }
function excerpt(text: string, max = 120) { const s=clean(text); return s.length <= max ? s : `${s.slice(0,max).replace(/\s+\S*$/, "")}…`; }
function duration(state: DarsKitFormState) { return state.durationPreset === "custom" ? (state.customDuration.trim() || "45 دقيقة") : state.durationPreset; }

function questions(source: string, diff: DarsKitFormState["differentiation"]): LearningQuestion[] {
  const lead = excerpt(source, 100);
  const base: LearningQuestion[] = [
    { prompt: "ما الفكرة الأساسية التي يعالجها السند؟", answer: `إجابة نموذجية: يدور السند حول «${lead}».`, lines: 2 },
    { prompt: "استخرج معطيين مهمين من السند.", answer: "إجابة نموذجية: يُقبل كل معطيين صحيحين ومباشرين من السند.", lines: 2 },
    { prompt: "رتب أهم الأفكار أو الخطوات ترتيبًا منطقيًا.", answer: "إجابة نموذجية: ترتيب يحافظ على تسلسل المعنى أو خطوات الحل.", lines: 2 },
    { prompt: "فسر كلمة أو فكرة أساسية اعتمادًا على السياق.", answer: "إجابة نموذجية: تفسير ملائم للسياق ومسنود بقرينة.", lines: 2 },
    { prompt: "ما الدليل في السند الذي يدعم إجابتك؟", answer: "إجابة نموذجية: ذكر قرينة صريحة أو معنى مستنتج بوضوح.", lines: 2 },
    { prompt: diff === "enrichment" ? "لخص السند ثم اقترح تطبيقًا جديدًا لفكرته." : "لخص السند في جملتين مترابطتين.", answer: "إجابة نموذجية: تلخيص يحافظ على الفكرة العامة وأهم المعطيات دون تكرار.", lines: diff === "support" ? 2 : 3 },
  ];
  return base;
}

export function buildLearningDocument(state: DarsKitFormState): LearningDocument {
  const d = defaults[state.subject];
  const topic = clean(state.topic) || "موضوع الدرس";
  const source = clean(state.sourceText) || d.source;
  const objective = clean(state.objective) || d.objective.replace("الدرس", topic);
  const competency = clean(state.competency) || d.competency;
  const support = state.differentiation === "support";
  return {
    meta: {
      title: `${DOCUMENT_TYPES[state.documentType]}: ${topic}`,
      subject: state.subject,
      level: `السنة ${state.level}`,
      duration: duration(state),
      objective: objective.startsWith("أن ") ? objective : `أن ${objective}`,
      competency,
      documentType: state.documentType,
      documentTypeLabel: DOCUMENT_TYPES[state.documentType],
      designStyle: state.designStyle,
      institution: clean(state.institution), teacherName: clean(state.teacherName), lessonDate: state.lessonDate,
    },
    content: { title: topic, text: source, attribution: "" },
    questions: questions(source, state.differentiation),
    sections: [
      { title: "أتهيأ", instruction: `أستحضر مكتسباتي السابقة المرتبطة بـ«${topic}» وأحدد ما أعرفه عنه.`, lines: 2 },
      { title: "أفهم وأكتشف", instruction: `أقرأ/ألاحظ السند، أحدد المعطيات الأساسية، وأربطها بهدف الدرس: ${objective}`, lines: support ? 2 : 3 },
      { title: "أتدرّب", instruction: support ? "أنجز مهمة قصيرة موجهة خطوةً خطوة مع مثال مساند." : "أنجز نشاطًا تطبيقيًا يوظف المعطيات في وضعية مشابهة.", lines: support ? 3 : 4 },
      { title: "أوظّف", instruction: state.differentiation === "enrichment" ? "أحل وضعية جديدة مركبة، أبرر اختياراتي، وأقترح طريقة أخرى." : "أوظف التعلم في وضعية جديدة وأفسر اختياري أو خطواتي.", lines: 4 },
      { title: "أقيّم نفسي", instruction: "أضع علامة: أتقنت ✓ — أحتاج إلى تدريب إضافي ○", lines: 1 },
    ],
    differentiation: support ? "دعم: تعليمات قصيرة، مثال محلول، وتقليل عدد المعطيات." : state.differentiation === "enrichment" ? "إثراء: وضعية مركبة تتطلب التعليل أو إنتاج حل بديل." : "مسار متوازن مع انتقال تدريجي من الفهم إلى التوظيف.",
    footer: "غيث ويب — Ghaith Web",
  };
}

export function validateDocument(doc: LearningDocument): string[] {
  const problems: string[] = [];
  if (doc.meta.title.length < 8) problems.push("العنوان غير كافٍ");
  if (!doc.meta.objective.startsWith("أن ")) problems.push("الهدف يجب أن يبدأ بـ«أن»");
  if (doc.sections.length < 5) problems.push("التسلسل البيداغوجي ناقص");
  if (doc.questions.length < 6) problems.push("أسئلة الفهم غير مكتملة");
  if (doc.content.text.length < 40) problems.push("السند التعليمي غير كافٍ");
  return problems;
}
