(()=>{
  const root=document.documentElement;
  if(root.dataset.ownerMobileUiLoaded)return;
  root.dataset.ownerMobileUiLoaded='1';

  const forced=location.pathname==='/owner-mobile';
  const mq=window.matchMedia('(max-width: 820px)');
  let active=false;

  const viewport=document.querySelector('meta[name="viewport"]')||document.createElement('meta');
  viewport.name='viewport';viewport.content='width=device-width,initial-scale=1,viewport-fit=cover';
  if(!viewport.parentNode)document.head.appendChild(viewport);

  const style=document.createElement('style');
  style.textContent=`
    body.owner-mobile{padding-bottom:88px!important;overflow-x:hidden}
    body.owner-mobile .wrap{width:100%!important;max-width:none!important;padding:10px 10px 96px!important}
    body.owner-mobile .top{gap:8px!important;align-items:flex-start!important;margin-bottom:10px!important}
    body.owner-mobile .top h1{font-size:1.25rem!important;line-height:1.12!important}
    body.owner-mobile .top .meta{font-size:.72rem!important}
    body.owner-mobile .top>div:last-child{width:100%;justify-content:space-between!important}
    body.owner-mobile #who{max-width:72vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    body.owner-mobile .tabs{display:none!important}
    body.owner-mobile .kpis{grid-template-columns:1fr 1fr!important;gap:8px!important;margin:8px 0 12px!important}
    body.owner-mobile .kpi,body.owner-mobile .ops-kpi,body.owner-mobile .fin-kpi,body.owner-mobile .booking-kpi{min-height:78px!important;padding:12px!important;border-radius:14px!important}
    body.owner-mobile .kpi b,body.owner-mobile .ops-kpi b,body.owner-mobile .fin-kpi b,body.owner-mobile .booking-kpi b{font-size:1.25rem!important}
    body.owner-mobile .panel{padding:0!important}
    body.owner-mobile .sectionhead,body.owner-mobile .ops-header,body.owner-mobile .fin-head,body.owner-mobile .booking-section-title{gap:8px!important;align-items:flex-start!important}
    body.owner-mobile .sectionhead h2,body.owner-mobile .ops-header h2,body.owner-mobile .booking-section-title h2{font-size:1.35rem!important;margin-bottom:2px!important}
    body.owner-mobile .fin-head h2{font-size:1.7rem!important}
    body.owner-mobile .grid,body.owner-mobile .ops-layout,body.owner-mobile .ops-two,body.owner-mobile .booking-layout,body.owner-mobile .formgrid,body.owner-mobile .formgrid.three,body.owner-mobile .booking-form-grid{grid-template-columns:1fr!important}
    body.owner-mobile .ops-grid,body.owner-mobile .fin-kpis,body.owner-mobile .booking-kpis{grid-template-columns:1fr 1fr!important;gap:8px!important}
    body.owner-mobile .card,body.owner-mobile .ops-card,body.owner-mobile .fin-card{padding:12px!important;border-radius:14px!important;margin-bottom:10px!important}
    body.owner-mobile .kanban{display:block!important;overflow:visible!important}
    body.owner-mobile .boardcol{margin-bottom:12px!important;min-width:0!important}
    body.owner-mobile .taskcard{padding:12px!important}
    body.owner-mobile .taskcard .actions{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px!important}
    body.owner-mobile .taskcard .actions .btn{width:100%!important;min-height:42px!important}
    body.owner-mobile .btn,body.owner-mobile button,body.owner-mobile input,body.owner-mobile select,body.owner-mobile textarea{font-size:16px}
    body.owner-mobile .btn.small{min-height:40px!important;padding:8px 10px!important;font-size:.78rem!important}
    body.owner-mobile input,body.owner-mobile select,body.owner-mobile textarea{min-height:44px}
    body.owner-mobile .actions{gap:7px!important;flex-wrap:wrap!important}
    body.owner-mobile .calendarbar{position:sticky;top:0;z-index:7;background:var(--bg,#f5f7f6);padding:6px 0!important}
    body.owner-mobile .calendargrid,body.owner-mobile .booking-calendar{grid-template-columns:repeat(7,minmax(38px,1fr))!important;gap:3px!important;overflow:visible!important}
    body.owner-mobile .day,body.owner-mobile .booking-day{min-height:78px!important;padding:4px!important;border-radius:8px!important}
    body.owner-mobile .daynum,body.owner-mobile .booking-day-number{font-size:.78rem!important}
    body.owner-mobile .rate,body.owner-mobile .day-money{font-size:.63rem!important;line-height:1.1!important}
    body.owner-mobile .daylabel,body.owner-mobile .note,body.owner-mobile .source-chip{font-size:.54rem!important;line-height:1.1!important}
    body.owner-mobile .market-event-chip{font-size:.5rem!important;padding:2px 3px!important}
    body.owner-mobile .market-context-kpis{grid-template-columns:1fr 1fr!important}
    body.owner-mobile .ops-stay{grid-template-columns:1fr auto!important;gap:7px!important}
    body.owner-mobile .ops-stay .ops-date{grid-column:1/-1!important}
    body.owner-mobile .ops-month{grid-template-columns:70px repeat(4,minmax(66px,1fr))!important;overflow-x:auto!important}
    body.owner-mobile .fin-chart-wrap,body.owner-mobile .fin-table-wrap{overflow-x:auto!important;-webkit-overflow-scrolling:touch}
    body.owner-mobile .fin-chart{min-width:650px!important}
    body.owner-mobile .fin-table{min-width:700px!important}
    body.owner-mobile .owner-detail-drawer,body.owner-mobile .market-event-drawer{width:100vw!important;max-width:100vw!important}
    body.owner-mobile #ownerCoreBack{right:10px!important;bottom:82px!important;max-width:calc(100vw - 20px)!important;z-index:10020!important}
    body.owner-mobile #ownerCoreBack span{max-width:150px!important}
    body.owner-mobile .phase5-task-toast{bottom:136px!important;width:calc(100vw - 20px)!important}
    body.owner-mobile .mobile-owner-nav{display:grid!important}
    body.owner-mobile .mobile-owner-more-backdrop{display:block}
    .mobile-owner-nav{display:none;position:fixed;left:0;right:0;bottom:0;z-index:10010;grid-template-columns:repeat(5,1fr);padding:7px 6px calc(7px + env(safe-area-inset-bottom));background:rgba(255,255,255,.97);border-top:1px solid var(--line,#dfe6e4);box-shadow:0 -10px 30px rgba(13,43,49,.10);backdrop-filter:blur(12px)}
    .mobile-owner-nav button{appearance:none;border:0;background:transparent;color:var(--muted,#6b7d80);min-height:50px;padding:4px 2px;border-radius:10px;font-size:.64rem;font-weight:800;display:grid;place-items:center;gap:1px;cursor:pointer}
    .mobile-owner-nav button b{font-size:1.15rem;line-height:1;font-weight:600}
    .mobile-owner-nav button.active{background:var(--soft,#eef2f1);color:var(--deep,#0d2b31)}
    .mobile-owner-more-backdrop{display:none;position:fixed;inset:0;z-index:10030;background:rgba(7,27,31,.35)}
    .mobile-owner-more{position:absolute;left:10px;right:10px;bottom:calc(74px + env(safe-area-inset-bottom));background:#fff;border:1px solid var(--line,#dfe6e4);border-radius:18px;padding:10px;box-shadow:0 20px 60px rgba(13,43,49,.24)}
    .mobile-owner-more h3{margin:4px 6px 9px;font-size:1rem}
    .mobile-owner-more button{width:100%;border:0;background:var(--soft,#eef2f1);color:var(--deep,#0d2b31);border-radius:12px;min-height:48px;text-align:left;padding:10px 12px;font-size:.9rem;font-weight:800;margin:4px 0;cursor:pointer}
    @media(min-width:821px){body:not(.owner-mobile) .mobile-owner-nav,body:not(.owner-mobile) .mobile-owner-more-backdrop{display:none!important}}
  `;
  document.head.appendChild(style);

  const nav=document.createElement('nav');
  nav.className='mobile-owner-nav';nav.setAttribute('aria-label','Owner portal mobile navigation');
  nav.innerHTML=`
    <button type="button" data-mobile-tab="dashboard"><b>⌂</b><span>Home</span></button>
    <button type="button" data-mobile-tab="reservations"><b>▣</b><span>Bookings</span></button>
    <button type="button" data-mobile-tab="bookingCalendar"><b>▦</b><span>Calendar</span></button>
    <button type="button" data-mobile-tab="tasks"><b>✓</b><span>Tasks</span></button>
    <button type="button" data-mobile-more><b>•••</b><span>More</span></button>`;
  document.body.appendChild(nav);

  const moreBackdrop=document.createElement('div');moreBackdrop.className='mobile-owner-more-backdrop';
  moreBackdrop.innerHTML=`<div class="mobile-owner-more" role="dialog" aria-modal="true" aria-label="More owner tools"><h3>More</h3><button type="button" data-mobile-tab="finance">Finance</button><button type="button" data-mobile-tab="pricing">Pricing Calendar</button><button type="button" data-mobile-tab="team">Team</button><button type="button" data-mobile-tab="reservations">Reservations & Holds</button></div>`;
  document.body.appendChild(moreBackdrop);

  const primary=new Set(['dashboard','reservations','bookingCalendar','tasks']);
  function currentTab(){return document.querySelector('.tab.active[data-tab]')?.dataset.tab||''}
  function updateActive(id=currentTab()){
    nav.querySelectorAll('[data-mobile-tab]').forEach(b=>b.classList.toggle('active',b.dataset.mobileTab===id));
    nav.querySelector('[data-mobile-more]')?.classList.toggle('active',!!id&&!primary.has(id));
  }
  function openTab(id){
    moreBackdrop.classList.remove('open');moreBackdrop.style.display='none';
    if(window.CJTOwnerNav?.openTab)window.CJTOwnerNav.openTab(id,{});
    else document.querySelector(`.tab[data-tab="${id}"]`)?.click();
    setTimeout(()=>updateActive(id),40);
  }
  nav.addEventListener('click',e=>{
    const tab=e.target.closest('[data-mobile-tab]');if(tab){openTab(tab.dataset.mobileTab);return}
    if(e.target.closest('[data-mobile-more]')){moreBackdrop.style.display='block';}
  });
  moreBackdrop.addEventListener('click',e=>{
    const tab=e.target.closest('[data-mobile-tab]');if(tab){openTab(tab.dataset.mobileTab);return}
    if(e.target===moreBackdrop){moreBackdrop.style.display='none'}
  });
  window.addEventListener('cjt:tab-opened',e=>updateActive(e.detail?.tab));

  function syncMode(){
    const should=forced||mq.matches;
    if(should===active)return;active=should;
    document.body.classList.toggle('owner-mobile',should);
    if(!should)moreBackdrop.style.display='none';
    updateActive();
  }
  syncMode();
  mq.addEventListener?.('change',syncMode);

  new MutationObserver(()=>{syncMode();updateActive()}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
})();
