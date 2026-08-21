const state={
  metrics:{},reports:[],opportunities:[],contents:[],logs:[],system:null,integrations:{},searchConsole:null,
  platforms:[],activeView:'dashboard',pendingPublish:null,deferredInstall:null,navHistory:[],navIndex:-1,loading:false,lastErrors:[]
};

const qs=(s,p=document)=>p?.querySelector?.(s)||null;
const qsa=(s,p=document)=>[...(p?.querySelectorAll?.(s)||[])];
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const fmtDate=v=>v?new Intl.DateTimeFormat('ar-TN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v)):'—';
const labelStatus=s=>({DRAFT:'مسودة',IN_PROGRESS:'قيد العمل',IN_REVIEW:'قيد المراجعة',READY:'جاهز للنشر',PUBLISHED:'تم النشر',ARCHIVED:'مؤرشف',SUCCESS:'نجاح',WARNING:'تحذير',ERROR:'خطأ'}[s]||s);
const platformLabel=p=>({facebook:'Facebook',instagram:'Instagram',tiktok:'TikTok',pinterest:'Pinterest',youtube:'YouTube',x:'X'}[String(p||'').toLowerCase()]||p);
const safeUrl=value=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null}catch{return null}};

async function api(path,options={}){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),15000);
  try{
    const headers={Accept:'application/json',...(options.headers||{})};
    if(options.body&&!headers['Content-Type'])headers['Content-Type']='application/json';
    const res=await fetch(path,{cache:'no-store',...options,headers,signal:options.signal||controller.signal});
    let data={};
    try{data=await res.json()}catch{}
    if(!res.ok)throw new Error(data.message||`HTTP ${res.status}`);
    return data;
  }catch(error){
    if(error?.name==='AbortError')throw new Error(`انتهت مهلة الاتصال: ${path}`);
    throw error;
  }finally{clearTimeout(timeout)}
}

function toast(message,type=''){
  const host=qs('#toastHost');
  if(!host)return;
  const el=document.createElement('div');
  el.className=`toast ${type}`;
  el.textContent=message;
  host.appendChild(el);
  setTimeout(()=>el.remove(),4200);
}
window.toast=toast;

async function loadAll(showToast=false){
  if(state.loading)return;
  state.loading=true;
  const btn=qs('#refreshBtn');
  btn?.classList.add('spin');
  const jobs={
    metrics:'/api/metrics',reports:'/api/reports',opportunities:'/api/opportunities',contents:'/api/content',logs:'/api/logs',
    system:'/api/system',integrations:'/api/integrations',searchConsole:'/api/integrations/search-console/test'
  };
  const keys=Object.keys(jobs);
  const settled=await Promise.allSettled(keys.map(key=>api(jobs[key])));
  const errors=[];
  settled.forEach((result,index)=>{
    const key=keys[index];
    if(result.status==='fulfilled')state[key]=result.value;
    else errors.push(`${key}: ${result.reason?.message||result.reason}`);
  });
  state.metrics=state.metrics||{};
  state.reports=Array.isArray(state.reports)?state.reports:[];
  state.opportunities=Array.isArray(state.opportunities)?state.opportunities:[];
  state.contents=Array.isArray(state.contents)?state.contents:[];
  state.logs=Array.isArray(state.logs)?state.logs:[];
  state.integrations=state.integrations&&typeof state.integrations==='object'?state.integrations:{};
  state.platforms=state.system?.platforms||['facebook','instagram','tiktok','pinterest','youtube','x'];
  state.lastErrors=errors;
  renderAll();
  if(showToast)toast(errors.length?`تم التحديث مع ${errors.length} تحذير`:'تم تحديث كل البيانات','success');
  btn?.classList.remove('spin');
  state.loading=false;
}
window.loadAll=loadAll;

function renderAll(){
  renderMetrics();renderLatest();renderReports();renderOpportunities();renderContent();renderLogs();renderIntegrations();renderPlatformChoices();renderSystemStatus();renderNavCounters();
}

function renderMetrics(){
  const host=qs('#metricsGrid');if(!host)return;
  const m=state.metrics||{};
  const items=[
    ['إجمالي المحتوى',m.totalContent??state.contents.length,'كل الحزم','content','ALL','▣'],
    ['قيد المراجعة',m.IN_REVIEW??0,'تحتاج قرارك','content','IN_REVIEW','◷'],
    ['جاهز للنشر',m.READY??0,'READY داخل النظام','content','READY','✓'],
    ['تم النشر',m.PUBLISHED??0,'PUBLISHED فعليًا','content','PUBLISHED','●'],
    ['Success',m.success??0,'عمليات ناجحة','logs',null,'✓'],
    ['Warning',m.warning??0,'تحتاج متابعة','logs',null,'!'],
    ['Error',m.error??0,'أخطاء النشر','logs',null,'×'],
    ['نسبة النجاح',`${m.publishingSuccessRate??0}%`,'من سجل النشر','logs',null,'↗']
  ];
  host.innerHTML=items.map(([label,value,note,view,status,icon])=>`<button class="metric-card interactive-card" type="button" data-view-link="${view}" ${status?`data-content-status="${status}"`:''}><span class="metric-icon">${icon}</span><div class="metric-label">${esc(label)}</div><div class="metric-value">${esc(value)}</div><div class="metric-note">${esc(note)}</div><span class="card-arrow">←</span></button>`).join('');
}

