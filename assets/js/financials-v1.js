let financialRows=[];
let otaMeta={available:false,count:0};
let chartMetric='revenue';
let stayTab='all';
const PROPERTY_TZ='America/Chicago';
const filters={
  range:'ytd',channel:'all',status:'all',source:'all',payment:'all',stripe:'all',
  from:'',to:'',advFrom:'',advTo:'',guest:'',id:''
};

const loginShell=document.getElementById('loginShell');
const ownerApp=document.getElementById('ownerApp');
const loginForm=document.getElementById('loginForm');
const loginMsg=document.getElementById('loginMsg');
const financialList=document.getElementById('financialList');
const filterRange=document.getElementById('filterRange');
const filterChannel=document.getElementById('filterChannel');
const filterStatus=document.getElementById('filterStatus');
const filterSource=document.getElementById('filterSource');
const filterPayment=document.getElementById('filterPayment');
const filterStripe=document.getElementById('filterStripe');
const filterFrom=document.getElementById('filterFrom');
const filterTo=document.getElementById('filterTo');
const advFrom=document.getElementById('advFrom');
const advTo=document.getElementById('advTo');
const filterGuest=document.getElementById('filterGuest');
const filterId=document.getElementById('filterId');
const financialSearch=document.getElementById('financialSearch');
const clearFilters=document.getElementById('clearFilters');
const filterPopover=document.getElementById('filterPopover');
const fpScrim=document.getElementById('fpScrim');
const stayDrawer=document.getElementById('stayDrawer');
const methodModal=document.getElementById('methodModal');

