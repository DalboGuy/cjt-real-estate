(function(){
  if(!/\/owner-v1\/financials/.test(location.pathname))return;
  const shell=window.CJTOwnerShell;
  let applying=false;

  const PERIOD_ALIASES={
    month:['month'],
    ytd:['ytd','year'],
    year:['year','ytd'],
    last12:['last12','year','all'],
    '2025':['2025','year','all'],
    all:['all','last12'],
    custom:['custom']
  };

  function mapPeriod(requested,available){
    const period=String(requested||'').toLowerCase();
    if(!period)return null;
    const keys=(available||[]).map(v=>String(v).toLowerCase());
    const candidates=PERIOD_ALIASES[period]||[period];
    return candidates.find(key=>keys.includes(key))||null;
  }
  function notice(text){
    const el=document.getElementById('moduleNotice');
    if(!el||!text)return;
    el.textContent=text;
    el.classList.remove('hidden');
  }
  function periodButtons(){
    return [...document.querySelectorAll('#filterRange [data-range], #sheetRange [data-range], .fp-pills [data-range]')];
  }
  function availablePeriods(){
    return [...new Set(periodButtons().map(btn=>btn.getAttribute('data-range')).filter(Boolean))];
  }
  function setSelect(id,value){
    const el=document.getElementById(id);
    if(!el||value==null||value==='')return false;
    const match=[...el.options].find(opt=>String(opt.value)===String(value));
    if(!match)return false;
    if(el.value===match.value)return true;
    el.value=match.value;
    el.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  }
  function applyPeriod(period){
    const mapped=mapPeriod(period,availablePeriods());
    if(!mapped)return !period;
    const btn=periodButtons().find(el=>el.getAttribute('data-range')===mapped);
    if(!btn)return false;
    if(!btn.classList.contains('active'))btn.click();
    return true;
  }
  function applyTab(tab){
    if(!tab)return true;
    const btn=document.querySelector(`#stayTabs [data-tab="${tab}"]`);
    if(!btn)return false;
    if(!btn.classList.contains('active'))btn.click();
    return true;
  }
  function applyFromUrl(){
    if(!shell?.readContext)return;
    applying=true;
    const ctx=shell.readContext();
    const periodOk=applyPeriod(ctx.period||ctx.range);
    if((ctx.period||ctx.range)&&!periodOk)notice(shell.cannotApply('the selected period','Financials'));
    if(ctx.channel){
      const channelOk=setSelect('filterChannel',ctx.channel);
      const sourceOk=setSelect('filterSource',['direct','ota'].includes(ctx.channel)?ctx.channel:ctx.source);
      if(!channelOk&&!sourceOk)notice(shell.cannotApply('the selected channel','Financials'));
    }else if(ctx.source){
      setSelect('filterSource',ctx.source);
    }
    if(ctx.status)setSelect('filterStatus',ctx.status);
    if(ctx.stripe)setSelect('filterStripe',ctx.stripe);
    if(ctx.from){
      const from=document.getElementById('filterFrom')||document.querySelector('.fp-from');
      if(from)from.value=ctx.from;
    }
    if(ctx.to){
      const to=document.getElementById('filterTo')||document.querySelector('.fp-to');
      if(to)to.value=ctx.to;
    }
    if(ctx.q!=null&&document.getElementById('financialSearch'))document.getElementById('financialSearch').value=ctx.q;
    const tab=ctx.tab||(ctx.section==='upcoming'?'upcoming':ctx.section==='stays'?'all':'');
    if(tab&&!applyTab(tab)&&ctx.tab)notice(shell.cannotApply('the selected stay list','Financials'));
    applying=false;
  }
  function persistFromUi(push){
    if(applying||!shell?.writeContext)return;
    const active=document.querySelector('#filterRange [data-range].active, .fp-pills [data-range].active');
    const tab=document.querySelector('#stayTabs [data-tab].active');
    const channel=document.getElementById('filterChannel')||document.getElementById('filterSource');
    shell.writeContext({
      period:active?.getAttribute('data-range')||null,
      range:active?.getAttribute('data-range')||null,
      channel:channel&&channel.id==='filterChannel'?channel.value:null,
      source:document.getElementById('filterSource')?.value||null,
      status:document.getElementById('filterStatus')?.value||null,
      stripe:document.getElementById('filterStripe')?.value||null,
      tab:tab?.getAttribute('data-tab')||null,
      q:document.getElementById('financialSearch')?.value||null
    },{push:Boolean(push)});
  }
  function whenReady(fn){
    const start=Date.now();
    const tick=()=>{
      const last=document.getElementById('lastChecked')?.textContent||'';
      if(last&&!/loading/i.test(last))return fn();
      if(Date.now()-start>8000)return fn();
      setTimeout(tick,150);
    };
    tick();
  }

  whenReady(applyFromUrl);
  window.addEventListener('cjt-context-change',()=>{if(!applying)whenReady(applyFromUrl)});
  document.getElementById('filterRange')?.addEventListener('click',()=>setTimeout(()=>persistFromUi(true),0));
  document.querySelector('.fp-pills')?.addEventListener('click',()=>setTimeout(()=>persistFromUi(true),0));
  ['filterChannel','filterSource','filterStatus','filterStripe'].forEach(id=>{
    document.getElementById(id)?.addEventListener('change',()=>persistFromUi(true));
  });
  document.getElementById('financialSearch')?.addEventListener('input',()=>persistFromUi(false));
  document.getElementById('stayTabs')?.addEventListener('click',()=>setTimeout(()=>persistFromUi(true),0));
  document.getElementById('clearFilters')?.addEventListener('click',()=>setTimeout(()=>persistFromUi(true),0));
})();
