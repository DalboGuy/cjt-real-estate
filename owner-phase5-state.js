(()=>{
  const root=document.documentElement;
  if(root.dataset.ownerPhase5Loaded)return;
  root.dataset.ownerPhase5Loaded='1';

  const KEY='cjt-owner-portal-state-v1';
  const CHANNELS={airbnb:'airbnb',vrbo:'vrbo','booking.com':'booking.com',booking:'booking.com',houfy:'houfy','cjt direct':'direct',direct:'direct',other:'other'};
  const style=document.createElement('style');
  style.textContent=`
    .phase5-backbar{display:flex;align-items:center;gap:8px;margin:-8px 0 12px}.phase5-backbar.hidden{display:none!important}
    .phase5-context{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:0 0 12px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:#f8fbfa;font-size:.8rem}
    .phase5-hidden{display:none!important}.phase5-dim{opacity:.3}.phase5-highlight{box-shadow:inset 0 0 0 3px rgba(49,93,100,.28)!important}
    .phase5-channel-click,.phase5-month-click{cursor:pointer}.phase5-channel-click:hover,.phase5-month-click:hover{text-decoration:underline}
  `;
  document.head.appendChild(style);

  const parse=()=>{try{return JSON.parse(sessionStorage.getItem(KEY)||'{}')||{}}catch{return {}}};
  let saved=parse();
  saved.stack=Array.isArray(saved.stack)?saved.stack:[];
  saved.filters=saved.filters&&typeof saved.filters==='object'?saved.filters:{};
  let restoring=false,restoredOnce=false;

  function persist(){try{sessionStorage.setItem(KEY,JSON.stringify(saved))}catch{}}
  function activeTab(){return document.querySelector('.tab.active')?.dataset.tab||''}
  function snapshot(tabOverride){
    return {
      tab:tabOverride||activeTab(),
      scrollY:Math.max(0,window.scrollY||0),
      filters:{...saved.filters}
    };
  }

  const portal=document.getElementById('portal');
  const tabs=document.querySelector('.tabs');
  const backbar=document.createElement('div');
  backbar.className='phase5-backbar hidden';
  backbar.innerHTML='<button id="phase5Back" class="btn ghost small" type="button">← Back</button><span id="phase5BackLabel" class="meta"></span>';
  if(tabs)tabs.insertAdjacentElement('afterend',backbar);
  const backButton=backbar.querySelector('#phase5Back');
  const backLabel=backbar.querySelector('#phase5BackLabel');

  function updateBack(){
    const has=saved.stack.length>0;
    backbar.classList.toggle('hidden',!has);
    if(has){const top=saved.stack[saved.stack.length-1];backLabel.textContent=`Return to ${tabLabel(top.tab)}`}
  }
  function tabLabel(id){return ({dashboard:'Dashboard',finance:'Finance',reservations:'Reservations',tasks:'Task Board',bookingCalendar:'Booking Calendar',pricing:'Pricing Calendar',team:'Team'}[id]||id||'previous view')}

  function clearContext(sectionId){document.querySelector(`#${sectionId} > .phase5-context`)?.remove()}
  function context(sectionId,text,onClear){
    const section=document.getElementById(sectionId);if(!section)return;
    clearContext(sectionId);
    const box=document.createElement('div');box.className='phase5-context';box.innerHTML=`<strong>${escapeHtml(text)}</strong><button class="btn ghost small" type="button">Clear filter</button>`;
    section.prepend(box);box.querySelector('button').onclick=()=>{onClear?.();box.remove()};
  }
  function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}

  function clearTaskFilter(update=true){
    document.querySelectorAll('#tasks .boardcol').forEach(x=>x.classList.remove('phase5-hidden'));
    clearContext('tasks');if(update){delete saved.filters.tasks;persist()}
  }
  function applyTaskFilter(filter,update=true){
    clearTaskFilter(false);if(filter!=='open')return;
    document.querySelector('#tasks-done')?.closest('.boardcol')?.classList.add('phase5-hidden');
    context('tasks','Showing open tasks only',()=>clearTaskFilter(true));
    if(update){saved.filters.tasks='open';persist()}
  }

  function clearFinanceChannel(update=true){
    document.querySelectorAll('#finTable tbody tr').forEach(r=>r.classList.remove('phase5-hidden'));
    const box=document.getElementById('phase5FinanceContext');box?.remove();
    if(update){delete saved.filters.financeChannel;persist()}
  }
  function applyFinanceChannel(key,update=true){
    clearFinanceChannel(false);if(!key)return;
    const label=({airbnb:'Airbnb',vrbo:'Vrbo','booking.com':'Booking.com',houfy:'Houfy',direct:'CJT Direct',other:'Other'}[key]||key);
    const rows=[...document.querySelectorAll('#finTable tbody tr')];
    rows.forEach(row=>{
      const source=(row.cells?.[1]?.textContent||'').trim().toLowerCase();
      const wanted=label.toLowerCase();
      row.classList.toggle('phase5-hidden',source!==wanted);
    });
    const table=document.getElementById('finTable');
    if(table){
      const box=document.createElement('div');box.id='phase5FinanceContext';box.className='phase5-context';box.innerHTML=`<strong>${escapeHtml(label)} bookings</strong><button class="btn ghost small" type="button">Show all channels</button>`;
      table.prepend(box);box.querySelector('button').onclick=()=>clearFinanceChannel(true);
    }
    if(update){saved.filters.financeChannel=key;persist()}
  }

  function clearBookingRange(update=true){
    document.querySelectorAll('#bkCalendar .booking-day').forEach(x=>x.classList.remove('phase5-dim','phase5-highlight'));
    const box=document.getElementById('phase5BookingContext');box?.remove();
    if(update){delete saved.filters.bookingRange;persist()}
  }
  function visibleBookingDate(cell){
    const title=document.getElementById('bkTitle')?.textContent?.trim(),day=Number(cell.querySelector('.booking-day-number')?.textContent||0);
    if(!title||!day)return '';
    const d=new Date(`${title} 1`);if(Number.isNaN(d.getTime()))return '';
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }
  function localISO(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
  function ensureCurrentBookingMonth(attempt=0){
    const title=document.getElementById('bkTitle')?.textContent?.trim();if(!title&&attempt<10){setTimeout(()=>ensureCurrentBookingMonth(attempt+1),120);return}
    const shown=new Date(`${title} 1`),now=new Date();if(Number.isNaN(shown.getTime()))return;
    const diff=(now.getFullYear()-shown.getFullYear())*12+(now.getMonth()-shown.getMonth());
    if(diff===0)return;
    const btn=document.getElementById(diff>0?'bkNext':'bkPrev');
    if(btn&&attempt<24){btn.click();setTimeout(()=>ensureCurrentBookingMonth(attempt+1),50)}
  }
  function applyBookingRange(range,update=true){
    clearBookingRange(false);if(range!=='next14')return;
    ensureCurrentBookingMonth();
    setTimeout(()=>{
      const start=new Date();start.setHours(0,0,0,0);const end=new Date(start);end.setDate(end.getDate()+14);const a=localISO(start),b=localISO(end);
      document.querySelectorAll('#bkCalendar .booking-day').forEach(cell=>{const date=visibleBookingDate(cell);if(!date)return;cell.classList.add(date>=a&&date<b?'phase5-highlight':'phase5-dim')});
      const section=document.getElementById('bookingCalendar');if(section&&!document.getElementById('phase5BookingContext')){const box=document.createElement('div');box.id='phase5BookingContext';box.className='phase5-context';box.innerHTML='<strong>Upcoming arrivals · next 14 days</strong><button class="btn ghost small" type="button">Show full calendar</button>';section.prepend(box);box.querySelector('button').onclick=()=>clearBookingRange(true)}
    },180);
    if(update){saved.filters.bookingRange='next14';persist()}
  }

  async function applyExpectedPayout(update=true){
    try{
      const r=await fetch('/api/owner-calendar',{headers:{'Content-Type':'application/json'},cache:'no-store'}),data=await r.json();
      if(!r.ok)return;
      const records=(data.financials||[]).filter(f=>f.status!=='cancelled').sort((a,b)=>String(a.checkin||'').localeCompare(String(b.checkin||'')));
      const rows=[...document.querySelectorAll('#bkFinancialList .booking-row')];
      rows.forEach((row,i)=>row.classList.toggle('phase5-hidden',Number(records[i]?.expected_payout||0)<=0));
      const section=document.getElementById('bookingCalendar');if(section&&!document.getElementById('phase5PayoutContext')){const box=document.createElement('div');box.id='phase5PayoutContext';box.className='phase5-context';box.innerHTML='<strong>Showing bookings with an expected payout</strong><button class="btn ghost small" type="button">Show all bookings</button>';section.prepend(box);box.querySelector('button').onclick=clearExpectedPayout}
      if(update){saved.filters.bookingIntent='expected-payout';persist()}
    }catch{}
  }
  function clearExpectedPayout(){document.querySelectorAll('#bkFinancialList .booking-row').forEach(x=>x.classList.remove('phase5-hidden'));document.getElementById('phase5PayoutContext')?.remove();delete saved.filters.bookingIntent;persist()}

  function applyFinanceMonth(month,update=true){
    const bars=[...document.querySelectorAll('#finChart rect')];if(!month||!bars[month-1])return;
    bars[month-1].dispatchEvent(new MouseEvent('click',{bubbles:true}));
    if(update){saved.filters.financeMonth=month;persist()}
  }

  function clearAllDestinationFilters(){
    clearTaskFilter(false);clearFinanceChannel(false);clearBookingRange(false);clearExpectedPayout();
  }

  function applySavedFilters(filters=saved.filters){
    setTimeout(()=>{
      if(filters.tasks==='open')applyTaskFilter('open',false);
      if(filters.financeMonth)applyFinanceMonth(Number(filters.financeMonth),false);
      if(filters.financeChannel)applyFinanceChannel(filters.financeChannel,false);
      if(filters.bookingRange==='next14')applyBookingRange('next14',false);
      if(filters.bookingIntent==='expected-payout')applyExpectedPayout(false);
    },220);
  }

  function restoreSnapshot(snap){
    if(!snap?.tab)return;
    restoring=true;
    const button=document.querySelector(`.tab[data-tab="${snap.tab}"]`);button?.click();
    saved.filters={...(snap.filters||{})};saved.lastTab=snap.tab;persist();
    applySavedFilters(saved.filters);
    setTimeout(()=>{window.scrollTo({top:Number(snap.scrollY||0),behavior:'smooth'});restoring=false},260);
  }

  backButton?.addEventListener('click',()=>{
    const snap=saved.stack.pop();persist();updateBack();if(snap)restoreSnapshot(snap);
  });

  window.addEventListener('cjt:owner-nav',e=>{
    const d=e.detail||{};if(restoring)return;
    if(d.from&&d.from!==d.tab){saved.stack.push(snapshot(d.from));if(saved.stack.length>12)saved.stack.shift()}
    saved.lastTab=d.tab||activeTab();
    if(d.tab==='tasks'&&d.filter==='open')applyTaskFilter('open');
    if(d.tab==='bookingCalendar'&&d.range==='next14')applyBookingRange('next14');
    if(d.tab==='bookingCalendar'&&d.intent==='expected-payout')setTimeout(()=>applyExpectedPayout(),180);
    if(d.tab==='bookingCalendar'&&d.intent==='unmatched-revenue')setTimeout(()=>document.getElementById('bkUnmatched')?.scrollIntoView({behavior:'smooth',block:'center'}),160);
    if(d.tab==='finance'&&d.filter==='channel'&&d.value)setTimeout(()=>applyFinanceChannel(d.value),180);
    if(d.tab==='finance'&&d.filter==='month'&&d.value)setTimeout(()=>applyFinanceMonth(Number(d.value)),180);
    persist();updateBack();
  });

  document.addEventListener('click',e=>{
    const tab=e.target.closest('.tab[data-tab]');
    if(tab&&!restoring){saved.lastTab=tab.dataset.tab;persist()}
    const bar=e.target.closest('#finChart rect');
    if(bar){const bars=[...document.querySelectorAll('#finChart rect')],i=bars.indexOf(bar);if(i>=0){saved.filters.financeMonth=i+1;persist()}}
    if(e.target.closest('#phase4FinFilter button')){delete saved.filters.financeMonth;persist()}
  });

  function bindDashboardDrilldowns(){
    document.querySelectorAll('#opsChannels .ops-revenue-row').forEach(row=>{
      if(row.dataset.phase5Bound)return;row.dataset.phase5Bound='1';row.classList.add('phase5-channel-click');row.setAttribute('role','button');row.setAttribute('tabindex','0');
      const label=(row.firstElementChild?.textContent||'').trim().toLowerCase();const key=CHANNELS[label]||CHANNELS[label.replace(/\s+/g,' ')];if(!key)return;
      const open=()=>window.CJTOwnerNav?.openTab('finance',{filter:'channel',value:key,target:'#finTable'});row.addEventListener('click',open);row.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}})
    });
    document.querySelectorAll('#opsMonthly .ops-month:not(.head)').forEach(row=>{
      if(row.dataset.phase5Bound)return;row.dataset.phase5Bound='1';row.classList.add('phase5-month-click');row.setAttribute('role','button');row.setAttribute('tabindex','0');
      const text=(row.firstElementChild?.textContent||'').trim(),parsed=new Date(`${text} 1`);if(Number.isNaN(parsed.getTime()))return;const month=parsed.getMonth()+1;
      const open=()=>window.CJTOwnerNav?.openTab('finance',{filter:'month',value:month,target:'#finTable'});row.addEventListener('click',open);row.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}})
    });
  }

  function maybeRestoreLastTab(){
    if(restoredOnce||!portal||portal.classList.contains('hidden'))return;
    restoredOnce=true;
    const tab=saved.lastTab;
    if(tab&&document.querySelector(`.tab[data-tab="${tab}"]`)){restoring=true;document.querySelector(`.tab[data-tab="${tab}"]`).click();setTimeout(()=>{applySavedFilters();restoring=false},220)}
    updateBack();
  }

  bindDashboardDrilldowns();maybeRestoreLastTab();
  new MutationObserver(()=>{bindDashboardDrilldowns();maybeRestoreLastTab()}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
})();
