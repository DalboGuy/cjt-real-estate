(function(){
  const notice=document.getElementById('moduleNotice');
  const cards=document.getElementById('feedCards');
  const envWrap=document.getElementById('envFeeds');
  const pill=document.getElementById('feedStatusPill');
  const liveProbe=document.getElementById('liveProbe');
  const addForm=document.getElementById('addFeedForm');
  const addBtn=document.getElementById('addFeedBtn');
  let maxOwner=10;

  function showNotice(text,ms=4000){
    if(!notice)return;
    notice.textContent=text;
    notice.classList.remove('hidden');
    setTimeout(()=>notice.classList.add('hidden'),ms);
  }

  function render(data){
    maxOwner=data.maxOwnerCalendars||10;
    const ownerCount=data.ownerCount||(data.feeds||[]).length;
    if(pill)pill.textContent=`${ownerCount} / ${maxOwner} connected`;
    if(addBtn)addBtn.disabled=ownerCount>=maxOwner;

    if(liveProbe){
      const rows=(data.liveSources||[]).map(s=>`<div class="list-row"><div><strong>${s.name}</strong><span>${s.ok?`${s.count||0} blocked nights`:(s.error||'unavailable')}</span></div><span class="badge ${s.ok?'good':'warn'}">${s.ok?'OK':'Issue'}</span></div>`).join('')||'<div class="empty">No live probe yet.</div>';
      liveProbe.innerHTML=`<div class="list">${rows}</div><div class="meta" style="margin-top:10px">Checked ${data.checkedAt?new Date(data.checkedAt).toLocaleString():'—'}</div>`;
    }

    if(cards){
      const feeds=data.feeds||[];
      cards.innerHTML=feeds.length?feeds.map(feed=>`<article class="card span-4" data-id="${feed.id}">
        <div class="card-head"><div><h3>${feed.label}</h3><p>${feed.hostHint||'saved'} · owner</p></div><span class="badge good">Connected</span></div>
        <div class="metric-label">Full iCal URL is stored server-side only.</div>
        <div style="margin-top:12px"><button class="btn btn-secondary remove-feed" type="button">Remove</button></div>
      </article>`).join(''):`<article class="card span-12"><div class="empty">No owner calendars yet. Add up to ${maxOwner} above.</div></article>`;
    }

    if(envWrap){
      const envFeeds=data.envFeeds||[];
      envWrap.innerHTML=envFeeds.length?`<article class="card span-12"><div class="card-head"><div><h3>Also reading from Vercel env</h3><p>These stay as a fallback / extra sources.</p></div></div><div class="list">${envFeeds.map(f=>`<div class="list-row"><div><strong>${f.name}</strong><span>${f.hostHint||'env'}</span></div><span class="badge">Env</span></div>`).join('')}</div></article>`:'';
    }
  }

  async function load(){
    try{
      const r=await fetch('/api/owner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'calendar_feeds_status'})});
      const d=await r.json().catch(()=>({}));
      if(r.status===401)return;
      if(!r.ok)throw new Error(d.message||d.error||'Could not load calendar connections');
      render(d);
    }catch(e){showNotice(e.message||'Load failed');}
  }

  addForm?.addEventListener('submit',async e=>{
    e.preventDefault();
    const label=document.getElementById('feedLabel')?.value||'';
    const feedUrl=document.getElementById('feedUrl')?.value||'';
    if(addBtn)addBtn.disabled=true;
    try{
      const r=await fetch('/api/owner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'calendar_feeds_save',label,feedUrl})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.message||d.error||'Save failed');
      showNotice('Calendar added');
      addForm.reset();
      await load();
    }catch(err){showNotice(err.message||'Save failed'); if(addBtn)addBtn.disabled=false;}
  });

  cards?.addEventListener('click',async e=>{
    const btn=e.target.closest('.remove-feed');
    if(!btn)return;
    const id=Number(btn.closest('[data-id]')?.getAttribute('data-id'));
    btn.disabled=true;
    try{
      const r=await fetch('/api/owner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'calendar_feeds_clear',id})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.message||d.error||'Remove failed');
      showNotice('Calendar removed');
      await load();
    }catch(err){showNotice(err.message||'Remove failed'); btn.disabled=false;}
  });

  document.getElementById('refreshFeeds')?.addEventListener('click',load);
  const boot=()=>{if(!document.getElementById('ownerApp')?.classList.contains('hidden'))load();};
  setTimeout(boot,400);
  setTimeout(boot,1200);
})();
