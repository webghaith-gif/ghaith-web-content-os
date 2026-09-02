import { addPage } from "@canva/design";
import type { LearningDocument } from "./types";

const THEMES = {
  classic:{primary:"#14213D",accent:"#C9A227",background:"#FFF9EE",paper:"#FFFFFF",soft:"#FFF4CF",ink:"#263238",muted:"#6B7280",line:"#D8CDBA",white:"#FFFFFF"},
  light:{primary:"#456A8D",accent:"#D39A6A",background:"#FAF7F1",paper:"#FFFFFF",soft:"#EAF2F7",ink:"#263746",muted:"#6A7782",line:"#D9E2E8",white:"#FFFFFF"},
  school:{primary:"#155E5B",accent:"#D69A50",background:"#F7F2E8",paper:"#FFFDFC",soft:"#E3F0EC",ink:"#253634",muted:"#64736F",line:"#C9D8D2",white:"#FFFFFF"},
  ink:{primary:"#111111",accent:"#555555",background:"#FFFFFF",paper:"#FFFFFF",soft:"#F2F2F2",ink:"#111111",muted:"#555555",line:"#B8B8B8",white:"#FFFFFF"},
} as const;

type Theme = (typeof THEMES)[keyof typeof THEMES];
function arabicDigits(v: string | number) { return String(v).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]!); }
function text(value:string, top:number, opts:Record<string,unknown>={}) { return {type:"text", children:[arabicDigits(value)], top, left:64, width:666, height:52, fontSize:18, fontWeight:"normal", color:"#263238", textAlign:"end", ...opts}; }
function rect(top:number,left:number,width:number,height:number,color:string) { return {type:"shape", paths:[{d:`M 0 0 H ${width} V ${height} H 0 Z`,fill:{color}}], viewBox:{top:0,left:0,width,height}, top,left,width,height}; }
function header(doc:LearningDocument,page:number,total:number,t:Theme){ return [rect(0,0,794,116,t.primary), text(doc.meta.title,24,{fontSize:28,fontWeight:"bold",color:t.white}), text(`${doc.meta.subject} • ${doc.meta.level} • ${doc.meta.duration} • ${page}/${total}`,74,{fontSize:13,color:t.white})]; }
function footer(doc:LearningDocument,t:Theme){ return text(doc.footer,1082,{fontSize:12,color:t.accent,textAlign:"center"}); }
function sectionTitle(label:string,top:number,t:Theme){ return [rect(top,48,698,48,t.soft),rect(top,738,8,48,t.accent),text(label,top+11,{left:62,width:666,fontSize:19,fontWeight:"bold",color:t.primary})]; }
function splitSource(source:string,max=2600){ if(source.length<=max)return[source]; const chunks:string[]=[]; let rest=source; while(rest.length>max){ let cut=rest.lastIndexOf(" ",max); if(cut<max*.65)cut=max; chunks.push(rest.slice(0,cut)); rest=rest.slice(cut).trim(); } if(rest)chunks.push(rest); return chunks; }

async function add(title:string,elements:any[],t:Theme){ await addPage({title,dimensions:{width:794,height:1123},background:{color:t.background},elements} as any); }

export async function renderLearningDocument(doc:LearningDocument) {
  const t = THEMES[doc.meta.designStyle] ?? THEMES.classic;
  const sourceChunks = splitSource(doc.content.text);
  const pages:any[][]=[];

  if(doc.meta.documentType === "lesson_plan"){
    const p=[...header(doc,1,1+sourceChunks.length+1,t),...sectionTitle("بطاقة تخطيط الحصة",140,t),rect(204,48,698,270,t.paper)];
    const fields=[`المؤسسة: ${doc.meta.institution||"................................"}`,`المعلم(ة): ${doc.meta.teacherName||"................................"}`,`التاريخ: ${doc.meta.lessonDate||"................................"}`,`الكفاءة: ${doc.meta.competency}`,`الهدف: ${doc.meta.objective}`,`التفريد: ${doc.differentiation}`];
    fields.forEach((v,i)=>p.push(text(v,220+i*39,{left:70,width:650,fontSize:14,color:t.ink})));
    p.push(...sectionTitle("المراحل البيداغوجية",500,t)); let y=562;
    for(const s of doc.sections){ p.push(text(`${s.title}: ${s.instruction}`,y,{left:70,width:650,fontSize:14,color:t.ink})); y+=86; }
    p.push(footer(doc,t)); pages.push(p);
  }

  sourceChunks.forEach((chunk,index)=>{ const pageNo=pages.length+1; const total=(doc.meta.documentType==="lesson_plan"?1:0)+sourceChunks.length+1; const p=[...header(doc,pageNo,total,t),...sectionTitle(index===0?doc.content.title:`${doc.content.title} — تابع`,140,t),rect(202,48,698,820,t.paper),text(chunk,225,{left:78,width:638,height:750,fontSize:chunk.length>1900?17:19,color:t.ink}),footer(doc,t)]; pages.push(p); });

  const qPage=[...header(doc,pages.length+1,pages.length+1,t),...sectionTitle(doc.meta.documentType==="assessment"?"التقويم":"أنشطة الفهم والتوظيف",140,t)]; let y=205;
  doc.questions.forEach((q,i)=>{ qPage.push(text(`${i+1}. ${q.prompt}`,y,{left:66,width:662,fontSize:16,fontWeight:"bold",color:t.ink})); y+=36; qPage.push(rect(y,70,650,Math.max(42,q.lines*28),t.paper)); y+=Math.max(58,q.lines*28+16); });
  qPage.push(footer(doc,t)); pages.push(qPage);

  for(let i=0;i<pages.length;i++) await add(`${doc.meta.title} — ${i+1}`,pages[i]!,t);
}
