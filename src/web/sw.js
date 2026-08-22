const CACHE='ghaith-web-content-os-v17';
const STATIC=['/','/styles.css?v=12','/app.js?v=12','/notifications.js?v=12','/manifest.webmanifest','/icon.svg'];
const DEFAULT_ICON='/icon.svg';
const HISTORY_DB='ghaith-web-notifications-v1';
const HISTORY_STORE='events';

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await Promise.all(STATIC.map(async url=>{
      try{
        const response=await fetch(url,{cache:'no-cache'});
        if(response.ok)await cache.put(url,response.clone());
      }catch{}
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>event.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())
));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).pathname.startsWith('/api/'))return;
  event.respondWith(fetch(event.request).then(response=>{
    const copy=response.clone();
    caches.open(CACHE).then(cache=>cache.put(event.request,copy));
    return response;
  }).catch(()=>caches.match(event.request)));
});

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
    const item={
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
      tx.objectStore(HISTORY_STORE).put(item);
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error);
      tx.onabort=()=>reject(tx.error);
    });
    db.close();
    return item;
  }catch{return null}
}

function preferredTarget(rawUrl,windows){
  const origin=self.location.origin;
  let requested;
  try{requested=new URL(rawUrl||'/',origin)}catch{requested=new URL('/',origin)}
  if(requested.origin!==origin)return requested.href;

  const query=requested.search||'';
  const hash=requested.hash||'';
  const hasStandalone=windows.some(client=>{try{return new URL(client.url).pathname==='/app-standalone.html'}catch{return false}});
  const hasBrowser=windows.some(client=>{try{return new URL(client.url).pathname==='/browser.html'}catch{return false}});
  if(hasStandalone)return `${origin}/app-standalone.html${query}${hash}`;
  if(hasBrowser)return `${origin}/browser.html${query}${hash}`;
  if(requested.pathname==='/app-standalone.html')return requested.href;
  return `${origin}/browser.html${query}${hash}`;
}

self.addEventListener('push',event=>{
  let data={title:'غيث ويب',body:'لديك تحديث جديد.',url:'/',tag:'ghaith-web-content-os',icon:DEFAULT_ICON,badge:DEFAULT_ICON};
  try{if(event.data)data={...data,...event.data.json()}}catch{if(event.data)data.body=event.data.text()}
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
    const target=preferredTarget(event.notification.data?.url||'/',windows);
    let targetUrl;
    try{targetUrl=new URL(target)}catch{return}

    if(targetUrl.origin!==self.location.origin){
      return clients.openWindow?clients.openWindow(targetUrl.href):undefined;
    }

    for(const client of windows){
      try{
        const current=new URL(client.url);
        const sameSurface=targetUrl.origin===current.origin&&targetUrl.pathname===current.pathname;
        if(sameSurface){
          if('navigate'in client)await client.navigate(targetUrl.href);
          if('focus'in client)return client.focus();
        }
      }catch{}
    }
    return clients.openWindow?clients.openWindow(targetUrl.href):undefined;
  })());
});
