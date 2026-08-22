(()=>{
  const PUSH_SCOPE='/push/';
  const PUSH_WORKER='/push-sw.js?v=14';
  const STORAGE_KEY='ghaith-web-notification-events-v1';
  let panel=null;
  let backdrop=null;
  let currentSubscription=null;

  const api=async(path,options={})=>{
    const response=await fetch(path,{cache:'no-store',headers:{Accept:'application/json','Content-Type':'application/json',...(options.headers||{})},...options});
    let data={};try{data=await response.json()}catch{}
    if(!response.ok)throw new Error(data.message||`HTTP ${response.status}`);
    return data;
  };
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const supported=()=>('serviceWorker'in navigator)&&('PushManager'in window)&&('Notification'in window);
  const toast=(message,type='success')=>typeof window.toast==='function'?window.toast(message,type):alert(message);

  function nativeRegister(scriptURL,options){
    const proto=Object.getPrototypeOf(navigator.serviceWorker);
    return proto.register.call(navigator.serviceWorker,scriptURL,options);
  }

  async function waitForActive(registration){
    if(registration.active)return registration;
    const worker=registration.installing||registration.waiting;
    if(!worker)return registration;
    await new Promise(resolve=>{
      const done=()=>{if(worker.state==='activated'||worker.state==='redundant')resolve()};
      worker.addEventListener('statechange',done);
      done();
      setTimeout(resolve,5000);
    });
    return registration;
  }

  async function pushRegistration(create=false){
    if(!supported())return null;
    let registration=await navigator.serviceWorker.getRegistration(PUSH_SCOPE);
    if(!registration&&create){
      registration=await nativeRegister(PUSH_WORKER,{scope:PUSH_SCOPE,updateViaCache:'none'});
      await waitForActive(registration);
    }
    return registration||null;
  }

  async function existingSubscription(){
    const registration=await pushRegistration(false);
    currentSubscription=registration?await registration.pushManager.getSubscription():null;
    return currentSubscription;
  }

  function decodeVapidKey(value){
    const padding='='.repeat((4-value.length%4)%4);
    const base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/');
    const raw=atob(base64);
    const out=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
    return out;
  }

  function localEvents(){
    try{const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');return Array.isArray(parsed)?parsed:[]}
    catch{return []}
  }
  function saveLocalEvent(notification){
    const events=localEvents();
    events.unshift({
      title:notification?.title||'غيث ويب',
      body:notification?.body||'',
      url:notification?.url||'/',
      at:new Date().toISOString(),
    });
    localStorage.setItem(STORAGE_KEY,JSON.stringify(events.slice(0,30)));
  }
  function fmt(value){
    try{return new Intl.DateTimeFormat('ar-TN',{dateStyle:'short',timeStyle:'short'}).format(new Date(value))}
    catch{return ''}
  }

  function injectStyles(){
    if(document.getElementById('ghaithNotificationCenterStyles'))return;
    const style=document.createElement('style');
    style.id='ghaithNotificationCenterStyles';
    style.textContent=`
      .gw-notify-backdrop{position:fixed;inset:0;background:rgba(3,14,28,.38);backdrop-filter:blur(2px);z-index:3000;opacity:0;pointer-events:none;transition:.2s ease}
      .gw-notify-backdrop.show{opacity:1;pointer-events:auto}
      .gw-notify-panel{position:fixed;z-index:3001;top:16px;bottom:16px;right:16px;width:min(430px,calc(100vw - 32px));background:#fffdfa;border:1px solid #e7dfd2;border-radius:24px;box-shadow:0 26px 80px rgba(11,31,58,.24);transform:translateX(calc(100% + 30px));transition:.24s ease;overflow:auto;color:#142033}
      .gw-notify-panel.show{transform:translateX(0)}
      .gw-notify-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;padding:18px 18px 14px;background:rgba(255,253,250,.96);backdrop-filter:blur(8px);border-bottom:1px solid #eee7dd}
      .gw-notify-head h3{margin:0;font-size:20px}.gw-notify-close{border:1px solid #e3dbcf;background:#fff;border-radius:12px;width:38px;height:38px;font-size:22px;cursor:pointer}
      .gw-notify-body{padding:16px;display:grid;gap:14px}.gw-notify-card{border:1px solid #e7dfd2;border-radius:18px;padding:16px;background:#fff}.gw-notify-status{display:flex;align-items:center;justify-content:space-between;gap:12px}.gw-notify-status strong{font-size:16px}.gw-notify-pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:7px 10px;font-size:12px;font-weight:800}.gw-notify-pill.on{background:#eaf8ef;color:#1c7a43}.gw-notify-pill.off{background:#fff0ed;color:#9a3b2d}.gw-notify-pill.wait{background:#f5f0e7;color:#7d6a40}
      .gw-notify-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:14px}.gw-notify-btn{min-height:44px;border-radius:12px;border:1px solid #ded5c6;background:#fff;font:inherit;font-weight:800;cursor:pointer}.gw-notify-btn.primary{background:#0b1f3a;color:#fff;border-color:#0b1f3a}.gw-notify-btn:disabled{opacity:.55;cursor:not-allowed}.gw-notify-copy{margin:10px 0 0;color:#6f7888;line-height:1.7;font-size:13px}
      .gw-notify-list{display:grid;gap:9px;margin-top:12px}.gw-notify-event{display:block;text-decoration:none;color:inherit;border:1px solid #eee6da;border-radius:13px;padding:11px 12px;background:#fff}.gw-notify-event b{display:block;font-size:13px}.gw-notify-event span{display:block;color:#6f7888;font-size:12px;margin-top:4px;line-height:1.5}.gw-notify-event small{display:block;color:#9a927f;font-size:10px;margin-top:5px}.gw-notify-empty{color:#7c8390;font-size:13px;text-align:center;padding:14px}
      .gw-notify-types{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.gw-notify-type{padding:10px;border-radius:12px;background:#f8f4ec;font-size:12px;font-weight:700}.gw-notify-topbtn{position:relative}.gw-notify-dot{position:absolute;top:6px;left:7px;width:8px;height:8px;border-radius:999px;background:#1fa75a;box-shadow:0 0 0 2px #fff}
      @media(max-width:640px){.gw-notify-panel{inset:0;width:100%;border-radius:0}.gw-notify-actions{grid-template-columns:1fr}.gw-notify-types{grid-template-columns:1fr 1fr}}
    `;
    document.head.appendChild(style);
  }

  function ensurePanel(){
    if(panel)return;
    injectStyles();
    backdrop=document.createElement('div');backdrop.className='gw-notify-backdrop';
    panel=document.createElement('aside');panel.className='gw-notify-panel';panel.setAttribute('aria-label','مركز الإشعارات');
    panel.innerHTML=`
      <div class="gw-notify-head"><div><h3>🔔 مركز الإشعارات</h3><small>Ghaith Web</small></div><button class="gw-notify-close" type="button" aria-label="إغلاق">×</button></div>
      <div class="gw-notify-body">
        <section class="gw-notify-card" id="gwNotifyStatusCard"><div class="gw-notify-empty">جاري فحص حالة الإشعارات…</div></section>
        <section class="gw-notify-card"><strong>ما الذي سيصل إلى الهاتف؟</strong><div class="gw-notify-types"><div class="gw-notify-type">✨ محتوى للمراجعة</div><div class="gw-notify-type">✅ محتوى READY</div><div class="gw-notify-type">🎨 أصول وملفات Drive</div><div class="gw-notify-type">📥 تقارير جديدة</div></div><p class="gw-notify-copy">الإشعارات تعمل عبر Web Push، لذلك يمكن أن تصل حتى عندما تكون صفحة Ghaith Web مغلقة.</p></section>
        <section class="gw-notify-card"><strong>آخر الإشعارات المستلمة على هذا الهاتف</strong><div class="gw-notify-list" id="gwNotifyEvents"></div></section>
        <section class="gw-notify-card"><strong>آخر نتائج النشر</strong><div class="gw-notify-list" id="gwNotifyLogs"><div class="gw-notify-empty">جاري التحميل…</div></div></section>
      </div>`;
    document.body.append(backdrop,panel);
    panel.querySelector('.gw-notify-close')?.addEventListener('click',closePanel);
    backdrop.addEventListener('click',closePanel);
  }

  function closePanel(){panel?.classList.remove('show');backdrop?.classList.remove('show');document.body.style.overflow=''}
  async function openPanel(){ensurePanel();panel.classList.add('show');backdrop.classList.add('show');document.body.style.overflow='hidden';await refreshPanel()}

  async function enablePush(){
    if(!supported())throw new Error('هذا المتصفح لا يدعم Web Push على هذا الجهاز.');
    let permission=Notification.permission;
    if(permission==='default')permission=await Notification.requestPermission();
    if(permission!=='granted')throw new Error('يجب السماح بالإشعارات من إعدادات Chrome.');
    const registration=await pushRegistration(true);
    if(!registration)throw new Error('تعذر تجهيز خدمة الإشعارات.');
    const {publicKey}=await api('/api/notifications/public-key');
    let subscription=await registration.pushManager.getSubscription();
    if(!subscription){
      subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodeVapidKey(publicKey)});
    }
    currentSubscription=subscription;
    await api('/api/notifications/subscribe',{method:'POST',body:JSON.stringify(subscription.toJSON())});
    toast('تم تفعيل إشعارات Ghaith Web على هذا الهاتف ✅','success');
    await refreshPanel();
  }

  async function sendTest(){
    const subscription=await existingSubscription();
    if(!subscription)throw new Error('فعّلي الإشعارات أولًا على هذا الهاتف.');
    const result=await api('/api/notifications/test',{method:'POST',body:'{}'});
    if(Number(result.delivered||0)>0)toast('أُرسل إشعار تجريبي إلى الهاتف ✅','success');
    else throw new Error('لم يتم تسليم الإشعار التجريبي بعد.');
  }

  function renderLocalEvents(){
    const host=document.getElementById('gwNotifyEvents');if(!host)return;
    const events=localEvents();
    host.innerHTML=events.length?events.slice(0,12).map(item=>`<a class="gw-notify-event" href="${esc(item.url||'#')}"><b>${esc(item.title)}</b><span>${esc(item.body)}</span><small>${esc(fmt(item.at))}</small></a>`).join(''):'<div class="gw-notify-empty">لا توجد إشعارات مستلمة على هذا الهاتف بعد.</div>';
  }

  async function renderLogs(){
    const host=document.getElementById('gwNotifyLogs');if(!host)return;
    try{
      const logs=await api('/api/logs');
      const items=Array.isArray(logs)?[...logs].reverse().slice(0,8):[];
      host.innerHTML=items.length?items.map(log=>{
        const result=String(log.result||'');
        const icon=result==='SUCCESS'?'✅':result==='WARNING'?'⚠️':'❌';
        return `<a class="gw-notify-event" href="/browser.html?view=logs"><b>${icon} ${esc(result)} — ${esc(log.platform||'')}</b><span>${esc(log.errorMessage||'عملية نشر مسجلة في النظام')}</span><small>${esc(fmt(log.timestamp))}</small></a>`;
      }).join(''):'<div class="gw-notify-empty">لا توجد نتائج نشر بعد.</div>';
    }catch(error){host.innerHTML=`<div class="gw-notify-empty">تعذر تحميل سجل النشر: ${esc(error.message||error)}</div>`}
  }

  async function refreshPanel(){
    ensurePanel();renderLocalEvents();renderLogs();
    const card=document.getElementById('gwNotifyStatusCard');if(!card)return;
    if(!supported()){
      card.innerHTML='<div class="gw-notify-status"><strong>إشعارات الهاتف</strong><span class="gw-notify-pill off">غير مدعوم</span></div><p class="gw-notify-copy">جرّبي Google Chrome حديثًا على Android.</p>';
      return;
    }
    try{
      const [status,subscription]=await Promise.all([api('/api/notifications/status'),existingSubscription()]);
      const granted=Notification.permission==='granted';
      const active=Boolean(subscription&&granted);
      const permissionLabel=Notification.permission==='granted'?'مسموح':Notification.permission==='denied'?'محظور':'لم يُطلب بعد';
      card.innerHTML=`
        <div class="gw-notify-status"><strong>إشعارات الهاتف</strong><span class="gw-notify-pill ${active?'on':Notification.permission==='denied'?'off':'wait'}">${active?'مفعّلة':Notification.permission==='denied'?'محظورة':'غير مفعّلة'}</span></div>
        <p class="gw-notify-copy">إذن Chrome: <b>${esc(permissionLabel)}</b> · الأجهزة المسجلة في النظام: <b>${esc(status.subscriptions??0)}</b></p>
        <div class="gw-notify-actions"><button class="gw-notify-btn primary" id="gwEnablePush" type="button">${active?'إعادة التحقق':'تفعيل الإشعارات'}</button><button class="gw-notify-btn" id="gwTestPush" type="button" ${active?'':'disabled'}>إرسال اختبار 🔔</button></div>`;
      card.querySelector('#gwEnablePush')?.addEventListener('click',async event=>{
        const btn=event.currentTarget;btn.disabled=true;btn.textContent='جاري التفعيل…';
        try{await enablePush()}catch(error){toast(error.message||String(error),'error');await refreshPanel()}
      });
      card.querySelector('#gwTestPush')?.addEventListener('click',async event=>{
        const btn=event.currentTarget;btn.disabled=true;btn.textContent='جاري الإرسال…';
        try{await sendTest()}catch(error){toast(error.message||String(error),'error')}finally{await refreshPanel()}
      });
      updateLauncher(active);
    }catch(error){
      card.innerHTML=`<div class="gw-notify-status"><strong>إشعارات الهاتف</strong><span class="gw-notify-pill off">تعذر الفحص</span></div><p class="gw-notify-copy">${esc(error.message||error)}</p>`;
    }
  }

  function updateLauncher(active){
    const btn=document.getElementById('notificationCenterBtn');if(!btn)return;
    btn.querySelector('.gw-notify-dot')?.remove();
    if(active){const dot=document.createElement('i');dot.className='gw-notify-dot';btn.appendChild(dot)}
  }

  function installLauncher(){
    document.getElementById('notificationBtn')?.remove();
    const top=document.querySelector('.top-actions');
    if(top&&!document.getElementById('notificationCenterBtn')){
      const btn=document.createElement('button');btn.id='notificationCenterBtn';btn.type='button';btn.className='icon-btn gw-notify-topbtn';btn.title='مركز الإشعارات';btn.setAttribute('aria-label','فتح مركز الإشعارات');btn.textContent='🔔';btn.addEventListener('click',openPanel);top.insertBefore(btn,top.firstChild);
    }
    const nav=document.getElementById('notificationLaunchBtn');
    if(nav&&nav.dataset.notificationCenterWired!=='1'){
      nav.dataset.notificationCenterWired='1';nav.addEventListener('click',event=>{event.preventDefault();openPanel()});
    }
  }

  if('serviceWorker'in navigator){
    navigator.serviceWorker.addEventListener('message',event=>{
      if(event.data?.type==='GHAITH_PUSH_RECEIVED'){
        saveLocalEvent(event.data.notification||{});
        renderLocalEvents();
      }
    });
  }

  const init=()=>{ensurePanel();installLauncher();refreshPanel().catch(()=>{});setTimeout(()=>{document.getElementById('notificationBtn')?.remove();installLauncher()},500)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
