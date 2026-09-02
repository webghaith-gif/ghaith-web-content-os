import { Alert, Button, FileInput, FormField, MultilineInput, Rows, Select, Text, TextInput, Title } from "@canva/app-ui-kit";
import { useMemo, useState } from "react";
import { buildLearningDocument, DESIGN_STYLES, DOCUMENT_TYPES, SUBJECTS, validateDocument } from "./engine";
import { readSourceFile } from "./file-reader";
import { renderLearningDocument } from "./render";
import type { DarsKitFormState, DesignStyle, Differentiation, DocumentType, Subject } from "./types";
import * as styles from "./styles.css";

const initial: DarsKitFormState={subject:"العربية",level:4,documentType:"worksheet",durationPreset:"45 دقيقة",customDuration:"",designStyle:"classic",topic:"",differentiation:"balanced",institution:"",teacherName:"",lessonDate:"",competency:"",objective:"",sourceText:""};
const opt=(map:Record<string,string>)=>Object.entries(map).map(([value,label])=>({value,label}));

export function App(){
  const [s,setS]=useState(initial); const [status,setStatus]=useState<{tone:"positive"|"critical"|"info";text:string}|null>(null); const [busy,setBusy]=useState(false); const [fileName,setFileName]=useState("");
  const doc=useMemo(()=>buildLearningDocument(s),[s]); const problems=useMemo(()=>validateDocument(doc),[doc]);
  const patch=<K extends keyof DarsKitFormState>(key:K,value:DarsKitFormState[K])=>setS(prev=>({...prev,[key]:value}));
  async function importFile(file:File){setStatus({tone:"info",text:`جارٍ قراءة الملف: ${file.name}`});try{patch("sourceText",await readSourceFile(file));setFileName(file.name);setStatus({tone:"positive",text:`تم استخراج نص السند من: ${file.name}`});}catch(e){setStatus({tone:"critical",text:e instanceof Error?e.message:"تعذرت قراءة الملف."});}}
  async function create(){if(problems.length){setStatus({tone:"critical",text:problems.join("، ")});return;}setBusy(true);setStatus({tone:"info",text:"جارٍ إنشاء الوثيقة في Canva…"});try{await renderLearningDocument(doc);setStatus({tone:"positive",text:"تمت إضافة الوثيقة التعليمية إلى التصميم."});}catch(e){console.error(e);setStatus({tone:"critical",text:"تعذرت إضافة الوثيقة. تأكدي من فتح تصميم يدعم إضافة الصفحات ثم حاولي مجددًا."});}finally{setBusy(false);}}
  return <div className={styles.scrollContainer} dir="rtl"><Rows spacing="2u">
    <Text>أنشئي وثيقة تعليمية عربية منظمة انطلاقًا من موضوع أو سند، ثم أضيفيها مباشرة إلى تصميم Canva.</Text>
    <FormField label="المادة" value={s.subject} control={p=><Select<Subject> {...p} stretch value={s.subject} options={SUBJECTS.map(value=>({value,label:value}))} onChange={v=>patch("subject",v)}/>}/>
    <FormField label="المستوى" value={String(s.level)} control={p=><Select<string> {...p} stretch value={String(s.level)} options={[1,2,3,4,5,6].map(v=>({value:String(v),label:`السنة ${v}`}))} onChange={v=>patch("level",Number(v))}/>}/>
    <FormField label="نوع الوثيقة" value={s.documentType} control={p=><Select<DocumentType> {...p} stretch value={s.documentType} options={opt(DOCUMENT_TYPES) as any} onChange={v=>patch("documentType",v)}/>}/>
    <FormField label="المدة" value={s.durationPreset} control={p=><Select<string> {...p} stretch value={s.durationPreset} options={["30 دقيقة","45 دقيقة","60 دقيقة","90 دقيقة","custom"].map(value=>({value,label:value==="custom"?"مدة مخصصة":value}))} onChange={v=>patch("durationPreset",v)}/>}/>
    {s.durationPreset==="custom"&&<FormField label="المدة المخصصة" value={s.customDuration} control={p=><TextInput {...p} value={s.customDuration} placeholder="مثال: ساعتان أو 75 دقيقة" onChange={v=>patch("customDuration",v)}/>}/>} 
    <FormField label="النمط البصري" value={s.designStyle} control={p=><Select<DesignStyle> {...p} stretch value={s.designStyle} options={opt(DESIGN_STYLES) as any} onChange={v=>patch("designStyle",v)}/>}/>
    <FormField label="موضوع الدرس" value={s.topic} control={p=><TextInput {...p} value={s.topic} placeholder="مثال: نشأة صداقة" onChange={v=>patch("topic",v)}/>}/>
    <FormField label="التفريد" value={s.differentiation} control={p=><Select<Differentiation> {...p} stretch value={s.differentiation} options={[{value:"balanced",label:"متوازن"},{value:"support",label:"دعم"},{value:"enrichment",label:"إثراء"}]} onChange={v=>patch("differentiation",v)}/>}/>
    <Title size="small">بيانات اختيارية</Title>
    <FormField label="المؤسسة" value={s.institution} control={p=><TextInput {...p} value={s.institution} placeholder="اسم المدرسة أو المؤسسة" onChange={v=>patch("institution",v)}/>}/>
    <FormField label="المعلم(ة)" value={s.teacherName} control={p=><TextInput {...p} value={s.teacherName} placeholder="الاسم واللقب" onChange={v=>patch("teacherName",v)}/>}/>
    <FormField label="التاريخ" value={s.lessonDate} control={p=><TextInput {...p} value={s.lessonDate} placeholder="YYYY-MM-DD" onChange={v=>patch("lessonDate",v)}/>}/>
    <FormField label="الكفاءة" value={s.competency} control={p=><TextInput {...p} value={s.competency} placeholder="اتركيها فارغة ليقترحها التطبيق" onChange={v=>patch("competency",v)}/>}/>
    <FormField label="الهدف التعلمي" value={s.objective} control={p=><MultilineInput {...p} value={s.objective} placeholder="اتركيه فارغًا ليُنشأ تلقائيًا" onChange={v=>patch("objective",v)}/>}/>
    <FormField label="السند أو المحتوى" value={s.sourceText} control={p=><MultilineInput {...p} value={s.sourceText} minRows={7} placeholder="الصقي السند هنا أو حمّلي ملفًا أدناه" onChange={v=>patch("sourceText",v)}/>}/>
    <Rows spacing="1u"><Title size="small">تحميل سند من ملف</Title><FileInput multiple={false} accept={[".txt",".md",".pdf",".docx",".csv",".json",".html",".htm",".xml","text/*","application/pdf","application/vnd.openxmlformats-officedocument.wordprocessingml.document"]} onDropAcceptedFiles={files=>{const f=files[0];if(f)void importFile(f);}} onDropRejectedFiles={()=>setStatus({tone:"critical",text:"نوع الملف غير مدعوم. استخدمي أحد الأنواع المسموح بها."})}/>{fileName&&<Text size="small">الملف: {fileName}</Text>}</Rows>
    <Title size="small">معاينة المحتوى</Title><Text>{doc.content.title}</Text><Text size="small">{doc.content.text.slice(0,260)}{doc.content.text.length>260?"…":""}</Text><Text size="small">• {doc.meta.documentTypeLabel} — {doc.meta.duration}</Text><Text size="small">• {doc.questions.length} أسئلة مرتبطة بالسند</Text>
    <Button variant="primary" stretch loading={busy} disabled={busy} onClick={create}>إنشاء الوثيقة في Canva</Button>
    {status&&<Alert tone={status.tone}>{status.text}</Alert>}
  </Rows></div>;
}
