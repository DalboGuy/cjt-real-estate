const TEMPLATE='https://app.opensignlabs.com/publicsign?templateid=JGD2FwG4MP';
let reservationRows=[];
let reservationFilter='all';
const busyIds=new Set();
const quoteDrafts={};

const loginShell=document.getElementById('loginShell');
const ownerApp=document.getElementById('ownerApp');
const loginForm=document.getElementById('loginForm');
const loginMsg=document.getElementById('loginMsg');
const reservationList=document.getElementById('reservationList');

function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function fmt(v){return v?new Date(v).toLocaleString():'—'}
function money(v){return Number(v||0).toLocaleString(undefined,{style:'currency',currency:'USD'});}
function statusLabel(v=''){return window.CJTOwnerShell?.statusLabel?.(v)||({inquiry_hold:'Request received',hold_verified:'Owner approved',contract_sent:'Contract sent',contract_signed:'Contract completed',confirmed:'Confirmed'})[v]||String(v).replaceAll('_',' ')}
function paymentLabel(r){return window.CJTOwnerShell?.paymentLabel?.(r)||(r?.payment?.verified||r?.deposit_received_at?'Payment received':'Payment pending')}
function isActive(r){return !['released','expired','cancelled'].includes(r.status)}
function needsAction(r){return ['inquiry_hold','hold_verified','contract_sent','contract_signed'].includes(r.status)}
function statusClass(status=''){return ['confirmed','completed'].includes(status)?'good':['inquiry_hold','hold_verified','contract_sent','contract_signed'].includes(status)?'warn':''}
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
  const cards=[
    ['Request received',newReq.length,'awaiting owner review','pending'],
    ['Active',active.length,'open direct bookings','active'],
    ['Need action',action.length,'booking steps','action'],
    ['Confirmed',confirmed.length,'confirmed stays only','confirmed'],
    ['Active value',money(value),'quoted trip total','']
  ];
  document.getElementById('reservationSummary').innerHTML=cards.map(c=>{
    const inner=`<span>${esc(c[0])}</span><b style="${c[0]==='Active value'?'font-size:1.05rem':''}">${esc(c[1])}</b><span>${esc(c[2])}</span>`;
    if(!c[3])return `<div class="summary-card">${inner}</div>`;
    return `<a class="summary-card kpi-card" href="/owner-v1/reservations?status=${esc(c[3])}&property=sand-sea-manor">${inner}</a>`;
  }).join('');
  document.getElementById('closedCount').textContent=closed.length;
}

function renderFilters(){
  const vals=[['all','All'],['new','Request received'],['active','Active'],['action','Need action'],['confirmed','Confirmed'],['closed','Closed']];
  document.getElementById('reservationFilters').innerHTML=vals.map(([v,l])=>`<button class="filter-btn ${reservationFilter===v?'active':''}" data-filter="${v}">${l}</button>`).join('');
  document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{
    reservationFilter=b.dataset.filter;
    window.CJTOwnerShell?.writeContext?.({status:reservationFilter==='all'?null:reservationFilter},{push:true});
    renderFilters();
    renderReservations();
  });
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
  const draft=quoteDrafts[r.id]!=null?quoteDrafts[r.id]:q.lodgingSubtotal;
  const paid=r.payment?.verified||r.deposit_received_at;
  const adjust=isActive(r)?`<div class="quote-adjust"><label>Lodging subtotal <input type="number" min="1" step="1" data-quote-input value="${esc(draft)}" aria-label="Lodging subtotal for ${esc(r.guest_name)}"></label><button type="button" class="btn btn-secondary" data-quote="save">Save quote</button><a class="btn btn-secondary" href="/owner-v1/pricing?date=${esc(r.checkin)}&property=sand-sea-manor">Open Pricing</a><span data-quote-status class="metric-label"></span></div>`:'';
  return `<div class="card" style="margin-top:14px;padding:14px;background:var(--cjt-soft)"><div class="card-head"><div><h3 style="font-size:1rem">Direct quote${q.legacy?' <span class="badge warn">Legacy</span>':''}</h3><p>${esc(q.nights)} nights · average ${esc(money(q.averageNightly||Number(q.lodgingSubtotal||0)/Math.max(Number(q.nights||1),1)))}/night${q.ownerAdjusted?' · owner adjusted':''}</p></div><strong style="font-size:1.25rem">${esc(money(q.total))}</strong></div><div class="list compact-list">${lines}<div class="list-row"><div><strong>Lodging</strong></div><b>${esc(money(q.lodgingSubtotal))}</b></div><div class="list-row"><div><strong>Cleaning</strong></div><b>${esc(money(q.cleaningFee))}</b></div><div class="list-row"><div><strong>Tax</strong><span>${Math.round(Number(q.taxRate||0)*100)}%</span></div><b>${esc(money(q.taxes))}</b></div>${paymentMarkup(q)}<div class="list-row"><div><strong>Payment</strong><span>${esc(paymentLabel(r))}</span></div>${paid?`<b>${esc(money(r.payment?.verifiedAmount))}</b>`:'<span class="badge warn">Payment pending</span>'}</div></div>${adjust}</div>`;
}

