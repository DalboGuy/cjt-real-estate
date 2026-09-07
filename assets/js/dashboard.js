const loginShell=document.getElementById('loginShell');
const ownerApp=document.getElementById('ownerApp');
const loginForm=document.getElementById('loginForm');
const loginMsg=document.getElementById('loginMsg');

function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function money(v){const n=Number(v||0);return n.toLocaleString(undefined,{style:'currency',currency:'USD',maximumFractionDigits:0})}
function moneyOrDash(v){if(v==null||v==='')return '—';return money(v)}
function countOrDash(v,available=true){if(!available||v==null||v==='')return '—';return String(v)}
function date(v){if(!v)return 'None scheduled';const d=new Date(`${v}T12:00:00`);return d.toLocaleDateString(undefined,{month:'short',day:'numeric'})}
function dateTime(v){if(!v)return '';return new Date(v).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}
function weekday(v){return new Date(`${v}T12:00:00`).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})}
function statusClass(status=''){
  const key=String(status||'');
  return ['confirmed','completed'].includes(key)?'good':['inquiry_hold','hold_verified','contract_sent','contract_signed'].includes(key)?'warn':'';
}
function statusLabel(v=''){return window.CJTOwnerShell?.statusLabel?.(v)||String(v).replaceAll('_',' ')}
function paymentLabel(r){return window.CJTOwnerShell?.paymentLabel?.(r)||(r?.payment?.verified?'Payment received':'Payment pending')}
function bookingHref(id){return `/owner-v1/reservations?booking=${encodeURIComponent(id||'')}&property=sand-sea-manor`}
function showLogin(){ownerApp.classList.add('hidden');loginShell.classList.remove('hidden')}
function showApp(){loginShell.classList.add('hidden');ownerApp.classList.remove('hidden')}

async function fetchDashboard(){
  const r=await fetch('/api/dashboard',{cache:'no-store'});
  if(r.status===401)throw new Error('unauthorized');
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||'dashboard_load_failed');
  return d;
}

function kpiCard({label,value,hint,href,available=true}){
  const display=available?esc(value):'—';
  const note=available?esc(hint||''):esc(hint||'Source unavailable');
  const aria=`${label}, ${available?value:'unavailable'}`;
  if(!href||!available){
    return `<div class="mini kpi-card is-static" aria-disabled="true" aria-label="${esc(aria)}"><b>${display}</b><span>${esc(label)}</span><span>${note}</span></div>`;
  }
  return `<a class="mini kpi-card" href="${esc(href)}" aria-label="${esc(aria)}. Opens the matching records."><b>${display}</b><span>${esc(label)}</span><span>${note}</span></a>`;
}

function renderAttention(items){
  const host=document.getElementById('needsAttention');
  if(!items.length){
    host.innerHTML='<div class="empty">Nothing needs attention right now. Booking holds stay blocked until you release them.</div>';
    return;
  }
  host.innerHTML=items.map(item=>`
    <div class="list-row">
      <div><a href="${esc(item.href)}"><strong>${esc(item.label)}</strong><span>Opens the destination with this filter</span></a></div>
      <span class="badge ${esc(item.tone||'warn')}">Review</span>
    </div>`).join('');
}

