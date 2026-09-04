(()=>{
  const root=document.documentElement;
  if(root.dataset.bookingCalendarLoaded)return;
  root.dataset.bookingCalendarLoaded='1';

  const style=document.createElement('style');
  style.textContent=`
  .booking-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:14px 0}.booking-kpi{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px}.booking-kpi b{display:block;font-size:1.35rem}.booking-layout{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(300px,.7fr);gap:14px}.booking-calendar{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}.booking-weekday{text-align:center;font-size:.72rem;font-weight:800;color:var(--muted);padding:5px}.booking-day{min-height:112px;background:#fff;border:1px solid var(--line);border-radius:11px;padding:7px;cursor:pointer;overflow:hidden}.booking-day:hover{border-color:var(--deep)}.booking-day.has-block{background:#fbf7f5}.booking-day.has-money{box-shadow:inset 0 0 0 2px #9ebdad}.booking-day-number{font-weight:900}.source-chip{display:inline-block;font-size:.64rem;font-weight:800;padding:3px 5px;border-radius:999px;background:var(--soft);margin:2px 2px 0 0;max-width:100%;overflow:hidden;text-overflow:ellipsis;vertical-align:top}.source-chip.airbnb{background:#f7e8e8}.source-chip.vrbo{background:#e8f0f5}.source-chip.booking-com{background:#e9ecf7}.source-chip.houfy{background:#e8f4ea}.source-chip.direct{background:#f5efdf}.day-money{font-size:.78rem;font-weight:900;margin-top:5px}.booking-list{display:grid;gap:8px}.booking-row{border:1px solid var(--line);border-radius:12px;padding:11px;background:#fff}.booking-row h4{margin:0 0 5px}.booking-row .actions{margin-top:8px}.sync-warning{background:#fff8df;border:1px solid #ead9a2;border-radius:12px;padding:12px;margin:10px 0}.booking-form-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.booking-form-grid .full{grid-column:1/-1}.booking-section-title{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}.calendar-source-health{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.health-chip{font-size:.72rem;padding:4px 7px;border-radius:999px;background:var(--soft)}.health-chip.ok{background:var(--good)}.health-chip.bad{background:#f6dddd}.unmatched-count{font-weight:900}.booking-muted{font-size:.78rem;color:var(--muted)}@media(max-width:950px){.booking-kpis{grid-template-columns:repeat(2,1fr)}.booking-layout{grid-template-columns:1fr}}@media(max-width:560px){.booking-kpis{grid-template-columns:1fr 1fr}.booking-calendar{grid-template-columns:repeat(7,minmax(40px,1fr));overflow-x:auto}.booking-day{min-height:92px;padding:5px}.source-chip{font-size:.58rem}.booking-form-grid{grid-template-columns:1fr}.booking-form-grid .full{grid-column:auto}}
  `;
  document.head.appendChild(style);

  const pricingTab=document.querySelector('.tab[data-tab="pricing"]');
  const tab=document.createElement('button');
  tab.className='tab';tab.dataset.tab='bookingCalendar';tab.textContent='Booking Calendar';
  pricingTab?pricingTab.before(tab):document.querySelector('.tabs')?.appendChild(tab);

  const section=document.createElement('section');
  section.id='bookingCalendar';section.className='panel';
  section.innerHTML=`
    <div class="booking-section-title"><div><h2 style="margin-bottom:4px">Bookings & Revenue Calendar</h2><p class="meta" style="margin-top:0">Calendar blocks from Airbnb, Vrbo, Booking.com, Houfy and direct bookings, with a separate owner revenue ledger.</p></div><button id="bookingRefresh" class="btn ghost small" type="button">Refresh</button></div>
    <div class="sync-warning"><strong>Source-label caution:</strong> because the four booking sites are cross-synced, the same stay can appear in more than one iCal feed. A source chip means that feed contains the block; it does not by itself prove which site owns the reservation. Revenue records below are the authoritative channel assignment.</div>
    <div id="bookingHealth" class="calendar-source-health"></div>
    <div class="booking-kpis">
      <div class="booking-kpi"><span class="meta">Revenue-tracked stays</span><b id="bkTracked">0</b></div>
      <div class="booking-kpi"><span class="meta">Booked nights</span><b id="bkNights">0</b></div>
      <div class="booking-kpi"><span class="meta">Gross booked revenue</span><b id="bkGross">$0</b></div>
      <div class="booking-kpi"><span class="meta">Expected payout</span><b id="bkPayout">$0</b></div>
      <div class="booking-kpi"><span class="meta">Collected</span><b id="bkCollected">$0</b></div>
    </div>
    <div class="booking-layout">
      <div>
        <div class="card"><div class="calendarbar"><button id="bkPrev" class="btn ghost small" type="button">← Previous</button><h3 id="bkTitle" style="margin:0"></h3><button id="bkNext" class="btn ghost small" type="button">Next →</button></div><div id="bkCalendar" class="booking-calendar"></div><p class="note">Revenue totals use the month in which the reservation checks in. Booked-night counts use nights physically falling within the displayed month.</p></div>
        <div class="card"><div class="booking-section-title"><div><h3 style="margin:0">Unmatched / unpriced calendar blocks</h3><div class="booking-muted">Future calendar ranges that do not yet have a revenue record.</div></div><span id="bkUnmatchedCount" class="badge unmatched-count">0</span></div><div id="bkUnmatched" class="booking-list" style="margin-top:10px"></div></div>
      </div>
      <div>
        <div class="card"><h3 style="margin-top:0">Booking financial record</h3><p class="meta">Use actual reservation totals or payout data. Do not estimate from the pricing calendar.</p><form id="bkForm" class="booking-form-grid">
          <input id="bkKey" type="hidden">
          <div><label>Channel</label><select id="bkChannel" required><option value="airbnb">Airbnb</option><option value="vrbo">Vrbo</option><option value="booking.com">Booking.com</option><option value="houfy">Houfy</option><option value="direct">CJT Direct</option><option value="other">Other / verify</option></select></div>
          <div><label>Status</label><select id="bkStatus"><option value="confirmed">Confirmed</option><option value="pending">Pending</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div>
          <div><label>Check-in</label><input id="bkCheckin" type="date" required></div><div><label>Checkout</label><input id="bkCheckout" type="date" required></div>
          <div><label>Guest total / gross</label><input id="bkGrossInput" type="number" min="0" max="1000000" step="0.01" placeholder="0.00"></div><div><label>Expected host payout</label><input id="bkPayoutInput" type="number" min="0" max="1000000" step="0.01" placeholder="0.00"></div>
          <div><label>Taxes</label><input id="bkTaxes" type="number" min="0" max="1000000" step="0.01" placeholder="0.00"></div><div><label>Cleaning fee</label><input id="bkCleaning" type="number" min="0" max="1000000" step="0.01" placeholder="0.00"></div>
          <div><label>Collected / paid out</label><input id="bkCollectedInput" type="number" min="0" max="1000000" step="0.01" placeholder="0.00"></div><div><label>Reservation reference</label><input id="bkReference" maxlength="100" placeholder="Optional confirmation code"></div>
          <div class="full"><label>Notes</label><textarea id="bkNotes" placeholder="Optional"></textarea></div>
          <div class="full"><button class="btn primary" type="submit">Save booking financials</button> <button id="bkClear" class="btn ghost" type="button">New / clear</button><div id="bkMsg" class="meta" style="margin-top:8px"></div></div>
        </form></div>
        <div class="card"><h3 style="margin-top:0">Revenue-tracked bookings</h3><div id="bkFinancialList" class="booking-list"></div></div>
      </div>
    </div>`;
  const teamSection=document.getElementById('team');
  teamSection?teamSection.before(section):document.getElementById('portal')?.appendChild(section);

  tab.addEventListener('click',()=>{
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
    tab.classList.add('active');section.classList.add('active');
    if(!calendarState.loaded)refresh();
  });

  const calendarState={loaded:false,data:{otaEvents:[],directReservations:[],financials:[],sources:[]},month:new Date()};
  calendarState.month.setDate(1);calendarState.month.setHours(12,0,0,0);
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const dollars=v=>{const n=Number(v||0);return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:0,maximumFractionDigits:2}).format(Number.isFinite(n)?n:0)};
  const channelLabel=s=>({'airbnb':'Airbnb','vrbo':'Vrbo','booking.com':'Booking.com','houfy':'Houfy','direct':'CJT Direct','other':'Other'}[s]||s);
  const chipClass=s=>String(s||'').replace('.','-');
  const dateObj=s=>new Date(`${s}T12:00:00Z`);
  const dayISO=(y,m,d)=>`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const overlap=(a,b,c,d)=>a<d&&c<b;
  function eachNight(start,end){const out=[];for(let d=new Date(`${start}T00:00:00Z`),e=new Date(`${end}T00:00:00Z`);d<e;d.setUTCDate(d.getUTCDate()+1))out.push(d.toISOString().slice(0,10));return out}

  async function ownerCalendarApi(opts={}){
    const r=await fetch('/api/owner-calendar',{headers:{'Content-Type':'application/json'},...opts});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||'request_failed');
    return d;
  }
  async function refresh(){
    $('bookingRefresh').disabled=true;$('bookingRefresh').textContent='Refreshing…';
    try{calendarState.data=await ownerCalendarApi();calendarState.loaded=true;renderAll();}
    catch(e){$('bookingHealth').innerHTML=`<span class="health-chip bad">Calendar load failed: ${esc(e.message)}</span>`;}
    finally{$('bookingRefresh').disabled=false;$('bookingRefresh').textContent='Refresh';}
  }

  function renderAll(){renderHealth();renderCalendar();renderFinancialList();renderUnmatched();}
  function renderHealth(){
    const sources=calendarState.data.sources||[];
    const directOk=true;
    $('bookingHealth').innerHTML=sources.map(s=>`<span class="health-chip ${s.ok?'ok':'bad'}">${esc(channelLabel(s.name))}: ${s.ok?'connected':'error'}${s.ok&&Number.isFinite(Number(s.eventCount))?' · '+Number(s.eventCount)+' events':''}</span>`).join('')+`<span class="health-chip ${directOk?'ok':'bad'}">CJT Direct: connected</span>`;
  }

  function activeFinancials(){return (calendarState.data.financials||[]).filter(f=>f.status!=='cancelled')}
  function renderCalendar(){
    const y=calendarState.month.getFullYear(),m=calendarState.month.getMonth(),monthStart=dayISO(y,m,1),monthEnd=dayISO(m===11?y+1:y,m===11?0:m+1,1);
    $('bkTitle').textContent=calendarState.month.toLocaleDateString(undefined,{month:'long',year:'numeric'});
    const allEvents=[...(calendarState.data.otaEvents||[]),...(calendarState.data.directReservations||[])];
    const fins=activeFinancials();
    const checkinFins=fins.filter(f=>f.checkin>=monthStart&&f.checkin<monthEnd);
    const nightSet=new Set();fins.forEach(f=>eachNight(f.checkin,f.checkout).forEach(d=>{if(d>=monthStart&&d<monthEnd)nightSet.add(d)}));
    $('bkTracked').textContent=checkinFins.length;$('bkNights').textContent=nightSet.size;
    $('bkGross').textContent=dollars(checkinFins.reduce((a,f)=>a+Number(f.gross_revenue||0),0));
    $('bkPayout').textContent=dollars(checkinFins.reduce((a,f)=>a+Number(f.expected_payout||0),0));
    $('bkCollected').textContent=dollars(checkinFins.reduce((a,f)=>a+Number(f.collected_amount||0),0));
    const host=$('bkCalendar'),first=new Date(y,m,1).getDay(),days=new Date(y,m+1,0).getDate();
    host.innerHTML=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x=>`<div class="booking-weekday">${x}</div>`).join('')+Array.from({length:first},()=>'<div></div>').join('');
    for(let d=1;d<=days;d++){
      const date=dayISO(y,m,d),events=allEvents.filter(e=>e.start<=date&&e.end>date),financial=fins.filter(f=>f.checkin<=date&&f.checkout>date),sources=[...new Set(events.map(e=>e.source))];
      const el=document.createElement('div');el.className=`booking-day ${events.length?'has-block':''} ${financial.length?'has-money':''}`;
      const payout=financial.reduce((a,f)=>a+Number(f.expected_payout||0),0);
      el.innerHTML=`<div class="booking-day-number">${d}</div><div>${sources.slice(0,3).map(s=>`<span class="source-chip ${chipClass(s)}">${esc(channelLabel(s))}</span>`).join('')}${sources.length>3?`<span class="source-chip">+${sources.length-3}</span>`:''}</div>${financial.length?`<div class="day-money">${esc(financial.map(f=>channelLabel(f.channel)).join(' / '))}${payout?` · ${dollars(payout)}`:''}</div>`:''}`;
      el.title=events.length?events.map(e=>`${channelLabel(e.source)}: ${e.summary} (${e.start}–${e.end})`).join('\n'):'Available';
      el.addEventListener('click',()=>prefillFromDay(date,events,financial));host.appendChild(el);
    }
  }

  function prefillFromDay(date,events,financial){
    if(financial.length){fillForm(financial[0]);return;}
    const preferred=events.find(e=>e.kind==='reservation_like')||events[0];
    clearForm();
    if(preferred){$('bkCheckin').value=preferred.start;$('bkCheckout').value=preferred.end;const unique=[...new Set(events.filter(e=>e.start===preferred.start&&e.end===preferred.end).map(e=>e.source))];$('bkChannel').value=unique.length===1&&['airbnb','vrbo','booking.com','houfy','direct'].includes(unique[0])?unique[0]:'other';$('bkMsg').className='meta';$('bkMsg').textContent=unique.length>1?`This range appears in ${unique.map(channelLabel).join(', ')}. Choose the actual booking channel before entering revenue.`:`Prefilled from ${channelLabel(preferred.source)} calendar block. Verify the actual booking channel before saving.`;}
    else{$('bkCheckin').value=date;const next=new Date(`${date}T00:00:00Z`);next.setUTCDate(next.getUTCDate()+1);$('bkCheckout').value=next.toISOString().slice(0,10)}
    $('bkChannel').focus();
  }

  function groupedBlocks(){
    const now=new Date().toISOString().slice(0,10),events=(calendarState.data.otaEvents||[]).filter(e=>e.end>now),groups=new Map();
    for(const e of events){const k=`${e.start}|${e.end}`;if(!groups.has(k))groups.set(k,{start:e.start,end:e.end,sources:new Set(),summaries:new Set(),reservationLike:false});const g=groups.get(k);g.sources.add(e.source);g.summaries.add(e.summary);if(e.kind==='reservation_like')g.reservationLike=true;}
    return [...groups.values()].map(g=>({...g,sources:[...g.sources],summaries:[...g.summaries]})).sort((a,b)=>a.start.localeCompare(b.start));
  }
  function renderUnmatched(){
    const fins=activeFinancials(),groups=groupedBlocks().filter(g=>!fins.some(f=>f.checkin===g.start&&f.checkout===g.end));
    $('bkUnmatchedCount').textContent=groups.length;$('bkUnmatched').innerHTML=groups.length?'':'<div class="meta">No unmatched future ranges.</div>';
    for(const g of groups.slice(0,60)){
      const row=document.createElement('div');row.className='booking-row';
      row.innerHTML=`<h4>${esc(g.start)} → ${esc(g.end)}</h4><div>${g.sources.map(s=>`<span class="source-chip ${chipClass(s)}">${esc(channelLabel(s))}</span>`).join('')}</div><div class="booking-muted">${g.reservationLike?'Reservation-like calendar event':'Calendar block'} · ${esc(g.summaries.slice(0,2).join(' / '))}</div><div class="actions"><button class="btn ghost small" type="button">Add revenue details</button></div>`;
      row.querySelector('button').addEventListener('click',()=>prefillFromDay(g.start,(calendarState.data.otaEvents||[]).filter(e=>e.start===g.start&&e.end===g.end),[]));$('bkUnmatched').appendChild(row);
    }
  }

  function fillForm(f){$('bkKey').value=f.booking_key||'';$('bkChannel').value=f.channel;$('bkStatus').value=f.status;$('bkCheckin').value=f.checkin;$('bkCheckout').value=f.checkout;$('bkGrossInput').value=f.gross_revenue??'';$('bkPayoutInput').value=f.expected_payout??'';$('bkTaxes').value=f.taxes??'';$('bkCleaning').value=f.cleaning_fee??'';$('bkCollectedInput').value=f.collected_amount??'';$('bkReference').value=f.external_reference||'';$('bkNotes').value=f.notes||'';$('bkMsg').textContent=`Editing ${channelLabel(f.channel)} ${f.checkin} → ${f.checkout}.`;}
  function clearForm(){$('bkForm').reset();$('bkKey').value='';$('bkChannel').value='airbnb';$('bkStatus').value='confirmed';$('bkMsg').textContent='';}
  function renderFinancialList(){
    const rows=(calendarState.data.financials||[]).slice().sort((a,b)=>a.checkin.localeCompare(b.checkin));$('bkFinancialList').innerHTML=rows.length?'':'<div class="meta">No revenue records yet.</div>';
    for(const f of rows){const r=document.createElement('div');r.className='booking-row';r.innerHTML=`<h4>${esc(channelLabel(f.channel))} · ${esc(f.checkin)} → ${esc(f.checkout)}</h4><div><span class="badge ${f.status==='cancelled'?'warn':'good'}">${esc(f.status)}</span></div><div class="meta">Gross ${dollars(f.gross_revenue)} · Expected payout ${dollars(f.expected_payout)} · Collected ${dollars(f.collected_amount)}</div>${f.external_reference?`<div class="booking-muted">Ref: ${esc(f.external_reference)}</div>`:''}<div class="actions"><button class="btn ghost small edit" type="button">Edit</button><button class="btn ghost small delete" type="button">Delete</button></div>`;r.querySelector('.edit').addEventListener('click',()=>fillForm(f));r.querySelector('.delete').addEventListener('click',()=>deleteFinancial(f));$('bkFinancialList').appendChild(r);}
  }
  async function deleteFinancial(f){if(!confirm(`Delete the revenue record for ${channelLabel(f.channel)} ${f.checkin} → ${f.checkout}?`))return;await ownerCalendarApi({method:'POST',body:JSON.stringify({action:'financial_delete',booking_key:f.booking_key})});await refresh();clearForm();}

  $('bkForm').addEventListener('submit',async e=>{e.preventDefault();const msg=$('bkMsg');msg.className='meta';msg.textContent='Saving…';const payload={action:'financial_upsert',booking_key:$('bkKey').value,channel:$('bkChannel').value,status:$('bkStatus').value,checkin:$('bkCheckin').value,checkout:$('bkCheckout').value,gross_revenue:$('bkGrossInput').value,expected_payout:$('bkPayoutInput').value,taxes:$('bkTaxes').value,cleaning_fee:$('bkCleaning').value,collected_amount:$('bkCollectedInput').value,external_reference:$('bkReference').value,notes:$('bkNotes').value,source:'owner_entry'};try{await ownerCalendarApi({method:'POST',body:JSON.stringify(payload)});msg.className='meta success';msg.textContent='Booking financials saved.';await refresh();}catch(err){msg.className='meta error';msg.textContent=`Could not save: ${err.message}`;}});
  $('bkClear').addEventListener('click',clearForm);$('bookingRefresh').addEventListener('click',refresh);$('bkPrev').addEventListener('click',()=>{calendarState.month.setMonth(calendarState.month.getMonth()-1);renderCalendar()});$('bkNext').addEventListener('click',()=>{calendarState.month.setMonth(calendarState.month.getMonth()+1);renderCalendar()});

  function maybeLoad(){if(!document.getElementById('portal')?.classList.contains('hidden')&&!calendarState.loaded)refresh();}
  maybeLoad();
  const portal=document.getElementById('portal');if(portal)new MutationObserver(maybeLoad).observe(portal,{attributes:true,attributeFilter:['class']});
})();
