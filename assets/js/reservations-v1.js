let reservationRows=[];
let ownerNotifications=[];
let reservationFilter='all';
const completionLinks=new Map();

const loginShell=document.getElementById('loginShell');
const ownerApp=document.getElementById('ownerApp');
const loginForm=document.getElementById('loginForm');
const loginMsg=document.getElementById('loginMsg');
const reservationList=document.getElementById('reservationList');

function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function fmt(v){return v?new Date(v).toLocaleString():'—'}
function money(v){return Number(v||0).toLocaleString(undefined,{style:'currency',currency:'USD'});}
function statusLabel(r){
  const life=r.lifecycle||{};
  if(r.status==='inquiry_hold'&&life.processing)return 'Processing';
  return ({inquiry_hold:'New request',hold_verified:'Owner approved',contract_sent:'Agreement sent',contract_signed:'Agreement accepted',confirmed:'Confirmed',released:'Released',expired:'Expired',cancelled:'Cancelled'})[r.status]||String(r.status||'').replaceAll('_',' ');
}
function isActive(r){return !['released','expired','cancelled'].includes(r.status)}
function needsAction(r){
  const life=r.lifecycle||{};
  return ['inquiry_hold','hold_verified','contract_sent'].includes(r.status)||life.agreementStale;
}
function statusClass(r){
  if(['confirmed'].includes(r.status)||r.lifecycle?.agreementAccepted)return 'good';
  if(['inquiry_hold','hold_verified','contract_sent'].includes(r.status)||r.lifecycle?.agreementStale)return 'warn';
  return '';
}
function eventLabel(type=''){
  return ({
    request_received:'Request received',
    inquiry_created:'Request received',
    request_processing:'Request processing',
    owner_approved:'Owner approved',
    request_accepted:'Owner approved',
    owner_declined:'Owner declined',
    request_rejected:'Owner declined',
    agreement_sent:'Agreement sent',
    agreement_accepted:'Agreement accepted',
    agreement_reacceptance_required:'Revised terms require new acceptance',
    quote_updated:'Quote adjusted',
    hold_extended:'Hold extended',
    hold_maintained:'Hold extended',
    hold_expired:'Hold expired',
    dates_released:'Dates released',
    payment_pending:'Payment pending (deferred)',
    payment_verified:'Payment verified',
    payment_checkout_created:'Payment checkout created',
    reservation_confirmed:'Reservation confirmed',
    guest_confirmed:'Reservation confirmed',
    deposit_received:'Deposit recorded'
  })[type]||String(type).replaceAll('_',' ');
}
function showLogin(){ownerApp.classList.add('hidden');loginShell.classList.remove('hidden')}
function showApp(){loginShell.classList.add('hidden');ownerApp.classList.remove('hidden')}
function notice(text){const n=document.getElementById('moduleNotice');n.textContent=text;n.classList.remove('hidden');setTimeout(()=>n.classList.add('hidden'),8000)}

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
  const cards=[['New requests',newReq.length,'awaiting owner review'],['Active',active.length,'open direct bookings'],['Need action',action.length,'booking steps'],['Confirmed',confirmed.length,'confirmed · deferred'],['Active value',money(value),'quoted trip total']];
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
  if(p.mode==='split')return `<div class="list-row"><div><strong>Payment schedule</strong><span>${esc(money(p.dueAtBooking))} initially (50%) · ${esc(money(p.remainingBalance))} due ${esc(p.balanceDueDateLabel||'30 days before arrival')}</span></div><span class="badge warn">Deferred</span></div>`;
  return `<div class="list-row"><div><strong>Payment schedule</strong><span>${esc(money(p.dueAtBooking||q.total))} due in full (arrival within 30 days)</span></div><span class="badge warn">Deferred</span></div>`;
}

