(function(){
  const loginShell=document.getElementById('loginShell');
  const ownerApp=document.getElementById('ownerApp');
  const loginForm=document.getElementById('loginForm');
  const loginMsg=document.getElementById('loginMsg');
  const notice=document.getElementById('moduleNotice');
  const summary=document.getElementById('pricingSummary');
  const seasonTable=document.getElementById('seasonTable');
  const quoteResult=document.getElementById('quoteResult');
  const settingsForm=document.getElementById('settingsForm');
  const seasonForm=document.getElementById('seasonForm');
  const WEEKDAY_NAMES=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  let pricing=null;
  let editingSeasonId=null;

  function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
  function money(v){return Number(v||0).toLocaleString(undefined,{style:'currency',currency:'USD',maximumFractionDigits:0})}
  function date(v){if(!v)return '—';return new Date(`${v}T12:00:00Z`).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})}
  function showLogin(){ownerApp.classList.add('hidden');loginShell.classList.remove('hidden')}
  function showApp(){loginShell.classList.add('hidden');ownerApp.classList.remove('hidden')}
  function showNotice(message,kind){
    notice.textContent=message||'';
    notice.classList.toggle('hidden',!message);
    notice.classList.toggle('ok',kind==='ok');
    notice.classList.toggle('err',kind==='err');
  }
  function setStatus(el,message,kind){
    if(!el)return;
    el.textContent=message||'';
    el.classList.toggle('ok',kind==='ok');
    el.classList.toggle('err',kind==='err');
  }
  function clearFieldErrors(root){
    root.querySelectorAll('.field-error').forEach(el=>{el.textContent='';});
  }
  function showFieldErrors(root,fields){
    clearFieldErrors(root);
    Object.entries(fields||{}).forEach(([key,message])=>{
      const el=root.querySelector(`[data-field="${key}"]`);
      if(el)el.textContent=message;
    });
  }
  function weekendNumbers(data){
    if(Array.isArray(data?.weekendDayNumbers)&&data.weekendDayNumbers.length)return data.weekendDayNumbers.map(Number);
    return (data?.weekendDays||[]).map(name=>WEEKDAY_NAMES.findIndex(day=>day.toLowerCase()===String(name).toLowerCase())).filter(n=>n>=0);
  }

  async function getPricing(){
    const r=await fetch('/api/pricing',{cache:'no-store'});
    const d=await r.json().catch(()=>({}));
    if(r.status===401)throw new Error('unauthorized');
    if(!r.ok)throw new Error(d.message||'Pricing data could not be loaded.');
    return d;
  }
  async function postPricing(payload){
    const r=await fetch('/api/pricing',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    const d=await r.json().catch(()=>({}));
    if(r.status===401)throw new Error('unauthorized');
    if(!r.ok){
      const error=new Error(d.message||'Pricing could not be saved.');
      error.fields=d.fields;
      error.code=d.error;
      throw error;
    }
    return d;
  }

  function joinDays(days){
    const list=(days||[]).filter(Boolean);
    if(!list.length)return 'no weekend days (weekday rate every night)';
    if(list.length===1)return list[0];
    if(list.length===2)return `${list[0]} and ${list[1]}`;
    return `${list.slice(0,-1).join(', ')}, and ${list[list.length-1]}`;
  }
  function monthKey(value){
    const match=String(value||'').match(/^(\d{4})-(\d{2})-/);
    return match?`${match[1]}-${match[2]}`:'';
  }
  function monthLabel(key){
    const [year,month]=key.split('-').map(Number);
    return new Date(Date.UTC(year,month-1,1)).toLocaleDateString(undefined,{month:'short',year:'numeric',timeZone:'UTC'});
  }
  function monthKeyForDate(value){
    return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}`;
  }

  function renderWeekendChecks(selected){
    const chosen=new Set((selected||[]).map(Number));
    document.getElementById('weekendDays').innerHTML=WEEKDAY_NAMES.map((name,day)=>`
      <label><input type="checkbox" name="weekendDay" value="${day}"${chosen.has(day)?' checked':''}>${esc(name.slice(0,3))}</label>
    `).join('');
  }

  function fillSettingsForm(d){
    document.getElementById('settingCleaningFee').value=Number(d.cleaningFee??0);
    document.getElementById('settingTaxRate').value=String(Math.round(Number(d.taxRate||0)*10000)/100);
    document.getElementById('settingMaxGuests').value=Number(d.maxGuests||14);
    document.getElementById('settingPricingThrough').value=d.pricingThrough||'';
    document.getElementById('settingAdvancePct').value=String(Math.round(Number(d.advancePaymentPct||0)*10000)/100);
    document.getElementById('settingSplitDays').value=Number(d.splitPaymentThresholdDays||0);
    renderWeekendChecks(weekendNumbers(d));
  }

  function settingsPayload(){
    const weekendDays=[...document.querySelectorAll('#weekendDays input:checked')].map(el=>Number(el.value));
    return {
      action:'update_settings',
      cleaningFee:Number(document.getElementById('settingCleaningFee').value),
      taxRate:Number(document.getElementById('settingTaxRate').value),
      maxGuests:Number(document.getElementById('settingMaxGuests').value),
      pricingThrough:document.getElementById('settingPricingThrough').value,
      weekendDays,
      advancePaymentPct:Number(document.getElementById('settingAdvancePct').value),
      splitPaymentThresholdDays:Number(document.getElementById('settingSplitDays').value)
    };
  }

  function seasonTableMarkup(seasons){
    return `<div class="pricing-table-wrap"><table class="pricing-table"><thead><tr><th>Season</th><th>Start</th><th>End</th><th class="money">Weekday</th><th class="money">Weekend</th><th>Min nights</th><th></th></tr></thead><tbody>${seasons.map(s=>{
      const canEdit=s.id!=null;
      return `<tr class="${Number(editingSeasonId)===Number(s.id)?'editing':''}" data-season-id="${esc(s.id||'')}">
        <td>${esc(s.name)}</td>
        <td>${esc(date(s.start))}</td>
        <td>${esc(date(s.end))}</td>
        <td class="money">${money(s.weekday)}</td>
        <td class="money">${money(s.weekend)}</td>
        <td>${esc(s.minNights)}</td>
        <td><div class="row-actions">
          <button class="btn-tiny" type="button" data-edit-season="${esc(s.id||'')}" ${canEdit?'':'disabled'}>Edit</button>
          <button class="btn-tiny danger" type="button" data-delete-season="${esc(s.id||'')}" ${canEdit?'':'disabled'}>Delete</button>
        </div></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
  }

  function renderSeasonSchedule(seasons){
    if(!seasons.length){
      seasonTable.innerHTML='<div class="empty">No seasons published yet. Use Add season to create the first date range.</div>';
      return;
    }
    const grouped=new Map();
    seasons.forEach(s=>{
      const key=monthKey(s.start);
      if(!key)return;
      if(!grouped.has(key))grouped.set(key,[]);
      grouped.get(key).push(s);
    });
    const now=new Date();
    const openMonths=new Set([monthKeyForDate(now),monthKeyForDate(new Date(now.getFullYear(),now.getMonth()+1,1))]);
    if(editingSeasonId){
      const editing=seasons.find(s=>Number(s.id)===Number(editingSeasonId));
      if(editing)openMonths.add(monthKey(editing.start));
    }
    const groups=[...grouped.entries()].sort(([a],[b])=>a.localeCompare(b));
    seasonTable.innerHTML=`<div class="season-groups">${groups.map(([key,items])=>{
      const rates=items.flatMap(s=>[Number(s.weekday),Number(s.weekend)]).filter(Number.isFinite);
      const min=rates.length?Math.min(...rates):0;
      const max=rates.length?Math.max(...rates):0;
      const countLabel=`${items.length} season${items.length===1?'':'s'}`;
      return `<details class="season-group"${openMonths.has(key)?' open':''}><summary><span class="season-group-heading"><strong>${esc(monthLabel(key))}</strong><span>${countLabel} · ${money(min)}–${money(max)} / night</span></span><span class="season-group-chevron" aria-hidden="true">⌄</span></summary><div class="season-group-body">${seasonTableMarkup(items)}</div></details>`;
    }).join('')}</div>`;
  }

  function resetSeasonForm(){
    editingSeasonId=null;
    seasonForm.reset();
    document.getElementById('seasonId').value='';
    document.getElementById('seasonMinNights').value='2';
    document.getElementById('seasonEditorTitle').textContent='Add season';
    document.getElementById('seasonEditorHelp').textContent='Create a new date range with weekday/weekend rates and a minimum stay.';
    document.getElementById('saveSeasonBtn').textContent='Save season';
    clearFieldErrors(seasonForm);
    setStatus(document.getElementById('seasonStatus'),'');
  }

  function fillSeasonForm(season){
    editingSeasonId=season.id;
    document.getElementById('seasonId').value=season.id;
    document.getElementById('seasonName').value=season.name||'';
    document.getElementById('seasonStart').value=season.start||'';
    document.getElementById('seasonEnd').value=season.end||'';
    document.getElementById('seasonWeekday').value=season.weekday||'';
    document.getElementById('seasonWeekend').value=season.weekend||'';
    document.getElementById('seasonMinNights').value=season.minNights||2;
    document.getElementById('seasonEditorTitle').textContent=`Edit ${season.name}`;
    document.getElementById('seasonEditorHelp').textContent='Update this season and save. Guest quotes use the new rates immediately.';
    document.getElementById('saveSeasonBtn').textContent='Save changes';
    clearFieldErrors(seasonForm);
    setStatus(document.getElementById('seasonStatus'),'');
    document.getElementById('seasonEditorCard').scrollIntoView({behavior:'smooth',block:'start'});
  }

  function renderPricing(d){
    pricing=d;
    const split=`${Math.round(Number(d.advancePaymentPct)*100)}% at booking · balance ${d.splitPaymentThresholdDays} days before arrival`;
    const weekendLabel=joinDays(d.weekendDays);
    summary.innerHTML=[['Cleaning fee',money(d.cleaningFee)],['Tax rate',`${Number(d.taxRate)*100}%`],['Pricing through',date(d.pricingThrough)],['Max guests',d.maxGuests],['Weekend days',(d.weekendDays||[]).map(v=>v.slice(0,3)).join(' / ')||'None'],['Payment terms',split]].map(([label,value])=>`<div class="summary-card"><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join('');
    document.getElementById('seasonCount').textContent=`${(d.seasons||[]).length} seasons`;
    document.getElementById('weekendNote').textContent=`Weekend rates apply ${weekendLabel}. Dates outside the published window are not available for online direct-booking quotes.`;
    const guestsInput=document.getElementById('quoteGuests');
    const maxGuests=Number(d.maxGuests)||14;
    guestsInput.max=String(maxGuests);
    if(Number(guestsInput.value)>maxGuests)guestsInput.value=String(maxGuests);
    fillSettingsForm(d);
    renderSeasonSchedule(d.seasons||[]);
    document.getElementById('lastChecked').textContent=d.source==='fallback'?'Using built-in defaults until the first save':'Schedule saved in Neon';
    if(d.source==='fallback')showNotice('The published schedule is still using built-in defaults. Save settings or add a season to write it into Neon. After that, this page is the only write path.','err');
    else if(notice.classList.contains('err')&&/built-in defaults/i.test(notice.textContent))showNotice('');
  }

  function quoteError(payload){
    const code=payload&&payload.code;
    const msg=payload&&payload.message;
    let title='Quote could not be calculated';
    let detail=msg||'Try again with different dates or guests.';
    if(code==='OTA_FEED_CONFIG_MISSING'||/Missing required OTA calendar feed/i.test(msg||'')){
      title='Calendar feeds are not configured';
      detail='Preview is missing AIRBNB_ICAL_URL and/or VRBO_ICAL_URL, so availability-backed quotes fail closed. The season schedule above is still valid; fix calendar env, then retry the tester.';
    }else if(code==='dates_unavailable'){
      title='Those nights are unavailable';
      detail=msg||'One or more requested nights are blocked on the live calendar.';
    }else if(code==='pricing_not_published'){
      title='Outside the published pricing window';
      detail=msg;
    }else if(code==='minimum_stay'||code==='invalid_dates'||code==='invalid_guests'){
      title='Quote rules blocked this stay';
      detail=msg;
    }else if(code==='quote_unavailable'){
      title='Quote service unavailable';
      detail=msg||'The booking engine could not calculate this quote right now.';
    }
    return `<div class="quote-error"><strong style="display:block;margin-bottom:4px">${esc(title)}</strong>${esc(detail)}</div>`;
  }

  function renderQuote(q){
    const s=q.paymentSchedule||{};
    const schedule=s.mode==='split'?`<strong>Split payment</strong>${money(s.dueAtBooking)} due at booking · ${money(s.remainingBalance)} due ${esc(s.balanceDueDateLabel||'before arrival')}.`:`<strong>Full payment</strong>${money(s.dueAtBooking||q.total)} due at booking.`;
    quoteResult.innerHTML=`<div class="meta">${esc(q.nights)} nights · ${esc(q.guests)} guests</div><dl class="quote-grid"><dt>Lodging</dt><dd>${money(q.lodgingSubtotal)}</dd><dt>Cleaning fee</dt><dd>${money(q.cleaningFee)}</dd><dt>Tax</dt><dd>${money(q.taxes)}</dd><dt class="quote-total">Total</dt><dd class="quote-total">${money(q.total)}</dd></dl><div class="schedule">${schedule}</div>`;
    quoteResult.classList.remove('hidden');
  }

  document.getElementById('quoteForm').addEventListener('submit',async e=>{
    e.preventDefault();quoteResult.classList.remove('hidden');quoteResult.innerHTML='<div class="meta">Calculating…</div>';
    const params=new URLSearchParams({checkin:document.getElementById('quoteCheckin').value,checkout:document.getElementById('quoteCheckout').value,guests:document.getElementById('quoteGuests').value});
    try{const r=await fetch(`/api/quote?${params}`,{cache:'no-store'}),d=await r.json().catch(()=>({}));if(!r.ok){quoteResult.innerHTML=quoteError({code:d.error||d.code,message:d.message||'The quote could not be calculated.'});return}renderQuote(d.quote)}catch(error){quoteResult.innerHTML=quoteError({code:'quote_unavailable',message:error.message})}
  });

  settingsForm.addEventListener('submit',async e=>{
    e.preventDefault();
    const btn=document.getElementById('saveSettingsBtn');
    btn.disabled=true;
    setStatus(document.getElementById('settingsStatus'),'Saving…');
    clearFieldErrors(settingsForm);
    try{
      const data=await postPricing(settingsPayload());
      renderPricing(data);
      setStatus(document.getElementById('settingsStatus'),'Settings saved. Guest quotes now use these values.','ok');
      showNotice('Pricing settings saved. The quote tester and guest booking page use the new values.','ok');
    }catch(error){
      if(error.message==='unauthorized')return showLogin();
      showFieldErrors(settingsForm,error.fields);
      setStatus(document.getElementById('settingsStatus'),error.message,'err');
      showNotice(error.message,'err');
    }finally{
      btn.disabled=false;
    }
  });

  seasonForm.addEventListener('submit',async e=>{
    e.preventDefault();
    const btn=document.getElementById('saveSeasonBtn');
    btn.disabled=true;
    setStatus(document.getElementById('seasonStatus'),'Saving…');
    clearFieldErrors(seasonForm);
    const payload={
      action:editingSeasonId?'update_season':'create_season',
      id:editingSeasonId||undefined,
      name:document.getElementById('seasonName').value.trim(),
      start:document.getElementById('seasonStart').value,
      end:document.getElementById('seasonEnd').value,
      weekday:Number(document.getElementById('seasonWeekday').value),
      weekend:Number(document.getElementById('seasonWeekend').value),
      minNights:Number(document.getElementById('seasonMinNights').value)
    };
    try{
      const data=await postPricing(payload);
      const keepId=editingSeasonId;
      renderPricing(data);
      if(keepId){
        const updated=(data.seasons||[]).find(s=>Number(s.id)===Number(keepId));
        if(updated)fillSeasonForm(updated);
      }else{
        resetSeasonForm();
      }
      setStatus(document.getElementById('seasonStatus'),keepId?'Season updated.':'Season added.','ok');
      showNotice(keepId?'Season updated. Reload or rerun the quote tester to confirm guest totals.':'Season added to the published schedule.','ok');
    }catch(error){
      if(error.message==='unauthorized')return showLogin();
      showFieldErrors(seasonForm,error.fields);
      setStatus(document.getElementById('seasonStatus'),error.message,'err');
      showNotice(error.message,'err');
    }finally{
      btn.disabled=false;
    }
  });

  document.getElementById('addSeasonBtn').addEventListener('click',()=>{
    resetSeasonForm();
    document.getElementById('seasonEditorCard').scrollIntoView({behavior:'smooth',block:'start'});
    document.getElementById('seasonName').focus();
  });
  document.getElementById('cancelSeasonBtn').addEventListener('click',()=>{
    resetSeasonForm();
    if(pricing)renderSeasonSchedule(pricing.seasons||[]);
  });

  seasonTable.addEventListener('click',async e=>{
    const editBtn=e.target.closest('[data-edit-season]');
    if(editBtn){
      const id=Number(editBtn.getAttribute('data-edit-season'));
      const season=(pricing?.seasons||[]).find(s=>Number(s.id)===id);
      if(!season)return;
      fillSeasonForm(season);
      renderSeasonSchedule(pricing.seasons||[]);
      return;
    }
    const deleteBtn=e.target.closest('[data-delete-season]');
    if(!deleteBtn)return;
    const id=Number(deleteBtn.getAttribute('data-delete-season'));
    const season=(pricing?.seasons||[]).find(s=>Number(s.id)===id);
    if(!season)return;
    const ok=window.confirm(`Delete “${season.name}” (${season.start} – ${season.end})? Guest quotes will use the remaining seasons.`);
    if(!ok)return;
    deleteBtn.disabled=true;
    try{
      const data=await postPricing({action:'delete_season',id});
      if(Number(editingSeasonId)===id)resetSeasonForm();
      renderPricing(data);
      showNotice(`Deleted ${season.name}.`,'ok');
    }catch(error){
      if(error.message==='unauthorized')return showLogin();
      showNotice(error.message,'err');
    }finally{
      deleteBtn.disabled=false;
    }
  });

  loginForm.addEventListener('submit',async e=>{
    e.preventDefault();loginMsg.textContent='Signing in…';
    try{
      const r=await fetch('/api/owner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',passcode:document.getElementById('passcode').value})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||'invalid_passcode');
      document.getElementById('passcode').value='';
      loginMsg.textContent='';
      showApp();
      resetSeasonForm();
      renderPricing(await getPricing());
    }catch(error){
      loginMsg.textContent=error.message==='owner_login_not_configured'?'Owner login is not configured for this environment.':'Invalid passcode.';
    }
  });

  (async()=>{
    try{
      const data=await getPricing();
      showApp();
      resetSeasonForm();
      renderPricing(data);
    }catch(error){
      if(error.message==='unauthorized')showLogin();
      else{showApp();showNotice(error.message,'err')}
    }
  })();
})();
