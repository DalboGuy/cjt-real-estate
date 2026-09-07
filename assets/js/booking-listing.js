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
  const CTA_HOLD='Request 24-hour hold (no payment)';
  const CTA_SUBMIT='Send hold request — not a confirmed booking';
  let blocked=new Set(),calendarHealthy=false,selectedStart='',selectedEnd='',guests=1,currentQuote=null;
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
      b.disabled=past||(isBlocked&&!checkoutOption);b.title=isBlocked&&!checkoutOption?'Unavailable':'';if(!b.disabled)b.onclick=()=>selectDate(k,isBlocked);grid.appendChild(b)
    }
    target.appendChild(grid);target.classList.toggle('secondary',secondary);
  }
  function renderPicker(){renderMonth($('calendarMonth1'),pickerCursor,false);renderMonth($('calendarMonth2'),new Date(pickerCursor.getFullYear(),pickerCursor.getMonth()+1,1),true);$('calendarSelection').textContent=selectedStart?(selectedEnd?`${fmt(selectedStart)} – ${fmt(selectedEnd)}`:`${fmt(selectedStart)} — choose checkout`):'Choose check-in and check-out dates'}
  function updateSelectors(){const inText=selectedStart?fmt(selectedStart).replace(/, \d{4}/,''):'Add date',outText=selectedEnd?fmt(selectedEnd).replace(/, \d{4}/,''):'Add date';document.querySelectorAll('[data-checkin-value]').forEach(el=>el.textContent=inText);document.querySelectorAll('[data-checkout-value]').forEach(el=>el.textContent=outText);document.querySelectorAll('[data-guests-value]').forEach(el=>el.textContent=`${guests} guest${guests===1?'':'s'}`)}
  function paintPrimaryCtas(){
    const ready=!!(selectedStart&&selectedEnd&&currentQuote);
    const label=ready?CTA_HOLD:CTA_CHECK;
    [$('bookNowBtn'),$('mobileBookBtn')].forEach(btn=>{if(!btn)return;btn.textContent=label;btn.classList.toggle('cta-hold',ready)});
    const note=document.querySelector('.charge-note');
    if(note)note.textContent=ready?'All-in quote shown. This requests a 24-hour hold for CJT review. No payment now. Not a confirmed booking.':'Choose dates to see the all-in price. No payment to check availability.';
  }
  function resetQuote(){currentQuote=null;$('quoteBreakdown').classList.remove('show');$('quoteError').hidden=true;$('bookPrice').innerHTML='<span class="price-main">Add dates for prices</span>';$('mobilePrice').innerHTML='<strong>Add dates</strong><span>See total price</span>';$('bookNowBtn').disabled=false;if($('mobileBookBtn'))$('mobileBookBtn').disabled=false;paintPrimaryCtas()}
  function selectDate(date,isBlocked){
    if(!selectedStart||selectedEnd||date<=selectedStart){if(isBlocked)return;selectedStart=date;selectedEnd='';resetQuote()}
    else{const nights=eachDate(selectedStart,date);if(nights.some(d=>blocked.has(d))){if(!isBlocked){selectedStart=date;selectedEnd='';resetQuote()}return}else{selectedEnd=date;resetQuote()}}
    updateSelectors();renderPicker();if(selectedStart&&selectedEnd){setTimeout(closeCalendar,180);loadQuote()}
  }
  function openCalendar(){if(selectedStart){const d=toUtc(selectedStart);pickerCursor=new Date(d.getUTCFullYear(),d.getUTCMonth(),1)}renderPicker();calendarModal.classList.add('show');document.body.classList.add('modal-open')}
  function closeCalendar(){calendarModal.classList.remove('show');document.body.classList.remove('modal-open')}
  document.querySelectorAll('[data-open-calendar]').forEach(b=>b.onclick=openCalendar);$('calendarClose').onclick=closeCalendar;$('calPrev').onclick=()=>{pickerCursor=new Date(pickerCursor.getFullYear(),pickerCursor.getMonth()-1,1);renderPicker()};$('calNext').onclick=()=>{pickerCursor=new Date(pickerCursor.getFullYear(),pickerCursor.getMonth()+1,1);renderPicker()};calendarModal.addEventListener('click',e=>{if(e.target===calendarModal)closeCalendar()});
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
    if(fetchFailed){el.textContent='Live calendar feeds could not be refreshed. Open nights stay selectable; only past dates and known blocked nights are disabled. A hold request still rechecks availability.';return}
    if(health&&health.degraded&&health.degraded.length){el.textContent=`Calendar feeds are degraded (${health.degraded.join(', ')}). Open nights stay selectable; blocked nights stay blocked. A hold request still rechecks live availability.`;return}
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

  const guestPopover=$('guestPopover');
  function updateGuests(next){guests=Math.max(1,Math.min(14,next));$('guestCount').textContent=guests;$('guestMinus').disabled=guests<=1;$('guestPlus').disabled=guests>=14;updateSelectors();resetQuote();if(selectedStart&&selectedEnd)loadQuote()}
  document.querySelectorAll('[data-open-guests]').forEach(b=>b.onclick=e=>{e.stopPropagation();guestPopover.classList.toggle('show')});$('guestMinus').onclick=e=>{e.stopPropagation();updateGuests(guests-1)};$('guestPlus').onclick=e=>{e.stopPropagation();updateGuests(guests+1)};document.addEventListener('click',e=>{if(!guestPopover.contains(e.target)&&!e.target.closest('[data-open-guests]'))guestPopover.classList.remove('show')});updateGuests(1);

  function renderQuote(q){
    currentQuote=q;const total=money(q.total),nightLabel=`${q.nights} night${q.nights===1?'':'s'}`;$('bookPrice').innerHTML=`<span class="price-main">${total}</span> <span class="price-note">total · ${nightLabel}</span>`;$('mobilePrice').innerHTML=`<strong>${total}</strong><span>${nightLabel} · total</span>`;
    $('quoteLodging').textContent=money(q.lodgingSubtotal);$('quoteCleaning').textContent=money(q.cleaningFee);$('quoteTax').textContent=money(q.taxes);$('quoteTotal').textContent=total;$('quoteBreakdown').classList.add('show');$('quoteError').hidden=true;
    const p=q.paymentSchedule||{};if(p.mode==='split')$('paymentCopy').innerHTML=`<strong>${money(p.dueAtBooking)} initially (50%)</strong>Remaining ${money(p.remainingBalance)} due ${esc(p.balanceDueDateLabel||'30 days before arrival')}. Payment collection is deferred — you will not be charged now.`;else $('paymentCopy').innerHTML=`<strong>${total} due in full</strong>${p.reason==='within_30_days'?'Arrival is within 30 days, so the documented schedule requires full payment when the booking is completed.':'Full payment is documented for this reservation.'} Payment collection is deferred — you will not be charged now.`;
    paintPrimaryCtas();
  }
  async function loadQuote(){
    if(!selectedStart||!selectedEnd)return resetQuote();
    $('bookPrice').innerHTML='<span class="price-main">Checking price…</span>';$('bookNowBtn').disabled=true;if($('mobileBookBtn'))$('mobileBookBtn').disabled=true;
    try{const u=new URL('/api/quote',location.origin);u.searchParams.set('checkin',selectedStart);u.searchParams.set('checkout',selectedEnd);u.searchParams.set('guests',String(guests));const r=await fetch(u,{cache:'no-store'}),d=await r.json();if(!r.ok)throw new Error(d.message||'Price is unavailable for those dates.');renderQuote(d.quote)}catch(e){currentQuote=null;$('quoteBreakdown').classList.remove('show');$('quoteError').hidden=false;$('quoteError').textContent=e.message;$('bookPrice').innerHTML='<span class="price-main">Dates need review</span>';paintPrimaryCtas()}finally{$('bookNowBtn').disabled=false;if($('mobileBookBtn'))$('mobileBookBtn').disabled=false}}
  $('refreshQuote').onclick=loadQuote;

  const bookingModal=$('bookingModal'),bookingForm=$('bookingForm');
  function openBooking(){if(!selectedStart||!selectedEnd){openCalendar();return}if(!currentQuote){loadQuote();return}$('bookingSummary').innerHTML=`<strong>${fmt(selectedStart)} – ${fmt(selectedEnd)} · ${guests} guest${guests===1?'':'s'}</strong><span>${currentQuote.nights} nights · ${money(currentQuote.total)} total</span>`;bookingModal.classList.add('show');document.body.classList.add('modal-open')}
  function closeBooking(){bookingModal.classList.remove('show');document.body.classList.remove('modal-open')}
  $('bookNowBtn').onclick=openBooking;$('mobileBookBtn').onclick=openBooking;$('bookingClose').onclick=closeBooking;bookingModal.addEventListener('click',e=>{if(e.target===bookingModal)closeBooking()});
  bookingForm.addEventListener('submit',async e=>{
    e.preventDefault();if(!currentQuote||!selectedStart||!selectedEnd)return;const btn=$('bookingSubmit'),msg=$('bookingMessage'),f=new FormData(bookingForm);btn.disabled=true;btn.textContent='Sending your request…';msg.className='form-message';msg.textContent='';
    const payload={name:f.get('name'),email:f.get('email'),phone:f.get('phone'),checkin:selectedStart,checkout:selectedEnd,guests:String(guests),message:String(f.get('message')||'').trim(),pets:f.get('pets'),event:f.get('event'),trip_type:f.get('trip_type')};
    try{const r=await fetch('/api/inquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),d=await r.json();if(!r.ok)throw new Error(d.message||'We could not send the hold request.');(d.blockedDates||[]).forEach(date=>blocked.add(date));renderPicker();msg.className='form-message show';msg.innerHTML=`<strong>Request received — not yet confirmed.</strong><br>Booking reference: ${esc(d.reservation.id)}<br>Those dates are blocked on the public calendar for 24 hours while CJT Realty reviews the request. No payment was collected.`;btn.style.display='none';await refreshAvailability()}catch(err){msg.className='form-message error show';msg.textContent=err.message}finally{btn.disabled=false;btn.textContent=CTA_SUBMIT}});

  $('amenitiesBtn').onclick=()=>{$('amenitiesModal').classList.add('show');document.body.classList.add('modal-open')};$('amenitiesClose').onclick=()=>{$('amenitiesModal').classList.remove('show');document.body.classList.remove('modal-open')};$('amenitiesModal').addEventListener('click',e=>{if(e.target===$('amenitiesModal'))$('amenitiesClose').click()});

  window.addEventListener('message',e=>{if(e.origin!==location.origin||e.data?.type!=='cjt-reviews-height')return;const frame=$('houfyReviews');if(frame&&Number(e.data.height)>200)frame.style.height=`${Math.min(2200,Number(e.data.height)+12)}px`});
  document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(calendarModal.classList.contains('show'))closeCalendar();if(bookingModal.classList.contains('show'))closeBooking();if($('amenitiesModal').classList.contains('show'))$('amenitiesClose').click()});
  function syncSupportChat(){
    const api=window.Tawk_API;
    if(!api)return;
    const open=document.body.classList.contains('modal-open');
    try{
      if(open&&typeof api.hideWidget==='function')api.hideWidget();
      else if(!open&&typeof api.showWidget==='function')api.showWidget();
    }catch{}
  }
  new MutationObserver(syncSupportChat).observe(document.body,{attributes:true,attributeFilter:['class']});
  window.Tawk_API=window.Tawk_API||{};
  const prevTawkLoad=window.Tawk_API.onLoad;
  window.Tawk_API.onLoad=function(){if(typeof prevTawkLoad==='function')prevTawkLoad();syncSupportChat()};
  hydrateMobileSourceSummaries();hydrateAmenitiesModal();updateSelectors();resetQuote();renderGallery();loadAssetManifest();
})();
