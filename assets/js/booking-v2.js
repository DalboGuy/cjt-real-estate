(()=>{
  const $=id=>document.getElementById(id);

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
})();