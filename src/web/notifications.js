(()=>{
  const api=async(path,options={})=>{
    const response=await fetch(path,{headers:{'Content-Type':'application/json',...(options.headers||{})},...options});
    let data={};try{data=await response.json()}catch{}
    if(!response.ok)throw new Error(data.message||`HTTP ${response.status}`);
    return data;
  };
  const toUint8Array=value=>{
    const padding='='.repeat((4-value.length%4)%4);
    const base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/');
    const raw=atob(base64);const out=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
    return out;
  };
  const supported=()=>('serviceWorker'in navigator)&&('PushManager'in window)&&('Notification'in window);
  let button;
  let isEnabled=false;

  async function registration(){
    await navigator.serviceWorker.register('/sw.js');
    return navigator.serviceWorker.ready;
  }

  async function existingSubscription(){
    if(!supported())return null;
    const reg=await registration();
    return reg.pushManager.getSubscription();
  }

  function render(enabled=false,busy=false){
    isEnabled=enabled;
    if(!button)return;
    button.disabled=busy;
    button.textContent=busy?'جاري التنفيذ…':enabled?'🔔 الإشعارات مفعّلة — اختبار':'🔔 تفعيل الإشعارات';
    button.title=enabled?'اضغط لإرسال إشعار تجريبي الآن':'تفعيل إشعارات المحتوى وGoogle Drive';
  }

  async function sendTest(){
    render(true,true);
    try{
      const result=await api('/api/notifications/test',{method:'POST'});
      render(true,false);
      const delivered=Number(result.delivered||0);
      const failed=Number(result.failed||0);
      alert(delivered>0
        ? `تم إرسال إشعار تجريبي إلى جهازك ✅\nتم التسليم: ${delivered}${failed?` — فشل: ${failed}`:''}`
        : `لم يتم تسليم الإشعار التجريبي. عدد الاشتراكات: ${result.subscriptions||0}`);
    }catch(error){
      render(true,false);
      alert(`تعذر اختبار الإشعارات: ${error.message||error}`);
    }
  }

  async function enable(){
    if(isEnabled)return sendTest();
    if(!supported())return alert('هذا المتصفح لا يدعم إشعارات الويب على هذا الجهاز.');
    render(false,true);
    try{
      let permission=Notification.permission;
      if(permission==='default')permission=await Notification.requestPermission();
      if(permission!=='granted')throw new Error('يجب السماح بالإشعارات من إعدادات المتصفح.');
      const reg=await registration();
      const {publicKey}=await api('/api/notifications/public-key');
      let subscription=await reg.pushManager.getSubscription();
      if(!subscription){
        subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:toUint8Array(publicKey)});
      }
      await api('/api/notifications/subscribe',{method:'POST',body:JSON.stringify(subscription.toJSON())});
      render(true,false);
    }catch(error){
      render(false,false);
      alert(`تعذر تفعيل الإشعارات: ${error.message||error}`);
    }
  }

  async function init(){
    const host=document.querySelector('.top-actions');
    if(!host)return;
    button=document.createElement('button');
    button.id='notificationBtn';
    button.className='btn ghost notification-btn';
    button.type='button';
    button.addEventListener('click',enable);
    host.insertBefore(button,host.firstChild);
    if(!supported()){
      button.textContent='🔕 غير مدعوم';button.disabled=true;return;
    }
    try{
      const sub=Notification.permission==='granted'?await existingSubscription():null;
      render(Boolean(sub),false);
    }catch{render(false,false)}
  }

  window.addEventListener('DOMContentLoaded',init);
})();

