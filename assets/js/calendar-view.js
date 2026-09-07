(function(){
  const CHANNELS=[
    ['direct','Direct','swatch-direct'],
    ['airbnb','Airbnb','swatch-airbnb'],
    ['vrbo','VRBO','swatch-vrbo'],
    ['booking.com','Booking.com','swatch-booking'],
    ['owner_stay','Owner stay','swatch-owner'],
    ['manual_block','Manual block','swatch-manual'],
    ['prep','Prep / turnover','swatch-prep'],
    ['other','Unknown / Other','swatch-other']
  ];
  const DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  let snapshot=null;
  let view='month';
  let year=null;
  let month=null;
  let focusDate=null;
  let channelFilter='all';
  let statusFilter='all';
  let savingSettings=false;

  const noticeEl=document.getElementById('moduleNotice');
  const mount=document.getElementById('calendarMount');
  const drawer=document.getElementById('nightDrawer');
  const drawerBackdrop=document.getElementById('drawerBackdrop');
  const drawerBody=document.getElementById('drawerBody');

  function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function showNotice(text,ms=4500){
    if(!noticeEl)return;
    noticeEl.textContent=text;
    noticeEl.classList.remove('hidden');
    setTimeout(()=>noticeEl.classList.add('hidden'),ms);
  }
  function pad(n){return String(n).padStart(2,'0');}
  function addDays(iso,n){
    const d=new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate()+n);
    return d.toISOString().slice(0,10);
  }
  function fmt(iso){
    if(!iso)return '—';
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
  }
  function monthTitle(y,m){
    return new Date(Date.UTC(y,m-1,1)).toLocaleDateString('en-US',{month:'long',year:'numeric',timeZone:'UTC'});
  }

  async function ownerApi(action,payload={}){
    const r=await fetch('/api/owner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...payload})});
    const d=await r.json().catch(()=>({}));
    if(r.status===401) throw new Error('unauthorized');
    if(!r.ok) throw new Error(d.message||d.error||'owner_request_failed');
    return d;
  }

  function settingsFromForm(){
    return {
      prepBufferEnabled:document.getElementById('prepBuffer')?.checked===true,
      showGuestNames:document.getElementById('showGuestNames')?.checked!==false,
      showGuestContact:document.getElementById('showGuestContact')?.checked===true
    };
  }

  function applySettings(settings){
    if(!settings)return;
    const names=document.getElementById('showGuestNames');
    const contact=document.getElementById('showGuestContact');
    const prep=document.getElementById('prepBuffer');
    if(names) names.checked=settings.showGuestNames!==false;
    if(contact) contact.checked=settings.showGuestContact===true;
    if(prep) prep.checked=settings.prepBufferEnabled===true;
  }

  function guestLabel(ev){
    const settings=snapshot?.settings||settingsFromForm();
    if(ev.guestName){
      if(settings.showGuestNames===false) return 'Guest';
      return ev.guestName;
    }
    if(ev.summary&&ev.summary!==ev.label) return ev.summary;
    return '';
  }

  function eventVisible(ev){
    if(channelFilter!=='all'&&ev.channel!==channelFilter) return false;
    if(statusFilter!=='all'&&ev.statusBucket!==statusFilter) return false;
    return true;
  }

  function eventsById(){
    const map=new Map();
    (snapshot?.events||[]).forEach(ev=>map.set(ev.id,ev));
    return map;
  }

  function renderLegend(){
    const el=document.getElementById('calendarLegend');
    if(!el)return;
    el.innerHTML=CHANNELS.map(([id,label,swatch])=>`<span><i class="cal-swatch ${swatch}"></i>${esc(label)}</span>`).join('')+'<span>CI / CO markers show check-in and check-out days (iCal end dates are exclusive).</span>';
  }

  function renderFilters(){
    const channelEl=document.getElementById('channelFilters');
    const statusEl=document.getElementById('statusFilters');
    const channels=[['all','All channels'],...CHANNELS.map(([id,label])=>[id,label])];
    const statuses=[['all','All statuses'],['hold','Hold'],['confirmed','Confirmed'],['cancelled','Cancelled']];
    if(channelEl){
      channelEl.innerHTML=channels.map(([id,label])=>`<button class="filter-btn ${channelFilter===id?'active':''}" data-channel="${id}" type="button">${esc(label)}</button>`).join('');
      channelEl.querySelectorAll('[data-channel]').forEach(btn=>btn.onclick=()=>{channelFilter=btn.dataset.channel;render();});
    }
    if(statusEl){
      statusEl.innerHTML=statuses.map(([id,label])=>`<button class="filter-btn ${statusFilter===id?'active':''}" data-status="${id}" type="button">${esc(label)}</button>`).join('');
      statusEl.querySelectorAll('[data-status]').forEach(btn=>btn.onclick=()=>{statusFilter=btn.dataset.status;render();});
    }
  }

  function renderOccupancy(){
    const el=document.getElementById('occupancyStrip');
    if(!el||!snapshot)return;
    const viewed=snapshot.occupancy.viewedMonth;
    const next30=snapshot.occupancy.next30;
    const next90=snapshot.occupancy.next90;
    const thisMonth=snapshot.range.year===Number(snapshot.range.today.slice(0,4))&&snapshot.range.month===Number(snapshot.range.today.slice(5,7));
    const cards=[
      [thisMonth?'This month':'Viewed month', `${viewed.pct}%`, `${viewed.booked} of ${viewed.total} nights booked (guest occupancy)`],
      ['Next 30 days', `${next30.pct}%`, `${next30.booked} of ${next30.total} nights`],
      ['Next 90 days', `${next90.pct}%`, `${next90.booked} of ${next90.total} nights`]
    ];
    el.innerHTML=cards.map(c=>`<div class="summary-card"><span>${esc(c[0])}</span><b>${esc(c[1])}</b><span>${esc(c[2])}</span></div>`).join('');
  }

  function sourceLabel(s){
    if(s.duplicateOf) return `${s.label||s.name} · same URL as ${s.duplicateOf}`;
    if(s.origin==='env') return `${s.label||s.name} · env`;
    if(s.origin==='owner') return `${s.label||s.name} · imported`;
    return s.label||s.name;
  }

  function renderSync(){
    const el=document.getElementById('syncStrip');
    const pill=document.getElementById('viewStatusPill');
    if(!el||!snapshot)return;
    const sources=snapshot.sync.sources||[];
    const checked=snapshot.sync.checkedAt?new Date(snapshot.sync.checkedAt).toLocaleString():'—';
    if(pill) pill.textContent=snapshot.sync.configError?'Feeds missing':`${sources.filter(s=>s.ok!==false).length} sources · ${checked}`;
    if(!sources.length){
      el.innerHTML='<span class="cal-sync-chip fail"><i></i>No iCal sources yet. Guest booking stays fail-closed until a feed is connected.</span>';
      return;
    }
    el.innerHTML=sources.map(s=>{
      const cls=s.duplicateOf?'dup':(s.ok===false?'fail':'ok');
      const detail=s.ok===false?(s.error||'failed'):(s.skipped?'deduped':`${s.count||0} nights`);
      return `<span class="cal-sync-chip ${cls}"><i></i>${esc(sourceLabel(s))} · ${esc(detail)}</span>`;
    }).join('');
  }

  function renderConflicts(){
    const el=document.getElementById('conflictBanner');
    if(!el||!snapshot)return;
    const rows=(snapshot.conflicts||[]).filter(c=>{
      const night=snapshot.nights[c.date];
      if(!night) return false;
      const ids=night.eventIds||[];
      const map=eventsById();
      return ids.some(id=>eventVisible(map.get(id)||{}));
    });
    if(!rows.length){el.classList.add('hidden');el.textContent='';return;}
    el.classList.remove('hidden');
    el.textContent=`${rows.length} overlapping night${rows.length===1?'':'s'} — two sources claim the same date. ${rows.slice(0,6).map(r=>r.date).join(', ')}${rows.length>6?'…':''}`;
  }

  function nightEvents(date){
    const night=snapshot?.nights?.[date];
    const map=eventsById();
    const ids=new Set([...(night?.eventIds||[]),...(night?.checkouts||[])]);
    return [...ids].map(id=>map.get(id)).filter(Boolean).filter(eventVisible);
  }

  function renderGrid(){
    if(!mount||!snapshot)return;
    const y=snapshot.range.year;
    const m=snapshot.range.month;
    const today=snapshot.range.today;
    document.getElementById('calTitle').textContent=view==='week'?`Week of ${fmt(snapshot.range.weekStart)}`:monthTitle(y,m);
    document.getElementById('viewMonth')?.classList.toggle('active',view==='month');
    document.getElementById('viewWeek')?.classList.toggle('active',view==='week');

    const start=view==='week'?snapshot.range.weekStart:`${y}-${pad(m)}-01`;
    const leading=view==='week'?0:new Date(`${start}T00:00:00Z`).getUTCDay();
    const gridStart=addDays(start,-leading);
    const cells=view==='week'?7:42;
    const map=eventsById();
    let visibleCount=0;

    const dow=document.createElement('div');
    dow.className='cal-dow';
    DOW.forEach(d=>{const s=document.createElement('span');s.textContent=d;dow.appendChild(s);});
    const grid=document.createElement('div');
    grid.className=`cal-grid${view==='week'?' cal-week':''}`;

    for(let i=0;i<cells;i++){
      const date=addDays(gridStart,i);
      const inMonth=date.startsWith(`${y}-${pad(m)}`);
      const night=snapshot.nights[date]||{channels:[],eventIds:[],checkins:[],checkouts:[],conflict:false,prep:false};
      const evs=nightEvents(date);
      if(evs.length) visibleCount+=1;
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='cal-day';
      if(view==='month'&&!inMonth) btn.classList.add('outside');
      if(date===today) btn.classList.add('today');
      if(night.conflict) btn.classList.add('conflict');
      if(!evs.length) btn.classList.add('open');
      const ci=night.checkins.filter(id=>eventVisible(map.get(id)||{})).length;
      const co=night.checkouts.filter(id=>eventVisible(map.get(id)||{})).length;
      const pills=evs.filter(ev=>ev.start<=date&&date<ev.end).slice(0,view==='week'?6:3);
      btn.innerHTML=`<span class="cal-day-num">${Number(date.slice(8,10))}</span>
        <span class="cal-markers">${ci?`<span class="cal-ci">CI</span>`:''}${co?`<span class="cal-co">CO</span>`:''}${night.conflict?`<span class="cal-co">Overlap</span>`:''}</span>
        <span class="cal-pills">${pills.map(ev=>`<span class="cal-pill ${esc(ev.channel)}">${esc(ev.label)}</span>`).join('')}</span>`;
      btn.addEventListener('click',()=>openDrawer(date));
      grid.appendChild(btn);
    }
    mount.innerHTML='';
    mount.append(dow,grid);
    const empty=document.getElementById('calendarEmpty');
    if(empty) empty.classList.toggle('hidden', visibleCount>0);
  }

  function contactLine(ev){
    const settings=snapshot?.settings||{};
    if(!settings.showGuestContact) return '';
    const bits=[ev.guestEmail,ev.guestPhone].filter(Boolean);
    return bits.length?`<div class="reservation-meta">${esc(bits.join(' · '))}</div>`:'';
  }

  function openDrawer(date){
    if(!drawer)return;
    const evs=nightEvents(date);
    const night=snapshot?.nights?.[date];
    document.getElementById('drawerTitle').textContent=fmt(date);
    document.getElementById('drawerMeta').textContent=night?.conflict?'Overlap: more than one source claims this night.':'Check-in 4:00 PM · checkout 10:00 AM';
    if(!evs.length){
      drawerBody.innerHTML=`<div class="empty">Open night — guests can request this date unless an OTA feed is down.</div>
        <div class="widget-footer"><button class="btn btn-primary" type="button" data-fill="${date}">Block or owner stay</button></div>`;
    }else{
      drawerBody.innerHTML=evs.map(ev=>`<article class="card" style="margin-top:12px;padding:14px">
        <div class="card-head"><div><h3>${esc(ev.label)}</h3><p>${esc(ev.start)} → ${esc(ev.end)} · ${esc(ev.nights)} night${ev.nights===1?'':'s'}</p></div><span class="badge ${ev.statusBucket==='hold'?'warn':ev.statusBucket==='cancelled'?'':'good'}">${esc(ev.statusBucket)}</span></div>
        <div class="reservation-meta">${esc(guestLabel(ev))}${ev.guestCount?` · ${esc(ev.guestCount)} guests`:''}${ev.sourceLabel?` · ${esc(ev.sourceLabel)}`:''}</div>
        ${contactLine(ev)}
        ${ev.notes?`<p class="reservation-meta">${esc(ev.notes)}</p>`:''}
        ${ev.occupancy?'':'<div class="metric-label">Excluded from occupancy %.</div>'}
        ${ev.canDelete?`<div class="widget-footer"><button class="btn danger-btn" type="button" data-del="${ev.entryId}">Remove</button></div>`:''}
      </article>`).join('')+`<div class="widget-footer"><button class="btn btn-secondary" type="button" data-fill="${date}">Add another block</button></div>`;
    }
    drawer.classList.remove('hidden');
    drawerBackdrop?.classList.remove('hidden');
    drawerBody.querySelector('[data-fill]')?.addEventListener('click',e=>{
      fillForm(e.currentTarget.getAttribute('data-fill'));
      closeDrawer();
    });
    drawerBody.querySelectorAll('[data-del]').forEach(btn=>btn.addEventListener('click',()=>removeEntry(Number(btn.getAttribute('data-del')))));
  }

  function closeDrawer(){
    drawer?.classList.add('hidden');
    drawerBackdrop?.classList.add('hidden');
  }

  function fillForm(date){
    const start=document.getElementById('blockStart');
    const end=document.getElementById('blockEnd');
    if(start) start.value=date;
    if(end) end.value=addDays(date,1);
    document.getElementById('blockForm')?.scrollIntoView({behavior:'smooth',block:'center'});
  }

  async function removeEntry(id){
    if(!id||!confirm('Remove this owner stay or manual block?')) return;
    try{
      await ownerApi('calendar_entry_delete',{id});
      showNotice('Removed from calendar');
      closeDrawer();
      await load();
    }catch(e){showNotice(e.message||'Could not remove');}
  }

  function renderUpcoming(){
    const el=document.getElementById('upcomingList');
    if(!el||!snapshot)return;
    const rows=(snapshot.upcoming||[]).filter(eventVisible);
    if(!rows.length){el.innerHTML='<div class="empty">No upcoming stays or blocks.</div>';return;}
    el.innerHTML=rows.map(ev=>{
      const who=guestLabel(ev);
      return `<div class="list-row" data-open="${esc(ev.start)}"><div><strong>${esc(ev.label)}${who?` · ${esc(who)}`:''}</strong><span>${esc(ev.start)} → ${esc(ev.end)} · ${esc(ev.nights)} night${ev.nights===1?'':'s'}${ev.statusBucket==='hold'?' · hold':''}</span></div><span class="badge ${ev.statusBucket==='hold'?'warn':''}">${esc(ev.channel)}</span></div>`;
    }).join('');
    el.querySelectorAll('[data-open]').forEach(row=>row.addEventListener('click',()=>openDrawer(row.getAttribute('data-open'))));
  }

  function monthSummaryText(){
    if(!snapshot)return '';
    const settings=snapshot.settings||{};
    const lines=[
      `${snapshot.property.name} — ${monthTitle(snapshot.range.year,snapshot.range.month)}`,
      `Occupancy (guest nights): ${snapshot.occupancy.viewedMonth.pct}% this view · ${snapshot.occupancy.next30.pct}% next 30 · ${snapshot.occupancy.next90.pct}% next 90`,
      `Conflicts: ${snapshot.conflicts.length}`,
      'Outbound Airbnb/VRBO push: paused',
      ''
    ];
    const rows=(snapshot.events||[]).filter(ev=>ev.end>snapshot.range.start&&ev.start<snapshot.range.end&&ev.statusBucket!=='cancelled').sort((a,b)=>a.start.localeCompare(b.start));
    for(const ev of rows){
      const who=settings.showGuestNames===false&&ev.guestName?'Guest':(ev.guestName||ev.summary);
      lines.push(`${ev.start} → ${ev.end} · ${ev.label} · ${ev.statusBucket}${who?` · ${who}`:''}${ev.guestCount?` · ${ev.guestCount} guests`:''}`);
    }
    if(!rows.length) lines.push('No stays or blocks in this month.');
    return lines.join('\n');
  }

  function render(){
    if(!snapshot)return;
    renderLegend();
    renderFilters();
    renderOccupancy();
    renderSync();
    renderConflicts();
    renderGrid();
    renderUpcoming();
  }

  async function load(){
    try{
      const data=await ownerApi('calendar_view',{view,year,month,focusDate});
      snapshot=data;
      year=data.range.year;
      month=data.range.month;
      applySettings(data.settings);
      render();
    }catch(e){
      if(e.message==='unauthorized')return;
      showNotice(e.message||'Could not load calendar');
    }
  }

  async function saveSettings(reload){
    if(savingSettings)return;
    savingSettings=true;
    try{
      const settings=settingsFromForm();
      await ownerApi('calendar_settings_save',settings);
      if(snapshot) snapshot.settings=settings;
      if(reload) await load();
      else render();
    }catch(e){showNotice(e.message||'Could not save calendar setting');}
    finally{savingSettings=false;}
  }

  document.getElementById('calPrev')?.addEventListener('click',()=>{
    if(!year||!month)return;
    if(view==='week'&&focusDate){focusDate=addDays(focusDate,-7);return load();}
    month-=1;if(month<1){month=12;year-=1;}load();
  });
  document.getElementById('calNext')?.addEventListener('click',()=>{
    if(!year||!month)return;
    if(view==='week'&&focusDate){focusDate=addDays(focusDate,7);return load();}
    month+=1;if(month>12){month=1;year+=1;}load();
  });
  document.getElementById('calToday')?.addEventListener('click',()=>{year=null;month=null;focusDate=null;load();});
  document.getElementById('viewMonth')?.addEventListener('click',()=>{view='month';load();});
  document.getElementById('viewWeek')?.addEventListener('click',()=>{view='week';focusDate=snapshot?.range?.today||focusDate;load();});
  document.getElementById('copySummary')?.addEventListener('click',async()=>{
    try{
      await navigator.clipboard.writeText(monthSummaryText());
      showNotice('Month summary copied');
    }catch{showNotice('Select and copy the summary from the calendar list');}
  });
  document.getElementById('showGuestNames')?.addEventListener('change',()=>saveSettings(false));
  document.getElementById('showGuestContact')?.addEventListener('change',()=>saveSettings(false));
  document.getElementById('prepBuffer')?.addEventListener('change',()=>saveSettings(true));
  document.getElementById('drawerClose')?.addEventListener('click',closeDrawer);
  drawerBackdrop?.addEventListener('click',closeDrawer);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer();});

  document.getElementById('blockForm')?.addEventListener('submit',async e=>{
    e.preventDefault();
    const kind=document.getElementById('blockKind')?.value;
    const startDate=document.getElementById('blockStart')?.value;
    const endDate=document.getElementById('blockEnd')?.value;
    const notes=document.getElementById('blockNotes')?.value||'';
    try{
      await ownerApi('calendar_entry_save',{kind,startDate,endDate,notes});
      e.target.reset();
      showNotice(kind==='owner_stay'?'Owner stay saved':'Manual block saved');
      await load();
    }catch(err){showNotice(err.message||'Could not save');}
  });

  window.addEventListener('cjt-calendar-feeds-updated',()=>load());
  const boot=()=>{if(!document.getElementById('ownerApp')?.classList.contains('hidden'))load();};
  setTimeout(boot,400);
  setTimeout(boot,1200);
})();