function quoteMarkup(r){
  const q=r.quote;
  if(!q)return '<div class="empty" style="margin-top:12px">No stored quote on this older reservation.</div>';
  const lines=(q.priceLines||[]).map(x=>`<div class="list-row"><div><strong>${esc(x.season)}</strong><span>${esc(x.nights)} night${Number(x.nights)===1?'':'s'} × ${esc(money(x.nightlyRate))}</span></div><b>${esc(money(x.subtotal))}</b></div>`).join('');
  return `<div class="card" style="margin-top:14px;padding:14px;background:var(--cjt-soft)"><div class="card-head"><div><h3 style="font-size:1rem">Direct quote${q.legacy?' <span class="badge warn">Legacy</span>':''}</h3><p>${esc(q.nights)} nights · average ${esc(money(q.averageNightly||Number(q.lodgingSubtotal||0)/Math.max(Number(q.nights||1),1)))}/night${q.ownerAdjusted?' · owner adjusted':''}</p></div><strong style="font-size:1.25rem">${esc(money(q.total))}</strong></div><div class="list compact-list">${lines}<div class="list-row"><div><strong>Lodging</strong></div><b>${esc(money(q.lodgingSubtotal))}</b></div><div class="list-row"><div><strong>Cleaning</strong></div><b>${esc(money(q.cleaningFee))}</b></div><div class="list-row"><div><strong>Tax</strong><span>${Math.round(Number(q.taxRate||0)*100)}%</span></div><b>${esc(money(q.taxes))}</b></div>${paymentMarkup(q)}<div class="list-row"><div><strong>Stripe payment</strong><span>Collection and confirmation are deferred</span></div><span class="badge warn">On hold</span></div></div></div>`;
}

function timelineMarkup(r){
  const events=(r.events||[]).slice(-8).reverse();
  if(!events.length)return '<div class="empty" style="margin-top:12px">No booking events yet.</div>';
  return `<div class="list compact-list" style="margin-top:12px">${events.map(event=>`<div class="list-row"><div><strong>${esc(eventLabel(event.event_type))}</strong><span>${esc(fmt(event.created_at))}${event.metadata?.agreementVersion?` · ${esc(event.metadata.agreementVersion)}`:''}${event.metadata?.acceptedName?` · ${esc(event.metadata.acceptedName)}`:''}</span></div></div>`).join('')}</div>`;
}

function completionMarkup(r){
  const life=r.lifecycle||{};
  const stored=completionLinks.get(r.id);
  if(life.agreementAccepted){
    return `<div class="notice" style="margin-top:12px"><strong>Agreement accepted</strong> — not signature or identity verified.${life.acceptedName?` Typed name: ${esc(life.acceptedName)}.`:''} Payment and confirmation remain deferred.</div>`;
  }
  if(stored){
    return `<div class="notice" style="margin-top:12px"><strong>Complete your booking link</strong><div class="reservation-meta" style="word-break:break-all">${esc(stored)}</div><div class="actions" style="margin-top:8px"><button class="btn btn-secondary" data-copy-link="1">Copy link</button></div></div>`;
  }
  if(life.ownerApproved||['hold_verified','contract_sent','contract_signed'].includes(r.status)){
    return `<div class="notice" style="margin-top:12px">Owner approved. Generate the guest’s one Complete your booking link. Approval does not confirm the reservation.${life.agreementStale?' Revised terms require a new acceptance.':''}</div>`;
  }
  return '';
}

function actionMarkup(r){
  if(!isActive(r))return '<span class="reservation-meta">Closed reservation · no active actions</span>';
  const life=r.lifecycle||{};
  const process=r.status==='inquiry_hold'&&!life.processing?'<button class="btn btn-secondary" data-owner-action="process_request">Process</button>':'';
  const approve=r.status==='inquiry_hold'||life.agreementStale?'<button class="btn btn-primary" data-owner-action="approve_request">Approve &amp; send completion link</button>':'';
  const issue=life.ownerApproved||['hold_verified','contract_sent','contract_signed'].includes(r.status)?'<button class="btn btn-secondary" data-owner-action="issue_completion_link">Generate completion link</button>':'';
  const record=life.agreementAccepted?'<button class="btn btn-secondary" data-owner-action="agreement_record">Download agreement</button>':'';
  const adjust=r.quote?'<button class="btn btn-secondary" data-quote="adjust">Adjust Quote</button>':'';
  const reject='<button class="btn danger-btn" data-owner-action="reject_request">Decline / Release</button>';
  return `${process}${approve}${issue}${record}${adjust}<button class="btn btn-secondary" data-owner-action="maintain_hold">Extend Hold</button>${reject}`;
}

function renderQueue(){
  const target=document.getElementById('ownerQueue');
  if(!target)return;
  const rows=ownerNotifications||[];
  target.innerHTML=rows.length?rows.map(n=>`<div class="list-row"><div><strong>${esc(n.title)}</strong><span>${esc(n.body||n.kind)} · ${esc(fmt(n.created_at))}</span></div><span class="badge warn">New</span></div>`).join(''):'<div class="empty">No unread booking notifications.</div>';
}

