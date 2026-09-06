(()=>{
  const $=id=>document.getElementById(id);
  const thumb=(id,w=1400)=>`https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${w}`;

  const lines=document.querySelector('.location-lines');
  if(lines)lines.setAttribute('viewBox','0 0 100 100');
  const mapAnchor=$('mapAnchor');
  function setMapLink(id,on){
    document.querySelectorAll('.location-lines path').forEach(p=>p.classList.remove('active'));
    if(on&&id)document.getElementById(id)?.classList.add('active');
    mapAnchor?.classList.toggle('active',!!on);
  }
  document.querySelectorAll('.aerial-card').forEach(card=>{
    const id=card.dataset.mapLine;
    card.addEventListener('mouseenter',()=>setMapLink(id,true));
    card.addEventListener('mouseleave',()=>setMapLink(id,false));
    card.addEventListener('focus',()=>setMapLink(id,true));
    card.addEventListener('blur',()=>setMapLink(id,false));
  });

  const roomModal=$('roomGalleryModal'),roomGrid=$('roomGalleryGrid'),roomTitle=$('roomGalleryTitle'),roomSubtitle=$('roomGallerySubtitle');
  function openRoom(card){
    const ids=(card.dataset.roomPhotos||'').split(',').filter(Boolean);
    roomTitle.textContent=card.dataset.roomTitle||'Bedroom';
    roomSubtitle.textContent=card.dataset.roomSubtitle||'';
    roomGrid.innerHTML='';
    ids.forEach((id,i)=>{
      const b=document.createElement('button');b.type='button';
      b.innerHTML=`<img src="${thumb(id,1800)}" alt="${card.dataset.roomTitle||'Bedroom'} photo ${i+1}">`;
      b.onclick=()=>{
        const existing=[...document.querySelectorAll('[data-photo-index]')].find(el=>el.querySelector(`img[src*="${id}"]`));
        if(existing){$('roomGalleryClose').click();existing.click()}
      };
      roomGrid.appendChild(b);
    });
    roomModal.classList.add('show');document.body.classList.add('modal-open');
  }
  document.querySelectorAll('[data-room-photos]').forEach(card=>card.addEventListener('click',()=>openRoom(card)));
  $('roomGalleryClose')?.addEventListener('click',()=>{roomModal.classList.remove('show');document.body.classList.remove('modal-open')});
  roomModal?.addEventListener('click',e=>{if(e.target===roomModal)$('roomGalleryClose').click()});

  const roomScroll=$('sleepingScroll');
  $('roomPrev')?.addEventListener('click',()=>roomScroll?.scrollBy({left:-300,behavior:'smooth'}));
  $('roomNext')?.addEventListener('click',()=>roomScroll?.scrollBy({left:300,behavior:'smooth'}));

  const reviewRail=$('reviewRail');
  $('reviewPrev')?.addEventListener('click',()=>reviewRail?.scrollBy({left:-330,behavior:'smooth'}));
  $('reviewNext')?.addEventListener('click',()=>reviewRail?.scrollBy({left:330,behavior:'smooth'}));
  document.querySelector('.review-jump')?.addEventListener('click',()=>$('reviewFeed')?.scrollIntoView({behavior:'smooth',block:'start'}));

  const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let reviewTimer=null;
  function startReviewScroll(){
    if(reduceMotion||!reviewRail||reviewTimer)return;
    reviewTimer=setInterval(()=>{
      const max=reviewRail.scrollWidth-reviewRail.clientWidth;
      if(max<=10)return;
      const nearEnd=reviewRail.scrollLeft>=max-20;
      reviewRail.scrollTo({left:nearEnd?0:Math.min(max,reviewRail.scrollLeft+330),behavior:'smooth'});
    },6500);
  }
  function stopReviewScroll(){if(reviewTimer){clearInterval(reviewTimer);reviewTimer=null}}
  reviewRail?.addEventListener('mouseenter',stopReviewScroll);
  reviewRail?.addEventListener('mouseleave',startReviewScroll);
  reviewRail?.addEventListener('focusin',stopReviewScroll);
  reviewRail?.addEventListener('focusout',startReviewScroll);
  startReviewScroll();

  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&roomModal?.classList.contains('show'))$('roomGalleryClose').click();
  });
})();
