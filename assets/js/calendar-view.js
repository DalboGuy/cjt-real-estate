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
  let drawerDate=null;
  let editingEntryId=null;
  let savingNotes=false;
  let showAllUpcoming=false;

  const noticeEl=document.getElementById('moduleNotice');
  const mount=document.getElementById('calendarMount');
  const drawer=document.getElementById('nightDrawer');
  const drawerBackdrop=document.getElementById('drawerBackdrop');
  const drawerBody=document.getElementById('drawerBody');
  const drawerActions=document.getElementById('drawerActions');

  function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function showNotice(text,ms=4500,kind){
    if(!noticeEl)return;
    noticeEl.textContent=text;
    noticeEl.classList.remove('hidden','err','ok');
    if(!text){noticeEl.classList.add('hidden');return;}
    if(kind==='ok') noticeEl.classList.add('ok');
    if(kind==='err') noticeEl.classList.add('err');
    if(ms===0)return;
    setTimeout(()=>{
      if(noticeEl.textContent===text)noticeEl.classList.add('hidden');
    },ms);
  }
  function drawerNoticeEl(){return document.getElementById('drawerNotice');}
  function setDrawerNotice(text,kind){
    const el=drawerNoticeEl();
    if(!el)return;
    el.textContent=text||'';
    el.classList.toggle('hidden',!text);
    el.classList.toggle('ok',kind==='ok');
    el.classList.toggle('err',kind==='err');
  }
  function clearDrawerNotice(){setDrawerNotice('');}
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
  function monthName(y,m){
    return new Date(Date.UTC(y,m-1,1)).toLocaleDateString('en-US',{month:'long',timeZone:'UTC'});
  }
  function viewNoun(){
    if(view==='week') return 'week';
    if(view==='year') return 'year';
    if(view==='day') return 'day';
    return 'month';
  }
  function copySummaryLabel(){
    return `Copy ${viewNoun()} summary`;
  }
  function setViewToggles(){
    document.getElementById('viewMonth')?.classList.toggle('active',view==='month');
    document.getElementById('viewWeek')?.classList.toggle('active',view==='week');
    document.getElementById('viewYear')?.classList.toggle('active',view==='year');
    document.getElementById('viewDay')?.classList.toggle('active',view==='day');
  }
  function snapshotDay(){
    return snapshot?.range?.day||snapshot?.range?.dayStart||null;
  }
  function datesInSnapshotRange(start,end){
    const out=[];
    if(!start||!end||start>=end) return out;
    let d=start;
    while(d<end){
      out.push(d);
      d=addDays(d,1);
      if(out.length>370) break;
    }
    return out;
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
    const active=document.getElementById('activeFilterSummary');
    if(active){
      const channelLabel=channels.find(([id])=>id===channelFilter)?.[1]||'All channels';
      const statusText=statuses.find(([id])=>id===statusFilter)?.[1]||'All statuses';
      active.textContent=`${channelLabel} · ${statusText}`;
    }
  }

  function occupancyForCurrentView(){
    const occ=snapshot?.occupancy||{};
    if(view==='week') return occ.viewedWeek||occ.viewedMonth;
    if(view==='year') return occ.viewedYear;
    if(view==='day') return occ.viewedDay;
    return occ.viewedMonth;
  }
  function occupancyPeriodLabel(){
    const today=snapshot?.range?.today||'';
    if(view==='week') return 'This week';
    if(view==='year') return Number(today.slice(0,4))===Number(snapshot?.range?.year)?'This year':'Viewed year';
    if(view==='day') return snapshotDay()===today?'Today':'Viewed day';
    const thisMonth=snapshot?.range?.year===Number(today.slice(0,4))&&snapshot?.range?.month===Number(today.slice(5,7));
    return thisMonth?'This month':'Viewed month';
  }
  function renderOccupancy(){
    const el=document.getElementById('occupancyStrip');
    if(!el)return;
    if(!snapshot?.occupancy||!snapshot.range){el.innerHTML='';return;}
    const viewed=occupancyForCurrentView();
    const next30=snapshot.occupancy.next30;
    const next90=snapshot.occupancy.next90;
    const cards=[
      [occupancyPeriodLabel(), `${viewed?.pct??'—'}%`, `${viewed?.booked??'—'} of ${viewed?.total??'—'} guest nights`],
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
    if(s.lastSuccessfulAt) bits.push(new Date(s.lastSuccessfulAt).toLocaleString());
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

  function renderAttention(){
    const el=document.getElementById('calendarAttention');
    if(!el||!snapshot)return;
    const sync=snapshot.sync||{};
    const sources=sync.sources||[];
    const failed=sources.filter(source=>source.ok===false&&!source.duplicateOf);
    const syncOk=deriveSyncOk(sync);
    const conflicts=(snapshot.conflicts||[]).filter(row=>{
      const night=snapshot.nights?.[row.date];
      if(!night)return false;
      const map=eventsById();
      return (night.eventIds||[]).some(id=>eventVisible(map.get(id)||{}));
    });
    const today=snapshot.range?.today||'';
    const upcoming=(snapshot.upcoming||[])
      .filter(ev=>eventVisible(ev)&&ev.statusBucket!=='cancelled'&&ev.end>today)
      .sort((a,b)=>a.start.localeCompare(b.start)||a.end.localeCompare(b.end));
    const next=upcoming[0];
    const healthTitle=syncOk?'Sources healthy':`${failed.length||1} source issue${(failed.length||1)===1?'':'s'}`;
    const healthDetail=syncOk
      ? `${sources.filter(source=>source.ok!==false).length} connected source${sources.length===1?'':'s'} checked`
      : (sync.configError?.message||failed.map(source=>source.label||source.name).slice(0,2).join(', ')||'Open connections to review');
    const conflictTitle=conflicts.length?`${conflicts.length} overlap${conflicts.length===1?'':'s'} to review`:'No overlaps detected';
    const conflictDetail=conflicts.length?conflicts.slice(0,3).map(row=>row.date).join(', '):'No two sources claim the same visible night';
    const nextTitle=next?`Next: ${next.label}`:'No upcoming activity';
    const nextDetail=next?`${fmt(next.start)} → ${fmt(next.end)} · ${next.nights} night${next.nights===1?'':'s'}`:'No stay or block appears in the loaded horizon';
    const cards=[
      {kind:syncOk?'good':'danger',icon:syncOk?'OK':'!',title:healthTitle,detail:healthDetail,action:'Connections',command:'connections'},
      {kind:conflicts.length?'danger':'good',icon:conflicts.length?'!':'OK',title:conflictTitle,detail:conflictDetail,action:conflicts.length?'Inspect':'Calendar',date:conflicts[0]?.date},
      {kind:next?.statusBucket==='hold'?'warn':'good',icon:next?.statusBucket==='hold'?'!':'→',title:nextTitle,detail:nextDetail,action:next?'Open':'Calendar',date:next?.start}
    ];
    el.innerHTML=cards.map(card=>`<button class="cal-attention-item ${card.kind}" type="button" ${card.command?`data-attention-command="${esc(card.command)}"`:''} ${card.date?`data-attention-date="${esc(card.date)}"`:''}>
      <span class="cal-attention-icon">${esc(card.icon)}</span>
      <span class="cal-attention-copy"><strong>${esc(card.title)}</strong><span>${esc(card.detail)}</span></span>
      <span class="cal-attention-action">${esc(card.action)} →</span>
    </button>`).join('');
    el.querySelectorAll('[data-attention-command="connections"]').forEach(button=>button.addEventListener('click',openConnectionsPanel));
    el.querySelectorAll('[data-attention-date]').forEach(button=>button.addEventListener('click',()=>openDrawer(button.getAttribute('data-attention-date'))));
  }

  function nightEvents(date){
    const night=snapshot?.nights?.[date];
    const map=eventsById();
    const ids=new Set([...(night?.eventIds||[]),...(night?.checkouts||[])]);
    return [...ids].map(id=>map.get(id)).filter(Boolean).filter(eventVisible);
  }

  function renderSkeleton(){
    if(!mount)return;
    if(view==='year'){
      const wrap=document.createElement('div');
      wrap.className='cal-year cal-skeleton';
      const months=document.createElement('div');
      months.className='cal-year-months';
      for(let i=0;i<12;i++){
        const cell=document.createElement('div');
        cell.className='cal-year-month cal-year-month-skel';
        cell.setAttribute('aria-hidden','true');
        months.appendChild(cell);
      }
      wrap.appendChild(months);
      mount.innerHTML='';
      mount.appendChild(wrap);
      return;
    }
    if(view==='day'){
      const wrap=document.createElement('div');
      wrap.className='cal-day-view';
      const cell=document.createElement('div');
      cell.className='cal-day cal-day-skel';
      cell.setAttribute('aria-hidden','true');
      const agenda=document.createElement('div');
      agenda.className='cal-agenda cal-skeleton';
      agenda.setAttribute('aria-hidden','true');
      wrap.append(cell,agenda);
      mount.innerHTML='';
      mount.appendChild(wrap);
      return;
    }
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

  function viewTitleText(){
    if(view==='week') return `Week of ${fmt(snapshot.range.weekStart)}`;
    if(view==='year') return String(snapshot.range.year);
    if(view==='day') return fmt(snapshotDay());
    return monthTitle(snapshot.range.year,snapshot.range.month);
  }
  function occupyingEvents(date,evs){
    return evs.filter(ev=>ev.start<=date&&date<ev.end);
  }
  function nightHeatClass(date,evs){
    const night=snapshot?.nights?.[date];
    const occupying=occupyingEvents(date,evs);
    if(night?.conflict) return 'heat-conflict';
    if(occupying.some(ev=>ev.occupancy)) return 'heat-booked';
    if(occupying.length) return 'heat-blocked';
    return 'heat-open';
  }
  function fillDayButton(btn,date,opts={}){
    const today=snapshot.range.today;
    const night=snapshot.nights?.[date]||{channels:[],eventIds:[],checkins:[],checkouts:[],conflict:false,prep:false};
    const evs=nightEvents(date);
    const map=eventsById();
    btn.type='button';
    btn.className=opts.className||'cal-day';
    if(opts.outside) btn.classList.add('outside');
    if(date===today) btn.classList.add('today');
    if(night.conflict) btn.classList.add('conflict');
    if(!evs.length) btn.classList.add('open');
    if(opts.heat) btn.classList.add(nightHeatClass(date,evs));
    const ci=(night.checkins||[]).filter(id=>eventVisible(map.get(id)||{})).length;
    const co=(night.checkouts||[]).filter(id=>eventVisible(map.get(id)||{})).length;
    const pillLimit=opts.pillLimit??(view==='week'?6:3);
    const pills=evs.filter(ev=>ev.start<=date&&date<ev.end).slice(0,pillLimit);
    const num=Number(date.slice(8,10));
    if(opts.heat){
      btn.innerHTML=`<span class="cal-day-num">${num}</span>`;
      btn.title=`${fmt(date)}${evs.length?` · ${evs.map(ev=>ev.label).join(', ')}`:''}`;
    }else{
      btn.innerHTML=`<span class="cal-day-num">${num}</span>
        <span class="cal-markers">${ci?`<span class="cal-ci">CI</span>`:''}${co?`<span class="cal-co">CO</span>`:''}${night.conflict?`<span class="cal-co">Overlap</span>`:''}</span>
        <span class="cal-pills">${pills.map(ev=>`<span class="cal-pill ${esc(ev.channel)}">${esc(ev.label)}</span>`).join('')}</span>`;
    }
    btn.addEventListener('click',()=>openDrawer(date));
    return evs;
  }
  function renderAgenda(list,opts={}){
    const wrap=document.createElement('div');
    wrap.className='cal-agenda';
    const heading=document.createElement('h4');
    heading.textContent=opts.heading||'Stays and blocks';
    wrap.appendChild(heading);
    if(!list.length){
      const empty=document.createElement('div');
      empty.className='empty';
      empty.textContent=opts.empty||'No stays or blocks in this view.';
      wrap.appendChild(empty);
      return wrap;
    }
    list.forEach(ev=>{
      const row=document.createElement('button');
      row.type='button';
      row.className='cal-agenda-row';
      const extra=ev.statusBucket==='hold'?` · ${statusLabel('hold')}`:(ev.occupancy?'':' · not in occupancy');
      row.innerHTML=`<span><strong>${esc(ev.label)}</strong><span>${esc(ev.start)} → ${esc(ev.end)} · ${esc(ev.nights)} night${ev.nights===1?'':'s'}${extra}</span></span><span class="badge ${ev.statusBucket==='hold'?'warn':''}">${esc(ev.channel)}</span>`;
      const openDate=opts.clampStart&&ev.start<opts.clampStart?opts.clampStart:ev.start;
      row.addEventListener('click',()=>openDrawer(openDate));
      wrap.appendChild(row);
    });
    return wrap;
  }
  function renderYearView(){
    const yearStart=snapshot.range.yearStart;
    const yearEnd=snapshot.range.yearEnd;
    const wrap=document.createElement('div');
    wrap.className='cal-year';
    const monthsEl=document.createElement('div');
    monthsEl.className='cal-year-months';
    const dates=datesInSnapshotRange(yearStart,yearEnd);
    const byMonth=new Map();
    dates.forEach(date=>{
      const key=date.slice(0,7);
      if(!byMonth.has(key)) byMonth.set(key,[]);
      byMonth.get(key).push(date);
    });
    let visibleCount=0;
    byMonth.forEach((monthDates,key)=>{
      const y=Number(key.slice(0,4));
      const m=Number(key.slice(5,7));
      const section=document.createElement('section');
      section.className='cal-year-month';
      const h=document.createElement('h4');
      h.textContent=monthName(y,m);
      const dow=document.createElement('div');
      dow.className='cal-year-dow';
      DOW.forEach(d=>{const s=document.createElement('span');s.textContent=d.slice(0,1);dow.appendChild(s);});
      const grid=document.createElement('div');
      grid.className='cal-year-grid';
      const leading=new Date(`${monthDates[0]}T00:00:00Z`).getUTCDay();
      for(let i=0;i<leading;i++){
        const padCell=document.createElement('span');
        padCell.className='cal-year-pad';
        padCell.setAttribute('aria-hidden','true');
        grid.appendChild(padCell);
      }
      monthDates.forEach(date=>{
        const btn=document.createElement('button');
        const evs=fillDayButton(btn,date,{className:'cal-year-day',heat:true,pillLimit:0});
        if(occupyingEvents(date,evs).length) visibleCount+=1;
        grid.appendChild(btn);
      });
      section.append(h,dow,grid);
      monthsEl.appendChild(section);
    });
    const key=document.createElement('p');
    key.className='metric-label cal-year-key';
    key.textContent='Heat uses this year snapshot: open, guest-booked, owner/manual block, overlap. Press a day for the same night drawer.';
    const range=summaryRange();
    const agendaEvents=(snapshot.events||[]).filter(ev=>eventVisible(ev)&&ev.statusBucket!=='cancelled'&&ev.end>range.start&&ev.start<range.end)
      .sort((a,b)=>a.start.localeCompare(b.start)||a.end.localeCompare(b.end));
    wrap.append(monthsEl,key,renderAgenda(agendaEvents,{heading:`Stays and blocks in ${snapshot.range.year}`,clampStart:yearStart}));
    mount.innerHTML='';
    mount.appendChild(wrap);
    return visibleCount;
  }
  function renderDayView(){
    const date=snapshotDay();
    const wrap=document.createElement('div');
    wrap.className='cal-day-view';
    const btn=document.createElement('button');
    const evs=date?fillDayButton(btn,date,{className:'cal-day cal-day-focus',pillLimit:8}):[];
    if(date) wrap.appendChild(btn);
    wrap.appendChild(renderAgenda(evs,{heading:'This day',empty:'No stays or blocks on this day.'}));
    mount.innerHTML='';
    mount.appendChild(wrap);
    return evs.length;
  }
  function renderGrid(){
    if(!mount)return;
    if(!snapshot?.range){
      if(loadState==='loading') renderSkeleton();
      return;
    }
    const title=document.getElementById('calTitle');
    if(title) title.textContent=viewTitleText();
    setViewToggles();

    let visibleCount=0;
    if(view==='year'){
      visibleCount=renderYearView();
    }else if(view==='day'){
      visibleCount=renderDayView();
    }else{
      const y=snapshot.range.year;
      const m=snapshot.range.month;
      const start=view==='week'?snapshot.range.weekStart:`${y}-${pad(m)}-01`;
      const leading=view==='week'?0:new Date(`${start}T00:00:00Z`).getUTCDay();
      const gridStart=addDays(start,-leading);
      const cells=view==='week'?7:42;

      const dow=document.createElement('div');
      dow.className='cal-dow';
      DOW.forEach(d=>{const s=document.createElement('span');s.textContent=d;dow.appendChild(s);});
      const grid=document.createElement('div');
      grid.className=`cal-grid${view==='week'?' cal-week':''}`;

      for(let i=0;i<cells;i++){
        const date=addDays(gridStart,i);
        const inMonth=date.startsWith(`${y}-${pad(m)}`);
        const btn=document.createElement('button');
        const evs=fillDayButton(btn,date,{outside:view==='month'&&!inMonth});
        if(evs.length) visibleCount+=1;
        grid.appendChild(btn);
      }
      mount.innerHTML='';
      mount.append(dow,grid);
    }
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
    const edits=deletable.map(ev=>`<button class="btn btn-secondary" type="button" data-edit="${esc(ev.entryId)}">Edit notes</button>`).join('');
    const removes=deletable.map(ev=>`<button class="btn danger-btn" type="button" data-del="${esc(ev.entryId)}">Remove ${esc(ev.label||'block')}</button>`).join('');
    const otaNote=otaOnly?'<p class="metric-label cal-ota-note">OTA feed only — there is no detailed reservation record in the owner portal for this night.</p>':'';
    drawerActions.innerHTML=`<div class="cal-drawer-action-list">
      <button class="btn btn-primary" type="button" data-fill="${esc(date)}" data-kind="manual_block">Block dates</button>
      <button class="btn btn-secondary" type="button" data-fill="${esc(date)}" data-kind="owner_stay">Owner stay</button>
      ${links}${edits}${removes}
    </div>${otaNote}`;
    drawerActions.querySelectorAll('[data-fill]').forEach(btn=>btn.addEventListener('click',()=>{
      fillForm(btn.getAttribute('data-fill'),btn.getAttribute('data-kind'));
      closeDrawer();
    }));
    drawerActions.querySelectorAll('[data-edit]').forEach(btn=>btn.addEventListener('click',()=>startEditNotes(Number(btn.getAttribute('data-edit')))));
    drawerActions.querySelectorAll('[data-del]').forEach(btn=>btn.addEventListener('click',()=>removeEntry(Number(btn.getAttribute('data-del')))));
  }

  function eventByEntryId(id){
    return (snapshot?.events||[]).find(ev=>Number(ev.entryId)===Number(id));
  }
  function applyEntryNotes(id,entry){
    const notes=entry&&Object.prototype.hasOwnProperty.call(entry,'notes')?entry.notes:null;
    (snapshot?.events||[]).forEach(ev=>{
      if(Number(ev.entryId)===Number(id)) ev.notes=notes||null;
    });
  }
  function closeEditNotes(){
    editingEntryId=null;
    savingNotes=false;
    const panel=document.getElementById('drawerNotesEdit');
    const field=document.getElementById('drawerNotesField');
    const saveBtn=document.getElementById('drawerNotesSave');
    panel?.classList.add('hidden');
    if(field) field.value='';
    if(saveBtn) saveBtn.disabled=false;
  }
  function startEditNotes(id){
    const ev=eventByEntryId(id);
    if(!ev||!ev.canDelete||!ev.entryId) return;
    editingEntryId=Number(ev.entryId);
    clearDrawerNotice();
    const panel=document.getElementById('drawerNotesEdit');
    const field=document.getElementById('drawerNotesField');
    const saveBtn=document.getElementById('drawerNotesSave');
    if(field) field.value=ev.notes||'';
    if(saveBtn) saveBtn.disabled=false;
    panel?.classList.remove('hidden');
    saveBtn?.scrollIntoView({block:'nearest',inline:'nearest'});
    field?.focus();
  }
  function syncDrawerKeyboardInset(){
    if(!drawer||drawer.classList.contains('hidden')){
      drawer?.style.setProperty('--cal-keyboard-inset','0px');
      return;
    }
    const vp=window.visualViewport;
    const inset=vp?Math.max(0,window.innerHeight-vp.height-vp.offsetTop):0;
    drawer.style.setProperty('--cal-keyboard-inset',`${Math.round(inset)}px`);
  }
  async function saveEntryNotes(e){
    e?.preventDefault();
    if(savingNotes||!editingEntryId) return;
    const field=document.getElementById('drawerNotesField');
    const saveBtn=document.getElementById('drawerNotesSave');
    const notes=String(field?.value||'').trim().slice(0,500);
    const id=editingEntryId;
    const date=drawerDate;
    savingNotes=true;
    if(saveBtn) saveBtn.disabled=true;
    clearDrawerNotice();
    try{
      const d=await ownerApi('calendar_entry_update',{id,notes});
      if(d.ok!==true) throw new Error(d.message||d.error||'Could not save notes');
      applyEntryNotes(id,d.entry||{notes});
      const confirm=d.message||'Saved.';
      closeEditNotes();
      if(date) openDrawer(date,{keepNotice:true});
      setDrawerNotice(confirm,'ok');
      showNotice(confirm,4500,'ok');
      await load().catch(()=>{});
      if(date&&drawer&&!drawer.classList.contains('hidden')) openDrawer(date,{keepNotice:true});
      setDrawerNotice(confirm,'ok');
    }catch(err){
      if(err.message==='unauthorized'){clearFailedChrome('Sign in to view Calendar.',{unauthorized:true});return;}
      const msg=err.message||'Could not save notes';
      setDrawerNotice(msg,'err');
      showNotice(msg,4500,'err');
      if(field) field.removeAttribute('readonly');
      field?.focus();
    }finally{
      savingNotes=false;
      if(saveBtn&&editingEntryId) saveBtn.disabled=false;
    }
  }

  function openDrawer(date,opts={}){
    if(!drawer)return;
    drawerDate=date;
    if(!opts.keepNotice) clearDrawerNotice();
    if(!opts.keepEdit) closeEditNotes();
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
        ${ev.canDelete&&ev.entryId
          ?`<p class="reservation-meta cal-entry-notes">${ev.notes?esc(ev.notes):'No notes yet.'}</p>`
          :(ev.notes?`<p class="reservation-meta">${esc(ev.notes)}</p>`:'')}
        ${ev.occupancy?'':'<div class="metric-label">Excluded from occupancy %.</div>'}
      </article>`).join('');
    }
    drawer.classList.remove('hidden');
    drawerBackdrop?.classList.remove('hidden');
    drawer.setAttribute('aria-hidden','false');
    syncDrawerKeyboardInset();
    if(!opts.keepEdit) document.getElementById('drawerClose')?.focus();
  }

  function closeDrawer(){
    closeEditNotes();
    clearDrawerNotice();
    drawerDate=null;
    drawer?.classList.add('hidden');
    drawerBackdrop?.classList.add('hidden');
    drawer?.setAttribute('aria-hidden','true');
    drawer?.style.setProperty('--cal-keyboard-inset','0px');
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
    openBlockDrawer();
    start?.focus();
  }

  function openBlockDrawer(){
    const panel=document.getElementById('blockDrawer');
    const backdrop=document.getElementById('utilityBackdrop');
    panel?.classList.remove('hidden');
    panel?.setAttribute('aria-hidden','false');
    backdrop?.classList.remove('hidden');
    document.body.classList.add('cal-modal-open');
  }

  function closeBlockDrawer(){
    const panel=document.getElementById('blockDrawer');
    const backdrop=document.getElementById('utilityBackdrop');
    panel?.classList.add('hidden');
    panel?.setAttribute('aria-hidden','true');
    backdrop?.classList.add('hidden');
    document.body.classList.remove('cal-modal-open');
    document.getElementById('openBlockForm')?.focus();
  }

  function openConnectionsPanel(){
    const panel=document.getElementById('calendarConnections');
    if(!panel)return;
    panel.open=true;
    panel.scrollIntoView({behavior:'smooth',block:'start'});
    panel.querySelector('summary')?.focus();
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
    const count=document.getElementById('upcomingCount');
    const toggle=document.getElementById('toggleUpcoming');
    if(count)count.textContent=String(rows.length);
    if(!rows.length){
      el.innerHTML='<div class="empty">No upcoming stays or blocks.</div>';
      toggle?.classList.add('hidden');
      return;
    }
    const visible=showAllUpcoming?rows:rows.slice(0,6);
    el.innerHTML=visible.map(ev=>{
      const extra=ev.statusBucket==='hold'?` · ${statusLabel('hold')}`:(ev.occupancy?'':' · not in occupancy');
      return `<div class="list-row" data-open="${esc(ev.start)}"><div><strong>${esc(ev.label)}</strong><span>${esc(ev.start)} → ${esc(ev.end)} · ${esc(ev.nights)} night${ev.nights===1?'':'s'}${extra}</span></div><span class="badge ${ev.statusBucket==='hold'?'warn':''}">${esc(ev.channel)}</span></div>`;
    }).join('');
    el.querySelectorAll('[data-open]').forEach(row=>row.addEventListener('click',()=>openDrawer(row.getAttribute('data-open'))));
    if(toggle){
      toggle.classList.toggle('hidden',rows.length<=6);
      toggle.textContent=showAllUpcoming?'Show next 6':`Show all ${rows.length}`;
    }
  }

  function summaryRange(){
    if(view==='week') return {start:snapshot.range.weekStart,end:snapshot.range.weekEnd,label:`Week of ${fmt(snapshot.range.weekStart)}`};
    if(view==='year') return {start:snapshot.range.yearStart,end:snapshot.range.yearEnd,label:String(snapshot.range.year)};
    if(view==='day'){
      const day=snapshotDay();
      return {start:snapshot.range.dayStart||day,end:snapshot.range.dayEnd||(day?addDays(day,1):null),label:fmt(day)};
    }
    return {start:snapshot.range.start,end:snapshot.range.end,label:monthTitle(snapshot.range.year,snapshot.range.month)};
  }

  function monthSummaryText(){
    if(!snapshot)return '';
    const settings=snapshot.settings||{};
    const range=summaryRange();
    const occ=occupancyForCurrentView();
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
    if(copyBtn) copyBtn.textContent=copySummaryLabel();
    setViewToggles();
    renderLegend();
    renderFilters();
    renderOccupancy();
    renderSync();
    renderConflicts();
    renderAttention();
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
      if(view==='week') focusDate=data.range.weekStart||focusDate;
      if(view==='day') focusDate=data.range.day||data.range.dayStart||focusDate;
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

  function shiftFocus(days){
    focusDate=addDays(weekFocusDate(),days);
    year=Number(focusDate.slice(0,4));
    month=Number(focusDate.slice(5,7));
    return load().catch(()=>{});
  }
  function focusDateInYear(nextYear){
    const next=`${nextYear}${(focusDate||`${nextYear}-01-01`).slice(4)}`;
    const parsed=new Date(`${next}T00:00:00Z`);
    if(Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==next) return `${nextYear}-01-01`;
    return next;
  }
  document.getElementById('calPrev')?.addEventListener('click',()=>{
    if(view==='year'){
      if(!year)return;
      year-=1;
      if(focusDate) focusDate=focusDateInYear(year);
      return load().catch(()=>{});
    }
    if(view==='day'){
      if(!weekFocusDate())return;
      return shiftFocus(-1);
    }
    if(!year||!month)return;
    if(view==='week') return shiftFocus(-7);
    month-=1;if(month<1){month=12;year-=1;}load().catch(()=>{});
  });
  document.getElementById('calNext')?.addEventListener('click',()=>{
    if(view==='year'){
      if(!year)return;
      year+=1;
      if(focusDate) focusDate=focusDateInYear(year);
      return load().catch(()=>{});
    }
    if(view==='day'){
      if(!weekFocusDate())return;
      return shiftFocus(1);
    }
    if(!year||!month)return;
    if(view==='week') return shiftFocus(7);
    month+=1;if(month>12){month=1;year+=1;}load().catch(()=>{});
  });
  document.getElementById('calToday')?.addEventListener('click',()=>{
    year=null;
    month=null;
    focusDate=snapshot?.range?.today||null;
    load().catch(()=>{});
  });
  function switchView(next){
    view=next;
    if(next==='week'||next==='day') focusDate=weekFocusDate();
    setViewToggles();
    load().catch(()=>{});
  }
  document.getElementById('viewMonth')?.addEventListener('click',()=>switchView('month'));
  document.getElementById('viewWeek')?.addEventListener('click',()=>switchView('week'));
  document.getElementById('viewYear')?.addEventListener('click',()=>switchView('year'));
  document.getElementById('viewDay')?.addEventListener('click',()=>switchView('day'));
  document.getElementById('syncCalendars')?.addEventListener('click',()=>syncCalendars());
  document.getElementById('openBlockForm')?.addEventListener('click',()=>fillForm(snapshot?.range?.today||null,'manual_block'));
  document.getElementById('openConnections')?.addEventListener('click',openConnectionsPanel);
  document.getElementById('closeBlockForm')?.addEventListener('click',closeBlockDrawer);
  document.getElementById('utilityBackdrop')?.addEventListener('click',closeBlockDrawer);
  document.getElementById('clearCalendarFilters')?.addEventListener('click',()=>{
    channelFilter='all';
    statusFilter='all';
    showAllUpcoming=false;
    render();
  });
  document.getElementById('toggleUpcoming')?.addEventListener('click',()=>{
    showAllUpcoming=!showAllUpcoming;
    renderUpcoming();
  });
  document.getElementById('copySummary')?.addEventListener('click',async()=>{
    try{
      await navigator.clipboard.writeText(monthSummaryText());
      showNotice(`${viewNoun().charAt(0).toUpperCase()}${viewNoun().slice(1)} summary copied`);
    }catch{showNotice('Select and copy the summary from the calendar list');}
  });
  document.getElementById('showGuestNames')?.addEventListener('change',()=>saveSettings(true));
  document.getElementById('showGuestContact')?.addEventListener('change',()=>saveSettings(true));
  document.getElementById('prepBuffer')?.addEventListener('change',()=>saveSettings(true));
  document.getElementById('drawerClose')?.addEventListener('click',closeDrawer);
  drawerBackdrop?.addEventListener('click',closeDrawer);
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape') return;
    if(!document.getElementById('blockDrawer')?.classList.contains('hidden')){
      closeBlockDrawer();
      return;
    }
    if(editingEntryId){
      closeEditNotes();
      clearDrawerNotice();
      return;
    }
    closeDrawer();
  });
  document.getElementById('drawerNotesForm')?.addEventListener('submit',saveEntryNotes);
  document.getElementById('drawerNotesCancel')?.addEventListener('click',()=>{
    closeEditNotes();
    clearDrawerNotice();
  });
  document.getElementById('drawerNotesField')?.addEventListener('focus',()=>{
    document.getElementById('drawerNotesSave')?.scrollIntoView({block:'nearest',inline:'nearest'});
    syncDrawerKeyboardInset();
  });
  window.visualViewport?.addEventListener('resize',syncDrawerKeyboardInset);
  window.visualViewport?.addEventListener('scroll',syncDrawerKeyboardInset);

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
      closeBlockDrawer();
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
