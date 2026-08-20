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