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
  const STATUS_LABELS={hold:'Request received',confirmed:'Confirmed',cancelled:'Cancelled'};
  const SYNCED_FLASH_MS=2200;
  let snapshot=null;
  let view='month';
  let year=null;
  let month=null;
  let focusDate=null;
  let channelFilter='all';
  let statusFilter='all';
  let savingSettings=false;
  let loadTimer=null;
  let loadState='loading';
  let loadError='';
  let loadGeneration=0;
  let syncUi='idle';
  let syncFlashTimer=null;

  const noticeEl=document.getElementById('moduleNotice');
  const mount=document.getElementById('calendarMount');
  const drawer=document.getElementById('nightDrawer');
  const drawerBackdrop=document.getElementById('drawerBackdrop');
  const drawerBody=document.getElementById('drawerBody');
  const drawerActions=document.getElementById('drawerActions');

  function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function showNotice(text,ms=4500){
    if(!noticeEl)return;
    noticeEl.textContent=text;
    noticeEl.classList.remove('hidden','err','ok');
    if(!text){noticeEl.classList.add('hidden');return;}
    if(ms===0)return;
    setTimeout(()=>{
      if(noticeEl.textContent===text)noticeEl.classList.add('hidden');
    },ms);
  }
  function showLoadError(text){
    if(!noticeEl)return;
    noticeEl.textContent=text;
    noticeEl.classList.remove('hidden','ok');
    noticeEl.classList.add('err');
    noticeEl.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  function clearLoadError(){
    if(!noticeEl)return;
    if(noticeEl.classList.contains('err')){
      noticeEl.textContent='';
      noticeEl.classList.add('hidden');
      noticeEl.classList.remove('err');
    }
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
  function statusLabel(bucket){
    return STATUS_LABELS[bucket]||bucket||'';
  }
  function isAppVisible(){
    return !document.getElementById('ownerApp')?.classList.contains('hidden');
  }
  function showLogin(){
    document.getElementById('ownerApp')?.classList.add('hidden');
    document.getElementById('loginShell')?.classList.remove('hidden');
  }

  function clearConnectionsLoading(text,force){
    const pill=document.getElementById('feedStatusPill');
    if(pill && (force || /loading/i.test(pill.textContent||''))){
      pill.textContent=text;
      pill.dataset.state='failed';
    }
    const probe=document.getElementById('liveProbe');
    if(probe && (force || /checking/i.test((probe.textContent||'').trim()))){
      probe.innerHTML=`<div class="empty">${esc(text)}</div>`;
    }
  }

  function clearFailedChrome(message,opts={}){
    const unauthorized=opts.unauthorized===true;
    if(unauthorized) snapshot=null;
    setLoadChrome('failed',message,unauthorized?'Sign in':'Could not load');
    clearConnectionsLoading(unauthorized?'Sign in':'Unavailable',unauthorized);
    const title=document.getElementById('calTitle');
    if(title) title.textContent='Calendar';
    if(!snapshot && mount){
      mount.innerHTML='';
      mount.dataset.state='failed';
      mount.setAttribute('aria-busy','false');
    }
    document.getElementById('calendarEmpty')?.classList.add('hidden');
    if(unauthorized) showLogin();
  }

  async function ownerApi(action,payload={}){
    const r=await fetch('/api/owner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...payload})});
    const d=await r.json().catch(()=>({}));
    if(r.status===401) throw new Error('unauthorized');
    if(!r.ok){
      const err=new Error(d.message||d.error||'owner_request_failed');
      err.status=r.status;
      err.code=d.error||'';
      throw err;
    }
    return d;
  }

  function viewParams(){
    return {view,year,month,focusDate};
  }

  function isUnsupportedSyncAction(error){
    const status=error.status;
    const blob=`${error.code||''} ${error.message||''}`.toLowerCase();
    if(status===405 || /method_not_allowed/.test(blob)) return true;
    if((status===400 || status===404) && /unknown|unsupported|not[_ -]?implemented|invalid_action|unknown_action|unrecognized/.test(blob)) return true;
    return /unsupported action|unknown action|unknown_action|invalid_action/.test(blob);
  }

  // Nav uses calendar_view. Sync prefers calendar_sync (full_refresh); fall back if tip lacks the action.
  async function fetchCalendarSnapshot(params, opts={}){
    if(opts.reason!=='sync') return ownerApi('calendar_view',params);
    try{
      return await ownerApi('calendar_sync',params);
    }catch(e){
      if(e.message==='unauthorized') throw e;
      if(isUnsupportedSyncAction(e)) return ownerApi('calendar_view',params);
      throw e;
    }
  }

  function deriveSyncOk(sync){
    if(!sync) return false;
    if(typeof sync.ok==='boolean') return sync.ok;
    const sources=sync.sources||[];
    return !sync.configError && sources.every(s=>s.ok!==false);
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

  function drawerGuestLabel(ev){
    const settings=snapshot?.settings||settingsFromForm();
    if(settings.showGuestNames===false) return ev.summary&&ev.summary!==ev.label?ev.summary:'';
    if(ev.guestName) return ev.guestName;
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

  function setLoadChrome(state,message,pillText){
    loadState=state;
    loadError=message||'';
    const pill=document.getElementById('viewStatusPill');
    const failed=document.getElementById('calendarFailed');
    if(mount){
      mount.dataset.state=state;
      mount.setAttribute('aria-busy',state==='loading'?'true':'false');
    }
    if(pill){
      pill.dataset.state=state;
      if(state==='loading') pill.textContent='Loading…';
      else if(state==='failed') pill.textContent=pillText||'Could not load';
      else if(state==='empty') pill.textContent=syncStatusPhrase();
      else if(snapshot) pill.textContent=syncStatusPhrase();
      else pill.textContent=pillText||'Calendar';
    }
    if(failed){
      const showFail=state==='failed'&&!snapshot;
      failed.classList.toggle('hidden',!showFail);
      failed.textContent=showFail?(loadError||'Could not load calendar.'):'';
    }
    const title=document.getElementById('calTitle');
    if(title && !snapshot) title.textContent='Calendar';
  }

  function syncStatusPhrase(){
    const sync=snapshot?.sync;
    if(!sync) return 'Calendar';
    const sources=sync.sources||[];
    const checked=sync.checkedAt?new Date(sync.checkedAt).toLocaleString():'';
    if(sync.configError) return `Sync issue${checked?` · ${checked}`:''}`;
    if(!sources.length) return checked?`No sources · ${checked}`:'No sources';
    const okCount=sources.filter(s=>s.ok!==false).length;
    return `${okCount} source${okCount===1?'':'s'}${checked?` · ${checked}`:''}`;
  }

  function setSyncButton(state){
    syncUi=state;
    const btn=document.getElementById('syncCalendars');
    if(!btn)return;
    btn.classList.remove('is-synced','is-issue');
    if(state==='syncing'){
      btn.textContent='Syncing…';
      btn.disabled=true;
    }else if(state==='synced'){
      btn.textContent='Synced';
      btn.disabled=false;
      btn.classList.add('is-synced');
    }else if(state==='issue'){
      btn.textContent='Sync issue';
      btn.disabled=false;
      btn.classList.add('is-issue');
    }else{
      btn.textContent='Sync Calendars';
      btn.disabled=false;
    }
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
    const statuses=[['all','All statuses'],['hold','Request received'],['confirmed','Confirmed'],['cancelled','Cancelled']];
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
    if(!el)return;
    if(!snapshot?.occupancy||!snapshot.range){el.innerHTML='';return;}
    const viewed=view==='week'?(snapshot.occupancy.viewedWeek||snapshot.occupancy.viewedMonth):snapshot.occupancy.viewedMonth;
    const next30=snapshot.occupancy.next30;
    const next90=snapshot.occupancy.next90;
    const thisMonth=snapshot.range.year===Number(snapshot.range.today.slice(0,4))&&snapshot.range.month===Number(snapshot.range.today.slice(5,7));
    const period=view==='week'?'This week':(thisMonth?'This month':'Viewed month');
    const cards=[
      [period, `${viewed?.pct??'—'}%`, `${viewed?.booked??'—'} of ${viewed?.total??'—'} guest nights`],
      ['Next 30 days', `${next30?.pct??'—'}%`, `${next30?.booked??'—'} of ${next30?.total??'—'} guest nights`],
      ['Next 90 days', `${next90?.pct??'—'}%`, `${next90?.booked??'—'} of ${next90?.total??'—'} guest nights`]
    ];
    el.innerHTML=cards.map(c=>`<div class="summary-card"><span>${esc(c[0])}</span><b>${esc(c[1])}</b><span>${esc(c[2])}</span></div>`).join('');
  }

  function sourceLabel(s){
    const name=s.label||s.name||'Source';
    if(s.duplicateOf) return `${name} · same URL as ${s.duplicateOf}`;
    if(s.origin==='env') return `${name} · env`;
    if(s.origin==='owner') return `${name} · imported`;
    return name;
  }

  function sourceDetailBits(s){
    const bits=[];
    if(s.origin) bits.push(`origin ${s.origin}`);
    if(s.channel) bits.push(s.channel);
    if(s.hostHint) bits.push(s.hostHint);
    if(s.duplicateOf) bits.push(`duplicate of ${s.duplicateOf}`);
    if(s.ok===false) bits.push(s.error||'failed');
    else if(s.skipped) bits.push('deduped');
    else bits.push(`${s.count||0} nights`);
    return bits.join(' · ');
  }

  function renderSync(){
    const el=document.getElementById('syncStrip');
    if(!el)return;
    if(!snapshot){el.innerHTML='';return;}
    const sync=snapshot.sync||{};
    const sources=sync.sources||[];
    const ok=deriveSyncOk(sync);
    const checked=sync.checkedAt?new Date(sync.checkedAt).toLocaleString():'—';
    const compact=ok
      ? `Last check ${checked}`
      : (sync.configError?.message||sync.configError?.code||'One or more sources need attention');
    const chips=sources.length
      ? sources.map(s=>{
          const cls=s.duplicateOf?'dup':(s.ok===false?'fail':'ok');
          return `<span class="cal-sync-chip ${cls}"><i></i>${esc(sourceLabel(s))} · ${esc(sourceDetailBits(s))}</span>`;
        }).join('')
      : '<span class="cal-sync-chip fail"><i></i>No iCal sources yet. Nights that already loaded still appear on this Calendar.</span>';
    const issueNote=sync.configError
      ? `<p class="metric-label cal-sync-issue">${esc(sync.configError.message||sync.configError.code||'Calendar source probe reported a configuration issue.')} Nights that loaded still appear below.</p>`
      : (!ok?`<p class="metric-label cal-sync-issue">A calendar source reported an issue. Nights that loaded still appear below.</p>`:'');
    el.innerHTML=`<div class="cal-sync-compact ${ok?'ok':'fail'}"><i></i><span>${esc(compact)}</span></div>
      ${issueNote}
      <details class="cal-sync-details">
        <summary>Source details</summary>
        <div class="cal-sync-chips">${chips}</div>
      </details>`;
    if(loadState!=='loading'&&loadState!=='failed'){
      const pill=document.getElementById('viewStatusPill');
      if(pill) pill.textContent=syncStatusPhrase();
    }
  }

  function renderConflicts(){
    const el=document.getElementById('conflictBanner');
    if(!el||!snapshot)return;
    const rows=(snapshot.conflicts||[]).filter(c=>{
      const night=snapshot.nights?.[c.date];
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

  function renderSkeleton(){
    if(!mount)return;
    const dow=document.createElement('div');
    dow.className='cal-dow';
    DOW.forEach(d=>{const s=document.createElement('span');s.textContent=d;dow.appendChild(s);});
    const grid=document.createElement('div');
    grid.className='cal-grid cal-skeleton';
    for(let i=0;i<42;i++){
      const cell=document.createElement('div');
      cell.className='cal-day cal-day-skel';
      cell.setAttribute('aria-hidden','true');
      grid.appendChild(cell);
    }
    mount.innerHTML='';
    mount.append(dow,grid);
  }

  function renderGrid(){
    if(!mount)return;
    if(!snapshot?.range){
      if(loadState==='loading') renderSkeleton();
      return;
    }
    const y=snapshot.range.year;
    const m=snapshot.range.month;
    const today=snapshot.range.today;
    const title=document.getElementById('calTitle');
    if(title) title.textContent=view==='week'?`Week of ${fmt(snapshot.range.weekStart)}`:monthTitle(y,m);
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
      const night=snapshot.nights?.[date]||{channels:[],eventIds:[],checkins:[],checkouts:[],conflict:false,prep:false};
      const evs=nightEvents(date);
      if(evs.length) visibleCount+=1;
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='cal-day';
      if(view==='month'&&!inMonth) btn.classList.add('outside');
      if(date===today) btn.classList.add('today');
      if(night.conflict) btn.classList.add('conflict');
      if(!evs.length) btn.classList.add('open');
      const ci=(night.checkins||[]).filter(id=>eventVisible(map.get(id)||{})).length;
      const co=(night.checkouts||[]).filter(id=>eventVisible(map.get(id)||{})).length;
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

  function hasReservationId(ev){
    return ev.channel==='direct' && !!ev.reservationId;
  }
  function isOtaEvent(ev){
    return ev.kind==='ota' || ['airbnb','vrbo','booking.com'].includes(ev.channel);
  }
  function bookingHref(id){
    return `/owner-v1/reservations?booking=${encodeURIComponent(id)}&property=sand-sea-manor`;
  }
  function messagesHref(id){
    return `/owner-v1/communications?booking=${encodeURIComponent(id)}&property=sand-sea-manor`;
  }
  function financialsHref(id){
    return `/owner-v1/financials?booking=${encodeURIComponent(id)}&q=${encodeURIComponent(id)}&property=sand-sea-manor`;
  }

  function renderDrawerActions(date,evs){
    if(!drawerActions)return;
    const directs=evs.filter(hasReservationId);
    const otaOnly=evs.length>0 && evs.every(ev=>!hasReservationId(ev)) && evs.some(isOtaEvent);
    const deletable=evs.filter(ev=>ev.canDelete&&ev.entryId);
    const links=directs.flatMap(ev=>{
      const id=ev.reservationId;
      return [
        `<a class="btn btn-secondary" href="${esc(bookingHref(id))}">View booking</a>`,
        `<a class="btn btn-secondary" href="${esc(financialsHref(id))}">Financials</a>`,
        `<a class="btn btn-secondary" href="${esc(messagesHref(id))}">Messages</a>`
      ];
    }).join('');
    const removes=deletable.map(ev=>`<button class="btn danger-btn" type="button" data-del="${esc(ev.entryId)}">Remove ${esc(ev.label||'block')}</button>`).join('');
    const otaNote=otaOnly?'<p class="metric-label cal-ota-note">OTA feed only — there is no detailed reservation record in the owner portal for this night.</p>':'';
    drawerActions.innerHTML=`<div class="cal-drawer-action-list">
      <button class="btn btn-primary" type="button" data-fill="${esc(date)}" data-kind="manual_block">Block dates</button>
      <button class="btn btn-secondary" type="button" data-fill="${esc(date)}" data-kind="owner_stay">Owner stay</button>
      ${links}${removes}
    </div>${otaNote}`;
    drawerActions.querySelectorAll('[data-fill]').forEach(btn=>btn.addEventListener('click',()=>{
      fillForm(btn.getAttribute('data-fill'),btn.getAttribute('data-kind'));
      closeDrawer();
    }));
    drawerActions.querySelectorAll('[data-del]').forEach(btn=>btn.addEventListener('click',()=>removeEntry(Number(btn.getAttribute('data-del')))));
  }

  function openDrawer(date){
    if(!drawer)return;
    const evs=nightEvents(date);
    const night=snapshot?.nights?.[date];
    document.getElementById('drawerTitle').textContent=fmt(date);
    document.getElementById('drawerMeta').textContent=night?.conflict?'Overlap: more than one source claims this night.':'Check-in 4:00 PM · checkout 10:00 AM';
    renderDrawerActions(date,evs);
    if(!evs.length){
      drawerBody.innerHTML='<div class="empty">Open night — guests can request this date unless an OTA feed is down.</div>';
    }else{
      drawerBody.innerHTML=evs.map(ev=>`<article class="card" style="margin-top:12px;padding:14px">
        <div class="card-head"><div><h3>${esc(ev.label)}</h3><p>${esc(ev.start)} → ${esc(ev.end)} · ${esc(ev.nights)} night${ev.nights===1?'':'s'}</p></div><span class="badge ${ev.statusBucket==='hold'?'warn':ev.statusBucket==='cancelled'?'':'good'}">${esc(statusLabel(ev.statusBucket))}</span></div>
        <div class="reservation-meta">${esc(drawerGuestLabel(ev))}${ev.guestCount?` · ${esc(ev.guestCount)} guests`:''}${ev.sourceLabel?` · ${esc(ev.sourceLabel)}`:''}</div>
        ${contactLine(ev)}
        ${ev.notes?`<p class="reservation-meta">${esc(ev.notes)}</p>`:''}
        ${ev.occupancy?'':'<div class="metric-label">Excluded from occupancy %.</div>'}
      </article>`).join('');
    }
    drawer.classList.remove('hidden');
    drawerBackdrop?.classList.remove('hidden');
    drawer.setAttribute('aria-hidden','false');
    document.getElementById('drawerClose')?.focus();
  }

  function closeDrawer(){
    drawer?.classList.add('hidden');
    drawerBackdrop?.classList.add('hidden');
    drawer?.setAttribute('aria-hidden','true');
  }

  function fillForm(date,kind){
    const start=document.getElementById('blockStart');
    const end=document.getElementById('blockEnd');
    const kindEl=document.getElementById('blockKind');
    if(kind&&kindEl) kindEl.value=kind;
    if(date){
      if(start) start.value=date;
      if(end) end.value=addDays(date,1);
    }
    document.getElementById('blockFormCard')?.scrollIntoView({behavior:'smooth',block:'center'});
    document.getElementById('blockForm')?.scrollIntoView({behavior:'smooth',block:'center'});
    start?.focus();
  }

  async function removeEntry(id){
    if(!id||!confirm('Remove this owner stay or manual block?')) return;
    try{
      const d=await ownerApi('calendar_entry_delete',{id});
      if(d.ok!==true) throw new Error(d.message||d.error||'Could not remove');
      showNotice('Removed from calendar');
      closeDrawer();
      await load();
    }catch(e){
      if(e.message==='unauthorized'){clearFailedChrome('Sign in to view Calendar.',{unauthorized:true});return;}
      showNotice(e.message||'Could not remove');
    }
  }

  function renderUpcoming(){
    const el=document.getElementById('upcomingList');
    if(!el||!snapshot)return;
    const rows=(snapshot.upcoming||[]).filter(eventVisible);
    if(!rows.length){el.innerHTML='<div class="empty">No upcoming stays or blocks.</div>';return;}
    el.innerHTML=rows.map(ev=>{
      const extra=ev.statusBucket==='hold'?` · ${statusLabel('hold')}`:(ev.occupancy?'':' · not in occupancy');
      return `<div class="list-row" data-open="${esc(ev.start)}"><div><strong>${esc(ev.label)}</strong><span>${esc(ev.start)} → ${esc(ev.end)} · ${esc(ev.nights)} night${ev.nights===1?'':'s'}${extra}</span></div><span class="badge ${ev.statusBucket==='hold'?'warn':''}">${esc(ev.channel)}</span></div>`;
    }).join('');
    el.querySelectorAll('[data-open]').forEach(row=>row.addEventListener('click',()=>openDrawer(row.getAttribute('data-open'))));
  }

  function summaryRange(){
    if(view==='week') return {start:snapshot.range.weekStart,end:snapshot.range.weekEnd,label:`Week of ${fmt(snapshot.range.weekStart)}`};
    return {start:snapshot.range.start,end:snapshot.range.end,label:monthTitle(snapshot.range.year,snapshot.range.month)};
  }

  function monthSummaryText(){
    if(!snapshot)return '';
    const settings=snapshot.settings||{};
    const range=summaryRange();
    const occ=view==='week'?(snapshot.occupancy.viewedWeek||snapshot.occupancy.viewedMonth):snapshot.occupancy.viewedMonth;
    const lines=[
      `${snapshot.property?.name||'Calendar'} — ${range.label}`,
      `Occupancy (guest holds + confirmed + OTA only): ${occ?.pct??'—'}% this view · ${snapshot.occupancy?.next30?.pct??'—'}% next 30 · ${snapshot.occupancy?.next90?.pct??'—'}% next 90`,
      `Conflicts: ${(snapshot.conflicts||[]).length}`,
      'Outbound Airbnb/VRBO push: paused',
      ''
    ];
    const rows=(snapshot.events||[]).filter(ev=>ev.end>range.start&&ev.start<range.end&&ev.statusBucket!=='cancelled').sort((a,b)=>a.start.localeCompare(b.start));
    for(const ev of rows){
      const who=settings.showGuestNames!==false?drawerGuestLabel(ev):'';
      lines.push(`${ev.start} → ${ev.end} · ${ev.label} · ${statusLabel(ev.statusBucket)}${who?` · ${who}`:''}${ev.guestCount?` · ${ev.guestCount} guests`:''}${settings.showGuestContact&&(ev.guestEmail||ev.guestPhone)?` · ${[ev.guestEmail,ev.guestPhone].filter(Boolean).join(' / ')}`:''}`);
    }
    if(!rows.length) lines.push('No stays or blocks in this view.');
    return lines.join('\n');
  }

  function weekFocusDate(){
    if(focusDate) return focusDate;
    const today=snapshot?.range?.today;
    if(today&&year&&month&&Number(today.slice(0,4))===year&&Number(today.slice(5,7))===month) return today;
    if(year&&month) return `${year}-${pad(month)}-01`;
    return today||null;
  }

  function overlappingEvents(startDate,endDate){
    return (snapshot?.events||[]).filter(ev=>ev.statusBucket!=='cancelled'&&ev.start<endDate&&startDate<ev.end);
  }

  function render(){
    if(!snapshot){
      if(loadState==='loading') renderSkeleton();
      return;
    }
    const copyBtn=document.getElementById('copySummary');
    if(copyBtn) copyBtn.textContent=view==='week'?'Copy week summary':'Copy month summary';
    renderLegend();
    renderFilters();
    renderOccupancy();
    renderSync();
    renderConflicts();
    renderGrid();
    renderUpcoming();
  }

  async function load(opts={}){
    const gen=++loadGeneration;
    const hadSnapshot=!!snapshot;
    if(!hadSnapshot) setLoadChrome('loading');
    else{
      const pill=document.getElementById('viewStatusPill');
      if(pill) {pill.dataset.state='loading';pill.textContent='Loading…';}
    }
    try{
      const data=await fetchCalendarSnapshot(viewParams(),opts);
      if(gen!==loadGeneration) return data;
      if(!data||!data.range) throw new Error(data?.message||data?.error||'Could not load calendar');
      snapshot=data;
      year=data.range.year;
      month=data.range.month;
      if(view==='week'&&!focusDate) focusDate=data.range.weekStart;
      applySettings(data.settings);
      const empty=!(data.events||[]).length;
      setLoadChrome(empty?'empty':'loaded');
      clearLoadError();
      render();
      return data;
    }catch(e){
      if(gen!==loadGeneration && e.message!=='unauthorized') return null;
      const unauthorized=e.message==='unauthorized';
      const message=unauthorized?'Sign in to view Calendar.':(e.message||'Could not load calendar');
      clearFailedChrome(message,{unauthorized});
      if(unauthorized) return null;
      if(!unauthorized) showLoadError(message);
      if(hadSnapshot && snapshot) render();
      throw e;
    }
  }

  function requestLoad(){
    clearTimeout(loadTimer);
    loadTimer=setTimeout(()=>{load().catch(()=>{});},120);
  }

  async function syncCalendars(){
    clearTimeout(syncFlashTimer);
    setSyncButton('syncing');
    try{
      const data=await load({reason:'sync'});
      const ok=deriveSyncOk(data?.sync||snapshot?.sync);
      setSyncButton(ok?'synced':'issue');
      if(ok){
        syncFlashTimer=setTimeout(()=>{
          if(syncUi==='synced') setSyncButton('idle');
        },SYNCED_FLASH_MS);
      }
    }catch{
      setSyncButton('issue');
    }
  }

  async function saveSettings(reload){
    if(savingSettings)return;
    savingSettings=true;
    try{
      const settings=settingsFromForm();
      const d=await ownerApi('calendar_settings_save',settings);
      if(d.ok!==true) throw new Error(d.message||d.error||'Could not save calendar setting');
      if(snapshot) snapshot.settings=settings;
      if(reload) await load().catch(()=>{});
      else render();
    }catch(e){
      if(e.message==='unauthorized'){clearFailedChrome('Sign in to view Calendar.',{unauthorized:true});return;}
      showNotice(e.message||'Could not save calendar setting');
    }
    finally{savingSettings=false;}
  }

  document.getElementById('calPrev')?.addEventListener('click',()=>{
    if(!year||!month)return;
    if(view==='week'){
      focusDate=addDays(weekFocusDate(),-7);
      year=Number(focusDate.slice(0,4));
      month=Number(focusDate.slice(5,7));
      return load().catch(()=>{});
    }
    month-=1;if(month<1){month=12;year-=1;}load().catch(()=>{});
  });
  document.getElementById('calNext')?.addEventListener('click',()=>{
    if(!year||!month)return;
    if(view==='week'){
      focusDate=addDays(weekFocusDate(),7);
      year=Number(focusDate.slice(0,4));
      month=Number(focusDate.slice(5,7));
      return load().catch(()=>{});
    }
    month+=1;if(month>12){month=1;year+=1;}load().catch(()=>{});
  });
  document.getElementById('calToday')?.addEventListener('click',()=>{
    year=null;
    month=null;
    focusDate=snapshot?.range?.today||null;
    load().catch(()=>{});
  });
  document.getElementById('viewMonth')?.addEventListener('click',()=>{view='month';load().catch(()=>{});});
  document.getElementById('viewWeek')?.addEventListener('click',()=>{
    view='week';
    focusDate=weekFocusDate();
    load().catch(()=>{});
  });
  document.getElementById('syncCalendars')?.addEventListener('click',()=>syncCalendars());
  document.getElementById('openBlockForm')?.addEventListener('click',()=>fillForm(snapshot?.range?.today||null,'manual_block'));
  document.getElementById('copySummary')?.addEventListener('click',async()=>{
    try{
      await navigator.clipboard.writeText(monthSummaryText());
      showNotice(view==='week'?'Week summary copied':'Month summary copied');
    }catch{showNotice('Select and copy the summary from the calendar list');}
  });
  document.getElementById('showGuestNames')?.addEventListener('change',()=>saveSettings(true));
  document.getElementById('showGuestContact')?.addEventListener('change',()=>saveSettings(true));
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
      const overlap=overlappingEvents(startDate,endDate).filter(ev=>ev.occupancy);
      const d=await ownerApi('calendar_entry_save',{kind,startDate,endDate,notes});
      if(d.ok!==true) throw new Error(d.message||d.error||'Could not save');
      e.target.reset();
      const saved=kind==='owner_stay'?'Owner stay saved':'Manual block saved';
      showNotice(overlap.length?`${saved}. Overlaps an existing guest stay or OTA block.`:saved, overlap.length?7000:4500);
      await load().catch(()=>{});
    }catch(err){
      if(err.message==='unauthorized'){clearFailedChrome('Sign in to view Calendar.',{unauthorized:true});return;}
      showNotice(err.message||'Could not save');
    }
  });

  window.addEventListener('cjt-calendar-feeds-updated',()=>requestLoad());

  function bootWhenVisible(){
    const app=document.getElementById('ownerApp');
    let wasHidden=!isAppVisible();
    const tryLoad=()=>{
      if(!isAppVisible())return;
      if(!snapshot && loadState==='loading') renderSkeleton();
      requestLoad();
    };
    if(isAppVisible()) tryLoad();
    if(!app)return;
    const obs=new MutationObserver(()=>{
      const visible=isAppVisible();
      if(visible && wasHidden) tryLoad();
      wasHidden=!visible;
    });
    obs.observe(app,{attributes:true,attributeFilter:['class']});
  }
  bootWhenVisible();
})();
