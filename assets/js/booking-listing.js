(()=>{
  const $=id=>document.getElementById(id);
  const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0));
  const isoToday=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
  const toUtc=s=>new Date(`${s}T00:00:00Z`);
  const fmt=s=>s?toUtc(s).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}):'Add dates';
  const eachDate=(start,end)=>{const out=[];if(!start||!end)return out;for(let d=toUtc(start),stop=toUtc(end);d<stop;d=new Date(d.getTime()+86400000))out.push(d.toISOString().slice(0,10));return out};
  const esc=v=>String(v||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function hydrateMobileSourceSummaries(){
    const source=document.querySelector('.desktop-source-summaries'),target=document.querySelector('.mobile-source-summaries');
    if(!source||!target||target.children.length)return;
    [...source.children].forEach(card=>target.appendChild(card.cloneNode(true)));
  }
  function hydrateAmenitiesModal(){
    const source=document.querySelector('.amenity-directory'),target=$('amenitiesModalGrid');
    if(!source||!target||target.children.length)return;
    [...source.children].forEach(column=>target.appendChild(column.cloneNode(true)));
  }

  let photos=[],assetManifest=null;
  const assetManifestUrl='/assets/data/public-image-manifest.json';
  const $gallery=$('galleryModal'),galleryGrid=$('galleryGrid'),viewer=$('photoViewer'),viewerImage=$('viewerImage'),viewerMeta=$('viewerMeta');
  let galleryFilter='all',galleryVisible=[],viewerIndex=0;
  const roomStyle=document.createElement('style');
  roomStyle.textContent='.room-card .room-visual{padding:0;position:relative;overflow:hidden;background:#eef2f0}.room-card .room-visual img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .22s ease}.room-card:hover .room-visual img,.room-card:focus-visible .room-visual img{transform:scale(1.025)}.room-card .room-visual.photo-fallback{display:grid;place-items:center}.room-card .room-visual.photo-fallback:before{content:"Room photo";color:#6b7d80;font-weight:850}.room-gallery-grid button.photo-fallback{display:grid;place-items:center;color:#6b7d80;font-weight:850}.room-card .room-visual .room-photo-count{position:absolute;left:12px;bottom:12px;background:rgba(255,255,255,.94);border:1px solid rgba(221,228,226,.95);border-radius:999px;padding:6px 9px;font-size:.7rem;font-weight:850;color:#12383e;box-shadow:0 4px 14px rgba(13,43,49,.1)}.room-gallery-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.room-gallery-grid button{border:0;padding:0;background:#eef2f0;border-radius:14px;overflow:hidden;cursor:pointer;min-height:220px}.room-gallery-grid img{width:100%;height:360px;object-fit:cover;display:block}@media(max-width:780px){.room-gallery-grid{grid-template-columns:1fr}.room-gallery-grid img{height:auto;max-height:72vh}}';
  document.head.appendChild(roomStyle);
  function renderGallery(){
    galleryVisible=[];galleryGrid.innerHTML='';
    photos.forEach((p,i)=>{if(galleryFilter!=='all'&&p.category!==galleryFilter)return;galleryVisible.push(i);const b=document.createElement('button');b.type='button';b.innerHTML=`<img loading="lazy" decoding="async" src="${p.publicPath}" alt="Sand & Sea Manor — ${esc(p.label)}">`;b.onclick=()=>openViewer(i);galleryGrid.appendChild(b)});
    $('galleryCount').textContent=`${galleryVisible.length} photo${galleryVisible.length===1?'':'s'}`;
  }
  function openGallery(filter='all'){galleryFilter=filter;document.querySelectorAll('[data-gallery-filter]').forEach(b=>b.classList.toggle('active',b.dataset.galleryFilter===filter));renderGallery();$gallery.classList.add('show');document.body.classList.add('modal-open')}
  function closeGallery(){$gallery.classList.remove('show');if(!viewer.classList.contains('show'))document.body.classList.remove('modal-open')}
  function openViewer(i){if(!photos[i])return;viewerIndex=i;viewerImage.src=photos[i].publicPath;viewerImage.alt=`Sand & Sea Manor — ${photos[i].label}`;const pos=galleryVisible.indexOf(i);viewerMeta.textContent=`${photos[i].label} · ${pos>=0?pos+1:i+1} of ${galleryVisible.length||photos.length}`;viewer.classList.add('show');document.body.classList.add('modal-open')}
  function closeViewer(){viewer.classList.remove('show');if(!$gallery.classList.contains('show'))document.body.classList.remove('modal-open')}
  function moveViewer(step){let p=galleryVisible.indexOf(viewerIndex);if(p<0)p=0;p=(p+step+galleryVisible.length)%galleryVisible.length;openViewer(galleryVisible[p])}
  document.querySelectorAll('[data-open-gallery]').forEach(b=>b.onclick=()=>openGallery(b.dataset.openGallery||'all'));
  document.querySelectorAll('[data-gallery-filter]').forEach(b=>b.onclick=()=>{galleryFilter=b.dataset.galleryFilter;document.querySelectorAll('[data-gallery-filter]').forEach(x=>x.classList.toggle('active',x===b));renderGallery()});
  $('galleryClose').onclick=closeGallery;$('viewerClose').onclick=closeViewer;$('viewerPrev').onclick=()=>moveViewer(-1);$('viewerNext').onclick=()=>moveViewer(1);
  $gallery.addEventListener('click',e=>{if(e.target===$gallery)closeGallery()});viewer.addEventListener('click',e=>{if(e.target===viewer)closeViewer()});
  document.addEventListener('keydown',e=>{if(viewer.classList.contains('show')){if(e.key==='Escape')closeViewer();if(e.key==='ArrowLeft')moveViewer(-1);if(e.key==='ArrowRight')moveViewer(1)}else if($gallery.classList.contains('show')&&e.key==='Escape')closeGallery()});
  function renderMosaic(){
    const mosaic=document.querySelector('.v2-mosaic');if(!mosaic||!assetManifest)return;
    // The mount is intentionally empty in HTML; never remove visible markup here.
    if(mosaic.querySelector('.gallery-item'))return;
    const show=mosaic.querySelector('.show-photos');
    assetManifest.openingPhotos.forEach((photo,i)=>{const b=document.createElement('button');b.type='button';b.className=`gallery-item${i===0?' main':''}`;const galleryIndex=photos.findIndex(p=>p.id===photo.id);if(galleryIndex>=0)b.dataset.photoIndex=String(galleryIndex);b.innerHTML=`<img src="${photo.publicPath}" alt="${esc(photo.alt||photo.label||'Sand & Sea Manor')}">`;b.onclick=()=>openViewer(galleryIndex>=0?galleryIndex:i);mosaic.insertBefore(b,show)});
  }
  function renderRooms(){
    const scroll=$('sleepingScroll'),modal=$('roomGalleryModal'),grid=$('roomGalleryGrid');if(!scroll||!modal||!grid||!assetManifest)return;
    // Room cards have one source: manifest roomGroups, rendered into the empty mount.
    if(scroll.children.length)return;
    const title=$('roomGalleryTitle'),subtitle=$('roomGallerySubtitle');
    const openRoom=room=>{title.textContent=room.name;subtitle.textContent=`${room.photos.length} photo${room.photos.length===1?'':'s'}`;grid.innerHTML='';room.photos.forEach((photo,i)=>{const b=document.createElement('button');b.type='button';b.innerHTML=`<img src="${photo.publicPath}" alt="${esc(room.name)} photo ${i+1}">`;const img=b.querySelector('img');if(img)img.onerror=()=>{img.remove();b.classList.add('photo-fallback')};grid.appendChild(b)});modal.classList.add('show');document.body.classList.add('modal-open')};
    assetManifest.roomGroups.forEach((room,index)=>{const card=document.createElement('button');card.type='button';card.className='sleep-card room-card';card.dataset.roomIndex=String(index);const cover=room.photos[0];card.innerHTML=`<div class="room-visual"><img src="${cover.publicPath}" alt="${esc(room.name)}"><span class="room-photo-count">${room.photos.length} photo${room.photos.length===1?'':'s'}</span></div><div class="room-card-copy"><strong>${esc(room.name)}</strong><span>${room.photos.length} room photo${room.photos.length===1?'':'s'}</span><span class="room-link">View room →</span></div>`;const visual=card.querySelector('.room-visual'),img=card.querySelector('img');if(img&&visual)img.onerror=()=>{img.remove();visual.classList.add('photo-fallback');visual.setAttribute('aria-label',`${room.name} photo unavailable`)};card.onclick=()=>openRoom(room);scroll.appendChild(card)});
    $('roomGalleryClose')?.addEventListener('click',()=>{modal.classList.remove('show');document.body.classList.remove('modal-open')});modal.addEventListener('click',e=>{if(e.target===modal)$('roomGalleryClose')?.click()});$('roomPrev')?.addEventListener('click',()=>scroll.scrollBy({left:-330,behavior:'smooth'}));$('roomNext')?.addEventListener('click',()=>scroll.scrollBy({left:330,behavior:'smooth'}));
  }
  async function loadAssetManifest(){try{const response=await fetch(assetManifestUrl,{cache:'no-store'});if(!response.ok)throw new Error('image_manifest_unavailable');assetManifest=await response.json();photos=assetManifest.galleryPhotos||[];renderMosaic();renderRooms();renderGallery()}catch(error){console.error('Public image manifest failed to load',error)}}
  $('shareBtn').onclick=async()=>{const data={title:'Sand & Sea Manor',text:'Sand & Sea Manor in Galveston — direct booking',url:location.href};try{if(navigator.share)await navigator.share(data);else{await navigator.clipboard.writeText(location.href);$('shareLabel').textContent='Copied';setTimeout(()=>$('shareLabel').textContent='Share',1600)}}catch{}};
  const saved=localStorage.getItem('cjt_sand_sea_saved')==='1';
  function paintSave(on){$('saveBtn').dataset.saved=on?'1':'0';$('saveLabel').textContent=on?'Saved':'Save';$('saveHeart').setAttribute('fill',on?'currentColor':'none')}
  paintSave(saved);$('saveBtn').onclick=()=>{const next=$('saveBtn').dataset.saved!=='1';localStorage.setItem('cjt_sand_sea_saved',next?'1':'0');paintSave(next)};

  const CTA_CHECK='Check availability';
  const CTA_RESERVE='Reserve';
  let blocked=new Set(),calendarHealthy=false,selectedStart='',selectedEnd='',adults=1,children=0,guests=1,currentQuote=null;
  let pickerCursor=new Date();pickerCursor=new Date(pickerCursor.getFullYear(),pickerCursor.getMonth(),1);
  let ignoreBackdropUntil=0,calendarReturnTo='listing',requestStep='price';
  const calendarModal=$('calendarModal');
  function isMobileBooking(){return window.matchMedia('(max-width:780px)').matches}
  function guardBackdrop(){ignoreBackdropUntil=Date.now()+600}
  function shouldIgnoreBackdrop(){return Date.now()<ignoreBackdropUntil}
  function canCheckoutOn(date){return selectedStart&&!selectedEnd&&date>selectedStart&&!eachDate(selectedStart,date).some(d=>blocked.has(d))}
  function renderMonth(target,date,secondary=false){
    target.innerHTML='';const title=document.createElement('h3');title.textContent=date.toLocaleDateString('en-US',{month:'long',year:'numeric'});target.appendChild(title);
    const grid=document.createElement('div');grid.className='calendar-grid';['S','M','T','W','T','F','S'].forEach(x=>{const d=document.createElement('div');d.className='dow';d.textContent=x;grid.appendChild(d)});
    const y=date.getFullYear(),m=date.getMonth(),first=new Date(y,m,1).getDay(),days=new Date(y,m+1,0).getDate(),today=isoToday();
    for(let i=0;i<first;i++){const x=document.createElement('div');grid.appendChild(x)}
    for(let day=1;day<=days;day++){
      const k=`${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`,past=k<today,isBlocked=blocked.has(k),checkoutOption=isBlocked&&canCheckoutOn(k),b=document.createElement('button');
      b.type='button';b.className='day';b.textContent=day;if(selectedStart===k||selectedEnd===k)b.classList.add('selected');else if(selectedStart&&selectedEnd&&k>selectedStart&&k<selectedEnd)b.classList.add('range');
      b.disabled=past||(isBlocked&&!checkoutOption);b.title=isBlocked&&!checkoutOption?'Unavailable':'';if(!b.disabled)b.onclick=e=>{e.preventDefault();e.stopPropagation();selectDate(k,isBlocked)};grid.appendChild(b)
    }
    target.appendChild(grid);target.classList.toggle('secondary',secondary);
  }
  function renderPicker(){
    renderMonth($('calendarMonth1'),pickerCursor,false);
    renderMonth($('calendarMonth2'),new Date(pickerCursor.getFullYear(),pickerCursor.getMonth()+1,1),true);
    const nights=eachDate(selectedStart,selectedEnd).length;
    $('calendarSelection').textContent=selectedStart?(selectedEnd?`${fmt(selectedStart)} – ${fmt(selectedEnd)} · ${nights} night${nights===1?'':'s'}`:`${fmt(selectedStart)} — choose checkout`):'Select check-in and checkout';
  }
  function updateSelectors(){const inText=selectedStart?fmt(selectedStart).replace(/, \d{4}/,''):'Add date',outText=selectedEnd?fmt(selectedEnd).replace(/, \d{4}/,''):'Add date';document.querySelectorAll('[data-checkin-value]').forEach(el=>el.textContent=inText);document.querySelectorAll('[data-checkout-value]').forEach(el=>el.textContent=outText);document.querySelectorAll('[data-guests-value]').forEach(el=>el.textContent=`${guests} guest${guests===1?'':'s'}`)}
  function paintPrimaryCtas(){
    const ready=!!(selectedStart&&selectedEnd&&currentQuote);
    const label=ready?CTA_RESERVE:CTA_CHECK;
    [$('bookNowBtn'),$('mobileBookBtn')].forEach(btn=>{if(!btn)return;btn.textContent=label;btn.classList.toggle('cta-hold',ready)});
    document.querySelectorAll('.charge-note:not(.checkout-charge)').forEach(note=>{
      note.textContent=ready?'You won’t be charged yet.':'Add dates to see the total. You won’t be charged to check availability.';
    });
    syncTripDatesClass();
  }
  function syncTripDatesClass(){
    const hasDates=!!(selectedStart&&selectedEnd);
    document.body.classList.toggle('has-trip-dates',hasDates);
    const card=$('bookingCard')||document.querySelector('.booking-card');
    if(card)card.classList.toggle('is-next-step',hasDates);
    syncSupportChat();
  }
  function revealBookingStep(){
    if(!(selectedStart&&selectedEnd))return;
    document.body.classList.remove('booking-step-collapsed');
    syncTripDatesClass();
    const card=$('bookingCard')||document.querySelector('.booking-card');
    const mobile=isMobileBooking();
    if(card){card.classList.add('is-next-step');if(!mobile){try{card.scrollIntoView({behavior:'smooth',block:'center'})}catch{}}}
    const cta=$(mobile?'mobileBookBtn':'bookNowBtn');
    if(cta)setTimeout(()=>{try{cta.focus({preventScroll:true})}catch{}},280);
  }
  let quoteSeq=0;
  function resetQuote(){
    quoteSeq+=1;
    currentQuote=null;$('quoteBreakdown').classList.remove('show');$('quoteError').hidden=true;$('bookPrice').innerHTML='<span class="price-main">Add dates for prices</span>';$('mobilePrice').innerHTML='<strong>Add dates</strong><span>See total price</span>';$('bookNowBtn').disabled=false;if($('mobileBookBtn'))$('mobileBookBtn').disabled=false;paintPrimaryCtas()
  }
  function selectDate(date,isBlocked){
    if(!selectedStart||selectedEnd||date<=selectedStart){if(isBlocked)return;selectedStart=date;selectedEnd='';resetQuote()}
    else{const nights=eachDate(selectedStart,date);if(nights.some(d=>blocked.has(d))){if(!isBlocked){selectedStart=date;selectedEnd='';resetQuote()}return}else{selectedEnd=date}}
    updateSelectors();renderPicker();
    if(selectedStart&&selectedEnd)completeDatePick();
  }
  function completeDatePick(){
    guardBackdrop();
    calendarModal.classList.remove('show');
    if(calendarReturnTo==='checkout'){
      document.body.classList.add('modal-open');
      Promise.resolve(loadQuote()).finally(()=>openBooking({step:'price'}));
      return;
    }
    document.body.classList.remove('modal-open');
    revealBookingStep();
    Promise.resolve(loadQuote()).finally(()=>revealBookingStep());
  }
  function openCalendar(from){
    guardBackdrop();
    calendarReturnTo=from||(selectedStart&&selectedEnd?'card':'listing');
    const title=$('calendarTitle');
    if(title)title.textContent='Select dates';
    if(selectedStart){const d=toUtc(selectedStart);pickerCursor=new Date(d.getUTCFullYear(),d.getUTCMonth(),1)}
    renderPicker();calendarModal.classList.add('show');document.body.classList.add('modal-open');
  }
  function backFromCalendar(){
    calendarModal.classList.remove('show');
    if(calendarReturnTo==='checkout'&&selectedStart&&selectedEnd){openBooking({step:'price'});return}
    document.body.classList.remove('modal-open');
    if(selectedStart&&selectedEnd)revealBookingStep();
  }
  function closeCalendar(){backFromCalendar()}
  document.querySelectorAll('[data-open-calendar]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();openCalendar($('bookingModal')?.classList.contains('show')?'checkout':(selectedStart&&selectedEnd?'card':'listing'))});
  $('calendarClose').onclick=backFromCalendar;
  $('calendarBack')?.addEventListener('click',backFromCalendar);
  $('calPrev').onclick=()=>{pickerCursor=new Date(pickerCursor.getFullYear(),pickerCursor.getMonth()-1,1);renderPicker()};
  $('calNext').onclick=()=>{pickerCursor=new Date(pickerCursor.getFullYear(),pickerCursor.getMonth()+1,1);renderPicker()};
  calendarModal.addEventListener('pointerdown',e=>{if(e.target!==calendarModal||shouldIgnoreBackdrop())return;closeCalendar()});
  function sourceChannel(s){
    if(s&&s.channel)return String(s.channel).toLowerCase();
    const hay=`${s&&s.name||''} ${s&&s.label||''} ${s&&s.hostHint||''}`.toLowerCase();
    const compact=hay.replace(/[\s_-]+/g,'');
    if(hay.includes('airbnb')||compact.includes('airbnb'))return 'airbnb';
    if(hay.includes('vrbo')||hay.includes('homeaway')||compact.includes('vrbo'))return 'vrbo';
    if(hay.includes('booking'))return 'booking.com';
    return '';
  }
  function summarizeHealth(sources){
    const degraded=[],satisfied=[];
    for(const ch of ['airbnb','vrbo','booking.com']){
      const matches=(sources||[]).filter(s=>sourceChannel(s)===ch);
      if(!matches.length)continue;
      if(matches.some(s=>s.ok!==false))satisfied.push(ch);else degraded.push(ch);
    }
    return {ok:!degraded.length,degraded,satisfied};
  }
  function applyCalendarStatus(health, fetchFailed){
    const el=$('calendarHealth');
    calendarHealthy=!!(health&&health.ok)&&!fetchFailed;
    el.classList.toggle('is-degraded',!calendarHealthy);
    if(fetchFailed){el.textContent='Live calendars could not refresh. Open nights stay selectable.';return}
    if(health&&health.degraded&&health.degraded.length){el.textContent=`Some calendars need a refresh (${health.degraded.join(', ')}). Open nights stay selectable.`;return}
    el.textContent=(health&&health.message)||'Availability synced from connected calendars.';
  }
  async function refreshAvailability(){
    $('calendarHealth').textContent='Checking live availability…';calendarHealthy=false;$('calendarHealth').classList.remove('is-degraded');
    try{
      const u=new URL('/api/calendar',location.origin);u.searchParams.set('_',String(Date.now()));
      const r=await fetch(u,{cache:'no-store'});
      const d=await r.json().catch(()=>({}));
      if(Array.isArray(d.blockedDates))blocked=new Set(d.blockedDates);
      const health=d.health&&Array.isArray(d.health.degraded)?d.health:summarizeHealth(d.sources||[]);
      applyCalendarStatus(health,!r.ok);
      renderPicker();
    }catch{
      applyCalendarStatus({ok:false,degraded:[]},true);
      renderPicker();
    }
  }
  refreshAvailability();

  const MAX_GUESTS=14;
  const guestPopover=$('guestPopover');
  function guestSplitLabel(){
    const bits=[`${adults} adult${adults===1?'':'s'}`];
    if(children)bits.push(`${children} ${children===1?'child':'children'}`);
    return bits.join(', ');
  }
  function paintGuestControls(){
    guests=Math.max(1,Math.min(MAX_GUESTS,adults+children));
    if($('adultCount'))$('adultCount').textContent=String(adults);
    if($('childCount'))$('childCount').textContent=String(children);
    if($('adultMinus'))$('adultMinus').disabled=adults<=1;
    if($('childMinus'))$('childMinus').disabled=children<=0;
    if($('adultPlus'))$('adultPlus').disabled=adults+children>=MAX_GUESTS;
    if($('childPlus'))$('childPlus').disabled=adults+children>=MAX_GUESTS;
    if($('formGuests'))$('formGuests').value=String(guests);
    updateSelectors();
  }
  function placeGuestPopover(){
    if(!guestPopover)return;
    const trigger=$('guestTrigger');
    if(!trigger)return;
    const r=trigger.getBoundingClientRect();
    const width=Math.max(r.width,280);
    const left=Math.min(Math.max(12,r.left),Math.max(12,window.innerWidth-width-12));
    guestPopover.style.width=`${width}px`;
    guestPopover.style.left=`${left}px`;
    guestPopover.style.top=`${Math.min(r.bottom+8,window.innerHeight-guestPopover.offsetHeight-12)}px`;
  }
  function closeGuestPopover(){
    if(!guestPopover)return;
    guestPopover.hidden=true;
    guestPopover.classList.remove('show');
    document.body.classList.remove('guest-popover-open');
    $('guestTrigger')?.setAttribute('aria-expanded','false');
  }
  function openGuestPopover(){
    if(!guestPopover)return;
    guestPopover.hidden=false;
    guestPopover.classList.add('show');
    document.body.classList.add('guest-popover-open');
    $('guestTrigger')?.setAttribute('aria-expanded','true');
    placeGuestPopover();
    syncSupportChat();
  }
  function setOccupancy(nextAdults,nextChildren){
    let a=Math.max(1,Number(nextAdults)||1);
    let c=Math.max(0,Number(nextChildren)||0);
    if(a+c>MAX_GUESTS)c=Math.max(0,MAX_GUESTS-a);
    if(a+c>MAX_GUESTS)a=MAX_GUESTS;
    adults=a;children=c;
    paintGuestControls();
    if($('bookingModal')?.classList.contains('show')){
      paintBookingSummary();
      paintPriceStep();
      if($('reviewStep')&&!$('reviewStep').hidden)paintReview(collectGuestFields());
    }
    resetQuote();
    if(selectedStart&&selectedEnd)loadQuote();
  }
  $('guestTrigger')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();guestPopover?.classList.contains('show')?closeGuestPopover():openGuestPopover()});
  $('adultMinus')?.addEventListener('click',e=>{e.stopPropagation();setOccupancy(adults-1,children)});
  $('adultPlus')?.addEventListener('click',e=>{e.stopPropagation();setOccupancy(adults+1,children)});
  $('childMinus')?.addEventListener('click',e=>{e.stopPropagation();setOccupancy(adults,children-1)});
  $('childPlus')?.addEventListener('click',e=>{e.stopPropagation();setOccupancy(adults,children+1)});
  $('guestDone')?.addEventListener('click',e=>{e.stopPropagation();closeGuestPopover()});
  document.addEventListener('click',e=>{if(guestPopover?.classList.contains('show')&&!guestPopover.contains(e.target)&&!e.target.closest('[data-open-guests]'))closeGuestPopover()});
  window.addEventListener('resize',()=>{if(guestPopover?.classList.contains('show'))placeGuestPopover()});
  paintGuestControls();

  function renderQuote(q){
    currentQuote=q;const total=money(q.total),nightLabel=`${q.nights} night${q.nights===1?'':'s'}`;$('bookPrice').innerHTML=`<span class="price-main">${total}</span> <span class="price-note">total · ${nightLabel}</span>`;$('mobilePrice').innerHTML=`<strong>${total}</strong><span>${nightLabel} · total</span>`;
    $('quoteLodging').textContent=money(q.lodgingSubtotal);$('quoteCleaning').textContent=money(q.cleaningFee);$('quoteTax').textContent=money(q.taxes);$('quoteTotal').textContent=total;$('quoteBreakdown').classList.add('show');$('quoteError').hidden=true;
    const p=q.paymentSchedule||{};
    if(p.mode==='split')$('paymentCopy').innerHTML=`${money(p.dueAtBooking)} due first · remaining ${money(p.remainingBalance)} later. You won’t be charged yet.`;
    else $('paymentCopy').innerHTML=`${total} due when you complete booking. You won’t be charged yet.`;
    paintPrimaryCtas();
    if($('bookingModal')?.classList.contains('show')){
      paintBookingSummary();
      paintPriceStep();
      if($('reviewStep')&&!$('reviewStep').hidden)paintReview(collectGuestFields());
    }
  }
  async function loadQuote(){
    if(!selectedStart||!selectedEnd)return resetQuote();
    const seq=++quoteSeq;
    $('bookPrice').innerHTML='<span class="price-main">Checking price…</span>';
    $('mobilePrice').innerHTML='<strong>Updating price…</strong><span>New dates selected</span>';
    $('bookNowBtn').disabled=true;if($('mobileBookBtn'))$('mobileBookBtn').disabled=true;
    $('quoteError').hidden=true;
    try{
      const u=new URL('/api/quote',location.origin);
      u.searchParams.set('checkin',selectedStart);
      u.searchParams.set('checkout',selectedEnd);
      u.searchParams.set('guests',String(guests));
      u.searchParams.set('_',String(Date.now()));
      const r=await fetch(u,{cache:'no-store'}),d=await r.json();
      if(seq!==quoteSeq)return;
      if(!r.ok)throw new Error(d.message||'Price is unavailable for those dates.');
      renderQuote(d.quote);
    }catch(e){
      if(seq!==quoteSeq)return;
      currentQuote=null;$('quoteBreakdown').classList.remove('show');$('quoteError').hidden=false;$('quoteError').textContent=e.message;$('bookPrice').innerHTML='<span class="price-main">Choose available dates</span>';$('mobilePrice').innerHTML='<strong>Choose dates</strong><span>Price unavailable</span>';paintPrimaryCtas();
    }finally{
      if(seq===quoteSeq){$('bookNowBtn').disabled=false;if($('mobileBookBtn'))$('mobileBookBtn').disabled=false}
    }
  }
  $('refreshQuote').onclick=loadQuote;

  const bookingModal=$('bookingModal'),bookingForm=$('bookingForm');
  const sideColumn=document.querySelector('.side-column');
  function paintCheckoutPhoto(){
    const img=$('checkoutPhoto');
    if(!img)return;
    const src=assetManifest?.openingPhotos?.[0]?.publicPath||photos[0]?.publicPath||'';
    if(src){img.src=src;img.hidden=false}else img.hidden=true;
  }
  function paintBookingSummary(){
    const nights=currentQuote?`${currentQuote.nights} night${currentQuote.nights===1?'':'s'} · ${money(currentQuote.total)} total`:'Dates selected';
    const summary=$('bookingSummary');
    if(summary)summary.innerHTML=`<strong>${fmt(selectedStart)} – ${fmt(selectedEnd)} · ${guestSplitLabel()}</strong><span>${nights}</span>`;
  }
  function paintPriceStep(){
    const nightCount=currentQuote?currentQuote.nights:eachDate(selectedStart,selectedEnd).length;
    setText('priceDates',`${fmt(selectedStart)} – ${fmt(selectedEnd)}`);
    setText('priceNights',`${nightCount} night${nightCount===1?'':'s'}`);
    setText('priceGuests',guestSplitLabel());
    setText('priceTotal',currentQuote?money(currentQuote.total):'—');
    setText('priceLodging',currentQuote?money(currentQuote.lodgingSubtotal):'—');
    setText('priceCleaning',currentQuote?money(currentQuote.cleaningFee):'—');
    setText('priceTax',currentQuote?money(currentQuote.taxes):'—');
    setText('priceGrand',currentQuote?money(currentQuote.total):'—');
    const p=currentQuote?.paymentSchedule||{};
    const schedule=$('priceSchedule');
    if(schedule){
      if(p.mode==='split')schedule.textContent=`${money(p.dueAtBooking)} due first; remaining ${money(p.remainingBalance)} later. You won’t be charged yet.`;
      else schedule.textContent='Total due when you complete booking. You won’t be charged yet.';
    }
  }
  function keepBrowsing(){
    bookingModal.classList.remove('show');
    calendarModal.classList.remove('show');
    document.body.classList.remove('modal-open');
    document.body.classList.add('booking-step-collapsed');
    document.body.classList.remove('has-trip-dates');
    const card=$('bookingCard');
    if(card)card.classList.remove('is-next-step');
    if(sideColumn)sideColumn.style.overflow='';
    syncRequestChrome();
    const bar=document.querySelector('.mobile-bookbar');
    if(bar)try{bar.scrollIntoView({behavior:'smooth',block:'end'})}catch{}
  }
  function syncRequestChrome(){
    const open=!!bookingModal?.classList.contains('show');
    document.body.classList.toggle('request-open',open);
    document.body.classList.toggle('request-review-open',open&&requestStep==='review');
    document.body.classList.toggle('request-done-open',open&&requestStep==='done');
    syncSupportChat();
  }
  function showRequestStep(step){
    requestStep=['price','info','review','done'].includes(step)?step:'price';
    const priceStep=$('priceStep'),guestStep=$('guestDetailsStep'),reviewStep=$('reviewStep'),doneStep=$('requestDoneStep'),summary=$('bookingSummary');
    if(priceStep)priceStep.hidden=requestStep!=='price';
    if(guestStep)guestStep.hidden=requestStep!=='info';
    if(reviewStep)reviewStep.hidden=requestStep!=='review';
    if(doneStep)doneStep.hidden=requestStep!=='done';
    if(summary)summary.hidden=requestStep==='done';
    document.querySelectorAll('.checkout-progress [data-progress]').forEach(el=>{
      el.classList.toggle('is-current',el.dataset.progress===requestStep);
      const order=['price','info','review','done'];
      el.classList.toggle('is-done',order.indexOf(el.dataset.progress)<order.indexOf(requestStep));
    });
    const kicker=$('bookingStepKicker'),title=$('bookingStepTitle'),back=$('bookingBack');
    const copy={
      price:{kicker:'Stay · Price',title:'Review the price'},
      info:{kicker:'Your info',title:'Your information'},
      review:{kicker:'Review',title:'Review and reserve'},
      done:{kicker:'Reserved',title:'Reservation received'}
    }[requestStep];
    if(kicker)kicker.textContent=copy.kicker;
    if(title)title.textContent=copy.title;
    if(back)back.hidden=requestStep==='done';
    const agree=$('requestAgree');
    if(agree)agree.required=requestStep==='review';
    const name=$('guestName'),email=$('guestEmail'),phone=$('guestPhone');
    [name,email,phone].forEach(el=>{if(el)el.required=requestStep==='info'||requestStep==='review'});
    syncRequestChrome();
  }
  function collectGuestFields(){
    const f=new FormData(bookingForm);
    paintGuestControls();
    return {
      name:String(f.get('name')||'').trim(),
      email:String(f.get('email')||'').trim(),
      phone:String(f.get('phone')||'').trim(),
      trip_type:String(f.get('trip_type')||''),
      pets:String(f.get('pets')||'no'),
      event:String(f.get('event')||'no'),
      message:String(f.get('message')||'').trim(),
      guests,
      adults,
      children
    };
  }
  function setText(id,value){const el=$(id);if(el)el.textContent=value}
  function paintReview(details){
    const pet=details.pets==='yes'?'Yes — please review':'No';
    const party=details.event==='yes'?'Yes — please review':'No';
    const nightCount=currentQuote?currentQuote.nights:eachDate(selectedStart,selectedEnd).length;
    setText('reviewDates',`${fmt(selectedStart)} – ${fmt(selectedEnd)}`);
    setText('reviewNights',`${nightCount} night${nightCount===1?'':'s'}`);
    setText('reviewGuests',guestSplitLabel());
    setText('reviewTotal',currentQuote?money(currentQuote.total):'—');
    setText('reviewName',details.name||'—');
    setText('reviewEmail',details.email||'—');
    setText('reviewPhone',details.phone||'—');
    setText('reviewTripType',details.trip_type||'—');
    setText('reviewPets',pet);
    setText('reviewEvent',party);
    const note=details.message||'';
    setText('reviewMessage',note);
    const noteRow=$('reviewMessageRow');
    if(noteRow)noteRow.hidden=!note;
  }
  function fmtHoldUntil(value){
    if(!value)return '';
    const d=new Date(value);
    if(Number.isNaN(d.getTime()))return '';
    return d.toLocaleString('en-US',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  }
  function paintDone(details,reservation){
    const pet=details.pets==='yes'?'Yes — please review':'No';
    const party=details.event==='yes'?'Yes — please review':'No';
    const nightCount=currentQuote?currentQuote.nights:eachDate(selectedStart,selectedEnd).length;
    setText('doneRef',(reservation&&reservation.id)||'—');
    setText('doneDates',`${fmt(selectedStart)} – ${fmt(selectedEnd)}`);
    setText('doneNights',`${nightCount} night${nightCount===1?'':'s'}`);
    setText('doneGuests',guestSplitLabel());
    setText('doneTotal',currentQuote?money(currentQuote.total):'—');
    setText('doneName',details.name||'—');
    setText('doneEmail',details.email||'—');
    setText('donePhone',details.phone||'—');
    setText('doneTripType',details.trip_type||'—');
    setText('donePets',pet);
    setText('doneEvent',party);
    const note=details.message||'';
    setText('doneMessage',note);
    const noteRow=$('doneMessageRow');
    if(noteRow)noteRow.hidden=!note;
    const holdText=fmtHoldUntil(reservation&&reservation.hold_expires_at);
    const holdRow=$('doneHoldRow');
    if(holdRow){
      holdRow.hidden=!holdText;
      setText('doneHoldUntil',holdText||'—');
    }
    showRequestStep('done');
  }
  function openBooking(opts){
    closeGuestPopover();
    if(!selectedStart||!selectedEnd){openCalendar('listing');return}
    if(!currentQuote){loadQuote();return}
    const step=(opts&&opts.step)||'price';
    paintGuestControls();
    paintCheckoutPhoto();
    paintBookingSummary();
    paintPriceStep();
    showRequestStep(step);
    bookingModal.classList.add('show');
    document.body.classList.add('modal-open');
    syncRequestChrome();
  }
  function closeBooking(){bookingModal.classList.remove('show');document.body.classList.remove('modal-open');syncRequestChrome();if(selectedStart&&selectedEnd)revealBookingStep()}
  function backFromBooking(){
    if(requestStep==='done'){keepBrowsing();return}
    if(requestStep==='review'){showRequestStep('info');return}
    if(requestStep==='info'){showRequestStep('price');return}
    bookingModal.classList.remove('show');
    document.body.classList.remove('modal-open');
    syncRequestChrome();
    if(selectedStart&&selectedEnd)revealBookingStep();
  }
  $('bookNowBtn').onclick=()=>openBooking({step:'price'});
  $('mobileBookBtn').onclick=()=>openBooking({step:'price'});
  $('bookingClose').onclick=closeBooking;
  $('bookingBack')?.addEventListener('click',backFromBooking);
  bookingModal.addEventListener('click',e=>{if(e.target===bookingModal)closeBooking()});
  $('dismissBookingStep')?.addEventListener('click',keepBrowsing);
  $('doneBrowse')?.addEventListener('click',keepBrowsing);
  $('continueToInfo')?.addEventListener('click',()=>{paintPriceStep();showRequestStep('info')});
  $('continueToReview')?.addEventListener('click',()=>{
    if(!bookingForm.reportValidity())return;
    const details=collectGuestFields();
    paintBookingSummary();
    paintReview(details);
    showRequestStep('review');
  });
  bookingForm.addEventListener('submit',async e=>{
    e.preventDefault();if(!currentQuote||!selectedStart||!selectedEnd)return;
    if(requestStep==='price'){showRequestStep('info');return}
    if(requestStep!=='review'){if(bookingForm.reportValidity()){paintReview(collectGuestFields());showRequestStep('review')}return}
    const btn=$('bookingSubmit'),msg=$('bookingMessage'),details=collectGuestFields();
    btn.disabled=true;btn.textContent='Reserving…';btn.setAttribute('aria-busy','true');msg.className='form-message';msg.textContent='';
    const payload={name:details.name,email:details.email,phone:details.phone,checkin:selectedStart,checkout:selectedEnd,guests:String(guests),adults:String(adults),children:String(children),message:details.message,pets:details.pets,event:details.event,trip_type:details.trip_type};
    try{const r=await fetch('/api/inquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),d=await r.json();if(!r.ok)throw new Error(d.message||'We could not complete this reservation right now.');(d.blockedDates||[]).forEach(date=>blocked.add(date));renderPicker();paintDone(details,d.reservation||{});const back=$('bookingBack');if(back)back.hidden=true;await refreshAvailability()}catch(err){msg.className='form-message error show';msg.textContent=err.message}finally{btn.disabled=false;btn.removeAttribute('aria-busy');if(requestStep!=='done')btn.textContent=CTA_RESERVE}});

  $('amenitiesBtn').onclick=()=>{$('amenitiesModal').classList.add('show');document.body.classList.add('modal-open')};$('amenitiesClose').onclick=()=>{$('amenitiesModal').classList.remove('show');document.body.classList.remove('modal-open')};$('amenitiesModal').addEventListener('click',e=>{if(e.target===$('amenitiesModal'))$('amenitiesClose').click()});

  window.addEventListener('message',e=>{if(e.origin!==location.origin||e.data?.type!=='cjt-reviews-height')return;const frame=$('houfyReviews');if(frame&&Number(e.data.height)>200)frame.style.height=`${Math.min(2200,Number(e.data.height)+12)}px`});
  document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(guestPopover?.classList.contains('show')){closeGuestPopover();return}if(calendarModal.classList.contains('show'))backFromCalendar();else if(bookingModal.classList.contains('show'))backFromBooking();else if($('amenitiesModal').classList.contains('show'))$('amenitiesClose').click()});
  function syncSupportChat(){
    const api=window.Tawk_API;
    if(!api)return;
    const hide=document.body.classList.contains('modal-open')||document.body.classList.contains('has-trip-dates')||document.body.classList.contains('guest-popover-open')||document.body.classList.contains('request-open')||document.body.classList.contains('request-review-open')||document.body.classList.contains('request-done-open');
    try{
      if(hide&&typeof api.hideWidget==='function')api.hideWidget();
      else if(!hide&&typeof api.showWidget==='function')api.showWidget();
    }catch{}
  }
  new MutationObserver(syncSupportChat).observe(document.body,{attributes:true,attributeFilter:['class']});
  window.Tawk_API=window.Tawk_API||{};
  const prevTawkLoad=window.Tawk_API.onLoad;
  window.Tawk_API.onLoad=function(){if(typeof prevTawkLoad==='function')prevTawkLoad();syncSupportChat()};
  hydrateMobileSourceSummaries();hydrateAmenitiesModal();updateSelectors();resetQuote();renderGallery();loadAssetManifest();
})();
