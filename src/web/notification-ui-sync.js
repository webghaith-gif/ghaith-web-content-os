(()=>{
  const STATUS_URL='/api/notifications/status';
  let syncing=false;
  let lastSync=0;
  let statusObserver=null;

  const number=value=>Number.isFinite(Number(value))?Number(value):0;

  function closeLegacyModal(){
    document.getElementById('modalBackdrop')?.classList.remove('show');
    document.querySelectorAll('.modal.show').forEach(modal=>{
      modal.classList.remove('show');
      modal.setAttribute('aria-hidden','true');
    });
    document.body.classList.remove('modal-open');
  }

  function openNotificationCenter(){
    closeLegacyModal();
    const button=document.getElementById('notificationCenterBtn');
    if(button){button.click();return;}
    setTimeout(()=>document.getElementById('notificationCenterBtn')?.click(),250);
  }

  function updateSummary(){
    const cards=[...document.querySelectorAll('#integrationGrid .integration-card')];
    if(!cards.length)return;
    const count=tone=>cards.filter(card=>card.classList.contains(`integration-${tone}`)).length;
    const values={on:count('on'),manual:count('manual'),off:count('off')};
    for(const [tone,value] of Object.entries(values)){
      const chip=document.querySelector(`#integrationSummary [data-filter-integrations="${tone}"] b`);
      if(chip)chip.textContent=String(value);
    }
  }

  function applyStatus(status){
    const subscriptions=number(status?.subscriptions);
    const active=subscriptions>0;
    const tone=active?'on':'manual';
    const label=active?'مفعّلة':'غير مفعلة على الجهاز';
    const detail=active?`${subscriptions} اشتراك`:'اضغط للتفعيل';

    document.querySelectorAll('[data-integration="notifications"]').forEach(element=>{
      if(element.classList.contains('integration-card')){
        element.classList.remove('integration-on','integration-manual','integration-off');
        element.classList.add(`integration-${tone}`);
      }
      const pill=element.querySelector('.pill-on,.pill-manual,.pill-off');
      if(pill){
        pill.className=`pill-${tone}`;
        pill.textContent=label;
      }
      const small=element.querySelector('small');
      if(small)small.textContent=detail;
    });

    const title=document.getElementById('integrationModalTitle');
    if(title?.textContent?.trim()==='Notifications'){
      const meta=document.getElementById('integrationModalMeta');
      if(meta)meta.textContent=label;
      const pre=document.querySelector('#integrationModalBody pre');
      if(pre)pre.textContent=`الاشتراكات: ${subscriptions}`;
      const action=document.querySelector('#integrationModalBody [data-run-integration="notifications"]');
      if(action)action.textContent=active?'فتح مركز الإشعارات':'تفعيل الإشعارات';
    }

    updateSummary();
    window.dispatchEvent(new CustomEvent('ghaith:notification-status',{detail:{...status,subscriptions,active}}));
  }

  async function syncStatus(force=false){
    const now=Date.now();
    if(syncing||(!force&&now-lastSync<2000))return;
    syncing=true;
    try{
      const response=await fetch(STATUS_URL,{cache:'no-store',headers:{Accept:'application/json'}});
      if(!response.ok)return;
      const status=await response.json();
      lastSync=Date.now();
      applyStatus(status);
    }catch{}finally{syncing=false}
  }

  function watchNotificationCenter(){
    const card=document.getElementById('gwNotifyStatusCard');
    if(!card){setTimeout(watchNotificationCenter,350);return;}
    if(statusObserver)statusObserver.disconnect();
    statusObserver=new MutationObserver(()=>syncStatus(true));
    statusObserver.observe(card,{childList:true,subtree:true,characterData:true});
  }

  document.addEventListener('click',event=>{
    const target=event.target.closest?.('[data-integration="notifications"],[data-run-integration="notifications"]');
    if(!target)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openNotificationCenter();
  },true);

  const init=()=>{
    syncStatus(true);
    watchNotificationCenter();
    window.addEventListener('focus',()=>syncStatus());
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')syncStatus()});
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
