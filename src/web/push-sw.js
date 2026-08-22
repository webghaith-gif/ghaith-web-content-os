const DEFAULT_ICON='/icon.svg';

function sameOriginTarget(rawUrl, clientsList){
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
    await self.registration.showNotification(data.title,{
      body:data.body,
      icon:data.icon||DEFAULT_ICON,
      badge:data.badge||DEFAULT_ICON,
      tag:data.tag||'ghaith-web-content-os',
      data:{url:data.url||'/',receivedAt:new Date().toISOString()},
      renotify:true,
      requireInteraction:false,
    });
    try{
      const windows=await clients.matchAll({type:'window',includeUncontrolled:true});
      await Promise.all(windows.map(client=>client.postMessage({type:'GHAITH_PUSH_RECEIVED',notification:data})));
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

    for(const client of windows){
      try{
        const current=new URL(client.url);
        const sameApp=targetUrl.origin===current.origin && (
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
