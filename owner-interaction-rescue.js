(()=>{
  const root=document.documentElement;
  if(root.dataset.ownerInteractionRescueLoaded)return;
  root.dataset.ownerInteractionRescueLoaded='1';

  const style=document.createElement('style');
  style.textContent=`
    /* Override the older .phase5-backbar:not(.hidden) floating control. */
    html[data-owner-interaction-rescue-loaded="1"] .phase5-backbar{display:none!important}
    #ownerRescueBack{position:fixed;right:18px;bottom:18px;z-index:10000;display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--line,#dfe6e4);border-radius:999px;background:#fff;box-shadow:0 16px 42px rgba(13,43,49,.22);font-family:Inter,system-ui,sans-serif;transition:transform .15s ease,opacity .15s ease;max-width:min(360px,calc(100vw - 28px))}
    #ownerRescueBack.rescue-hidden{display:none!important}
    #ownerRescueBack button{border:0;border-radius:999px;padding:9px 13px;font:inherit;font-weight:850;background:var(--deep,#0d2b31);color:#fff;cursor:pointer;white-space:nowrap}
    #ownerRescueBack button:disabled{opacity:.45;cursor:default}
    #ownerRescueBack span{font-size:.76rem;color:var(--muted,#6b7d80);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:210px}
    #ownerRescueBack.rescue-pulse{animation:ownerRescuePulse .7s ease}
    @keyframes ownerRescuePulse{0%{transform:scale(.96)}45%{transform:scale(1.05)}100%{transform:scale(1)}}
    @media(max-width:560px){#ownerRescueBack{right:10px;bottom:10px}#ownerRescueBack span{max-width:130px}}
  `;
  document.head.appendChild(style);

  const back=document.createElement('div');
  back.id='ownerRescueBack';
  back.className='rescue-hidden';
  back.innerHTML='<button type="button" disabled>← Back</button><span>Previous view</span>';
  document.body.appendChild(back);
  const backButton=back.querySelector('button');
  const backLabel=back.querySelector('span');

  const history=[];
  let internalClick=false;
  let restoring=false;

  function tabLabel(id){return ({dashboard:'Dashboard',finance:'Finance',reservations:'Reservations',tasks:'Task Board',bookingCalendar:'Booking Calendar',pricing:'Pricing Calendar',team:'Team'}[id]||id||'previous view')}
  function activeTab(){return document.querySelector('.tab.active[data-tab]')?.dataset.tab||''}
  function portalVisible(){const p=document.getElementById('portal');return !!p&&!p.classList.contains('hidden')}

  function syncBack(){
    const hidden=!portalVisible();
    if(back.classList.contains('rescue-hidden')!==hidden)back.classList.toggle('rescue-hidden',hidden);
    const item=history[history.length-1];
    if(backButton.disabled!==!item)backButton.disabled=!item;
    const label=item?`Return to ${tabLabel(item.tab)}`:'Previous view';
    // This runs inside a subtree observer. Replacing unchanged text creates
    // another childList mutation and otherwise keeps the browser in a loop.
    if(backLabel.textContent!==label)backLabel.textContent=label;
  }

  function pulseBack(){
    if(back.classList.contains('rescue-hidden'))return;
    back.classList.remove('rescue-pulse');
    void back.offsetWidth;
    back.classList.add('rescue-pulse');
  }

  function forceTab(tabId){
    const tab=document.querySelector(`.tab[data-tab="${tabId}"]`);
    const panel=document.getElementById(tabId);
    if(!tab||!panel)return false;
    document.querySelectorAll('.tab[data-tab]').forEach(x=>x.classList.toggle('active',x===tab));
    document.querySelectorAll('.panel').forEach(x=>x.classList.toggle('active',x===panel));
    return true;
  }

  function focusTarget(selector,attempt=0){
    if(!selector)return;
    const el=document.querySelector(selector);
    if(el){el.scrollIntoView({behavior:'smooth',block:'center'});return}
    if(attempt<12)setTimeout(()=>focusTarget(selector,attempt+1),100);
  }

  function dispatchNav(from,tabId,options){
    try{window.dispatchEvent(new CustomEvent('cjt:owner-nav',{detail:{from,tab:tabId,...options,rescue:true}}))}catch{}
  }

  function navigate(tabId,options={},push=true){
    const from=activeTab();
    if(push&&from&&from!==tabId)history.push({tab:from,scrollY:Math.max(0,window.scrollY||0)});

    const move=()=>forceTab(tabId);
    if(!move()){
      let tries=0;
      const timer=setInterval(()=>{
        tries++;
        if(move()||tries>=20){clearInterval(timer);if(tries<20){navigate(tabId,options,false)}}
      },100);
      return false;
    }

    const tab=document.querySelector(`.tab[data-tab="${tabId}"]`);
    internalClick=true;
    try{tab?.click()}catch{}
    internalClick=false;

    // Reassert after every existing module has had a chance to run.
    forceTab(tabId);
    queueMicrotask(()=>forceTab(tabId));
    requestAnimationFrame(()=>forceTab(tabId));
    setTimeout(()=>forceTab(tabId),80);
    setTimeout(()=>forceTab(tabId),260);

    dispatchNav(from,tabId,options);
    setTimeout(()=>focusTarget(options.target),100);
    syncBack();
    if(push&&from&&from!==tabId)pulseBack();
    return true;
  }

  function restore(item){
    if(!item)return;
    restoring=true;
    navigate(item.tab,{},false);
    setTimeout(()=>{window.scrollTo({top:Number(item.scrollY||0),behavior:'smooth'});restoring=false;syncBack()},180);
  }

  backButton.addEventListener('click',()=>{
    if(backButton.disabled)return;
    restore(history.pop());
    syncBack();
  });

  // Replace the shared navigation method with the direct, visual-first implementation.
  const existing=window.CJTOwnerNav||{};
  window.CJTOwnerNav={...existing,openTab:(id,opts={})=>navigate(id,opts,true),focusTarget,setActiveState:forceTab};

  function cardWith(id,target){
    const card=target.closest('.kpi,.ops-kpi');
    return card&&card.querySelector(`#${id}`)?card:null;
  }

  document.addEventListener('click',e=>{
    if(internalClick)return;

    const tab=e.target.closest('.tab[data-tab]');
    if(tab){
      const id=tab.dataset.tab;
      queueMicrotask(()=>forceTab(id));
      requestAnimationFrame(()=>forceTab(id));
      setTimeout(()=>forceTab(id),80);
      return;
    }

    let route=null;
    if(cardWith('kpiReservations',e.target))route={tab:'reservations',options:{filter:'active'}};
    else if(cardWith('kpiTasks',e.target))route={tab:'tasks',options:{filter:'open'}};
    else if(cardWith('kpiArrivals',e.target))route={tab:'bookingCalendar',options:{target:'#bkCalendar',range:'next14'}};
    else if(cardWith('kpiUsers',e.target))route={tab:'team',options:{}};
    else if(cardWith('opsPayout90',e.target))route={tab:'bookingCalendar',options:{target:'#bkFinancialList',intent:'expected-payout'}};
    else if(cardWith('opsMatchPct',e.target))route={tab:'bookingCalendar',options:{target:'#bkUnmatched',intent:'unmatched-revenue'}};
    else if(cardWith('opsAttentionCount',e.target))route={tab:'dashboard',options:{target:'#opsAttention'}};
    else {
      const shortcut=e.target.closest('[data-open-tab]');
      if(shortcut)route={tab:shortcut.dataset.openTab,options:{}};
    }

    if(!route)return;
    e.preventDefault();
    e.stopImmediatePropagation();
    navigate(route.tab,route.options,true);
  },true);

  // Any navigation event emitted by an older module is forced visually as a final safety net.
  window.addEventListener('cjt:owner-nav',e=>{
    if(restoring)return;
    const d=e.detail||{};
    if(d.tab){forceTab(d.tab);queueMicrotask(()=>forceTab(d.tab));setTimeout(()=>forceTab(d.tab),100)}
    syncBack();
  });

  function maintain(){
    syncBack();
    // Keep the visible panel synchronized with the active tab if another module drifts.
    const id=activeTab();
    if(id&&portalVisible()){
      const panel=document.getElementById(id);
      if(panel&&!panel.classList.contains('active'))forceTab(id);
    }
  }
  maintain();
  new MutationObserver(maintain).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  window.addEventListener('pageshow',maintain);
})();
