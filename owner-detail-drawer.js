(()=>{
  const root=document.documentElement;
  if(root.dataset.ownerDetailDrawerLoaded)return;
  root.dataset.ownerDetailDrawerLoaded='1';

  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(v||0));
  const fmt=v=>{
    if(!v)return '—';
    const raw=String(v);
    const d=/^\d{4}-\d{2}-\d{2}$/.test(raw)?new Date(`${raw}T12:00:00`):new Date(raw);
    return Number.isNaN(d.getTime())?raw:d.toLocaleString(undefined,/^\d{4}-\d{2}-\d{2}$/.test(raw)?{month:'short',day:'numeric',year:'numeric'}:{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
  };
  const nights=(a,b)=>Math.max(0,Math.round((new Date(`${b}T00:00:00Z`)-new Date(`${a}T00:00:00Z`))/86400000));
  const channel=v=>({'airbnb':'Airbnb','vrbo':'Vrbo','booking.com':'Booking.com','houfy':'Houfy','direct':'CJT Direct','other':'Other / verify'}[v]||v||'Unknown');
  const titleCase=v=>String(v||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());

  const style=document.createElement('style');
  style.textContent=`
    body.owner-drawer-open{overflow:hidden}
    .owner-detail-backdrop{position:fixed;inset:0;background:rgba(7,27,31,.34);opacity:0;pointer-events:none;transition:opacity .18s ease;z-index:110}
    .owner-detail-backdrop.open{opacity:1;pointer-events:auto}
    .owner-detail-drawer{position:fixed;top:0;right:0;width:min(520px,94vw);height:100vh;background:#fff;border-left:1px solid var(--line);box-shadow:-24px 0 70px rgba(7,27,31,.18);transform:translateX(104%);transition:transform .22s ease;z-index:111;display:flex;flex-direction:column}
    .owner-detail-drawer.open{transform:translateX(0)}
    .owner-detail-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;padding:22px 22px 18px;border-bottom:1px solid var(--line)}
    .owner-detail-eyebrow{font-size:.68rem;text-transform:uppercase;letter-spacing:.11em;font-weight:900;color:var(--muted);margin-bottom:6px}
    .owner-detail-title{font-family:Georgia,serif;font-weight:500;font-size:1.8rem;line-height:1.08;margin:0;color:var(--deep)}
    .owner-detail-subtitle{font-size:.82rem;color:var(--muted);margin-top:7px;line-height:1.45}
    .owner-detail-close{width:38px;height:38px;border:0;border-radius:999px;background:var(--soft);font-size:1.25rem;cursor:pointer;flex:0 0 auto}
    .owner-detail-body{padding:20px 22px 28px;overflow:auto;display:grid;gap:16px}
    .owner-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .owner-detail-field{border:1px solid var(--line);border-radius:13px;padding:11px 12px;background:#fff;min-width:0}
    .owner-detail-field.full{grid-column:1/-1}
    .owner-detail-field span{display:block;font-size:.67rem;text-transform:uppercase;letter-spacing:.055em;font-weight:850;color:var(--muted);margin-bottom:5px}
    .owner-detail-field strong,.owner-detail-field div{overflow-wrap:anywhere}
    .owner-detail-section{border-top:1px solid var(--line);padding-top:15px}
    .owner-detail-section h4{margin:0 0 9px;font-size:.8rem;text-transform:uppercase;letter-spacing:.055em;color:var(--muted)}
    .owner-detail-actions{display:flex;gap:8px;flex-wrap:wrap}
    .owner-detail-pill{display:inline-flex;align-items:center;padding:5px 8px;border-radius:999px;background:var(--soft);font-size:.72rem;font-weight:850;margin:0 5px 5px 0}
    .owner-detail-pill.good{background:var(--good)}.owner-detail-pill.warn{background:var(--warn)}
    .owner-detail-clickable{cursor:pointer}
    .owner-detail-clickable:hover{border-color:#9db0ad!important;box-shadow:0 8px 20px rgba(13,43,49,.06)}
    @media(max-width:560px){.owner-detail-drawer{width:100vw}.owner-detail-grid{grid-template-columns:1fr}.owner-detail-field.full{grid-column:auto}.owner-detail-head{padding:18px}.owner-detail-body{padding:16px 18px 24px}}
  `;
  document.head.appendChild(style);

  const backdrop=document.createElement('div');
  backdrop.className='owner-detail-backdrop';
  backdrop.setAttribute('aria-hidden','true');
  const drawer=document.createElement('aside');
  drawer.className='owner-detail-drawer';
  drawer.setAttribute('role','dialog');
  drawer.setAttribute('aria-modal','true');
  drawer.setAttribute('aria-hidden','true');
  drawer.innerHTML=`<div class="owner-detail-head"><div><div id="ownerDetailEyebrow" class="owner-detail-eyebrow">Details</div><h3 id="ownerDetailTitle" class="owner-detail-title">Details</h3><div id="ownerDetailSubtitle" class="owner-detail-subtitle"></div></div><button id="ownerDetailClose" class="owner-detail-close" type="button" aria-label="Close details">×</button></div><div id="ownerDetailBody" class="owner-detail-body"></div>`;
  document.body.append(backdrop,drawer);

  const body=drawer.querySelector('#ownerDetailBody');
  const eyebrow=drawer.querySelector('#ownerDetailEyebrow');
  const heading=drawer.querySelector('#ownerDetailTitle');
  const subtitle=drawer.querySelector('#ownerDetailSubtitle');
  const closeButton=drawer.querySelector('#ownerDetailClose');
  let previousFocus=null;

  function ownerState(){try{return state||{}}catch{return {}}}
  function nav(tab,target){
    if(window.CJTOwnerNav?.openTab)window.CJTOwnerNav.openTab(tab,target?{target}:{});
    else document.querySelector(`.tab[data-tab="${tab}"]`)?.click();
    close();
  }
  function field(label,value,full=false){return `<div class="owner-detail-field${full?' full':''}"><span>${esc(label)}</span><strong>${esc(value??'—')}</strong></div>`}
  function action(label,tab,target){return `<button class="btn ghost small" type="button" data-detail-tab="${esc(tab)}"${target?` data-detail-target="${esc(target)}"`:''}>${esc(label)}</button>`}
  function wireActions(){
    body.querySelectorAll('[data-detail-tab]').forEach(b=>b.addEventListener('click',()=>nav(b.dataset.detailTab,b.dataset.detailTarget||'')));
    body.querySelectorAll('[data-detail-reservation]').forEach(b=>b.addEventListener('click',()=>{
      const id=b.dataset.detailReservation;
      const r=(ownerState().reservations||[]).find(x=>String(x.id)===String(id));
      if(r)open('reservation',r,{source:'owner'});else nav('reservations');
    }));
  }

  function renderReservation(r,opts={}){
    const live=opts.live===true||r.source==='live';
    eyebrow.textContent=live?'Live direct booking':'Reservation';
    heading.textContent=r.guest_name||r.id||'Reservation details';
    subtitle.textContent=`${r.checkin||'—'} → ${r.checkout||'—'}${r.id?` · ${r.id}`:''}`;
    const count=r.checkin&&r.checkout?nights(r.checkin,r.checkout):null;
    body.innerHTML=`
      <div class="owner-detail-grid">
        ${field('Check-in',fmt(r.checkin))}${field('Checkout',fmt(r.checkout))}
        ${field('Nights',count??'—')}${field('Status',titleCase(r.status|| (live?'live block':'active')))}
        ${r.guest_name?field('Guest',r.guest_name):''}${r.guests!=null?field('Guests',r.guests):''}
        ${r.guest_email?field('Email',r.guest_email,true):''}${r.guest_phone?field('Phone',r.guest_phone,true):''}
      </div>
      <div class="owner-detail-section"><h4>Workflow</h4>
        ${live?'<span class="owner-detail-pill good">Published to live direct-booking feed</span>':`${r.contract_sent_at?'<span class="owner-detail-pill good">Contract sent</span>':'<span class="owner-detail-pill warn">Contract pending</span>'}${r.contract_signed_at?'<span class="owner-detail-pill good">Signed</span>':'<span class="owner-detail-pill warn">Signature pending</span>'}${r.deposit_received_at?'<span class="owner-detail-pill good">Deposit received</span>':'<span class="owner-detail-pill warn">Deposit pending</span>'}`}
      </div>
      ${r.notes?`<div class="owner-detail-section"><h4>Notes</h4><div class="meta">${esc(r.notes)}</div></div>`:''}
      <div class="owner-detail-section"><h4>Actions</h4><div class="owner-detail-actions">${action('Open Reservations','reservations','#reservationList')}${action('Open Booking Calendar','bookingCalendar','#bkCalendar')}</div></div>`;
  }

  function renderTask(t){
    eyebrow.textContent='Task';heading.textContent=t.title||'Task details';subtitle.textContent=`${titleCase(t.status||'open')} · ${t.assigned_user_name||'Unassigned'}`;
    body.innerHTML=`
      <div class="owner-detail-grid">
        ${field('Status',titleCase(t.status||'open'))}${field('Priority',titleCase(t.priority||'normal'))}
        ${field('Category',titleCase(t.category||'general'))}${field('Assigned to',t.assigned_user_name||'Unassigned')}
        ${field('Due',fmt(t.due_at),true)}${field('Repeat',titleCase(t.recurrence||'none'))}
        ${t.reservation_id?field('Reservation',t.reservation_id,true):''}
      </div>
      ${t.description?`<div class="owner-detail-section"><h4>Notes</h4><div class="meta">${esc(t.description)}</div></div>`:''}
      <div class="owner-detail-section"><h4>Actions</h4><div class="owner-detail-actions">${action('Open Task Board','tasks')}${t.reservation_id?`<button class="btn ghost small" type="button" data-detail-reservation="${esc(t.reservation_id)}">Open Reservation</button>`:''}</div></div>`;
  }

  function renderBooking(f){
    eyebrow.textContent='Booking financial record';heading.textContent=f.external_reference||`${channel(f.channel)} booking`;subtitle.textContent=`${f.checkin||'—'} → ${f.checkout||'—'} · ${channel(f.channel)}`;
    const count=f.checkin&&f.checkout?nights(f.checkin,f.checkout):0;
    body.innerHTML=`
      <div class="owner-detail-grid">
        ${field('Channel',channel(f.channel))}${field('Status',titleCase(f.status||'confirmed'))}
        ${field('Check-in',fmt(f.checkin))}${field('Checkout',fmt(f.checkout))}
        ${field('Nights',count)}${field('Revenue / night',count?money(Number(f.gross_revenue||0)/count):money(0))}
        ${field('Gross revenue',money(f.gross_revenue))}${field('Expected payout',money(f.expected_payout))}
        ${field('Collected',money(f.collected_amount))}${field('Taxes',money(f.taxes))}
        ${field('Cleaning fee',money(f.cleaning_fee))}${field('Reference',f.external_reference||'—')}
      </div>
      ${f.notes?`<div class="owner-detail-section"><h4>Notes</h4><div class="meta">${esc(f.notes)}</div></div>`:''}
      <div class="owner-detail-section"><h4>Actions</h4><div class="owner-detail-actions">${action('Open Booking Calendar','bookingCalendar','#bkFinancialList')}${action('Open Finance','finance','#finTable')}</div></div>`;
  }

  function renderTeam(u){
    eyebrow.textContent='Team member';heading.textContent=u.name||'Team member';subtitle.textContent=`${titleCase(u.role||'owner')} · ${u.active===false?'Inactive':'Active'}`;
    body.innerHTML=`
      <div class="owner-detail-grid">
        ${field('Name',u.name||'—')}${field('Role',titleCase(u.role||'owner'))}
        ${field('Email',u.email||'—',true)}${field('Account',u.active===false?'Inactive':'Active')}${field('Password',u.must_change_password?'Temporary password / reset required':'Private password set')}
      </div>
      <div class="owner-detail-section"><h4>Actions</h4><div class="owner-detail-actions">${action('Open Team','team','#teamList')}</div></div>`;
  }

  function renderStay(s){
    eyebrow.textContent='Stay';heading.textContent=s.title||'Upcoming stay';subtitle.textContent=s.subtitle||'';
    body.innerHTML=`<div class="owner-detail-grid">${field('Stay',s.range||'—',true)}${field('Source',s.source||'Verify channel',true)}</div><div class="owner-detail-section"><h4>Actions</h4><div class="owner-detail-actions">${action('Open Booking Calendar','bookingCalendar','#bkCalendar')}</div></div>`;
  }

  function open(type,record,opts={}){
    if(!record)return;
    previousFocus=document.activeElement;
    if(type==='reservation')renderReservation(record,opts);
    else if(type==='task')renderTask(record);
    else if(type==='booking')renderBooking(record);
    else if(type==='team')renderTeam(record);
    else renderStay(record);
    wireActions();
    backdrop.classList.add('open');drawer.classList.add('open');drawer.setAttribute('aria-hidden','false');document.body.classList.add('owner-drawer-open');
    setTimeout(()=>closeButton.focus(),40);
  }
  function close(){
    backdrop.classList.remove('open');drawer.classList.remove('open');drawer.setAttribute('aria-hidden','true');document.body.classList.remove('owner-drawer-open');
    if(previousFocus&&document.contains(previousFocus))setTimeout(()=>previousFocus.focus(),40);
  }
  closeButton.addEventListener('click',close);backdrop.addEventListener('click',close);document.addEventListener('keydown',e=>{if(e.key==='Escape'&&drawer.classList.contains('open'))close()});
  window.CJTOwnerDetail={open,close};

  function bindCard(el,handler,label){
    if(!el||el.dataset.ownerDetailBound==='1')return;
    el.dataset.ownerDetailBound='1';el.classList.add('owner-detail-clickable');el.setAttribute('tabindex','0');el.setAttribute('role','button');if(label)el.setAttribute('aria-label',label);
    el.addEventListener('click',e=>{if(e.target.closest('button,a,input,select,textarea'))return;handler()});
    el.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&!e.target.closest('button,a,input,select,textarea')){e.preventDefault();handler()}});
  }

  function bindTasks(){
    const tasks=ownerState().tasks||[];
    for(const status of ['open','in_progress','waiting','done']){
      const records=tasks.filter(t=>t.status===status),cards=[...document.querySelectorAll(`#tasks-${status} .taskcard`)];
      cards.forEach((card,i)=>records[i]&&bindCard(card,()=>open('task',records[i]),`Open task details: ${records[i].title||'task'}`));
    }
  }
  function bindTeam(){
    const users=ownerState().users||[],cards=[...document.querySelectorAll('#teamList .teamcard')];
    cards.forEach((card,i)=>users[i]&&bindCard(card,()=>open('team',users[i]),`Open team member: ${users[i].name||'member'}`));
  }
  function bindLiveReservations(){
    const blocks=Array.isArray(window.CJTLiveReservations)?window.CJTLiveReservations:[],cards=[...document.querySelectorAll('#reservationList .live-res-card')];
    cards.forEach((card,i)=>{
      const id=card.querySelector('.live-res-id')?.textContent?.trim();
      const record=blocks.find(x=>String(x.id)===String(id))||blocks[i];
      if(record)bindCard(card,()=>open('reservation',record,{live:true}),`Open live reservation ${record.id||''}`);
    });
  }
  function bindDashboardStays(){
    document.querySelectorAll('#dashboard .ops-stay').forEach(card=>bindCard(card,()=>{
      const strong=card.querySelector('strong')?.textContent?.trim()||'Upcoming stay';
      const meta=card.querySelector('.meta')?.textContent?.trim()||'';
      const source=card.querySelector('.ops-source')?.textContent?.trim()||strong;
      open('stay',{title:strong,subtitle:meta,range:meta.split(' · ')[0]||meta,source});
    },'Open stay details'));
  }

  let calendarCache=null,calendarCacheAt=0,calendarPromise=null;
  async function calendarData(){
    if(calendarCache&&Date.now()-calendarCacheAt<5000)return calendarCache;
    if(calendarPromise)return calendarPromise;
    calendarPromise=fetch('/api/owner-calendar',{headers:{'Content-Type':'application/json'}}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'calendar_load_failed');calendarCache=d;calendarCacheAt=Date.now();return d}).finally(()=>{calendarPromise=null});
    return calendarPromise;
  }
  let bookingBindTimer=null;
  function bindBookings(){
    const cards=[...document.querySelectorAll('#bkFinancialList .booking-row')].filter(x=>!x.dataset.ownerDetailBound);
    if(!cards.length)return;
    clearTimeout(bookingBindTimer);bookingBindTimer=setTimeout(async()=>{
      try{
        const data=await calendarData();
        const rows=(data.financials||[]).slice().sort((a,b)=>String(a.checkin||'').localeCompare(String(b.checkin||'')));
        [...document.querySelectorAll('#bkFinancialList .booking-row')].forEach((card,i)=>rows[i]&&bindCard(card,()=>open('booking',rows[i]),`Open ${channel(rows[i].channel)} booking details`));
      }catch{}
    },80);
  }

  function bindAll(){bindTasks();bindTeam();bindLiveReservations();bindDashboardStays();bindBookings()}
  bindAll();
  new MutationObserver(bindAll).observe(document.body,{childList:true,subtree:true});
  window.addEventListener('cjt:live-reservations-updated',bindLiveReservations);
})();
