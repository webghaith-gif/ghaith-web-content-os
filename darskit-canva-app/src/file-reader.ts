const TEXT_EXTENSIONS = new Set(["txt","md","csv","json"]);
const MARKUP_EXTENSIONS = new Set(["html","htm","xml"]);
export class SourceFileError extends Error {}

function clean(text:string){ return text.replace(/\r/g,"").replace(/[ \t]+/g," ").replace(/\n{3,}/g,"\n\n").trim(); }
export async function readSourceFile(file:File):Promise<string>{
  if(file.size > 20*1024*1024) throw new SourceFileError("حجم الملف أكبر من 20 ميغابايت. اختاري ملفًا أصغر.");
  const ext=(file.name.split(".").pop()||"").toLowerCase();
  let value="";
  if(ext==="docx" || file.type==="application/vnd.openxmlformats-officedocument.wordprocessingml.document"){
    const mammoth=await import("mammoth");
    value=(await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()})).value;
  } else if(ext==="pdf" || file.type==="application/pdf"){
    const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),disableWorker:true} as any).promise;
    const pages:string[]=[];
    for(let i=1;i<=pdf.numPages;i++){
      const page=await pdf.getPage(i); const tc=await page.getTextContent();
      pages.push((tc.items as any[]).filter(x=>"str" in x).map(x=>x.str).join(" "));
    }
    value=pages.join("\n\n");
    await pdf.destroy();
  } else if(MARKUP_EXTENSIONS.has(ext)){
    const parser=new DOMParser(); const doc=parser.parseFromString(await file.text(),ext==="html"||ext==="htm"?"text/html":"application/xml");
    doc.querySelectorAll("script,style,noscript").forEach(n=>n.remove());
    value=doc.body?.textContent || doc.documentElement.textContent || "";
  } else if(TEXT_EXTENSIONS.has(ext) || file.type.startsWith("text/")) value=await file.text();
  else throw new SourceFileError("نوع الملف غير مدعوم. استخدمي TXT أو MD أو PDF نصي أو DOCX أو CSV أو JSON أو HTML/XML.");
  value=clean(value);
  if(!value) throw new SourceFileError("لم أتمكن من استخراج نص قابل للاستخدام من الملف.");
  return value;
}