function renderLatest(){
  const host=qs('#latestContent');if(!host)return;
  const items=[...state.contents].sort((a,b)=>new Date(b.updatedAt||0)-new Date(a.updatedAt||0)).slice(0,5);
  if(!items.length){host.innerHTML='<div class="empty-state"><span>▣</span><b>لا يوجد محتوى بعد</b><small>ابدأ من تقرير ثم استخرج فرصة.</small></div>';return;}
  host.innerHTML=items.map(c=>`<button class="list-row list-row-button" type="button" data-details="${esc(c.id)}"><div><strong>${esc(c.title)}</strong><small>${(c.platforms||[]).map(platformLabel).join(' · ')||'بدون منصة'}</small></div><div class="row-end"><span class="status-chip ${esc(c.status)}">${esc(labelStatus(c.status))}</span><span>←</span></div></button>`).join('');
}

function reportActions(r){
  const drive=safeUrl(r.googleDriveUrl);
  return `<button class="small-btn" type="button" data-report-details="${esc(r.id)}">قراءة</button>${drive?`<a class="small-btn drive-button" href="${esc(drive)}" target="_blank" rel="noopener noreferrer">Drive ↗</a>`:`<button class="small-btn" type="button" data-archive-report="${esc(r.id)}">حفظ في Drive</button>`}<button class="small-btn primary-small" type="button" data-extract="${esc(r.id)}">استخراج الفرص</button>`;
}
function renderReports(){
  const body=qs('#reportsBody');
  if(body)body.innerHTML=state.reports.length?[...state.reports].reverse().map(r=>`<tr><td><button class="table-title-link" type="button" data-report-details="${esc(r.id)}">${esc(r.title)}</button></td><td>${esc(r.source||'—')}</td><td>${fmtDate(r.createdAt)}</td><td><div class="table-actions">${reportActions(r)}</div></td></tr>`).join(''):'<tr><td colspan="4" class="empty-box">لا توجد تقارير بعد.</td></tr>';
  const cards=qs('#reportsCards');
  if(cards)cards.innerHTML=state.reports.length?[...state.reports].reverse().map(r=>`<article class="mobile-data-card"><div class="mobile-data-head"><span>▤</span><small>${fmtDate(r.createdAt)}</small></div><button class="mobile-title" type="button" data-report-details="${esc(r.id)}">${esc(r.title)}</button><p>${esc(r.source||'دون مصدر')}</p><div class="card-actions">${reportActions(r)}</div></article>`).join(''):'<div class="panel empty-state"><span>▤</span><b>لا توجد تقارير</b></div>';
}

function renderOpportunities(){
  const count=qs('#opportunityCount');if(count)count.textContent=`${state.opportunities.length} فرصة`;
  const grid=qs('#opportunityGrid');if(!grid)return;
  if(!state.opportunities.length){grid.innerHTML='<div class="panel empty-state"><span>✦</span><b>لا توجد فرص بعد</b><small>افتح التقارير واستخرج الفرص.</small></div>';return;}
  grid.innerHTML=state.opportunities.map(o=>{
    const score=Number(o.score?.total||0);
    const seo=o.semrush;
    return `<article class="op-card"><div class="op-head"><span class="op-icon">✦</span><div class="score" style="--score:${score}"><b>${score.toFixed(1)}</b></div></div><h3>${esc(o.title)}</h3><p>${esc(o.rationale)}</p>${seo?`<div class="platform-tags"><span class="platform-tag">بحث ${Number(seo.searchVolume||0).toLocaleString('ar')}</span>${seo.keywordDifficulty!=null?`<span class="platform-tag">صعوبة ${esc(seo.keywordDifficulty)}</span>`:''}</div>`:''}<button class="btn primary full-btn" type="button" data-create-content="${esc(o.id)}">تحويل إلى محتوى ←</button></article>`;
  }).join('');
}

