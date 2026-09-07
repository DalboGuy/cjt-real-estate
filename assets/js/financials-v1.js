let financialRows=[];
let otaMeta={available:false,count:0};
const filters={range:'year',status:'all',source:'all',stripe:'all',from:'',to:''};

const PROPERTY_TZ='America/Chicago';
const loginShell=document.getElementById('loginShell');
const ownerApp=document.getElementById('ownerApp');
const loginForm=document.getElementById('loginForm');
const loginMsg=document.getElementById('loginMsg');
const financialList=document.getElementById('financialList');
const filterStatus=document.getElementById('filterStatus');
const filterSource=document.getElementById('filterSource');
const filterStripe=document.getElementById('filterStripe');
const filterFrom=document.getElementById('filterFrom');
const filterTo=document.getElementById('filterTo');
const financialSearch=document.getElementById('financialSearch');
const clearFilters=document.getElementById('clearFilters');
const filterRange=document.getElementById('filterRange');

function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function money(v){if(v==null||v==='')return '—';const n=Number(v);if(!Number.isFinite(n))return '—';return n.toLocaleString(undefined,{style:'currency',currency:'USD'})}
function date(v){if(!v)return '—';return new Date(`${String(v).slice(0,10)}T12:00:00`).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}
function stayDate(v){const day=String(v||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(day)?day:''}
function statusLabel(v=''){return ({inquiry_hold:'New request',hold_verified:'Accepted / hold',contract_sent:'Contract sent',contract_signed:'Contract signed',confirmed:'Confirmed',completed:'Completed',pending:'Pending',released:'Released',expired:'Expired',cancelled:'Cancelled'})[v]||String(v).replaceAll('_',' ')}
function statusClass(status=''){return ['confirmed','contract_signed','completed'].includes(status)?'good':['inquiry_hold','hold_verified','contract_sent','pending'].includes(status)?'warn':''}
function paymentLabel(status){return ({verified:'Verified',checkout_pending:'Checkout pending',unverified:'Pending',ota:'OTA'})[status]||'Pending'}
function paymentClass(status){return status==='verified'?'good':status==='ota'?'': 'warn'}
function showLogin(){ownerApp.classList.add('hidden');loginShell.classList.remove('hidden')}
function showApp(){loginShell.classList.add('hidden');ownerApp.classList.remove('hidden')}
function notice(text){const n=document.getElementById('moduleNotice');n.textContent=text;n.classList.remove('hidden')}
function countOrDash(v){return v==null||v===''?'—':String(v)}

function chicagoParts(now=new Date()){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:PROPERTY_TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  return {
    year:parts.find(p=>p.type==='year')?.value||'',
    month:parts.find(p=>p.type==='month')?.value||'',
    day:parts.find(p=>p.type==='day')?.value||''
  };
}
function lastDayOfMonth(year,month){
  const y=Number(year),m=Number(month);
  if(!y||!m)return '';
  return `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(new Date(Date.UTC(y,m,0)).getUTCDate()).padStart(2,'0')}`;
}
function activeRange(now=new Date()){
  const {year,month}=chicagoParts(now);
  if(filters.range==='month')return {from:year&&month?`${year}-${month}-01`:'',to:lastDayOfMonth(year,month)};
  if(filters.range==='year')return {from:year?`${year}-01-01`:'',to:year?`${year}-12-31`:''};
  if(filters.range==='custom')return {from:stayDate(filters.from),to:stayDate(filters.to)};
  return {from:'',to:''};
}
function inRange(checkin,range){
  const day=stayDate(checkin);
  if(!day)return false;
  if(range.from&&day<range.from)return false;
  if(range.to&&day>range.to)return false;
  return true;
}
function monthKeysBetween(from,to){
  const start=stayDate(from),end=stayDate(to);
  if(!start||!end||start>end)return [];
  const keys=[];
  let year=Number(start.slice(0,4)),month=Number(start.slice(5,7));
  const endYear=Number(end.slice(0,4)),endMonth=Number(end.slice(5,7));
  while(year<endYear||(year===endYear&&month<=endMonth)){
    keys.push(`${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}`);
    month+=1;if(month>12){month=1;year+=1}
  }
  return keys;
}
function monthLabel(key){
  return new Date(`${key}-15T12:00:00`).toLocaleDateString(undefined,{month:'short',year:'numeric'});
}
function addMoney(sum,value){if(value==null)return sum;return (sum||0)+value}
function reservationHref(id){return `/owner-v1/reservations?booking=${encodeURIComponent(id||'')}`}

async function financialsApi(){
  const r=await fetch('/api/financials',{cache:'no-store'});
  const d=await r.json().catch(()=>({}));
  if(r.status===401)throw new Error('unauthorized');
  if(!r.ok)throw new Error(d.message||d.error||'financials_request_failed');
  return d;
}

function rangeLabel(range){
  if(filters.range==='month')return 'This month';
  if(filters.range==='year')return 'This year';
  if(filters.range==='custom'){
    if(range.from&&range.to)return `${date(range.from)} – ${date(range.to)}`;
    if(range.from)return `From ${date(range.from)}`;
    if(range.to)return `Through ${date(range.to)}`;
    return 'Custom range';
  }
  return 'All stays';
}

function periodFromRows(rows){
  const period={total:null,expectedPayout:null,nights:null,quotedBookings:0,directRevenue:null,otaRevenue:null};
  for(const row of rows){
    if(row.closed)continue;
    if(row.quote?.missing)continue;
    period.quotedBookings+=1;
    period.total=addMoney(period.total,row.quote?.total);
    period.expectedPayout=addMoney(period.expectedPayout,row.expectedPayout);
    period.nights=addMoney(period.nights,row.nights);
    if(row.kind==='ota')period.otaRevenue=addMoney(period.otaRevenue,row.quote?.total);
    else period.directRevenue=addMoney(period.directRevenue,row.quote?.total);
  }
  period.revenuePerNight=period.total!=null&&period.nights?period.total/period.nights:null;
  return period;
}

function chartFromRows(rows,range){
  const contributing=rows.filter(row=>!row.closed&&!row.quote?.missing);
  const dates=contributing.map(row=>stayDate(row.checkin)).filter(Boolean).sort();
  const from=range.from||dates[0]||'';
  const to=range.to||dates[dates.length-1]||'';
  const keys=monthKeysBetween(from?`${from.slice(0,7)}-01`:'',to?lastDayOfMonth(to.slice(0,4),to.slice(5,7)):'');
  const byMonth=new Map(keys.map(key=>({month:key,label:monthLabel(key),direct:null,ota:null,total:null})).map(item=>[item.month,item]));
  for(const row of contributing){
    const key=stayDate(row.checkin).slice(0,7);
    const bucket=byMonth.get(key);
    if(!bucket)continue;
    bucket.total=addMoney(bucket.total,row.quote?.total);
    if(row.kind==='ota')bucket.ota=addMoney(bucket.ota,row.quote?.total);
    else bucket.direct=addMoney(bucket.direct,row.quote?.total);
  }
  return [...byMonth.values()];
}

function renderSummary(period,range,summary){
  const mix=[
    period.directRevenue!=null?`Direct ${money(period.directRevenue)}`:'',
    period.otaRevenue!=null?`OTA ${money(period.otaRevenue)}`:''
  ].filter(Boolean).join(' · ')||'Quoted + imported OTA';
  const cards=[
    ['Revenue',money(period.total),mix],
    ['Expected payout',money(period.expectedPayout),'Direct quotes + stored OTA payout'],
    ['Booked nights',countOrDash(period.nights),'Active stays in this range'],
    ['Revenue / night',money(period.revenuePerNight),'When nights and revenue exist']
  ];
  document.getElementById('financialSummary').innerHTML=cards.map(c=>`<div class="summary-card"><span>${esc(c[0])}</span><b>${esc(c[1])}</b><span>${esc(c[2])}</span></div>`).join('');
  const monthHint=document.getElementById('mtdMonthHint');
  if(monthHint)monthHint.textContent=`${rangeLabel(range)} · ${PROPERTY_TZ}`;
  if(summary?.stripeNote){
    const stripeNote=document.getElementById('stripeNote');
    if(stripeNote)stripeNote.textContent=summary.stripeNote;
  }
}

function renderChart(rows,range){
  const host=document.getElementById('financialChart');
  if(!host)return;
  const series=chartFromRows(rows,range);
  const hasMoney=series.some(item=>item.total!=null);
  if(!hasMoney){
    host.classList.remove('hidden');
    host.innerHTML=`<div class="finance-chart-head"><strong>Monthly revenue</strong><span>${esc(rangeLabel(range))} · America/Chicago</span></div><div class="finance-chart-empty">No stored revenue in this range. Empty months stay blank — not $0.</div>`;
    return;
  }
  const peak=Math.max(...series.map(item=>item.total||0),1);
  host.classList.remove('hidden');
  host.innerHTML=`<div class="finance-chart-head"><strong>Monthly revenue</strong><span>Direct · OTA · ${esc(rangeLabel(range))}</span></div>
    <div class="finance-chart-plot">${series.map(item=>{
      const directH=item.direct!=null?Math.max(4,Math.round((item.direct/peak)*130)):0;
      const otaH=item.ota!=null?Math.max(4,Math.round((item.ota/peak)*130)):0;
      return `<div class="finance-chart-col" title="${esc(item.label)}: Direct ${money(item.direct)} · OTA ${money(item.ota)}">
        <div class="finance-chart-stack">${item.ota!=null?`<div class="finance-chart-bar ota" style="height:${otaH}px"></div>`:''}${item.direct!=null?`<div class="finance-chart-bar direct" style="height:${directH}px"></div>`:''}</div>
        <em>${esc(item.label.replace(/ 20/,' ’'))}</em>
      </div>`;
    }).join('')}</div>`;
}

function filtersAreActive(){
  return filters.range!=='year'||filters.status!=='all'||filters.source!=='all'||filters.stripe!=='all'||Boolean(filters.from)||Boolean(filters.to)||Boolean(financialSearch.value.trim());
}

function syncRangeButtons(){
  filterRange.querySelectorAll('[data-range]').forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.range===filters.range);
  });
  document.querySelectorAll('.filter-custom').forEach(el=>el.classList.toggle('hidden',filters.range!=='custom'));
}

