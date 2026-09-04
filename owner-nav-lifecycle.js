(()=>{
  const root=document.documentElement;
  if(root.dataset.ownerNavLifecycleLoaded)return;
  root.dataset.ownerNavLifecycleLoaded='1';

  function click(id){const b=document.getElementById(id);if(b&&!b.disabled)b.click()}

  window.addEventListener('cjt:tab-opened',e=>{
    const tab=e.detail?.tab;
    if(tab==='dashboard')setTimeout(()=>click('opsRefresh'),20);
    if(tab==='bookingCalendar')setTimeout(()=>click('bookingRefresh'),20);
    if(tab==='finance')setTimeout(()=>click('finRefresh'),20);
  });
})();