function contentCard(c){
  const p=c.package||{};
  let actions=`<button class="small-btn" type="button" data-details="${esc(c.id)}">فتح التفاصيل</button>`;
  if(!['PUBLISHED','ARCHIVED'].includes(c.status))actions+=`<button class="small-btn" type="button" data-assets="${esc(c.id)}">إنشاء الأصول</button>`;
  if(c.status==='IN_REVIEW')actions+=`<button class="btn primary compact" type="button" data-approve="${esc(c.id)}">اعتماد → READY</button>`;
  if(c.status==='READY')actions+=`<button class="btn danger compact" type="button" data-publish="${esc(c.id)}">اعتمد وانشر</button>`;
  if(['DRAFT','IN_PROGRESS'].includes(c.status))actions+=`<button class="btn primary compact" type="button" data-review="${esc(c.id)}">إرسال للمراجعة</button>`;
  return `<article class="content-card"><div class="content-card-head"><span class="status-chip ${esc(c.status)}">${esc(labelStatus(c.status))}</span><small>v${esc(c.revision)}</small></div><button class="content-title-button" type="button" data-details="${esc(c.id)}">${esc(c.title)}</button><div class="platform-tags">${(c.platforms||[]).map(x=>`<span class="platform-tag">${esc(platformLabel(x))}</span>`).join('')}</div><div class="content-snippet"><b>Hook:</b> ${esc(p.hook||'—')}</div><div class="card-actions">${actions}</div></article>`;
}
function renderContent(){
  const filter=qs('#contentFilter')?.value||'ALL';
  const items=state.contents.filter(c=>filter==='ALL'||c.status===filter).sort((a,b)=>new Date(b.updatedAt||0)-new Date(a.updatedAt||0));
  const grid=qs('#contentGrid');if(!grid)return;
  grid.innerHTML=items.length?items.map(contentCard).join(''):'<div class="panel empty-state"><span>▣</span><b>لا يوجد محتوى في هذه الحالة</b><small>غيّر الفلتر أو ابدأ من بنك الفرص.</small></div>';
}

function renderLogs(){
  const contentMap=Object.fromEntries(state.contents.map(c=>[c.id,c.title]));
  const rows=[...state.logs].reverse();
  const body=qs('#logsBody');
  if(body)body.innerHTML=rows.length?rows.map(l=>`<tr><td><span class="status-chip ${esc(l.result)}">${esc(labelStatus(l.result))}</span></td><td>${esc(platformLabel(l.platform))}</td><td>${esc(contentMap[l.contentId]||String(l.contentId||'—').slice(0,8))}</td><td>${esc(l.attempt||1)}</td><td>${fmtDate(l.timestamp)}</td><td>${l.publicUrl?`<a href="${esc(safeUrl(l.publicUrl)||'#')}" target="_blank" rel="noopener">فتح ↗</a>`:'—'}</td></tr>`).join(''):'<tr><td colspan="6" class="empty-box">لا توجد سجلات نشر بعد.</td></tr>';
  const cards=qs('#logsCards');
  if(cards)cards.innerHTML=rows.length?rows.map(l=>`<article class="mobile-data-card log-card"><div class="mobile-data-head"><span class="status-chip ${esc(l.result)}">${esc(labelStatus(l.result))}</span><small>${fmtDate(l.timestamp)}</small></div><h3>${esc(platformLabel(l.platform))}</h3><p>${esc(contentMap[l.contentId]||String(l.contentId||'—').slice(0,8))}</p>${l.publicUrl?`<a class="small-btn" href="${esc(safeUrl(l.publicUrl)||'#')}" target="_blank" rel="noopener">فتح المنشور ↗</a>`:''}</article>`).join(''):'<div class="panel empty-state"><span>≡</span><b>لا توجد سجلات نشر</b></div>';
}

const INTEGRATION_DEFS=[
  {key:'gemini',name:'Gemini Automation',icon:'✦',desc:'تحليل التقارير وصناعة المحتوى داخل المنظومة.',action:'gemini'},
  {key:'clickup',name:'ClickUp',icon:'✓',desc:'المهام وحالات READY/PUBLISHED والمسار إلى Make.',action:'clickup'},
  {key:'make',name:'Make',icon:'⚙',desc:'سيناريو Watch Tasks الذي يلتقط المهام READY وينشرها.',action:'make'},
  {key:'drive',name:'Google Drive',icon:'△',desc:'أرشفة التقارير والأصول والفيديوهات والملفات.',action:'drive'},
  {key:'canva',name:'Canva',icon:'C',desc:'التصميم والقوالب والتصدير عند الحاجة.',action:'canva'},
  {key:'remotion',name:'Remotion',icon:'▶',desc:'رندر الفيديو متعدد المقاسات داخل بيئة Vercel.',action:'remotion'},
  {key:'searchconsole',name:'Google Search Console',icon:'G',desc:'بيانات الظهور والفهرسة وأداء البحث.',action:'searchconsole'},
  {key:'trends',name:'Google Trends',icon:'↗',desc:'استكشاف اتجاهات البحث — استخدام يدوي.',action:'trends'},
  {key:'github',name:'GitHub',icon:'⌘',desc:'المستودع الرسمي وكود Ghaith Web Content OS.',action:'github'},
  {key:'vercel',name:'Vercel',icon:'▲',desc:'الاستضافة والنشر الفعلي لنسخة Production.',action:'vercel'},
  {key:'notifications',name:'Notifications',icon:'🔔',desc:'إشعارات الويب على الجهاز عند تفعيلها.',action:'notifications'},
  {key:'semrush',name:'Semrush',icon:'S',desc:'بيانات SEO — غير مهيأ حاليًا إذا لم يوجد اتصال.',action:'semrush'},
  {key:'heygen',name:'HeyGen',icon:'H',desc:'استخدام يدوي مجاني من واجهة HeyGen، بدون API مدفوع.',action:'heygen'}
];

