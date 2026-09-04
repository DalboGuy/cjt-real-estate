(()=>{
  if(document.documentElement.dataset.calendarThemeLoaded)return;
  document.documentElement.dataset.calendarThemeLoaded='1';

  const COLORS={
    'airbnb':'#c92f4b',
    'vrbo':'#1769a6',
    'booking.com':'#003b73',
    'houfy':'#007b83',
    'direct':'#8a6500'
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
  const iso=(y,m,d)=>`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

  const style=document.createElement('style');
  style.textContent=`
    .day.available-strong{background:#f2faf4!important;border-color:#afcdb7!important}
    .day.blocked{background:#dfe6e8!important;border-color:#778c91!important}
    .day.blocked .daylabel{color:#33494e!important;font-weight:850}
    .day.checkout-day:not(.blocked){background:#eef6fb!important;border-color:#91afc0!important}
    .cal-source-strip{display:flex;height:7px;border-radius:999px;overflow:hidden;margin:6px 0 5px;background:#c7d2d4}
    .cal-source-strip span{flex:1;min-width:8px}
    .cal-source-row{display:flex;flex-wrap:wrap;gap:3px;margin-top:5px}
    .cal-source-chip,.checkout-chip{display:inline-flex;align-items:center;border-radius:999px;padding:3px 6px;font-size:.66rem;line-height:1;font-weight:900;color:#fff;white-space:nowrap}
    .checkout-chip{margin-top:5px;background:#41575c;color:#fff}
    .source-legend{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 4px}
    .source-legend .cal-source-chip{font-size:.72rem;padding:5px 8px}
    .calendar-semantics-note{margin-top:10px;padding:9px 11px;border-radius:10px;background:#eef6fb;border:1px solid #b8ccd7;color:#39545d}
    .booking-day{background:#f2faf4!important;border-color:#afcdb7!important}
    .booking-day.has-block{background:#dfe6e8!important;border-color:#778c91!important}
    .booking-day.has-money{box-shadow:inset 0 0 0 3px #56796b!important}
    .source-chip{color:#fff!important;border:0!important;font-weight:900!important}
    .source-chip.airbnb{background:${COLORS['airbnb']}!important}
    .source-chip.vrbo{background:${COLORS['vrbo']}!important}
    .source-chip.booking-com{background:${COLORS['booking.com']}!important}
    .source-chip.houfy{background:${COLORS['houfy']}!important}
    .source-chip.direct{background:${COLORS['direct']}!important}
    @media(max-width:560px){.cal-source-chip,.checkout-chip{font-size:.58rem;padding:3px 5px}.cal-source-strip{height:5px}.cal-source-row{gap:2px}}
  `;
  document.head.appendChild(style);

  function calendarSnapshot(){
    try{return calendarData||{}}catch{return {}}
  }
  function pricingMonth(){
    try{return new Date(calendarMonth.getFullYear(),calendarMonth.getMonth(),1,12)}catch{return new Date(new Date().getFullYear(),new Date().getMonth(),1,12)}
  }
  function sourcesForDate(data,date){
    const fromEvents=[...new Set((data.events||[]).filter(e=>e&&e.start<=date&&e.end>date).map(e=>e.source).filter(Boolean))];
    if(fromEvents.length)return fromEvents;
    const out=[];
    for(const [source,dates] of Object.entries(data.blockedBySource||{}))if(Array.isArray(dates)&&dates.includes(date))out.push(source);
    return [...new Set(out)];
  }
  function checkoutSources(data,date){
    return [...new Set((data.events||[]).filter(e=>e&&e.end===date).map(e=>e.source).filter(Boolean))];
  }
  function chip(source,text){
    const span=document.createElement('span');
    span.className=`cal-source-chip ${sourceClass(source)}`;
    span.style.background=color(source);
    span.textContent=text||label(source);
    return span;
  }

  let decorating=false;
  function decoratePricing(){
    if(decorating)return;
    const host=document.getElementById('pricingCalendar');
    if(!host)return;
    decorating=true;
    try{
      const data=calendarSnapshot(),month=pricingMonth(),y=month.getFullYear(),m=month.getMonth();
      for(const el of host.querySelectorAll('.day')){
        const n=Number(el.querySelector('.daynum')?.textContent||0);
        if(!n)continue;
        const date=iso(y,m,n),sources=sourcesForDate(data,date),checkouts=checkoutSources(data,date),isBlocked=el.classList.contains('blocked');
        el.classList.toggle('available-strong',!isBlocked);
        el.classList.toggle('checkout-day',checkouts.length>0);
        el.querySelectorAll('.cal-source-strip,.cal-source-row,.checkout-chip').forEach(x=>x.remove());

        if(sources.length){
          const strip=document.createElement('div');strip.className='cal-source-strip';
          for(const s of sources){const seg=document.createElement('span');seg.style.background=color(s);seg.title=label(s);strip.appendChild(seg)}
          const dayNum=el.querySelector('.daynum');dayNum?.insertAdjacentElement('afterend',strip);
          const row=document.createElement('div');row.className='cal-source-row';
          sources.slice(0,3).forEach(s=>row.appendChild(chip(s)));
          if(sources.length>3){const more=document.createElement('span');more.className='cal-source-chip';more.style.background='#52666a';more.textContent=`+${sources.length-3}`;row.appendChild(more)}
          const rate=el.querySelector('.rate');rate?.insertAdjacentElement('afterend',row);
        }

        if(checkouts.length){
          const c=document.createElement('span');c.className='checkout-chip';
          c.textContent=checkouts.length===1?`Checkout · ${label(checkouts[0])}`:'Checkout';
          if(checkouts.length===1)c.style.background=color(checkouts[0]);
          el.appendChild(c);
        }

        const text=el.querySelector('.daylabel');
        if(text){
          if(isBlocked&&checkouts.length)text.textContent='Unavailable · checkout/turnover';
          else if(isBlocked)text.textContent='Unavailable';
          else if(checkouts.length)text.textContent='Checkout day · available after departure';
          else text.textContent='Available';
        }
        el.title=isBlocked
          ?`Unavailable${sources.length?' · calendar source: '+sources.map(label).join(', '):''}${checkouts.length?' · checkout also occurs this date':''}`
          :(checkouts.length?`Checkout date. The prior stay ends today; this date is available for a new check-in after turnover.`:'Available');
      }

      const pricing=document.getElementById('pricing');
      const legend=pricing?.querySelector('.legend');
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
    }finally{decorating=false}
  }

  let queued=false;
  function queueDecorate(){
    if(queued)return;queued=true;
    requestAnimationFrame(()=>{queued=false;decoratePricing()});
  }
  const pricingHost=document.getElementById('pricingCalendar');
  if(pricingHost)new MutationObserver(queueDecorate).observe(pricingHost,{childList:true,subtree:true});
  queueDecorate();

  const booking=document.getElementById('bookingCalendar');
  if(booking&&!booking.querySelector('.calendar-semantics-note')){
    const cal=booking.querySelector('#bkCalendar')?.closest('.card');
    if(cal){const note=document.createElement('p');note.className='note calendar-semantics-note';note.innerHTML='<strong>Checkout-day rule:</strong> checkout is the end of the stay, not another occupied night. A checkout date can therefore also be the next guest\'s check-in date.';cal.appendChild(note)}
  }
})();
