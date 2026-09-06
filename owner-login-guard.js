(()=>{
  const authCard=document.getElementById('authCard');
  const passwordCard=document.getElementById('passwordCard');
  const portal=document.getElementById('portal');
  const loginForm=document.getElementById('loginForm');
  const bootstrapForm=document.getElementById('bootstrapForm');
  if(!authCard||!passwordCard||!loginForm||!bootstrapForm)return;

  const hidden=el=>!el||el.classList.contains('hidden')||getComputedStyle(el).display==='none';
  const authActive=()=>!authCard.classList.contains('hidden')&&hidden(passwordCard)&&(!portal||hidden(portal));

  function healLoginState(){
    if(!authActive())return;
    if(hidden(loginForm)&&hidden(bootstrapForm)){
      loginForm.classList.remove('hidden');
      loginForm.style.removeProperty('display');
      authCard.dataset.loginGuardRecovered='true';
    }
  }

  [authCard,passwordCard,portal,loginForm,bootstrapForm].filter(Boolean).forEach(el=>{
    new MutationObserver(()=>queueMicrotask(healLoginState)).observe(el,{attributes:true,attributeFilter:['class','style']});
  });

  window.addEventListener('pageshow',healLoginState);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)healLoginState()});
  [0,150,400,900,1800].forEach(ms=>setTimeout(healLoginState,ms));
})();