function integrationState(def){
  const sys=state.system?.integrations||{};
  const all=state.integrations||{};
  if(def.key==='gemini')return status(Boolean(sys['Gemini Automation']||all.OpenAI?.enabled),'جاهز','يحتاج إعداد');
  if(def.key==='clickup')return status(Boolean(all.ClickUp?.enabled||sys.ClickUp),'متصل','غير متصل');
  if(def.key==='make')return status(Boolean(sys.Make&&state.system?.publishMode==='clickup_watch'),'Watch Tasks جاهز','غير جاهز');
  if(def.key==='drive')return status(Boolean(all.GoogleDrive?.connected||sys['Google Drive']),'متصل','غير متصل');
  if(def.key==='canva')return status(Boolean(all.Canva?.connected),'متصل','يحتاج ربط');
  if(def.key==='remotion')return status(Boolean(all.Remotion?.ok||sys.Remotion),'جاهز','غير جاهز');
  if(def.key==='searchconsole')return status(Boolean(state.searchConsole?.connected||state.searchConsole?.ok),'متصل','يحتاج إعداد');
  if(def.key==='trends')return {tone:'manual',label:'يدوي',detail:'متاح عبر الويب'};
  if(def.key==='github')return {tone:'on',label:'متصل بالمشروع',detail:'Source Control'};
  if(def.key==='vercel')return {tone:'on',label:'Production',detail:'الاستضافة الحالية'};
  if(def.key==='notifications'){
    const n=all.Notifications||{};const subs=Number(n.subscriptions||0);
    return subs>0?{tone:'on',label:'مفعلة',detail:`${subs} اشتراك`}:{tone:'manual',label:'غير مفعلة على الجهاز',detail:'اضغط للتفعيل'};
  }
  if(def.key==='semrush')return all.Semrush?.ok?{tone:'on',label:'جاهز',detail:'SEO API'}:{tone:'off',label:'غير مهيأ',detail:all.Semrush?.message||'لا يوجد اتصال'};
  if(def.key==='heygen')return {tone:'manual',label:'يدوي مجاني',detail:'API غير مستخدم'};
  return {tone:'off',label:'غير معروف',detail:''};
}
function status(ok,onLabel,offLabel){return ok?{tone:'on',label:onLabel,detail:'يعمل'}:{tone:'off',label:offLabel,detail:'يتطلب مراجعة'}};

function renderIntegrations(){
  const items=INTEGRATION_DEFS.map(def=>({...def,state:integrationState(def)}));
  const grid=qs('#integrationGrid');
  if(grid)grid.innerHTML=items.map(item=>`<button class="integration-card integration-${item.state.tone}" type="button" data-integration="${esc(item.key)}"><div class="integration-icon">${esc(item.icon)}</div><div class="integration-content"><div class="top"><h3>${esc(item.name)}</h3><span class="pill-${item.state.tone}">${esc(item.state.label)}</span></div><p>${esc(item.desc)}</p><small>${esc(item.state.detail)}</small></div><span class="integration-arrow">←</span></button>`).join('');
  const mini=qs('#integrationMini');
  if(mini)mini.innerHTML=items.map(item=>`<button class="integration-row" type="button" data-integration="${esc(item.key)}"><span><i class="mini-icon">${esc(item.icon)}</i>${esc(item.name)}</span><b class="pill-${item.state.tone}">${esc(item.state.label)}</b><em>←</em></button>`).join('');
  const ready=items.filter(i=>i.state.tone==='on').length,manual=items.filter(i=>i.state.tone==='manual').length,off=items.filter(i=>i.state.tone==='off').length;
  const summary=qs('#integrationSummary');
  if(summary)summary.innerHTML=`<button type="button" class="summary-chip good" data-filter-integrations="on"><b>${ready}</b><span>جاهز/متصل</span></button><button type="button" class="summary-chip manual" data-filter-integrations="manual"><b>${manual}</b><span>يدوي</span></button><button type="button" class="summary-chip off" data-filter-integrations="off"><b>${off}</b><span>يحتاج إعداد</span></button>`;
}

function renderPlatformChoices(){
  const host=qs('#platformChoices');if(!host)return;
  host.innerHTML=(state.platforms||[]).map((p,i)=>`<label class="platform-choice"><input type="checkbox" name="platform" value="${esc(p)}" ${i<5?'checked':''}><span>${esc(platformLabel(p))}</span></label>`).join('');
}

