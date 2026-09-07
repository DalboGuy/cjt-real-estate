const loginShell=document.getElementById('loginShell');
const ownerApp=document.getElementById('ownerApp');
const loginForm=document.getElementById('loginForm');
const loginMsg=document.getElementById('loginMsg');

function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function money(v){const n=Number(v||0);return n.toLocaleString(undefined,{style:'currency',currency:'USD',maximumFractionDigits:0})}
function moneyOrDash(v){if(v==null||v==='')return '—';return money(v)}
function date(v){if(!v)return 'None scheduled';const d=new Date(`${v}T12:00:00`);return d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}
function dateTime(v){if(!v)return '';return new Date(v).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}
function statusClass(status=''){return ['confirmed','contract_signed'].includes(status)?'good':['inquiry_hold','hold_verified','contract_sent'].includes(status)?'warn':''}
function statusLabel(v=''){return String(v).replaceAll('_',' ')}

async function fetchDashboard(){
  const r=await fetch('/api/dashboard',{cache:'no-store'});
  if(r.status===401)throw new Error('unauthorized');
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||'dashboard_load_failed');
  return d;
}

function showLogin(){ownerApp.classList.add('hidden');loginShell.classList.remove('hidden')}
function showApp(){loginShell.classList.add('hidden');ownerApp.classList.remove('hidden')}

function renderCommunications(data){
  const s=data.summary||{};
  document.getElementById('commUnread').textContent=s.unread||0;
  document.getElementById('communicationsNavCount').textContent=s.unread||0;
  document.getElementById('commBreakdown').innerHTML=`
    <div class="mini"><b>${s.airbnb_unread||0}</b><span>Airbnb unread</span></div>
    <div class="mini"><b>${s.vrbo_unread||0}</b><span>Vrbo unread</span></div>
    <div class="mini"><b>${(s.booking_unread||0)+(s.houfy_unread||0)}</b><span>Other unread</span></div>`;
  const rows=data.recent||[];
  document.getElementById('commRecent').innerHTML=rows.length?rows.map(m=>`
    <div class="list-row">
      <div><strong>${esc(m.guest_name||m.subject||'Guest message')}</strong><span>${esc(m.platform)} · ${esc(m.snippet||m.subject||'')}</span></div>
      <span class="badge ${m.is_read?'':'warn'}">${m.is_read?'read':'unread'}</span>
    </div>`).join(''):'<div class="empty">No OTA messages have been ingested into production yet.</div>';
}

function renderReservations(data){
  const s=data.summary||{};
  document.getElementById('resUpcoming').textContent=s.upcoming||0;
  document.getElementById('resAction').textContent=s.action_needed||0;
  document.getElementById('nextArrival').textContent=date(s.next_checkin);
  const rows=data.recent||[];
  document.getElementById('resRecent').innerHTML=rows.length?rows.map(r=>`
    <div class="list-row">
      <div><strong>${esc(r.guest_name)} · ${esc(r.checkin)} → ${esc(r.checkout)}</strong><span>${esc(r.id)} · ${esc(r.guests)} guests</span></div>
      <span class="badge ${statusClass(r.status)}">${esc(statusLabel(r.status))}</span>
    </div>`).join(''):'<div class="empty">No active direct-booking stays are currently scheduled.</div>';
}

function renderFinancials(f){
  const month=f.mtdMonthLabel?` · ${f.mtdMonthLabel}`:'';
  document.getElementById('mtdGross').textContent=moneyOrDash(f.mtd_gross);
  document.getElementById('mtdPayout').textContent=moneyOrDash(f.mtd_expected_payout);
  const grossLabel=document.getElementById('mtdGrossLabel');
  const payoutLabel=document.getElementById('mtdPayoutLabel');
  if(grossLabel)grossLabel.textContent=`MTD quoted total${month}`;
  if(payoutLabel)payoutLabel.textContent=`MTD expected payout${month}`;
  document.getElementById('financialRecords').textContent=f.records||0;
  document.getElementById('stripeVerified').textContent=f.stripe_verified||0;
  document.getElementById('stripePending').textContent=f.stripe_pending||0;
}
function renderPricing(p,d){
  document.getElementById('pricingSeasons').textContent=d?.seasons?.length||'—';
  document.getElementById('pricingThrough').textContent=d?.pricingThrough?date(d.pricingThrough):'—';
}
function renderTasks(t){
  document.getElementById('openTasks').textContent=t.open||0;
  document.getElementById('highTasks').textContent=t.high_priority||0;
}

async function load(){
  try{
    const data=await fetchDashboard();
    showApp();
    renderCommunications(data.communications||{});
    renderReservations(data.reservations||{});
    renderFinancials(data.financials||{});
    let publishedPricing={};
    try{const r=await fetch('/api/pricing',{cache:'no-store'});if(r.ok)publishedPricing=await r.json()}catch(e){}
    renderPricing(data.pricing||{},publishedPricing);
    renderTasks(data.tasks||{});
    document.getElementById('lastChecked').textContent=`Updated ${dateTime(data.checkedAt)}`;
  }catch(e){
    if(e.message==='unauthorized')return showLogin();
    showApp();
    document.getElementById('moduleNotice').textContent='Dashboard data could not be loaded. Existing production workflows remain available through the compatibility links.';
    document.getElementById('moduleNotice').classList.remove('hidden');
  }
}

loginForm.addEventListener('submit',async e=>{
  e.preventDefault();
  loginMsg.textContent='Signing in…';
  const passcode=document.getElementById('passcode').value;
  try{
    const r=await fetch('/api/owner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',passcode})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||'invalid_passcode');
    document.getElementById('passcode').value='';
    loginMsg.textContent='';
    await load();
  }catch(e){loginMsg.textContent=e.message==='owner_login_not_configured'?'Owner login is not configured for this environment.':'Invalid passcode.'}
});

load();
