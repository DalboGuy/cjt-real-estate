(function(){
  const routeMeta={
    '/owner-v1/calendar':{portal:'owner',module:'Calendar',description:'Unified availability, stays, blocks and channel calendar status will live here.'},
    '/owner-v1/pricing':{portal:'owner',module:'Pricing',description:'Seasonal rates, date overrides, events, discounts and minimum-stay controls will live here.'},
    '/owner-v1/property':{portal:'owner',module:'Property',description:'Property details, amenities, operating settings and property-specific configuration will live here.'},
    '/owner-v1/maintenance':{portal:'owner',module:'Maintenance',description:'Open work, recurring upkeep, equipment, vendors and service history will live here.'},
    '/owner-v1/analytics':{portal:'owner',module:'Analytics',description:'Occupancy, ADR, RevPAR, channel mix and operating trends will live here.'},
    '/owner-v1/settings':{portal:'owner',module:'Settings',description:'Owner-level preferences and property operating settings will live here.'},
    '/admin-v1/properties':{portal:'admin',module:'Properties',description:'Platform property records, ownership and user-to-property assignments will be managed here.'},
    '/admin-v1/roles':{portal:'admin',module:'Roles & Permissions',description:'Role definitions and property-scoped access rules will be managed here.'},
    '/admin-v1/integrations':{portal:'admin',module:'Integrations',description:'Gmail, booking channels, cloud storage, signing and other external connections will be managed here.'},
    '/admin-v1/notifications':{portal:'admin',module:'Notifications',description:'Platform-level notification rules, routing and alert policies will be managed here.'},
    '/admin-v1/system-data':{portal:'admin',module:'System & Data',description:'System health, data tools, imports, exports, backups and recovery information will live here.'},
    '/account-v1/notifications':{portal:'account',module:'Notifications',description:'Personal alert and notification preferences will live here.'},
    '/account-v1/property-access':{portal:'account',module:'Property Access',description:'The properties and permissions assigned to the signed-in account will be shown here.'}
  };

  const path=location.pathname.replace(/\/$/,'')||'/';
  const meta=routeMeta[path]||{portal:'owner',module:'Module',description:'This CJT module is reserved and under construction.'};
  const ownerItems=[
    ['Dashboard','/owner-v1'],['Communications','/owner-v1/communications'],['Reservations','/owner-v1/reservations'],['Calendar','/owner-v1/calendar'],['Pricing','/owner-v1/pricing'],['Financials','/owner-v1/financials'],
    ['#','Property'],['Property','/owner-v1/property'],['Maintenance','/owner-v1/maintenance'],['Documents','/owner-v1/documents'],
    ['#','Reporting'],['Analytics','/owner-v1/analytics'],['#','System'],['My Account','/account-v1'],['Admin','/admin-v1'],['Settings','/owner-v1/settings']
  ];
  const adminItems=[
    ['Admin Dashboard','/admin-v1'],['Users & Access','/admin-v1/users'],['Properties','/admin-v1/properties'],['Roles & Permissions','/admin-v1/roles'],
    ['#','Automation'],['Integrations','/admin-v1/integrations'],['Documents & Cloud','/owner-v1/documents'],['Notifications','/admin-v1/notifications'],
    ['#','Architecture'],['Platform Maps','/admin-v1/maps'],['#','Security'],['Audit Log','/admin-v1/audit'],['Sessions','/admin-v1/sessions'],
    ['#','System'],['System & Data','/admin-v1/system-data']
  ];
  const accountItems=[['Account Overview','/account-v1'],['Sessions','/account-v1/sessions'],['Notifications','/account-v1/notifications'],['#','Access'],['Property Access','/account-v1/property-access']];

  const configs={
    owner:{brand:'Owner Operations',chipTitle:'Sand & Sea Manor',chipText:'1720 Avenue M · Galveston, TX',items:ownerItems,back:'/owner-v1',backText:'Owner Dashboard'},
    admin:{brand:'Administration',chipTitle:'Platform Administration',chipText:'Users · Properties · Integrations · Security',items:adminItems,back:'/admin-v1',backText:'Admin Dashboard'},
    account:{brand:'Account Center',chipTitle:'Personal Account',chipText:'Identity · Security · Access',items:accountItems,back:'/account-v1',backText:'Account Overview'}
  };
  const cfg=configs[meta.portal]||configs.owner;
  const sidebar=document.getElementById('ownerSidebar');

  function addNav(items,nav){
    items.forEach(([label,target])=>{
      if(label==='#'){
        const d=document.createElement('div');d.className='nav-section';d.textContent=target;nav.appendChild(d);return;
      }
      const a=document.createElement('a');a.href=target;
      if(target===path)a.classList.add('active');
      const s=document.createElement('span');s.textContent=label;a.appendChild(s);
      if(routeMeta[target]){const c=document.createElement('span');c.className='count';c.textContent='Build';a.appendChild(c)}
      nav.appendChild(a);
    });
  }

  if(sidebar){
    const brand=document.createElement('div');brand.className='brand';brand.append(document.createTextNode('CJT REALTY'));const small=document.createElement('small');small.textContent=cfg.brand;brand.appendChild(small);sidebar.appendChild(brand);
    const chip=document.createElement('div');chip.className='property-chip';const strong=document.createElement('strong');strong.textContent=cfg.chipTitle;const span=document.createElement('span');span.textContent=cfg.chipText;chip.append(strong,span);sidebar.appendChild(chip);
    const nav=document.createElement('nav');nav.className='nav';nav.setAttribute('aria-label',cfg.brand);addNav(cfg.items,nav);sidebar.appendChild(nav);
    const footer=document.createElement('div');footer.className='sidebar-footer';
    if(meta.portal!=='owner'){const a=document.createElement('a');a.href='/owner-v1';a.textContent='Owner Portal';footer.appendChild(a)}
    if(meta.portal!=='admin'){const a=document.createElement('a');a.href='/admin-v1';a.textContent='Admin';footer.appendChild(a)}
    if(meta.portal!=='account'){const a=document.createElement('a');a.href='/account-v1';a.textContent='My Account';footer.appendChild(a)}
    const out=document.createElement('button');out.id='logout';out.type='button';out.textContent='Sign out';footer.appendChild(out);sidebar.appendChild(footer);
  }

  document.title=`CJT ${cfg.brand} · ${meta.module}`;
  document.getElementById('moduleTitle').textContent=meta.module;
  document.getElementById('moduleHeading').textContent=meta.module;
  document.getElementById('moduleDescription').textContent=meta.description;
  document.getElementById('routeText').textContent=path;
  document.getElementById('portalMeta').textContent=`${cfg.brand} · Platform v1`;
  const back=document.getElementById('backLink');back.href=cfg.back;back.textContent=cfg.backText;
  const named=document.getElementById('namedLogin');named.href=`/login-v1?return=${encodeURIComponent(path)}`;
})();
