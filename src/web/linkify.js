(()=>{
  const style=document.createElement('style');
  style.textContent=`
    .asset-link-list{display:grid;gap:10px}
    .asset-link{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 13px;border:1px solid var(--line);border-radius:10px;background:#fffaf0;color:#7a5b18;text-decoration:none;font-weight:800;font-size:12px;line-height:1.4;transition:.15s}
    .asset-link:hover,.asset-link:focus{background:#fff3d8;border-color:#d7b766;outline:none;transform:translateY(-1px)}
    .asset-link small{color:var(--muted);font-weight:700;direction:ltr;max-width:42%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .asset-link-arrow{font-size:16px;color:var(--navy)}
  `;
  document.head.append(style);

  const safeHttpUrl=value=>{
    try{
      const u=new URL(String(value||'').trim());
      return ['http:','https:'].includes(u.protocol)?u:null;
    }catch{return null}
  };

  const labelFor=(url,prefix='')=>{
    const host=url.hostname.replace(/^www\./,'');
    if(host==='canva.com'||host.endsWith('.canva.com'))return 'فتح التصميم في Canva';
    if(host==='drive.google.com'||host.endsWith('.google.com'))return 'فتح الملف في Google Drive';
    if(prefix.toLowerCase().includes('video'))return 'فتح الفيديو';
    if(prefix.toLowerCase().includes('carousel'))return 'فتح الكاروسيل';
    if(prefix.toLowerCase().includes('image'))return 'فتح الصورة';
    return 'فتح المرفق';
  };

  function linkifyAssets(){
    const body=document.querySelector('#contentModalBody');
    if(!body)return;
    const section=[...body.querySelectorAll('.detail-section')].find(s=>s.querySelector('h4')?.textContent.trim()==='الأصول والروابط');
    const pre=section?.querySelector('pre');
    if(!pre||pre.dataset.linkified==='1')return;

    const lines=pre.textContent.split('\n').map(x=>x.trim()).filter(Boolean);
    const seen=new Set();
    const items=[];
    for(const line of lines){
      const match=line.match(/^(.*?):\s*(https?:\/\/\S+)$/i);
      if(!match)continue;
      const prefix=match[1].trim();
      const url=safeHttpUrl(match[2]);
      if(!url||seen.has(url.href))continue;
      seen.add(url.href);
      items.push({prefix,url});
    }
    if(!items.length)return;

    const wrap=document.createElement('div');
    wrap.className='asset-link-list';
    items.forEach(({prefix,url})=>{
      const a=document.createElement('a');
      a.className='asset-link';
      a.href=url.href;
      a.target='_blank';
      a.rel='noopener';
      a.innerHTML=`<span>${labelFor(url,prefix)}</span><small>${prefix||url.hostname}</small><span class="asset-link-arrow" aria-hidden="true">↗</span>`;
      wrap.append(a);
    });
    pre.dataset.linkified='1';
    pre.replaceWith(wrap);
  }

  const body=document.querySelector('#contentModalBody');
  if(body)new MutationObserver(linkifyAssets).observe(body,{childList:true,subtree:true});
  document.addEventListener('click',()=>setTimeout(linkifyAssets,0),true);
  linkifyAssets();
})();
