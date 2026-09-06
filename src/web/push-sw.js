const DEFAULT_ICON='/icon.svg';
const HISTORY_DB='ghaith-web-notifications-v1';
const HISTORY_STORE='events';

function openHistoryDb(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(HISTORY_DB,1);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(HISTORY_STORE))db.createObjectStore(HISTORY_STORE,{keyPath:'id'});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}

async function savePushEvent(data){
  try{
    const db=await openHistoryDb();
    const receivedAt=new Date().toISOString();
    const event={
      id:`${data.tag||'ghaith'}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      tag:data.tag||'ghaith-web-content-os',
      title:data.title||'غيث ويب',
      body:data.body||'',
      url:data.url||'/',
      at:receivedAt,
      receivedAt,
    };
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(HISTORY_STORE,'readwrite');
      tx.objectStore(HISTORY_STORE).put(event);
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error);
      tx.onabort=()=>reject(tx.error);
    });
    db.close();
    return event;
  }catch{return null}
}

function sameOriginTarget(rawUrl,clientsList){
  const origin=self.location.origin;
  let target;
  try{target=new URL(rawUrl||'/',origin)}catch{target=new URL('/',origin)}
  if(target.origin!==origin)return target.href;

  const appClient=clientsList.find(client=>{
    try{return new URL(client.url).pathname==='/app-standalone.html'}catch{return false}
  });
  const browserClient=clientsList.find(client=>{
    try{return new URL(client.url).pathname==='/browser.html'}catch{return false}
  });

  const query=target.search||'';
  const hash=target.hash||'';
  if(appClient)return `${origin}/app-standalone.html${query}${hash}`;
  if(browserClient)return `${origin}/browser.html${query}${hash}`;
  return `${origin}/browser.html${query}${hash}`;
}

self.addEventListener('push',event=>{
  let data={
    title:'غيث ويب',
    body:'لديك تحديث جديد.',
    url:'/',
    tag:'ghaith-web-content-os',
    icon:DEFAULT_ICON,
    badge:DEFAULT_ICON,
  };
  try{if(event.data)data={...data,...event.data.json()}}
  catch{if(event.data)data.body=event.data.text()}

  event.waitUntil((async()=>{
    const stored=await savePushEvent(data);
    const receivedAt=stored?.receivedAt||new Date().toISOString();
    await self.registration.showNotification(data.title,{
      body:data.body,
      icon:data.icon||DEFAULT_ICON,
      badge:data.badge||DEFAULT_ICON,
      tag:data.tag||'ghaith-web-content-os',
      data:{url:data.url||'/',receivedAt},
      renotify:true,
      requireInteraction:false,
    });
    try{
      const windows=await clients.matchAll({type:'window',includeUncontrolled:true});
      await Promise.all(windows.map(client=>client.postMessage({type:'GHAITH_PUSH_RECEIVED',notification:{...data,receivedAt}})));
    }catch{}
  })());
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const windows=await clients.matchAll({type:'window',includeUncontrolled:true});
    const target=sameOriginTarget(event.notification.data?.url||'/',windows);
    let targetUrl;
    try{targetUrl=new URL(target)}catch{return}

    if(targetUrl.origin!==self.location.origin){
      if(clients.openWindow)return clients.openWindow(targetUrl.href);
      return;
    }

    for(const client of windows){
      try{
        const current=new URL(client.url);
        const sameApp=targetUrl.origin===current.origin&&(
          (targetUrl.pathname==='/app-standalone.html'&&current.pathname==='/app-standalone.html')||
          (targetUrl.pathname==='/browser.html'&&current.pathname==='/browser.html')
        );
        if(sameApp){
          if('navigate'in client)await client.navigate(targetUrl.href);
          if('focus'in client)return client.focus();
        }
      }catch{}
    }
    if(clients.openWindow)return clients.openWindow(targetUrl.href);
  })());
});
