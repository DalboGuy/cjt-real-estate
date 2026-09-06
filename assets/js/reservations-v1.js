const TEMPLATE='https://app.opensignlabs.com/publicsign?templateid=JGD2FwG4MP';
let reservationRows=[];
let reservationFilter='all';

const loginShell=document.getElementById('loginShell');
const ownerApp=document.getElementById('ownerApp');
const loginForm=document.getElementById('loginForm');
const loginMsg=document.getElementById('loginMsg');
const reservationList=document.getElementById('reservationList');

function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function fmt(v){return v?new Date(v).toLocaleString():'—'}
function money(v){return Number(v||0).toLocaleString(undefined,{style:'currency',currency:'USD'});}
function statusLabel(v=''){return ({inquiry_hold:'New request',hold_verified:'Accepted / hold',contract_sent:'Contract sent',contract_signed:'Contract signed',confirmed:'Confirmed',released:'Released',expired:'Expired',cancelled:'Cancelled'})[v]||String(v).replaceAll('_',' ')}
function isActive(r){return !['released','expired','cancelled'].includes(r.status)}
function needsAction(r){return ['inquiry_hold','hold_verified','contract_sent','contract_signed'].includes(r.status)}
function statusClass(status=''){return ['confirmed','contract_signed'].includes(status)?'good':['inquiry_hold','hold_verified','contract_sent'].includes(status)?'warn':''}
function showLogin(){ownerApp.classList.add('hidden');loginShell.classList.remove('hidden')}
function showApp(){loginShell.classList.add('hidden');ownerApp.classList.remove('hidden')}
function notice(text){const n=document.getElementById('moduleNotice');n.textContent=text;n.classList.remove('hidden');setTimeout(()=>n.classList.add('hidden'),5000)}

async function ownerApi(opts={}){
  const r=await fetch('/api/owner',{headers:{'Content-Type':'application/json'},cache:'no-store',...opts});
  const d=await r.json().catch(()=>({}));
  if(r.status===401)throw new Error('unauthorized');
  if(!r.ok)throw new Error(d.message||d.error||'owner_request_failed');
  return d;
}

async function dashboardApi(){
  const r=await fetch('/api/dashboard',{cache:'no-store'});
  const d=await r.json().catch(()=>({}));
  if(r.status===401)throw new Error('unauthorized');
  if(!r.ok)throw new Error(d.error||'dashboard_request_failed');
  return d;
}

function renderSummary(){
  const active=reservationRows.filter(isActive);
  const newReq=reservationRows.filter(r=>r.status==='inquiry_hold');
  const action=reservationRows.filter(needsAction);
  const confirmed=reservationRows.filter(r=>r.status==='confirmed');
  const closed=reservationRows.filter(r=>!isActive(r));
  const value=active.reduce((sum,r)=>sum+Number(r.quote?.total||0),0);
  const cards=[['New requests',newReq.length,'awaiting owner review'],['Active',active.length,'open direct bookings'],['Need action',action.length,'booking steps'],['Confirmed',confirmed.length,'confirmed'],['Active value',money(value),'quoted trip total']];
  document.getElementById('reservationSummary').innerHTML=cards.map(c=>`<div class="summary-card"><span>${esc(c[0])}</span><b style="${c[0]==='Active value'?'font-size:1.05rem':''}">${esc(c[1])}</b><span>${esc(c[2])}</span></div>`).join('');
  document.getElementById('closedCount').textContent=closed.length;
}

function renderFilters(){
  const vals=[['all','All'],['new','New requests'],['active','Active'],['action','Need action'],['confirmed','Confirmed'],['closed','Closed']];
  document.getElementById('reservationFilters').innerHTML=vals.map(([v,l])=>`<button class="filter-btn ${reservationFilter===v?'active':''}" data-filter="${v}">${l}</button>`).join('');
  document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{reservationFilter=b.dataset.filter;renderFilters();renderReservations()});
}

function filteredReservations(){
  const q=document.getElementById('reservationSearch').value.trim().toLowerCase();
  return reservationRows.filter(r=>{
    const match=reservationFilter==='all'||(reservationFilter==='new'&&r.status==='inquiry_hold')||(reservationFilter==='active'&&isActive(r))||(reservationFilter==='action'&&needsAction(r))||(reservationFilter==='confirmed'&&r.status==='confirmed')||(reservationFilter==='closed'&&!isActive(r));
    if(!match)return false;
    if(!q)return true;
    return [r.id,r.guest_name,r.guest_email,r.guest_phone,r.notes,r.checkin,r.checkout,r.status,r.quote?.total].join(' ').toLowerCase().includes(q);
  });
}

