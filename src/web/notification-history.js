(()=>{
  const DB_NAME='ghaith-web-notifications-v1';
  const STORE_NAME='events';
  const LOCAL_KEY='ghaith-web-notification-events-v1';

  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const fmt=value=>{try{return new Intl.DateTimeFormat('ar-TN',{dateStyle:'short',timeStyle:'short'}).format(new Date(value))}catch{return ''}};

  function openDb(){
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open(DB_NAME,1);
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains(STORE_NAME))db.createObjectStore(STORE_NAME,{keyPath:'id'});
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
  }

  async function storedEvents(){
    if(!('indexedDB'in window))return [];
    try{
      const db=await openDb();
      const events=await new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE_NAME,'readonly');
        const request=tx.objectStore(STORE_NAME).getAll();
        request.onsuccess=()=>resolve(Array.isArray(request.result)?request.result:[]);
        request.onerror=()=>reject(request.error);
      });
      db.close();
      return events;
    }catch{return []}
  }

  function localEvents(){
    try{const parsed=JSON.parse(localStorage.getItem(LOCAL_KEY)||'[]');return Array.isArray(parsed)?parsed:[]}
    catch{return []}
  }

  function dedupe(items){
    const seen=new Set();
    return items.filter(item=>{
      const key=item.id||`${item.tag||''}|${item.title||''}|${item.body||''}|${item.at||item.receivedAt||''}`;
      if(seen.has(key))return false;
      seen.add(key);return true;
    });
  }

  async function renderHistory(){
    const host=document.getElementById('gwNotifyEvents');
    if(!host)return;
    const persistent=await storedEvents();
    const merged=dedupe([...persistent,...localEvents()])
      .sort((a,b)=>+new Date(b.at||b.receivedAt||0)-+new Date(a.at||a.receivedAt||0))
      .slice(0,30);
    host.innerHTML=merged.length?merged.map(item=>`<a class="gw-notify-event" href="${esc(item.url||'#')}" target="${/^https?:\/\//i.test(item.url||'')?'_blank':'_self'}" rel="noopener"><b>${esc(item.title||'غيث ويب')}</b><span>${esc(item.body||'')}</span><small>${esc(fmt(item.at||item.receivedAt))}</small></a>`).join(''):'<div class="gw-notify-empty">لا توجد إشعارات مستلمة على هذا الهاتف بعد.</div>';
  }

  document.addEventListener('click',event=>{
    if(event.target?.closest?.('#notificationCenterBtn,#notificationLaunchBtn'))setTimeout(renderHistory,50);
  });
  navigator.serviceWorker?.addEventListener?.('message',event=>{
    if(event.data?.type==='GHAITH_PUSH_RECEIVED')setTimeout(renderHistory,20);
  });
  window.addEventListener('focus',()=>setTimeout(renderHistory,20));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(renderHistory,20)});

  const observer=new MutationObserver(()=>{
    const panel=document.querySelector('.gw-notify-panel.show');
    if(panel)renderHistory();
  });
  const start=()=>{observer.observe(document.body,{attributes:true,subtree:true,attributeFilter:['class']});renderHistory()};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