function syncClearControl(){
  clearFilters.classList.toggle('hidden',!filtersAreActive());
}

function resetFilters(){
  filters.range='year';
  filters.status='all';
  filters.source='all';
  filters.stripe='all';
  filters.from='';
  filters.to='';
  filterStatus.value='all';
  filterSource.value='all';
  filterStripe.value='all';
  filterFrom.value='';
  filterTo.value='';
  financialSearch.value='';
  syncRangeButtons();
  syncClearControl();
  renderBookings();
}

function filteredBookings(){
  const q=financialSearch.value.trim().toLowerCase();
  const range=activeRange();
  return financialRows.filter(row=>{
    const verified=Boolean(row.payment?.verified);
    const ota=row.kind==='ota';
    if(!inRange(row.checkin,range))return false;
    if(filters.status==='active'&&row.closed)return false;
    if(filters.status==='closed'&&!row.closed)return false;
    if(filters.source==='direct'&&ota)return false;
    if(filters.source==='ota'&&!ota)return false;
    if(filters.stripe==='verified'&&(ota||!verified))return false;
    if(filters.stripe==='pending'&&(ota||verified))return false;
    if(!q)return true;
    return [row.id,row.guestName,row.guestEmail,row.checkin,row.checkout,row.status,row.sourceLabel,row.channel,row.payment?.status,row.quote?.total].join(' ').toLowerCase().includes(q);
  });
}