function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function money(v){if(v==null||v==='')return '—';const n=Number(v);if(!Number.isFinite(n))return '—';return n.toLocaleString(undefined,{style:'currency',currency:'USD'})}
function moneyFull(v){if(v==null||v==='')return '—';const n=Number(v);if(!Number.isFinite(n))return '—';return n.toLocaleString(undefined,{style:'currency',currency:'USD',maximumFractionDigits:0})}
function pct(v){if(v==null||!Number.isFinite(Number(v)))return '—';return `${Math.round(Number(v)*1000)/10}%`}
function countOrDash(v){return v==null||v===''?'—':String(v)}
function date(v){if(!v)return '—';return new Date(`${String(v).slice(0,10)}T12:00:00`).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}
function stayDate(v){const day=String(v||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(day)?day:''}
function statusLabel(v=''){return ({inquiry_hold:'New request',hold_verified:'Accepted / hold',contract_sent:'Contract sent',contract_signed:'Contract signed',confirmed:'Confirmed',completed:'Completed',pending:'Pending',released:'Released',expired:'Expired',cancelled:'Cancelled'})[v]||String(v).replaceAll('_',' ')}
function statusClass(status=''){return ['confirmed','contract_signed','completed'].includes(status)?'good':['inquiry_hold','hold_verified','contract_sent','pending'].includes(status)?'warn':''}
function paymentLabel(status){return ({verified:'Verified',checkout_pending:'Checkout pending',unverified:'Pending',ota:'OTA'})[status]||'Pending'}
function paymentClass(status){return status==='verified'?'good':status==='ota'?'':'warn'}
function showLogin(){ownerApp.classList.add('hidden');loginShell.classList.remove('hidden')}
function showApp(){loginShell.classList.add('hidden');ownerApp.classList.remove('hidden')}
function notice(text){const n=document.getElementById('moduleNotice');n.textContent=text;n.classList.toggle('hidden',!text)}
function reservationHref(id){return `/owner-v1/reservations?booking=${encodeURIComponent(id||'')}`}
function addMoney(sum,value){if(value==null)return sum;return (sum||0)+value}

function chicagoParts(now=new Date()){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:PROPERTY_TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  return {year:parts.find(p=>p.type==='year')?.value||'',month:parts.find(p=>p.type==='month')?.value||'',day:parts.find(p=>p.type==='day')?.value||''};
}
function todayKey(now=new Date()){const {year,month,day}=chicagoParts(now);return year&&month&&day?`${year}-${month}-${day}`:''}
function lastDayOfMonth(year,month){
  const y=Number(year),m=Number(month);
  if(!y||!m)return '';
  return `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(new Date(Date.UTC(y,m,0)).getUTCDate()).padStart(2,'0')}`;
}
function addDays(day,delta){
  const start=stayDate(day);
  if(!start||!Number.isFinite(Number(delta)))return '';
  const [y,m,d]=start.split('-').map(Number);
  const shifted=new Date(Date.UTC(y,m-1,d+Number(delta)));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth()+1).padStart(2,'0')}-${String(shifted.getUTCDate()).padStart(2,'0')}`;
}
function shiftMonths(day,delta){
  const start=stayDate(day);
  if(!start||!Number.isFinite(Number(delta)))return '';
  let year=Number(start.slice(0,4));
  let month=Number(start.slice(5,7))+Number(delta);
  const date=Number(start.slice(8,10));
  while(month<1){month+=12;year-=1}
  while(month>12){month-=12;year+=1}
  const last=Number(lastDayOfMonth(year,month).slice(8,10));
  return `${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(Math.min(date,last)).padStart(2,'0')}`;
}
function nightsBetween(checkin,checkout){
  const start=stayDate(checkin),end=stayDate(checkout);
  if(!start||!end)return null;
  const ms=Date.parse(`${end}T12:00:00`)-Date.parse(`${start}T12:00:00`);
  if(!Number.isFinite(ms))return null;
  const nights=Math.round(ms/86400000);
  return nights>0?nights:null;
}

function activeRange(now=new Date()){
  const {year,month}=chicagoParts(now);
  const today=todayKey(now);
  if(filters.range==='month')return {preset:'month',from:year&&month?`${year}-${month}-01`:'',to:lastDayOfMonth(year,month)};
  if(filters.range==='ytd')return {preset:'ytd',from:year?`${year}-01-01`:'',to:today};
  if(filters.range==='last12')return {preset:'last12',from:shiftMonths(today,-12),to:today};
  if(filters.range==='2025')return {preset:'2025',from:'2025-01-01',to:'2025-12-31'};
  if(filters.range==='custom')return {preset:'custom',from:stayDate(filters.from),to:stayDate(filters.to)};
  return {preset:'all',from:'',to:''};
}
function priorRange(range){
  const from=stayDate(range.from),to=stayDate(range.to);
  if(range.preset==='month'&&from){
    const prior=shiftMonths(from,-1);
    return {preset:'month',from:`${prior.slice(0,7)}-01`,to:lastDayOfMonth(prior.slice(0,4),prior.slice(5,7))};
  }
  if(range.preset==='ytd'&&from&&to)return {preset:'ytd',from:shiftMonths(from,-12),to:shiftMonths(to,-12)};
  if(range.preset==='last12'&&from&&to)return {preset:'last12',from:shiftMonths(from,-12),to:addDays(from,-1)};
  if(range.preset==='2025')return {preset:'2024',from:'2024-01-01',to:'2024-12-31'};
  if(from&&to){
    const length=nightsBetween(from,addDays(to,1));
    if(!length)return {from:'',to:''};
    const priorTo=addDays(from,-1);
    return {preset:'custom',from:addDays(priorTo,1-length),to:priorTo};
  }
  return {from:'',to:''};
}
function inRange(checkin,range){
  const day=stayDate(checkin);
  if(!day)return false;
  if(range.from&&day<range.from)return false;
  if(range.to&&day>range.to)return false;
  return true;
}
function rangeLabel(range){
  if(filters.range==='month')return 'This month';
  if(filters.range==='ytd')return 'Year to date';
  if(filters.range==='last12')return 'Last 12 months';
  if(filters.range==='2025')return '2025';
  if(filters.range==='custom'){
    if(range.from&&range.to)return `${date(range.from)} – ${date(range.to)}`;
    if(range.from)return `From ${date(range.from)}`;
    if(range.to)return `Through ${date(range.to)}`;
    return 'Custom range';
  }
  return 'All stays';
}

function stayBucket(row,today=todayKey()){
  const checkin=stayDate(row.checkin);
  if(checkin&&!row.closed&&checkin>=today)return 'upcoming';
  if(row.kind==='ota'){
    if(row.closed)return 'closed';
    if(row.payment?.verifiedAmount!=null||row.status==='completed'||(checkin&&checkin<today))return 'paid';
    return 'pending';
  }
  if(row.payment?.verified)return 'paid';
  if(row.closed)return 'closed';
  return 'pending';
}
function otaFee(row){
  if(row.kind!=='ota'||row.closed||row.quote?.missing)return null;
  if(row.quote?.total==null||row.expectedPayout==null)return null;
  const gap=row.quote.total-row.expectedPayout;
  if(!Number.isFinite(gap))return null;
  return row.quote.taxes!=null?gap-row.quote.taxes:gap;
}
function stayAdr(row){
  if(row.quote?.missing||row.quote?.total==null||!row.nights)return null;
  return row.quote.total/row.nights;
}
function percentChange(current,previous){
  if(current==null||previous==null||previous===0)return null;
  return (current-previous)/previous;
}

function matchesChannel(row){
  if(filters.channel==='all')return true;
  return String(row.channel||'').toLowerCase()===filters.channel;
}
function matchesAdvanced(row){
  const ota=row.kind==='ota';
  const verified=Boolean(row.payment?.verified);
  if(filters.status==='active'&&row.closed)return false;
  if(filters.status==='closed'&&!row.closed)return false;
  if(filters.source==='direct'&&ota)return false;
  if(filters.source==='ota'&&!ota)return false;
  if(filters.stripe==='verified'&&(ota||!verified))return false;
  if(filters.stripe==='pending'&&(ota||verified))return false;
  if(filters.payment!=='all'&&stayBucket(row)!==filters.payment)return false;
  if(filters.advFrom||filters.advTo){
    if(!inRange(row.checkin,{from:stayDate(filters.advFrom),to:stayDate(filters.advTo)}))return false;
  }
  const guest=filters.guest.trim().toLowerCase();
  if(guest&&!String(row.guestName||'').toLowerCase().includes(guest))return false;
  const id=filters.id.trim().toLowerCase();
  if(id&&![row.id,row.externalReference].join(' ').toLowerCase().includes(id))return false;
  return true;
}
function scopedRows(){
  return financialRows.filter(row=>matchesChannel(row)&&matchesAdvanced(row));
}
function periodRows(range=activeRange()){
  return scopedRows().filter(row=>inRange(row.checkin,range));
}
function tableRows(){
  const q=financialSearch.value.trim().toLowerCase();
  return periodRows().filter(row=>{
    if(stayTab!=='all'&&stayBucket(row)!==stayTab)return false;
    if(!q)return true;
    return [row.id,row.guestName,row.guestEmail,row.checkin,row.checkout,row.status,row.sourceLabel,row.channel,row.payment?.status,row.quote?.total,row.externalReference].join(' ').toLowerCase().includes(q);
  });
}

function periodFromRows(rows){
  const period={total:null,expectedPayout:null,nights:null,quotedBookings:0,directRevenue:null,otaRevenue:null,lodging:null,taxes:null,cleaning:null};
  for(const row of rows){
    if(row.closed)continue;
    if(row.quote?.missing)continue;
    period.quotedBookings+=1;
    period.total=addMoney(period.total,row.quote?.total);
    period.expectedPayout=addMoney(period.expectedPayout,row.expectedPayout);
    period.nights=addMoney(period.nights,row.nights);
    period.lodging=addMoney(period.lodging,row.quote?.lodging);
    period.taxes=addMoney(period.taxes,row.quote?.taxes);
    period.cleaning=addMoney(period.cleaning,row.quote?.cleaning);
    if(row.kind==='ota')period.otaRevenue=addMoney(period.otaRevenue,row.quote?.total);
    else period.directRevenue=addMoney(period.directRevenue,row.quote?.total);
  }
  period.adr=period.total!=null&&period.nights?period.total/period.nights:null;
  return period;
}
function uniqueNights(rows,range){
  const nights=new Set();
  for(const row of rows){
    if(row.closed)continue;
    const start=stayDate(row.checkin),end=stayDate(row.checkout);
    if(!start||!end)continue;
    let day=start;
    while(day<end){
      if((!range.from||day>=range.from)&&(!range.to||day<=range.to))nights.add(day);
      day=addDays(day,1);
      if(!day)break;
    }
  }
  return nights.size;
}
function occupancy(rows,range){
  const from=stayDate(range.from),to=stayDate(range.to);
  if(!from||!to||from>to)return {available:null,booked:null,occupancy:null};
  const available=nightsBetween(from,addDays(to,1));
  if(!available)return {available:null,booked:null,occupancy:null};
  const booked=uniqueNights(rows,range);
  return {available,booked,occupancy:booked/available};
}
function feeStory(rows){
  const result={gross:null,channelFees:null,channelFeesPartial:false,paymentProcessing:null,otherDeductions:null,ownerRevenue:null};
  let otaWith=0,otaMissing=0;
  for(const row of rows){
    if(row.closed||row.quote?.missing)continue;
    result.gross=addMoney(result.gross,row.quote.total);
    result.ownerRevenue=addMoney(result.ownerRevenue,row.expectedPayout);
    result.otherDeductions=addMoney(result.otherDeductions,row.quote.taxes);
    if(row.kind==='ota'){
      const fee=otaFee(row);
      if(fee==null)otaMissing+=1;
      else{otaWith+=1;result.channelFees=addMoney(result.channelFees,fee)}
    }
  }
  result.channelFeesPartial=otaWith>0&&otaMissing>0;
  if(otaWith===0)result.channelFees=null;
  return result;
}
function channelMix(rows){
  const by=new Map();
  let gross=null;
  for(const row of rows){
    if(row.closed||row.quote?.missing)continue;
    const key=String(row.channel||'other').toLowerCase();
    const bucket=by.get(key)||{channel:key,label:row.sourceLabel||key,revenue:null,nights:null,stays:0,adr:null,share:null};
    bucket.stays+=1;
    bucket.revenue=addMoney(bucket.revenue,row.quote.total);
    bucket.nights=addMoney(bucket.nights,row.nights);
    by.set(key,bucket);
    gross=addMoney(gross,row.quote.total);
  }
  return [...by.values()].map(bucket=>{
    if(bucket.revenue!=null&&bucket.nights)bucket.adr=bucket.revenue/bucket.nights;
    if(bucket.revenue!=null&&gross)bucket.share=bucket.revenue/gross;
    return bucket;
  }).sort((a,b)=>(b.revenue||0)-(a.revenue||0));
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
function chartSeries(rows,range){
  const contributing=rows.filter(row=>!row.closed&&!row.quote?.missing);
  const dates=contributing.map(row=>stayDate(row.checkin)).filter(Boolean).sort();
  const from=dates[0]||range.from||'';
  const to=dates[dates.length-1]||range.to||'';
  const keys=monthKeysBetween(from?`${from.slice(0,7)}-01`:'',to?lastDayOfMonth(to.slice(0,4),to.slice(5,7)):'');
  const byMonth=new Map(keys.map(key=>[key,{month:key,label:monthLabel(key),direct:null,ota:null,total:null,nights:null,adr:null,occupancy:null}]));
  for(const row of contributing){
    const key=stayDate(row.checkin).slice(0,7);
    const bucket=byMonth.get(key);
    if(!bucket)continue;
    bucket.total=addMoney(bucket.total,row.quote?.total);
    bucket.nights=addMoney(bucket.nights,row.nights);
    if(row.kind==='ota')bucket.ota=addMoney(bucket.ota,row.quote?.total);
    else bucket.direct=addMoney(bucket.direct,row.quote?.total);
  }
  const overlapRows=scopedRows();
  return [...byMonth.values()].map(item=>{
    if(item.total!=null&&item.nights)item.adr=item.total/item.nights;
    const monthRange={from:`${item.month}-01`,to:lastDayOfMonth(item.month.slice(0,4),item.month.slice(5,7))};
    item.occupancy=occupancy(overlapRows,monthRange).occupancy;
    const priorKey=shiftMonths(`${item.month}-01`,-12).slice(0,7);
    const priorRows=overlapRows.filter(row=>!row.closed&&!row.quote?.missing&&stayDate(row.checkin).startsWith(priorKey));
    item.priorTotal=periodFromRows(priorRows).total;
    item.priorOccupancy=occupancy(overlapRows,{from:`${priorKey}-01`,to:lastDayOfMonth(priorKey.slice(0,4),priorKey.slice(5,7))}).occupancy;
    item.priorAdr=periodFromRows(priorRows).adr;
    return item;
  });
}
function pacing(now=new Date()){
  const today=todayKey(now);
  const rows=scopedRows();
  return [30,60,90].map(days=>{
    const to=addDays(today,days-1);
    const windowRows=rows.filter(row=>{
      const checkin=stayDate(row.checkin);
      return checkin&&!row.closed&&checkin>=today&&checkin<=to;
    });
    const period=periodFromRows(windowRows);
    const occ=occupancy(rows,{from:today,to});
    return {days,stays:windowRows.length,revenue:period.total,nights:period.nights,occupancy:occ.occupancy};
  });
}

function deltaChip(change){
  if(change==null)return '';
  const up=change>=0;
  const label=`${up?'+':''}${Math.round(change*1000)/10}% vs prior`;
  return `<span class="fp-delta ${up?'up':'down'}">${esc(label)}</span>`;
}

async function financialsApi(){
  const r=await fetch('/api/financials',{cache:'no-store'});
  const d=await r.json().catch(()=>({}));
  if(r.status===401)throw new Error('unauthorized');
  if(!r.ok)throw new Error(d.message||d.error||'financials_request_failed');
  return d;
}

function advancedCount(){
  let n=0;
  if(filters.status!=='all')n+=1;
  if(filters.source!=='all')n+=1;
  if(filters.payment!=='all')n+=1;
  if(filters.stripe!=='all')n+=1;
  if(filters.advFrom||filters.advTo)n+=1;
  if(filters.guest.trim())n+=1;
  if(filters.id.trim())n+=1;
  return n;
}
function filtersAreActive(){
  return filters.range!=='ytd'||filters.channel!=='all'||advancedCount()>0||Boolean(financialSearch.value.trim())||stayTab!=='all';
}
function syncRangeButtons(){
  filterRange.querySelectorAll('[data-range]').forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.range===filters.range);
  });
  document.querySelector('.fp-custom')?.classList.toggle('hidden',filters.range!=='custom');
}
function syncFilterBadge(){
  const btn=document.getElementById('openFilters');
  const n=advancedCount();
  btn.classList.toggle('has-filters',n>0);
  if(n)btn.setAttribute('data-count',String(n));
  else btn.removeAttribute('data-count');
  clearFilters.classList.toggle('hidden',!filtersAreActive());
}
function syncChannelOptions(){
  const current=filters.channel;
  const seen=new Map([['all','All Channels']]);
  for(const row of financialRows){
    const key=String(row.channel||'other').toLowerCase();
    if(!seen.has(key))seen.set(key,row.sourceLabel||key);
  }
  filterChannel.innerHTML=[...seen.entries()].map(([value,label])=>`<option value="${esc(value)}">${esc(label)}</option>`).join('');
  filters.channel=seen.has(current)?current:'all';
  filterChannel.value=filters.channel;
}

function renderKpis(period,range,prior,upcoming,occ){
  const grossDelta=deltaChip(percentChange(period.total,prior.total));
  const ownerDelta=deltaChip(percentChange(period.expectedPayout,prior.expectedPayout));
  const occHint=occ.occupancy==null?'Occupancy needs a bounded period':`${pct(occ.occupancy)} occupancy · ${countOrDash(occ.booked)} of ${countOrDash(occ.available)} nights`;
  const host=document.getElementById('financialKpis');
  host.classList.remove('is-loading');
  host.innerHTML=`
    <article class="fp-kpi"><span class="label">Gross Revenue</span><b class="value">${esc(moneyFull(period.total))}</b>${grossDelta}<span class="hint">Quoted + imported stays · ${esc(rangeLabel(range))}</span></article>
    <article class="fp-kpi owner"><span class="label">Owner Revenue</span><b class="value">${esc(moneyFull(period.expectedPayout))}</b>${ownerDelta}<span class="hint">After known channel fees and guest taxes</span></article>
    <article class="fp-kpi"><span class="label">Booked Nights</span><b class="value">${esc(countOrDash(period.nights))}</b><span class="hint">${esc(occHint)}</span></article>
    <article class="fp-kpi"><span class="label">ADR</span><b class="value">${esc(money(period.adr))}</b><span class="hint">Average daily rate from gross ÷ nights</span></article>
    <article class="fp-kpi"><span class="label">Upcoming Revenue</span><b class="value">${esc(moneyFull(upcoming.revenue))}</b><span class="hint">${esc(countOrDash(upcoming.nights))} nights already booked in the next 90 days</span></article>`;
}

function renderChart(rows,range){
  const host=document.getElementById('financialChart');
  const hint=document.getElementById('chartHint');
  const series=chartSeries(rows,range);
  const metric=chartMetric;
  if(hint)hint.textContent=`${rangeLabel(range)} · months with stored stays`;
  const valueOf=item=>metric==='occupancy'?item.occupancy:metric==='adr'?item.adr:item.total;
  const priorOf=item=>metric==='occupancy'?item.priorOccupancy:metric==='adr'?item.priorAdr:item.priorTotal;
  const has=series.some(item=>valueOf(item)!=null);
  if(!has){
    host.innerHTML=`<div class="fp-chart-empty">No stored ${esc(metric)} in this range. Empty months stay blank — not $0.</div>`;
    return;
  }
  const peak=Math.max(...series.map(item=>Math.max(valueOf(item)||0,priorOf(item)||0)),metric==='occupancy'?1:1);
  const hasPrior=series.some(item=>priorOf(item)!=null);
  const format=v=>metric==='occupancy'?pct(v):money(v);
  host.innerHTML=`<div class="fp-chart-plot">${series.map(item=>{
    const val=valueOf(item);
    const prior=priorOf(item);
    const h=val!=null?Math.max(4,Math.round((val/peak)*168)):0;
    const priorH=prior!=null?Math.max(3,Math.round((prior/peak)*168)):0;
    const directH=metric==='revenue'&&item.direct!=null?Math.max(4,Math.round((item.direct/peak)*168)):0;
    const otaH=metric==='revenue'&&item.ota!=null?Math.max(4,Math.round((item.ota/peak)*168)):0;
    const title=`${item.label}: ${format(val)}${prior!=null?` · prior ${format(prior)}`:''}`;
    const bars=metric==='revenue'
      ? `${item.ota!=null?`<div class="fp-chart-bar ota" style="height:${otaH}px"></div>`:''}${item.direct!=null?`<div class="fp-chart-bar direct" style="height:${directH}px"></div>`:''}`
      : (val!=null?`<div class="fp-chart-bar metric" style="height:${h}px"></div>`:'');
    return `<div class="fp-chart-col" title="${esc(title)}">
      <div class="fp-chart-stack">${prior!=null?`<div class="fp-chart-prior" style="height:${priorH}px"></div>`:''}${bars}</div>
      <em>${esc(item.label.replace(/ 20/,' ’'))}</em>
    </div>`;
  }).join('')}</div>
  <div class="fp-legend">${metric==='revenue'?`<span><i class="direct"></i>Direct</span><span><i class="ota"></i>OTA</span>`:`<span><i class="direct"></i>${esc(metric==='adr'?'ADR':'Occupancy')}</span>`}${hasPrior?'<span><i class="prior"></i>Prior year</span>':''}</div>`;
}

function renderSummary(story,range){
  const host=document.getElementById('financialSummary');
  const hint=document.getElementById('summaryHint');
  if(hint)hint.textContent=rangeLabel(range);
  const feeNote=story.channelFeesPartial?'From stays with both gross and payout stored.':'Imported OTA gross minus stored payout.';
  host.innerHTML=`
    <div class="fp-summary-rows">
      <div class="fp-summary-row"><span>Gross revenue</span><b>${esc(money(story.gross))}</b></div>
      <div class="fp-summary-row deduct"><span>Channel / OTA fees</span><b>${story.channelFees==null?'—':esc(money(story.channelFees))}</b></div>
      <div class="fp-summary-row deduct"><span>Payment processing</span><b>—</b></div>
      <div class="fp-summary-row deduct"><span>Other known deductions</span><b>${story.otherDeductions==null?'—':esc(money(story.otherDeductions))}</b></div>
      <div class="fp-summary-row total"><span>Owner revenue</span><b>${esc(money(story.ownerRevenue))}</b></div>
    </div>
    <p class="fp-summary-note">Payment processing is unavailable — Stripe fees are not stored. Other known deductions are guest taxes when present. ${esc(story.channelFees==null?'Channel fees appear when imported stays include both gross and payout.':feeNote)} Cleaning, maintenance, and a full P&amp;L can land here later without mock lines.</p>`;
}

function renderChannels(rows){
  const mix=channelMix(rows);
  const bar=document.getElementById('channelShare');
  const cards=document.getElementById('channelCards');
  if(!mix.length){
    bar.classList.add('hidden');
    cards.innerHTML='<div class="fp-muted-empty">No channel revenue in this view yet.</div>';
    return;
  }
  bar.classList.remove('hidden');
  bar.innerHTML=mix.map(item=>`<span class="${esc(item.channel)}" style="width:${Math.max(2,(item.share||0)*100)}%" title="${esc(item.label)} ${esc(pct(item.share))}"></span>`).join('');
  cards.innerHTML=mix.map(item=>`
    <article class="fp-channel">
      <div class="name"><span class="platform ${esc(item.channel)}">${esc(item.label)}</span><span class="muted">${esc(pct(item.share))}</span></div>
      <div class="value">${esc(moneyFull(item.revenue))}</div>
      <div class="meta">${esc(countOrDash(item.nights))} nights · ADR ${esc(money(item.adr))} · ${esc(item.stays)} stay${item.stays===1?'':'s'}</div>
    </article>`).join('');
}

function renderStory(story){
  const host=document.getElementById('grossNetStory');
  const steps=[
    ['Gross',story.gross,''],
    ['OTA fees',story.channelFees,'deduct'],
    ['Processing',null,'deduct'],
    ['Taxes',story.otherDeductions,'deduct'],
    ['Owner revenue',story.ownerRevenue,'owner']
  ];
  host.innerHTML=steps.map((step,i)=>`${i?`<div class="fp-flow-arrow" aria-hidden="true">→</div>`:''}<div class="fp-flow-step ${step[2]}"><span>${esc(step[0])}</span><b>${esc(money(step[1]))}</b></div>`).join('');
}

function renderPacing(){
  const windows=pacing();
  document.getElementById('pacingCards').innerHTML=windows.map(item=>`
    <article class="fp-pace">
      <strong>Next ${esc(item.days)} days</strong>
      <b>${esc(moneyFull(item.revenue))}</b>
      <span>${esc(countOrDash(item.nights))} nights · ${item.occupancy==null?'occupancy —':esc(pct(item.occupancy))+' occupancy'} · ${esc(item.stays)} stay${item.stays===1?'':'s'}</span>
    </article>`).join('');
}

function quoteBadges(row){
  if(row.kind==='ota')return row.importedSource?'<div class="muted">Imported</div>':'';
  if(row.quote?.missing)return '<div class="muted">No stored quote</div>';
  const badges=[];
  if(row.quote?.legacy)badges.push('<span class="badge warn">Legacy</span>');
  if(row.quote?.ownerAdjusted)badges.push('<span class="badge">Owner adjusted</span>');
  return badges.length?`<div class="finance-quote-badges">${badges.join('')}</div>`:'';
}
function stayCell(row){
  return `<div class="fp-guest">${esc(row.guestName||'Guest')}</div><div class="muted">${esc(date(row.checkin))} → ${esc(date(row.checkout))}${row.nights?` · ${esc(row.nights)} nights`:''}</div>`;
}
function paymentCell(row){
  if(row.kind==='ota'){
    const collected=row.payment?.verifiedAmount;
    return `<span class="badge">${esc(stayBucket(row)==='paid'?'Channel':'OTA')}</span><div class="muted" style="margin-top:6px">${collected!=null?esc(money(collected))+' collected':'Channel payout'}</div>`;
  }
  const paymentStatus=row.payment?.status||'unverified';
  const detail=row.payment?.verified
    ? `${esc(money(row.payment.verifiedAmount))} verified${row.payment.paymentType?' · '+esc(row.payment.paymentType):''}`
    : (row.payment?.checkoutCreated?'Checkout created · not verified':'No verified payment');
  return `<span class="badge ${paymentClass(paymentStatus)}">${esc(paymentLabel(paymentStatus))}</span><div class="muted" style="margin-top:6px">${detail}</div>`;
}

function renderTable(rows){
  const countEl=document.getElementById('financialCount');
  const otaNote=!otaMeta.available?' · OTA table not on this database':(otaMeta.count?` · ${otaMeta.count} imported OTA`:' · OTA table empty');
  if(!financialRows.length){
    if(countEl)countEl.textContent='No stays yet';
    financialList.innerHTML='<div class="empty">No direct bookings or imported OTA stays are stored yet. Open Reservations when a stay is created.</div>';
    return;
  }
  if(countEl)countEl.textContent=rows.length===financialRows.length
    ? `${rows.length} stay${rows.length===1?'':'s'}${otaNote}`
    : `${rows.length} of ${financialRows.length} stays${otaNote}`;
  if(!rows.length){
    financialList.innerHTML='<div class="empty">No stays match these filters. Stored totals are unchanged — try Clear.</div>';
    return;
  }
  financialList.innerHTML=`<div class="fp-table-wrap"><table class="fp-table"><thead><tr><th>Guest</th><th>Stay</th><th>Source</th><th class="money">Nights</th><th class="money">Gross</th><th class="money">Fees</th><th class="money">Owner Revenue</th><th>Payment</th></tr></thead><tbody>${rows.map(row=>{
    const missing=Boolean(row.quote?.missing);
    const fee=otaFee(row);
    return `<tr data-stay-id="${esc(row.id)}">
      <td data-label="Guest">${stayCell(row)}${quoteBadges(row)}</td>
      <td data-label="Stay"><div>${esc(date(row.checkin))} → ${esc(date(row.checkout))}</div><div class="muted">${esc(row.externalReference||row.id)}</div></td>
      <td data-label="Source"><span class="finance-source platform ${esc(row.channel||'')}">${esc(row.sourceLabel||'Direct')}</span></td>
      <td data-label="Nights" class="money">${esc(countOrDash(row.nights))}</td>
      <td data-label="Gross" class="money">${esc(money(missing?null:row.quote?.total))}</td>
      <td data-label="Fees" class="money">${esc(money(fee))}</td>
      <td data-label="Owner Revenue" class="money">${esc(money(row.expectedPayout))}</td>
      <td data-label="Payment">${paymentCell(row)}</td>
    </tr>`;
  }).join('')}</tbody></table></div>
  <div class="fp-cards">${rows.map(row=>{
    const missing=Boolean(row.quote?.missing);
    return `<article class="fp-stay-card" data-stay-id="${esc(row.id)}">
      <div class="fp-stay-top">
        <div><div class="fp-guest">${esc(row.guestName||'Guest')}</div><div class="muted">${esc(date(row.checkin))} → ${esc(date(row.checkout))}${row.nights?` · ${row.nights} nights`:''}</div></div>
        <span class="platform ${esc(row.channel||'')}">${esc(row.sourceLabel||'Direct')}</span>
      </div>
      <div class="fp-stay-money">
        <div><span>Gross</span><b>${esc(money(missing?null:row.quote?.total))}</b></div>
        <div><span>Fees</span><b>${esc(money(otaFee(row)))}</b></div>
        <div><span>Owner</span><b>${esc(money(row.expectedPayout))}</b></div>
      </div>
      <div style="margin-top:10px">${paymentCell(row)}</div>
    </article>`;
  }).join('')}</div>`;
}

function kv(label,value){
  if(value==null||value==='')return '';
  return `<div class="fp-kv"><span>${esc(label)}</span><b>${value}</b></div>`;
}
function openDrawer(id){
  const row=financialRows.find(item=>String(item.id)===String(id));
  if(!row)return;
  const missing=Boolean(row.quote?.missing);
  const fee=otaFee(row);
  const adr=stayAdr(row);
  const directLink=row.kind!=='ota'?`<a class="btn btn-secondary" href="${esc(reservationHref(row.id))}">Open in Reservations</a>`:'';
  stayDrawer.innerHTML=`
    <div class="fp-drawer-head">
      <div>
        <h2>${esc(row.guestName||'Guest')}</h2>
        <p class="muted" style="margin:4px 0 0">${esc(row.sourceLabel||'Direct')} · ${esc(row.externalReference||row.id)}</p>
      </div>
      <button class="icon-btn" type="button" data-close-ui aria-label="Close">×</button>
    </div>
    <div class="fp-drawer-grid">
      ${kv('Channel',esc(row.sourceLabel||row.channel))}
      ${kv('Status',esc(statusLabel(row.status)))}
      ${kv('Check-in',esc(date(row.checkin)))}
      ${kv('Check-out',esc(date(row.checkout)))}
      ${kv('Nights',esc(countOrDash(row.nights)))}
      ${kv('ADR',esc(money(adr)))}
      ${kv('Accommodation',esc(money(missing?null:row.quote?.lodging)))}
      ${kv('Cleaning',esc(money(missing?null:row.quote?.cleaning)))}
      ${kv('Taxes',esc(money(missing?null:row.quote?.taxes)))}
      ${kv('Channel fees',esc(money(fee)))}
      ${kv('Gross',esc(money(missing?null:row.quote?.total)))}
      ${kv('Owner revenue / payout',esc(money(row.expectedPayout)))}
      ${row.kind==='ota'?kv('Collected',esc(money(row.payment?.verifiedAmount))):kv('Stripe',esc(paymentLabel(row.payment?.status)))}
      ${row.kind!=='ota'&&row.payment?.verifiedAmount!=null?kv('Verified amount',esc(money(row.payment.verifiedAmount))):''}
      ${row.kind!=='ota'&&row.payment?.paymentType?kv('Payment type',esc(row.payment.paymentType)):''}
      ${row.guestEmail?kv('Guest email',esc(row.guestEmail)):''}
      ${row.guests!=null?kv('Guests',esc(row.guests)):''}
      ${row.importedSource?kv('Import source',esc(row.importedSource)):''}
    </div>
    <div class="widget-footer" style="margin-top:18px">${directLink}</div>`;
  stayDrawer.classList.remove('hidden');
  fpScrim.classList.remove('hidden');
}
function closeOverlays(){
  stayDrawer.classList.add('hidden');
  methodModal.classList.add('hidden');
  filterPopover.classList.add('hidden');
  fpScrim.classList.add('hidden');
}

function renderAll(){
  const range=activeRange();
  const rows=periodRows(range);
  const period=periodFromRows(rows);
  const prior=periodFromRows(periodRows(priorRange(range)));
  const upcoming=pacing()[2]||{revenue:null,nights:null};
  const occ=occupancy(scopedRows(),range);
  renderKpis(period,range,prior,upcoming,occ);
  renderChart(rows,range);
  const story=feeStory(rows);
  renderSummary(story,range);
  renderChannels(rows);
  renderStory(story);
  renderPacing();
  renderTable(tableRows());
  syncRangeButtons();
  syncFilterBadge();
}

function resetFilters(){
  filters.range='ytd';
  filters.channel='all';
  filters.status='all';
  filters.source='all';
  filters.payment='all';
  filters.stripe='all';
  filters.from='';
  filters.to='';
  filters.advFrom='';
  filters.advTo='';
  filters.guest='';
  filters.id='';
  stayTab='all';
  filterStatus.value='all';
  filterSource.value='all';
  filterPayment.value='all';
  filterStripe.value='all';
  filterFrom.value='';
  filterTo.value='';
  advFrom.value='';
  advTo.value='';
  filterGuest.value='';
  filterId.value='';
  financialSearch.value='';
  filterChannel.value='all';
  document.querySelectorAll('#stayTabs [data-tab]').forEach(btn=>btn.classList.toggle('active',btn.dataset.tab==='all'));
  closeOverlays();
  renderAll();
}

async function loadFinancials(){
  const refreshBtn=document.getElementById('refreshFinancials');
  if(refreshBtn)refreshBtn.disabled=true;
  document.getElementById('financialKpis')?.classList.add('is-loading');
  try{
    const data=await financialsApi();
    financialRows=data.bookings||[];
    otaMeta=data.summary?.ota||{available:false,count:0};
    showApp();
    syncChannelOptions();
    renderAll();
    const stamp=`Updated ${new Date(data.checkedAt||Date.now()).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}`;
    if(window.CJTOwnerShell?.setLastChecked)window.CJTOwnerShell.setLastChecked(stamp);
    else document.getElementById('lastChecked').textContent=stamp;
  }catch(e){
    document.getElementById('financialKpis')?.classList.remove('is-loading');
    if(e.message==='unauthorized')return showLogin();
    showApp();
    notice('Financials could not be loaded. Stored quotes and payments were not changed.');
    if(financialList)financialList.innerHTML='<div class="empty">Financials could not be loaded. Stored quotes and payments were not changed.</div>';
    if(window.CJTOwnerShell?.setLastChecked)window.CJTOwnerShell.setLastChecked('Load failed');
    else{
      const last=document.getElementById('lastChecked');
      if(last)last.textContent='Load failed';
    }
  }finally{
    if(refreshBtn)refreshBtn.disabled=false;
  }
}

filterRange.addEventListener('click',e=>{
  const btn=e.target.closest('[data-range]');
  if(!btn)return;
  filters.range=btn.dataset.range;
  if(filters.range!=='custom'){filters.from='';filters.to='';filterFrom.value='';filterTo.value='';}
  renderAll();
});
filterChannel.addEventListener('change',()=>{filters.channel=filterChannel.value;renderAll()});
filterStatus.addEventListener('change',()=>{filters.status=filterStatus.value});
filterSource.addEventListener('change',()=>{filters.source=filterSource.value});
filterPayment.addEventListener('change',()=>{filters.payment=filterPayment.value});
filterStripe.addEventListener('change',()=>{filters.stripe=filterStripe.value});
filterFrom.addEventListener('change',()=>{filters.from=filterFrom.value;renderAll()});
filterTo.addEventListener('change',()=>{filters.to=filterTo.value;renderAll()});
advFrom.addEventListener('change',()=>{filters.advFrom=advFrom.value});
advTo.addEventListener('change',()=>{filters.advTo=advTo.value});
filterGuest.addEventListener('input',()=>{filters.guest=filterGuest.value});
filterId.addEventListener('input',()=>{filters.id=filterId.value});
financialSearch.addEventListener('input',()=>{renderTable(tableRows());syncFilterBadge()});
clearFilters.addEventListener('click',resetFilters);
document.getElementById('refreshFinancials')?.addEventListener('click',loadFinancials);
document.getElementById('openFilters')?.addEventListener('click',()=>{
  filterPopover.classList.toggle('hidden');
});
document.getElementById('applyFilters')?.addEventListener('click',()=>{
  filters.status=filterStatus.value;
  filters.source=filterSource.value;
  filters.payment=filterPayment.value;
  filters.stripe=filterStripe.value;
  filters.advFrom=advFrom.value;
  filters.advTo=advTo.value;
  filters.guest=filterGuest.value;
  filters.id=filterId.value;
  filterPopover.classList.add('hidden');
  renderAll();
});
document.getElementById('resetAdvanced')?.addEventListener('click',()=>{
  filters.status='all';filters.source='all';filters.payment='all';filters.stripe='all';
  filters.advFrom='';filters.advTo='';filters.guest='';filters.id='';
  filterStatus.value='all';filterSource.value='all';filterPayment.value='all';filterStripe.value='all';
  advFrom.value='';advTo.value='';filterGuest.value='';filterId.value='';
  renderAll();
});
document.getElementById('chartToggle')?.addEventListener('click',e=>{
  const btn=e.target.closest('[data-chart]');
  if(!btn)return;
  chartMetric=btn.dataset.chart;
  document.querySelectorAll('#chartToggle [data-chart]').forEach(el=>el.classList.toggle('active',el===btn));
  renderChart(periodRows(),activeRange());
});
document.getElementById('stayTabs')?.addEventListener('click',e=>{
  const btn=e.target.closest('[data-tab]');
  if(!btn)return;
  stayTab=btn.dataset.tab;
  document.querySelectorAll('#stayTabs [data-tab]').forEach(el=>el.classList.toggle('active',el===btn));
  renderTable(tableRows());
  syncFilterBadge();
});
financialList.addEventListener('click',e=>{
  const row=e.target.closest('[data-stay-id]');
  if(!row)return;
  openDrawer(row.dataset.stayId);
});
document.getElementById('openMethod')?.addEventListener('click',()=>{
  methodModal.classList.remove('hidden');
  fpScrim.classList.remove('hidden');
});
document.getElementById('closeMethod')?.addEventListener('click',closeOverlays);
fpScrim.addEventListener('click',closeOverlays);
document.addEventListener('click',e=>{
  if(e.target.closest('[data-close-ui]'))closeOverlays();
  if(!filterPopover.classList.contains('hidden')&&!e.target.closest('#filterPopover')&&!e.target.closest('#openFilters')){
    filterPopover.classList.add('hidden');
  }
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeOverlays()});
loginForm.addEventListener('submit',async e=>{
  e.preventDefault();
  loginMsg.textContent='Signing in…';
  const r=await fetch('/api/owner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',passcode:document.getElementById('passcode').value})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){loginMsg.textContent=d.error==='owner_login_not_configured'?'Owner login is not configured for this environment.':'Invalid passcode.';return}
  document.getElementById('passcode').value='';loginMsg.textContent='';loadFinancials();
});

loadFinancials();
