(()=>{
  const root=document.documentElement;
  if(root.dataset.financeDashboardLoaded)return;
  root.dataset.financeDashboardLoaded='1';

  const CHANNELS={
    airbnb:{label:'Airbnb',color:'#d93455'},
    vrbo:{label:'Vrbo',color:'#1769aa'},
    'booking.com':{label:'Booking.com',color:'#003b73'},
    houfy:{label:'Houfy',color:'#007c83'},
    direct:{label:'CJT Direct',color:'#9a6b00'},
    other:{label:'Other',color:'#52666a'}
  };
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(v||0));
  const pct=v=>`${Number(v||0).toFixed(1)}%`;
  const channel=s=>CHANNELS[s]||{label:String(s||'Unknown'),color:'#52666a'};
  const eachNight=(start,end)=>{const out=[];for(let d=new Date(`${start}T00:00:00Z`),e=new Date(`${end}T00:00:00Z`);d<e;d.setUTCDate(d.getUTCDate()+1))out.push(d.toISOString().slice(0,10));return out};
  const daysInYear=y=>((y%4===0&&y%100!==0)||y%400===0)?366:365;
  const today=()=>new Date().toISOString().slice(0,10);

  const style=document.createElement('style');
  style.textContent=`
    .fin-shell{display:grid;gap:14px}
    .fin-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap}
    .fin-head h2{margin:0 0 4px}.fin-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .fin-year{min-width:88px;text-align:center;font-weight:900;padding:8px 12px;border:1px solid var(--line);background:#fff;border-radius:999px}
    .fin-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}
    .fin-kpi{background:#fff;border:1px solid var(--line);border-radius:16px;padding:15px;box-shadow:0 8px 24px rgba(13,43,49,.045);min-height:104px}
    .fin-kpi span{display:block;color:var(--muted);font-size:.73rem;font-weight:850;letter-spacing:.01em}
    .fin-kpi b{display:block;font-size:1.48rem;margin:8px 0 4px;letter-spacing:-.03em}.fin-kpi small{color:var(--muted);font-size:.72rem}
    .fin-grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(300px,.55fr);gap:14px}
    .fin-card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:17px;box-shadow:0 10px 28px rgba(13,43,49,.045)}
    .fin-card h3{margin:0}.fin-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:12px}
    .fin-chart-wrap{overflow-x:auto}.fin-chart{width:100%;min-width:690px;height:235px;display:block}
    .fin-legend{display:flex;gap:14px;flex-wrap:wrap;margin-top:8px;color:var(--muted);font-size:.76rem}.fin-legend i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px}
    .fin-channel{display:grid;gap:9px}.fin-channel-row{display:grid;grid-template-columns:100px 1fr auto;gap:9px;align-items:center;font-size:.8rem}.fin-channel-bar{height:9px;background:#edf1f0;border-radius:999px;overflow:hidden}.fin-channel-bar span{display:block;height:100%;border-radius:999px}
    .fin-exceptions{display:grid;gap:8px}.fin-exception{border:1px solid var(--line);border-left:4px solid #b27b18;border-radius:12px;padding:10px 11px;background:#fffdf8}.fin-exception.urgent{border-left-color:#9d2f2f;background:#fff8f8}.fin-exception strong{display:block}.fin-exception .meta{margin-top:3px}
    .fin-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:14px}.fin-table{width:100%;border-collapse:collapse;min-width:940px;background:#fff}.fin-table th,.fin-table td{padding:10px 11px;border-bottom:1px solid var(--line);text-align:left;font-size:.79rem;vertical-align:middle}.fin-table th{font-size:.7rem;text-transform:uppercase;letter-spacing:.045em;color:var(--muted);background:#f8fbfa;position:sticky;top:0;z-index:1}.fin-table tr:last-child td{border-bottom:0}.fin-table .num{text-align:right;font-variant-numeric:tabular-nums}.fin-source{display:inline-flex;align-items:center;color:#fff;border-radius:999px;padding:4px 7px;font-size:.67rem;font-weight:900;white-space:nowrap}.fin-status{display:inline-flex;border-radius:999px;padding:4px 7px;font-size:.68rem;font-weight:900;background:#eef2f1}.fin-status.pending{background:#fff1cc;color:#6a4b0b}.fin-status.completed{background:#dff3e7;color:#1f5b39}.fin-status.cancelled{background:#f4dddd;color:#7a2929}.fin-empty{color:var(--muted);font-size:.85rem;padding:8px 0}
    .fin-note{padding:10px 12px;border-radius:12px;background:#f8fbfa;border:1px solid var(--line);font-size:.76rem;color:var(--muted)}
    @media(max-width:1120px){.fin-kpis{grid-template-columns:repeat(3,1fr)}.fin-grid{grid-template-columns:1fr}}
    @media(max-width:650px){.fin-kpis{grid-template-columns:1fr 1fr}.fin-kpi{min-height:92px}.fin-kpi b{font-size:1.25rem}.fin-channel-row{grid-template-columns:88px 1fr auto}}
  `;
  document.head.appendChild(style);

  const tabs=document.querySelector('.tabs');
  const reservationsTab=document.querySelector('.tab[data-tab="reservations"]');
  if(!tabs||!reservationsTab)return;
  const tab=document.createElement('button');
  tab.className='tab';tab.dataset.tab='finance';tab.textContent='Finance';
  const dashTab=document.querySelector('.tab[data-tab="dashboard"]');
  dashTab?dashTab.after(tab):reservationsTab.before(tab);

  const section=document.createElement('section');
  section.id='finance';section.className='panel';
  section.innerHTML=`
    <div class="fin-shell">
      <div class="fin-head">
        <div><h2>Financial Dashboard</h2><p class="meta" style="margin:0">Booked revenue, payouts, collection status, occupancy and channel mix from the owner revenue ledger.</p></div>
        <div class="fin-controls"><button id="finPrev" class="btn ghost small" type="button">←</button><span id="finYear" class="fin-year"></span><button id="finNext" class="btn ghost small" type="button">→</button><button id="finRefresh" class="btn ghost small" type="button">Refresh</button><button id="finLedger" class="btn ghost small" type="button">Booking Calendar</button></div>
      </div>
      <div class="fin-kpis">
        <div class="fin-kpi"><span>Gross booked revenue</span><b id="finGross">$0</b><small>Bookings checking in this year</small></div>
        <div class="fin-kpi"><span>Expected payouts</span><b id="finPayout">$0</b><small>Net host payout entered/imported</small></div>
        <div class="fin-kpi"><span>Collected</span><b id="finCollected">$0</b><small>Recorded as received</small></div>
        <div class="fin-kpi"><span>Outstanding</span><b id="finOutstanding">$0</b><small>Expected payout less collected</small></div>
        <div class="fin-kpi"><span>Calendar occupancy</span><b id="finOccupancy">0%</b><small>Unique booked nights ÷ calendar days</small></div>
        <div class="fin-kpi"><span>ADR · tracked bookings</span><b id="finAdr">$0</b><small>Gross ÷ nights on revenue records</small></div>
      </div>
      <div class="fin-grid">
        <div class="fin-card">
          <div class="fin-card-head"><div><h3>Revenue performance</h3><div class="meta">Revenue is assigned to the reservation check-in month.</div></div><div class="meta" id="finTracked"></div></div>
          <div class="fin-chart-wrap"><svg id="finChart" class="fin-chart" viewBox="0 0 720 235" role="img" aria-label="Monthly gross revenue and expected payout chart"></svg></div>
          <div class="fin-legend"><span><i style="background:#315d64"></i>Gross revenue</span><span><i style="background:#9a6b00"></i>Expected payout</span></div>
        </div>
        <div class="fin-card"><div class="fin-card-head"><div><h3>Revenue by channel</h3><div class="meta">Gross booked revenue</div></div></div><div id="finChannels" class="fin-channel"></div></div>
      </div>
      <div class="fin-grid">
        <div class="fin-card"><div class="fin-card-head"><div><h3>Booking financial ledger</h3><div class="meta">The booking_financials table is authoritative for channel and dollars.</div></div></div><div id="finTable"></div></div>
        <div class="fin-card"><div class="fin-card-head"><div><h3>Financial exceptions</h3><div class="meta">Items that may need reconciliation.</div></div></div><div id="finExceptions" class="fin-exceptions"></div></div>
      </div>
      <div class="fin-note">Calendar occupancy uses unique reservation-like nights found across connected calendar feeds plus direct reservations. Because OTA calendars are cross-synced, channel attribution comes from the financial ledger rather than from an iCal source label.</div>
    </div>`;
  const reservations=document.getElementById('reservations');
  reservations.parentNode.insertBefore(section,reservations);

  const state={year:new Date().getFullYear(),loaded:false,data:{financials:[],otaEvents:[],directReservations:[],sources:[]}};
  const $=id=>document.getElementById(id);

  function showTab(){
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
    tab.classList.add('active');section.classList.add('active');
    if(!state.loaded)refresh();else render();
  }
  tab.addEventListener('click',showTab);
  $('finLedger').addEventListener('click',()=>document.querySelector('.tab[data-tab="bookingCalendar"]')?.click());
  $('finPrev').addEventListener('click',()=>{state.year--;render()});
  $('finNext').addEventListener('click',()=>{state.year++;render()});
  $('finRefresh').addEventListener('click',refresh);

  async function refresh(){
    const btn=$('finRefresh');btn.disabled=true;btn.textContent='Refreshing…';
    try{
      const r=await fetch('/api/owner-calendar',{headers:{'Content-Type':'application/json'}});
      const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'finance_load_failed');
      state.data=d;state.loaded=true;render();
    }catch(e){
      $('finExceptions').innerHTML=`<div class="fin-exception urgent"><strong>Finance dashboard could not load</strong><div class="meta">${esc(e.message)}</div></div>`;
    }finally{btn.disabled=false;btn.textContent='Refresh'}
  }

  function activeFinancials(){return (state.data.financials||[]).filter(f=>f.status!=='cancelled')}
  function yearFinancials(){return activeFinancials().filter(f=>String(f.checkin||'').startsWith(`${state.year}-`))}
  function clippedNights(start,end,year){
    const lo=`${year}-01-01`,hi=`${year+1}-01-01`;
    return eachNight(start,end).filter(d=>d>=lo&&d<hi);
  }
  function calendarNightSet(){
    const nights=new Set(),lo=`${state.year}-01-01`,hi=`${state.year+1}-01-01`;
    const events=[...(state.data.otaEvents||[]).filter(e=>e&&e.kind==='reservation_like'),...(state.data.directReservations||[])];
    for(const e of events)for(const d of eachNight(e.start,e.end))if(d>=lo&&d<hi)nights.add(d);
    for(const f of activeFinancials())for(const d of eachNight(f.checkin,f.checkout))if(d>=lo&&d<hi)nights.add(d);
    return nights;
  }
  function monthData(fins){
    const months=Array.from({length:12},(_,i)=>({month:i,gross:0,payout:0,collected:0,count:0}));
    for(const f of fins){const m=Number(String(f.checkin).slice(5,7))-1;if(m<0||m>11)continue;months[m].gross+=Number(f.gross_revenue||0);months[m].payout+=Number(f.expected_payout||0);months[m].collected+=Number(f.collected_amount||0);months[m].count++}
    return months;
  }
  function render(){
    $('finYear').textContent=state.year;
    const fins=yearFinancials();
    const gross=fins.reduce((a,f)=>a+Number(f.gross_revenue||0),0);
    const payout=fins.reduce((a,f)=>a+Number(f.expected_payout||0),0);
    const collected=fins.reduce((a,f)=>a+Number(f.collected_amount||0),0);
    const outstanding=fins.reduce((a,f)=>a+Math.max(0,Number(f.expected_payout||0)-Number(f.collected_amount||0)),0);
    const revenueNights=fins.reduce((a,f)=>a+eachNight(f.checkin,f.checkout).length,0);
    const occupied=calendarNightSet().size;
    $('finGross').textContent=money(gross);$('finPayout').textContent=money(payout);$('finCollected').textContent=money(collected);$('finOutstanding').textContent=money(outstanding);
    $('finOccupancy').textContent=pct((occupied/daysInYear(state.year))*100);$('finAdr').textContent=money(revenueNights?gross/revenueNights:0);
    $('finTracked').textContent=`${fins.length} revenue-tracked booking${fins.length===1?'':'s'} · ${revenueNights} nights`;
    renderChart(monthData(fins));renderChannels(fins);renderTable(fins);renderExceptions(fins);
  }

  function renderChart(months){
    const svg=$('finChart'),max=Math.max(1,...months.flatMap(m=>[m.gross,m.payout]));
    const left=38,right=704,base=188,top=24,slot=(right-left)/12,barW=Math.min(30,slot*.52);
    const y=v=>base-(Number(v||0)/max)*(base-top);
    const payoutPoints=months.map((m,i)=>`${left+slot*i+slot/2},${y(m.payout)}`).join(' ');
    const grid=[0,.25,.5,.75,1].map(n=>{const gy=base-(base-top)*n;return `<line x1="${left}" y1="${gy}" x2="${right}" y2="${gy}" stroke="#e5ebea" stroke-width="1"/><text x="4" y="${gy+4}" font-size="10" fill="#718184">${money(max*n)}</text>`}).join('');
    const bars=months.map((m,i)=>{const x=left+slot*i+(slot-barW)/2,yy=y(m.gross),h=Math.max(0,base-yy),lab=new Date(2026,i,1).toLocaleDateString('en-US',{month:'short'});return `<rect x="${x}" y="${yy}" width="${barW}" height="${h}" rx="5" fill="#315d64" opacity=".9"><title>${lab}: ${money(m.gross)} gross</title></rect><text x="${left+slot*i+slot/2}" y="211" text-anchor="middle" font-size="10" fill="#718184">${lab}</text>`}).join('');
    const dots=months.map((m,i)=>`<circle cx="${left+slot*i+slot/2}" cy="${y(m.payout)}" r="3.5" fill="#9a6b00"><title>${money(m.payout)} expected payout</title></circle>`).join('');
    svg.innerHTML=`${grid}${bars}<polyline points="${payoutPoints}" fill="none" stroke="#9a6b00" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${dots}<line x1="${left}" y1="${base}" x2="${right}" y2="${base}" stroke="#cfd9d7"/>`;
  }

  function renderChannels(fins){
    const totals={};for(const f of fins)totals[f.channel]=(totals[f.channel]||0)+Number(f.gross_revenue||0);
    const rows=Object.entries(totals).sort((a,b)=>b[1]-a[1]),max=Math.max(1,...rows.map(x=>x[1]));
    $('finChannels').innerHTML=rows.length?rows.map(([key,val])=>{const c=channel(key);return `<div class="fin-channel-row"><span><span class="fin-source" style="background:${c.color}">${esc(c.label)}</span></span><div class="fin-channel-bar"><span style="width:${Math.max(2,val/max*100)}%;background:${c.color}"></span></div><strong>${money(val)}</strong></div>`}).join(''):'<div class="fin-empty">No channel revenue has been recorded for this year.</div>';
  }

  function renderTable(fins){
    const rows=[...fins].sort((a,b)=>String(b.checkin).localeCompare(String(a.checkin)));
    if(!rows.length){$('finTable').innerHTML='<div class="fin-empty">No booking financial records for this year.</div>';return}
    $('finTable').innerHTML=`<div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Channel</th><th>Stay</th><th>Nights</th><th class="num">Gross</th><th class="num">Expected payout</th><th class="num">Collected</th><th class="num">Outstanding</th><th>Status</th><th>Reference</th></tr></thead><tbody>${rows.map(f=>{const c=channel(f.channel),n=eachNight(f.checkin,f.checkout).length,out=Math.max(0,Number(f.expected_payout||0)-Number(f.collected_amount||0));return `<tr><td><span class="fin-source" style="background:${c.color}">${esc(c.label)}</span></td><td>${esc(f.checkin)} → ${esc(f.checkout)}</td><td>${n}</td><td class="num">${money(f.gross_revenue)}</td><td class="num">${money(f.expected_payout)}</td><td class="num">${money(f.collected_amount)}</td><td class="num"><strong>${money(out)}</strong></td><td><span class="fin-status ${esc(f.status)}">${esc(f.status)}</span></td><td>${esc(f.external_reference||'—')}</td></tr>`}).join('')}</tbody></table></div>`;
  }

  function futureRanges(){
    const map=new Map(),now=today();
    const events=[...(state.data.otaEvents||[]).filter(e=>e&&e.kind==='reservation_like'),...(state.data.directReservations||[])];
    for(const e of events){if(!e.start||!e.end||e.end<=now)continue;const key=`${e.start}|${e.end}`;if(!map.has(key))map.set(key,{start:e.start,end:e.end,sources:new Set()});map.get(key).sources.add(e.source||'direct')}
    return [...map.values()].map(x=>({...x,sources:[...x.sources]}));
  }
  function renderExceptions(fins){
    const items=[],allFins=activeFinancials(),now=today();
    for(const r of futureRanges()){
      if(!r.start.startsWith(`${state.year}-`)&&!r.end.startsWith(`${state.year}-`))continue;
      const match=allFins.some(f=>f.checkin===r.start&&f.checkout===r.end);
      if(!match)items.push({urgent:false,title:'Reservation missing financial data',meta:`${r.start} → ${r.end} · ${r.sources.map(s=>channel(s).label).join(' / ')}`});
    }
    for(const f of fins){
      const missing=[];if(f.gross_revenue===null||Number(f.gross_revenue)===0)missing.push('gross');if(f.expected_payout===null||Number(f.expected_payout)===0)missing.push('payout');
      if(missing.length)items.push({urgent:false,title:'Incomplete booking financials',meta:`${channel(f.channel).label} · ${f.checkin} → ${f.checkout} · missing ${missing.join(' / ')}`});
      const out=Math.max(0,Number(f.expected_payout||0)-Number(f.collected_amount||0));
      if(f.checkout<now&&out>1)items.push({urgent:true,title:'Completed stay still has outstanding payout',meta:`${channel(f.channel).label} · ${f.checkin} → ${f.checkout} · ${money(out)} outstanding`});
    }
    $('finExceptions').innerHTML=items.length?items.slice(0,20).map(x=>`<div class="fin-exception ${x.urgent?'urgent':''}"><strong>${esc(x.title)}</strong><div class="meta">${esc(x.meta)}</div></div>`).join(''):'<div class="fin-exception" style="border-left-color:#357a55;background:#f5fbf7"><strong>No financial exceptions found</strong><div class="meta">Nothing in the selected year currently requires reconciliation.</div></div>';
  }
})();
