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
  let syncing=false;
  let lastFullSyncAt=null;
  let syncButtonReset=null;

  const noticeEl=document.getElementById('moduleNotice');
  const mount=document.getElementById('calendarMount');
  const drawer=document.getElementById('nightDrawer');
  const drawerBackdrop=document.getElementById('drawerBackdrop');
  const drawerBody=document.getElementById('drawerBody');
  const blockDrawer=document.getElementById('blockDrawer');
  const blockDrawerBackdrop=document.getElementById('blockDrawerBackdrop');

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
    if(!snapshot)return {pct:0,booked:0,total:0,arrivals:0,departures:0};
    if(view==='year') return snapshot.occupancy.viewedYear||snapshot.occupancy.viewedMonth;
    if(view==='week') return snapshot.occupancy.viewedWeek||snapshot.occupancy.viewedMonth;
    if(view==='day') return snapshot.occupancy.viewedDay||snapshot.occupancy.viewedMonth;
    return snapshot.occupancy.viewedMonth;
  }

  function viewedOccupancyLabel(){
    if(view==='year') return snapshot&&year===Number(snapshot.range.today.slice(0,4))?'This year':'Viewed year';
    if(view==='week') return 'This week';
    if(view==='day') return 'This day';
    const thisMonth=snapshot&&snapshot.range.year===Number(snapshot.range.today.slice(0,4))&&snapshot.range.month===Number(snapshot.range.today.slice(5,7));
    return thisMonth?'This month':'Viewed month';
  }

  function renderOccupancy(){
    const el=document.getElementById('occupancyStrip');
    const secondary=document.getElementById('occSecondary');
    if(!el||!snapshot)return;
    const viewed=viewedOccupancy();
    const next30=snapshot.occupancy.next30;
    const next90=snapshot.occupancy.next90;
    const cards=[
      ['Guest occupancy', `${viewed.pct}%`, viewedOccupancyLabel()],
      ['Guest nights', String(viewed.booked||0), `${viewed.booked||0} of ${viewed.total||0}`],
      ['Arrivals', String(viewed.arrivals||0), viewedOccupancyLabel()],
      ['Departures', String(viewed.departures||0), viewedOccupancyLabel()]
    ];
    el.innerHTML=cards.map(c=>`<span class="cal-occ-item"><span>${esc(c[0])}</span><b>${esc(c[1])}</b><span class="cal-occ-sub">${esc(c[2])}</span></span>`).join('');
    if(secondary){
      secondary.textContent=`Next 30: ${next30.pct}% (${next30.booked} of ${next30.total}) · Next 90: ${next90.pct}% (${next90.booked} of ${next90.total})`;
      secondary.title=`Next 30 days ${next30.pct}% guest occupancy · Next 90 days ${next90.pct}%`;
    }
  }

  function sourceLabel(s){
    if(s.duplicateOf) return `${s.name||s.label} · same URL as ${s.duplicateOf}`;
    if(s.origin==='env') return `${s.name||s.label} · env`;
    if(s.origin==='owner') return `${s.name||s.label} · imported`;
    if(s.kind==='database'||s.live) return `${s.name||'Direct / CJT'} · database`;
    return s.name||s.label||'Calendar';
  }

  function relativeChecked(iso){
    if(!iso) return null;
    const ms=Date.now()-new Date(iso).getTime();
    if(!Number.isFinite(ms)||ms<0) return null;
    if(ms<45000) return 'just now';
    if(ms<3600000) return `${Math.max(1,Math.round(ms/60000))}m ago`;
    const d=new Date(iso);
    const today=new Date();
    if(d.toDateString()===today.toDateString()){
      return `checked ${d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}`;
    }
    return `checked ${d.toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}`;
  }

  function formatCheckedAt(iso){
    if(!iso) return null;
    return new Date(iso).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  }

  function icalSources(){
    return (snapshot?.sync?.sources||[]).filter(s=>s.kind!=='database'&&!s.duplicateOf);
  }

  function setSyncButton(state){
    const btn=document.getElementById('syncCalendarsBtn');
    if(!btn)return;
    btn.disabled=state==='syncing';
    btn.setAttribute('aria-busy',state==='syncing'?'true':'false');
    const labels={
      idle:{full:'Sync Calendars',short:'Sync'},
      syncing:{full:'Syncing…',short:'Syncing…'},
      synced:{full:'Synced',short:'Synced'},
      issue:{full:'Sync issue',short:'Sync issue'}
    };
    const t=labels[state]||labels.idle;
    const full=btn.querySelector('.cal-sync-label-full');
    const short=btn.querySelector('.cal-sync-label-short');
    if(full) full.textContent=t.full;
    if(short) short.textContent=t.short;
    if(!full&&!short) btn.textContent=t.full;
  }

  function syncStatusCopy(){
    const configError=snapshot?.sync?.configError;
    const unique=(snapshot?.sync?.sources||[]).filter(s=>!s.duplicateOf);
    const feeds=icalSources();
    const when=relativeChecked(lastFullSyncAt||snapshot?.sync?.checkedAt)||'—';
    if(configError||!feeds.length){
      return {
        full:'⚠ Calendar sources not configured',
        compact:'⚠ Not configured',
        warn:true
      };
    }
    const ok=feeds.filter(s=>s.ok!==false).length;
    const fail=feeds.filter(s=>s.ok===false);
    if(!fail.length){
      if(when==='just now'){
        return {full:'✓ All calendars synced · just now',compact:'✓ Synced just now',warn:false};
      }
      return {
        full:`✓ ${unique.length} source${unique.length===1?'':'s'} healthy · ${when}`,
        compact:`✓ Synced ${when.replace(/^checked /,'')}`,
        warn:false
      };
    }
    const name=fail[0].name||fail[0].channel||'A calendar';
    return {
      full:`⚠ ${ok} of ${feeds.length} calendars synced · ${name} needs attention`,
      compact:`⚠ ${ok}/${feeds.length} synced`,
      warn:true
    };
  }

  function sourceStatusLabel(s){
    if(s.kind==='database'||s.live) return 'Live';
    if(s.duplicateOf) return 'Duplicate';
    if(s.ok===false) return 'Issue';
    return 'Connected';
  }

  function renderSync(){
    const el=document.getElementById('syncStrip');
    const summary=document.getElementById('syncSummary');
    const pill=document.getElementById('viewStatusPill');
    const full=document.getElementById('syncStatusFull');
    const compact=document.getElementById('syncStatusCompact');
    const statusBtn=document.getElementById('syncStatusBtn');
    if(!snapshot)return;
    const sources=snapshot.sync.sources||[];
    const copy=syncStatusCopy();
    const feeds=icalSources();
    const fail=feeds.filter(s=>s.ok===false).length;
    if(pill) pill.textContent=snapshot.sync.configError?'Feeds missing':(fail?`${fail} issue${fail===1?'':'s'}`:`${feeds.length+1} source${feeds.length===0?'':'s'}`);
    if(summary) summary.textContent='Source details';
    if(full) full.textContent=copy.full;
    if(compact) compact.textContent=copy.compact;
    if(statusBtn){
      statusBtn.classList.toggle('warn',copy.warn);
      statusBtn.classList.toggle('ok',!copy.warn);
    }
    if(!el)return;
    if(!sources.length){
      el.innerHTML='<div class="cal-source-list"><div class="cal-source"><div class="cal-source-head"><strong>No calendar sources</strong><span class="badge warn">Issue</span></div><div class="cal-source-meta">Guest booking stays fail-closed until a feed is connected.</div></div></div>';
      return;
    }
    el.className='cal-source-list';
    el.innerHTML=sources.map(s=>{
      const status=sourceStatusLabel(s);
      const badge=s.ok===false?'warn':(s.duplicateOf?'':'good');
      const lastChecked=formatCheckedAt(s.checkedAt||snapshot.sync.checkedAt);
      const lastOk=s.lastSuccessfulAt?formatCheckedAt(s.lastSuccessfulAt):null;
      const detail=s.kind==='database'||s.live
        ? 'Live / database'
        : (s.ok===false?(s.error||'Could not fetch this feed'):`${s.nights||s.count||0} nights`);
      const successLine=(!s.live&&lastOk)?`<div class="cal-source-meta">Last successful: ${esc(lastOk)}</div>`:'';
      const checkedLine=lastChecked?`<div class="cal-source-meta">Last checked: ${esc(s.live?'live read · '+lastChecked:lastChecked)}</div>`:'<div class="cal-source-meta">Last successful: not stored</div>';
      return `<article class="cal-source">
        <div class="cal-source-head"><strong>${esc(sourceLabel(s))}</strong><span class="badge ${badge}">${esc(status)}</span></div>
        <div class="cal-source-meta">${esc(detail)}</div>
        ${checkedLine}
        ${s.ok===false?'':successLine}
      </article>`;
    }).join('');
  }

  function moduleLinksHtml(ev){
    if(ev?.reservationId){
      const id=encodeURIComponent(ev.reservationId);
      return `<div class="cal-module-links">
        <a href="/owner-v1/reservations?booking=${id}">View Reservation</a>
        <a href="/owner-v1/financials?booking=${id}">View Financials</a>
        <a href="/owner-v1/communications?reservation=${id}">View Guest Messages</a>
      </div>`;
    }
    if(ev && (ev.kind==='ota'||ev.origin==='ota'||ev.origin==='env'||(ev.origin==='owner'&&ev.kind==='ota'))){
      return '<p class="cal-feed-note">Detailed reservation record is not available from this calendar feed.</p>';
    }
    return '';
  }

  function occupyingEntries(date,evs){
    return (evs||[]).filter(ev=>ev.canDelete&&ev.entryId&&ev.start<=date&&date<ev.end);
  }

  function nightActionsHtml(date,evs){
    const entries=occupyingEntries(date,evs);
    const reservations=(evs||[]).filter(ev=>ev.reservationId);
    const otaOnly=(evs||[]).some(ev=>!ev.reservationId&&(ev.kind==='ota'||ev.origin==='ota'||ev.origin==='env'));
    const pricingHref=`/owner-v1/pricing?date=${encodeURIComponent(date)}`;
    const reservationBtns=reservations.map(ev=>{
      const id=encodeURIComponent(ev.reservationId);
      return `<a class="btn btn-secondary" href="/owner-v1/reservations?booking=${id}">View Reservation</a>
        <a class="btn btn-secondary" href="/owner-v1/financials?booking=${id}">View Financials</a>
        <a class="btn btn-secondary" href="/owner-v1/communications?reservation=${id}">View Guest Messages</a>`;
    }).join('');
    const entryBtns=entries.map(ev=>{
      const label=ev.channel==='owner_stay'?'owner stay':'block';
      return `<button class="btn btn-secondary" type="button" data-cal-action="edit" data-entry-id="${ev.entryId}">Edit notes</button>
        <button class="btn danger-btn" type="button" data-cal-action="remove" data-entry-id="${ev.entryId}">Remove ${esc(label)}</button>`;
    }).join('');
    const otaNote=otaOnly&&!reservations.length
      ? '<p class="cal-feed-note">Detailed reservation record is not available from this calendar feed.</p>'
      : '';
    return `<div class="cal-night-actions" role="group" aria-label="Actions for this night">
      <p class="cal-night-actions-label">Actions for this night</p>
      <button class="btn btn-primary" type="button" data-cal-action="block" data-date="${esc(date)}">Block dates / Close night</button>
      <button class="btn btn-secondary" type="button" data-cal-action="owner-stay" data-date="${esc(date)}">Owner stay</button>
      <a class="btn btn-secondary" href="${esc(pricingHref)}">Adjust pricing</a>
      ${reservationBtns}
      ${entryBtns}
      <p class="cal-action-note">Adjust pricing opens Owner Pricing for ${esc(fmtShort(date))}. Rates are by season — there is no per-night override.</p>
      ${otaNote}
    </div>`;
  }

  function bindNightActions(root){
    if(!root)return;
    root.querySelectorAll('[data-cal-action]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const action=btn.getAttribute('data-cal-action');
        const date=btn.getAttribute('data-date')||focusDate;
        const entryId=Number(btn.getAttribute('data-entry-id'));
        if(action==='block') fillForm(date,{kind:'manual_block'});
        else if(action==='owner-stay') fillForm(date,{kind:'owner_stay'});
        else if(action==='edit'){
          const ev=(snapshot?.events||[]).find(item=>Number(item.entryId)===entryId);
          if(!ev)return;
          fillForm(ev.start,{kind:ev.channel==='owner_stay'?'owner_stay':'manual_block',entry:ev});
        }else if(action==='remove') removeEntry(entryId);
      });
    });
  }

  function turnBadges(date,ev){
    const bits=[];
    if(ev.start===date) bits.push('<span class="cal-turn cal-turn-in">Check-in</span>');
    if(ev.end===date) bits.push('<span class="cal-turn cal-turn-out">Check-out</span>');
    return bits.join(' ');
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
      const ciLabel=view==='week'?(ci?`<span class="cal-ci">Check-in</span>`:''):(ci?`<span class="cal-ci">CI</span>`:'');
      const coLabel=view==='week'?(co?`<span class="cal-co">Check-out</span>`:''):(co?`<span class="cal-co">CO</span>`:'');
      btn.innerHTML=`<span class="cal-day-num">${Number(date.slice(8,10))}</span>
        <span class="cal-markers">${ciLabel}${coLabel}${night.conflict?`<span class="cal-co">Overlap</span>`:''}</span>
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
      article.innerHTML=`<button type="button" class="cal-year-head" data-goto-month="${m}" aria-label="Open ${esc(MONTHS[m-1])} ${y}"><span>${esc(MONTHS[m-1])}</span><span>${occ?`${occ.pct}%`:''}</span></button>
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
    wrap.innerHTML=nightActionsHtml(date,evs)+(night?.conflict?`<div class="notice cal-conflict">Overlap: more than one source claims this night.</div>`:'');
    if(!evs.length){
      const empty=document.createElement('div');
      empty.className='empty';
      empty.textContent='Open night — guests can request this date unless an OTA feed is down.';
      wrap.appendChild(empty);
    }else{
      wrap.insertAdjacentHTML('beforeend', evs.map(ev=>`<article class="card">
        <div class="card-head"><div><h3>${esc(ev.label)} ${turnBadges(date,ev)}</h3><p>${esc(ev.start)} → ${esc(ev.end)} · ${esc(ev.nights)} night${ev.nights===1?'':'s'}</p></div><span class="badge ${ev.statusBucket==='hold'?'warn':ev.statusBucket==='cancelled'?'':'good'}">${esc(ev.statusBucket)}</span></div>
        <div class="reservation-meta">${esc(drawerGuestLabel(ev))}${ev.guestCount?` · ${esc(ev.guestCount)} guests`:''}${ev.sourceLabel?` · ${esc(ev.sourceLabel)}`:''}</div>
        ${contactLine(ev)}
        ${ev.notes?`<p class="reservation-meta">${esc(ev.notes)}</p>`:''}
        ${ev.occupancy?'':'<div class="metric-label">Excluded from occupancy %.</div>'}
      </article>`).join(''));
    }
    mount.append(wrap);
    bindNightActions(wrap);
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
    const details=!evs.length
      ? `<div class="empty">Open night — guests can request this date unless an OTA feed is down.</div>`
      : evs.map(ev=>`<article class="card" style="margin-top:12px;padding:14px">
        <div class="card-head"><div><h3>${esc(ev.label)} ${turnBadges(date,ev)}</h3><p>${esc(ev.start)} → ${esc(ev.end)} · ${esc(ev.nights)} night${ev.nights===1?'':'s'}</p></div><span class="badge ${ev.statusBucket==='hold'?'warn':ev.statusBucket==='cancelled'?'':'good'}">${esc(ev.statusBucket)}</span></div>
        <div class="reservation-meta">${esc(drawerGuestLabel(ev))}${ev.guestCount?` · ${esc(ev.guestCount)} guests`:''}${ev.sourceLabel?` · ${esc(ev.sourceLabel)}`:''}</div>
        ${contactLine(ev)}
        ${ev.notes?`<p class="reservation-meta">${esc(ev.notes)}</p>`:''}
        ${ev.occupancy?'':'<div class="metric-label">Excluded from occupancy %.</div>'}
      </article>`).join('');
    drawerBody.innerHTML=nightActionsHtml(date,evs)+details;
    drawer.classList.remove('hidden');
    drawerBackdrop?.classList.remove('hidden');
    drawer.setAttribute('aria-hidden','false');
    bindNightActions(drawerBody);
    drawerBody.querySelector('[data-cal-action]')?.focus();
  }

  function closeDrawer(){
    drawer?.classList.add('hidden');
    drawerBackdrop?.classList.add('hidden');
    drawer?.setAttribute('aria-hidden','true');
  }

  function openBlockDrawer(){
    blockDrawer?.classList.remove('hidden');
    blockDrawerBackdrop?.classList.remove('hidden');
    blockDrawer?.setAttribute('aria-hidden','false');
    document.getElementById('blockKind')?.focus();
  }

  function closeBlockDrawer(){
    blockDrawer?.classList.add('hidden');
    blockDrawerBackdrop?.classList.add('hidden');
    blockDrawer?.setAttribute('aria-hidden','true');
  }

  function fillForm(date,opts={}){
    const kind=opts.kind||'manual_block';
    const entry=opts.entry||null;
    const kindEl=document.getElementById('blockKind');
    const start=document.getElementById('blockStart');
    const end=document.getElementById('blockEnd');
    const notes=document.getElementById('blockNotes');
    const idEl=document.getElementById('blockEntryId');
    const title=document.getElementById('blockDrawerTitle');
    if(kindEl) kindEl.value=kind;
    if(start) start.value=entry?.start||date||'';
    if(end) end.value=entry?.end||(date?addDays(date,1):'');
    if(notes) notes.value=entry?.notes||'';
    if(idEl) idEl.value=entry?.entryId||'';
    if(title){
      if(entry) title.textContent=kind==='owner_stay'?'Edit owner stay':'Edit block';
      else title.textContent=kind==='owner_stay'?'Owner stay':'Block dates';
    }
    closeDrawer();
    openBlockDrawer();
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

  function agendaDayLabel(date){
    const today=snapshot?.range?.today;
    if(date===today) return 'Today';
    if(today&&date===addDays(today,1)) return 'Tomorrow';
    return fmt(date);
  }

  function renderUpcoming(){
    const el=document.getElementById('upcomingList');
    if(!el||!snapshot)return;
    const rows=(snapshot.operationsAgenda||[]).filter(item=>{
      if(channelFilter!=='all'&&item.channel!==channelFilter) return false;
      return true;
    });
    if(!rows.length){el.innerHTML='<div class="empty">No upcoming operations.</div>';return;}
    const groups=[];
    for(const item of rows){
      const last=groups[groups.length-1];
      if(!last||last.date!==item.date) groups.push({date:item.date,items:[item]});
      else last.items.push(item);
    }
    el.innerHTML=groups.map(group=>`<div class="cal-agenda-day">
      <h4>${esc(agendaDayLabel(group.date))}</h4>
      ${group.items.map(item=>{
        const extra=item.guestName?` · ${esc(item.guestName)}`:'';
        return `<div class="list-row" data-open="${esc(item.kind==='check_out'||item.kind==='owner_stay_ends'||item.kind==='block_ends'?addDays(item.date,-1):item.date)}"><div><strong>${esc(item.label)}</strong><span>${esc(item.sourceLabel||item.channel)}${extra}</span></div><span class="badge">${esc(item.channel)}</span></div>`;
      }).join('')}
    </div>`).join('');
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

  async function load(opts={}){
    const action=opts.fullRefresh?'calendar_sync':'calendar_view';
    try{
      const data=await ownerApi(action,{view,year,month,focusDate});
      snapshot=data;
      year=data.range.year;
      month=data.range.month;
      if((view==='week'||view==='day')&&!focusDate) focusDate=view==='day'?data.range.day:data.range.weekStart;
      if(view==='day'&&data.range.day) focusDate=data.range.day;
      if(opts.fullRefresh) lastFullSyncAt=data.sync?.checkedAt||new Date().toISOString();
      applySettings(data.settings);
      render();
      return data;
    }catch(e){
      if(e.message==='unauthorized')return;
      showNotice(e.message||'Could not load calendar');
      if(opts.fullRefresh) throw e;
    }
  }

  async function syncCalendars(){
    if(syncing) return;
    syncing=true;
    clearTimeout(syncButtonReset);
    setSyncButton('syncing');
    try{
      const data=await load({fullRefresh:true});
      const fail=icalSources().some(s=>s.ok===false)||data?.sync?.configError;
      setSyncButton(fail?'issue':'synced');
      if(!fail){
        syncButtonReset=setTimeout(()=>{if(!syncing) setSyncButton('idle');},2200);
      }
    }catch{
      setSyncButton('issue');
    }finally{
      syncing=false;
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
    focusDate=isoFromParts(year||snapshot?.range?.year,month,view==='year'?1:currentDayNumber());
    year=Number(focusDate.slice(0,4));
    if(view==='year'){
      document.getElementById(`calYearMonth-${next}`)?.scrollIntoView({behavior:'smooth',block:'nearest'});
      document.querySelectorAll('.cal-year-month').forEach(el=>el.classList.toggle('current',el.id===`calYearMonth-${next}`));
      return;
    }
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
      const y=year||snapshot?.range?.year;
      const m=month||snapshot?.range?.month||1;
      if(v==='week'||v==='day') focusDate=isoFromParts(y,m,currentDayNumber());
      if(v==='year'&&y) focusDate=isoFromParts(y,m,1);
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
  document.getElementById('blockDrawerClose')?.addEventListener('click',closeBlockDrawer);
  blockDrawerBackdrop?.addEventListener('click',closeBlockDrawer);
  document.getElementById('blockDatesBtn')?.addEventListener('click',()=>{
    fillForm('',{kind:'manual_block'});
  });
  document.getElementById('syncCalendarsBtn')?.addEventListener('click',()=>syncCalendars());
  document.getElementById('syncStatusBtn')?.addEventListener('click',()=>{
    const details=document.getElementById('syncDetails');
    if(!details)return;
    details.open=true;
    details.scrollIntoView({behavior:'smooth',block:'nearest'});
    document.getElementById('syncStatusBtn')?.setAttribute('aria-expanded','true');
  });
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape')return;
    closeDrawer();
    closeBlockDrawer();
  });

  document.getElementById('blockForm')?.addEventListener('submit',async e=>{
    e.preventDefault();
    const kind=document.getElementById('blockKind')?.value;
    const startDate=document.getElementById('blockStart')?.value;
    const endDate=document.getElementById('blockEnd')?.value;
    const notes=document.getElementById('blockNotes')?.value||'';
    const entryId=Number(document.getElementById('blockEntryId')?.value);
    try{
      const overlap=overlappingEvents(startDate,endDate).filter(ev=>ev.occupancy&&Number(ev.entryId)!==entryId);
      if(entryId) await ownerApi('calendar_entry_update',{id:entryId,kind,startDate,endDate,notes});
      else await ownerApi('calendar_entry_save',{kind,startDate,endDate,notes});
      e.target.reset();
      if(document.getElementById('blockEntryId')) document.getElementById('blockEntryId').value='';
      const saved=entryId?(kind==='owner_stay'?'Owner stay updated':'Block updated'):(kind==='owner_stay'?'Owner stay saved':'Manual block saved');
      showNotice(overlap.length?`${saved}. Overlaps an existing guest stay or OTA block.`:saved, overlap.length?7000:4500);
      closeBlockDrawer();
      await load();
    }catch(err){showNotice(err.message||'Could not save');}
  });

  window.addEventListener('cjt-calendar-feeds-updated',()=>requestLoad());
  const boot=()=>{if(!document.getElementById('ownerApp')?.classList.contains('hidden'))requestLoad();};
  setTimeout(boot,400);
  setTimeout(boot,1200);
})();
