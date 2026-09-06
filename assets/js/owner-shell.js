(function(){
  const sidebar=document.getElementById('ownerSidebar');
  const backdrop=document.getElementById('ownerBackdrop');
  const menu=document.getElementById('mobileMenu');
  const app=sidebar?.closest('.owner-app');
  const nav=sidebar?.querySelector('.nav');
  const isMobile=()=>window.matchMedia('(max-width:780px)').matches;

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

  if(location.pathname.replace(/\/$/,'')==='/admin-v1/maps'){
    const version=[...document.querySelectorAll('.status-pill')].find(el=>/^Version\s/i.test(el.textContent||''));
    if(version)version.textContent='Version 0.9';
    const note=document.querySelector('#navigation .flow-note');
    if(note)note.textContent='Desktop: the pane can collapse and reopen. Mobile: a compact arrow-only handle stays around the middle of the left edge, clear of bottom filters and browser controls, and opens the slide-out drawer. The browser Back button is not required.';

    document.querySelectorAll('[data-coming-soon="Audit Log"],[data-coming-soon="Sessions"]').forEach(el=>{
      const count=el.querySelector('.count');
      if(count)count.textContent='Live';
    });

    const roadmap=document.getElementById('roadmap');
    if(roadmap&&!document.getElementById('security-scope')){
      const section=document.createElement('section');
      section.id='security-scope';section.className='card map-card';section.style.marginBottom='16px';
      section.innerHTML='<div class="card-head"><div><h3>Security Scope Decision</h3><p>Current owner-directed priority: build only items 4 and 5; keep items 1–3 visible for later.</p></div><span class="badge good">Recorded</span></div><div class="list"><div class="list-row"><div><strong>1 · Property-scoped users & permissions</strong><span>Assign users to properties and roles.</span></div><span class="badge">Deferred</span></div><div class="list-row"><div><strong>2 · Permission enforcement</strong><span>Role-aware navigation and API authorization.</span></div><span class="badge">Deferred</span></div><div class="list-row"><div><strong>3 · Invitations</strong><span>Email invite → user-created account → access activation.</span></div><span class="badge">Deferred</span></div><div class="list-row"><div><strong>4 · Password recovery</strong><span>30-minute one-time reset token, password replacement and session invalidation. Automated email uses a runtime delivery hook.</span></div><span class="badge good">Built foundation</span></div><div class="list-row"><div><strong>5 · Sessions & audit</strong><span>Named-account session review/revocation plus a shared audit event stream. Audit storage is present on the reorganization database branch.</span></div><span class="badge good">Built</span></div></div>';
      roadmap.parentNode.insertBefore(section,roadmap);
      const toolbar=document.querySelector('.map-toolbar');
      if(toolbar){const a=document.createElement('a');a.href='#security-scope';a.textContent='Security Scope';toolbar.appendChild(a)}
    }
    const nextRow=[...roadmap?.querySelectorAll('.list-row')||[]].find(row=>row.querySelector('strong')?.textContent.trim()==='Next');
    if(nextRow){const span=nextRow.querySelector('div span');if(span)span.textContent='Items 1–3 remain logged as deferred. No additional identity/access work is in scope beyond password recovery, sessions and audit.';const badge=nextRow.querySelector('.badge');if(badge){badge.textContent='Deferred';badge.classList.remove('warn')}}
  }

  requestAnimationFrame(revealActive);
})();
