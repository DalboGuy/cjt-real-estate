(function(){
  if(!/\/owner-v1\/calendar/.test(location.pathname))return;
  const shell=window.CJTOwnerShell;
  let applying=false;
  let appliedFocus=false;

  function notice(text){
    const el=document.getElementById('moduleNotice');
    if(!el||!text)return;
    el.textContent=text;
    el.classList.remove('hidden');
  }
  function clickId(id){
    const el=document.getElementById(id);
    if(!el)return false;
    el.click();
    return true;
  }
  function setSelect(id,value){
    const el=document.getElementById(id);
    if(!el||value==null||value==='')return false;
    const match=[...el.options].find(opt=>String(opt.value)===String(value)||String(opt.textContent).toLowerCase()===String(value).toLowerCase());
    if(!match)return false;
    el.value=match.value;
    el.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  }
  function applyChannelStatus(ctx){
    const channel=ctx.channel;
    const status=ctx.status;
    let ok=true;
    if(channel){
      const selectSet=setSelect('channelFilter',channel);
      const btn=[...document.querySelectorAll('#channelFilters [data-channel]')].find(el=>el.getAttribute('data-channel')===channel);
      if(btn)btn.click();
      else if(!selectSet)ok=false;
    }
    if(status){
      const selectSet=setSelect('statusFilter',status);
      const btn=[...document.querySelectorAll('#statusFilters [data-status]')].find(el=>el.getAttribute('data-status')===status);
      if(btn)btn.click();
      else if(!selectSet)ok=false;
    }
    return ok;
  }
  function applyView(view){
    if(view==='week'||view==='agenda')return clickId('viewWeek');
    if(view==='day')return clickId('viewDay')||clickId('viewWeek');
    if(view==='year')return clickId('viewYear');
    if(view==='month')return clickId('viewMonth');
    return false;
  }
  function applyDate(date){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return false;
    const year=date.slice(0,4);
    const month=String(Number(date.slice(5,7)));
    const day=String(Number(date.slice(8,10)));
    const monthOk=setSelect('calMonthSelect',month)||setSelect('calMonthSelect',date.slice(5,7));
    const yearOk=setSelect('calYearSelect',year);
    setSelect('calDaySelect',day);
    return monthOk||yearOk;
  }
  function applyFocus(focus){
    if(appliedFocus||!focus)return;
    appliedFocus=true;
    if(focus==='conflicts'){
      const el=document.getElementById('conflictBanner');
      if(el&&!el.classList.contains('hidden'))el.scrollIntoView({block:'start'});
      else notice(shell?.cannotApply?.('the conflict filter','Calendar')||'Calendar could not apply the conflict filter.');
    }else if(focus==='agenda'){
      document.getElementById('upcomingList')?.closest('.card,.cal-agenda-card')?.scrollIntoView({block:'start'});
    }else if(focus==='connections'||focus==='sync'){
      const details=document.querySelector('.cal-connections, #syncDetails');
      if(details){details.open=true;details.scrollIntoView({block:'start'});}
      else notice(shell?.cannotApply?.('calendar sources','Calendar')||'Calendar could not apply calendar sources.');
    }
  }
  function currentView(){
    if(document.getElementById('viewWeek')?.classList.contains('active'))return 'week';
    if(document.getElementById('viewDay')?.classList.contains('active'))return 'day';
    if(document.getElementById('viewYear')?.classList.contains('active'))return 'year';
    return 'month';
  }
  function persistFromUi(push){
    if(applying||!shell?.writeContext)return;
    const ctx=shell.readContext();
    const channelBtn=document.querySelector('#channelFilters [data-channel].active');
    const statusBtn=document.querySelector('#statusFilters [data-status].active');
    const channelSelect=document.getElementById('channelFilter');
    const statusSelect=document.getElementById('statusFilter');
    shell.writeContext({
      view:currentView(),
      date:ctx.date||null,
      channel:channelBtn?.getAttribute('data-channel')||channelSelect?.value||null,
      status:statusBtn?.getAttribute('data-status')||statusSelect?.value||null
    },{push:Boolean(push)});
  }
  function applyFromUrl(){
    if(!shell?.readContext)return;
    applying=true;
    const ctx=shell.readContext();
    if(ctx.view)applyView(String(ctx.view).toLowerCase());
    if(ctx.date){
      const applied=applyDate(ctx.date);
      if(!applied)notice(shell.cannotApply('the selected date','Calendar'));
    }
    applyChannelStatus(ctx);
    applyFocus(String(ctx.focus||'').toLowerCase());
    applying=false;
  }
  function whenReady(fn){
    const start=Date.now();
    const tick=()=>{
      const title=document.getElementById('calTitle')?.textContent||'';
      if(title&&!/loading/i.test(title))return fn();
      if(Date.now()-start>8000)return fn();
      setTimeout(tick,150);
    };
    tick();
  }

  whenReady(applyFromUrl);
  window.addEventListener('cjt-context-change',()=>{if(!applying)whenReady(applyFromUrl)});
  ['calPrev','calNext','calToday','viewMonth','viewWeek','viewYear','viewDay'].forEach(id=>{
    document.getElementById(id)?.addEventListener('click',()=>setTimeout(()=>persistFromUi(true),200));
  });
  document.getElementById('channelFilters')?.addEventListener('click',()=>setTimeout(()=>persistFromUi(true),0));
  document.getElementById('statusFilters')?.addEventListener('click',()=>setTimeout(()=>persistFromUi(true),0));
  document.getElementById('channelFilter')?.addEventListener('change',()=>persistFromUi(true));
  document.getElementById('statusFilter')?.addEventListener('change',()=>persistFromUi(true));
})();