(()=>{
  const TARGET_SITE='https://ghaith-web-content-os.vercel.app/';
  const external={
    'Google Trends':'https://trends.google.com/explore',
    'Make':'https://www.make.com/en/login',
    'Canva':'https://www.canva.com/',
    'HeyGen':'https://app.heygen.com/',
    'Google Search Console':`https://search.google.com/search-console?resource_id=${encodeURIComponent(TARGET_SITE)}`,
  };
  const testRoutes={
    'Gemini Automation':'/api/integrations/openai/test',
    'ClickUp':'/api/integrations/clickup/test',
    'Google Drive':'/api/integrations/google-drive/test',
    'Canva':'/api/integrations/canva/test',
    'HeyGen':'/api/integrations/heygen/test',
    'Remotion':'/api/integrations/remotion/test',
    'Google Search Console':'/api/integrations/search-console/test',
  };

  function notify(message,type='success'){
    if(typeof window.toast==='function')return window.toast(message,type);
    const host=document.getElementById('toastHost');
    if(!host)return alert(message);
    const el=document.createElement('div');
    el.className=`toast ${type}`;el.textContent=message;host.appendChild(el);setTimeout(()=>el.remove(),4200);
  }
  async function json(path){
    const res=await fetch(path,{cache:'no-store',headers:{Accept:'application/json'}});
    let data={};try{data=await res.json()}catch{}
    if(!res.ok)throw new Error(data.message||`HTTP ${res.status}`);
    return data;
  }
  function openExternal(url){window.open(url,'_blank','noopener,noreferrer');}

  async function runIntegration(name){
    try{
      if(name==='Google Trends'){openExternal(external[name]);return;}
      if(name==='Make'){openExternal(external[name]);return;}
      if(name==='Google Search Console'){
        const probe=await json(testRoutes[name]);
        window.__searchConsoleProbe=probe;
        if(!probe.connected)throw new Error(probe.message||'Search Console غير متصل.');
        openExternal(external[name]);return;
      }
      if(name==='Google Drive'){
        const probe=await json(testRoutes[name]);
        if(!probe.ok)throw new Error(probe.message||'Google Drive غير متصل.');
        if(probe.folderId)openExternal(`https://drive.google.com/drive/folders/${encodeURIComponent(probe.folderId)}`);
        else notify('Google Drive متصل ويعمل بنجاح.');
        return;
      }
      if(name==='ClickUp'){
        const probe=await json(testRoutes[name]);
        if(!probe.ok)throw new Error(probe.message||'ClickUp غير متصل.');
        openExternal('https://app.clickup.com/');return;
      }
      if(name==='Canva'){
        const probe=await json(testRoutes[name]);
        window.__canvaProbe=probe;
        if(!probe.ok)throw new Error(probe.message||'Canva يحتاج إعدادًا.');
        openExternal(external[name]);return;
      }
      if(name==='HeyGen'){
        openExternal(external[name]);
        notify('تم فتح HeyGen Free. الإنشاء المجاني يتم من واجهة HeyGen نفسها دون تشغيل API مدفوع.','success');
        return;
      }
      if(name==='Gemini Automation'){
        const probe=await json(testRoutes[name]);
        notify(probe.ok?`Gemini Automation جاهز${probe.model?` — ${probe.model}`:''}`:(probe.message||'Gemini غير جاهز.'),probe.ok?'success':'error');return;
      }
      if(name==='Remotion'){
        const probe=await json(testRoutes[name]);
        notify(probe.ok?'Remotion جاهز للرندر داخل Ghaith Web Content OS.':(probe.message||'Remotion غير جاهز.'),probe.ok?'success':'error');return;
      }
      if(typeof window.switchView==='function')window.switchView('integrations');
    }catch(error){notify(error.message||String(error),'error');}
  }

  function integrationName(el){
    const cardTitle=el.querySelector?.('h3')?.textContent?.trim();
    if(cardTitle)return cardTitle;
    const rowTitle=el.querySelector?.('span')?.textContent?.trim();
    return rowTitle||'';
  }
  function wire(el){
    if(!el||el.dataset.integrationWired==='1')return;
    const name=integrationName(el);if(!name)return;
    el.dataset.integrationWired='1';el.dataset.integrationName=name;
    el.classList.add('integration-clickable');el.setAttribute('role','button');el.setAttribute('tabindex','0');
    el.setAttribute('aria-label',`فتح ${name}`);
    el.addEventListener('click',event=>{
      if(event.target.closest('a,button,input,select,textarea'))return;
      runIntegration(name);
    });
    el.addEventListener('keydown',event=>{
      if(event.key==='Enter'||event.key===' '){event.preventDefault();runIntegration(name);}
    });
  }
  function wireAll(){
    document.querySelectorAll('#integrationGrid .integration-card,#integrationMini .row').forEach(wire);
  }

  let searchConsoleProbePromise=null;
  async function getSearchConsoleProbe(){
    if(window.__searchConsoleProbe)return window.__searchConsoleProbe;
    if(!searchConsoleProbePromise){
      searchConsoleProbePromise=json('/api/integrations/search-console/test')
        .then(probe=>{window.__searchConsoleProbe=probe;return probe;})
        .finally(()=>{searchConsoleProbePromise=null;});
    }
    return searchConsoleProbePromise;
  }
  async function syncSearchConsoleBadge(){
    try{
      const probe=await getSearchConsoleProbe();
      document.querySelectorAll('[data-search-console-card],[data-search-console-mini]').forEach(el=>{
        const badge=el.querySelector('.pill-on,.pill-off,.pill-manual');if(!badge)return;
        const className=probe.connected?'pill-on':'pill-off';
        const label=probe.connected?(el.hasAttribute('data-search-console-mini')?'جاهز':'متصل'):(el.hasAttribute('data-search-console-mini')?'غير مضبوط':'يحتاج إعداد');
        if(badge.className!==className)badge.className=className;
        if(badge.textContent!==label)badge.textContent=label;
      });
    }catch{}
  }

  let canvaProbePromise=null;
  async function getCanvaProbe(){
    if(window.__canvaProbe)return window.__canvaProbe;
    if(!canvaProbePromise){
      canvaProbePromise=json('/api/integrations/canva/status')
        .then(probe=>{window.__canvaProbe=probe;return probe;})
        .finally(()=>{canvaProbePromise=null;});
    }
    return canvaProbePromise;
  }
  async function syncCanvaBadge(){
    try{
      const probe=await getCanvaProbe();
      document.querySelectorAll('#integrationGrid .integration-card,#integrationMini .row').forEach(el=>{
        if(integrationName(el)!=='Canva')return;
        const badge=el.querySelector('.pill-on,.pill-off,.pill-manual');if(!badge)return;
        const mini=el.matches('#integrationMini .row');
        const connected=Boolean(probe.connected);
        const className=connected?'pill-on':'pill-off';
        const label=connected?(mini?'جاهز':'متصل'):(mini?'غير مضبوط':'يحتاج إعداد');
        if(badge.className!==className)badge.className=className;
        if(badge.textContent!==label)badge.textContent=label;
      });
    }catch{}
  }

  function syncHeyGenFreeBadge(){
    document.querySelectorAll('#integrationGrid .integration-card').forEach(card=>{
      if(integrationName(card)!=='HeyGen')return;
      const badge=card.querySelector('.pill-on,.pill-off,.pill-manual');
      if(badge){if(badge.className!=='pill-manual')badge.className='pill-manual';if(badge.textContent!=='مجاني — جاهز يدويًا')badge.textContent='مجاني — جاهز يدويًا';}
      const p=card.querySelector('p');
      const copy='حساب HeyGen المجاني جاهز للاستخدام من الواجهة. إنشاء الفيديو يتم داخل HeyGen نفسه ولا يشغّل API مدفوعًا.';
      if(p&&p.textContent!==copy)p.textContent=copy;
      card.setAttribute('aria-label','فتح HeyGen Free');
    });
    document.querySelectorAll('#integrationMini .row').forEach(row=>{
      if(integrationName(row)!=='HeyGen')return;
      const badge=row.querySelector('.pill-on,.pill-off,.pill-manual');
      if(badge){if(badge.className!=='pill-manual')badge.className='pill-manual';if(badge.textContent!=='مجاني')badge.textContent='مجاني';}
      row.setAttribute('aria-label','فتح HeyGen Free');
    });
  }

  function injectStyle(){
    if(document.getElementById('integrationInteractionStyles'))return;
    const style=document.createElement('style');style.id='integrationInteractionStyles';style.textContent=`
      #integrationGrid .integration-clickable,#integrationMini .integration-clickable{cursor:pointer;transition:transform .16s ease,box-shadow .16s ease,background-color .16s ease,border-color .16s ease;outline:none}
      #integrationGrid .integration-clickable:hover,#integrationGrid .integration-clickable:focus-visible{transform:translateY(-2px);box-shadow:0 15px 34px rgba(11,31,58,.13);border-color:#d6c59e}
      #integrationMini .row.integration-clickable{margin:0 -6px;padding:10px 6px;border-radius:10px;align-items:center}
      #integrationMini .row.integration-clickable:hover,#integrationMini .row.integration-clickable:focus-visible{background:#faf6ee}
      #integrationMini .row.integration-clickable::after{content:'‹';color:#a27b27;font-size:19px;font-weight:900;margin-inline-start:4px}
      #integrationGrid .integration-clickable::after{content:'فتح ›';display:block;margin-top:12px;color:#8a6820;font-size:11px;font-weight:900}
      .sidebar-scrim{display:none}
      @media(max-width:980px){
        .sidebar-scrim{display:block;position:fixed;inset:0;background:rgba(3,14,28,.34);backdrop-filter:blur(1px);z-index:29;opacity:0;pointer-events:none;transition:opacity .2s ease}
        .sidebar-scrim.show{opacity:1;pointer-events:auto}
        body.sidebar-open{overflow:hidden}
      }
    `;document.head.appendChild(style);
  }

  function initSidebarOutsideClose(){
    const sidebar=document.getElementById('sidebar'),menu=document.getElementById('menuBtn');if(!sidebar)return;
    let scrim=document.querySelector('.sidebar-scrim');
    if(!scrim){scrim=document.createElement('div');scrim.className='sidebar-scrim';scrim.setAttribute('aria-hidden','true');document.body.appendChild(scrim);}
    const sync=()=>{const open=sidebar.classList.contains('open')&&innerWidth<=980;scrim.classList.toggle('show',open);document.body.classList.toggle('sidebar-open',open);};
    const close=()=>{sidebar.classList.remove('open');sync();};
    new MutationObserver(sync).observe(sidebar,{attributes:true,attributeFilter:['class']});
    scrim.addEventListener('click',close);
    document.addEventListener('pointerdown',event=>{
      if(innerWidth>980||!sidebar.classList.contains('open'))return;
      if(sidebar.contains(event.target)||menu?.contains(event.target))return;
      close();
    });
    document.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
    window.addEventListener('resize',sync);sync();
  }

  window.addEventListener('DOMContentLoaded',()=>{
    injectStyle();initSidebarOutsideClose();wireAll();syncSearchConsoleBadge();syncCanvaBadge();syncHeyGenFreeBadge();
    const grid=document.getElementById('integrationGrid'),mini=document.getElementById('integrationMini');
    const observer=new MutationObserver(()=>{wireAll();syncSearchConsoleBadge();syncCanvaBadge();syncHeyGenFreeBadge();});
    if(grid)observer.observe(grid,{childList:true});
    if(mini)observer.observe(mini,{childList:true});
  });
})();