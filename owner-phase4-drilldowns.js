(()=>{
  const root=document.documentElement;
  if(root.dataset.ownerPhase4Loaded)return;
  root.dataset.ownerPhase4Loaded='1';

  const style=document.createElement('style');
  style.textContent=`
    .phase4-click{cursor:pointer;transition:border-color .12s ease,box-shadow .12s ease,transform .12s ease}
    .phase4-click:hover{border-color:#9db0ad!important;box-shadow:0 8px 20px rgba(13,43,49,.07);transform:translateY(-1px)}
    .phase4-click:focus-visible{outline:3px solid rgba(20,52,58,.18);outline-offset:2px}
    .phase4-fin-filter{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:0 0 10px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:#f8fbfa;font-size:.8rem}
    .phase4-fin-hidden{display:none!important}
    .phase4-health-click{cursor:pointer}.phase4-health-click:hover{text-decoration:underline}
  `;
  document.head.appendChild(style);

  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const channel=v=>({'airbnb':'Airbnb','vrbo':'Vrbo','booking.com':'Booking.com','houfy':'Houfy',direct:'CJT Direct',other:'Other / verify'}[v]||v||'Unknown');
  const activeFinancial=f=>f&&f.status!=='cancelled';
  let calendarCache=null,calendarCacheAt=0,calendarPromise=null;

  function bind(el,handler,label){
    if(!el||el.dataset.phase4Bound==='1')return;
    el.dataset.phase4Bound='1';
    el.classList.add('phase4-click');
    el.setAttribute('role','button');
    el.setAttribute('tabindex','0');
    if(label){el.setAttribute('aria-label',label);el.title=label}
    el.addEventListener('click',e=>{if(e.target.closest('button,a,input,select,textarea'))return;handler(e)});
    el.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&!e.target.closest('button,a,input,select,textarea')){e.preventDefault();handler(e)}});
  }

  function nav(tab,target){
    if(window.CJTOwnerNav?.openTab)window.CJTOwnerNav.openTab(tab,target?{target}:{});
    else document.querySelector(`.tab[data-tab="${tab}"]`)?.click();
  }

  function focus(selector){
    const el=document.querySelector(selector);
    if(!el)return;
    el.scrollIntoView({behavior:'smooth',block:'center'});
    if(window.CJTOwnerNav?.focusTarget)window.CJTOwnerNav.focusTarget(selector);
  }

  async function loadCalendar(force=false){
    if(!force&&calendarCache&&Date.now()-calendarCacheAt<7000)return calendarCache;
    if(calendarPromise)return calendarPromise;
    calendarPromise=fetch('/api/owner-calendar',{headers:{'Content-Type':'application/json'},cache:'no-store'}).then(async r=>{
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||'calendar_load_failed');
      calendarCache=d;calendarCacheAt=Date.now();return d;
    }).finally(()=>{calendarPromise=null});
    return calendarPromise;
  }

  function financeYear(){return Number(document.getElementById('finYear')?.textContent)||new Date().getFullYear()}
  function dedupFinancials(data,year=financeYear()){
    const map=new Map();
    for(const f of data?.financials||[]){
      if(!activeFinancial(f))continue;
      const key=String(f.booking_key||`${f.channel}:${f.checkin}:${f.checkout}`);
      const prev=map.get(key);
      if(!prev||String(f.updated_at||'')>String(prev.updated_at||''))map.set(key,f);
    }
    return [...map.values()].filter(f=>String(f.checkin||'').startsWith(`${year}-`)).sort((a,b)=>String(a.checkin||'').localeCompare(String(b.checkin||'')));
  }

  function clearFinanceFilter(){
    document.querySelectorAll('#finTable tbody tr').forEach(r=>r.classList.remove('phase4-fin-hidden'));
    document.getElementById('phase4FinFilter')?.remove();
  }

  async function filterFinanceMonth(month){
    try{
      const data=await loadCalendar();
      const year=financeYear(),records=dedupFinancials(data,year),rows=[...document.querySelectorAll('#finTable tbody tr')];
      rows.forEach(row=>row.classList.toggle('phase4-fin-hidden',Number(String(row.dataset.phase4Checkin||'').slice(5,7))!==month));
      const table=document.getElementById('finTable');
      if(!table)return;
      let banner=document.getElementById('phase4FinFilter');
      if(!banner){banner=document.createElement('div');banner.id='phase4FinFilter';banner.className='phase4-fin-filter';table.prepend(banner)}
      const label=new Date(year,month-1,1).toLocaleDateString('en-US',{month:'long',year:'numeric'});
      const count=records.filter(r=>Number(String(r.checkin||'').slice(5,7))===month).length;
      banner.innerHTML=`<strong>${esc(label)} · ${count} booking${count===1?'':'s'}</strong><button type="button" class="btn ghost small">Show full year</button>`;
      banner.querySelector('button').onclick=clearFinanceFilter;
      focus('#finTable');
    }catch{focus('#finTable')}
  }

  function sortFinanceByPerNight(){
    const body=document.querySelector('#finTable tbody');if(!body)return;
    const rows=[...body.querySelectorAll('tr')];
    rows.sort((a,b)=>{
      const av=Number((a.cells[5]?.textContent||'').replace(/[^0-9.-]/g,''))||0;
      const bv=Number((b.cells[5]?.textContent||'').replace(/[^0-9.-]/g,''))||0;
      return bv-av;
    }).forEach(r=>body.appendChild(r));
    clearFinanceFilter();focus('#finTable');
  }

  async function bindFinanceRows(){
    const rows=[...document.querySelectorAll('#finTable tbody tr')].filter(r=>r.dataset.phase4Bound!=='1');
    if(!rows.length)return;
    try{
      const data=await loadCalendar(),records=dedupFinancials(data);
      [...document.querySelectorAll('#finTable tbody tr')].forEach((row,i)=>{
        const record=records[i];
        if(record){row.dataset.phase4Checkin=record.checkin||'';row.dataset.phase4BookingKey=record.booking_key||'';bind(row,()=>window.CJTOwnerDetail?.open('booking',record),`Open ${channel(record.channel)} booking details`)}
      });
    }catch{}
  }

  function bindFinance(){
    const total=document.getElementById('finTotal')?.closest('.fin-kpi');
    bind(total,()=>{clearFinanceFilter();focus('#finTable')},'Show all bookings for total revenue');
    const month=document.getElementById('finMonth')?.closest('.fin-kpi');
    bind(month,()=>{const y=financeYear(),now=new Date();if(y===now.getFullYear())filterFinanceMonth(now.getMonth()+1);else focus('#finTable')},'Show bookings for current month');
    bind(document.getElementById('finNights')?.closest('.fin-kpi'),()=>nav('bookingCalendar','#bkCalendar'),'Open booked nights in Booking Calendar');
    bind(document.getElementById('finPerNight')?.closest('.fin-kpi'),sortFinanceByPerNight,'Sort bookings by revenue per night');

    [...document.querySelectorAll('#finChart rect')].forEach((bar,i)=>bind(bar,()=>filterFinanceMonth(i+1),`Show bookings for ${new Date(2000,i,1).toLocaleDateString('en-US',{month:'long'})}`));
    bindFinanceRows();
  }

  function bindBookingKpis(){
    bind(document.getElementById('bkTracked')?.closest('.booking-kpi'),()=>focus('#bkFinancialList'),'Show revenue-tracked bookings');
    bind(document.getElementById('bkNights')?.closest('.booking-kpi'),()=>focus('#bkCalendar'),'Show booked nights on calendar');
    bind(document.getElementById('bkGross')?.closest('.booking-kpi'),()=>focus('#bkFinancialList'),'Show bookings behind gross revenue');
    bind(document.getElementById('bkPayout')?.closest('.booking-kpi'),()=>focus('#bkFinancialList'),'Show bookings behind expected payout');
    bind(document.getElementById('bkCollected')?.closest('.booking-kpi'),()=>focus('#bkFinancialList'),'Show bookings behind collected revenue');
  }

  function dateFromCalendarCell(cell,titleId,daySelector){
    const title=document.getElementById(titleId)?.textContent?.trim();
    const day=Number(cell.querySelector(daySelector)?.textContent||0);
    if(!title||!day)return '';
    const parsed=new Date(`${title} 1`);if(Number.isNaN(parsed.getTime()))return '';
    return `${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }

  function installBookingDayCapture(){
    const host=document.getElementById('bkCalendar');
    if(!host||host.dataset.phase4Capture==='1')return;
    host.dataset.phase4Capture='1';
    loadCalendar().catch(()=>{});
    host.addEventListener('click',e=>{
      if(e.target.closest('.market-event-chip,.market-month-chip'))return;
      const cell=e.target.closest('.booking-day');
      if(!cell||!cell.classList.contains('has-money')||!calendarCache)return;
      const date=dateFromCalendarCell(cell,'bkTitle','.booking-day-number');if(!date)return;
      const fin=(calendarCache.financials||[]).find(f=>activeFinancial(f)&&f.checkin<=date&&f.checkout>date);
      if(!fin)return;
      e.preventDefault();e.stopImmediatePropagation();
      window.CJTOwnerDetail?.open('booking',fin);
    },true);
  }

  function bindHealth(){
    document.querySelectorAll('#bookingHealth .health-chip').forEach(chip=>{
      if(chip.dataset.phase4Health==='1')return;chip.dataset.phase4Health='1';chip.classList.add('phase4-health-click');chip.setAttribute('tabindex','0');chip.setAttribute('role','button');
      const open=()=>window.CJTOwnerDetail?.open('stay',{title:chip.textContent.split(':')[0]||'Calendar source',subtitle:chip.textContent,range:'Synchronization status',source:chip.textContent});
      chip.addEventListener('click',open);chip.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}});
    });
  }

  function installPricingBlockedCapture(){
    const host=document.getElementById('pricingCalendar');
    if(!host||host.dataset.phase4Capture==='1')return;
    host.dataset.phase4Capture='1';loadCalendar().catch(()=>{});
    host.addEventListener('click',e=>{
      if(e.target.closest('.market-event-chip,.market-month-chip'))return;
      const cell=e.target.closest('.day.blocked');if(!cell||!calendarCache)return;
      const date=dateFromCalendarCell(cell,'calendarTitle','.daynum');if(!date)return;
      const fin=(calendarCache.financials||[]).find(f=>activeFinancial(f)&&f.checkin<=date&&f.checkout>date);
      const event=(calendarCache.otaEvents||[]).find(x=>x.start<=date&&x.end>date);
      if(!fin&&!event)return;
      e.preventDefault();e.stopImmediatePropagation();
      if(fin)window.CJTOwnerDetail?.open('booking',fin);
      else window.CJTOwnerDetail?.open('stay',{title:event.summary||'Blocked stay',subtitle:`${event.start} → ${event.end}`,range:`${event.start} → ${event.end}`,source:channel(event.source)});
    },true);
  }

  function bindPricingSource(){
    const el=document.getElementById('calendarSources');
    bind(el,()=>nav('bookingCalendar','#bookingHealth'),'Open synchronized calendar health');
  }

  function addQuotePreview(){
    const pricing=document.getElementById('pricing');if(!pricing||document.getElementById('phase4QuotePreview'))return;
    const head=pricing.querySelector('.sectionhead');if(!head)return;
    const btn=document.createElement('button');btn.id='phase4QuotePreview';btn.className='btn ghost small';btn.type='button';btn.textContent='Preview customer booking';
    btn.onclick=()=>{const u=new URL('/',location.href);const share=new URLSearchParams(location.search).get('_vercel_share');if(share)u.searchParams.set('_vercel_share',share);window.open(u.toString(),'_blank','noopener')};
    head.appendChild(btn);
  }

  function bindAll(){bindFinance();bindBookingKpis();installBookingDayCapture();bindHealth();installPricingBlockedCapture();bindPricingSource();addQuotePreview()}
  bindAll();
  new MutationObserver(bindAll).observe(document.body,{childList:true,subtree:true});
  setInterval(()=>loadCalendar(true).catch(()=>{}),30000);
})();
