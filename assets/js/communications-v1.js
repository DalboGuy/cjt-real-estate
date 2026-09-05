let communicationsMessages=[];
let currentCommunicationFilter='all';
let selectedCommunicationId=null;

const loginShell=document.getElementById('loginShell');
const ownerApp=document.getElementById('ownerApp');
const loginForm=document.getElementById('loginForm');
const loginMsg=document.getElementById('loginMsg');
const messageList=document.getElementById('messageList');
const messageDetail=document.getElementById('messageDetail');

function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function fmt(v){return v?new Date(v).toLocaleString():''}
function platformClass(v=''){return String(v).toLowerCase().replace(/[^a-z0-9-]/g,'-')}
function showLogin(){ownerApp.classList.add('hidden');loginShell.classList.remove('hidden')}
function showApp(){loginShell.classList.add('hidden');ownerApp.classList.remove('hidden')}

async function commApi(opts={}){
  const r=await fetch('/api/communications',{headers:{'Content-Type':'application/json'},cache:'no-store',...opts});
  const d=await r.json().catch(()=>({}));
  if(r.status===401)throw new Error('unauthorized');
  if(!r.ok)throw new Error(d.error||'communications_request_failed');
  return d;
}

async function dashboardApi(){
  const r=await fetch('/api/dashboard',{cache:'no-store'});
  const d=await r.json().catch(()=>({}));
  if(r.status===401)throw new Error('unauthorized');
  if(!r.ok)throw new Error(d.error||'dashboard_request_failed');
  return d;
}

function summaryMap(counts){return Object.fromEntries(counts.map(x=>[String(x.platform).toLowerCase(),x]))}
function renderSummary(counts){
  const map=summaryMap(counts);
  const total=counts.reduce((a,x)=>a+Number(x.total||0),0);
  const unread=counts.reduce((a,x)=>a+Number(x.unread||0),0);
  const cards=[
    ['All',total,unread],
    ['Airbnb',map.airbnb?.total||0,map.airbnb?.unread||0],
    ['Vrbo',map.vrbo?.total||0,map.vrbo?.unread||0],
    ['Booking.com',(map.booking?.total||0)+(map['booking.com']?.total||0),(map.booking?.unread||0)+(map['booking.com']?.unread||0)],
    ['Houfy',map.houfy?.total||0,map.houfy?.unread||0]
  ];
  document.getElementById('communicationsNavCount').textContent=unread;
  document.getElementById('summaryGrid').innerHTML=cards.map(c=>`<div class="summary-card"><span>${c[0]}</span><b>${c[1]}</b><span>${c[2]} unread</span></div>`).join('');
}

function renderFilters(){
  const vals=[['all','All'],['airbnb','Airbnb'],['vrbo','Vrbo'],['booking','Booking.com'],['houfy','Houfy'],['open','Open'],['archived','Archived']];
  document.getElementById('communicationFilters').innerHTML=vals.map(([v,l])=>`<button class="filter-btn ${currentCommunicationFilter===v?'active':''}" data-filter="${v}">${l}</button>`).join('');
  document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{currentCommunicationFilter=b.dataset.filter;renderFilters();renderList()});
}

function filteredMessages(){
  const q=document.getElementById('communicationSearch').value.trim().toLowerCase();
  return communicationsMessages.filter(m=>{
    const p=String(m.platform||'').toLowerCase();
    const platformMatch=currentCommunicationFilter==='booking'?(p==='booking'||p==='booking.com'):p===currentCommunicationFilter;
    const ok=currentCommunicationFilter==='all'||platformMatch||(currentCommunicationFilter==='open'&&m.status==='open')||(currentCommunicationFilter==='archived'&&m.status==='archived');
    if(!ok)return false;
    if(!q)return true;
    return [m.guest_name,m.subject,m.snippet,m.body,m.reservation_ref,m.platform].join(' ').toLowerCase().includes(q);
  });
}

function renderList(){
  const rows=filteredMessages();
  messageList.innerHTML=rows.length?'':'<div class="empty">No matching messages.</div>';
  rows.forEach(m=>{
    const el=document.createElement('div');
    el.className=`message-item ${m.is_read?'':'unread'} ${selectedCommunicationId===m.id?'active':''}`;
    el.innerHTML=`<div class="message-row"><span class="platform ${platformClass(m.platform)}">${esc(m.platform)}</span><span class="meta">${esc(new Date(m.received_at).toLocaleDateString())}</span></div><strong>${esc(m.guest_name||m.subject||'Guest')}</strong><div>${esc(m.subject||'')}</div><div class="snippet">${esc(m.snippet||m.body||'')}</div>`;
    el.onclick=()=>selectMessage(m);
    messageList.appendChild(el);
  });
}

