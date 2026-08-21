const CACHE='ghaith-web-content-os-v12';
const STATIC=['/','/styles.css?v=12','/app.js?v=12','/notifications.js?v=12','/manifest.webmanifest','/icon.svg'];
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
self.addEventListener('push',event=>{
  let data={title:'غيث ويب',body:'لديك تحديث جديد.',url:'/',tag:'ghaith-web-content-os',icon:'/icon.svg',badge:'/icon.svg'};
  try{if(event.data)data={...data,...event.data.json()}}catch{if(event.data)data.body=event.data.text()}
  event.waitUntil(self.registration.showNotification(data.title,{body:data.body,icon:data.icon,badge:data.badge,tag:data.tag,data:{url:data.url},renotify:true}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL(event.notification.data?.url||'/',self.location.origin).href;
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const client of list){if('focus'in client){client.navigate?.(target);return client.focus()}}
    return clients.openWindow?clients.openWindow(target):undefined;
  }));
});
