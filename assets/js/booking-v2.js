(()=>{
  const $=id=>document.getElementById(id);

  /* Canonical public images via /assets/data/public-image-manifest.json.
     No Drive thumbnail URLs or runtime fallback chains in guest delivery.
     Rollback: use booking-v2.drive-legacy.js instead of this file. */

  function applyOpeningMosaic(manifest){
    const opening=manifest.openingPhotos||[];
    const mosaic=document.querySelector('.v2-mosaic');
    if(!mosaic||!opening.length)return;
    let items=[...mosaic.querySelectorAll('.gallery-item')];
    const showPhotos=mosaic.querySelector('.show-photos');
    while(items.length<opening.length){
      const seed=items[items.length-1]||items[0];if(!seed)break;
      const extra=seed.cloneNode(true);extra.style.display='';
      if(showPhotos)mosaic.insertBefore(extra,showPhotos);else mosaic.appendChild(extra);
      items=[...mosaic.querySelectorAll('.gallery-item')];
    }
    opening.forEach((photo,i)=>{
      const old=items[i];if(!old)return;
      const fresh=old.cloneNode(true);
      fresh.style.display='';
      fresh.removeAttribute('data-photo-index');
      const img=fresh.querySelector('img');
      if(img){
        img.src=photo.publicPath;
        img.alt=photo.alt||'Sand and Sea Manor';
        img.loading=i===0?'eager':'lazy';
        img.decoding='async';
        img.style.visibility='';
        img.onerror=()=>{img.style.visibility='hidden';fresh.classList.add('image-unavailable')};
      }
      fresh.addEventListener('click',()=>document.querySelector('[data-open-gallery="all"]')?.click());
      old.replaceWith(fresh);
    });
    [...mosaic.querySelectorAll('.gallery-item')].slice(opening.length).forEach(el=>el.style.display='none');
    if(!document.getElementById('cjt-mosaic-layout')){
      const mosaicStyle=document.createElement('style');
      mosaicStyle.id='cjt-mosaic-layout';
      mosaicStyle.textContent='.v2-mosaic{grid-template-columns:2fr 1fr 1fr;grid-template-rows:165px 165px 165px}.v2-mosaic .gallery-item:nth-of-type(1){grid-column:1;grid-row:1/4}.v2-mosaic .gallery-item:nth-of-type(2){grid-column:2;grid-row:1}.v2-mosaic .gallery-item:nth-of-type(3){grid-column:3;grid-row:1}.v2-mosaic .gallery-item:nth-of-type(4){grid-column:2;grid-row:2}.v2-mosaic .gallery-item:nth-of-type(5){grid-column:3;grid-row:2}.v2-mosaic .gallery-item:nth-of-type(6){grid-column:2/4;grid-row:3}.v2-mosaic .image-unavailable{background:#eef2f0}.v2-mosaic .image-unavailable:after{content:"Property photo";position:absolute;inset:0;display:grid;place-items:center;color:#6b7d80;font-weight:800}@media(max-width:780px){.v2-mosaic{grid-template-columns:1fr 1fr;grid-template-rows:275px 165px}.v2-mosaic .gallery-item:nth-of-type(1){grid-column:1/3;grid-row:1}.v2-mosaic .gallery-item:nth-of-type(2){grid-column:1;grid-row:2}.v2-mosaic .gallery-item:nth-of-type(3){grid-column:2;grid-row:2}.v2-mosaic .gallery-item:nth-of-type(n+4){display:none!important}}';
      document.head.appendChild(mosaicStyle);
    }
  }

  function applyAerialPhotos(manifest){
    const aerial=manifest.aerialPhotos||[];
    const cards=[...document.querySelectorAll('.aerial-card img')];
    aerial.forEach((photo,i)=>{
      const img=cards[i];if(!img)return;
      img.src=photo.publicPath;
      if(photo.alt)img.alt=photo.alt;
      img.loading='lazy';
      img.decoding='async';
    });
  }

  function setRoomImage(img,host,label){
    img.onerror=()=>{img.remove();host.classList.add('photo-fallback');host.setAttribute('aria-label',`${label} photo unavailable`)};
  }

  function applyRoomGroups(manifest){
    const roomGroups=manifest.roomGroups||[];
    if(!document.getElementById('cjt-room-runtime-style')){
      const roomRuntimeStyle=document.createElement('style');
      roomRuntimeStyle.id='cjt-room-runtime-style';
      roomRuntimeStyle.textContent='.room-card .room-visual{padding:0;position:relative;overflow:hidden;background:#eef2f0}.room-card .room-visual img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .22s ease}.room-card:hover .room-visual img,.room-card:focus-visible .room-visual img{transform:scale(1.025)}.room-card .room-visual .room-photo-count{position:absolute;left:12px;bottom:12px;background:rgba(255,255,255,.94);border:1px solid rgba(221,228,226,.95);border-radius:999px;padding:6px 9px;font-size:.7rem;font-weight:850;color:#12383e;box-shadow:0 4px 14px rgba(13,43,49,.1)}.room-card .room-visual.photo-fallback{display:grid;place-items:center}.room-card .room-visual.photo-fallback:before{content:"Room photo";color:#6b7d80;font-weight:850}.room-gallery-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.room-gallery-grid button{border:0;padding:0;background:#eef2f0;border-radius:14px;overflow:hidden;cursor:pointer;min-height:220px}.room-gallery-grid img{width:100%;height:360px;object-fit:cover;display:block;transition:transform .2s ease}.room-gallery-grid button:hover img{transform:scale(1.018)}.room-gallery-grid button.photo-fallback{display:grid;place-items:center;color:#6b7d80;font-weight:850}@media(max-width:780px){.room-gallery-grid{grid-template-columns:1fr}.room-gallery-grid img{height:auto;max-height:72vh}}';
      document.head.appendChild(roomRuntimeStyle);
    }

    const sleepKicker=document.querySelector('#sleep .section-kicker');
    if(sleepKicker)sleepKicker.textContent='Choose a room to view its photo collection.';

    const roomScroll=$('sleepingScroll');
    const roomModal=$('roomGalleryModal'),roomGrid=$('roomGalleryGrid'),roomTitle=$('roomGalleryTitle'),roomSubtitle=$('roomGallerySubtitle');
    function openRoom(room){
      if(!roomModal||!roomGrid)return;
      roomTitle.textContent=room.name;
      roomSubtitle.textContent=`${room.photos.length} photo${room.photos.length===1?'':'s'}`;
      roomGrid.innerHTML='';
      room.photos.forEach((photo,i)=>{
        const b=document.createElement('button');b.type='button';
        b.innerHTML=`<img src="${photo.publicPath}" alt="${room.name} photo ${i+1}" loading="lazy" decoding="async">`;
        const img=b.querySelector('img');if(img)setRoomImage(img,b,room.name);
        roomGrid.appendChild(b);
      });
      roomModal.classList.add('show');document.body.classList.add('modal-open');
    }
    if(roomScroll){
      roomScroll.innerHTML='';
      roomGroups.forEach((room,roomIndex)=>{
        const card=document.createElement('button');
        card.type='button';
        card.className='sleep-card room-card';
        card.dataset.roomIndex=String(roomIndex);
        const cover=room.photos[0];
        card.innerHTML=`<div class="room-visual"><img src="${cover?cover.publicPath:''}" alt="${room.name}" loading="lazy" decoding="async"><span class="room-photo-count">${room.photos.length} photo${room.photos.length===1?'':'s'}</span></div><div class="room-card-copy"><strong>${room.name}</strong><span>${room.photos.length} room photo${room.photos.length===1?'':'s'}</span><span class="room-link">View room →</span></div>`;
        const visual=card.querySelector('.room-visual'),img=card.querySelector('img');if(img&&visual)setRoomImage(img,visual,room.name);
        card.addEventListener('click',()=>openRoom(room));
        roomScroll.appendChild(card);
      });
    }
    if(!window.__CJT_ROOM_UI_BOUND__){
      window.__CJT_ROOM_UI_BOUND__=true;
      $('roomGalleryClose')?.addEventListener('click',()=>{roomModal?.classList.remove('show');document.body.classList.remove('modal-open')});
      roomModal?.addEventListener('click',e=>{if(e.target===roomModal)$('roomGalleryClose')?.click()});
      $('roomPrev')?.addEventListener('click',()=>roomScroll?.scrollBy({left:-330,behavior:'smooth'}));
      $('roomNext')?.addEventListener('click',()=>roomScroll?.scrollBy({left:330,behavior:'smooth'}));
      document.addEventListener('keydown',e=>{if(e.key==='Escape'&&roomModal?.classList.contains('show'))$('roomGalleryClose')?.click()});
    }
  }

  /* Map + aerial interaction: lines stay physically attached to the map marker and card edges. */
  const stage=$('locationStage'),lineSvg=$('locationLines'),mapAnchor=$('mapAnchor');
  let selectedLine='';
  function drawMapLines(){
    if(!stage||!lineSvg||!mapAnchor||window.matchMedia('(max-width:780px)').matches)return;
    const sr=stage.getBoundingClientRect(),ar=mapAnchor.getBoundingClientRect();
    const width=Math.max(1,sr.width),height=Math.max(1,sr.height);
    lineSvg.setAttribute('viewBox',`0 0 ${width} ${height}`);
    lineSvg.setAttribute('preserveAspectRatio','none');
    const startX=ar.left-sr.left+ar.width/2,startY=ar.top-sr.top+ar.height/2;
    document.querySelectorAll('.aerial-card').forEach(card=>{
      const path=$(card.dataset.mapLine);if(!path)return;
      const cr=card.getBoundingClientRect(),endX=cr.left-sr.left+4,endY=cr.top-sr.top+cr.height/2;
      const bend=Math.max(55,(endX-startX)*.46);
      path.setAttribute('d',`M ${startX.toFixed(1)} ${startY.toFixed(1)} C ${(startX+bend).toFixed(1)} ${startY.toFixed(1)}, ${(endX-bend*.45).toFixed(1)} ${endY.toFixed(1)}, ${endX.toFixed(1)} ${endY.toFixed(1)}`);
    });
  }
  function paintMapLink(lineId){
    document.querySelectorAll('.location-lines path').forEach(p=>p.classList.toggle('active',p.id===lineId));
    document.querySelectorAll('.aerial-card').forEach(card=>card.classList.toggle('map-active',card.dataset.mapLine===lineId));
    mapAnchor?.classList.toggle('active',!!lineId);
  }
  document.querySelectorAll('.aerial-card').forEach(card=>{
    const id=card.dataset.mapLine;
    card.onclick=null;
    card.removeAttribute('data-photo-index');
    card.addEventListener('mouseenter',()=>paintMapLink(id));
    card.addEventListener('mouseleave',()=>paintMapLink(selectedLine));
    card.addEventListener('focus',()=>paintMapLink(id));
    card.addEventListener('blur',()=>paintMapLink(selectedLine));
    card.addEventListener('click',()=>{
      const same=selectedLine===id;
      selectedLine=same?'':id;
      document.querySelectorAll('.aerial-card').forEach(c=>c.setAttribute('aria-pressed',c.dataset.mapLine===selectedLine?'true':'false'));
      paintMapLink(selectedLine);
    });
  });
  if(stage){new ResizeObserver(drawMapLines).observe(stage);window.addEventListener('resize',drawMapLines);window.addEventListener('load',()=>requestAnimationFrame(drawMapLines));requestAnimationFrame(drawMapLines)}


  let booted=false;
  async function bootFromManifest(){
    if(booted)return;
    let manifest=window.__CJT_PUBLIC_IMAGE_MANIFEST__;
    if(!manifest){
      try{
        const res=await fetch('/assets/data/public-image-manifest.json',{credentials:'omit'});
        if(!res.ok)throw new Error('manifest '+res.status);
        manifest=await res.json();
        window.__CJT_PUBLIC_IMAGE_MANIFEST__=manifest;
      }catch(err){
        console.error('Public image manifest failed to load',err);
        return;
      }
    }
    booted=true;
    applyOpeningMosaic(manifest);
    applyAerialPhotos(manifest);
    applyRoomGroups(manifest);
  }

  document.addEventListener('cjt:public-images-ready',()=>bootFromManifest(),{once:true});
  bootFromManifest();

  /* Guest-love rail with source rating visible on every card. */
  const reviewRail=$('guestLoveRail');
  $('reviewPrev')?.addEventListener('click',()=>reviewRail?.scrollBy({left:-350,behavior:'smooth'}));
  $('reviewNext')?.addEventListener('click',()=>reviewRail?.scrollBy({left:350,behavior:'smooth'}));
  document.querySelectorAll('[data-review-topic]').forEach(btn=>btn.addEventListener('click',()=>{
    const topic=btn.dataset.reviewTopic;
    const active=btn.getAttribute('aria-pressed')==='true';
    document.querySelectorAll('[data-review-topic]').forEach(b=>b.setAttribute('aria-pressed','false'));
    btn.setAttribute('aria-pressed',active?'false':'true');
    const filter=active?'':topic;
    document.querySelectorAll('.guest-love-card').forEach(card=>{
      const tags=(card.dataset.reviewTags||'').split(/\s+/).filter(Boolean);
      card.hidden=!!filter&&!tags.includes(filter);
    });
    reviewRail?.scrollTo({left:0,behavior:'smooth'});
  }));

  const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let reviewTimer=null;
  function startReviewScroll(){
    if(reduceMotion||!reviewRail||reviewTimer)return;
    reviewTimer=setInterval(()=>{
      const visible=[...reviewRail.querySelectorAll('.guest-love-card:not([hidden])')];
      if(visible.length<2)return;
      const max=reviewRail.scrollWidth-reviewRail.clientWidth;if(max<=10)return;
      const nearEnd=reviewRail.scrollLeft>=max-20;
      reviewRail.scrollTo({left:nearEnd?0:Math.min(max,reviewRail.scrollLeft+350),behavior:'smooth'});
    },7000);
  }
  function stopReviewScroll(){if(reviewTimer){clearInterval(reviewTimer);reviewTimer=null}}
  reviewRail?.addEventListener('mouseenter',stopReviewScroll);reviewRail?.addEventListener('mouseleave',startReviewScroll);reviewRail?.addEventListener('focusin',stopReviewScroll);reviewRail?.addEventListener('focusout',startReviewScroll);reviewRail?.addEventListener('pointerdown',stopReviewScroll);startReviewScroll();

  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&roomModal?.classList.contains('show'))$('roomGalleryClose')?.click()});
})();