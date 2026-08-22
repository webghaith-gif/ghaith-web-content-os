(()=>{
  const qs=(selector,parent=document)=>parent?.querySelector?.(selector)||null;
  let productHistorySeen=false;
  let notificationHistorySeen=false;

  function setMainHistoryButtons({back,forward}={}){
    const backBtn=qs('#navBackBtn');
    const forwardBtn=qs('#navForwardBtn');
    if(backBtn&&typeof back==='boolean')backBtn.disabled=!back;
    if(forwardBtn&&typeof forward==='boolean')forwardBtn.disabled=!forward;
  }

  function productModeActive(){
    return qs('#view-products')?.classList.contains('active')||new URL(location.href).searchParams.get('product')==='1';
  }

  function syncProductHistoryButtons(){
    if(!productModeActive())return;
    productHistorySeen=true;
    setMainHistoryButtons({back:history.length>1,forward:false});
  }

  function ensureNotificationNavigation(){
    const head=qs('.gw-notify-head');
    if(!head||qs('.gw-notify-nav',head))return;

    const controls=document.createElement('div');
    controls.className='gw-notify-nav';
    controls.setAttribute('role','group');
    controls.setAttribute('aria-label','التنقل بين الصفحات');
    controls.innerHTML=`
      <button class="gw-notify-nav-btn" type="button" data-gw-notify-nav="back" aria-label="الرجوع" title="رجوع">→</button>
      <button class="gw-notify-nav-btn" type="button" data-gw-notify-nav="forward" aria-label="التقدم" title="تقدّم">←</button>`;

    const close=qs('.gw-notify-close',head);
    if(close)head.insertBefore(controls,close);
    else head.appendChild(controls);

    qs('[data-gw-notify-nav="back"]',controls)?.addEventListener('click',()=>history.back());
    qs('[data-gw-notify-nav="forward"]',controls)?.addEventListener('click',()=>history.forward());
  }

  function ensureHardeningStyles(){
    if(qs('#ghaithUiHardeningStyles'))return;
    const style=document.createElement('style');
    style.id='ghaithUiHardeningStyles';
    style.textContent=`
      .gw-notify-head{gap:10px}
      .gw-notify-head>div:first-child{min-width:0;flex:1}
      .gw-notify-nav{display:flex;align-items:center;gap:6px;direction:rtl}
      .gw-notify-nav-btn{width:38px;height:38px;border:1px solid #e3dbcf;background:#fff;border-radius:12px;color:#0b1f3a;font:inherit;font-size:18px;font-weight:900;cursor:pointer;display:grid;place-items:center}
      .gw-notify-nav-btn:hover,.gw-notify-nav-btn:focus-visible{border-color:#cdbb8d;background:#fff8e8;outline:none}
      .gw-notify-nav-btn:disabled{opacity:.42;cursor:not-allowed}
      @media(max-width:430px){.gw-notify-head{padding-inline:12px}.gw-notify-head h3{font-size:17px}.gw-notify-nav-btn,.gw-notify-close{width:36px;height:36px}}
    `;
    document.head.appendChild(style);
  }

  function pushNotificationHistoryState(){
    const panel=qs('.gw-notify-panel');
    if(!panel?.classList.contains('show'))return;
    const url=new URL(location.href);
    if(url.searchParams.get('notifications')==='1')return;
    url.searchParams.set('notifications','1');
    history.pushState({...history.state,notifications:true},'',url);
    notificationHistorySeen=true;
    setMainHistoryButtons({back:true,forward:false});
  }

  function closeNotificationPanelSilently(){
    qs('.gw-notify-panel')?.classList.remove('show');
    qs('.gw-notify-backdrop')?.classList.remove('show');
    document.body.style.overflow='';
  }

  function reopenNotificationPanel(){
    const panel=qs('.gw-notify-panel');
    if(panel?.classList.contains('show'))return;
    const launcher=qs('#notificationCenterBtn')||qs('#notificationLaunchBtn');
    launcher?.click();
  }

  function auditKnownNavigationControls(){
    const required=[
      '#menuBtn','#sidebarCloseBtn','#refreshBtn','#navBackBtn','#navForwardBtn',
      '[data-view="dashboard"]','[data-view="reports"]','[data-view="opportunities"]','[data-view="content"]',
      '#productsNavBtn','[data-view="logs"]','[data-view="integrations"]','#notificationLaunchBtn',
      '#productsQuickBtn','#productsFlowBtn','#productsReviewFlowBtn'
    ];
    const missing=required.filter(selector=>!qs(selector));
    if(missing.length)console.warn('Ghaith Web UI audit: missing navigation controls',missing);
  }

  document.addEventListener('click',event=>{
    const notificationLauncher=event.target.closest?.('#notificationCenterBtn,#notificationLaunchBtn');
    if(notificationLauncher){
      setTimeout(()=>{
        ensureNotificationNavigation();
        pushNotificationHistoryState();
      },0);
      return;
    }

    const productLauncher=event.target.closest?.('#productsNavBtn,#productsQuickBtn,#productsFlowBtn,#productsReviewFlowBtn');
    if(productLauncher){
      setTimeout(syncProductHistoryButtons,0);
      return;
    }

    const normalNavigation=event.target.closest?.('[data-view],[data-view-link]');
    if(normalNavigation&&!normalNavigation.matches('#productsNavBtn,#productsQuickBtn,#productsFlowBtn,#productsReviewFlowBtn')){
      productHistorySeen=false;
      notificationHistorySeen=false;
    }
  });

  document.addEventListener('click',event=>{
    const closing=event.target.closest?.('.gw-notify-close,.gw-notify-backdrop');
    if(!closing)return;
    const url=new URL(location.href);
    if(url.searchParams.get('notifications')!=='1')return;
    event.preventDefault();
    event.stopImmediatePropagation();
    history.back();
  },true);

  window.addEventListener('popstate',()=>{
    setTimeout(()=>{
      const url=new URL(location.href);
      if(url.searchParams.get('notifications')==='1'){
        notificationHistorySeen=true;
        ensureNotificationNavigation();
        reopenNotificationPanel();
        setMainHistoryButtons({back:history.length>1,forward:false});
      }else{
        closeNotificationPanelSilently();
        if(notificationHistorySeen)setMainHistoryButtons({forward:true});
      }

      if(url.searchParams.get('product')==='1'||qs('#view-products')?.classList.contains('active')){
        syncProductHistoryButtons();
      }else if(productHistorySeen){
        setMainHistoryButtons({forward:true});
      }
    },0);
  });

  const observer=new MutationObserver(()=>{
    ensureNotificationNavigation();
    syncProductHistoryButtons();
  });

  const init=()=>{
    ensureHardeningStyles();
    auditKnownNavigationControls();
    ensureNotificationNavigation();
    syncProductHistoryButtons();
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
