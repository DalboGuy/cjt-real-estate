(function(){
  const sidebar=document.getElementById('ownerSidebar');
  const backdrop=document.getElementById('ownerBackdrop');
  const menu=document.getElementById('mobileMenu');
  function close(){sidebar?.classList.remove('open');backdrop?.classList.add('hidden')}
  menu?.addEventListener('click',()=>{sidebar?.classList.add('open');backdrop?.classList.remove('hidden')});
  backdrop?.addEventListener('click',close);

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
    close();
  }));
  document.getElementById('logout')?.addEventListener('click',async()=>{
    await fetch('/api/owner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})}).catch(()=>{});
    location.reload();
  });
})();