function quoteBadges(row){
  if(row.kind==='ota'){
    return row.importedSource?`<div class="muted" style="margin-top:6px">Imported</div>`:'';
  }
  if(row.quote?.missing)return '<div class="muted" style="margin-top:6px">No stored quote</div>';
  const badges=[];
  if(row.quote?.legacy)badges.push('<span class="badge warn">Legacy</span>');
  if(row.quote?.ownerAdjusted)badges.push('<span class="badge">Owner adjusted</span>');
  return badges.length?`<div class="finance-quote-badges">${badges.join('')}</div>`:'';
}

function stayCell(row){
  if(row.kind==='ota'){
    return `<div class="finance-guest">${esc(row.guestName||'Guest')}</div><div class="muted">${esc(date(row.checkin))} → ${esc(date(row.checkout))}${row.nights?` · ${esc(row.nights)} nights`:''}</div><div class="muted">${esc(row.externalReference||row.id)}</div>`;
  }
  const href=reservationHref(row.id);
  return `<div class="finance-guest"><a class="finance-booking-link" href="${esc(href)}">${esc(row.guestName||'Guest')}</a></div><div class="muted">${esc(date(row.checkin))} → ${esc(date(row.checkout))}${row.nights?` · ${esc(row.nights)} nights`:''}</div><div class="muted"><a class="finance-booking-link" href="${esc(href)}">${esc(row.id)}</a>${row.guests?` · ${esc(row.guests)} guests`:''}</div>`;
}

function stripeCell(row){
  if(row.kind==='ota')return '<span class="muted">—</span><div class="muted" style="margin-top:6px">Channel payout</div>';
  const paymentStatus=row.payment?.status||'unverified';
  const stripeDetail=row.payment?.verified
    ? `${esc(money(row.payment.verifiedAmount))} verified${row.payment.paymentType?' · '+esc(row.payment.paymentType):''}`
    : (row.payment?.checkoutCreated?'Checkout created · not verified':'No verified payment');
  return `<span class="badge ${paymentClass(paymentStatus)}">${esc(paymentLabel(paymentStatus))}</span><div class="muted" style="margin-top:6px">${stripeDetail}</div>`;
}

