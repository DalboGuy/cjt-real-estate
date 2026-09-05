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
function statusLabel(v=''){return String(v).replaceAll('_',' ')}
function isActive(r){return !['released','expired','cancelled'].includes(r.status)}
function needsAction(r){return ['inquiry_hold','hold_verified','contract_sent','contract_signed'].includes(r.status)}
function statusClass(status=''){return ['confirmed','contract_signed'].includes(status)?'good':['inquiry_hold','hold_verified','contract_sent'].includes(status)?'warn':''}
function showLogin(){ownerApp.classList.add('hidden');loginShell.classList.remove('hidden')}
function showApp(){loginShell.classList.add('hidden');ownerApp.classList.remove('hidden')}

async function ownerApi(opts={}){
  const r=await fetch('/api/owner',{headers:{'Content-Type':'application/json'},cache:'no-store',...opts});
  const d=await r.json().catch(()=>({}));
  if(r.status===401)throw new Error('unauthorized');
  if(!r.ok)throw new Error(d.error||'owner_request_failed');
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
  const action=reservationRows.filter(needsAction);
  const confirmed=reservationRows.filter(r=>r.status==='confirmed');
  const closed=reservationRows.filter(r=>!isActive(r));
  const next=active.filter(r=>r.checkin>=new Date().toISOString().slice(0,10)).sort((a,b)=>a.checkin.localeCompare(b.checkin))[0];
  const cards=[['All',reservationRows.length,'records'],['Active',active.length,'open bookings'],['Need action',action.length,'booking steps'],['Confirmed',confirmed.length,'confirmed'],['Next arrival',next?.checkin||'—',next?.guest_name||'none scheduled']];
  document.getElementById('reservationSummary').innerHTML=cards.map(c=>`<div class="summary-card"><span>${esc(c[0])}</span><b style="${c[0]==='Next arrival'?'font-size:1rem':''}">${esc(c[1])}</b><span>${esc(c[2])}</span></div>`).join('');
  document.getElementById('closedCount').textContent=closed.length;
}

function renderFilters(){
  const vals=[['all','All'],['active','Active'],['action','Need action'],['confirmed','Confirmed'],['closed','Closed']];
  document.getElementById('reservationFilters').innerHTML=vals.map(([v,l])=>`<button class="filter-btn ${reservationFilter===v?'active':''}" data-filter="${v}">${l}</button>`).join('');
  document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{reservationFilter=b.dataset.filter;renderFilters();renderReservations()});
}

function filteredReservations(){
  const q=document.getElementById('reservationSearch').value.trim().toLowerCase();
  return reservationRows.filter(r=>{
    const match=reservationFilter==='all'||(reservationFilter==='active'&&isActive(r))||(reservationFilter==='action'&&needsAction(r))||(reservationFilter==='confirmed'&&r.status==='confirmed')||(reservationFilter==='closed'&&!isActive(r));
    if(!match)return false;
    if(!q)return true;
    return [r.id,r.guest_name,r.guest_email,r.guest_phone,r.notes,r.checkin,r.checkout,r.status].join(' ').toLowerCase().includes(q);
  });
}

function renderReservations(){
  const rows=filteredReservations();
  reservationList.innerHTML=rows.length?'':'<div class="empty">No matching reservations.</div>';
  rows.forEach(r=>{
    const active=isActive(r);
    const hold=r.hold_expires_at?`<span class="badge ${new Date(r.hold_expires_at)-Date.now()<21600000?'warn':''}">Hold expires ${esc(fmt(r.hold_expires_at))}</span>`:'';
    const card=document.createElement('article');
    card.className='reservation-card';
    card.innerHTML=`<div class="reservation-grid"><div><span class="badge ${statusClass(r.status)}">${esc(statusLabel(r.status))}</span><h3>${esc(r.guest_name)} · ${esc(r.checkin)} → ${esc(r.checkout)}</h3><div class="reservation-meta">${esc(r.id)} · ${esc(r.guests)} guests · ${esc(r.guest_email)}${r.guest_phone?' · '+esc(r.guest_phone):''}</div>${r.notes?`<p class="reservation-meta">${esc(r.notes)}</p>`:''}<div class="reservation-badges">${hold}<span class="badge ${r.contract_sent_at?'good':''}">Contract ${r.contract_sent_at?'sent':'pending'}</span><span class="badge ${r.contract_signed_at?'good':''}">Signed ${r.contract_signed_at?'yes':'pending'}</span><span class="badge ${r.deposit_received_at?'good':''}">Deposit ${r.deposit_received_at?'received':'pending'}</span></div></div><div><div class="reservation-meta">Created ${esc(fmt(r.created_at))}</div><div class="actions" style="margin-top:14px">${active?`<button class="btn btn-secondary" data-action="maintain_hold">Maintain Hold</button><a class="btn btn-secondary" target="_blank" rel="noopener" href="${TEMPLATE}">Open OpenSign ↗</a><button class="btn btn-secondary" data-action="contract_sent">Contract Sent</button><button class="btn btn-secondary" data-action="contract_signed">Contract Signed</button><button class="btn btn-primary" data-action="deposit_received">Received Deposit</button><button class="btn danger-btn" data-action="release_dates">Release Dates</button>`:'<span class="reservation-meta">Closed reservation · no active actions</span>'}</div></div></div>`;
    card.querySelectorAll('button[data-action]').forEach(b=>b.onclick=()=>updateReservation(r.id,b.dataset.action));
    reservationList.appendChild(card);
  });
}

async function updateReservation(id,status){
  if(status==='release_dates'&&!confirm('Release these dates back to inventory?'))return;
  try{
    await ownerApi({method:'POST',body:JSON.stringify({action:'update',id,status})});
    await loadReservations();
  }catch(e){
    const n=document.getElementById('moduleNotice');n.textContent='That reservation update could not be completed.';n.classList.remove('hidden');
  }
}

function renderCommunicationsQuick(data){
  const s=data.communications?.summary||{};
  document.getElementById('communicationsNavCount').textContent=s.unread||0;
  document.getElementById('quickUnread').textContent=s.unread||0;
  document.getElementById('quickAirbnb').textContent=s.airbnb_unread||0;
  document.getElementById('quickVrbo').textContent=s.vrbo_unread||0;
  const rows=data.communications?.recent||[];
  document.getElementById('quickCommunications').innerHTML=rows.length?rows.map(m=>`<div class="list-row"><div><strong>${esc(m.guest_name||m.subject||'Guest')}</strong><span>${esc(m.platform)} · ${esc(m.snippet||m.subject||'')}</span></div><span class="badge ${m.is_read?'':'warn'}">${m.is_read?'read':'unread'}</span></div>`).join(''):'<div class="empty">No OTA messages have been ingested yet.</div>';
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
    const n=document.getElementById('moduleNotice');n.textContent='Reservations could not be loaded. No production data was changed.';n.classList.remove('hidden');
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