function renderWeek(data){
  const week=data.todayNext7||{};
  const dest=data.destinations||{};
  const arrivals=week.arrivals||[];
  const arrivalHref=arrivals.length===1?bookingHref(arrivals[0].id):(dest.calendarAgenda||'/owner-v1/calendar');
  document.getElementById('openAgenda').href=dest.calendarAgenda||'/owner-v1/calendar';
  document.getElementById('todayNext7').innerHTML=`
    ${kpiCard({label:'Arrivals',value:arrivals.length,hint:'Direct check-ins',href:arrivalHref})}
    ${kpiCard({label:'Departures',value:week.departures?.length||0,hint:'Direct check-outs',href:week.departures?.length===1?bookingHref(week.departures[0].id):(dest.calendarAgenda||'/owner-v1/calendar')})}
    ${kpiCard({label:'In house',value:week.staying?.length||0,hint:'Direct stays tonight',href:week.staying?.length===1?bookingHref(week.staying[0].id):(dest.calendarAgenda||'/owner-v1/calendar')})}`;
  const rows=[
    ...(week.arrivals||[]).map(r=>({...r,kind:'Arrival'})),
    ...(week.departures||[]).map(r=>({...r,kind:'Departure'}))
  ];
  document.getElementById('weekList').innerHTML=rows.length?rows.map(r=>`
    <div class="list-row">
      <div><a href="${esc(bookingHref(r.id))}"><strong>${esc(r.kind)} · ${esc(r.guest_name)}</strong><span>${esc(r.checkin)} → ${esc(r.checkout)}</span></a></div>
      <a class="badge ${statusClass(r.status)}" href="${esc(bookingHref(r.id))}">${esc(statusLabel(r.status))}</a>
    </div>`).join(''):'<div class="empty">No direct arrivals or departures in the next 7 days. OTA nights are on Calendar.</div>';
}

function renderKpis(data){
  const dest=data.destinations||{};
  const res=data.reservations?.summary||{};
  const comm=data.communications?.summary||{};
  const tasks=data.tasks||{};
  const cal=data.calendar||{};
  const sourcesOk=cal.available&&!cal.sources?.disconnected;
  document.getElementById('kpiRow').innerHTML=[
    kpiCard({label:'Pending bookings',value:res.pending||0,hint:'Awaiting owner review',href:dest.bookingsPending}),
    kpiCard({label:'Unread messages',value:comm.unread||0,hint:'Guest inbox',href:dest.messagesUnread}),
    kpiCard({label:'Overdue tasks',value:countOrDash(tasks.overdue,tasks.available!==false),hint:tasks.available===false?'Tasks source unavailable':'Open and past due',href:dest.tasksOverdue,available:tasks.available!==false}),
    kpiCard({label:'Calendar conflicts',value:countOrDash(cal.conflicts,cal.available),hint:cal.available?'Overlapping nights':'Calendar snapshot unavailable',href:dest.calendarConflicts,available:cal.available}),
    kpiCard({label:'Sources',value:cal.sources?.disconnected?'Not verified':(cal.sources?.connected??'—'),hint:cal.sources?.note||'Inbound iCal only',href:dest.calendarSources,available:cal.available}),
    kpiCard({label:'Need action',value:res.action_needed||0,hint:'Booking next steps',href:dest.bookingsAction})
  ].join('');
  if(!sourcesOk){
    const sourceCard=document.querySelector('#kpiRow a, #kpiRow .kpi-card');
    void sourceCard;
  }
}

function renderCalendarPreview(data){
  const cal=data.calendar||{};
  const host=document.getElementById('calendarPreview');
  const note=document.getElementById('calendarSourceNote');
  note.textContent=cal.sources?.note||'Calendar preview uses inbound iCal plus Direct holds. Refreshing does not mean OTAs imported the CJT export.';
  if(!cal.available){
    host.innerHTML='<div class="empty" style="grid-column:1/-1">Calendar preview is unavailable. Open Calendar to inspect nights and connections.</div>';
    return;
  }
  host.innerHTML=(cal.preview||[]).map(night=>{
    const cls=night.conflict?'conflict':(night.open?'open-night':'busy');
    const label=night.conflict?'Overlap':(night.open?'Open':(night.channels||[]).slice(0,2).join(', ')||'Busy');
    return `<a class="${cls}" href="/owner-v1/calendar?date=${esc(night.date)}&property=sand-sea-manor"><strong>${esc(weekday(night.date))}</strong><span>${esc(label)}</span></a>`;
  }).join('')||'<div class="empty" style="grid-column:1/-1">No preview nights returned.</div>';
}

