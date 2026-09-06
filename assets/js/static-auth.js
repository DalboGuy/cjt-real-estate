(function(){
  const loginShell=document.getElementById('loginShell');
  const app=document.getElementById('ownerApp')||document.getElementById('adminApp')||document.getElementById('accountApp');
  const form=document.getElementById('loginForm');
  const msg=document.getElementById('loginMsg');

  function showLogin(){app?.classList.add('hidden');loginShell?.classList.remove('hidden')}
  function showApp(){loginShell?.classList.add('hidden');app?.classList.remove('hidden')}

  async function verify(){
    try{
      const r=await fetch('/api/dashboard',{cache:'no-store'});
      if(r.status===401)return showLogin();
      if(!r.ok)throw new Error('verify_failed');
      showApp();
    }catch(e){showLogin()}
  }

  form?.addEventListener('submit',async e=>{
    e.preventDefault();
    if(msg)msg.textContent='Signing in…';
    const passcode=document.getElementById('passcode')?.value||'';
    try{
      const r=await fetch('/api/owner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',passcode})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||'invalid_passcode');
      if(document.getElementById('passcode'))document.getElementById('passcode').value='';
      if(msg)msg.textContent='';
      showApp();
    }catch(e){if(msg)msg.textContent=e.message==='owner_login_not_configured'?'Owner login is not configured for this environment.':'Invalid passcode.'}
  });

  verify();
})();
