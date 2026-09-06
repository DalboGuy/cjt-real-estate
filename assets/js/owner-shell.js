(function(){
  const sidebar=document.getElementById('ownerSidebar');
  const backdrop=document.getElementById('ownerBackdrop');
  const menu=document.getElementById('mobileMenu');
  const app=sidebar?.closest('.owner-app');
  const nav=sidebar?.querySelector('.nav');
  const isMobile=()=>window.matchMedia('(max-width:780px)').matches;

  // Keep the mobile return-to-navigation handle compact and away from
  // bottom filters/browser chrome. This overrides the older bottom placement.
  const navPlacement=document.createElement('style');
  navPlacement.textContent='@media(max-width:780px){.sidebar-flyout-toggle{top:42%;bottom:auto;transform:translateY(-50%);width:34px;height:58px;padding:0;justify-content:center;border-radius:0 12px 12px 0}.sidebar-flyout-toggle span{display:none}.sidebar-flyout-toggle b{font-size:1.45rem}}@media(max-width:420px){.sidebar-flyout-toggle{top:40%;bottom:auto;transform:translateY(-50%);width:32px;height:54px}}';
  document.head.appendChild(navPlacement);

  function revealActive(){
    const active=nav?.querySelector('.active');
    if(active&&typeof active.scrollIntoView==='function')active.scrollIntoView({block:'nearest'});
  }
  function setCollapsed(collapsed){
    if(!sidebar||!app)return;
    app.classList.toggle('sidebar-collapsed',collapsed);
    if(isMobile()){
      sidebar.classList.toggle('open',!collapsed);
      backdrop?.classList.toggle('hidden',collapsed);
    }else{
      sidebar.classList.remove('open');
      backdrop?.classList.add('hidden');
    }
    if(!collapsed)requestAnimationFrame(revealActive);
  }
  function openNav(){setCollapsed(false)}
  function closeNav(){setCollapsed(true)}

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
    'Calendar':'/owner-v1/calendar','Pricing':'/owner-v1/pricing','Financials':'/owner-v1/financials','Property':'/owner-v1/property','Maintenance':'/owner-v1/maintenance','Analytics':'/owner-v1/analytics','Settings':'/owner-v1/settings'
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
    if(route){location.href=route;return;}
    const target=document.getElementById('moduleNotice');
    if(target){target.textContent=`${name} is under construction.`;target.classList.remove('hidden');setTimeout(()=>target.classList.add('hidden'),3500)}
    closeNav();
  }));
  document.getElementById('logout')?.addEventListener('click',async()=>{
    await fetch('/api/owner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})}).catch(()=>{});
    location.reload();
  });

  // Keep the living visual map current with the navigation behavior.
  if(location.pathname.replace(/\/$/,'')==='/admin-v1/maps'){
    const version=[...document.querySelectorAll('.status-pill')].find(el=>/^Version\s/i.test(el.textContent||''));
    if(version)version.textContent='Version 0.8';
    const note=document.querySelector('#navigation .flow-note');
    if(note)note.textContent='Desktop: the pane can collapse and reopen. Mobile: a compact arrow-only handle stays around the middle of the left edge, clear of bottom filters and browser controls, and opens the slide-out drawer. The browser Back button is not required.';
  }

  requestAnimationFrame(revealActive);
})();