function renderFinancials(data){
  const f=data.financials||{};
  const dest=data.destinations||{};
  const mtd=f.mtd||{};
  document.getElementById('openFinancials').href=dest.financialsYtd||dest.financialsPeriod||'/owner-v1/financials';
  document.getElementById('financialSnapshot').innerHTML=`
    ${kpiCard({label:'Gross',value:moneyOrDash(f.mtd_gross),hint:'Guest paid · this month · not profit',href:dest.financialsPeriod})}
    ${kpiCard({label:'Owner Booking Revenue',value:moneyOrDash(f.mtd_expected_payout),hint:'After known channel deductions — not NOI',href:dest.financialsPeriod})}
    ${kpiCard({label:'Booked Nights',value:countOrDash(mtd.nights,mtd.nights!=null),hint:'This month',href:dest.financialsStays,available:mtd.nights!=null})}
    ${kpiCard({label:'ADR',value:moneyOrDash(mtd.revenuePerNight),hint:'Gross ÷ booked nights',href:dest.financialsPeriod,available:mtd.revenuePerNight!=null})}`;
}

function renderTasks(data){
  const t=data.tasks||{};
  const dest=data.destinations||{};
  const available=t.available!==false;
  document.getElementById('taskSnapshot').innerHTML=`
    ${kpiCard({label:'Open',value:countOrDash(t.open,available),hint:available?'Not done or cancelled':'Tasks table unavailable',href:dest.tasksOpen,available})}
    ${kpiCard({label:'Overdue',value:countOrDash(t.overdue,available),hint:available?'Past due and open':'Not verified',href:dest.tasksOverdue,available})}`;
}

function renderActivity(data){
  const bookings=(data.reservations?.recent||[]).map(r=>({
    href:bookingHref(r.id),
    title:`${r.guest_name} · ${r.checkin} → ${r.checkout}`,
    meta:`Booking · ${statusLabel(r.status)}`,
    badge:statusLabel(r.status),
    tone:statusClass(r.status)
  }));
  const messages=(data.communications?.recent||[]).map(m=>({
    href:`/owner-v1/communications?message=${encodeURIComponent(m.id)}&property=sand-sea-manor`,
    title:m.guest_name||m.subject||'Guest message',
    meta:`${m.platform} · ${m.snippet||m.subject||''}`,
    badge:m.is_read?'read':'unread',
    tone:m.is_read?'':'warn'
  }));
  const rows=[...bookings.slice(0,3),...messages.slice(0,3)];
  document.getElementById('recentActivity').innerHTML=rows.length?rows.map(r=>`
    <div class="list-row">
      <div><a href="${esc(r.href)}"><strong>${esc(r.title)}</strong><span>${esc(r.meta)}</span></a></div>
      <span class="badge ${esc(r.tone)}">${esc(r.badge)}</span>
    </div>`).join(''):'<div class="empty">No recent bookings or messages yet.</div>';
}

async function load(){
  try{
    const data=await fetchDashboard();
    showApp();
    const unread=data.communications?.summary?.unread;
    const navCount=document.getElementById('communicationsNavCount');
    if(navCount&&unread!=null)navCount.textContent=unread;
    renderAttention(data.needsAttention||[]);
    renderWeek(data);
    renderKpis(data);
    renderCalendarPreview(data);
    renderFinancials(data);
    renderTasks(data);
    renderActivity(data);
    document.getElementById('lastChecked').textContent=`Updated ${dateTime(data.checkedAt)}`;
  }catch(e){
    if(e.message==='unauthorized')return showLogin();
    showApp();
    document.getElementById('moduleNotice').textContent='Overview data could not be loaded. Existing production workflows remain on the current portal.';
    document.getElementById('moduleNotice').classList.remove('hidden');
  }
}

loginForm.addEventListener('submit',async e=>{
  e.preventDefault();
  const btn=loginForm.querySelector('button[type="submit"]');
  if(btn?.disabled)return;
  if(btn)btn.disabled=true;
  loginMsg.textContent='Signing in…';
  const passcode=document.getElementById('passcode').value;
  try{
    const r=await fetch('/api/owner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',passcode})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||'invalid_passcode');
    document.getElementById('passcode').value='';
    loginMsg.textContent='';
    if(window.CJTOwnerShell?.afterLogin?.())return;
    await load();
  }catch(err){
    loginMsg.textContent=err.message==='owner_login_not_configured'?'Owner login is not configured for this environment.':'Invalid passcode.';
  }finally{
    if(btn)btn.disabled=false;
  }
});

load();
