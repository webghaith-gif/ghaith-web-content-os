export type Subject = "العربية" | "الرياضيات" | "الإيقاظ العلمي" | "التربية الإسلامية" | "التربية التشكيلية" | "التربية الموسيقية";
export type DocumentType = "worksheet" | "lesson_plan" | "assessment" | "source_pack";
export type DesignStyle = "classic" | "light" | "school" | "ink";
export type Differentiation = "balanced" | "support" | "enrichment";

export interface DarsKitFormState {
  subject: Subject;
  level: number;
  documentType: DocumentType;
  durationPreset: string;
  customDuration: string;
  designStyle: DesignStyle;
  topic: string;
  differentiation: Differentiation;
  institution: string;
  teacherName: string;
  lessonDate: string;
  competency: string;
  objective: string;
  sourceText: string;
}

export interface LearningQuestion { prompt: string; answer: string; lines: number; }
export interface LearningSection { title: string; instruction: string; lines: number; }
export interface LearningDocument {
  meta: {
    title: string; subject: Subject; level: string; duration: string;
    objective: string; competency: string; documentType: DocumentType;
    documentTypeLabel: string; designStyle: DesignStyle;
    institution: string; teacherName: string; lessonDate: string;
  };
  content: { title: string; text: string; attribution: string };
  questions: LearningQuestion[];
  sections: LearningSection[];
  differentiation: string;
  footer: string;
}
