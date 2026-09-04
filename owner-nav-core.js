(()=>{
  const root=document.documentElement;
  if(root.dataset.ownerNavCoreLoaded)return;
  root.dataset.ownerNavCoreLoaded='1';

  const history=[];
  let applying=false;

  const style=document.createElement('style');
  style.textContent=`
    .owner-core-click{cursor:pointer}
    .owner-core-click:focus-visible{outline:3px solid rgba(20,52,58,.18);outline-offset:2px}
    .owner-core-hidden{display:none!important}
    .owner-core-context{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:0 0 12px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:#f8fbfa;font-size:.8rem}
    #ownerCoreBack{position:fixed;right:18px;bottom:18px;z-index:10000;display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--line);border-radius:999px;background:#fff;box-shadow:0 16px 42px rgba(13,43,49,.22);max-width:min(360px,calc(100vw - 28px))}
    #ownerCoreBack.owner-core-off{display:none!important}
    #ownerCoreBack button{border:0;border-radius:999px;padding:9px 13px;font:inherit;font-weight:850;background:var(--deep);color:#fff;cursor:pointer;white-space:nowrap}
    #ownerCoreBack button:disabled{opacity:.45;cursor:default}
    #ownerCoreBack span{font-size:.76rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:210px}
    #ownerCoreBack.owner-core-pulse{animation:ownerCorePulse .65s ease}
    @keyframes ownerCorePulse{0%{transform:scale(.96)}45%{transform:scale(1.05)}100%{transform:scale(1)}}
    @media(max-width:560px){#ownerCoreBack{right:10px;bottom:10px}#ownerCoreBack span{max-width:130px}}
  `;
  document.head.appendChild(style);

  const back=document.createElement('div');
  back.id='ownerCoreBack';
  back.className='owner-core-off';
  back.innerHTML='<button type="button" disabled>← Back</button><span>No previous view</span>';
  document.body.appendChild(back);
  const backButton=back.querySelector('button');
  const backLabel=back.querySelector('span');

  const labels={dashboard:'Dashboard',finance:'Finance',reservations:'Reservations',tasks:'Task Board',bookingCalendar:'Booking Calendar',pricing:'Pricing Calendar',team:'Team'};
  const activeTab=()=>document.querySelector('.tab.active[data-tab]')?.dataset.tab||'';
  const portalVisible=()=>{const p=document.getElementById('portal');return !!p&&!p.classList.contains('hidden')};

  function syncBack(){
    back.classList.toggle('owner-core-off',!portalVisible());
    const top=history[history.length-1];
    backButton.disabled=!top;
    backLabel.textContent=top?`Return to ${labels[top.tab]||top.tab}`:'No previous view';
  }

  function pulseBack(){
    if(back.classList.contains('owner-core-off'))return;
    back.classList.remove('owner-core-pulse');
    void back.offsetWidth;
    back.classList.add('owner-core-pulse');
  }

  function setVisible(tabId){
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

  function clearTaskFilter(){
    document.querySelector('#tasks-done')?.closest('.boardcol')?.classList.remove('owner-core-hidden');
    document.getElementById('ownerCoreTaskContext')?.remove();
  }

  function applyTaskFilter(options){
    clearTaskFilter();
    if(options?.filter!=='open')return;
    const done=document.querySelector('#tasks-done')?.closest('.boardcol');
    if(done)done.classList.add('owner-core-hidden');
    const section=document.getElementById('tasks');
    if(section){
      const box=document.createElement('div');
      box.id='ownerCoreTaskContext';box.className='owner-core-context';
      box.innerHTML='<strong>Showing open tasks only</strong><button type="button" class="btn ghost small">Show Done</button>';
      section.prepend(box);box.querySelector('button').onclick=clearTaskFilter;
    }
  }

  function applyOptions(tabId,options={}){
    if(tabId==='tasks')applyTaskFilter(options);
    if(options.target)setTimeout(()=>focusTarget(options.target),120);
  }

  function announce(from,tabId,options){
    try{window.dispatchEvent(new CustomEvent('cjt:tab-opened',{detail:{from,tab:tabId,...options}}))}catch{}
  }

  function openTab(tabId,options={}){
    const from=activeTab();
    if(!setVisible(tabId)){
      let tries=0;
      const timer=setInterval(()=>{
        tries++;
        if(setVisible(tabId)||tries>=20){
          clearInterval(timer);
          if(tries<20){applyOptions(tabId,options);announce(from,tabId,options);syncBack()}
        }
      },100);
      return false;
    }

    if(!options.replace&&from&&from!==tabId){
      history.push({tab:from,scrollY:Math.max(0,window.scrollY||0)});
      if(history.length>20)history.shift();
    }
    applyOptions(tabId,options);
    announce(from,tabId,options);
    syncBack();
    if(!options.replace&&from&&from!==tabId)pulseBack();
    return true;
  }

  function restore(item){
    if(!item)return;
    applying=true;
    setVisible(item.tab);
    announce(activeTab(),item.tab,{restore:true});
    setTimeout(()=>{window.scrollTo({top:Number(item.scrollY||0),behavior:'smooth'});applying=false;syncBack()},140);
  }

  backButton.addEventListener('click',()=>{
    if(backButton.disabled)return;
    const item=history.pop();
    restore(item);
    syncBack();
  });

  window.CJTOwnerNav={openTab,focusTarget,setActiveState:setVisible};

  const channelMap={airbnb:'airbnb',vrbo:'vrbo','booking.com':'booking.com',houfy:'houfy','cjt direct':'direct',direct:'direct',other:'other'};

  function kpiRoute(target){
    const card=target.closest('.kpi,.ops-kpi');
    if(!card)return null;
    if(card.querySelector('#kpiReservations'))return {tab:'reservations',options:{filter:'active'}};
    if(card.querySelector('#kpiTasks'))return {tab:'tasks',options:{filter:'open'}};
    if(card.querySelector('#kpiArrivals'))return {tab:'bookingCalendar',options:{target:'#bkCalendar',range:'next14'}};
    if(card.querySelector('#kpiUsers'))return {tab:'team',options:{}};
    if(card.querySelector('#opsAttentionCount'))return {tab:'dashboard',options:{target:'#opsAttention'}};
    if(card.querySelector('#opsPayout90'))return {tab:'bookingCalendar',options:{target:'#bkFinancialList',intent:'expected-payout'}};
    if(card.querySelector('#opsMatchPct'))return {tab:'bookingCalendar',options:{target:'#bkUnmatched',intent:'unmatched-revenue'}};
    return null;
  }

  document.addEventListener('click',e=>{
    if(applying)return;

    const tab=e.target.closest('.tab[data-tab]');
    if(tab){
      e.preventDefault();e.stopImmediatePropagation();
      openTab(tab.dataset.tab,{});
      return;
    }

    const shortcut=e.target.closest('[data-open-tab]');
    if(shortcut){
      e.preventDefault();e.stopImmediatePropagation();
      openTab(shortcut.dataset.openTab,{});
      return;
    }

    const inline=e.target.closest('[data-open-inline]');
    if(inline){
      e.preventDefault();e.stopImmediatePropagation();
      openTab('bookingCalendar',{target:'#bkCalendar'});
      return;
    }

    const route=kpiRoute(e.target);
    if(route){
      e.preventDefault();e.stopImmediatePropagation();
      openTab(route.tab,route.options);
      return;
    }

    const channelRow=e.target.closest('#opsChannels .ops-revenue-row');
    if(channelRow){
      const text=(channelRow.firstElementChild?.textContent||'').trim().toLowerCase();
      e.preventDefault();e.stopImmediatePropagation();
      openTab('finance',{filter:'channel',value:channelMap[text]||text,target:'#finTable'});
      return;
    }

    const monthRow=e.target.closest('#opsMonthly .ops-month:not(.head)');
    if(monthRow){
      const text=(monthRow.firstElementChild?.textContent||'').trim();
      const parsed=new Date(`${text} 1`);
      if(!Number.isNaN(parsed.getTime())){
        e.preventDefault();e.stopImmediatePropagation();
        openTab('finance',{filter:'month',value:parsed.getMonth()+1,target:'#finTable'});
      }
    }
  },true);

  function decorate(){
    ['kpiReservations','kpiTasks','kpiArrivals','kpiUsers','opsAttentionCount','opsPayout90','opsMatchPct'].forEach(id=>{
      const card=document.getElementById(id)?.closest('.kpi,.ops-kpi');
      if(card){card.classList.add('owner-core-click');card.setAttribute('tabindex','0')}
    });
    document.querySelectorAll('#opsChannels .ops-revenue-row,#opsMonthly .ops-month:not(.head),[data-open-tab]').forEach(x=>x.classList.add('owner-core-click'));
    syncBack();
  }

  decorate();
  new MutationObserver(decorate).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  window.addEventListener('pageshow',decorate);
})();
