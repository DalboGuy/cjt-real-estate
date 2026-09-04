(()=>{
  if(document.documentElement.dataset.opsDashboardLoaded)return;
  document.documentElement.dataset.opsDashboardLoaded='1';

  const COLORS={airbnb:'#c92f4b',vrbo:'#1769a6','booking.com':'#003b73',houfy:'#007b83',direct:'#8a6500',other:'#52666a'};
  const LABELS={airbnb:'Airbnb',vrbo:'Vrbo','booking.com':'Booking.com',houfy:'Houfy',direct:'CJT Direct',other:'Other'};
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(v||0));
  const channelLabel=s=>LABELS[s]||String(s||'Unknown');
  const localISO=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const addDays=(iso,n)=>{const d=new Date(`${iso}T12:00:00`);d.setDate(d.getDate()+n);return localISO(d)};
  const daysBetween=(a,b)=>Math.max(0,Math.round((new Date(`${b}T00:00:00Z`)-new Date(`${a}T00:00:00Z`))/86400000));
  const today=()=>localISO(new Date());
  const activeReservation=r=>!['released','expired','cancelled'].includes(r.status);
  const activeFinancial=f=>f.status!=='cancelled';
  const duration=e=>daysBetween(e.start,e.end);
  const sourceBadge=s=>`<span class="ops-source" style="--ops-source:${COLORS[s]||COLORS.other}">${esc(channelLabel(s))}</span>`;

  const style=document.createElement('style');
  style.textContent=`
    .ops-header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap}
    .ops-header h2{margin:0 0 4px}.ops-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:14px 0}
    .ops-kpi{background:#fff;border:1px solid var(--line);border-radius:16px;padding:15px;min-height:92px}.ops-kpi .label{font-size:.76rem;color:var(--muted);font-weight:800}.ops-kpi b{display:block;font-size:1.45rem;margin-top:5px}.ops-kpi small{color:var(--muted)}
    .ops-layout{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(320px,.8fr);gap:14px}.ops-stack{display:grid;gap:14px}.ops-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px}.ops-card h3{margin:0 0 10px}
    .ops-attention{display:grid;gap:8px}.ops-item{border:1px solid var(--line);border-left:5px solid #809295;border-radius:12px;padding:11px 12px;background:#fff}.ops-item.urgent{border-left-color:#9d2f2f;background:#fff8f8}.ops-item.warn{border-left-color:#b27b18;background:#fffbf0}.ops-item.good{border-left-color:#357a55;background:#f5fbf7}.ops-item strong{display:block}.ops-item .meta{margin-top:3px}
    .ops-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}.ops-list{display:grid;gap:8px}.ops-stay{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;border:1px solid var(--line);border-radius:12px;padding:10px}.ops-date{font-weight:900;font-size:.92rem}.ops-date small{display:block;color:var(--muted);font-weight:600}.ops-source{display:inline-flex;align-items:center;background:var(--ops-source);color:#fff;border-radius:999px;padding:4px 7px;font-size:.67rem;font-weight:900;white-space:nowrap}
    .ops-health{display:flex;gap:7px;flex-wrap:wrap}.ops-health span{border-radius:999px;padding:5px 8px;font-size:.72rem;font-weight:800}.ops-health .ok{background:#def2e4;color:#225b38}.ops-health .bad{background:#f7dede;color:#7a2929}.ops-health .note{background:#eef2f1;color:#42575b}
    .ops-revenue-row{display:grid;grid-template-columns:130px 1fr auto;gap:10px;align-items:center;margin:9px 0}.ops-bar{height:9px;background:#edf1f0;border-radius:999px;overflow:hidden}.ops-bar span{display:block;height:100%;background:#315d64;border-radius:999px}.ops-month{display:grid;grid-template-columns:100px repeat(4,1fr);gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line);font-size:.82rem}.ops-month.head{font-weight:900;color:var(--muted)}.ops-month:last-child{border-bottom:0}
    .ops-completeness{display:flex;align-items:center;gap:12px}.ops-ring{width:74px;height:74px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(#357a55 var(--pct),#edf1f0 0);position:relative}.ops-ring:after{content:'';width:56px;height:56px;border-radius:50%;background:#fff;position:absolute}.ops-ring b{z-index:1;font-size:.9rem}.ops-activity{display:grid;gap:7px}.ops-activity .row{padding:8px 0;border-bottom:1px solid var(--line)}.ops-activity .row:last-child{border-bottom:0}
    .ops-shortcuts{display:flex;gap:8px;flex-wrap:wrap}.ops-empty{color:var(--muted);font-size:.86rem;padding:7px 0}
    @media(max-width:1000px){.ops-grid{grid-template-columns:repeat(2,1fr)}.ops-layout{grid-template-columns:1fr}}
    @media(max-width:620px){.ops-grid,.ops-two{grid-template-columns:1fr}.ops-month{grid-template-columns:80px repeat(4,minmax(62px,1fr));overflow-x:auto}.ops-stay{grid-template-columns:1fr auto}.ops-stay .ops-date{grid-column:1/-1}}
  `;
  document.head.appendChild(style);

  const tabs=document.querySelector('.tabs');
  const reservationTab=document.querySelector('.tab[data-tab="reservations"]');
  if(!tabs||!reservationTab)return;
  const tab=document.createElement('button');
  tab.className='tab';tab.dataset.tab='dashboard';tab.textContent='Dashboard';
  tabs.insertBefore(tab,reservationTab);

  const section=document.createElement('section');
  section.id='dashboard';section.className='panel';
  section.innerHTML=`
    <div class="ops-header"><div><h2>Operations Dashboard</h2><p class="meta" style="margin:0">What needs attention now, what's happening next, and what the booked revenue looks like.</p></div><div class="ops-shortcuts"><button id="opsRefresh" class="btn ghost small" type="button">Refresh</button><button class="btn ghost small" type="button" data-open-tab="bookingCalendar">Booking Calendar</button><button class="btn ghost small" type="button" data-open-tab="tasks">Task Board</button></div></div>
    <div class="ops-grid">
      <div class="ops-kpi"><span class="label">Needs attention</span><b id="opsAttentionCount">0</b><small>holds, contracts, deposits, tasks, sync</small></div>
      <div class="ops-kpi"><span class="label">Arrivals · next 14 days</span><b id="opsArrivalCount">0</b><small>tracked + calendar-detected stays</small></div>
      <div class="ops-kpi"><span class="label">Expected payout · next 90 days</span><b id="opsPayout90">$0</b><small>from revenue-tracked bookings</small></div>
      <div class="ops-kpi"><span class="label">Revenue data matched</span><b id="opsMatchPct">0%</b><small>future stay ranges with financial records</small></div>
    </div>
    <div class="ops-layout">
      <div class="ops-stack">
        <div class="ops-card"><h3>Needs attention</h3><div id="opsAttention" class="ops-attention"></div></div>
        <div class="ops-card"><h3>Next 14 days</h3><div class="ops-two"><div><strong>Arrivals</strong><div id="opsArrivals" class="ops-list" style="margin-top:8px"></div></div><div><strong>Departures</strong><div id="opsDepartures" class="ops-list" style="margin-top:8px"></div></div></div></div>
        <div class="ops-card"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"><div><h3 style="margin:0">Revenue outlook</h3><div class="meta">Actual entered/imported booking financials only. No rate estimates.</div></div><button class="btn ghost small" type="button" data-open-tab="bookingCalendar">Resolve unmatched stays</button></div><div id="opsRevenueKpis" class="ops-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:6px"></div><div id="opsMonthly"></div></div>
      </div>
      <div class="ops-stack">
        <div class="ops-card"><h3>Calendar & integration health</h3><div id="opsHealth" class="ops-health"></div><div id="opsHealthNotes" class="meta" style="margin-top:10px"></div></div>
        <div class="ops-card"><h3>Revenue completeness</h3><div id="opsCompleteness"></div></div>
        <div class="ops-card"><h3>Revenue by channel</h3><div id="opsChannels"></div></div>
        <div class="ops-card"><h3>Recent owner activity</h3><div id="opsActivity" class="ops-activity"></div></div>
      </div>
    </div>`;
  const reservations=document.getElementById('reservations');
  reservations.parentNode.insertBefore(section,reservations);

  let calendar={otaEvents:[],directReservations:[],financials:[],sources:[],checkedAt:null};
  let loading=false,firstOpen=true;

  function openTab(id){
    const button=document.querySelector(`.tab[data-tab="${id}"]`);
    if(!button)return;
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
    button.classList.add('active');document.getElementById(id)?.classList.add('active');
    if(id==='dashboard')refresh();
  }
  tab.addEventListener('click',()=>openTab('dashboard'));
  section.querySelectorAll('[data-open-tab]').forEach(b=>b.addEventListener('click',()=>openTab(b.dataset.openTab)));

  async function fetchCalendar(){
    const r=await fetch('/api/owner-calendar',{headers:{'Content-Type':'application/json'}});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||'calendar_load_failed');
    calendar=d;return d;
  }

  function currentState(){try{return state||{}}catch{return {}}}
  function groupedCalendarStays(){
    const now=today(),map=new Map();
    for(const e of calendar.otaEvents||[]){
      if(!e||e.end<=now||e.kind!=='reservation_like'||duration(e)>31)continue;
      const k=`${e.start}|${e.end}`;
      if(!map.has(k))map.set(k,{start:e.start,end:e.end,sources:new Set(),calendarOnly:true});
      map.get(k).sources.add(e.source);
    }
    return [...map.values()].map(x=>({...x,sources:[...x.sources]}));
  }
  function financials(){return (calendar.financials||[]).filter(activeFinancial)}
  function futureRanges(){
    const now=today(),map=new Map();
    for(const g of groupedCalendarStays())map.set(`${g.start}|${g.end}`,g);
    for(const r of (currentState().reservations||[]).filter(activeReservation).filter(r=>r.checkout>now)){
      const k=`${r.checkin}|${r.checkout}`;if(!map.has(k))map.set(k,{start:r.checkin,end:r.checkout,sources:['direct'],direct:true});
    }
    return [...map.values()].sort((a,b)=>a.start.localeCompare(b.start));
  }
  function matchStats(){
    const ranges=futureRanges(),fins=financials().filter(f=>f.checkout>today());
    let matched=0;
    for(const g of ranges)if(fins.some(f=>f.checkin===g.start&&f.checkout===g.end))matched++;
    return {total:ranges.length,matched,unmatched:Math.max(0,ranges.length-matched),pct:ranges.length?Math.round(matched/ranges.length*100):100};
  }
  function stayRecords(){
    const now=today(),out=[];
    for(const f of financials().filter(f=>f.checkout>=now))out.push({start:f.checkin,end:f.checkout,channel:f.channel,label:channelLabel(f.channel),authoritative:true,ref:f.external_reference||'',gross:Number(f.gross_revenue||0),payout:Number(f.expected_payout||0)});
    for(const r of (currentState().reservations||[]).filter(activeReservation).filter(r=>r.checkout>=now)){
      if(out.some(x=>x.start===r.checkin&&x.end===r.checkout))continue;
      out.push({start:r.checkin,end:r.checkout,channel:'direct',label:'CJT Direct',authoritative:true,ref:r.id});
    }
    for(const g of groupedCalendarStays()){
      if(out.some(x=>x.start===g.start&&x.end===g.end))continue;
      out.push({start:g.start,end:g.end,channel:g.sources.length===1?g.sources[0]:'other',label:g.sources.length===1?channelLabel(g.sources[0]):'Channel unverified',sources:g.sources,authoritative:false});
    }
    return out.sort((a,b)=>a.start.localeCompare(b.start));
  }
  function inWindow(date,start,end){return date>=start&&date<end}

  function buildAttention(){
    const s=currentState(),nowMs=Date.now(),items=[];
    for(const r of (s.reservations||[]).filter(activeReservation)){
      if(['inquiry_hold','hold_verified'].includes(r.status)&&r.hold_expires_at){
        const hrs=(new Date(r.hold_expires_at)-nowMs)/3600000;
        if(hrs<=24)items.push({severity:hrs<=6?'urgent':'warn',title:`Hold ${hrs<=0?'expired / expiring':'expires soon'} · ${r.id}`,meta:`${r.checkin} → ${r.checkout} · ${hrs<=0?'check immediately':Math.max(1,Math.round(hrs))+'h remaining'}`,tab:'reservations'});
      }
      if(r.contract_sent_at&&!r.contract_signed_at)items.push({severity:'warn',title:`Contract awaiting signature · ${r.id}`,meta:`Stay ${r.checkin} → ${r.checkout}`,tab:'reservations'});
      if(r.contract_signed_at&&!r.deposit_received_at)items.push({severity:'urgent',title:`Deposit outstanding · ${r.id}`,meta:`Contract signed · stay ${r.checkin} → ${r.checkout}`,tab:'reservations'});
    }
    for(const t of s.tasks||[]){
      if(['done','cancelled'].includes(t.status)||!t.due_at)continue;
      if(new Date(t.due_at).getTime()<nowMs)items.push({severity:t.priority==='urgent'?'urgent':'warn',title:`Overdue task · ${t.title}`,meta:`${t.assigned_user_name||'Unassigned'} · due ${new Date(t.due_at).toLocaleString()}`,tab:'tasks'});
    }
    for(const src of calendar.sources||[])if(!src.ok)items.push({severity:'urgent',title:`Calendar sync error · ${channelLabel(src.name)}`,meta:src.error||'Source unavailable',tab:'bookingCalendar'});
    const ms=matchStats();
    if(ms.unmatched)items.push({severity:'warn',title:`${ms.unmatched} future stay range${ms.unmatched===1?'':'s'} missing revenue details`,meta:'Calendar is blocked, but gross / payout data is not yet matched.',tab:'bookingCalendar'});
    const longBlocks=(calendar.otaEvents||[]).filter(e=>e.end>today()&&duration(e)>31);
    if(longBlocks.length)items.push({severity:'warn',title:`${longBlocks.length} unusually long calendar block${longBlocks.length===1?'':'s'} need review`,meta:'Long iCal ranges may be booking-window closures rather than guest reservations.',tab:'bookingCalendar'});
    return items;
  }

  function stayRow(x,dateType){
    const date=dateType==='arrival'?x.start:x.end;
    const source=x.authoritative?sourceBadge(x.channel):`<span class="ops-source" style="--ops-source:#52666a">Verify channel</span>`;
    const info=x.authoritative?(x.ref?`Ref ${esc(x.ref)}`:'Revenue/direct record'):`Seen in ${(x.sources||[]).map(channelLabel).join(', ')}`;
    return `<div class="ops-stay"><div class="ops-date">${esc(date)}<small>${dateType==='arrival'?'Check-in':'Checkout'}</small></div><div><strong>${esc(x.label)}</strong><div class="meta">${esc(x.start)} → ${esc(x.end)} · ${esc(info)}</div></div>${source}</div>`;
  }

  function monthKey(iso){return iso.slice(0,7)}
  function monthLabel(key){const [y,m]=key.split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString(undefined,{month:'short',year:'numeric'})}
  function renderRevenue(){
    const fins=financials(),now=today(),d90=addDays(now,90),ytdStart=`${now.slice(0,4)}-01-01`;
    const next90=fins.filter(f=>inWindow(f.checkin,now,d90)),ytd=fins.filter(f=>f.checkin>=ytdStart&&f.checkin<=now);
    const sum=(rows,k)=>rows.reduce((a,r)=>a+Number(r[k]||0),0);
    const gross90=sum(next90,'gross_revenue'),payout90=sum(next90,'expected_payout'),collected90=sum(next90,'collected_amount');
    const nights90=next90.reduce((a,r)=>a+daysBetween(r.checkin,r.checkout),0),adr=nights90?gross90/nights90:0;
    document.getElementById('opsPayout90').textContent=money(payout90);
    document.getElementById('opsRevenueKpis').innerHTML=`
      <div class="ops-kpi"><span class="label">Gross · next 90d</span><b>${money(gross90)}</b><small>${next90.length} tracked stay${next90.length===1?'':'s'}</small></div>
      <div class="ops-kpi"><span class="label">Collected · next 90d</span><b>${money(collected90)}</b><small>recorded receipts / payouts</small></div>
      <div class="ops-kpi"><span class="label">Outstanding · next 90d</span><b>${money(Math.max(0,payout90-collected90))}</b><small>expected payout less collected</small></div>
      <div class="ops-kpi"><span class="label">Tracked ADR · next 90d</span><b>${money(adr)}</b><small>${nights90} booked nights</small></div>`;

    const base=new Date();base.setDate(1);
    const keys=[];for(let i=0;i<6;i++){const d=new Date(base.getFullYear(),base.getMonth()+i,1);keys.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)}
    const rows=keys.map(k=>{const rs=fins.filter(f=>monthKey(f.checkin)===k);return {k,stays:rs.length,gross:sum(rs,'gross_revenue'),payout:sum(rs,'expected_payout'),collected:sum(rs,'collected_amount')}});
    document.getElementById('opsMonthly').innerHTML=`<div class="ops-month head"><span>Month</span><span>Stays</span><span>Gross</span><span>Payout</span><span>Collected</span></div>`+rows.map(r=>`<div class="ops-month"><strong>${monthLabel(r.k)}</strong><span>${r.stays}</span><span>${money(r.gross)}</span><span>${money(r.payout)}</span><span>${money(r.collected)}</span></div>`).join('');

    const ytdGross=sum(ytd,'gross_revenue');
    const channelMap=new Map();
    for(const f of fins.filter(f=>f.checkout>=now)){const c=f.channel||'other',v=channelMap.get(c)||{gross:0,payout:0,stays:0};v.gross+=Number(f.gross_revenue||0);v.payout+=Number(f.expected_payout||0);v.stays++;channelMap.set(c,v)}
    const channels=[...channelMap.entries()].sort((a,b)=>b[1].gross-a[1].gross),max=Math.max(1,...channels.map(x=>x[1].gross));
    document.getElementById('opsChannels').innerHTML=channels.length?channels.map(([c,v])=>`<div class="ops-revenue-row"><div>${sourceBadge(c)}</div><div class="ops-bar"><span style="width:${Math.max(3,Math.round(v.gross/max*100))}%"></span></div><div style="text-align:right"><strong>${money(v.gross)}</strong><div class="meta">${v.stays} stay${v.stays===1?'':'s'}</div></div></div>`).join(''):`<div class="ops-empty">No revenue records yet. Add actual booking financials in Booking Calendar.</div>`;
    return {gross90,payout90,collected90,ytdGross};
  }

  function renderHealth(){
    const health=(calendar.sources||[]).map(s=>`<span class="${s.ok?'ok':'bad'}">${esc(channelLabel(s.name))} · ${s.ok?'connected':'error'}</span>`).join('')+`<span class="ok">CJT Direct · connected</span>`;
    document.getElementById('opsHealth').innerHTML=health||'<span class="note">No health data</span>';
    const long=(calendar.otaEvents||[]).filter(e=>e.end>today()&&duration(e)>31);
    document.getElementById('opsHealthNotes').textContent=long.length?`${long.length} unusually long future iCal range${long.length===1?'':'s'} flagged for review; these are not automatically counted as guest reservations.`:'No unusually long future reservation-like calendar ranges detected.';
  }
  function renderCompleteness(){
    const ms=matchStats();document.getElementById('opsMatchPct').textContent=`${ms.pct}%`;
    document.getElementById('opsCompleteness').innerHTML=`<div class="ops-completeness"><div class="ops-ring" style="--pct:${ms.pct*3.6}deg"><b>${ms.pct}%</b></div><div><strong>${ms.matched} of ${ms.total} future stay ranges matched</strong><div class="meta">${ms.unmatched} still need actual gross / payout details. Long calendar blocks over 31 nights are excluded from this calculation.</div><div style="margin-top:8px"><button class="btn ghost small" type="button" data-open-inline>Open Booking Calendar</button></div></div></div>`;
    document.querySelector('[data-open-inline]')?.addEventListener('click',()=>openTab('bookingCalendar'));
  }
  function renderActivity(){
    const rows=(currentState().events||[]).slice(0,8);
    document.getElementById('opsActivity').innerHTML=rows.length?rows.map(e=>`<div class="row"><strong>${esc(String(e.event_type||'activity').replaceAll('_',' '))}</strong><div class="meta">${esc(e.reservation_id||'')} · ${esc(e.actor||'system')} · ${new Date(e.created_at).toLocaleString()}</div></div>`).join(''):'<div class="ops-empty">No recent booking activity.</div>';
  }

  function render(){
    const att=buildAttention(),now=today(),end14=addDays(now,14),stays=stayRecords();
    const arrivals=stays.filter(x=>inWindow(x.start,now,end14)),departures=stays.filter(x=>inWindow(x.end,now,end14));
    document.getElementById('opsAttentionCount').textContent=att.length;document.getElementById('opsArrivalCount').textContent=arrivals.length;
    document.getElementById('opsAttention').innerHTML=att.length?att.slice(0,20).map((x,i)=>`<div class="ops-item ${x.severity}"><strong>${esc(x.title)}</strong><div class="meta">${esc(x.meta)}</div><div style="margin-top:7px"><button class="btn ghost small" type="button" data-att="${i}">Review</button></div></div>`).join(''):'<div class="ops-item good"><strong>No urgent operational items detected</strong><div class="meta">Based on the current owner records, tasks, calendar health and revenue-match queue.</div></div>';
    document.querySelectorAll('[data-att]').forEach(b=>b.addEventListener('click',()=>openTab(att[Number(b.dataset.att)]?.tab||'reservations')));
    document.getElementById('opsArrivals').innerHTML=arrivals.length?arrivals.map(x=>stayRow(x,'arrival')).join(''):'<div class="ops-empty">No arrivals detected in the next 14 days.</div>';
    document.getElementById('opsDepartures').innerHTML=departures.length?departures.map(x=>stayRow(x,'departure')).join(''):'<div class="ops-empty">No departures detected in the next 14 days.</div>';
    renderRevenue();renderHealth();renderCompleteness();renderActivity();
  }

  async function refresh(){
    if(loading)return;loading=true;const btn=document.getElementById('opsRefresh');if(btn){btn.disabled=true;btn.textContent='Refreshing…'}
    try{await fetchCalendar();render();}
    catch(e){document.getElementById('opsAttention').innerHTML=`<div class="ops-item urgent"><strong>Dashboard refresh failed</strong><div class="meta">${esc(e.message)}</div></div>`;}
    finally{loading=false;if(btn){btn.disabled=false;btn.textContent='Refresh'}}
  }
  document.getElementById('opsRefresh').addEventListener('click',refresh);

  function activateDefault(){
    const portal=document.getElementById('portal');if(!portal||portal.classList.contains('hidden')||!firstOpen)return;
    firstOpen=false;openTab('dashboard');
  }
  activateDefault();
  const portal=document.getElementById('portal');if(portal)new MutationObserver(activateDefault).observe(portal,{attributes:true,attributeFilter:['class']});
})();