function renderSystemStatus(){
  const ready=Boolean(state.system?.integrations?.ClickUp&&state.system?.integrations?.Make);
  const dot=qs('#systemDot'),text=qs('#systemStatus'),mode=qs('#publishMode');
  if(dot)dot.className=ready?'ok':'warn';
  if(text)text.textContent=state.lastErrors.length?`يعمل مع ${state.lastErrors.length} تحذير`:ready?'النظام يعمل — ClickUp وMake جاهزان':'التطبيق يعمل — بعض الاتصالات تحتاج مراجعة';
  if(mode)mode.textContent=state.system?.publishMode==='clickup_watch'?'ClickUp Watch → Make':state.system?.publishMode||'—';
}

function renderNavCounters(){
  setText('#navReportsCount',state.reports.length);setText('#navOpportunitiesCount',state.opportunities.length);setText('#navContentCount',state.contents.length);setText('#navLogsCount',state.logs.length);setText('#navIntegrationsCount',INTEGRATION_DEFS.length);
  setText('#quickReportsText',`${state.reports.length} تقرير`);setText('#quickOpportunitiesText',`${state.opportunities.length} فرصة`);setText('#quickContentText',`${state.contents.length} حزمة محتوى`);setText('#quickIntegrationsText',`${INTEGRATION_DEFS.length} تكامل/أداة`);
}
function setText(selector,value){const el=qs(selector);if(el)el.textContent=String(value)}

function openModal(id){
  closeDrawer();
  qs('#modalBackdrop')?.classList.add('show');
  const modal=qs(`#${id}`);if(!modal)return;
  modal.classList.add('show');modal.setAttribute('aria-hidden','false');document.body.classList.add('modal-open');
}
function closeModals(){qs('#modalBackdrop')?.classList.remove('show');qsa('.modal.show').forEach(m=>{m.classList.remove('show');m.setAttribute('aria-hidden','true')});document.body.classList.remove('modal-open')}

function openDrawer(){qs('#sidebar')?.classList.add('open');qs('#drawerOverlay')?.classList.add('show');document.body.classList.add('drawer-open')}
function closeDrawer(){qs('#sidebar')?.classList.remove('open');qs('#drawerOverlay')?.classList.remove('show');document.body.classList.remove('drawer-open')}

