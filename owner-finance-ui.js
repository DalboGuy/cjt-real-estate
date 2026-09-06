(()=>{
  const root=document.documentElement;
  if(root.dataset.financeDashboardLoaded)return;
  root.dataset.financeDashboardLoaded='1';

  const CHANNELS={airbnb:'Airbnb',vrbo:'Vrbo','booking.com':'Booking.com',houfy:'Houfy',direct:'CJT Direct',other:'Other'};
  const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(v||0));
  const money2=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v||0));
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const nights=(start,end)=>Math.max(0,Math.round((new Date(`${end}T00:00:00Z`)-new Date(`${start}T00:00:00Z`))/86400000));
  const fmtDate=v=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(String(v||'')))return v||'';const d=new Date(`${v}T00:00:00Z`);return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})};

  const style=document.createElement('style');
  style.textContent=`
    .fin-shell{display:grid;gap:16px}.fin-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap}.fin-head h2{margin:0 0 5px;font-family:Georgia,serif;font-weight:500;font-size:clamp(2rem,3.5vw,3rem)}.fin-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.fin-year{min-width:84px;text-align:center;font-weight:900;padding:8px 12px;border:1px solid var(--line);background:#fff;border-radius:999px}.fin-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.fin-kpi{background:#fff;border:1px solid var(--line);border-radius:18px;padding:17px;box-shadow:0 10px 28px rgba(13,43,49,.045)}.fin-kpi span{display:block;color:var(--muted);font-size:.72rem;font-weight:850;text-transform:uppercase;letter-spacing:.045em}.fin-kpi b{display:block;font-size:1.65rem;margin-top:9px;letter-spacing:-.03em}.fin-kpi small{display:block;color:var(--muted);font-size:.72rem;margin-top:4px}.fin-card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:18px;box-shadow:0 10px 28px rgba(13,43,49,.045)}.fin-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px}.fin-card h3{margin:0;font-family:Georgia,serif;font-weight:500;font-size:1.35rem}.fin-chart-wrap{overflow-x:auto}.fin-chart{width:100%;min-width:690px;height:230px;display:block}.fin-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:14px}.fin-table{width:100%;border-collapse:collapse;min-width:760px}.fin-table th,.fin-table td{padding:11px 12px;border-bottom:1px solid var(--line);text-align:left;font-size:.8rem}.fin-table th{font-size:.69rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);background:#f8fbfa}.fin-table .num{text-align:right;font-variant-numeric:tabular-nums}.fin-table tr:last-child td{border-bottom:0}.fin-source{display:inline-flex;padding:4px 8px;border-radius:999px;background:#eef2f1;font-size:.68rem;font-weight:900}.fin-empty{color:var(--muted);padding:12px 2px}.fin-note{padding:11px 13px;background:#f8fbfa;border:1px solid var(--line);border-radius:13px;color:var(--muted);font-size:.76rem;line-height:1.45}@media(max-width:900px){.fin-kpis{grid-template-columns:1fr 1fr}}@media(max-width:560px){.fin-kpis{grid-template-columns:1fr}.fin-kpi b{font-size:1.45rem}}
  `;
  document.head.appendChild(style);

  const tabs=document.querySelector('.tabs');
  const reservationsTab=document.querySelector('.tab[data-tab="reservations"]');
  if(!tabs||!reservationsTab)return;
  const tab=document.createElement('button');tab.className='tab';tab.dataset.tab='finance';tab.textContent='Finance';
  const dashTab=document.querySelector('.tab[data-tab="dashboard"]');dashTab?dashTab.after(tab):reservationsTab.before(tab);

  const section=document.createElement('section');section.id='finance';section.className='panel';
  section.innerHTML=`<div class="fin-shell">
    <div class="fin-head"><div><h2>Revenue</h2><p class="meta" style="margin:0">How much each booking produces, total and per occupied night.</p></div><div class="fin-controls"><button id="finPrev" class="btn ghost small" type="button">←</button><span id="finYear" class="fin-year"></span><button id="finNext" class="btn ghost small" type="button">→</button><button id="finRefresh" class="btn ghost small" type="button">Refresh</button><button id="finLedger" class="btn ghost small" type="button">Booking Calendar</button></div></div>
    <div class="fin-kpis">
      <div class="fin-kpi"><span>Total revenue</span><b id="finTotal">$0</b><small>Bookings checking in during selected year</small></div>
      <div class="fin-kpi"><span>Revenue this month</span><b id="finMonth">$0</b><small id="finMonthLabel">Current month</small></div>
      <div class="fin-kpi"><span>Booked nights</span><b id="finNights">0</b><small>Revenue-tracked nights</small></div>
      <div class="fin-kpi"><span>Revenue / night</span><b id="finPerNight">$0</b><small>Total revenue ÷ booked nights</small></div>
    </div>
    <div class="fin-card"><div class="fin-card-head"><div><h3>Monthly revenue</h3><div class="meta">One number only: total booking revenue.</div></div><div id="finTracked" class="meta"></div></div><div class="fin-chart-wrap"><svg id="finChart" class="fin-chart" viewBox="0 0 720 230" role="img" aria-label="Monthly booking revenue chart"></svg></div></div>
    <div class="fin-card"><div class="fin-card-head"><div><h3>Bookings</h3><div class="meta">Revenue per booking and per occupied night.</div></div></div><div id="finTable"></div></div>
    <div class="fin-note">A booking is counted once using its booking key. Cancelled records are excluded. Taxes, cleaning fees, payouts and other accounting detail may remain stored behind the scenes for matching, but they are not added separately to the revenue shown here.</div>
  </div>`;
  const reservations=document.getElementById('reservations');reservations.parentNode.insertBefore(section,reservations);

  const $=id=>document.getElementById(id);
  const state={year:new Date().getFullYear(),loaded:false,data:{financials:[]}};

  function showTab(){document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));tab.classList.add('active');section.classList.add('active');if(!state.loaded)refresh();else render()}
  tab.addEventListener('click',showTab);
  $('finPrev').onclick=()=>{state.year--;render()};$('finNext').onclick=()=>{state.year++;render()};$('finRefresh').onclick=refresh;$('finLedger').onclick=()=>document.querySelector('.tab[data-tab="bookingCalendar"]')?.click();

  async function refresh(){const b=$('finRefresh');b.disabled=true;b.textContent='Refreshing…';try{const r=await fetch('/api/owner-calendar',{headers:{'Content-Type':'application/json'}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'finance_load_failed');state.data=d;state.loaded=true;render()}catch(e){$('finTable').innerHTML=`<div class="fin-empty">Unable to load revenue: ${esc(e.message)}</div>`}finally{b.disabled=false;b.textContent='Refresh'}}

  function rows(){
    const map=new Map();
    for(const f of state.data.financials||[]){
      if(!f||f.status==='cancelled')continue;
      const key=String(f.booking_key||`${f.channel}:${f.checkin}:${f.checkout}`);
      const prev=map.get(key);
      if(!prev||String(f.updated_at||'')>String(prev.updated_at||''))map.set(key,f);
    }
    return [...map.values()].filter(f=>String(f.checkin||'').startsWith(`${state.year}-`)).sort((a,b)=>String(a.checkin).localeCompare(String(b.checkin)));
  }

  function render(){
    $('finYear').textContent=state.year;
    const data=rows();
    const total=data.reduce((a,f)=>a+Number(f.gross_revenue||0),0);
    const bookedNights=data.reduce((a,f)=>a+nights(f.checkin,f.checkout),0);
    const now=new Date(),currentMonth=now.getFullYear()===state.year?now.getMonth()+1:null;
    const monthRevenue=currentMonth?data.filter(f=>Number(String(f.checkin).slice(5,7))===currentMonth).reduce((a,f)=>a+Number(f.gross_revenue||0),0):0;
    $('finTotal').textContent=money(total);$('finNights').textContent=bookedNights.toLocaleString();$('finPerNight').textContent=money(bookedNights?total/bookedNights:0);$('finMonth').textContent=money(monthRevenue);
    $('finMonthLabel').textContent=currentMonth?now.toLocaleDateString('en-US',{month:'long'}):'Current month is outside selected year';$('finTracked').textContent=`${data.length} booking${data.length===1?'':'s'}`;
    renderChart(data);renderTable(data);
  }

  function renderChart(data){
    const months=Array.from({length:12},(_,i)=>({i,revenue:0}));for(const f of data){const m=Number(String(f.checkin).slice(5,7))-1;if(m>=0&&m<12)months[m].revenue+=Number(f.gross_revenue||0)}
    const svg=$('finChart'),max=Math.max(1,...months.map(m=>m.revenue)),left=42,right=704,base=184,top=24,slot=(right-left)/12,barW=Math.min(34,slot*.58),y=v=>base-(v/max)*(base-top);
    const grid=[0,.25,.5,.75,1].map(n=>{const yy=base-(base-top)*n;return `<line x1="${left}" y1="${yy}" x2="${right}" y2="${yy}" stroke="#e5ebea"/><text x="3" y="${yy+4}" font-size="10" fill="#718184">${money(max*n)}</text>`}).join('');
    const bars=months.map(m=>{const x=left+slot*m.i+(slot-barW)/2,yy=y(m.revenue),h=Math.max(0,base-yy),label=new Date(2000,m.i,1).toLocaleDateString('en-US',{month:'short'});return `<rect x="${x}" y="${yy}" width="${barW}" height="${h}" rx="5" fill="#315d64"><title>${label}: ${money2(m.revenue)}</title></rect><text x="${left+slot*m.i+slot/2}" y="207" text-anchor="middle" font-size="10" fill="#718184">${label}</text>`}).join('');
    svg.innerHTML=grid+bars;
  }

  function renderTable(data){
    if(!data.length){$('finTable').innerHTML='<div class="fin-empty">No revenue-tracked bookings for this year yet.</div>';return}
    const body=data.map(f=>{const n=nights(f.checkin,f.checkout),rev=Number(f.gross_revenue||0),per=n?rev/n:0;return `<tr><td><strong>${esc(f.external_reference||f.booking_key||'Booking')}</strong></td><td><span class="fin-source">${esc(CHANNELS[f.channel]||f.channel||'Unknown')}</span></td><td>${esc(fmtDate(f.checkin))} – ${esc(fmtDate(f.checkout))}</td><td class="num">${n}</td><td class="num"><strong>${money2(rev)}</strong></td><td class="num"><strong>${money2(per)}</strong></td></tr>`}).join('');
    $('finTable').innerHTML=`<div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Booking</th><th>Source</th><th>Stay</th><th class="num">Nights</th><th class="num">Total revenue</th><th class="num">Revenue / night</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }
})();
