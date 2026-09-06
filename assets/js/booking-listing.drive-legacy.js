(()=>{
  const $=id=>document.getElementById(id);
  const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0));
  const isoToday=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
  const toUtc=s=>new Date(`${s}T00:00:00Z`);
  const fmt=s=>s?toUtc(s).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}):'Add dates';
  const eachDate=(start,end)=>{const out=[];if(!start||!end)return out;for(let d=toUtc(start),stop=toUtc(end);d<stop;d=new Date(d.getTime()+86400000))out.push(d.toISOString().slice(0,10));return out};
  const esc=v=>String(v||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  const photos=`
1p8Z7flJ93NS9h1-PXA1tMBlmdFGREAZD|exterior|Historic exterior
1dBhTIh3KdqXDupNq8nhlCt4bWMVfV931|exterior|Front porches
1Ho_SCb2DvzT-ILkroyU0DnulqNdqpxzy|exterior|Historic exterior detail
1fcbIXeRuvtAF53iMcUMgCZo6InRfsD0u|exterior|Front of Sand & Sea Manor
1QH8SdE1f57HKdHWHyZSL3zirOdolyaL6|exterior|Porch and exterior
1s78bXdJorG0Ob9gjmDFT1FXnFcA2vi-l|aerial|Aerial view and Galveston setting
1BPh-xpmSKQIsLzd4xRdxF3byK6Xs4CQj|aerial|Aerial view
1fFDMoALScgeTlx_PQIg9-2OXHSCXUbcn|amenities|Private hot tub
17_5GAmY3meVDnIq-bf8DGs4P7slYksx2|amenities|Fire-pit seating
1xTNCQsQ_5Dzl28arvo33IOHptaL2fqyu|amenities|Outdoor gathering space
1R1PEWlj45mU7lhPQPG5xIe5qkos723la|amenities|Porch and outdoor amenities
17IKRicvoTHOAlz4pwL9_gprfuyHCZX6n|kitchen|Kitchen
1Uo1qEEvG3fGo44_mEylC1RHeILnJGWCm|kitchen|Kitchen detail
1INdrIqGUIEbG34kC1yH9R8XrCYW6g4qh|kitchen|Kitchen and island
1J38yTIhUdkUn_LLNINPz3Zk2KWrX0NmU|kitchen|Kitchen workspace
1yiHhZvkt2Fnb9gFtoav3S_On9ZEzoP3z|kitchen|Dining and kitchen
1xCRRO4TdN9t3pOTNdL0KADC7TRKdWjJU|interior|Living space
1Gdj9OWALEV1A0n9nUEKGEwGbQZmAGonV|interior|Living room
1r81GJrow1oZchenCk-r0iFFnEXTL8Oji|interior|Historic interior
1b7FFHGl1zxKiKhZdfpvGwU0gQsL64mQ5|interior|Gathering space
1QAH2igcmg2wcCdcMMJdDUaDo3RzDvWSy|interior|Interior detail
1Y9-TrFB6dkRIJb-vEtKxEWwidT13tNQ1|interior|Living space
1ui_lNQvozRmu9okHuwbY6UmyzxnkaUl8|interior|Dining area
1ed1qkAf-DMMKcVgayLYvqquZKFf_1J3H|interior|Historic hallway
1CF3Vh7UPdvKbomxz1gZ2PWe8GwiqBvDU|interior|Common area
1sTSDC_fRrg76lo8IwenUkoeqplduW3SN|interior|Breakfast table and kitchen island
11929mx1yVcV0R-uoeOm3TQLYl2iHsxwG|interior|Common area
1MxqxfLFHcqhPJk48GZDUqQzzOyGcbsVG|interior|Interior room
1TWCMCYCz9SxPV1cDaIyJgn4mtLogE48u|interior|Historic interior
1fftBq9HG4mwktZSuz1EP0wsWaICPErSA|interior|Interior detail
1FketXkBAJjRF2LO0i5l-eYmL4tDiGaSB|bedrooms|Bedroom
17-FjbJy1wtgDtNdSJKvfYq4_Wtg4dJBk|bedrooms|Bedroom
1Oosyi1X3GMY9eX0EJKCLYPEkFCQ6WdBQ|bedrooms|Bedroom
1f0pliNlWzuuuhAsITTm-221J0MEWqvST|bedrooms|Bedroom
1k3zT3TYsraQBiZVfiidhimcjqnxw0V_u|bedrooms|Bedroom
1kroJMzxDsXSxQ_vyDuKtQG3gvtH8n0LG|bedrooms|Bedroom
1p_gSIPgB8li-ZHPcE5jF_mTJVf4DX9H1|bedrooms|Bedroom
1ftx3EpDLreevw_jjMUH4Pa3hj0ZyNcdc|bedrooms|Bedroom
1vpI2I7nBKRLcvcEzXS-ePn2-BxFleWoI|bedrooms|Bedroom
1RkZ5GUgqVVLyLbz6pgVBiWYG1b1u5u3g|bedrooms|Bedroom
1L_4HDMlTssj_RLZZy7tz13gXXIaxuNn9|bath|Bathroom
1AbDYapEfgS_sOG9HXO5KivZ4QxK_8xQU|bath|Bathroom
1KTV7nKFn4C9YC1dB_zKEu2QdqQMHKJLm|bath|Bathroom
1X3hp-PjGqeo8QYBluU4-FDOxXmfAw4k8|bath|Bathroom
1G-a091oYqM-KexAS8nRSC6KCM0eQtMY1|bath|Bathroom
1_TT-6FmEJtzUzme2nvSoj7vi8oTK822f|bath|Bathroom
16J3GHLUdzWNEQYDbIVc88KUlvPyxOmZ8|bath|Bathroom
1LYhrO-f2QGZcyxsXdgGhl922_kY06yWj|bath|Bathroom
10e-3ry9wEVTqrLomPB0s70D0DD5Tvy07|bath|Bathroom
1l-gDbm4blFAKAq6zwcVmXqD6RABJWD0K|bath|Bathroom
1ixcf53Yo75CnfJgRZxdM4lTuaTV2BHNm|bath|Bathroom`.trim().split('\n').map(row=>{const [id,category,label]=row.split('|');return{id,category,label}});
  const thumb=(id,w=1200)=>`https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${w}`;

  const galleryModal=$('galleryModal'),galleryGrid=$('galleryGrid'),viewer=$('photoViewer'),viewerImage=$('viewerImage'),viewerMeta=$('viewerMeta');
  let galleryFilter='all',galleryVisible=photos.map((_,i)=>i),viewerIndex=0;
  function renderGallery(){
    galleryVisible=[];galleryGrid.innerHTML='';
    photos.forEach((p,i)=>{if(galleryFilter!=='all'&&p.category!==galleryFilter)return;galleryVisible.push(i);const b=document.createElement('button');b.type='button';b.innerHTML=`<img loading="lazy" decoding="async" src="${thumb(p.id,900)}" alt="Sand & Sea Manor — ${esc(p.label)}">`;b.onclick=()=>openViewer(i);galleryGrid.appendChild(b)});
    $('galleryCount').textContent=`${galleryVisible.length} photo${galleryVisible.length===1?'':'s'}`;
  }
  function openGallery(filter='all'){galleryFilter=filter;document.querySelectorAll('[data-gallery-filter]').forEach(b=>b.classList.toggle('active',b.dataset.galleryFilter===filter));renderGallery();galleryModal.classList.add('show');document.body.classList.add('modal-open')}
  function closeGallery(){galleryModal.classList.remove('show');if(!viewer.classList.contains('show'))document.body.classList.remove('modal-open')}
  function openViewer(i){viewerIndex=i;viewerImage.src=thumb(photos[i].id,2200);viewerImage.alt=`Sand & Sea Manor — ${photos[i].label}`;const pos=galleryVisible.indexOf(i);viewerMeta.textContent=`${photos[i].label} · ${pos>=0?pos+1:i+1} of ${galleryVisible.length||photos.length}`;viewer.classList.add('show');document.body.classList.add('modal-open')}
  function closeViewer(){viewer.classList.remove('show');if(!galleryModal.classList.contains('show'))document.body.classList.remove('modal-open')}
  function moveViewer(step){let p=galleryVisible.indexOf(viewerIndex);if(p<0)p=0;p=(p+step+galleryVisible.length)%galleryVisible.length;openViewer(galleryVisible[p])}
  document.querySelectorAll('[data-open-gallery]').forEach(b=>b.onclick=()=>openGallery(b.dataset.openGallery||'all'));
  document.querySelectorAll('[data-photo-index]').forEach(b=>b.onclick=()=>{galleryFilter='all';galleryVisible=photos.map((_,i)=>i);openViewer(Number(b.dataset.photoIndex)||0)});
  document.querySelectorAll('[data-gallery-filter]').forEach(b=>b.onclick=()=>{galleryFilter=b.dataset.galleryFilter;document.querySelectorAll('[data-gallery-filter]').forEach(x=>x.classList.toggle('active',x===b));renderGallery()});
  $('galleryClose').onclick=closeGallery;$('viewerClose').onclick=closeViewer;$('viewerPrev').onclick=()=>moveViewer(-1);$('viewerNext').onclick=()=>moveViewer(1);
  galleryModal.addEventListener('click',e=>{if(e.target===galleryModal)closeGallery()});viewer.addEventListener('click',e=>{if(e.target===viewer)closeViewer()});
  document.addEventListener('keydown',e=>{if(viewer.classList.contains('show')){if(e.key==='Escape')closeViewer();if(e.key==='ArrowLeft')moveViewer(-1);if(e.key==='ArrowRight')moveViewer(1)}else if(galleryModal.classList.contains('show')&&e.key==='Escape')closeGallery()});

  $('shareBtn').onclick=async()=>{const data={title:'Sand & Sea Manor',text:'Sand & Sea Manor in Galveston — direct booking',url:location.href};try{if(navigator.share)await navigator.share(data);else{await navigator.clipboard.writeText(location.href);$('shareLabel').textContent='Copied';setTimeout(()=>$('shareLabel').textContent='Share',1600)}}catch{}};
  const saved=localStorage.getItem('cjt_sand_sea_saved')==='1';
  function paintSave(on){$('saveBtn').dataset.saved=on?'1':'0';$('saveLabel').textContent=on?'Saved':'Save';$('saveHeart').setAttribute('fill',on?'currentColor':'none')}
  paintSave(saved);$('saveBtn').onclick=()=>{const next=$('saveBtn').dataset.saved!=='1';localStorage.setItem('cjt_sand_sea_saved',next?'1':'0');paintSave(next)};

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
      b.disabled=!calendarHealthy||past||(isBlocked&&!checkoutOption);b.title=isBlocked&&!checkoutOption?'Unavailable':'';if(!b.disabled)b.onclick=()=>selectDate(k,isBlocked);grid.appendChild(b)
    }
    target.appendChild(grid);target.classList.toggle('secondary',secondary);
  }
  function renderPicker(){renderMonth($('calendarMonth1'),pickerCursor,false);renderMonth($('calendarMonth2'),new Date(pickerCursor.getFullYear(),pickerCursor.getMonth()+1,1),true);$('calendarSelection').textContent=selectedStart?(selectedEnd?`${fmt(selectedStart)} – ${fmt(selectedEnd)}`:`${fmt(selectedStart)} — choose checkout`):'Choose check-in and check-out dates'}
  function updateSelectors(){const inText=selectedStart?fmt(selectedStart).replace(/, \d{4}/,''):'Add date',outText=selectedEnd?fmt(selectedEnd).replace(/, \d{4}/,''):'Add date';document.querySelectorAll('[data-checkin-value]').forEach(el=>el.textContent=inText);document.querySelectorAll('[data-checkout-value]').forEach(el=>el.textContent=outText);document.querySelectorAll('[data-guests-value]').forEach(el=>el.textContent=`${guests} guest${guests===1?'':'s'}`)}
  function resetQuote(){currentQuote=null;$('quoteBreakdown').classList.remove('show');$('quoteError').hidden=true;$('bookPrice').innerHTML='<span class="price-main">Add dates for prices</span>';$('mobilePrice').innerHTML='<strong>Add dates</strong><span>See total price</span>';$('bookNowBtn').disabled=false}
  function selectDate(date,isBlocked){
    if(!selectedStart||selectedEnd||date<=selectedStart){if(isBlocked)return;selectedStart=date;selectedEnd='';resetQuote()}
    else{const nights=eachDate(selectedStart,date);if(nights.some(d=>blocked.has(d))){if(!isBlocked){selectedStart=date;selectedEnd='';resetQuote()}return}else{selectedEnd=date;resetQuote()}}
    updateSelectors();renderPicker();if(selectedStart&&selectedEnd){setTimeout(closeCalendar,180);loadQuote()}
  }
  function openCalendar(){if(selectedStart){const d=toUtc(selectedStart);pickerCursor=new Date(d.getUTCFullYear(),d.getUTCMonth(),1)}renderPicker();calendarModal.classList.add('show');document.body.classList.add('modal-open')}
  function closeCalendar(){calendarModal.classList.remove('show');document.body.classList.remove('modal-open')}
  document.querySelectorAll('[data-open-calendar]').forEach(b=>b.onclick=openCalendar);$('calendarClose').onclick=closeCalendar;$('calPrev').onclick=()=>{pickerCursor=new Date(pickerCursor.getFullYear(),pickerCursor.getMonth()-1,1);renderPicker()};$('calNext').onclick=()=>{pickerCursor=new Date(pickerCursor.getFullYear(),pickerCursor.getMonth()+1,1);renderPicker()};calendarModal.addEventListener('click',e=>{if(e.target===calendarModal)closeCalendar()});
  async function refreshAvailability(){
    $('calendarHealth').textContent='Checking live availability…';calendarHealthy=false;
    try{const r=await fetch('/api/calendar',{cache:'no-store'});if(!r.ok)throw new Error('availability_unavailable');const d=await r.json();blocked=new Set(d.blockedDates||[]);const required=(d.sources||[]).filter(s=>['airbnb','vrbo'].includes(String(s.name).toLowerCase()));calendarHealthy=required.length?required.every(s=>s.ok!==false):true;$('calendarHealth').textContent=calendarHealthy?'Availability synced from connected calendars.':'One or more required calendars could not be verified. Booking requests are temporarily paused.';renderPicker()}catch{$('calendarHealth').textContent='Live availability is temporarily unavailable. Please contact CJT.';calendarHealthy=false;renderPicker()}}
  refreshAvailability();

  const guestPopover=$('guestPopover');
  function updateGuests(next){guests=Math.max(1,Math.min(14,next));$('guestCount').textContent=guests;$('guestMinus').disabled=guests<=1;$('guestPlus').disabled=guests>=14;updateSelectors();resetQuote();if(selectedStart&&selectedEnd)loadQuote()}
  document.querySelectorAll('[data-open-guests]').forEach(b=>b.onclick=e=>{e.stopPropagation();guestPopover.classList.toggle('show')});$('guestMinus').onclick=e=>{e.stopPropagation();updateGuests(guests-1)};$('guestPlus').onclick=e=>{e.stopPropagation();updateGuests(guests+1)};document.addEventListener('click',e=>{if(!guestPopover.contains(e.target)&&!e.target.closest('[data-open-guests]'))guestPopover.classList.remove('show')});updateGuests(1);

  function renderQuote(q){
    currentQuote=q;const total=money(q.total),nightLabel=`${q.nights} night${q.nights===1?'':'s'}`;$('bookPrice').innerHTML=`<span class="price-main">${total}</span> <span class="price-note">total · ${nightLabel}</span>`;$('mobilePrice').innerHTML=`<strong>${total}</strong><span>${nightLabel} · total</span>`;
    $('quoteLodging').textContent=money(q.lodgingSubtotal);$('quoteCleaning').textContent=money(q.cleaningFee);$('quoteTax').textContent=money(q.taxes);$('quoteTotal').textContent=total;$('quoteBreakdown').classList.add('show');$('quoteError').hidden=true;
    const p=q.paymentSchedule||{};if(p.mode==='split')$('paymentCopy').innerHTML=`<strong>${money(p.dueAtBooking)} due when accepted</strong>Remaining ${money(p.remainingBalance)} due ${esc(p.balanceDueDateLabel||'30 days before check-in')}.`;else $('paymentCopy').innerHTML=`<strong>${total} due when accepted</strong>${p.reason==='within_30_days'?'This stay begins within 30 days, so the full balance is due at booking.':'Full payment is due for this reservation.'}`;
  }
  async function loadQuote(){
    if(!selectedStart||!selectedEnd)return resetQuote();if(!calendarHealthy){$('quoteError').hidden=false;$('quoteError').textContent='Live availability cannot be verified right now.';return}
    $('bookPrice').innerHTML='<span class="price-main">Checking price…</span>';$('bookNowBtn').disabled=true;
    try{const u=new URL('/api/quote',location.origin);u.searchParams.set('checkin',selectedStart);u.searchParams.set('checkout',selectedEnd);u.searchParams.set('guests',String(guests));const r=await fetch(u,{cache:'no-store'}),d=await r.json();if(!r.ok)throw new Error(d.message||'Price is unavailable for those dates.');renderQuote(d.quote)}catch(e){currentQuote=null;$('quoteBreakdown').classList.remove('show');$('quoteError').hidden=false;$('quoteError').textContent=e.message;$('bookPrice').innerHTML='<span class="price-main">Dates need review</span>'}finally{$('bookNowBtn').disabled=false}}
  $('refreshQuote').onclick=loadQuote;

  const bookingModal=$('bookingModal'),bookingForm=$('bookingForm');
  function openBooking(){if(!selectedStart||!selectedEnd){openCalendar();return}if(!currentQuote){loadQuote();return}$('bookingSummary').innerHTML=`<strong>${fmt(selectedStart)} – ${fmt(selectedEnd)} · ${guests} guest${guests===1?'':'s'}</strong><span>${currentQuote.nights} nights · ${money(currentQuote.total)} total</span>`;bookingModal.classList.add('show');document.body.classList.add('modal-open')}
  function closeBooking(){bookingModal.classList.remove('show');document.body.classList.remove('modal-open')}
  $('bookNowBtn').onclick=openBooking;$('mobileBookBtn').onclick=openBooking;$('bookingClose').onclick=closeBooking;bookingModal.addEventListener('click',e=>{if(e.target===bookingModal)closeBooking()});
  bookingForm.addEventListener('submit',async e=>{
    e.preventDefault();if(!currentQuote||!selectedStart||!selectedEnd)return;const btn=$('bookingSubmit'),msg=$('bookingMessage'),f=new FormData(bookingForm);btn.disabled=true;btn.textContent='Holding your dates…';msg.className='form-message';msg.textContent='';const details=[];if(f.get('pets')==='yes')details.push('Guest is asking for pet approval.');if(f.get('event')==='yes')details.push('Guest is asking about an event/gathering.');if(f.get('message'))details.push(String(f.get('message')).trim());
    const payload={name:f.get('name'),email:f.get('email'),phone:f.get('phone'),checkin:selectedStart,checkout:selectedEnd,guests:String(guests),message:details.join('\n')};
    try{const r=await fetch('/api/inquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),d=await r.json();if(!r.ok)throw new Error(d.message||'We could not place the booking hold.');msg.className='form-message show';msg.innerHTML=`<strong>Your dates are held for 24 hours.</strong><br>Booking reference: ${esc(d.reservation.id)}<br>CJT Realty will review the request and continue the agreement/payment process.`;btn.style.display='none';await refreshAvailability()}catch(err){msg.className='form-message error show';msg.textContent=err.message}finally{btn.disabled=false;btn.textContent='Book Now — Hold These Dates'}});

  $('amenitiesBtn').onclick=()=>{$('amenitiesModal').classList.add('show');document.body.classList.add('modal-open')};$('amenitiesClose').onclick=()=>{$('amenitiesModal').classList.remove('show');document.body.classList.remove('modal-open')};$('amenitiesModal').addEventListener('click',e=>{if(e.target===$('amenitiesModal'))$('amenitiesClose').click()});

  window.addEventListener('message',e=>{if(e.origin!==location.origin||e.data?.type!=='cjt-reviews-height')return;const frame=$('houfyReviews');if(frame&&Number(e.data.height)>200)frame.style.height=`${Math.min(2200,Number(e.data.height)+12)}px`});
  document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(calendarModal.classList.contains('show'))closeCalendar();if(bookingModal.classList.contains('show'))closeBooking();if($('amenitiesModal').classList.contains('show'))$('amenitiesClose').click()});
  updateSelectors();resetQuote();renderGallery();
})();