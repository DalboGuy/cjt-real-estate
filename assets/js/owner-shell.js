(function(){
  const PRIMARY=[
    {id:'overview',label:'Overview',href:'/owner-v1'},
    {id:'calendar',label:'Calendar',href:'/owner-v1/calendar'},
    {id:'bookings',label:'Bookings',href:'/owner-v1/reservations'},
    {id:'messages',label:'Messages',href:'/owner-v1/communications'},
    {id:'pricing',label:'Pricing',href:'/owner-v1/pricing'},
    {id:'financials',label:'Financials',href:'/owner-v1/financials'},
    {id:'tasks',label:'Tasks',href:'/owner-v1/tasks'}
  ];
  const SECONDARY=[
    {id:'documents',label:'Documents',href:'/owner-v1/documents'},
    {id:'property',label:'Property',href:'/owner-v1/property'},
    {id:'team',label:'Team',href:'/owner-v1/team'},
    {id:'settings',label:'Settings',href:'/owner-v1/settings'},
    {id:'admin',label:'Admin',href:'/admin-v1'}
  ];
  const BOTTOM=['overview','calendar','bookings','financials','more'];
  const CONTEXT_KEYS=['property','period','range','from','to','channel','source','status','stripe','q','booking','message','unread','view','date','focus','section','tab','season','assignee','due','id'];
  const STATUS_LABELS={inquiry_hold:'Request received',hold_verified:'Owner approved',contract_sent:'Contract sent',contract_signed:'Contract completed',confirmed:'Confirmed',completed:'Stay completed',pending:'Request received',released:'Released',expired:'Expired',cancelled:'Cancelled'};
  const EMPTY=new Set(['','all','false','undefined','null']);

  const sidebar=document.getElementById('ownerSidebar');
  const backdrop=document.getElementById('ownerBackdrop');
  const menu=document.getElementById('mobileMenu');
  const app=sidebar?.closest('.owner-app');
  const isMobile=()=>window.matchMedia('(max-width:780px)').matches;
  const path=normalizePath(location.pathname);
  const ownerPortal=path==='/owner-v1'||path.startsWith('/owner-v1/');
  let dirty=false;
  let moreOpen=false;

  function normalizePath(pathname){
    const raw=String(pathname||'').split('?')[0].split('#')[0];
    if(!raw||raw==='/')return '/';
    return raw.replace(/\/+$/,'')||'/';
  }
  function itemActive(item){
    if(item.id==='overview')return path==='/owner-v1'||path==='/owner-v1.html';
    return path===normalizePath(item.href)||path.startsWith(normalizePath(item.href)+'/');
  }
  function activeId(){
    return [...PRIMARY,...SECONDARY].find(itemActive)?.id||'';
  }
  function confirmLeave(){
    if(!dirty)return true;
    return window.confirm('You have unsaved changes. Leave this page anyway?');
  }
  function readContext(search){
    const raw=search==null?location.search:String(search||'');
    const params=new URLSearchParams(raw.startsWith('?')?raw.slice(1):raw);
    const context={};
    CONTEXT_KEYS.forEach(key=>{
      if(!params.has(key))return;
      const value=String(params.get(key)||'').trim();
      if(!value||EMPTY.has(value.toLowerCase()))return;
      context[key]=value;
    });
    if(context.range&&!context.period)context.period=context.range;
    if(context.period&&!context.range)context.range=context.period;
    if(context.source&&!context.channel)context.channel=context.source;
    return context;
  }
  function writeContext(patch,opts={}){
    if(opts.push)saveScroll();
    const next=writeContextSearch(location.search,patch,opts);
    const url=next.search?`${location.pathname}${next.search}`:location.pathname;
    if(opts.push)history.pushState({cjtContext:next.context},'',url);
    else history.replaceState({cjtContext:next.context},'',url);
    renderChips();
    return next.context;
  }
  function writeContextSearch(search,patch,opts={}){
    const current=readContext(search);
    const next={...current};
    Object.entries(patch||{}).forEach(([key,value])=>{
      if(value==null||value===false){delete next[key];return;}
      const text=String(value).trim();
      if(!text||EMPTY.has(text.toLowerCase()))delete next[key];
      else next[key]=text;
    });
    if(opts.clear){
      CONTEXT_KEYS.forEach(key=>{
        if(key==='property'&&!opts.clearProperty)return;
        delete next[key];
      });
      Object.assign(next,opts.keep||{});
    }
    const params=new URLSearchParams();
    CONTEXT_KEYS.forEach(key=>{if(next[key])params.set(key,next[key]);});
    if(next.property==null)params.set('property','sand-sea-manor');
    const query=params.toString();
    return {context:next,search:query?`?${query}`:''};
  }
  function chipLabels(){
    return {status:'Status',period:'Period',range:'Period',channel:'Channel',source:'Source',unread:'Unread',q:'Search',view:'View',date:'Date',focus:'Focus',section:'Section',tab:'Tab',season:'Season',assignee:'Assignee',due:'Due',booking:'Booking',message:'Message',stripe:'Stripe'};
  }
  const STATUS_DISPLAY={pending:'Request received',new:'Request received',inquiry_hold:'Request received',hold_verified:'Owner approved',contract_sent:'Contract sent',contract_signed:'Contract completed',confirmed:'Confirmed',completed:'Stay completed',action:'Need action',active:'Active',closed:'Closed'};
  const PERIOD_DISPLAY={month:'This month',ytd:'YTD',year:'This year',last12:'Last 12 months',all:'All'};
  function displayContextValue(key,value){
    const text=String(value||'');
    if(key==='status'&&STATUS_DISPLAY[text])return STATUS_DISPLAY[text];
    if((key==='period'||key==='range')&&PERIOD_DISPLAY[text])return PERIOD_DISPLAY[text];
    if(key==='unread'&&(text==='1'||text==='true'))return 'Unread only';
    return text;
  }
  function bookingFacts(record){
    const status=String(record?.status||'');
    const approved=['hold_verified','contract_sent','contract_signed','confirmed','completed'].includes(status);
    return [
      {id:'request_received',label:'Request received',done:Boolean(record?.id||status)},
      {id:'owner_approved',label:'Owner approved',done:approved},
      {id:'contract_sent',label:'Contract sent',done:Boolean(record?.contract_sent_at)||['contract_sent','contract_signed'].includes(status)},
      {id:'contract_completed',label:'Contract completed',done:Boolean(record?.contract_signed_at)||status==='contract_signed'},
      {id:'payment_received',label:'Payment received',done:Boolean(record?.payment?.verified||record?.deposit_received_at)},
      {id:'confirmed',label:'Confirmed',done:status==='confirmed'||status==='completed'}
    ];
  }
  function renderChips(){
    const host=document.getElementById('ownerContextChips');
    if(!host)return;
    const context=readContext();
    const labels=chipLabels();
    const chips=Object.entries(context).filter(([key])=>key!=='property').map(([key,value])=>({key,value,label:labels[key]||key}));
    if(!chips.length){host.innerHTML='';host.classList.add('hidden');return;}
    host.classList.remove('hidden');
    host.innerHTML=`${chips.map(chip=>`<button type="button" class="context-chip" data-clear-key="${chip.key}">${esc(chip.label)}: ${esc(displayContextValue(chip.key,chip.value))} ×</button>`).join('')}<button type="button" class="context-chip-clear" data-clear-all>Clear all</button>`;
    host.querySelectorAll('[data-clear-key]').forEach(btn=>btn.addEventListener('click',()=>{
      writeContext({[btn.getAttribute('data-clear-key')]:null},{push:true});
      window.dispatchEvent(new CustomEvent('cjt-context-change',{detail:readContext()}));
    }));
    host.querySelector('[data-clear-all]')?.addEventListener('click',()=>{
      writeContext({}, {clear:true,push:true});
      window.dispatchEvent(new CustomEvent('cjt-context-change',{detail:readContext()}));
    });
  }
  function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function safeNextPath(){
    const next=String(new URLSearchParams(location.search).get('next')||'').trim();
    if(!next.startsWith('/owner-v1'))return '';
    if(next.startsWith('//')||/^[a-z]+:/i.test(next))return '';
    return next.split('#')[0];
  }
  function afterLogin(){
    const next=safeNextPath();
    if(!next)return false;
    try{
      const dest=new URL(next,location.origin);
      if(dest.origin!==location.origin||!dest.pathname.startsWith('/owner-v1'))return false;
      if(normalizePath(dest.pathname)===path&&dest.search===location.search)return false;
      location.assign(`${dest.pathname}${dest.search}`);
      return true;
    }catch(e){return false;}
  }
  function cannotApply(selection,page){
    const what=String(selection||'that selection').trim()||'that selection';
    const where=String(page||'this page').trim()||'this page';
    return `${where} could not apply ${what}. The destination is open; clear filters or choose another record.`;
  }
  function statusLabel(value){
    const key=String(value||'').trim();
    return STATUS_LABELS[key]||key.replaceAll('_',' ');
  }
  function paymentLabel(record){
    const payment=record?.payment||{};
    if(payment.verified||record?.deposit_received_at)return 'Payment received';
    return 'Payment pending';
  }
  function markSticky(){
    if(!ownerPortal)return;
    if(!document.querySelector('.fp-sticky-bar,.fp-toolbar')){
      document.querySelector('.filter-bar')?.classList.add('owner-sticky-controls');
    }
    if(document.querySelector('.cal-ops,.cal-chrome')){
      document.querySelector('.cal-filter-bar')?.classList.add('owner-sticky-controls');
    }else{
      document.querySelector('.cal-toolbar')?.classList.add('owner-sticky-controls');
    }
  }

  window.CJTOwnerShell={
    markDirty(value=true){dirty=Boolean(value);},
    isDirty(){return dirty;},
    readContext,
    writeContext,
    cannotApply,
    statusLabel,
    paymentLabel,
    bookingFacts,
    displayContextValue,
    safeNextPath,
    afterLogin,
    primary:PRIMARY,
    secondary:SECONDARY
  };

  function navLink(item){
    const a=document.createElement('a');
    a.href=item.href;
    a.dataset.navId=item.id;
    if(itemActive(item)){
      a.classList.add('active');
      a.setAttribute('aria-current','page');
    }
    const label=document.createElement('span');
    label.textContent=item.label;
    a.appendChild(label);
    if(item.id==='messages'){
      const count=document.createElement('span');
      count.className='count';
      count.id='communicationsNavCount';
      count.textContent='0';
      a.appendChild(count);
    }
    a.addEventListener('click',e=>{
      if(!confirmLeave()){e.preventDefault();return;}
      closeNav();
    });
    return a;
  }

  function mountOwnerNav(){
    if(!ownerPortal||!sidebar)return;
    let nav=sidebar.querySelector('.nav');
    if(!nav){
      nav=document.createElement('nav');
      nav.className='nav';
      nav.setAttribute('aria-label','Owner Portal');
      sidebar.appendChild(nav);
    }
    nav.innerHTML='';
    PRIMARY.forEach(item=>nav.appendChild(navLink(item)));
    const section=document.createElement('div');
    section.className='nav-section';
    section.textContent='More';
    nav.appendChild(section);
    SECONDARY.forEach(item=>nav.appendChild(navLink(item)));

    let footer=sidebar.querySelector('.sidebar-footer');
    if(!footer){
      footer=document.createElement('div');
      footer.className='sidebar-footer';
      sidebar.appendChild(footer);
    }
    footer.innerHTML='';
    const booking=document.createElement('a');
    booking.href='/';
    booking.target='_blank';
    booking.rel='noopener';
    booking.textContent='View Booking Page';
    const logout=document.createElement('button');
    logout.id='logout';
    logout.type='button';
    logout.textContent='Sign out';
    footer.append(booking,logout);
    bindLogout(logout);
  }

  function bindLogout(button){
    button?.addEventListener('click',async()=>{
      if(!confirmLeave())return;
      await fetch('/api/owner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})}).catch(()=>{});
      location.reload();
    });
  }

  function mountBottomNav(){
    if(!ownerPortal||!app)return;
    if(document.getElementById('ownerBottomNav'))return;
    const bar=document.createElement('nav');
    bar.id='ownerBottomNav';
    bar.className='owner-bottom-nav';
    bar.setAttribute('aria-label','Primary owner navigation');
    const current=activeId();
    BOTTOM.forEach(id=>{
      const btn=document.createElement(id==='more'?'button':'a');
      btn.className='owner-bottom-item';
      if(id==='more'){
        btn.type='button';
        btn.setAttribute('aria-expanded','false');
        btn.setAttribute('aria-controls','ownerSidebar');
        btn.innerHTML='<b aria-hidden="true">⋯</b><span>More</span>';
        btn.addEventListener('click',()=>{moreOpen?closeNav():openNav();});
      }else{
        const item=PRIMARY.find(row=>row.id===id);
        btn.href=item.href;
        btn.innerHTML=`<b aria-hidden="true">${id==='overview'?'⌂':id==='calendar'?'▦':id==='bookings'?'☰':'$'}</b><span>${item.label}</span>`;
        if(current===id){
          btn.classList.add('active');
          btn.setAttribute('aria-current','page');
        }
        btn.addEventListener('click',e=>{if(!confirmLeave())e.preventDefault();});
      }
      bar.appendChild(btn);
    });
    app.appendChild(bar);
    app.classList.add('has-bottom-nav');
  }

  function mountShellBack(){
    if(!ownerPortal)return;
    const topbar=document.querySelector('.topbar');
    if(!topbar)return;
    const start=topbar.querySelector(':scope > div')||topbar;
    if(start.querySelector('.shell-back'))return;
    if(path==='/owner-v1'||path==='/owner-v1.html')return;
    const back=document.createElement('button');
    back.type='button';
    back.className='icon-btn shell-back';
    back.setAttribute('aria-label','Back');
    back.title='Back';
    back.textContent='‹';
    back.addEventListener('click',()=>{
      if(!confirmLeave())return;
      if(history.length>1)history.back();
      else location.href='/owner-v1';
    });
    const menuBtn=document.getElementById('mobileMenu');
    if(menuBtn)menuBtn.after(back);
    else start.prepend(back);
    document.getElementById('backLink')?.classList.add('hidden');
  }

  function mountChipHost(){
    if(!ownerPortal)return;
    if(document.getElementById('ownerContextChips'))return;
    const content=document.querySelector('.main .content');
    if(!content)return;
    const host=document.createElement('div');
    host.id='ownerContextChips';
    host.className='owner-context-chips hidden';
    content.prepend(host);
    renderChips();
  }

  const navPlacement=document.createElement('style');
  navPlacement.textContent='@media(max-width:780px){.sidebar-flyout-toggle{display:none!important}.mobile-menu{display:none!important}}';
  document.head.appendChild(navPlacement);

  function revealActive(){
    const nav=sidebar?.querySelector('.nav');
    const active=nav?.querySelector('.active');
    if(active&&typeof active.scrollIntoView==='function')active.scrollIntoView({block:'nearest'});
  }
  function setCollapsed(collapsed){
    if(!sidebar||!app)return;
    app.classList.toggle('sidebar-collapsed',collapsed);
    moreOpen=!collapsed&&isMobile();
    if(isMobile()){
      sidebar.classList.toggle('open',!collapsed);
      backdrop?.classList.toggle('hidden',collapsed);
    }else{
      sidebar.classList.remove('open');
      backdrop?.classList.add('hidden');
    }
    if(!collapsed)requestAnimationFrame(revealActive);
    document.querySelector('#ownerBottomNav button.owner-bottom-item')?.setAttribute('aria-expanded', String(isMobile()&&!collapsed));
  }
  function openNav(){setCollapsed(false)}
  function closeNav(){setCollapsed(true);moreOpen=false}

  if(sidebar&&app){
    const closeButton=document.createElement('button');
    closeButton.type='button';
    closeButton.className='sidebar-close';
    closeButton.setAttribute('aria-label','Hide navigation');
    closeButton.title='Hide navigation';
    closeButton.textContent='‹';
    closeButton.addEventListener('click',closeNav);
    sidebar.prepend(closeButton);

    const flyout=document.createElement('button');
    flyout.type='button';
    flyout.className='sidebar-flyout-toggle';
    flyout.setAttribute('aria-label','Open navigation');
    flyout.title='Open navigation';
    const label=document.createElement('span');label.textContent='Menu';
    const arrow=document.createElement('b');arrow.textContent='›';
    flyout.append(label,arrow);
    flyout.addEventListener('click',openNav);
    app.appendChild(flyout);

    if(isMobile())setCollapsed(true);
  }

  function enhanceLoginA11y(){
    const input=document.getElementById('passcode');
    if(input && !input.getAttribute('aria-label') && !document.querySelector('label[for="passcode"]')){
      const label=document.createElement('label');
      label.htmlFor='passcode';
      label.textContent='Owner passcode';
      input.before(label);
    }
    const msg=document.getElementById('loginMsg');
    if(msg){
      msg.setAttribute('role','status');
      msg.setAttribute('aria-live','polite');
    }
  }

  function mountSkipLink(){
    if(!ownerPortal||document.querySelector('.owner-skip-link'))return;
    const main=document.querySelector('.main');
    if(main && !main.id)main.id='ownerMain';
    if(!main?.id)return;
    const skip=document.createElement('a');
    skip.className='owner-skip-link';
    skip.href=`#${main.id}`;
    skip.textContent='Skip to content';
    document.body.prepend(skip);
  }

  function mountBoot(){
    if(!ownerPortal)return;
    const login=document.getElementById('loginShell');
    const owner=document.getElementById('ownerApp');
    if(!login||!owner)return;
    const bothHidden=()=>login.classList.contains('hidden')&&owner.classList.contains('hidden');
    function dismiss(){document.getElementById('ownerBoot')?.remove()}
    function showBoot(){
      if(!bothHidden()||document.getElementById('ownerBoot'))return;
      const boot=document.createElement('section');
      boot.id='ownerBoot';
      boot.className='login-shell';
      boot.setAttribute('role','status');
      boot.innerHTML='<div class="login-card"><h1>Loading</h1><p>Checking owner access…</p></div>';
      document.body.appendChild(boot);
    }
    if(bothHidden())showBoot();
    const obs=new MutationObserver(()=>{if(!bothHidden())dismiss()});
    obs.observe(login,{attributes:true,attributeFilter:['class']});
    obs.observe(owner,{attributes:true,attributeFilter:['class']});
    setTimeout(()=>{
      if(!bothHidden())return;
      dismiss();
      login.classList.remove('hidden');
    },8000);
  }

  mountOwnerNav();
  mountBottomNav();
  mountShellBack();
  mountChipHost();
  markSticky();
  enhanceLoginA11y();
  mountSkipLink();
  mountBoot();

  menu?.addEventListener('click',openNav);
  backdrop?.addEventListener('click',closeNav);
  window.addEventListener('resize',()=>{
    if(!sidebar||!app)return;
    if(isMobile()){
      if(!sidebar.classList.contains('open'))app.classList.add('sidebar-collapsed');
    }else if(sidebar.classList.contains('open')){
      sidebar.classList.remove('open');
      backdrop?.classList.add('hidden');
      app.classList.remove('sidebar-collapsed');
    }
  });

  const ownerRoutes={
    'Calendar':'/owner-v1/calendar','Pricing':'/owner-v1/pricing','Financials':'/owner-v1/financials','Property':'/owner-v1/property','Maintenance':'/owner-v1/maintenance','Analytics':'/owner-v1/analytics','Settings':'/owner-v1/settings','Team':'/owner-v1/team'
  };
  const adminRoutes={
    'Properties':'/admin-v1/properties','Roles & Permissions':'/admin-v1/roles','Integrations':'/admin-v1/integrations','Notifications':'/admin-v1/notifications','Audit Log':'/admin-v1/audit','Sessions':'/admin-v1/sessions','System & Data':'/admin-v1/system-data'
  };
  const accountRoutes={
    'Notification Preferences':'/account-v1/notifications','Notifications':'/account-v1/notifications','Property Access':'/account-v1/property-access'
  };
  function routeFor(el,name){
    const explicit=el.getAttribute('data-route');
    if(explicit)return explicit;
    const p=location.pathname;
    if(p.startsWith('/admin-v1'))return adminRoutes[name];
    if(p.startsWith('/account-v1'))return accountRoutes[name];
    return ownerRoutes[name];
  }

  document.querySelectorAll('[data-coming-soon]').forEach(el=>el.addEventListener('click',e=>{
    e.preventDefault();
    const name=el.getAttribute('data-coming-soon')||'This module';
    const route=routeFor(el,name);
    if(route){if(!confirmLeave())return;location.href=route;return;}
    const target=document.getElementById('moduleNotice');
    if(target){target.textContent=`${name} is under construction.`;target.classList.remove('hidden');setTimeout(()=>target.classList.add('hidden'),3500)}
    closeNav();
  }));
  if(!ownerPortal)bindLogout(document.getElementById('logout'));

  function scrollKeyFor(search){
    return `cjt:scroll:${path}${search==null?location.search:search}`;
  }
  function saveScroll(search){
    try{sessionStorage.setItem(scrollKeyFor(search),String(window.scrollY||0));}catch(e){}
  }
  function restoreScroll(){
    try{
      const saved=Number(sessionStorage.getItem(scrollKeyFor(location.search))||0);
      if(saved)requestAnimationFrame(()=>window.scrollTo(0,saved));
    }catch(e){}
  }
  if('scrollRestoration' in history)history.scrollRestoration='manual';
  const navType=performance.getEntriesByType?.('navigation')?.[0]?.type;
  if(navType==='back_forward')restoreScroll();
  window.addEventListener('beforeunload',(event)=>{
    saveScroll();
    if(dirty)event.returnValue='You have unsaved changes.';
  });
  window.addEventListener('pagehide',()=>saveScroll());
  window.addEventListener('popstate',()=>{
    renderChips();
    window.dispatchEvent(new CustomEvent('cjt-context-change',{detail:readContext()}));
    restoreScroll();
  });

  requestAnimationFrame(revealActive);
})();