function paymentMarkup(q){
  const p=q?.paymentSchedule;if(!p)return '';
  if(p.mode==='split')return `<div class="list-row"><div><strong>Payment schedule</strong><span>${esc(money(p.dueAtBooking))} when accepted · ${esc(money(p.remainingBalance))} due ${esc(p.balanceDueDateLabel||'30 days before arrival')}</span></div><span class="badge good">50 / 50</span></div>`;
  return `<div class="list-row"><div><strong>Payment schedule</strong><span>${esc(money(p.dueAtBooking||q.total))} due when accepted</span></div><span class="badge">Full</span></div>`;
}

function quoteMarkup(r){
  const q=r.quote;
  if(!q)return '<div class="empty" style="margin-top:12px">No stored quote on this older reservation.</div>';
  const lines=(q.priceLines||[]).map(x=>`<div class="list-row"><div><strong>${esc(x.season)}</strong><span>${esc(x.nights)} night${Number(x.nights)===1?'':'s'} × ${esc(money(x.nightlyRate))}</span></div><b>${esc(money(x.subtotal))}</b></div>`).join('');
  return `<div class="card" style="margin-top:14px;padding:14px;background:var(--cjt-soft)"><div class="card-head"><div><h3 style="font-size:1rem">Direct quote</h3><p>${esc(q.nights)} nights · average ${esc(money(q.averageNightly||Number(q.lodgingSubtotal||0)/Math.max(Number(q.nights||1),1)))}/night${q.ownerAdjusted?' · owner adjusted':''}</p></div><strong style="font-size:1.25rem">${esc(money(q.total))}</strong></div><div class="list compact-list">${lines}<div class="list-row"><div><strong>Lodging</strong></div><b>${esc(money(q.lodgingSubtotal))}</b></div><div class="list-row"><div><strong>Cleaning</strong></div><b>${esc(money(q.cleaningFee))}</b></div><div class="list-row"><div><strong>Tax</strong><span>${Math.round(Number(q.taxRate||0)*100)}%</span></div><b>${esc(money(q.taxes))}</b></div>${paymentMarkup(q)}</div></div>`;
}

function actionMarkup(r){
  if(!isActive(r))return '<span class="reservation-meta">Closed reservation · no active actions</span>';
  const primary=r.status==='inquiry_hold'?'<button class="btn btn-primary" data-action="accept_request">Accept Request</button>':'';
  const adjust=r.quote?'<button class="btn btn-secondary" data-quote="adjust">Adjust Quote</button>':'';
  const reject=!['confirmed'].includes(r.status)?'<button class="btn danger-btn" data-action="reject_request">Reject / Release</button>':'';
  return `${primary}${adjust}<button class="btn btn-secondary" data-action="maintain_hold">Extend Hold</button><a class="btn btn-secondary" target="_blank" rel="noopener" href="${TEMPLATE}">Open Contract ↗</a><button class="btn btn-secondary" data-action="contract_sent">Contract Sent</button><button class="btn btn-secondary" data-action="contract_signed">Contract Signed</button><button class="btn btn-primary" data-action="deposit_received">Deposit Received</button>${reject}`;
}

