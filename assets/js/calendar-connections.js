(function(){
  const notice=document.getElementById('moduleNotice');
  const cards=document.getElementById('feedCards');
  const pill=document.getElementById('feedStatusPill');
  const liveProbe=document.getElementById('liveProbe');
  const LABELS={airbnb:'Airbnb',vrbo:'VRBO','booking.com':'Booking.com'};

  function showNotice(text,ms=4000){
    if(!notice)return;
    notice.textContent=text;
    notice.classList.remove('hidden');
    setTimeout(()=>notice.classList.add('hidden'),ms);
  }

  function badgeFor(feed,live){
    if(live?.ok) return '<span class="badge good">Reading</span>';
    if(feed.configured) return `<span class="badge warn">${live?.error||'Needs check'}</span>`;
    return feed.required?'<span class="badge warn">Required</span>':'<span class="badge">Optional</span>';
  }

  function render(data){
    const liveBy=Object.fromEntries((data.liveSources||[]).map(s=>[s.name,s]));
    const configured=(data.feeds||[]).filter(f=>f.configured).length;
    if(pill)pill.textContent=`${configured} connected`;
    if(liveProbe){
      const rows=(data.liveSources||[]).map(s=>`<div class="list-row"><div><strong>${LABELS[s.name]||s.name}</strong><span>${s.ok?`${s.count||0} blocked nights`:(s.error||'unavailable')}</span></div><span class="badge ${s.ok?'good':'warn'}">${s.ok?'OK':'Issue'}</span></div>`).join('')||'<div class="empty">No live probe yet.</div>';
      liveProbe.innerHTML=`<div class="list">${rows}</div><div class="meta" style="margin-top:10px">Checked ${data.checkedAt?new Date(data.checkedAt).toLocaleString():'—'}</div>`;
    }
    if(!cards)return;
    cards.innerHTML=(data.feeds||[]).map(feed=>{
      const live=liveBy[feed.source];
      const label=LABELS[feed.source]||feed.source;
      return `<article class="card span-4" data-source="${feed.source}">
        <div class="card-head"><div><h3>${label}</h3><p>${feed.required?'Required for guest availability':'Optional third feed'}</p></div>${badgeFor(feed,live)}</div>
        <div class="metric-label">${feed.configured?`Connected via ${feed.origin||'saved'} · ${feed.hostHint||'host hidden'}`:'Not connected yet'}</div>
        <form class="feed-form" style="margin-top:12px;display:grid;gap:10px">
          <label style="display:grid;gap:6px;font-weight:600"><span>iCal URL</span><input name="feedUrl" type="url" inputmode="url" placeholder="https://…" autocomplete="off" style="width:100%"></label>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary" type="submit">Save connection</button>
            <button class="btn btn-secondary clear-feed" type="button" ${feed.origin==='owner'?'':'disabled'}>Clear saved</button>
          </div>
        </form>
      </article>`;
    }).join('');
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

  cards?.addEventListener('submit',async e=>{
    const form=e.target.closest('.feed-form');
    if(!form)return;
    e.preventDefault();
    const card=form.closest('[data-source]');
    const source=card?.getAttribute('data-source');
    const feedUrl=new FormData(form).get('feedUrl');
    const btn=form.querySelector('button[type="submit"]');
    if(btn)btn.disabled=true;
    try{
      const r=await fetch('/api/owner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'calendar_feeds_save',source,feedUrl})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.message||d.error||'Save failed');
      showNotice(`${source} connection saved`);
      form.reset();
      await load();
    }catch(err){showNotice(err.message||'Save failed');}
    finally{if(btn)btn.disabled=false;}
  });

  cards?.addEventListener('click',async e=>{
    const btn=e.target.closest('.clear-feed');
    if(!btn)return;
    const card=btn.closest('[data-source]');
    const source=card?.getAttribute('data-source');
    btn.disabled=true;
    try{
      const r=await fetch('/api/owner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'calendar_feeds_clear',source})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.message||d.error||'Clear failed');
      showNotice(d.stillConfigured?`${source} owner URL cleared (env still connected)`:`${source} cleared`);
      await load();
    }catch(err){showNotice(err.message||'Clear failed');}
    finally{btn.disabled=false;}
  });

  document.getElementById('refreshFeeds')?.addEventListener('click',load);
  // Wait for static-auth to reveal app, then load.
  const boot=()=>{if(!document.getElementById('ownerApp')?.classList.contains('hidden'))load();};
  setTimeout(boot,400);
  setTimeout(boot,1200);
})();
