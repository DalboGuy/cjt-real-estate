(()=>{
  const root=document.documentElement;
  if(root.dataset.ownerNavigationLoaded)return;
  root.dataset.ownerNavigationLoaded='1';

  const style=document.createElement('style');
  style.textContent=`
    .owner-drilldown{cursor:pointer;position:relative;transition:transform .12s ease,border-color .12s ease,box-shadow .12s ease}
    .owner-drilldown:hover{transform:translateY(-1px);border-color:#9db0ad!important;box-shadow:0 10px 24px rgba(13,43,49,.08)}
    .owner-drilldown:focus-visible{outline:3px solid rgba(20,52,58,.18);outline-offset:2px}
    .owner-nav-flash{animation:ownerNavFlash 1.25s ease}
    @keyframes ownerNavFlash{0%,100%{box-shadow:inherit}35%{box-shadow:0 0 0 4px rgba(49,93,100,.16),0 10px 30px rgba(13,43,49,.08)}}
  `;
  document.head.appendChild(style);

  function activateTab(tabId){
    const button=document.querySelector(`.tab[data-tab="${tabId}"]`);
    if(!button)return false;
    button.click();
    return true;
  }

  function focusTarget(selector,attempt=0){
    if(!selector)return;
    const el=document.querySelector(selector);
    if(el){
      el.scrollIntoView({behavior:'smooth',block:'center'});
      el.classList.add('owner-nav-flash');
      setTimeout(()=>el.classList.remove('owner-nav-flash'),1400);
      return;
    }
    if(attempt<8)setTimeout(()=>focusTarget(selector,attempt+1),120);
  }

  function openTab(tabId,options={}){
    const from=document.querySelector('.tab.active')?.dataset.tab||'';
    const detail={from,tab:tabId,...options};
    const opened=activateTab(tabId);
    if(!opened){
      let tries=0;
      const timer=setInterval(()=>{
        tries++;
        if(activateTab(tabId)||tries>=12){
          clearInterval(timer);
          if(tries<12)focusTarget(options.target);
        }
      },100);
    }else{
      setTimeout(()=>focusTarget(options.target),80);
    }
    window.dispatchEvent(new CustomEvent('cjt:owner-nav',{detail}));
  }

  function scrollWithinDashboard(selector){
    openTab('dashboard',{target:selector});
  }

  window.CJTOwnerNav={openTab,focusTarget};

  function bind(el,handler,label){
    if(!el||el.dataset.ownerNavBound==='1')return;
    el.dataset.ownerNavBound='1';
    el.classList.add('owner-drilldown');
    el.setAttribute('role','button');
    el.setAttribute('tabindex','0');
    if(label){el.setAttribute('aria-label',label);el.title=label}
    el.addEventListener('click',e=>{
      if(e.target.closest('button,a,input,select,textarea'))return;
      handler();
    });
    el.addEventListener('keydown',e=>{
      if(e.key==='Enter'||e.key===' '){e.preventDefault();handler()}
    });
  }

  function bindKpiByValueId(valueId,handler,label){
    const value=document.getElementById(valueId);
    bind(value?.closest('.kpi,.ops-kpi'),handler,label);
  }

  function bindPhaseTwo(){
    bindKpiByValueId('kpiReservations',()=>openTab('reservations',{filter:'active'}),'Open active reservations');
    bindKpiByValueId('kpiTasks',()=>openTab('tasks',{filter:'open'}),'Open open tasks');
    bindKpiByValueId('kpiArrivals',()=>openTab('bookingCalendar',{target:'#bkCalendar',range:'next14'}),'Open upcoming arrivals in Booking Calendar');
    bindKpiByValueId('kpiUsers',()=>openTab('team'),'Open team members');

    bindKpiByValueId('opsAttentionCount',()=>scrollWithinDashboard('#opsAttention'),'Review items needing attention');
    bindKpiByValueId('opsPayout90',()=>openTab('bookingCalendar',{target:'#bkFinancialList',intent:'expected-payout'}),'Open booking financial ledger for expected payouts');
    bindKpiByValueId('opsMatchPct',()=>openTab('bookingCalendar',{target:'#bkUnmatched',intent:'unmatched-revenue'}),'Open unmatched booking revenue records');
  }

  bindPhaseTwo();
  const observer=new MutationObserver(bindPhaseTwo);
  observer.observe(document.body,{childList:true,subtree:true});

  if(!document.querySelector('script[src*="owner-phase5-ux-fixes.js"]')){
    const script=document.createElement('script');
    script.src='/owner-phase5-ux-fixes.js?v=20260904-2';
    document.body.appendChild(script);
  }
})();
