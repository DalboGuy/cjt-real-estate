(()=>{
  if(document.documentElement.dataset.calendarThemeLoaded)return;
  document.documentElement.dataset.calendarThemeLoaded='1';

  const COLORS={
    'airbnb':'#d93455',
    'vrbo':'#1769aa',
    'booking.com':'#003b73',
    'houfy':'#007c83',
    'direct':'#9a6b00'
  };
  const TINTS={
    'airbnb':'#ffe2e8',
    'vrbo':'#dceeff',
    'booking.com':'#dfe8f5',
    'houfy':'#dcf4f2',
    'direct':'#fff0c2'
  };
  const LABELS={
    'airbnb':'Airbnb',
    'vrbo':'Vrbo',
    'booking.com':'Booking.com',
    'houfy':'Houfy',
    'direct':'CJT Direct'
  };
  const sourceClass=s=>String(s||'').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase();
  const label=s=>LABELS[s]||String(s||'Unknown');
  const color=s=>COLORS[s]||'#52666a';
  const tint=s=>TINTS[s]||'#eadfe0';
  const iso=(y,m,d)=>`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

  const style=document.createElement('style');
  style.textContent=`
    #pricing .day{transition:background .12s,border-color .12s,box-shadow .12s}
    #pricing .day.available-strong{background:#e4f5e8!important;border:2px solid #86b993!important}
    #pricing .day.blocked{border-width:2px!important}
    #pricing .day.blocked .daylabel{color:#203b40!important;font-weight:900!important}
    #pricing .day.checkout-day:not(.blocked){box-shadow:inset 5px 0 0 var(--checkout-color,#52666a)!important}
    #pricing .day.override{outline:3px solid #b58b25;outline-offset:-3px}
    #pricing .dot{background:#72aa80!important}.dot.blocked{background:#c75266!important}.dot.override{background:#b58b25!important}
    .cal-source-strip{display:flex;height:9px;border-radius:999px;overflow:hidden;margin:6px 0 5px;background:#c7d2d4}
    .cal-source-strip span{flex:1;min-width:8px}
    .cal-source-row{display:flex;flex-wrap:wrap;gap:3px;margin-top:5px}
    .cal-source-chip,.checkout-chip{display:inline-flex;align-items:center;border-radius:999px;padding:4px 7px;font-size:.68rem;line-height:1;font-weight:950;color:#fff;white-space:nowrap}
    .checkout-chip{margin-top:6px}
    .source-legend{display:flex;gap:7px;flex-wrap:wrap;margin:9px 0 4px;padding:8px 0;border-top:1px solid var(--line)}
    .source-legend .cal-source-chip{font-size:.74rem;padding:5px 9px}
    .calendar-semantics-note{margin-top:10px;padding:10px 12px;border-radius:10px;background:#eef6fb;border:1px solid #9fbcca;color:#294b55}
    .booking-day{background:#e4f5e8!important;border:2px solid #86b993!important}
    .booking-day.has-block{background:#eadfe0!important;border-color:#a76a73!important}
    .booking-day.has-money{box-shadow:inset 0 0 0 3px #56796b!important}
    .source-chip{color:#fff!important;border:0!important;font-weight:900!important}
    .source-chip.airbnb{background:${COLORS['airbnb']}!important}
    .source-chip.vrbo{background:${COLORS['vrbo']}!important}
    .source-chip.booking-com{background:${COLORS['booking.com']}!important}
    .source-chip.houfy{background:${COLORS['houfy']}!important}
    .source-chip.direct{background:${COLORS['direct']}!important}
    @media(max-width:560px){.cal-source-chip,.checkout-chip{font-size:.58rem;padding:3px 5px}.cal-source-strip{height:6px}.cal-source-row{gap:2px}}
  `;
  document.head.appendChild(style);

  function calendarSnapshot(){
    try{return calendarData||{}}catch{return {}}
  }
  function pricingMonth(){
    try{return new Date(calendarMonth.getFullYear(),calendarMonth.getMonth(),1,12)}catch{return new Date(new Date().getFullYear(),new Date().getMonth(),1,12)}
  }
  function eventsForDate(data,date){return (data.events||[]).filter(e=>e&&e.start<=date&&e.end>date)}
  function sourcesForDate(data,date){
    const fromEvents=[...new Set(eventsForDate(data,date).map(e=>e.source).filter(Boolean))];
    if(fromEvents.length)return fromEvents;
    const out=[];
    for(const [source,dates] of Object.entries(data.blockedBySource||{}))if(Array.isArray(dates)&&dates.includes(date))out.push(source);
    return [...new Set(out)];
  }
  function checkoutSources(data,date){return [...new Set((data.events||[]).filter(e=>e&&e.end===date).map(e=>e.source).filter(Boolean))]}
  function chip(source,text){
    const span=document.createElement('span');
    span.className=`cal-source-chip ${sourceClass(source)}`;
    span.style.background=color(source);
    span.textContent=text||label(source);
    return span;
  }
  function backgroundFor(sources){
    if(!sources.length)return '#eadfe0';
    if(sources.length===1)return tint(sources[0]);
    const a=tint(sources[0]),b=tint(sources[1]);
    return `linear-gradient(135deg,${a} 0%,${a} 50%,${b} 50%,${b} 100%)`;
  }

  function decoratePricing(){
    const host=document.getElementById('pricingCalendar');
    if(!host)return;
    const data=calendarSnapshot(),month=pricingMonth(),y=month.getFullYear(),m=month.getMonth();
    for(const el of host.querySelectorAll('.day')){
      const n=Number(el.querySelector('.daynum')?.textContent||0);
      if(!n)continue;
      const date=iso(y,m,n),activeEvents=eventsForDate(data,date),sources=sourcesForDate(data,date),checkouts=checkoutSources(data,date),isBlocked=el.classList.contains('blocked');
      el.classList.toggle('available-strong',!isBlocked);
      el.classList.toggle('checkout-day',checkouts.length>0);
      el.querySelectorAll('.cal-source-strip,.cal-source-row,.checkout-chip').forEach(x=>x.remove());
      el.style.removeProperty('background');el.style.removeProperty('border-color');el.style.removeProperty('--checkout-color');

      if(isBlocked){
        el.style.setProperty('background',backgroundFor(sources),'important');
        el.style.setProperty('border-color',sources.length?color(sources[0]):'#a76a73','important');
      }
      if(checkouts.length&&!isBlocked)el.style.setProperty('--checkout-color',color(checkouts[0]));

      if(sources.length){
        const strip=document.createElement('div');strip.className='cal-source-strip';
        for(const s of sources){const seg=document.createElement('span');seg.style.background=color(s);seg.title=label(s);strip.appendChild(seg)}
        el.querySelector('.daynum')?.insertAdjacentElement('afterend',strip);
        const row=document.createElement('div');row.className='cal-source-row';
        sources.slice(0,3).forEach(s=>row.appendChild(chip(s)));
        if(sources.length>3){const more=document.createElement('span');more.className='cal-source-chip';more.style.background='#52666a';more.textContent=`+${sources.length-3}`;row.appendChild(more)}
        el.querySelector('.rate')?.insertAdjacentElement('afterend',row);
      }

      if(checkouts.length){
        const c=document.createElement('span');c.className='checkout-chip';
        c.textContent=checkouts.length===1?`Checkout · ${label(checkouts[0])}`:'Checkout · multiple feeds';
        c.style.background=checkouts.length===1?color(checkouts[0]):'#52666a';
        el.appendChild(c);
      }

      const text=el.querySelector('.daylabel');
      if(text){
        const reservationLike=activeEvents.some(e=>e.kind==='reservation_like');
        if(isBlocked&&sources.length===1)text.textContent=`${reservationLike?'Booked':'Blocked'} · ${label(sources[0])}`;
        else if(isBlocked&&sources.length>1)text.textContent='Unavailable · multiple calendars';
        else if(isBlocked)text.textContent='Unavailable';
        else if(checkouts.length===1)text.textContent=`Available after ${label(checkouts[0])} checkout`;
        else if(checkouts.length>1)text.textContent='Available after checkout';
        else text.textContent='Available';
      }
      el.title=isBlocked
        ?`Unavailable${sources.length?' · calendar source: '+sources.map(label).join(', '):''}${checkouts.length?' · checkout also occurs this date':''}`
        :(checkouts.length?`Checkout date. The prior stay ends today; this date is available for a new check-in after turnover.`:'Available');
    }

    const pricing=document.getElementById('pricing'),legend=pricing?.querySelector('.legend');
    if(legend&&!pricing.querySelector('.source-legend')){
      const src=document.createElement('div');src.className='source-legend';
      for(const s of ['airbnb','vrbo','booking.com','houfy','direct'])src.appendChild(chip(s));
      legend.insertAdjacentElement('afterend',src);
    }
    const card=host.closest('.card');
    if(card&&!card.querySelector('.calendar-semantics-note')){
      const note=document.createElement('p');note.className='note calendar-semantics-note';
      note.innerHTML='<strong>Checkout-day rule:</strong> a stay blocks the nights from check-in through the night before checkout. The checkout date itself is available for a new arrival after turnover unless CJT adds a buffer-day rule.';
      card.appendChild(note);
    }
  }

  try{
    if(typeof renderCalendar==='function'){
      const baseRenderCalendar=renderCalendar;
      renderCalendar=function(){baseRenderCalendar();decoratePricing()};
    }
  }catch{}
  decoratePricing();

  const booking=document.getElementById('bookingCalendar');
  if(booking&&!booking.querySelector('.calendar-semantics-note')){
    const cal=booking.querySelector('#bkCalendar')?.closest('.card');
    if(cal){const note=document.createElement('p');note.className='note calendar-semantics-note';note.innerHTML='<strong>Checkout-day rule:</strong> checkout is the end of the stay, not another occupied night. A checkout date can therefore also be the next guest\'s check-in date.';cal.appendChild(note)}
  }
})();