function actionMarkup(r){
  if(!isActive(r))return '<span class="reservation-meta">Closed reservation · no active actions</span>';
  const primary=r.status==='inquiry_hold'?'<button class="btn btn-primary" data-action="accept_request">Owner approved</button>':'';
  const reject=!['confirmed'].includes(r.status)?'<button class="btn danger-btn" data-action="reject_request">Reject / Release</button>':'';
  return `${primary}<button class="btn btn-secondary" data-action="maintain_hold">Keep dates blocked</button><a class="btn btn-secondary" target="_blank" rel="noopener" href="${TEMPLATE}">Open Contract ↗</a><button class="btn btn-secondary" data-action="contract_sent">Contract sent</button><button class="btn btn-secondary" data-action="contract_signed">Contract completed</button><p class="metric-label" style="margin:8px 0 0">Stripe is on hold — no checkout or charges from this page.</p>${r.payment?.verified?'': '<button class="btn btn-primary" data-action="deposit_received">Payment received</button>'}${reject}`;
}

function statusFromUrl(){
  const ctx=window.CJTOwnerShell?.readContext?.()||{};
  const status=String(ctx.status||'').toLowerCase();
  if(status==='pending'||status==='new'||status==='inquiry_hold')return 'new';
  if(['action','active','confirmed','closed','all'].includes(status))return status;
  return 'all';
}
function bookingFromUrl(){
  try{
    const ctx=window.CJTOwnerShell?.readContext?.();
    return ctx?.booking||ctx?.id||new URLSearchParams(location.search).get('booking')||'';
  }catch(e){return ''}
}
function applyContextToControls(push){
  const ctx=window.CJTOwnerShell?.readContext?.()||{};
  reservationFilter=statusFromUrl();
  const search=document.getElementById('reservationSearch');
  if(search&&ctx.q!=null)search.value=ctx.q;
  if(window.CJTOwnerShell?.writeContext){
    window.CJTOwnerShell.writeContext({status:reservationFilter==='all'?null:reservationFilter,q:search?.value||null,booking:bookingFromUrl()||null},{push:Boolean(push)});
  }
}

function renderReservations(){
  const rows=filteredReservations();
  reservationList.innerHTML=rows.length?'':'<div class="empty">No matching direct bookings.</div>';
  rows.forEach(r=>{
    const hold=r.status==='inquiry_hold'?'<span class="badge warn">Dates blocked until you act</span>':'';
    const card=document.createElement('article');
    card.className='reservation-card';
    card.id=`booking-${r.id}`;
    card.dataset.booking=r.id;
    card.innerHTML=`<div class="reservation-grid"><div><span class="badge ${statusClass(r.status)}">${esc(statusLabel(r.status))}</span><h3>${esc(r.guest_name)} · ${esc(r.checkin)} → ${esc(r.checkout)}</h3><div class="reservation-meta">${esc(r.id)} · ${esc(r.guests)} guests · ${esc(r.guest_email)}${r.guest_phone?' · '+esc(r.guest_phone):''}</div>${r.notes?`<p class="reservation-meta">${esc(r.notes)}</p>`:''}<div class="reservation-badges">${hold}<span class="badge ${r.contract_sent_at||['contract_sent','contract_signed','confirmed'].includes(r.status)?'good':''}">${r.contract_sent_at||['contract_sent','contract_signed','confirmed'].includes(r.status)?'Contract sent':'Contract sent pending'}</span><span class="badge ${r.contract_signed_at||['contract_signed','confirmed'].includes(r.status)?'good':''}">${r.contract_signed_at||['contract_signed','confirmed'].includes(r.status)?'Contract completed':'Contract completed pending'}</span><span class="badge ${r.deposit_received_at||r.payment?.verified?'good':''}">${esc(paymentLabel(r))}</span>${r.status==='confirmed'?'<span class="badge good">Confirmed</span>':''}</div>${quoteMarkup(r)}</div><div><div class="reservation-meta">Created ${esc(fmt(r.created_at))}</div><div class="actions" style="margin-top:14px">${actionMarkup(r)}</div></div></div>`;
    card.querySelectorAll('button[data-action]').forEach(b=>b.onclick=()=>updateReservation(r.id,b.dataset.action,card));
    card.querySelector('[data-quote="save"]')?.addEventListener('click',()=>saveQuote(r,card));
    card.querySelector('[data-quote-input]')?.addEventListener('input',e=>{quoteDrafts[r.id]=e.target.value;});
    reservationList.appendChild(card);
  });
}

