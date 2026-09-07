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
    const target=$('amenitiesModalGrid');
    if(target&&!target.children.length){
      const source=document.querySelector('#amenities [data-amenities-source], .amenity-directory:not(#amenitiesModalGrid)');
      if(source)[...source.children].forEach(column=>target.appendChild(column.cloneNode(true)));
    }
    const btn=$('amenitiesBtn'),count=target?target.querySelectorAll('li').length:0;
    if(btn&&count)btn.textContent=`Show all ${count} amenities`;
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
  function roomSleepLine(room){
    if(room.detail)return String(room.detail);
    if(room.beds)return room.sleeps?`${room.beds} · Sleeps ${room.sleeps}`:String(room.beds);
    return `${room.photos.length} room photo${room.photos.length===1?'':'s'}`;
  }
  function roomGallerySubtitle(room){
    const line=roomSleepLine(room);
    const photos=`${room.photos.length} photo${room.photos.length===1?'':'s'}`;
    return line?`${line} · ${photos}`:photos;
  }
  function renderRooms(){
    const scroll=$('sleepingScroll'),modal=$('roomGalleryModal'),grid=$('roomGalleryGrid');if(!scroll||!modal||!grid||!assetManifest)return;
    // Room cards have one source: manifest roomGroups, rendered into the empty mount.
    if(scroll.children.length)return;
    const title=$('roomGalleryTitle'),subtitle=$('roomGallerySubtitle');
    const openRoom=room=>{title.textContent=room.name;subtitle.textContent=roomGallerySubtitle(room);grid.innerHTML='';room.photos.forEach((photo,i)=>{const b=document.createElement('button');b.type='button';b.innerHTML=`<img src="${photo.publicPath}" alt="${esc(room.name)} photo ${i+1}">`;const img=b.querySelector('img');if(img)img.onerror=()=>{img.remove();b.classList.add('photo-fallback')};grid.appendChild(b)});modal.classList.add('show');document.body.classList.add('modal-open')};
    assetManifest.roomGroups.forEach((room,index)=>{const card=document.createElement('button');card.type='button';card.className='sleep-card room-card';card.dataset.roomIndex=String(index);const cover=room.photos[0];const bedLine=roomSleepLine(room);card.innerHTML=`<div class="room-visual"><img src="${cover.publicPath}" alt="${esc(room.name)}"><span class="room-photo-count">${room.photos.length} photo${room.photos.length===1?'':'s'}</span></div><div class="room-card-copy"><strong>${esc(room.name)}</strong><span class="room-beds">${esc(bedLine)}</span><span class="room-link">View room →</span></div>`;const visual=card.querySelector('.room-visual'),img=card.querySelector('img');if(img&&visual)img.onerror=()=>{img.remove();visual.classList.add('photo-fallback');visual.setAttribute('aria-label',`${room.name} photo unavailable`)};card.onclick=()=>openRoom(room);scroll.appendChild(card)});
    $('roomGalleryClose')?.addEventListener('click',()=>{modal.classList.remove('show');document.body.classList.remove('modal-open')});modal.addEventListener('click',e=>{if(e.target===modal)$('roomGalleryClose')?.click()});$('roomPrev')?.addEventListener('click',()=>scroll.scrollBy({left:-330,behavior:'smooth'}));$('roomNext')?.addEventListener('click',()=>scroll.scrollBy({left:330,behavior:'smooth'}));
  }
  async function loadAssetManifest(){try{const response=await fetch(assetManifestUrl,{cache:'no-store'});if(!response.ok)throw new Error('image_manifest_unavailable');assetManifest=await response.json();photos=assetManifest.galleryPhotos||[];renderMosaic();renderRooms();renderGallery()}catch(error){console.error('Public image manifest failed to load',error)}}
  $('shareBtn').onclick=async()=>{const data={title:'Sand & Sea Manor',text:'Sand & Sea Manor in Galveston — direct booking',url:location.href};try{if(navigator.share)await navigator.share(data);else{await navigator.clipboard.writeText(location.href);$('shareLabel').textContent='Copied';setTimeout(()=>$('shareLabel').textContent='Share',1600)}}catch{}};
  const saved=localStorage.getItem('cjt_sand_sea_saved')==='1';
  function paintSave(on){$('saveBtn').dataset.saved=on?'1':'0';$('saveLabel').textContent=on?'Saved':'Save';$('saveHeart').setAttribute('fill',on?'currentColor':'none')}
  paintSave(saved);$('saveBtn').onclick=()=>{const next=$('saveBtn').dataset.saved!=='1';localStorage.setItem('cjt_sand_sea_saved',next?'1':'0');paintSave(next)};

  const HOLD_MESSAGE='Your dates are reserved while CJT reviews your request and remain unavailable until an owner releases them.';
  const MAX_GUESTS=14;
  const AVAILABILITY_UNKNOWN='Live availability is temporarily unavailable. Dates cannot be requested until calendars are verified.';
  const CTA_CHECK='Check dates';
  const CTA_QUOTE='See quote';
  const CTA_REQUEST='Request to Book';
  const LISTING_CHARGE_NOTE="You won't be charged yet. Requesting these dates reserves them until CJT reviews or an owner releases them.";
  const clampGuests=v=>{const n=Number(v);return Number.isInteger(n)?Math.max(1,Math.min(MAX_GUESTS,n)):1};
  const guestsLabel=n=>`${clampGuests(n)} guest${clampGuests(n)===1?'':'s'}`;
  const listingCta=({hasDates,hasQuote,calendarHealthy})=>calendarHealthy===false||!hasDates?CTA_CHECK:(hasQuote?CTA_REQUEST:CTA_QUOTE);
  const failClosedCopy=(body,fallback)=>{const msg=body&&typeof body.message==='string'?body.message.trim():'';return msg||fallback||AVAILABILITY_UNKNOWN};
  const TRIP_TYPES=['Leisure','Family','Business','Other'];
  const DETAILS_MAX=1000;
  const optionalYesNo=value=>{
    const key=String(value==null?'':value).trim().toLowerCase();
    if(key==='yes'||key==='true')return true;
    if(key==='no'||key==='false')return false;
    return null;
  };
  const inquiryPayload=({name,email,phone,message,checkin,checkout,guests,trip_type,bringing_pet,pet_details,planning_event,event_details})=>{
    const payload={name:String(name||'').trim(),email:String(email||'').trim(),phone:String(phone||'').trim(),message:String(message||'').trim(),checkin:String(checkin||'').trim(),checkout:String(checkout||'').trim(),guests:String(clampGuests(guests))};
    const trip=String(trip_type||'').trim();
    if(TRIP_TYPES.includes(trip))payload.trip_type=trip;
    if(bringing_pet===true||bringing_pet===false){
      payload.bringing_pet=bringing_pet;
      if(bringing_pet===true){
        const details=String(pet_details||'').trim().slice(0,DETAILS_MAX);
        if(details)payload.pet_details=details;
      }
    }
    if(planning_event===true||planning_event===false){
      payload.planning_event=planning_event;
      if(planning_event===true){
        const details=String(event_details||'').trim().slice(0,DETAILS_MAX);
        if(details)payload.event_details=details;
      }
    }
    return payload;
  };
  const successCopy=({replayed,reservationId,serverMessage})=>{
    const hold=(serverMessage&&String(serverMessage).trim())||HOLD_MESSAGE,reference=reservationId?String(reservationId):'';
    return replayed
      ?{title:'Request already received',hold,reference,next:'CJT Realty already has this request. Your dates remain reserved until an owner releases them. Agreement and payment steps are owner-controlled.',isReplay:true}
      :{title:'Reservation received',hold,reference,next:'CJT Realty will review your request. Agreement and payment steps are owner-controlled and come next only if they accept.',isReplay:false};
  };
  let blocked=new Set(),calendarHealthy=false,selectedStart='',selectedEnd='',guests=1,currentQuote=null,quoteSeq=0,requestStep='info';
  let pickerCursor=new Date();pickerCursor=new Date(pickerCursor.getFullYear(),pickerCursor.getMonth(),1);
  const calendarModal=$('calendarModal');
  function canCheckoutOn(date){return selectedStart&&!selectedEnd&&date>selectedStart&&!eachDate(selectedStart,date).some(d=>blocked.has(d))}
  function renderMonth(target,date,secondary=false){
    target.innerHTML='';const title=document.createElement('h3');title.textContent=date.toLocaleDateString('en-US',{month:'long',year:'numeric'});target.appendChild(title);
    const grid=document.createElement('div');grid.className='calendar-grid';['S','M','T','W','T','F','S'].forEach(x=>{const d=document.createElement('div');d.className='dow';d.textContent=x;grid.appendChild(d)});
    const y=date.getFullYear(),m=date.getMonth(),first=new Date(y,m,1).getDay(),days=new Date(y,m+1,0).getDate(),today=isoToday();
    for(let i=0;i<first;i++){const x=document.createElement('div');grid.appendChild(x)}
    for(let day=1;day<=days;day++){
      const k=`${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`,past=k<today,isBlocked=blocked.has(k),checkoutOption=isBlocked&&canCheckoutOn(k),b=document.createElement('button');
      b.type='button';b.className='day';b.textContent=day;if(selectedStart===k||selectedEnd===k)b.classList.add('selected');else if(selectedStart&&selectedEnd&&k>selectedStart&&k<selectedEnd)b.classList.add('range');
      b.disabled=!calendarHealthy||past||(isBlocked&&!checkoutOption);b.title=isBlocked&&!checkoutOption?'Unavailable':'';if(!b.disabled)b.onclick=()=>selectDate(k,isBlocked);grid.appendChild(b)
    }
    target.appendChild(grid);target.classList.toggle('secondary',secondary);
  }
  function renderPicker(){
    renderMonth($('calendarMonth1'),pickerCursor,false);
    renderMonth($('calendarMonth2'),new Date(pickerCursor.getFullYear(),pickerCursor.getMonth()+1,1),true);
    const nights=eachDate(selectedStart,selectedEnd).length;
    $('calendarSelection').textContent=selectedStart?(selectedEnd?`${fmt(selectedStart)} – ${fmt(selectedEnd)} · ${nights} night${nights===1?'':'s'}`:`${fmt(selectedStart)} — choose checkout`):'Choose check-in and check-out dates';
  }
  function updateSelectors(){
    const inText=selectedStart?fmt(selectedStart).replace(/, \d{4}/,''):'Add date',outText=selectedEnd?fmt(selectedEnd).replace(/, \d{4}/,''):'Add date';
    document.querySelectorAll('[data-checkin-value]').forEach(el=>el.textContent=inText);
    document.querySelectorAll('[data-checkout-value]').forEach(el=>el.textContent=outText);
    document.querySelectorAll('[data-guests-value]').forEach(el=>el.textContent=guestsLabel(guests));
    paintListingSteps();
  }
  function paintListingSteps(){
    const hasDates=!!(selectedStart&&selectedEnd);
    const hasQuote=!!currentQuote;
    const map={dates:hasDates,guests:true,quote:hasQuote,request:false};
    document.querySelectorAll('[data-listing-step]').forEach(el=>{
      const key=el.dataset.listingStep;
      el.classList.toggle('is-done',!!map[key]);
      el.classList.toggle('is-current',(key==='dates'&&!hasDates)||(key==='quote'&&hasDates&&!hasQuote)||(key==='request'&&hasDates&&hasQuote));
    });
  }
  function paintPrimaryCtas(){
    const label=listingCta({hasDates:!!(selectedStart&&selectedEnd),hasQuote:!!currentQuote,calendarHealthy});
    [$('bookNowBtn'),$('mobileBookBtn')].forEach(btn=>{if(!btn)return;btn.textContent=label;btn.disabled=!calendarHealthy&&label!==CTA_CHECK});
    document.querySelectorAll('.charge-note').forEach(note=>{if(!note.classList.contains('checkout-charge'))note.textContent=LISTING_CHARGE_NOTE});
    paintListingSteps();
  }
  function setListingHealth(message,failClosed){
    const el=$('listingHealth');
    if(!el)return;
    if(!message){el.hidden=true;el.textContent='';el.classList.remove('is-fail-closed');return}
    el.hidden=false;el.textContent=message;el.classList.toggle('is-fail-closed',!!failClosed);
  }
  function resetQuote(){
    quoteSeq+=1;
    currentQuote=null;
    $('quoteBreakdown').classList.remove('show');
    $('quoteError').hidden=true;
    $('bookPrice').innerHTML='<span class="price-main">Add dates for prices</span>';
    $('mobilePrice').innerHTML='<strong>Add dates</strong><span>See total price</span>';
    $('bookNowBtn').disabled=false;
    if($('mobileBookBtn'))$('mobileBookBtn').disabled=false;
    paintPrimaryCtas();
  }
  function selectDate(date,isBlocked){
    if(!selectedStart||selectedEnd||date<=selectedStart){if(isBlocked)return;selectedStart=date;selectedEnd='';resetQuote()}
    else{const nights=eachDate(selectedStart,date);if(nights.some(d=>blocked.has(d))){if(!isBlocked){selectedStart=date;selectedEnd='';resetQuote()}return}else{selectedEnd=date;resetQuote()}}
    updateSelectors();renderPicker();if(selectedStart&&selectedEnd){setTimeout(closeCalendar,180);loadQuote()}
  }
  function openCalendar(){if(selectedStart){const d=toUtc(selectedStart);pickerCursor=new Date(d.getUTCFullYear(),d.getUTCMonth(),1)}renderPicker();calendarModal.classList.add('show');document.body.classList.add('modal-open')}
  function closeCalendar(){calendarModal.classList.remove('show');document.body.classList.remove('modal-open')}
  document.querySelectorAll('[data-open-calendar]').forEach(b=>b.onclick=openCalendar);$('calendarClose').onclick=closeCalendar;$('calPrev').onclick=()=>{pickerCursor=new Date(pickerCursor.getFullYear(),pickerCursor.getMonth()-1,1);renderPicker()};$('calNext').onclick=()=>{pickerCursor=new Date(pickerCursor.getFullYear(),pickerCursor.getMonth()+1,1);renderPicker()};calendarModal.addEventListener('click',e=>{if(e.target===calendarModal)closeCalendar()});
  function sourceHealthAllowsInventory(httpStatus, body){
    const sh=body&&body.sourceHealth;
    return httpStatus===200 && !!(sh&&sh.ok===true&&sh.failClosed!==true);
  }
  function responseMessage(body, fallback){
    const msg=body&&typeof body.message==='string'?body.message.trim():'';
    return msg||fallback;
  }
  function applyAvailabilityUnknown(body){
    calendarHealthy=false;
    blocked=new Set();
    const msg=failClosedCopy(body);
    const health=$('calendarHealth');
    health.textContent=msg;
    health.classList.add('is-fail-closed');
    setListingHealth(msg,true);
    currentQuote=null;
    $('quoteBreakdown').classList.remove('show');
    paintPrimaryCtas();
    renderPicker();
  }
  function isQuoteFailClosed(httpStatus, body){
    const sh=body&&body.sourceHealth;
    if(httpStatus===503)return true;
    if(sh&&(sh.ok===false||sh.failClosed===true))return true;
    if(httpStatus===200)return !sourceHealthAllowsInventory(httpStatus, body);
    return false;
  }
  async function refreshAvailability(){
    $('calendarHealth').textContent='Checking live availability…';calendarHealthy=false;$('calendarHealth').classList.remove('is-fail-closed');
    try{
      const r=await fetch('/api/calendar',{cache:'no-store'});
      const d=await r.json().catch(()=>({}));
      if(!sourceHealthAllowsInventory(r.status,d)){
        applyAvailabilityUnknown(d);
        return;
      }
      blocked=new Set(d.blockedDates||[]);
      calendarHealthy=true;
      $('calendarHealth').textContent='Availability synced from connected calendars.';
      $('calendarHealth').classList.remove('is-fail-closed');
      setListingHealth('',false);
      renderPicker();
      paintPrimaryCtas();
    }catch{
      applyAvailabilityUnknown(null);
    }
  }
  refreshAvailability();

  function paintGuestStepper(){
    document.querySelectorAll('[data-guest-count]').forEach(el=>el.textContent=guests);
    const count=$('guestCount');
    if(count)count.textContent=guests;
    document.querySelectorAll('[data-guest-minus]').forEach(b=>b.disabled=guests<=1);
    document.querySelectorAll('[data-guest-plus]').forEach(b=>b.disabled=guests>=MAX_GUESTS);
  }
  function updateGuests(next){
    guests=clampGuests(next);
    paintGuestStepper();
    updateSelectors();
    resetQuote();
    if(selectedStart&&selectedEnd)loadQuote();
  }
  document.querySelectorAll('[data-guest-minus]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();updateGuests(guests-1)}));
  document.querySelectorAll('[data-guest-plus]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();updateGuests(guests+1)}));
  updateGuests(1);

  function renderQuote(q){
    currentQuote=q;
    const total=money(q.total),nightLabel=`${q.nights} night${q.nights===1?'':'s'}`;
    $('bookPrice').innerHTML=`<span class="price-main">${total}</span> <span class="price-note">total · ${nightLabel}</span>`;
    $('mobilePrice').innerHTML=`<strong>${total}</strong><span>${nightLabel} · total</span>`;
    $('quoteLodging').textContent=money(q.lodgingSubtotal);
    $('quoteCleaning').textContent=money(q.cleaningFee);
    $('quoteTax').textContent=money(q.taxes);
    $('quoteTotal').textContent=total;
    $('quoteBreakdown').classList.add('show');
    $('quoteError').hidden=true;
    paintPrimaryCtas();
    if($('bookingModal')?.classList.contains('show')&&requestStep==='review')paintReview(collectGuestFields());
  }
  async function loadQuote(){
    if(!selectedStart||!selectedEnd)return resetQuote();
    if(!calendarHealthy){
      $('quoteError').hidden=false;
      $('quoteError').textContent=AVAILABILITY_UNKNOWN;
      paintPrimaryCtas();
      return;
    }
    const seq=++quoteSeq;
    $('bookPrice').innerHTML='<span class="price-main">Checking price…</span>';
    $('mobilePrice').innerHTML='<strong>Updating price…</strong><span>New dates or guests</span>';
    $('bookNowBtn').disabled=true;
    if($('mobileBookBtn'))$('mobileBookBtn').disabled=true;
    try{
      const u=new URL('/api/quote',location.origin);
      u.searchParams.set('checkin',selectedStart);
      u.searchParams.set('checkout',selectedEnd);
      u.searchParams.set('guests',String(guests));
      const r=await fetch(u,{cache:'no-store'}),d=await r.json().catch(()=>({}));
      if(seq!==quoteSeq)return;
      if(isQuoteFailClosed(r.status,d)){
        applyAvailabilityUnknown(d);
        throw new Error(failClosedCopy(d));
      }
      if(!r.ok)throw new Error(responseMessage(d,'Price is unavailable for those dates.'));
      renderQuote(d.quote);
    }catch(e){
      if(seq!==quoteSeq)return;
      currentQuote=null;
      $('quoteBreakdown').classList.remove('show');
      $('quoteError').hidden=false;
      $('quoteError').textContent=e.message;
      $('bookPrice').innerHTML='<span class="price-main">Dates need review</span>';
      paintPrimaryCtas();
    }finally{
      if(seq===quoteSeq){
        $('bookNowBtn').disabled=false;
        if($('mobileBookBtn'))$('mobileBookBtn').disabled=false;
      }
    }
  }
  $('refreshQuote').onclick=loadQuote;

  const bookingModal=$('bookingModal'),bookingForm=$('bookingForm');
  function setText(id,value){const el=$(id);if(el)el.textContent=value}
  function collectGuestFields(){
    const f=new FormData(bookingForm);
    const bringing_pet=optionalYesNo(f.get('bringing_pet'));
    const planning_event=optionalYesNo(f.get('planning_event'));
    const trip=String(f.get('trip_type')||'').trim();
    return {
      name:String(f.get('name')||'').trim(),
      email:String(f.get('email')||'').trim(),
      phone:String(f.get('phone')||'').trim(),
      message:String(f.get('message')||'').trim(),
      trip_type:TRIP_TYPES.includes(trip)?trip:'',
      bringing_pet,
      pet_details:bringing_pet===true?String(f.get('pet_details')||'').trim().slice(0,DETAILS_MAX):'',
      planning_event,
      event_details:planning_event===true?String(f.get('event_details')||'').trim().slice(0,DETAILS_MAX):''
    };
  }
  function choiceInputId(name){return name==='bringing_pet'?'bringingPetValue':'planningEventValue'}
  function detailsWrapId(name){return name==='bringing_pet'?'petDetailsWrap':'eventDetailsWrap'}
  function detailsFieldId(name){return name==='bringing_pet'?'petDetails':'eventDetails'}
  function syncOptionalDetails(name){
    const yes=optionalYesNo($(choiceInputId(name))?.value)===true;
    const wrap=$(detailsWrapId(name));
    const field=$(detailsFieldId(name));
    if(wrap)wrap.hidden=!yes;
    if(field){
      if(!yes){field.value='';field.required=false}
      else field.required=requestStep==='info';
    }
  }
  function setChoiceValue(name,value){
    const input=$(choiceInputId(name));
    if(input)input.value=value||'';
    document.querySelectorAll(`[data-choice="${name}"]`).forEach(btn=>{
      const on=!!value&&btn.dataset.value===value;
      btn.classList.toggle('is-selected',on);
      btn.setAttribute('aria-pressed',on?'true':'false');
    });
    syncOptionalDetails(name);
  }
  function bindChoicePills(){
    document.querySelectorAll('[data-choice]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const name=btn.dataset.choice;
        const next=btn.getAttribute('aria-pressed')==='true'?'':btn.dataset.value;
        setChoiceValue(name,next);
      });
    });
  }
  function paintBookingSummary(){
    const nights=currentQuote?`${currentQuote.nights} night${currentQuote.nights===1?'':'s'} · ${money(currentQuote.total)} total`:(selectedStart&&selectedEnd?'Dates selected':'Add dates');
    const summary=$('bookingSummary');
    if(summary){
      summary.hidden=requestStep==='done';
      summary.innerHTML=`<strong>${fmt(selectedStart)} – ${fmt(selectedEnd)} · ${guestsLabel(guests)}</strong><span>${nights}</span>`;
    }
  }
  function paintReview(details){
    const nightCount=currentQuote?currentQuote.nights:eachDate(selectedStart,selectedEnd).length;
    setText('reviewDates',`${fmt(selectedStart)} – ${fmt(selectedEnd)}`);
    setText('reviewNights',`${nightCount} night${nightCount===1?'':'s'}`);
    setText('reviewGuests',guestsLabel(guests));
    setText('reviewLodging',currentQuote?money(currentQuote.lodgingSubtotal):'—');
    setText('reviewCleaning',currentQuote?money(currentQuote.cleaningFee):'—');
    setText('reviewTax',currentQuote?money(currentQuote.taxes):'—');
    setText('reviewTotal',currentQuote?money(currentQuote.total):'—');
    setText('reviewName',details.name||'—');
    setText('reviewEmail',details.email||'—');
    setText('reviewPhone',details.phone||'—');
    setText('reviewMessage',details.message||'');
    const noteRow=$('reviewMessageRow');
    if(noteRow)noteRow.hidden=!details.message;
    const tripRow=$('reviewTripTypeRow');
    if(tripRow){
      tripRow.hidden=!details.trip_type;
      setText('reviewTripType',details.trip_type||'—');
    }
    const petRow=$('reviewPetRow');
    if(petRow){
      petRow.hidden=details.bringing_pet==null;
      setText('reviewPet',details.bringing_pet===true?(details.pet_details?`Yes — ${details.pet_details}`:'Yes'):details.bringing_pet===false?'No':'—');
    }
    const eventRow=$('reviewEventRow');
    if(eventRow){
      eventRow.hidden=details.planning_event==null;
      setText('reviewEvent',details.planning_event===true?(details.event_details?`Yes — ${details.event_details}`:'Yes'):details.planning_event===false?'No':'—');
    }
    const tripBlock=$('reviewTripBlock');
    if(tripBlock)tripBlock.hidden=!(details.trip_type||details.bringing_pet!=null||details.planning_event!=null);
    const pay=$('reviewPaymentCopy');
    if(pay)pay.innerHTML=`<p class="quote-hold-note">${esc(LISTING_CHARGE_NOTE)}</p>`;
  }
  function showRequestStep(step){
    requestStep=['info','review','done'].includes(step)?step:'info';
    const info=$('guestDetailsStep'),review=$('reviewStep'),done=$('requestDoneStep');
    if(info)info.hidden=requestStep!=='info';
    if(review)review.hidden=requestStep!=='review';
    if(done)done.hidden=requestStep!=='done';
    const order=['dates','guests','quote','info','review','done'];
    document.querySelectorAll('.booking-progress [data-progress]').forEach(el=>{
      el.classList.toggle('is-current',el.dataset.progress===requestStep);
      el.classList.toggle('is-done',order.indexOf(el.dataset.progress)<order.indexOf(requestStep)||['dates','guests','quote'].includes(el.dataset.progress));
    });
    const copy={
      info:{kicker:'Your info',title:'Guest information'},
      review:{kicker:'Review',title:'Review your request'},
      done:{kicker:'Received',title:'Reservation received'}
    }[requestStep];
    if($('bookingStepKicker'))$('bookingStepKicker').textContent=copy.kicker;
    if($('bookingStepTitle'))$('bookingStepTitle').textContent=copy.title;
    if($('bookingBack'))$('bookingBack').hidden=requestStep==='done';
    const name=$('guestName'),email=$('guestEmail'),phone=$('guestPhone'),agree=$('requestAgree');
    [name,email,phone].forEach(el=>{if(el)el.required=requestStep==='info'});
    if(agree)agree.required=requestStep==='review';
    if(requestStep==='info'){
      syncOptionalDetails('bringing_pet');
      syncOptionalDetails('planning_event');
    }else{
      ['petDetails','eventDetails'].forEach(id=>{const el=$(id);if(el)el.required=false});
    }
    paintBookingSummary();
  }
  function paintDone(result){
    const copy=successCopy({
      replayed:!!result.replayed,
      reservationId:result.reservation&&result.reservation.id,
      serverMessage:result.message||HOLD_MESSAGE
    });
    const banner=$('doneReplayBanner');
    if(banner)banner.hidden=!copy.isReplay;
    setText('doneTitle',copy.title);
    setText('doneHold',copy.hold);
    setText('doneRef',copy.reference||'—');
    setText('doneDates',`${fmt(selectedStart)} – ${fmt(selectedEnd)}`);
    setText('doneGuests',guestsLabel(guests));
    setText('doneTotal',currentQuote?money(currentQuote.total):'—');
    setText('doneNext',copy.next);
    if($('bookingStepTitle'))$('bookingStepTitle').textContent=copy.title;
    showRequestStep('done');
  }
  function openBooking(){
    if(!calendarHealthy){openCalendar();return}
    if(!selectedStart||!selectedEnd){openCalendar();return}
    if(!currentQuote){loadQuote();return}
    showRequestStep('info');
    bookingModal.classList.add('show');
    document.body.classList.add('modal-open');
    applyTawkHidden(true);
  }
  function closeBooking(){
    bookingModal.classList.remove('show');
    if(!$('amenitiesModal')?.classList.contains('show')){
      document.body.classList.remove('modal-open');
      applyTawkHidden(false);
    }
  }
  function backFromBooking(){
    if(requestStep==='done'){closeBooking();return}
    if(requestStep==='review'){showRequestStep('info');return}
    closeBooking();
  }
  function guestFieldsValid(){
    syncOptionalDetails('bringing_pet');
    syncOptionalDetails('planning_event');
    const details=collectGuestFields();
    if(!details.name||!details.email.includes('@')||!details.phone){
      if(typeof bookingForm.reportValidity==='function')bookingForm.reportValidity();
      return false;
    }
    if(details.bringing_pet===true&&!details.pet_details){
      const field=$('petDetails');
      if(field){field.required=true;if(typeof field.reportValidity==='function')field.reportValidity()}
      else if(typeof bookingForm.reportValidity==='function')bookingForm.reportValidity();
      return false;
    }
    if(details.planning_event===true&&!details.event_details){
      const field=$('eventDetails');
      if(field){field.required=true;if(typeof field.reportValidity==='function')field.reportValidity()}
      else if(typeof bookingForm.reportValidity==='function')bookingForm.reportValidity();
      return false;
    }
    return true;
  }
  $('bookNowBtn').onclick=openBooking;
  $('mobileBookBtn').onclick=openBooking;
  $('bookingClose').onclick=closeBooking;
  $('bookingBack')?.addEventListener('click',backFromBooking);
  $('doneBrowse')?.addEventListener('click',closeBooking);
  bookingModal.addEventListener('click',e=>{if(e.target===bookingModal&&requestStep!=='done')closeBooking()});
  $('continueToReview')?.addEventListener('click',()=>{
    if(!guestFieldsValid())return;
    paintReview(collectGuestFields());
    showRequestStep('review');
  });
  bookingForm.addEventListener('submit',async e=>{
    e.preventDefault();
    if(!currentQuote||!selectedStart||!selectedEnd)return;
    if(requestStep!=='review'){
      if(guestFieldsValid()){paintReview(collectGuestFields());showRequestStep('review')}
      return;
    }
    const agree=$('requestAgree');
    if(agree&&!agree.checked){
      agree.required=true;
      if(typeof bookingForm.reportValidity==='function')bookingForm.reportValidity();
      return;
    }
    const btn=$('bookingSubmit'),msg=$('bookingMessage'),details=collectGuestFields();
    btn.disabled=true;btn.textContent='Requesting these dates…';msg.className='form-message';msg.textContent='';
    const payload=inquiryPayload({...details,checkin:selectedStart,checkout:selectedEnd,guests});
    try{
      const r=await fetch('/api/inquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.message||'We could not reserve those dates.');
      if(!d.reservation||!d.reservation.id)throw new Error('We could not confirm a booking reference. Please contact CJT Realty.');
      paintDone({replayed:!!d.replayed,reservation:d.reservation,message:d.message||HOLD_MESSAGE});
      await refreshAvailability();
    }catch(err){
      msg.className='form-message error show';
      msg.textContent=err.message;
    }finally{
      btn.disabled=false;
      btn.textContent='Request to Book';
    }
  });

  const amenitiesModal=$('amenitiesModal');
  let amenitiesHistoryOpen=false;
  function applyTawkHidden(hidden){
    try{
      const api=window.Tawk_API;
      if(!api)return;
      if(hidden){
        if(typeof api.minimize==='function')api.minimize();
        if(typeof api.hideWidget==='function')api.hideWidget();
      }else if(typeof api.showWidget==='function')api.showWidget();
    }catch{}
  }
  function hookTawk(){
    window.Tawk_API=window.Tawk_API||{};
    if(window.Tawk_API.__cjtAmenitiesHook)return;
    const prev=window.Tawk_API.onLoad;
    window.Tawk_API.__cjtAmenitiesHook=true;
    window.Tawk_API.onLoad=function(){
      if(typeof prev==='function')prev();
      if(amenitiesModal.classList.contains('show'))applyTawkHidden(true);
    };
  }
  function openAmenities(){
    if(amenitiesModal.classList.contains('show'))return;
    hookTawk();
    amenitiesModal.classList.add('show');
    document.body.classList.add('modal-open','amenities-sheet-open');
    applyTawkHidden(true);
    if(!amenitiesHistoryOpen){
      history.pushState({cjtAmenities:1},'',location.href);
      amenitiesHistoryOpen=true;
    }
  }
  function closeAmenities(fromPopstate){
    if(!amenitiesModal.classList.contains('show')){
      amenitiesHistoryOpen=false;
      return;
    }
    amenitiesModal.classList.remove('show');
    document.body.classList.remove('modal-open','amenities-sheet-open');
    applyTawkHidden(false);
    if(amenitiesHistoryOpen&&!fromPopstate&&history.state&&history.state.cjtAmenities){
      amenitiesHistoryOpen=false;
      history.back();
      return;
    }
    amenitiesHistoryOpen=false;
  }
  hookTawk();
  $('amenitiesBtn').onclick=openAmenities;
  $('amenitiesClose').onclick=()=>closeAmenities(false);
  $('amenitiesDone').onclick=()=>closeAmenities(false);
  amenitiesModal.addEventListener('click',e=>{if(e.target===amenitiesModal)closeAmenities(false)});
  window.addEventListener('popstate',()=>{if(amenitiesModal.classList.contains('show'))closeAmenities(true)});

  window.addEventListener('message',e=>{if(e.origin!==location.origin||e.data?.type!=='cjt-reviews-height')return;const frame=$('houfyReviews');if(frame&&Number(e.data.height)>200)frame.style.height=`${Math.min(2200,Number(e.data.height)+12)}px`});
  document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(calendarModal.classList.contains('show'))closeCalendar();else if(bookingModal.classList.contains('show'))backFromBooking();else if(amenitiesModal.classList.contains('show'))closeAmenities(false)});
  bindChoicePills();
  hydrateMobileSourceSummaries();hydrateAmenitiesModal();updateSelectors();resetQuote();paintPrimaryCtas();renderGallery();loadAssetManifest();
})();