async function refreshCountsOnly(){
  const d=await commApi();
  communicationsMessages=d.messages||[];
  renderSummary(d.counts||[]);
  renderList();
}

async function selectMessage(m){
  selectedCommunicationId=m.id;
  if(!m.is_read){
    m.is_read=true;
    commApi({method:'POST',body:JSON.stringify({action:'mark_read',id:m.id})}).then(refreshCountsOnly).catch(()=>{});
  }
  renderList();
  const stay=(m.stay_checkin||m.stay_checkout)?`<span class="badge">Stay ${esc(m.stay_checkin||'?')} → ${esc(m.stay_checkout||'?')}</span>`:'';
  const ref=m.reservation_ref?`<span class="badge">${esc(m.reservation_ref)}</span>`:'';
  messageDetail.innerHTML=`<div class="platform ${platformClass(m.platform)}">${esc(m.platform)}</div><h2>${esc(m.guest_name||'Guest')}</h2><div class="meta">${esc(m.subject||'')} · ${esc(fmt(m.received_at))}</div><div class="reservation-badges" style="margin-top:10px">${stay}${ref}<span class="badge">${esc(m.message_type||'message')}</span></div><div class="message-body">${esc(m.body||m.snippet||'No message body available.')}</div><div class="actions">${m.platform_url?`<a class="btn btn-primary" target="_blank" rel="noopener" href="${esc(m.platform_url)}">Open ${esc(m.platform)} thread ↗</a>`:''}${m.gmail_url?`<a class="btn btn-secondary" target="_blank" rel="noopener" href="${esc(m.gmail_url)}">Open Gmail ↗</a>`:''}<button id="toggleRead" class="btn btn-secondary">Mark ${m.is_read?'unread':'read'}</button><button id="toggleArchive" class="btn btn-secondary">${m.status==='archived'?'Reopen':'Archive'}</button></div>`;
  document.getElementById('toggleRead').onclick=async()=>{await commApi({method:'POST',body:JSON.stringify({action:m.is_read?'mark_unread':'mark_read',id:m.id})});m.is_read=!m.is_read;await loadCommunications(m.id)};
  document.getElementById('toggleArchive').onclick=async()=>{await commApi({method:'POST',body:JSON.stringify({action:m.status==='archived'?'reopen':'archive',id:m.id})});m.status=m.status==='archived'?'open':'archived';await loadCommunications(m.id)};
}

function renderReservationQuick(data){
  const s=data.reservations?.summary||{};
  document.getElementById('quickUpcoming').textContent=s.upcoming||0;
  document.getElementById('quickAction').textContent=s.action_needed||0;
  document.getElementById('quickArrival').textContent=s.next_checkin||'None scheduled';
  const rows=data.reservations?.recent||[];
  document.getElementById('quickReservations').innerHTML=rows.length?rows.map(r=>`<div class="list-row"><div><strong>${esc(r.guest_name)}</strong><span>${esc(r.checkin)} → ${esc(r.checkout)}</span></div><span class="badge">${esc(String(r.status||'').replaceAll('_',' '))}</span></div>`).join(''):'<div class="empty">No active direct-booking stays.</div>';
}

async function loadCommunications(reselectId){
  try{
    const [d,dashboard]=await Promise.all([commApi(),dashboardApi()]);
    communicationsMessages=d.messages||[];
    showApp();
    renderSummary(d.counts||[]);
    renderFilters();
    renderList();
    renderReservationQuick(dashboard);
    document.getElementById('lastChecked').textContent=`Updated ${new Date(dashboard.checkedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}`;
    const target=communicationsMessages.find(x=>x.id===(reselectId||selectedCommunicationId));
    if(target)selectMessage(target);
    else if(!communicationsMessages.length)messageDetail.innerHTML='<div class="empty">No communications have been ingested into production yet.</div>';
  }catch(e){
    if(e.message==='unauthorized')return showLogin();
    showApp();
    document.getElementById('moduleNotice').textContent='Communications could not be loaded. No production data was changed.';
    document.getElementById('moduleNotice').classList.remove('hidden');
  }
}

document.getElementById('communicationSearch').addEventListener('input',renderList);
loginForm.addEventListener('submit',async e=>{
  e.preventDefault();
  loginMsg.textContent='Signing in…';
  const r=await fetch('/api/owner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',passcode:document.getElementById('passcode').value})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){loginMsg.textContent=d.error==='owner_login_not_configured'?'Owner login is not configured for this environment.':'Invalid passcode.';return}
  document.getElementById('passcode').value='';loginMsg.textContent='';loadCommunications();
});

loadCommunications();