const validViews=['dashboard','reports','opportunities','content','logs','integrations'];
const viewTitles={dashboard:['لوحة التحكم','متابعة المنظومة من الفكرة حتى النشر'],reports:['التقارير','المصادر اليومية والسابقة'],opportunities:['بنك الفرص','تحويل الإشارات إلى فرص قابلة للتنفيذ'],content:['خط إنتاج المحتوى','المراجعة والأصول والجاهزية والنشر'],logs:['سجل النشر','النتائج الحقيقية لكل منصة'],integrations:['التكاملات','حالة كل اتصال وإجراءاته']};
function updateNavButtons(){const back=qs('#navBackBtn'),forward=qs('#navForwardBtn');if(back)back.disabled=state.navIndex<=0;if(forward)forward.disabled=state.navIndex<0||state.navIndex>=state.navHistory.length-1}
function switchView(name,{record=true,replace=false}={}){
  if(!validViews.includes(name))name='dashboard';
  if(record&&name!==state.activeView){state.navHistory=state.navHistory.slice(0,state.navIndex+1);state.navHistory.push(name);state.navIndex=state.navHistory.length-1;const u=new URL(location.href);u.searchParams.set('view',name);history.pushState({view:name,navIndex:state.navIndex},'',u)}
  if(replace){state.navHistory=[name];state.navIndex=0;const u=new URL(location.href);u.searchParams.set('view',name);history.replaceState({view:name,navIndex:0},'',u)}
  state.activeView=name;
  qsa('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${name}`));
  qsa('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
  const title=viewTitles[name]||viewTitles.dashboard;setText('#pageTitle',title[0]);setText('#pageSubtitle',title[1]);
  closeDrawer();updateNavButtons();window.scrollTo({top:0,behavior:'smooth'});
}
window.switchView=switchView;
function navigateHistory(direction){if(direction<0)history.back();else history.forward()}

async function extractOpportunities(id,button){
  button.disabled=true;const old=button.textContent;button.textContent='جاري التحليل…';
  try{const out=await api(`/api/reports/${id}/opportunities`,{method:'POST'});toast(`تم استخراج ${out.length} فرصة`,'success');await loadAll();switchView('opportunities')}
  catch(e){toast(e.message,'error')}finally{button.disabled=false;button.textContent=old}
}
function startContent(id){const o=state.opportunities.find(x=>x.id===id);setText('#platformOpportunityTitle',o?.title||'');const input=qs('#platformForm [name=opportunityId]');if(input)input.value=id;openModal('platformModal')}
async function action(id,kind){
  try{
    if(kind==='approve')await api(`/api/content/${id}/approve`,{method:'POST',body:JSON.stringify({approvedBy:'Ghaith Web Owner'})});
    if(kind==='review')await api(`/api/content/${id}/review`,{method:'POST'});
    if(kind==='assets')await api(`/api/content/${id}/assets`,{method:'POST'});
    toast(kind==='approve'?'تم الاعتماد وأصبح المحتوى READY':kind==='assets'?'تم إنشاء/طلب الأصول':'تم الإرسال للمراجعة','success');await loadAll();
  }catch(e){toast(e.message,'error')}
}

function assetLinks(c){
  const rows=[...(c.assets||[]).map(a=>({label:`${a.kind}${a.format?` ${a.format}`:''} — ${a.provider||'أصل'}`,url:a.url})),...(c.googleDriveUrls||[]).map((url,i)=>({label:`Google Drive ${i+1}`,url}))];
  const seen=new Set();const links=rows.filter(x=>safeUrl(x.url)&&!seen.has(x.url)&&seen.add(x.url));
  return links.length?`<div class="asset-links">${links.map(x=>`<a class="drive-link" href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener noreferrer">${esc(x.label)} ↗</a>`).join('')}</div>`:'<p class="muted">لا توجد أصول بعد.</p>';
}
function showDetails(id){
  const c=state.contents.find(x=>x.id===id);if(!c)return;
  setText('#contentModalTitle',c.title);setText('#contentModalMeta',`${labelStatus(c.status)} · v${c.revision} · ${(c.platforms||[]).map(platformLabel).join('، ')}`);
  const p=c.package||{};
  qs('#contentModalBody').innerHTML=`<div class="detail-body"><div class="detail-grid"><section class="detail-section"><h4>Hook</h4><p>${esc(p.hook||'—')}</p></section><section class="detail-section"><h4>CTA</h4><p>${esc(p.cta||'—')}</p></section></div><section class="detail-section"><h4>Caption</h4><pre>${esc(p.caption||'—')}</pre></section><section class="detail-section"><h4>Script</h4><pre>${esc(p.script||'—')}</pre></section><section class="detail-section"><h4>الأصول والروابط</h4>${assetLinks(c)}</section><section class="detail-section"><h4>ClickUp</h4><p>${esc(c.clickupTaskId||'غير مرتبط بعد')}</p></section></div>`;
  openModal('contentModal');
}
function showReportDetails(id){
  const r=state.reports.find(x=>x.id===id);if(!r)return;
  setText('#reportDetailsTitle',r.title);setText('#reportDetailsMeta',`${r.source||'دون مصدر'} · ${fmtDate(r.createdAt)}`);
  qs('#reportDetailsBody').innerHTML=`<div class="detail-body"><section class="detail-section"><h4>نص التقرير</h4><pre class="report-full-text">${esc(r.body||'لا يوجد نص')}</pre></section><div class="form-actions"><button class="btn primary" type="button" data-extract="${esc(r.id)}">استخراج أفضل الفرص</button>${safeUrl(r.googleDriveUrl)?`<a class="btn ghost" href="${esc(safeUrl(r.googleDriveUrl))}" target="_blank" rel="noopener">فتح في Drive ↗</a>`:''}</div></div>`;
  openModal('reportDetailsModal');
}
async function archiveReport(id,button){button.disabled=true;try{await api(`/api/reports/${id}/archive`,{method:'POST'});toast('تم حفظ التقرير في Drive','success');await loadAll()}catch(e){toast(e.message,'error')}finally{button.disabled=false}}
async function archiveAllReports(){const button=qs('#archiveAllReportsBtn');button.disabled=true;const old=button.textContent;let total=0;try{for(let i=0;i<20;i++){button.textContent=`جاري الحفظ… ${total}`;const r=await api('/api/reports/archive-pending?limit=10',{method:'POST'});total+=(r.archived||[]).length;if(!r.remaining)break}toast(`تم حفظ ${total} تقريرًا`,'success');await loadAll()}catch(e){toast(e.message,'error')}finally{button.disabled=false;button.textContent=old}}

function askPublish(id){const c=state.contents.find(x=>x.id===id);if(!c)return;state.pendingPublish=id;setText('#confirmText',`سيتم تسليم «${c.title}» عبر ClickUp READY ثم Make.`);openModal('confirmModal')}
async function confirmPublish(){if(!state.pendingPublish)return;const b=qs('#confirmPublishBtn');b.disabled=true;const old=b.textContent;b.textContent='جاري التسليم…';try{const r=await api(`/api/content/${state.pendingPublish}/publish`,{method:'POST'});closeModals();toast(r.dispatched?'تم التسليم إلى ClickUp READY — Make سيلتقط المهمة':r.published?'تم النشر بنجاح':r.warning||'تم تنفيذ الطلب','success');await loadAll()}catch(e){toast(e.message,'error')}finally{b.disabled=false;b.textContent=old;state.pendingPublish=null}}

function showIntegration(key){
  const def=INTEGRATION_DEFS.find(x=>x.key===key);if(!def)return;
  const s=integrationState(def);
  setText('#integrationModalTitle',def.name);setText('#integrationModalMeta',s.label);
  const details=integrationDetails(key);
  qs('#integrationModalBody').innerHTML=`<div class="detail-body"><div class="integration-detail-hero"><div class="integration-icon large">${esc(def.icon)}</div><div><h3>${esc(def.name)}</h3><span class="pill-${s.tone}">${esc(s.label)}</span></div></div><section class="detail-section"><h4>الدور</h4><p>${esc(def.desc)}</p></section>${details?`<section class="detail-section"><h4>الحالة</h4><pre>${esc(details)}</pre></section>`:''}<div class="form-actions"><button class="btn primary" type="button" data-run-integration="${esc(key)}">${integrationActionLabel(key)}</button><button class="btn ghost" type="button" data-close>إغلاق</button></div></div>`;
  openModal('integrationModal');
}
function integrationDetails(key){const a=state.integrations||{};if(key==='drive')return `OAuth: ${a.GoogleDrive?.connected?'متصل':'غير متصل'}\nالمجلد: ${a.GoogleDrive?.folderName||'—'}\nDrive Watch: ${a.GoogleDrive?.watch?.enabled?'مفعّل':'غير مفعّل'}`;if(key==='canva')return `OAuth: ${a.Canva?.connected?'متصل':'غير متصل'}\nMode: ${a.Canva?.mode||'—'}`;if(key==='make')return `Publish mode: ${state.system?.publishMode||'—'}\nالمسار: ClickUp READY → Make Watch Tasks`;if(key==='remotion')return `Mode: ${a.Remotion?.mode||'—'}\nEngine: ${a.Remotion?.engine||'remotion'}`;if(key==='semrush')return a.Semrush?.message||'Semrush غير مهيأ حاليًا.';if(key==='notifications')return `الاشتراكات: ${a.Notifications?.subscriptions||0}`;return ''}
function integrationActionLabel(key){return ({gemini:'اختبار Gemini',clickup:'فتح ClickUp',make:'فتح Make',drive:'فتح مجلد Drive',canva:'فتح Canva',remotion:'اختبار Remotion',searchconsole:'فتح Search Console',trends:'فتح Google Trends',github:'فتح GitHub',vercel:'فتح Production',notifications:'تفعيل/اختبار الإشعارات',semrush:'عرض الحالة',heygen:'فتح HeyGen Free'})[key]||'فتح'}
async function runIntegration(key){
  const urls={clickup:'https://app.clickup.com/',make:'https://www.make.com/en/login',canva:'https://www.canva.com/',trends:'https://trends.google.com/explore',github:'https://github.com/webghaith-gif/ghaith-web-content-os',vercel:'https://ghaith-web-content-os.vercel.app/',heygen:'https://app.heygen.com/'};
  if(urls[key]){window.open(urls[key],'_blank','noopener,noreferrer');return}
  if(key==='drive'){
    const folder=state.integrations?.GoogleDrive?.folderId;
    if(folder)window.open(`https://drive.google.com/drive/folders/${encodeURIComponent(folder)}`,'_blank','noopener,noreferrer');
    else{try{const p=await api('/api/integrations/google-drive/test');toast(p.ok?'Google Drive متصل':'Google Drive غير متصل',p.ok?'success':'error')}catch(e){toast(e.message,'error')}}return;
  }
  if(key==='searchconsole'){try{const p=await api('/api/integrations/search-console/test');state.searchConsole=p;renderIntegrations();if(p.connected||p.ok)window.open('https://search.google.com/search-console','_blank','noopener,noreferrer');else toast(p.message||'Search Console يحتاج إعدادًا','error')}catch(e){toast(e.message,'error')}return}
  if(key==='gemini'){try{const p=await api('/api/integrations/openai/test');toast(p.ok?`Gemini جاهز${p.model?` — ${p.model}`:''}`:p.message||'Gemini غير جاهز',p.ok?'success':'error')}catch(e){toast(e.message,'error')}return}
  if(key==='remotion'){try{const p=await api('/api/integrations/remotion/test');toast(p.ok?'Remotion جاهز للرندر':p.message||'Remotion غير جاهز',p.ok?'success':'error')}catch(e){toast(e.message,'error')}return}
  if(key==='notifications'){qs('#notificationBtn')?.click();closeModals();return}
  if(key==='semrush'){toast(state.integrations?.Semrush?.ok?'Semrush جاهز':'Semrush غير مهيأ حاليًا','')}
}

function filterIntegrations(tone){qsa('#integrationGrid .integration-card').forEach(card=>{const key=card.dataset.integration;const def=INTEGRATION_DEFS.find(x=>x.key===key);card.hidden=def?integrationState(def).tone!==tone:false})}

qs('#reportForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const b=e.submitter;b.disabled=true;try{await api('/api/reports',{method:'POST',body:JSON.stringify({title:f.get('title'),source:f.get('source'),body:f.get('body')})});e.currentTarget.reset();closeModals();toast('تم حفظ التقرير','success');await loadAll();switchView('reports')}catch(err){toast(err.message,'error')}finally{b.disabled=false}});
qs('#platformForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget),id=f.get('opportunityId'),platforms=f.getAll('platform');if(!platforms.length)return toast('اختر منصة واحدة على الأقل','error');const b=e.submitter;b.disabled=true;const old=b.textContent;b.textContent='جاري الإنشاء…';try{await api(`/api/opportunities/${id}/content`,{method:'POST',body:JSON.stringify({platforms})});closeModals();toast('تم إنشاء الحزمة وإرسالها إلى IN REVIEW','success');await loadAll();switchView('content')}catch(err){toast(err.message,'error')}finally{b.disabled=false;b.textContent=old}});

document.addEventListener('click',event=>{
  const t=event.target.closest('button,[data-view-link],[data-integration],[data-run-integration],[data-filter-integrations]');if(!t)return;
  if(t.dataset.view)switchView(t.dataset.view);
  if(t.dataset.viewLink){switchView(t.dataset.viewLink);if(t.dataset.contentStatus){const filter=qs('#contentFilter');if(filter)filter.value=t.dataset.contentStatus;renderContent()}}
  if(t.dataset.open)openModal(t.dataset.open);
  if(t.hasAttribute('data-close'))closeModals();
  if(t.dataset.reportDetails)showReportDetails(t.dataset.reportDetails);
  if(t.dataset.archiveReport)archiveReport(t.dataset.archiveReport,t);
  if(t.dataset.extract)extractOpportunities(t.dataset.extract,t);
  if(t.dataset.createContent)startContent(t.dataset.createContent);
  if(t.dataset.details)showDetails(t.dataset.details);
  if(t.dataset.approve)action(t.dataset.approve,'approve');
  if(t.dataset.review)action(t.dataset.review,'review');
  if(t.dataset.assets)action(t.dataset.assets,'assets');
  if(t.dataset.publish)askPublish(t.dataset.publish);
  if(t.dataset.integration)showIntegration(t.dataset.integration);
  if(t.dataset.runIntegration)runIntegration(t.dataset.runIntegration);
  if(t.dataset.filterIntegrations)filterIntegrations(t.dataset.filterIntegrations);
});

qs('#modalBackdrop')?.addEventListener('click',closeModals);
qs('#menuBtn')?.addEventListener('click',openDrawer);
qs('#sidebarCloseBtn')?.addEventListener('click',closeDrawer);
qs('#drawerOverlay')?.addEventListener('click',closeDrawer);
qs('#refreshBtn')?.addEventListener('click',()=>loadAll(true));
qs('#refreshIntegrationsBtn')?.addEventListener('click',()=>loadAll(true));
qs('#contentFilter')?.addEventListener('change',renderContent);
qs('#confirmPublishBtn')?.addEventListener('click',confirmPublish);
qs('#archiveAllReportsBtn')?.addEventListener('click',archiveAllReports);
qs('#navBackBtn')?.addEventListener('click',()=>navigateHistory(-1));
qs('#navForwardBtn')?.addEventListener('click',()=>navigateHistory(1));
qs('#notificationLaunchBtn')?.addEventListener('click',()=>{closeDrawer();qs('#notificationBtn')?.click()});

document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModals();closeDrawer()}});
window.addEventListener('popstate',e=>{const name=e.state?.view||new URLSearchParams(location.search).get('view')||'dashboard';const idx=Number(e.state?.navIndex);if(Number.isInteger(idx)&&idx>=0)state.navIndex=idx;switchView(name,{record:false});updateNavButtons()});

window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.deferredInstall=e;const b=qs('#installBtn');if(b)b.hidden=false});
qs('#installBtn')?.addEventListener('click',async()=>{if(!state.deferredInstall)return;state.deferredInstall.prompt();await state.deferredInstall.userChoice;state.deferredInstall=null;qs('#installBtn').hidden=true});

if('serviceWorker'in navigator)window.addEventListener('load',async()=>{try{const r=await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});await r.update()}catch{}});

async function boot(){
  const requested=new URLSearchParams(location.search).get('view');
  switchView(validViews.includes(requested)?requested:'dashboard',{record:false,replace:true});
  await loadAll(false);
}
const AUTO_REFRESH_MS=10*60*1000;
setInterval(()=>{if(document.visibilityState==='visible')loadAll(false)},AUTO_REFRESH_MS);
boot();