function renderReservations(){
  const rows=filteredReservations();
  reservationList.innerHTML=rows.length?'':'<div class="empty">No matching direct bookings.</div>';
  rows.forEach(r=>{
    const life=r.lifecycle||{};
    const hold=r.hold_expires_at?`<span class="badge ${new Date(r.hold_expires_at)-Date.now()<21600000?'warn':''}">Hold expires ${esc(fmt(r.hold_expires_at))}</span>`:'';
    const card=document.createElement('article');
    card.className='reservation-card';
    card.innerHTML=`<div class="reservation-grid"><div><span class="badge ${statusClass(r)}">${esc(statusLabel(r))}</span><h3>${esc(r.guest_name)} · ${esc(r.checkin)} → ${esc(r.checkout)}</h3><div class="reservation-meta">${esc(r.id)} · ${esc(r.guests)} guests · ${esc(r.guest_email)}${r.guest_phone?' · '+esc(r.guest_phone):''}</div>${r.notes?`<p class="reservation-meta">${esc(r.notes)}</p>`:''}<div class="reservation-badges">${hold}<span class="badge ${life.ownerApproved?'good':''}">Owner ${life.ownerApproved?'approved':'review'}</span><span class="badge ${life.agreementAccepted?'good':life.agreementStale?'warn':''}">${esc(life.agreementLabel||'Agreement pending')}</span><span class="badge warn">Payment deferred</span><span class="badge">Not confirmed</span></div>${quoteMarkup(r)}${completionMarkup(r)}${timelineMarkup(r)}</div><div><div class="reservation-meta">Created ${esc(fmt(r.created_at))}</div><div class="actions" style="margin-top:14px">${actionMarkup(r)}</div></div></div>`;
    card.querySelectorAll('[data-owner-action]').forEach(b=>b.onclick=()=>runOwnerAction(r,b.dataset.ownerAction));
    card.querySelector('[data-quote="adjust"]')?.addEventListener('click',()=>adjustQuote(r));
    card.querySelector('[data-copy-link]')?.addEventListener('click',async()=>{
      const url=completionLinks.get(r.id);
      if(url&&navigator.clipboard)await navigator.clipboard.writeText(url);
      notice('Completion link copied. Do not email it from this preview unless Joel has an approved delivery path.');
    });
    reservationList.appendChild(card);
  });
}

async function runOwnerAction(r,action){
  if(['reject_request','release_dates'].includes(action)&&!confirm('Release these dates back to inventory?'))return;
  try{
    const data=await ownerApi({method:'POST',body:JSON.stringify({action,id:r.id,status:action})});
    if(data.completionUrl){
      completionLinks.set(r.id,data.completionUrl);
      if(navigator.clipboard)await navigator.clipboard.writeText(data.completionUrl);
      notice(data.message||'Completion link generated and copied. Owner approval does not confirm the reservation.');
    }else if(data.record?.content){
      const blob=new Blob([data.record.content],{type:'text/plain'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url;
      a.download=`${r.id}-${data.record.agreementVersion||'agreement'}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      notice('Agreement and acceptance record downloaded.');
    }else{
      notice(data.message||'Booking record updated.');
    }
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
    completionLinks.delete(r.id);
    await loadReservations();
    notice('Quote updated. If a completion link already existed, the guest must accept the revised agreement.');
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
    ownerNotifications=d.notifications||[];
    showApp();
    renderSummary();renderFilters();renderReservations();renderQueue();renderCommunicationsQuick(dashboard);
    document.getElementById('lastChecked').textContent=`Updated ${new Date(dashboard.checkedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}`;
  }catch(e){
    if(e.message==='unauthorized')return showLogin();
    showApp();
    notice('Direct bookings could not be loaded. No production data was changed.');
  }
}

document.getElementById('reservationSearch').addEventListener('input',renderReservations);
document.getElementById('markQueueRead')?.addEventListener('click',async()=>{
  try{
    await ownerApi({method:'POST',body:JSON.stringify({action:'mark_notifications_read'})});
    await loadReservations();
  }catch(e){
    if(e.message==='unauthorized')return showLogin();
    notice(e.message);
  }
});
loginForm.addEventListener('submit',async e=>{
  e.preventDefault();
  loginMsg.textContent='Signing in…';
  const r=await fetch('/api/owner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',passcode:document.getElementById('passcode').value})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){loginMsg.textContent=d.error==='owner_login_not_configured'?'Owner login is not configured for this environment.':'Invalid passcode.';return}
  document.getElementById('passcode').value='';loginMsg.textContent='';loadReservations();
});

loadReservations();