function renderReservations(){
  const rows=filteredReservations();
  reservationList.innerHTML=rows.length?'':'<div class="empty">No matching direct bookings.</div>';
  rows.forEach(r=>{
    const hold=r.hold_expires_at?`<span class="badge ${new Date(r.hold_expires_at)-Date.now()<21600000?'warn':''}">Hold expires ${esc(fmt(r.hold_expires_at))}</span>`:'';
    const card=document.createElement('article');
    card.className='reservation-card';
    card.innerHTML=`<div class="reservation-grid"><div><span class="badge ${statusClass(r.status)}">${esc(statusLabel(r.status))}</span><h3>${esc(r.guest_name)} · ${esc(r.checkin)} → ${esc(r.checkout)}</h3><div class="reservation-meta">${esc(r.id)} · ${esc(r.guests)} guests · ${esc(r.guest_email)}${r.guest_phone?' · '+esc(r.guest_phone):''}</div>${r.notes?`<p class="reservation-meta">${esc(r.notes)}</p>`:''}<div class="reservation-badges">${hold}<span class="badge ${r.contract_sent_at?'good':''}">Contract ${r.contract_sent_at?'sent':'pending'}</span><span class="badge ${r.contract_signed_at?'good':''}">Signed ${r.contract_signed_at?'yes':'pending'}</span><span class="badge ${r.deposit_received_at?'good':''}">Deposit ${r.deposit_received_at?'received':'pending'}</span></div>${quoteMarkup(r)}</div><div><div class="reservation-meta">Created ${esc(fmt(r.created_at))}</div><div class="actions" style="margin-top:14px">${actionMarkup(r)}</div></div></div>`;
    card.querySelectorAll('button[data-action]').forEach(b=>b.onclick=()=>updateReservation(r.id,b.dataset.action));
    card.querySelector('[data-quote="adjust"]')?.addEventListener('click',()=>adjustQuote(r));
    reservationList.appendChild(card);
  });
}

async function updateReservation(id,status){
  if(['reject_request','release_dates'].includes(status)&&!confirm('Release these dates back to inventory?'))return;
  try{
    await ownerApi({method:'POST',body:JSON.stringify({action:'update',id,status})});
    await loadReservations();
  }catch(e){
    if(e.message==='unauthorized'){notice('Sign in to make changes. Password-free preview access is read-only.');return showLogin();}
    notice(`That booking update could not be completed: ${e.message}`);
  }
}

async function adjustQuote(r){
  const current=Number(r.quote?.lodgingSubtotal||0);
  const value=prompt('Enter the new lodging subtotal before cleaning and tax:',current?String(current):'');
  if(value===null)return;
  const amount=Number(value);
  if(!Number.isFinite(amount)||amount<=0)return notice('Enter a valid lodging subtotal.');
  try{
    await ownerApi({method:'POST',body:JSON.stringify({action:'update_quote',id:r.id,lodgingSubtotal:amount})});
    await loadReservations();
  }catch(e){
    if(e.message==='unauthorized'){notice('Sign in to adjust a quote. Password-free preview access is read-only.');return showLogin();}
    notice(`Quote could not be updated: ${e.message}`);
  }
}

function renderCommunicationsQuick(data){
  const s=data.communications?.summary||{};
  document.getElementById('communicationsNavCount').textContent=s.unread||0;
  document.getElementById('quickUnread').textContent=s.unread||0;
  document.getElementById('quickAirbnb').textContent=s.airbnb_unread||0;
  document.getElementById('quickVrbo').textContent=s.vrbo_unread||0;
  const rows=data.communications?.recent||[];
  document.getElementById('quickCommunications').innerHTML=rows.length?rows.map(m=>`<div class="list-row"><div><strong>${esc(m.guest_name||m.subject||'Guest')}</strong><span>${esc(m.platform)} · ${esc(m.snippet||m.subject||'')}</span></div><span class="badge ${m.is_read?'':'warn'}">${m.is_read?'read':'unread'}</span></div>`).join(''):'<div class="empty">Communications automation is deferred while the booking engine is built.</div>';
}

async function loadReservations(){
  try{
    const [d,dashboard]=await Promise.all([ownerApi(),dashboardApi()]);
    reservationRows=d.reservations||[];
    showApp();
    renderSummary();renderFilters();renderReservations();renderCommunicationsQuick(dashboard);
    document.getElementById('lastChecked').textContent=`Updated ${new Date(dashboard.checkedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}`;
  }catch(e){
    if(e.message==='unauthorized')return showLogin();
    showApp();
    notice('Direct bookings could not be loaded. No production data was changed.');
  }
}

document.getElementById('reservationSearch').addEventListener('input',renderReservations);
loginForm.addEventListener('submit',async e=>{
  e.preventDefault();
  loginMsg.textContent='Signing in…';
  const r=await fetch('/api/owner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',passcode:document.getElementById('passcode').value})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){loginMsg.textContent=d.error==='owner_login_not_configured'?'Owner login is not configured for this environment.':'Invalid passcode.';return}
  document.getElementById('passcode').value='';loginMsg.textContent='';loadReservations();
});

loadReservations();
