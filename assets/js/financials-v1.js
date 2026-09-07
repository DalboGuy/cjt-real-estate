let financialRows=[];
let financialFilter='all';

const PROPERTY_TZ='America/Chicago';
const loginShell=document.getElementById('loginShell');
const ownerApp=document.getElementById('ownerApp');
const loginForm=document.getElementById('loginForm');
const loginMsg=document.getElementById('loginMsg');
const financialList=document.getElementById('financialList');

function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function money(v){if(v==null||v==='')return '—';const n=Number(v);if(!Number.isFinite(n))return '—';return n.toLocaleString(undefined,{style:'currency',currency:'USD'})}
function date(v){if(!v)return '—';return new Date(`${String(v).slice(0,10)}T12:00:00`).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}
function statusLabel(v=''){return ({inquiry_hold:'New request',hold_verified:'Accepted / hold',contract_sent:'Contract sent',contract_signed:'Contract signed',confirmed:'Confirmed',released:'Released',expired:'Expired',cancelled:'Cancelled'})[v]||String(v).replaceAll('_',' ')}
function statusClass(status=''){return ['confirmed','contract_signed'].includes(status)?'good':['inquiry_hold','hold_verified','contract_sent'].includes(status)?'warn':''}
function paymentLabel(status){return ({verified:'Verified',checkout_pending:'Checkout pending',unverified:'Pending'})[status]||'Pending'}
function paymentClass(status){return status==='verified'?'good':status==='checkout_pending'?'warn':'warn'}
function showLogin(){ownerApp.classList.add('hidden');loginShell.classList.remove('hidden')}
function showApp(){loginShell.classList.add('hidden');ownerApp.classList.remove('hidden')}
function notice(text){const n=document.getElementById('moduleNotice');n.textContent=text;n.classList.remove('hidden')}

function chicagoParts(now=new Date()){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:PROPERTY_TZ,year:'numeric',month:'2-digit'}).formatToParts(now);
  const year=parts.find(p=>p.type==='year')?.value||'';
  const month=parts.find(p=>p.type==='month')?.value||'';
  return {year,month,key:year&&month?`${year}-${month}`:''};
}
function chicagoMonthLabel(now=new Date()){
  return new Intl.DateTimeFormat('en-US',{timeZone:PROPERTY_TZ,month:'short',year:'numeric'}).format(now);
}
function isMtdRow(row){
  const day=String(row.checkin||'').slice(0,10);
  const key=chicagoParts().key;
  return Boolean(key)&&day.startsWith(`${key}-`);
}
function reservationHref(id){return `/owner-v1/reservations?booking=${encodeURIComponent(id||'')}`}

async function financialsApi(){
  const r=await fetch('/api/financials',{cache:'no-store'});
  const d=await r.json().catch(()=>({}));
  if(r.status===401)throw new Error('unauthorized');
  if(!r.ok)throw new Error(d.message||d.error||'financials_request_failed');
  return d;
}

function renderSummary(summary){
  const mtd=summary.mtd||{};
  const counts=summary.counts||{};
  const month=summary.mtdMonthLabel||chicagoMonthLabel();
  const cards=[
    ['MTD lodging',money(mtd.lodging),`${month} · quoted lodging, check-in this month`],
    ['MTD taxes',money(mtd.taxes),`${month} · quoted taxes`],
    ['MTD cleaning',money(mtd.cleaning),`${month} · quoted cleaning`],
    ['MTD quoted total',money(mtd.total),`${month} · lodging + cleaning + tax`],
    ['MTD expected payout',money(mtd.expectedPayout),`${month} · lodging + cleaning from quotes`]
  ];
  document.getElementById('financialSummary').innerHTML=cards.map(c=>`<div class="summary-card"><span>${esc(c[0])}</span><b style="font-size:1.05rem">${esc(c[1])}</b><span>${esc(c[2])}</span></div>`).join('');
  document.getElementById('sideQuoted').textContent=counts.quotedBookings||0;
  document.getElementById('sideMissing').textContent=counts.missingQuote||0;
  document.getElementById('sideVerified').textContent=counts.stripeVerified||0;
  document.getElementById('sidePending').textContent=counts.stripePending||0;
  const monthHint=document.getElementById('mtdMonthHint');
  if(monthHint)monthHint.textContent=`Month-to-date uses ${month} in America/Chicago.`;
  if(summary.stripeNote)document.getElementById('stripeNote').textContent=summary.stripeNote;
}

