(function(){
  const sidebar=document.getElementById('ownerSidebar');
  const backdrop=document.getElementById('ownerBackdrop');
  const menu=document.getElementById('mobileMenu');
  function close(){sidebar?.classList.remove('open');backdrop?.classList.add('hidden')}
  menu?.addEventListener('click',()=>{sidebar?.classList.add('open');backdrop?.classList.remove('hidden')});
  backdrop?.addEventListener('click',close);
  document.querySelectorAll('[data-coming-soon]').forEach(el=>el.addEventListener('click',e=>{
    e.preventDefault();
    const name=el.getAttribute('data-coming-soon')||'This module';
    const target=document.getElementById('moduleNotice');
    if(target){target.textContent=`${name} is planned for Platform v1 and has not been migrated yet.`;target.classList.remove('hidden');setTimeout(()=>target.classList.add('hidden'),4500)}
    close();
  }));
  document.getElementById('logout')?.addEventListener('click',async()=>{
    await fetch('/api/owner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})}).catch(()=>{});
    location.reload();
  });
})();
