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
  const OCCUPANCY_CHANNELS=new Set(['direct','airbnb','vrbo','booking.com','other']);
  const DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const DOW_SHORT=['S','M','T','W','T','F','S'];
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const VIEWS=['month','week','year','day'];
  const VIEW_STORAGE_KEY='cjt.owner.calendar.view';
  const VIEW_BTN={month:'viewMonth',week:'viewWeek',year:'viewYear',day:'viewDay'};

  let snapshot=null;
  let view=readStoredView();
  let year=null;
  let month=null;
  let focusDate=null;
  let channelFilter='all';
  let statusFilter='all';
  let savingSettings=false;
  let loadTimer=null;

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
  function monthLength(y,m){
    const nextY=m===12?y+1:y;
    const nextM=m===12?1:m+1;
    return Number(addDays(`${nextY}-${pad(nextM)}-01`,-1).slice(8,10));
  }
  function clampDay(y,m,day){
    return Math.max(1,Math.min(Number(day)||1,monthLength(y,m)));
  }
  function fmt(iso){
    if(!iso)return '—';
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
  }
  function fmtShort(iso){
    if(!iso)return '—';
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
  }
  function monthTitle(y,m){
    return new Date(Date.UTC(y,m-1,1)).toLocaleDateString('en-US',{month:'long',year:'numeric',timeZone:'UTC'});
  }
  function readStoredView(){
    try{
      const stored=localStorage.getItem(VIEW_STORAGE_KEY);
      if(VIEWS.includes(stored)) return stored;
    }catch{/* private mode */}
    return 'month';
  }
  function storeView(next){
    try{localStorage.setItem(VIEW_STORAGE_KEY,next);}catch{/* private mode */}
  }
  function setView(next){
    if(!VIEWS.includes(next)) next='month';
    view=next;
    storeView(next);
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

  function currentDayNumber(){
    const iso=focusDate||snapshot?.range?.day||snapshot?.range?.today;
    return iso?Number(iso.slice(8,10)):1;
  }

  function isoFromParts(y,m,day){
    return `${y}-${pad(m)}-${pad(clampDay(y,m,day))}`;
  }

  function renderLegend(){
    const el=document.getElementById('calendarLegend');
    if(!el)return;
    el.innerHTML=CHANNELS.map(([id,label,swatch])=>`<span><i class="cal-swatch ${swatch}"></i>${esc(label)}</span>`).join('')+'<span>CI / CO markers show check-in and check-out days (iCal end dates are exclusive).</span>';
  }

  function fillSelect(el,options,value){
    if(!el)return;
    const current=String(value);
    el.innerHTML=options.map(([id,label])=>`<option value="${esc(String(id))}"${String(id)===current?' selected':''}>${esc(label)}</option>`).join('');
  }

  function renderFilters(){
    const channelEl=document.getElementById('channelFilter');
    const statusEl=document.getElementById('statusFilter');
    fillSelect(channelEl,[['all','All channels'],...CHANNELS.map(([id,label])=>[id,label])],channelFilter);
    fillSelect(statusEl,[['all','All statuses'],['hold','Hold'],['confirmed','Confirmed'],['cancelled','Cancelled']],statusFilter);
  }

  function viewedOccupancy(){
    if(!snapshot)return {pct:0,booked:0,total:0};
    if(view==='year') return snapshot.occupancy.viewedYear||snapshot.occupancy.viewedMonth;
    if(view==='week'||view==='day') return snapshot.occupancy.viewedWeek||snapshot.occupancy.viewedMonth;
    return snapshot.occupancy.viewedMonth;
  }

  function viewedOccupancyLabel(){
    if(view==='year') return snapshot&&year===Number(snapshot.range.today.slice(0,4))?'This year':'Viewed year';
    if(view==='week'||view==='day') return 'This week';
    const thisMonth=snapshot&&snapshot.range.year===Number(snapshot.range.today.slice(0,4))&&snapshot.range.month===Number(snapshot.range.today.slice(5,7));
    return thisMonth?'This month':'Viewed month';
  }

  function renderOccupancy(){
    const el=document.getElementById('occupancyStrip');
    if(!el||!snapshot)return;
    const viewed=viewedOccupancy();
    const next30=snapshot.occupancy.next30;
    const next90=snapshot.occupancy.next90;
    const cards=[
      [viewedOccupancyLabel(), `${viewed.pct}%`, `${viewed.booked} of ${viewed.total} guest nights`],
      ['Next 30 days', `${next30.pct}%`, `${next30.booked} of ${next30.total} guest nights`],
      ['Next 90 days', `${next90.pct}%`, `${next90.booked} of ${next90.total} guest nights`]
    ];
    el.innerHTML=cards.map(c=>`<span class="cal-occ-item"><span>${esc(c[0])}</span><b>${esc(c[1])}</b><span class="cal-occ-sub">${esc(c[2])}</span></span>`).join('');
  }

  function sourceLabel(s){
    if(s.duplicateOf) return `${s.label||s.name} · same URL as ${s.duplicateOf}`;
    if(s.origin==='env') return `${s.label||s.name} · env`;
    if(s.origin==='owner') return `${s.label||s.name} · imported`;
    return s.label||s.name;
  }

  function renderSync(){
    const el=document.getElementById('syncStrip');
    const summary=document.getElementById('syncSummary');
    const pill=document.getElementById('viewStatusPill');
    if(!el||!snapshot)return;
    const sources=snapshot.sync.sources||[];
    const checked=snapshot.sync.checkedAt?new Date(snapshot.sync.checkedAt).toLocaleString():'—';
    const ok=sources.filter(s=>s.ok!==false&&!s.duplicateOf).length;
    const fail=sources.filter(s=>s.ok===false).length;
    if(pill) pill.textContent=snapshot.sync.configError?'Feeds missing':`${ok} source${ok===1?'':'s'}`;
    if(summary){
      if(!sources.length) summary.textContent='No calendar sources yet';
      else if(fail) summary.textContent=`${ok} connected · ${fail} issue${fail===1?'':'s'} · ${checked}`;
      else summary.textContent=`${ok} source${ok===1?'':'s'} · checked ${checked}`;
    }
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

  function yearDayKind(date){
    const night=snapshot?.nights?.[date];
    const occupying=nightEvents(date).filter(ev=>ev.start<=date&&date<ev.end);
    if(!occupying.length) return night?.conflict?'conflict':'open';
    const channels=occupying.map(ev=>ev.channel);
    const guests=channels.some(c=>OCCUPANCY_CHANNELS.has(c));
    const conflict=night?.conflict&&(occupying.length>1||occupying.some(ev=>ev.channel==='prep'));
    if(conflict) return guests?'booked conflict':'conflict';
    if(guests) return 'booked';
    if(channels.includes('owner_stay')) return 'owner';
    if(channels.includes('manual_block')) return 'blocked';
    if(night?.prep||channels.includes('prep')) return 'prep';
    return 'open';
  }

  function renderNav(){
    const y=year||snapshot?.range?.year;
    const m=month||snapshot?.range?.month;
    const todayY=snapshot?Number(snapshot.range.today.slice(0,4)):new Date().getUTCFullYear();
    const startY=Math.min(todayY-2,y||todayY);
    const endY=Math.max(todayY+3,y||todayY);
    const years=[];
    for(let yy=startY;yy<=endY;yy+=1) years.push([yy,String(yy)]);
    fillSelect(document.getElementById('calYearSelect'),years,y);
    fillSelect(document.getElementById('calMonthSelect'),MONTHS.map((name,i)=>[i+1,name]),m);
    const showDay=view==='week'||view==='day';
    document.getElementById('calDayField')?.classList.toggle('hidden',!showDay);
    if(showDay&&y&&m){
      const dim=monthLength(y,m);
      const days=[];
      for(let d=1;d<=dim;d+=1) days.push([d,String(d)]);
      fillSelect(document.getElementById('calDaySelect'),days,clampDay(y,m,currentDayNumber()));
    }
    const title=document.getElementById('calTitle');
    if(title&&snapshot){
      if(view==='week') title.textContent=`Week of ${fmtShort(snapshot.range.weekStart)} – ${fmtShort(addDays(snapshot.range.weekEnd,-1))}`;
      else if(view==='year') title.textContent=String(y);
      else if(view==='day') title.textContent=fmt(focusDate||snapshot.range.day);
      else title.textContent=monthTitle(y,m);
    }
    VIEWS.forEach(v=>{
      const btn=document.getElementById(VIEW_BTN[v]);
      if(!btn)return;
      btn.classList.toggle('active',view===v);
      btn.setAttribute('aria-pressed',view===v?'true':'false');
    });
  }

  function renderMonthWeekGrid(){
    const y=snapshot.range.year;
    const m=snapshot.range.month;
    const today=snapshot.range.today;
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

    for(let i=0;i<cells;i+=1){
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
    mount.append(dow,grid);
    return visibleCount;
  }

  function renderYearGrid(){
    const y=snapshot.range.year;
    const today=snapshot.range.today;
    const wrap=document.createElement('div');
    wrap.className='cal-year';
    let visibleCount=0;
    const monthsOcc=snapshot.occupancy.months||[];
    for(let m=1;m<=12;m+=1){
      const article=document.createElement('article');
      article.className='cal-year-month';
      article.id=`calYearMonth-${m}`;
      if(m===snapshot.range.month) article.classList.add('current');
      const occ=monthsOcc.find(row=>row.month===m);
      const first=`${y}-${pad(m)}-01`;
      const leading=new Date(`${first}T00:00:00Z`).getUTCDay();
      const dim=monthLength(y,m);
      const cells=[];
      for(let i=0;i<leading;i+=1) cells.push('<span class="cal-year-pad"></span>');
      for(let d=1;d<=dim;d+=1){
        const date=`${y}-${pad(m)}-${pad(d)}`;
        const night=snapshot.nights[date];
        const evs=nightEvents(date);
        if(evs.length) visibleCount+=1;
        const kind=yearDayKind(date);
        const todayCls=date===today?' today':'';
        cells.push(`<button type="button" class="cal-year-day ${kind}${todayCls}" data-date="${date}" title="${esc(date)}${night?.conflict?' · overlap':''}">${d}</button>`);
      }
      article.innerHTML=`<div class="cal-year-head"><button type="button" data-goto-month="${m}">${esc(MONTHS[m-1])}</button><span>${occ?`${occ.pct}%`:''}</span></div>
        <div class="cal-year-dow">${DOW_SHORT.map(d=>`<span>${d}</span>`).join('')}</div>
        <div class="cal-year-grid">${cells.join('')}</div>`;
      wrap.appendChild(article);
    }
    mount.append(wrap);
    mount.querySelectorAll('[data-goto-month]').forEach(btn=>btn.addEventListener('click',()=>{
      month=Number(btn.getAttribute('data-goto-month'));
      focusDate=isoFromParts(year,month,1);
      setView('month');
      load();
    }));
    mount.querySelectorAll('[data-date]').forEach(btn=>btn.addEventListener('click',()=>openDrawer(btn.getAttribute('data-date'))));
    return visibleCount;
  }

  function renderDayAgenda(){
    const date=focusDate||snapshot.range.day;
    const evs=nightEvents(date);
    const night=snapshot.nights[date];
    const wrap=document.createElement('div');
    wrap.className='cal-agenda';
    if(!evs.length){
      wrap.innerHTML=`<div class="empty">Open night — guests can request this date unless an OTA feed is down.</div>
        <div class="widget-footer"><button class="btn btn-primary" type="button" data-fill="${date}">Block or owner stay</button></div>`;
    }else{
      wrap.innerHTML=evs.map(ev=>`<article class="card">
        <div class="card-head"><div><h3>${esc(ev.label)}</h3><p>${esc(ev.start)} → ${esc(ev.end)} · ${esc(ev.nights)} night${ev.nights===1?'':'s'}</p></div><span class="badge ${ev.statusBucket==='hold'?'warn':ev.statusBucket==='cancelled'?'':'good'}">${esc(ev.statusBucket)}</span></div>
        <div class="reservation-meta">${esc(drawerGuestLabel(ev))}${ev.guestCount?` · ${esc(ev.guestCount)} guests`:''}${ev.sourceLabel?` · ${esc(ev.sourceLabel)}`:''}</div>
        ${contactLine(ev)}
        ${ev.notes?`<p class="reservation-meta">${esc(ev.notes)}</p>`:''}
        ${ev.occupancy?'':'<div class="metric-label">Excluded from occupancy %.</div>'}
        <div class="widget-footer">
          <button class="btn btn-secondary" type="button" data-open="${esc(ev.start)}">Night details</button>
          ${ev.canDelete?`<button class="btn danger-btn" type="button" data-del="${ev.entryId}">Remove</button>`:''}
        </div>
      </article>`).join('')+`<div class="widget-footer"><button class="btn btn-secondary" type="button" data-fill="${date}">Add another block</button></div>`;
    }
    if(night?.conflict){
      const banner=document.createElement('div');
      banner.className='notice cal-conflict';
      banner.textContent='Overlap: more than one source claims this night.';
      wrap.prepend(banner);
    }
    mount.append(wrap);
    wrap.querySelector('[data-fill]')?.addEventListener('click',e=>{
      fillForm(e.currentTarget.getAttribute('data-fill'));
    });
    wrap.querySelectorAll('[data-open]').forEach(btn=>btn.addEventListener('click',()=>openDrawer(btn.getAttribute('data-open'))));
    wrap.querySelectorAll('[data-del]').forEach(btn=>btn.addEventListener('click',()=>removeEntry(Number(btn.getAttribute('data-del')))));
    return evs.length;
  }

  function renderGrid(){
    if(!mount||!snapshot)return;
    mount.innerHTML='';
    let visibleCount=0;
    if(view==='year') visibleCount=renderYearGrid();
    else if(view==='day') visibleCount=renderDayAgenda();
    else visibleCount=renderMonthWeekGrid();
    const empty=document.getElementById('calendarEmpty');
    if(empty) empty.classList.toggle('hidden', view==='day'||visibleCount>0);
  }

  function contactLine(ev){
    const settings=snapshot?.settings||{};
    if(!settings.showGuestContact) return '';
    const bits=[ev.guestEmail,ev.guestPhone].filter(Boolean);
    return bits.length?`<div class="reservation-meta">${esc(bits.join(' · '))}</div>`:'';
  }

  function openDrawer(date){
    if(!drawer)return;
    focusDate=date;
    year=Number(date.slice(0,4));
    month=Number(date.slice(5,7));
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
        <div class="reservation-meta">${esc(drawerGuestLabel(ev))}${ev.guestCount?` · ${esc(ev.guestCount)} guests`:''}${ev.sourceLabel?` · ${esc(ev.sourceLabel)}`:''}</div>
        ${contactLine(ev)}
        ${ev.notes?`<p class="reservation-meta">${esc(ev.notes)}</p>`:''}
        ${ev.occupancy?'':'<div class="metric-label">Excluded from occupancy %.</div>'}
        ${ev.canDelete?`<div class="widget-footer"><button class="btn danger-btn" type="button" data-del="${ev.entryId}">Remove</button></div>`:''}
      </article>`).join('')+`<div class="widget-footer"><button class="btn btn-secondary" type="button" data-fill="${date}">Add another block</button></div>`;
    }
    drawer.classList.remove('hidden');
    drawerBackdrop?.classList.remove('hidden');
    drawer.setAttribute('aria-hidden','false');
    document.getElementById('drawerClose')?.focus();
    drawerBody.querySelector('[data-fill]')?.addEventListener('click',e=>{
      fillForm(e.currentTarget.getAttribute('data-fill'));
      closeDrawer();
    });
    drawerBody.querySelectorAll('[data-del]').forEach(btn=>btn.addEventListener('click',()=>removeEntry(Number(btn.getAttribute('data-del')))));
  }

  function closeDrawer(){
    drawer?.classList.add('hidden');
    drawerBackdrop?.classList.add('hidden');
    drawer?.setAttribute('aria-hidden','true');
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
      const extra=ev.statusBucket==='hold'?' · hold':(ev.occupancy?'':' · not in occupancy');
      return `<div class="list-row" data-open="${esc(ev.start)}"><div><strong>${esc(ev.label)}</strong><span>${esc(ev.start)} → ${esc(ev.end)} · ${esc(ev.nights)} night${ev.nights===1?'':'s'}${extra}</span></div><span class="badge ${ev.statusBucket==='hold'?'warn':''}">${esc(ev.channel)}</span></div>`;
    }).join('');
    el.querySelectorAll('[data-open]').forEach(row=>row.addEventListener('click',()=>openDrawer(row.getAttribute('data-open'))));
  }

  function summaryRange(){
    if(view==='week') return {start:snapshot.range.weekStart,end:snapshot.range.weekEnd,label:`Week of ${fmt(snapshot.range.weekStart)}`};
    if(view==='year') return {start:snapshot.range.yearStart,end:snapshot.range.yearEnd,label:String(snapshot.range.year)};
    if(view==='day'){
      const day=focusDate||snapshot.range.day;
      return {start:day,end:addDays(day,1),label:fmt(day)};
    }
    return {start:snapshot.range.start,end:snapshot.range.end,label:monthTitle(snapshot.range.year,snapshot.range.month)};
  }

  function monthSummaryText(){
    if(!snapshot)return '';
    const settings=snapshot.settings||{};
    const range=summaryRange();
    const occ=viewedOccupancy();
    const lines=[
      `${snapshot.property.name} — ${range.label}`,
      `Occupancy (guest holds + confirmed + OTA only): ${occ.pct}% this view · ${snapshot.occupancy.next30.pct}% next 30 · ${snapshot.occupancy.next90.pct}% next 90`,
      `Conflicts: ${snapshot.conflicts.length}`,
      'Outbound Airbnb/VRBO push: paused',
      ''
    ];
    if(view==='year'&&snapshot.occupancy.months){
      lines.push('Monthly occupancy:');
      snapshot.occupancy.months.forEach(row=>{
        lines.push(`  ${MONTHS[row.month-1]}: ${row.pct}% (${row.booked}/${row.total})`);
      });
      lines.push('');
    }
    const rows=(snapshot.events||[]).filter(ev=>ev.end>range.start&&ev.start<range.end&&ev.statusBucket!=='cancelled').sort((a,b)=>a.start.localeCompare(b.start));
    for(const ev of rows){
      const who=settings.showGuestNames!==false?drawerGuestLabel(ev):'';
      lines.push(`${ev.start} → ${ev.end} · ${ev.label} · ${ev.statusBucket}${who?` · ${who}`:''}${ev.guestCount?` · ${ev.guestCount} guests`:''}${settings.showGuestContact&&(ev.guestEmail||ev.guestPhone)?` · ${[ev.guestEmail,ev.guestPhone].filter(Boolean).join(' / ')}`:''}`);
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

  function copyLabel(){
    if(view==='week') return 'Copy week summary';
    if(view==='year') return 'Copy year summary';
    if(view==='day') return 'Copy day summary';
    return 'Copy month summary';
  }

  function render(){
    if(!snapshot)return;
    const copyBtn=document.getElementById('copySummary');
    if(copyBtn) copyBtn.textContent=copyLabel();
    renderNav();
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
      if((view==='week'||view==='day')&&!focusDate) focusDate=view==='day'?data.range.day:data.range.weekStart;
      if(view==='day'&&data.range.day) focusDate=data.range.day;
      applySettings(data.settings);
      render();
    }catch(e){
      if(e.message==='unauthorized')return;
      showNotice(e.message||'Could not load calendar');
    }
  }

  function requestLoad(){
    clearTimeout(loadTimer);
    loadTimer=setTimeout(()=>{load();},120);
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

  function stepPeriod(direction){
    if(!year||!month)return;
    if(view==='week'){
      focusDate=addDays(weekFocusDate(),direction*7);
    }else if(view==='day'){
      focusDate=addDays(focusDate||weekFocusDate(),direction);
    }else if(view==='year'){
      year+=direction;
      focusDate=isoFromParts(year,month,1);
      return load();
    }else{
      month+=direction;
      if(month<1){month=12;year-=1;}
      if(month>12){month=1;year+=1;}
      focusDate=isoFromParts(year,month,1);
      return load();
    }
    year=Number(focusDate.slice(0,4));
    month=Number(focusDate.slice(5,7));
    load();
  }

  document.getElementById('calPrev')?.addEventListener('click',()=>stepPeriod(-1));
  document.getElementById('calNext')?.addEventListener('click',()=>stepPeriod(1));
  document.getElementById('calToday')?.addEventListener('click',()=>{
    year=null;
    month=null;
    focusDate=snapshot?.range?.today||null;
    load();
  });
  document.getElementById('calMonthSelect')?.addEventListener('change',e=>{
    const next=Number(e.target.value);
    if(!next)return;
    month=next;
    if(view==='year'){
      document.getElementById(`calYearMonth-${next}`)?.scrollIntoView({behavior:'smooth',block:'nearest'});
      document.querySelectorAll('.cal-year-month').forEach(el=>el.classList.toggle('current',el.id===`calYearMonth-${next}`));
      return;
    }
    focusDate=isoFromParts(year||snapshot?.range?.year,month,currentDayNumber());
    year=Number(focusDate.slice(0,4));
    load();
  });
  document.getElementById('calYearSelect')?.addEventListener('change',e=>{
    const next=Number(e.target.value);
    if(!next)return;
    year=next;
    focusDate=isoFromParts(year,month||1,view==='year'?1:currentDayNumber());
    load();
  });
  document.getElementById('calDaySelect')?.addEventListener('change',e=>{
    const next=Number(e.target.value);
    if(!next||!year||!month)return;
    focusDate=isoFromParts(year,month,next);
    if(view==='month'||view==='year') setView('day');
    load();
  });
  document.getElementById('channelFilter')?.addEventListener('change',e=>{
    channelFilter=e.target.value||'all';
    render();
  });
  document.getElementById('statusFilter')?.addEventListener('change',e=>{
    statusFilter=e.target.value||'all';
    render();
  });
  VIEWS.forEach(v=>{
    document.getElementById(VIEW_BTN[v])?.addEventListener('click',()=>{
      setView(v);
      if(v==='week'||v==='day') focusDate=weekFocusDate();
      if(v==='year'&&year) focusDate=isoFromParts(year,month||1,1);
      load();
    });
  });
  document.getElementById('copySummary')?.addEventListener('click',async()=>{
    try{
      await navigator.clipboard.writeText(monthSummaryText());
      showNotice(`${copyLabel().replace('Copy ','')} copied`);
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
      await ownerApi('calendar_entry_save',{kind,startDate,endDate,notes});
      e.target.reset();
      const saved=kind==='owner_stay'?'Owner stay saved':'Manual block saved';
      showNotice(overlap.length?`${saved}. Overlaps an existing guest stay or OTA block.`:saved, overlap.length?7000:4500);
      await load();
    }catch(err){showNotice(err.message||'Could not save');}
  });

  window.addEventListener('cjt-calendar-feeds-updated',()=>requestLoad());
  const boot=()=>{if(!document.getElementById('ownerApp')?.classList.contains('hidden'))requestLoad();};
  setTimeout(boot,400);
  setTimeout(boot,1200);
})();