async function updateReservation(id,status,card){
  if(busyIds.has(id))return;
  if(['reject_request','release_dates'].includes(status)&&!confirm('Release these dates back to inventory?'))return;
  busyIds.add(id);
  card?.querySelectorAll('button[data-action]').forEach(btn=>{btn.disabled=true;});
  try{
    await ownerApi({method:'POST',body:JSON.stringify({action:'update',id,status})});
    notice('Saved.');
    await loadReservations();
  }catch(e){
    if(e.message==='unauthorized'){notice('Sign in to make changes. Password-free preview access is read-only.');return showLogin();}
    notice(`That booking update could not be completed: ${e.message}`);
    card?.querySelectorAll('button[data-action]').forEach(btn=>{btn.disabled=false;});
  }finally{
    busyIds.delete(id);
  }
}

async function saveQuote(r,card){
  const input=card.querySelector('[data-quote-input]');
  const status=card.querySelector('[data-quote-status]');
  const btn=card.querySelector('[data-quote="save"]');
  const amount=Number(input?.value);
  if(input)quoteDrafts[r.id]=input.value;
  if(!Number.isFinite(amount)||amount<=0){
    if(status)status.textContent='Enter a valid lodging subtotal.';
    return;
  }
  if(busyIds.has(r.id))return;
  busyIds.add(r.id);
  if(btn)btn.disabled=true;
  if(status)status.textContent='Saving…';
  try{
    await ownerApi({method:'POST',body:JSON.stringify({action:'update_quote',id:r.id,lodgingSubtotal:amount})});
    delete quoteDrafts[r.id];
    notice('Quote saved.');
    await loadReservations();
  }catch(e){
    if(e.message==='unauthorized'){notice('Sign in to adjust a quote. Password-free preview access is read-only.');return showLogin();}
    if(status)status.textContent=`Quote could not be updated: ${e.message}`;
    if(btn)btn.disabled=false;
  }finally{
    busyIds.delete(r.id);
  }
}

function renderCommunicationsQuick(data){
  const s=data.communications?.summary||{};
  document.getElementById('communicationsNavCount').textContent=s.unread||0;
  document.getElementById('quickUnread').textContent=s.unread||0;
  document.getElementById('quickAirbnb').textContent=s.airbnb_unread||0;
  document.getElementById('quickVrbo').textContent=s.vrbo_unread||0;
  const rows=data.communications?.recent||[];
  document.getElementById('quickCommunications').innerHTML=rows.length?rows.map(m=>`<div class="list-row"><div><a href="/owner-v1/communications?message=${encodeURIComponent(m.id)}&property=sand-sea-manor"><strong>${esc(m.guest_name||m.subject||'Guest')}</strong><span>${esc(m.platform)} · ${esc(m.snippet||m.subject||'')}</span></a></div><span class="badge ${m.is_read?'':'warn'}">${m.is_read?'read':'unread'}</span></div>`).join(''):'<div class="empty">Communications automation is deferred while the booking engine is built.</div>';
}

async function loadReservations(){
  try{
    const [d,dashboard]=await Promise.all([ownerApi(),dashboardApi()]);
    reservationRows=d.reservations||[];
    showApp();
    applyContextToControls(false);
    const focusId=bookingFromUrl();
    const search=document.getElementById('reservationSearch');
    if(focusId&&search&&!search.value)search.value=focusId;
    renderSummary();renderFilters();renderReservations();renderCommunicationsQuick(dashboard);
    if(focusId){
      let focused=document.getElementById(`booking-${focusId}`);
      if(!focused){
        reservationFilter='all';
        renderFilters();
        renderReservations();
        focused=document.getElementById(`booking-${focusId}`);
      }
      if(focused){
        focused.scrollIntoView({block:'start'});
        focused.style.outline='2px solid var(--cjt-deep)';
      }else{
        notice(window.CJTOwnerShell?.cannotApply?.('the selected booking','Bookings')||'Bookings could not apply the selected booking.');
      }
    }
    document.getElementById('lastChecked').textContent=`Updated ${new Date(dashboard.checkedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}`;
  }catch(e){
    if(e.message==='unauthorized')return showLogin();
    showApp();
    notice('Direct bookings could not be loaded. No production data was changed.');
  }
}

document.getElementById('reservationSearch').addEventListener('input',()=>{
  window.CJTOwnerShell?.writeContext?.({q:document.getElementById('reservationSearch').value},{push:false});
  renderReservations();
});
window.addEventListener('cjt-context-change',()=>{
  applyContextToControls(false);
  renderFilters();
  renderReservations();
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
