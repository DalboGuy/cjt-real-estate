(()=>{
  const $=id=>document.getElementById(id);
  const thumb=(id,w=1400)=>`https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${w}`;

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

  /* Bedroom collections come directly from the five owner-supplied Google Drive folders. Folder name is the guest-facing room name; no bed configuration is inferred here. */
  const roomGroups=[
    {
      name:'Master Bedroom',folderId:'1IxJqk17K7skT9ss5LMXQ6_WrFuCbp5W_',
      photos:[
        {id:'17-FjbJy1wtgDtNdSJKvfYq4_Wtg4dJBk',name:'28.jpg'},
        {id:'1RUE96rF2Y8dbK_-CS31VE5Vkba6KSOyR',name:'27.jpg'},
        {id:'1KTV7nKFn4C9YC1dB_zKEu2QdqQMHKJLm',name:'9.jpg'},
        {id:'1G-a091oYqM-KexAS8nRSC6KCM0eQtMY1',name:'12.jpg'},
        {id:'1ixcf53Yo75CnfJgRZxdM4lTuaTV2BHNm',name:'52.jpg'}
      ]
    },
    {
      name:'Boho Room',folderId:'1PHttJna7uy8D_d47gs_9Qz19oIdW7kJh',
      photos:[
        {id:'1p_gSIPgB8li-ZHPcE5jF_mTJVf4DX9H1',name:'41.jpg'},
        {id:'1ftx3EpDLreevw_jjMUH4Pa3hj0ZyNcdc',name:'42.jpg'}
      ]
    },
    {
      name:'Glam Room',folderId:'1kk2QcvsaZxM8NJqqr9agvAmNWLWmsRQY',
      photos:[
        {id:'1vpI2I7nBKRLcvcEzXS-ePn2-BxFleWoI',name:'43.jpg'},
        {id:'1RkZ5GUgqVVLyLbz6pgVBiWYG1b1u5u3g',name:'44.jpg'}
      ]
    },
    {
      name:'Flex Room',folderId:'1o-nrG3bMMqgZ4-Egm2XzNmXZ00MD2YGd',
      photos:[
        {id:'1NXXKCKJmY-bZB3t36XKs7HfJwIn2Q25L',name:'39.jpg'},
        {id:'1fNrIsAjT8OeoEKLh-ffSXTdvKHId561u',name:'40.jpg'}
      ]
    },
    {
      name:'Bunk Room',folderId:'1ui0dfMhlt5S4d2wLA34rtyteAHp9PQlk',
      photos:[{id:'1Oosyi1X3GMY9eX0EJKCLYPEkFCQ6WdBQ',name:'37.jpg'}]
    }
  ];

  const roomRuntimeStyle=document.createElement('style');
  roomRuntimeStyle.textContent='.room-card .room-visual{padding:0;position:relative;overflow:hidden;background:#eef2f0}.room-card .room-visual img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .22s ease}.room-card:hover .room-visual img,.room-card:focus-visible .room-visual img{transform:scale(1.025)}.room-card .room-visual .room-photo-count{position:absolute;left:12px;bottom:12px;background:rgba(255,255,255,.94);border:1px solid rgba(221,228,226,.95);border-radius:999px;padding:6px 9px;font-size:.7rem;font-weight:850;color:#12383e;box-shadow:0 4px 14px rgba(13,43,49,.1)}.room-gallery-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.room-gallery-grid button{border:0;padding:0;background:#eee;border-radius:14px;overflow:hidden;cursor:pointer}.room-gallery-grid img{width:100%;height:360px;object-fit:cover;display:block;transition:transform .2s ease}.room-gallery-grid button:hover img{transform:scale(1.018)}@media(max-width:780px){.room-gallery-grid{grid-template-columns:1fr}.room-gallery-grid img{height:auto;max-height:72vh}}';
  document.head.appendChild(roomRuntimeStyle);

  const roomScroll=$('sleepingScroll');
  if(roomScroll){
    roomScroll.innerHTML='';
    roomGroups.forEach((room,roomIndex)=>{
      const card=document.createElement('button');
      card.type='button';
      card.className='sleep-card room-card';
      card.dataset.roomIndex=String(roomIndex);
      const cover=room.photos[0];
      card.innerHTML=`<div class="room-visual"><img src="${thumb(cover.id,1000)}" alt="${room.name}"><span class="room-photo-count">${room.photos.length} photo${room.photos.length===1?'':'s'}</span></div><div class="room-card-copy"><strong>${room.name}</strong><span>Room photo collection</span><span class="room-link">View ${room.photos.length} photo${room.photos.length===1?'':'s'} →</span></div>`;
      card.addEventListener('click',()=>openRoom(room));
      roomScroll.appendChild(card);
    });
  }

  const roomModal=$('roomGalleryModal'),roomGrid=$('roomGalleryGrid'),roomTitle=$('roomGalleryTitle'),roomSubtitle=$('roomGallerySubtitle');
  function openRoom(room){
    if(!roomModal||!roomGrid)return;
    roomTitle.textContent=room.name;
    roomSubtitle.textContent=`${room.photos.length} photo${room.photos.length===1?'':'s'} · Google Drive room collection`;
    roomGrid.innerHTML='';
    room.photos.forEach((photo,i)=>{
      const b=document.createElement('button');b.type='button';
      b.innerHTML=`<img src="${thumb(photo.id,1800)}" alt="${room.name} photo ${i+1}">`;
      roomGrid.appendChild(b);
    });
    roomModal.classList.add('show');document.body.classList.add('modal-open');
  }
  $('roomGalleryClose')?.addEventListener('click',()=>{roomModal?.classList.remove('show');document.body.classList.remove('modal-open')});
  roomModal?.addEventListener('click',e=>{if(e.target===roomModal)$('roomGalleryClose')?.click()});
  $('roomPrev')?.addEventListener('click',()=>roomScroll?.scrollBy({left:-330,behavior:'smooth'}));
  $('roomNext')?.addEventListener('click',()=>roomScroll?.scrollBy({left:330,behavior:'smooth'}));

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