function renderFilters(){
  const vals=[['all','All'],['mtd','MTD check-in'],['quoted','With quote'],['missing','Missing quote'],['verified','Stripe verified'],['pending','Stripe pending'],['active','Active'],['closed','Closed']];
  document.getElementById('financialFilters').innerHTML=vals.map(([v,l])=>`<button class="filter-btn ${financialFilter===v?'active':''}" data-filter="${v}">${l}</button>`).join('');
  document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{financialFilter=b.dataset.filter;renderFilters();renderBookings()});
}

function filteredBookings(){
  const q=document.getElementById('financialSearch').value.trim().toLowerCase();
  return financialRows.filter(row=>{
    const quoteMissing=Boolean(row.quote?.missing);
    const verified=Boolean(row.payment?.verified);
    const match=financialFilter==='all'
      ||(financialFilter==='mtd'&&isMtdRow(row)&&!row.closed)
      ||(financialFilter==='quoted'&&!quoteMissing)
      ||(financialFilter==='missing'&&quoteMissing)
      ||(financialFilter==='verified'&&verified)
      ||(financialFilter==='pending'&&!verified)
      ||(financialFilter==='active'&&!row.closed)
      ||(financialFilter==='closed'&&row.closed);
    if(!match)return false;
    if(!q)return true;
    return [row.id,row.guestName,row.guestEmail,row.checkin,row.checkout,row.status,row.payment?.status,row.quote?.total].join(' ').toLowerCase().includes(q);
  });
}

function quoteBadges(row){
  const quoteMissing=Boolean(row.quote?.missing);
  if(quoteMissing)return '<div class="muted" style="margin-top:6px">No stored quote</div>';
  const badges=[];
  if(row.quote?.legacy)badges.push('<span class="badge warn">Legacy</span>');
  if(row.quote?.ownerAdjusted)badges.push('<span class="badge">Owner adjusted</span>');
  return badges.length?`<div class="finance-quote-badges">${badges.join('')}</div>`:'';
}

function renderBookings(){
  const rows=filteredBookings();
  if(!financialRows.length){
    financialList.innerHTML='<div class="empty">No direct bookings are stored yet, so there are no quote or payment totals to show. Open Reservations when a stay is created.</div>';
    return;
  }
  if(!rows.length){
    financialList.innerHTML='<div class="empty">No bookings match this filter or search. Stored quotes are unchanged — try All or clear the search.</div>';
    return;
  }
  financialList.innerHTML=`<div class="finance-table-wrap"><table class="finance-table"><thead><tr><th>Stay</th><th>Status</th><th class="money">Lodging</th><th class="money">Taxes</th><th class="money">Cleaning</th><th class="money">Quoted total</th><th class="money">Expected payout</th><th>Stripe</th></tr></thead><tbody>${rows.map(row=>{
    const quoteMissing=Boolean(row.quote?.missing);
    const paymentStatus=row.payment?.status||'unverified';
    const href=reservationHref(row.id);
    const stripeDetail=row.payment?.verified
      ? `${esc(money(row.payment.verifiedAmount))} verified${row.payment.paymentType?' · '+esc(row.payment.paymentType):''}`
      : (row.payment?.checkoutCreated?'Checkout created · not verified':'No verified payment');
    return `<tr>
      <td><div class="finance-guest"><a class="finance-booking-link" href="${esc(href)}">${esc(row.guestName||'Guest')}</a></div><div class="muted">${esc(date(row.checkin))} → ${esc(date(row.checkout))}</div><div class="muted"><a class="finance-booking-link" href="${esc(href)}">${esc(row.id)}</a>${row.guests?` · ${esc(row.guests)} guests`:''}</div></td>
      <td><span class="badge ${statusClass(row.status)}">${esc(statusLabel(row.status))}</span>${quoteBadges(row)}</td>
      <td class="money">${esc(money(quoteMissing?null:row.quote?.lodging))}</td>
      <td class="money">${esc(money(quoteMissing?null:row.quote?.taxes))}</td>
      <td class="money">${esc(money(quoteMissing?null:row.quote?.cleaning))}</td>
      <td class="money">${esc(money(quoteMissing?null:row.quote?.total))}</td>
      <td class="money">${esc(money(row.expectedPayout))}</td>
      <td><span class="badge ${paymentClass(paymentStatus)}">${esc(paymentLabel(paymentStatus))}</span><div class="muted" style="margin-top:6px">${stripeDetail}</div></td>
    </tr>`;
  }).join('')}</tbody></table></div>`;
}

async function loadFinancials(){
  const refreshBtn=document.getElementById('refreshFinancials');
  if(refreshBtn)refreshBtn.disabled=true;
  try{
    const data=await financialsApi();
    financialRows=data.bookings||[];
    showApp();
    renderSummary(data.summary||{});
    renderFilters();
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

document.getElementById('financialSearch').addEventListener('input',renderBookings);
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