function renderBookings(){
  const range=activeRange();
  const rows=filteredBookings();
  const period=periodFromRows(rows);
  renderSummary(period,range,{stripeNote:window.__financialStripeNote});
  renderChart(rows,range);
  const countEl=document.getElementById('financialCount');
  if(!financialRows.length){
    if(countEl)countEl.textContent='No stays yet';
    financialList.innerHTML='<div class="empty">No direct bookings or imported OTA stays are stored yet. Open Reservations when a stay is created.</div>';
    syncClearControl();
    return;
  }
  const otaNote=!otaMeta.available?' · OTA table not on this database':(otaMeta.count?` · ${otaMeta.count} imported OTA`:' · OTA table empty');
  if(countEl)countEl.textContent=rows.length===financialRows.length
    ? `${rows.length} stay${rows.length===1?'':'s'}${otaNote}`
    : `${rows.length} of ${financialRows.length} stays${otaNote}`;
  if(!rows.length){
    financialList.innerHTML='<div class="empty">No bookings match these filters. Stored totals are unchanged — try Clear filters.</div>';
    syncClearControl();
    return;
  }
  financialList.innerHTML=`<div class="finance-table-wrap"><table class="finance-table"><thead><tr><th>Stay</th><th>Source</th><th>Status</th><th class="money">Lodging</th><th class="money">Taxes</th><th class="money">Cleaning</th><th class="money">Total</th><th class="money">Expected payout</th><th>Stripe</th></tr></thead><tbody>${rows.map(row=>{
    const quoteMissing=Boolean(row.quote?.missing);
    return `<tr>
      <td data-label="Stay">${stayCell(row)}</td>
      <td data-label="Source"><span class="finance-source platform ${esc(row.channel||'')}">${esc(row.sourceLabel||'Direct')}</span></td>
      <td data-label="Status"><span class="badge ${statusClass(row.status)}">${esc(statusLabel(row.status))}</span>${quoteBadges(row)}</td>
      <td data-label="Lodging" class="money">${esc(money(quoteMissing?null:row.quote?.lodging))}</td>
      <td data-label="Taxes" class="money">${esc(money(quoteMissing?null:row.quote?.taxes))}</td>
      <td data-label="Cleaning" class="money">${esc(money(quoteMissing?null:row.quote?.cleaning))}</td>
      <td data-label="Total" class="money">${esc(money(quoteMissing?null:row.quote?.total))}</td>
      <td data-label="Expected payout" class="money">${esc(money(row.expectedPayout))}</td>
      <td data-label="Stripe">${stripeCell(row)}</td>
    </tr>`;
  }).join('')}</tbody></table></div>`;
  syncClearControl();
}

async function loadFinancials(){
  const refreshBtn=document.getElementById('refreshFinancials');
  if(refreshBtn)refreshBtn.disabled=true;
  try{
    const data=await financialsApi();
    financialRows=data.bookings||[];
    otaMeta=data.summary?.ota||{available:false,count:0};
    window.__financialStripeNote=data.summary?.stripeNote||'';
    showApp();
    syncRangeButtons();
    renderBookings();
    document.getElementById('lastChecked').textContent=`Updated ${new Date(data.checkedAt||Date.now()).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}`;
  }catch(e){
    if(e.message==='unauthorized')return showLogin();
    showApp();
    notice('Financials could not be loaded. Stored quotes and payments were not changed.');
  }finally{
    if(refreshBtn)refreshBtn.disabled=false;
  }
}

filterRange.addEventListener('click',e=>{
  const btn=e.target.closest('[data-range]');
  if(!btn)return;
  filters.range=btn.dataset.range;
  if(filters.range!=='custom'){filters.from='';filters.to='';filterFrom.value='';filterTo.value='';}
  syncRangeButtons();
  renderBookings();
});
filterStatus.addEventListener('change',()=>{filters.status=filterStatus.value;renderBookings()});
filterSource.addEventListener('change',()=>{filters.source=filterSource.value;renderBookings()});
filterStripe.addEventListener('change',()=>{filters.stripe=filterStripe.value;renderBookings()});
filterFrom.addEventListener('change',()=>{filters.from=filterFrom.value;renderBookings()});
filterTo.addEventListener('change',()=>{filters.to=filterTo.value;renderBookings()});
financialSearch.addEventListener('input',renderBookings);
clearFilters.addEventListener('click',resetFilters);
document.getElementById('refreshFinancials')?.addEventListener('click',loadFinancials);
loginForm.addEventListener('submit',async e=>{
  e.preventDefault();
  loginMsg.textContent='Signing in…';
  const r=await fetch('/api/owner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',passcode:document.getElementById('passcode').value})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){loginMsg.textContent=d.error==='owner_login_not_configured'?'Owner login is not configured for this environment.':'Invalid passcode.';return}
  document.getElementById('passcode').value='';loginMsg.textContent='';loadFinancials();
});

loadFinancials();
