(() => {
  const authCard = document.getElementById('authCard');
  const passwordCard = document.getElementById('passwordCard');
  const portal = document.getElementById('portal');
  const wrap = document.querySelector('.wrap');
  if (!authCard || !passwordCard || !wrap) return;

  const style = document.createElement('style');
  style.textContent = `
    body.owner-auth-active{background:#f4f0e9;min-height:100vh;overflow-x:hidden}
    body.owner-auth-active>.wrap{width:100%;max-width:none;margin:0;min-height:100vh}
    .owner-auth-shell{min-height:100vh;display:grid;grid-template-columns:minmax(0,1.08fr) minmax(430px,.92fr);background:#fff}
    .owner-auth-shell.hidden{display:none!important}
    .owner-auth-visual{position:relative;min-height:100vh;background:linear-gradient(180deg,rgba(7,27,31,.08),rgba(7,27,31,.72)),url('https://drive.google.com/thumbnail?id=1-WSugckUTvQLbPIAqprx5Ctol0hak5RK&sz=w2400') center/cover no-repeat;color:#fff;display:flex;flex-direction:column;justify-content:space-between;padding:46px clamp(34px,5vw,72px)}
    .owner-auth-visual:after{content:"";position:absolute;inset:0;box-shadow:inset -1px 0 rgba(255,255,255,.15);pointer-events:none}
    .owner-auth-brand,.owner-auth-copy{position:relative;z-index:1}
    .owner-auth-brand{font-size:.78rem;font-weight:900;letter-spacing:.18em;text-transform:uppercase}
    .owner-auth-brand span{display:block;margin-top:8px;font-family:Georgia,serif;font-size:1.5rem;font-weight:500;letter-spacing:.02em;text-transform:none}
    .owner-auth-copy{max-width:620px;padding-bottom:4vh}
    .owner-auth-copy .eyebrow{font-size:.72rem;text-transform:uppercase;letter-spacing:.18em;font-weight:800;color:rgba(255,255,255,.72)}
    .owner-auth-copy h2{font-family:Georgia,serif;font-weight:500;font-size:clamp(2.8rem,5vw,5.6rem);line-height:.94;margin:14px 0 18px;max-width:700px}
    .owner-auth-copy p{margin:0;max-width:560px;font-size:1rem;line-height:1.6;color:rgba(255,255,255,.78)}
    .owner-auth-panel{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:46px clamp(28px,5vw,72px);background:#fff}
    .owner-auth-panel-inner{width:min(100%,470px)}
    .owner-auth-panel .card.login{max-width:none;width:100%;margin:0;padding:0;border:0;border-radius:0;box-shadow:none;background:transparent}
    .owner-auth-panel h1{font-family:Georgia,serif;font-size:clamp(2.15rem,3.5vw,3.15rem);font-weight:500;line-height:1.05;color:#0d2b31;margin:0 0 12px!important}
    .owner-auth-panel .meta{font-size:.92rem;line-height:1.55;color:#718184}
    .owner-auth-panel form{margin-top:30px}
    .owner-auth-panel label{font-size:.76rem;letter-spacing:.02em;color:#29464b;margin-bottom:7px}
    .owner-auth-panel input,.owner-auth-panel select{border:1px solid #d8e0df;border-radius:12px;padding:14px 15px;background:#fff;transition:border-color .15s,box-shadow .15s}
    .owner-auth-panel input:focus,.owner-auth-panel select:focus{outline:none;border-color:#6f8e91;box-shadow:0 0 0 4px rgba(20,52,58,.08)}
    .owner-auth-panel .btn{min-height:48px;border-radius:12px;padding:12px 18px}
    .owner-auth-panel #loginBtn,.owner-auth-panel #changePasswordBtn{width:100%;background:#0d2b31;color:#fff}
    .owner-auth-panel #authMsg,.owner-auth-panel #passwordMsg{min-height:22px;margin:14px 0 0}
    .owner-login-row{display:flex;justify-content:flex-end;align-items:center;margin-top:12px}
    .owner-login-row a{font-size:.8rem;font-weight:800;color:#31575e;text-decoration:none}
    .owner-login-row a:hover{text-decoration:underline}
    .owner-auth-secure{display:flex;gap:9px;align-items:center;margin-top:26px;padding-top:20px;border-top:1px solid #edf0ef;color:#7a898b;font-size:.75rem}
    .owner-auth-secure svg{width:16px;height:16px;flex:0 0 auto}
    .owner-auth-panel .securitybox{border:1px solid #e0e7e5;background:#f7faf9;border-radius:14px;margin:22px 0 8px}
    #bootstrapForm{border-top:1px solid #e5eae8;padding-top:22px}
    @media(max-width:880px){
      .owner-auth-shell{grid-template-columns:1fr;min-height:100vh}
      .owner-auth-visual{min-height:300px;height:38vh;padding:28px 28px 32px}
      .owner-auth-copy{padding:0}.owner-auth-copy h2{font-size:clamp(2.5rem,9vw,4.5rem);max-width:580px}.owner-auth-copy p{display:none}
      .owner-auth-panel{min-height:auto;padding:42px 24px 58px;align-items:flex-start}
    }
    @media(max-width:560px){
      .owner-auth-visual{height:32vh;min-height:245px;padding:22px 20px 26px}
      .owner-auth-brand{font-size:.68rem}.owner-auth-brand span{font-size:1.15rem}
      .owner-auth-copy h2{font-size:2.55rem;margin-bottom:0}
      .owner-auth-panel{padding:34px 20px 50px}
      .owner-auth-panel h1{font-size:2.3rem}
    }
  `;
  document.head.appendChild(style);

  authCard.querySelector('h1').textContent = 'Owner Portal';
  const authMeta = authCard.querySelector('p.meta');
  if (authMeta) authMeta.textContent = 'Sign in to access Sand & Sea Manor operations and financials.';
  const emailLabel = authCard.querySelector('label');
  if (emailLabel) emailLabel.textContent = 'Email address';
  const loginBtn = document.getElementById('loginBtn');
  if (loginBtn) loginBtn.textContent = 'Sign In';

  const loginForm = document.getElementById('loginForm');
  if (loginForm && !document.getElementById('ownerForgotLink')) {
    const row = document.createElement('div');
    row.className = 'owner-login-row';
    row.innerHTML = '<a id="ownerForgotLink" href="/reset-owner.html">Forgot password?</a>';
    loginForm.appendChild(row);
  }

  const secure = document.createElement('div');
  secure.className = 'owner-auth-secure';
  secure.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path></svg><span>Private access for CJT Real Estate owners and authorized team members.</span>';
  authCard.appendChild(secure);

  const shell = document.createElement('div');
  shell.id = 'ownerAuthShell';
  shell.className = 'owner-auth-shell';
  shell.innerHTML = `
    <section class="owner-auth-visual" aria-label="Sand & Sea Manor">
      <div class="owner-auth-brand">CJT REAL ESTATE<span>Sand & Sea Manor</span></div>
      <div class="owner-auth-copy">
        <div class="eyebrow">1720 Avenue M · Galveston, Texas</div>
        <h2>Owner Operations & Financial Portal</h2>
        <p>Reservations, property operations, pricing, tasks, calendar activity and financial performance in one private workspace.</p>
      </div>
    </section>
    <section class="owner-auth-panel"><div class="owner-auth-panel-inner"></div></section>`;

  wrap.insertBefore(shell, wrap.firstChild);
  const inner = shell.querySelector('.owner-auth-panel-inner');
  inner.appendChild(authCard);
  inner.appendChild(passwordCard);

  function syncAuthLayout(){
    const active = !authCard.classList.contains('hidden') || !passwordCard.classList.contains('hidden');
    shell.classList.toggle('hidden', !active);
    document.body.classList.toggle('owner-auth-active', active);
    if (portal) portal.setAttribute('aria-hidden', active ? 'true' : 'false');
  }

  new MutationObserver(syncAuthLayout).observe(authCard,{attributes:true,attributeFilter:['class']});
  new MutationObserver(syncAuthLayout).observe(passwordCard,{attributes:true,attributeFilter:['class']});
  syncAuthLayout();
})();
