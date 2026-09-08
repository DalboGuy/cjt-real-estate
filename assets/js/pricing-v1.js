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
  const discountForm=document.getElementById('discountForm');
  const overrideForm=document.getElementById('overrideForm');
  const costPolicyForm=document.getElementById('costPolicyForm');
  const WEEKDAY_NAMES=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  let pricing=null;
  let editingSeasonId=null;
  let importFile=null;
  let importCsv='';
  const seasonFilters={year:'all',months:'near',q:''};
  const filterYear=document.getElementById('filterYear');
  const filterMonths=document.getElementById('filterMonths');
  const seasonSearch=document.getElementById('seasonSearch');
  const clearSeasonFilters=document.getElementById('clearSeasonFilters');
  const shell=()=>window.CJTOwnerShell;

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
  function seasonFiltersActive(){
    return seasonFilters.year!=='all'||seasonFilters.months!=='near'||Boolean((seasonSearch?.value||'').trim());
  }
  function syncSeasonFilterControls(){
    filterMonths?.querySelectorAll('[data-months]').forEach(btn=>{
      btn.classList.toggle('active',btn.dataset.months===seasonFilters.months);
    });
    if(filterYear)filterYear.value=seasonFilters.year;
    clearSeasonFilters?.classList.toggle('hidden',!seasonFiltersActive());
  }
  function populateYearOptions(seasons){
    if(!filterYear)return;
    const years=[...new Set((seasons||[]).map(s=>monthKey(s.start).slice(0,4)).filter(Boolean))].sort();
    const current=seasonFilters.year;
    filterYear.innerHTML=`<option value="all">All years</option>${years.map(year=>`<option value="${esc(year)}">${esc(year)}</option>`).join('')}`;
    if(current!=='all'&&!years.includes(current))seasonFilters.year='all';
    filterYear.value=seasonFilters.year;
  }
  function seasonVisible(s){
    if(editingSeasonId&&Number(s.id)===Number(editingSeasonId))return true;
    if(seasonFilters.year!=='all'&&monthKey(s.start).slice(0,4)!==seasonFilters.year)return false;
    const q=seasonFilters.q.trim().toLowerCase();
    if(q&&!String(s.name||'').toLowerCase().includes(q))return false;
    return true;
  }
  function refreshSeasonView(){
    const all=pricing?.seasons||[];
    const visible=all.filter(seasonVisible);
    const countMeta=document.getElementById('seasonCountMeta');
    if(countMeta){
      if(!all.length)countMeta.textContent='No seasons yet';
      else if(visible.length===all.length)countMeta.textContent=`${all.length} season${all.length===1?'':'s'}`;
      else countMeta.textContent=`${visible.length} of ${all.length} seasons`;
    }
    syncSeasonFilterControls();
    renderSeasonSchedule(all);
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
    const all=seasons||[];
    if(!all.length){
      seasonTable.innerHTML='<div class="empty">No seasons published yet. Use Add season to create the first date range.</div>';
      return;
    }
    const visible=all.filter(seasonVisible);
    if(!visible.length){
      seasonTable.innerHTML='<div class="empty">No seasons match these filters. The published schedule is unchanged — try Clear filters.</div>';
      return;
    }
    const grouped=new Map();
    visible.forEach(s=>{
      const key=monthKey(s.start);
      if(!key)return;
      if(!grouped.has(key))grouped.set(key,[]);
      grouped.get(key).push(s);
    });
    const now=new Date();
    const groups=[...grouped.entries()].sort(([a],[b])=>a.localeCompare(b));
    const openMonths=new Set(seasonFilters.months==='all'
      ?groups.map(([key])=>key)
      :[monthKeyForDate(now),monthKeyForDate(new Date(now.getFullYear(),now.getMonth()+1,1))]);
    if(editingSeasonId){
      const editing=all.find(s=>Number(s.id)===Number(editingSeasonId));
      if(editing)openMonths.add(monthKey(editing.start));
    }
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
    const weekendLabel=joinDays(d.weekendDays);
    const taxPct=`${Math.round(Number(d.taxRate||0)*10000)/100}%`;
    const cards=[
      ['Published seasons',String((d.seasons||[]).length),'On the guest quote schedule'],
      ['Pricing through',date(d.pricingThrough),'Online quotes stop after this date'],
      ['Cleaning fee',money(d.cleaningFee),'Added to every stay'],
      ['Tax rate',taxPct,'Applied to lodging + cleaning']
    ];
    if(shell()?.renderKpiCards)shell().renderKpiCards(summary,cards);
    else summary.innerHTML=cards.map(([label,value,hint])=>`<div class="summary-card"><span>${esc(label)}</span><b>${esc(value)}</b><span>${esc(hint)}</span></div>`).join('');
    document.getElementById('seasonCount').textContent=`${(d.seasons||[]).length} seasons`;
    document.getElementById('weekendNote').textContent=`Weekend rates apply ${weekendLabel}. Dates outside the published window are not available for online direct-booking quotes.`;
    const guestsInput=document.getElementById('quoteGuests');
    const maxGuests=Number(d.maxGuests)||14;
    guestsInput.max=String(maxGuests);
    if(Number(guestsInput.value)>maxGuests)guestsInput.value=String(maxGuests);
    fillSettingsForm(d);
    populateYearOptions(d.seasons||[]);
    refreshSeasonView();
    const checked=d.source==='fallback'?'Using built-in defaults until the first save':'Schedule saved in Neon';
    if(shell()?.setLastChecked)shell().setLastChecked(checked);
    else document.getElementById('lastChecked').textContent=checked;
    if(d.source==='fallback')showNotice('The published schedule is still using built-in defaults. Save settings or add a season to write it into Neon. After that, this page is the only write path.','err');
    else if(notice.classList.contains('err')&&/built-in defaults/i.test(notice.textContent))showNotice('');
    applyPricingContext(d);
    renderDiscounts(d.discounts||[]);
    renderOverrides(d.overrides||[]);
    fillCostPolicy(document.getElementById('costChannel')?.value||'direct');
  }

  function ruleDates(rule){
    if(!rule.start&&!rule.end)return 'Any stay date';
    return `${rule.start?date(rule.start):'Any date'} – ${rule.end?date(rule.end):'No end'}`;
  }

  function renderDiscounts(rules){
    const list=document.getElementById('discountList');
    if(!list)return;
    if(!rules.length){list.innerHTML='<div class="empty">No discounts saved. Base and override rates are unchanged.</div>';return}
    list.innerHTML=rules.map(rule=>{
      const amount=rule.discountType==='fixed'?money(rule.value):`${Number(rule.value)}%`;
      const weekdays=(rule.eligibleWeekdays||[]).map(day=>WEEKDAY_NAMES[Number(day)]?.slice(0,3)).filter(Boolean).join(', ');
      return `<div class="rule-row"><div><strong>${esc(rule.name)} · ${esc(amount)}</strong><span>${esc(rule.channel)} · ${esc(rule.minimumNights)}+ nights${weekdays?` · ${esc(weekdays)}`:''} · ${esc(ruleDates(rule))}</span></div><div class="row-actions"><button class="btn-tiny" type="button" data-edit-discount="${esc(rule.id)}">Edit</button><button class="btn-tiny danger" type="button" data-delete-discount="${esc(rule.id)}">Delete</button></div></div>`;
    }).join('');
  }

  function renderOverrides(rules){
    const list=document.getElementById('overrideList');
    if(!list)return;
    if(!rules.length){list.innerHTML='<div class="empty">No overrides saved. Seasonal rates remain in control.</div>';return}
    list.innerHTML=rules.map(rule=>`<div class="rule-row"><div><strong>${esc(rule.name)} · ${money(rule.nightlyRate)}/night</strong><span>${esc(rule.channel)} · ${esc(ruleDates(rule))}${rule.minNights?` · ${esc(rule.minNights)}-night minimum`:''}</span></div><div class="row-actions"><button class="btn-tiny" type="button" data-edit-override="${esc(rule.id)}">Edit</button><button class="btn-tiny danger" type="button" data-delete-override="${esc(rule.id)}">Delete</button></div></div>`).join('');
  }

  function weekdayNumbers(value){
    const names={sun:0,sunday:0,mon:1,monday:1,tue:2,tues:2,tuesday:2,wed:3,wednesday:3,thu:4,thur:4,thurs:4,thursday:4,fri:5,friday:5,sat:6,saturday:6};
    return [...new Set(String(value||'').toLowerCase().split(/[|,; ]+/).filter(Boolean).map(item=>/^\d$/.test(item)?Number(item):names[item]).filter(day=>Number.isInteger(day)&&day>=0&&day<=6))].sort();
  }

  function resetDiscount(){discountForm?.reset();document.getElementById('discountId').value='';document.getElementById('discountMinimumNights').value='7';setStatus(document.getElementById('discountStatus'),'')}
  function fillDiscount(rule){
    document.getElementById('discountId').value=rule.id||'';document.getElementById('discountName').value=rule.name||'';document.getElementById('discountChannel').value=rule.channel||'all';document.getElementById('discountType').value=rule.discountType||'percent';document.getElementById('discountValue').value=rule.value||'';document.getElementById('discountMinimumNights').value=rule.minimumNights||1;document.getElementById('discountMaximumNights').value=rule.maximumNights||'';document.getElementById('discountStart').value=rule.start||'';document.getElementById('discountEnd').value=rule.end||'';document.getElementById('discountWeekdays').value=(rule.eligibleWeekdays||[]).map(day=>WEEKDAY_NAMES[Number(day)]?.slice(0,3)).filter(Boolean).join(' ');discountForm.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function resetOverride(){overrideForm?.reset();document.getElementById('overrideId').value='';setStatus(document.getElementById('overrideStatus'),'')}
  function fillOverride(rule){
    document.getElementById('overrideId').value=rule.id||'';document.getElementById('overrideName').value=rule.name||'';document.getElementById('overrideChannel').value=rule.channel||'all';document.getElementById('overrideStart').value=rule.start||'';document.getElementById('overrideEnd').value=rule.end||'';document.getElementById('overrideRate').value=rule.nightlyRate||'';document.getElementById('overrideMinimumNights').value=rule.minNights||'';overrideForm.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function fillCostPolicy(channel){
    const policy=(pricing?.costPolicies||[]).find(row=>row.channel===channel)||{channel,monthlyOperatingCost:0,cleaningCost:pricing?.cleaningFee||0,channelFeeRate:0,minimumContribution:0,mode:'monitor'};
    document.getElementById('costMode').value=policy.mode||'monitor';document.getElementById('monthlyOperatingCost').value=policy.monthlyOperatingCost??0;document.getElementById('cleaningCost').value=policy.cleaningCost??0;document.getElementById('channelFeeRate').value=Math.round(Number(policy.channelFeeRate||0)*10000)/100;document.getElementById('minimumContribution').value=policy.minimumContribution??0;
    const badge=document.getElementById('costModeBadge');badge.textContent=policy.mode||'monitor';badge.className=`policy-mode ${policy.mode==='enforce'?'enforce':''}`;
  }

  function addIsoDays(iso,days){
    const d=new Date(`${iso}T12:00:00`);
    d.setDate(d.getDate()+days);
    return d.toISOString().slice(0,10);
  }

  function setPricingDirty(on){
    window.CJTOwnerShell?.markDirty?.(on);
    document.getElementById('pricingDirty')?.classList.toggle('hidden',!on);
  }

  function applyPricingContext(d){
    const ctx=window.CJTOwnerShell?.readContext?.()||{};
    const dateValue=ctx.date;
    if(dateValue&&/^\d{4}-\d{2}-\d{2}$/.test(dateValue)){
      const checkin=document.getElementById('quoteCheckin');
      const checkout=document.getElementById('quoteCheckout');
      if(checkin&&!checkin.value)checkin.value=dateValue;
      if(checkout&&!checkout.value)checkout.value=addIsoDays(dateValue,2);
      showNotice(`Quote tester pre-filled for ${dateValue}. This does not save a one-night rate.`,'ok');
    }
    const seasonKey=ctx.season;
    if(seasonKey){
      const seasons=d?.seasons||[];
      const match=seasons.find(s=>String(s.id)===String(seasonKey)||String(s.name).toLowerCase()===String(seasonKey).toLowerCase());
      if(match)fillSeasonForm(match);
      else showNotice(window.CJTOwnerShell?.cannotApply?.('the selected season','Pricing')||'Pricing could not apply the selected season.','err');
    }
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
    const adjustment=q.pricingAdjustments||{};
    const discount=adjustment.discount?`<dt>Discount · ${esc(adjustment.discount.name)}</dt><dd>−${money(adjustment.discount.amount)}</dd>`:'';
    const overrides=(adjustment.overrides||[]).length?`<dt>Overrides</dt><dd>${esc(adjustment.overrides.map(item=>`${item.name} (${item.nights})`).join(', '))}</dd>`:'';
    const guard=q.costGuard;
    const guardCopy=guard?`<div class="cost-explanation ${guard.atRisk?'risk':''}"><strong>${esc(q.channel)} cost floor · ${esc(guard.mode)}</strong><br>Allocated operating cost ${money(guard.allocatedOperatingCost)} · required lodging ${money(guard.requiredLodging)} · projected contribution ${money(guard.projectedContribution)}.${guard.applied?' Floor applied to this preview.':guard.atRisk?' Below floor; monitor mode did not change the quote.':' Floor clears.'}</div>`:'';
    quoteResult.innerHTML=`<div class="meta">${esc(q.nights)} nights · ${esc(q.guests)} guests · ${esc(q.channel||'direct')}</div><dl class="quote-grid">${overrides}${discount}<dt>Lodging</dt><dd>${money(q.lodgingSubtotal)}</dd><dt>Cleaning fee</dt><dd>${money(q.cleaningFee)}</dd><dt>Tax</dt><dd>${money(q.taxes)}</dd><dt class="quote-total">Total</dt><dd class="quote-total">${money(q.total)}</dd></dl>${guardCopy}<div class="schedule">${schedule}</div>`;
    quoteResult.classList.remove('hidden');
  }

  document.getElementById('quoteForm').addEventListener('submit',async e=>{
    e.preventDefault();quoteResult.classList.remove('hidden');quoteResult.innerHTML='<div class="meta">Calculating…</div>';
    const payload={action:'preview_quote',checkin:document.getElementById('quoteCheckin').value,checkout:document.getElementById('quoteCheckout').value,guests:Number(document.getElementById('quoteGuests').value),channel:document.getElementById('quoteChannel').value};
    try{const d=await postPricing(payload);renderQuote(d.quote)}catch(error){quoteResult.innerHTML=quoteError({code:error.code,message:error.message})}
  });

  discountForm?.addEventListener('submit',async e=>{
    e.preventDefault();const status=document.getElementById('discountStatus');setStatus(status,'Saving…');
    try{const data=await postPricing({action:'save_discount',id:document.getElementById('discountId').value||undefined,name:document.getElementById('discountName').value,channel:document.getElementById('discountChannel').value,discountType:document.getElementById('discountType').value,value:Number(document.getElementById('discountValue').value),minimumNights:Number(document.getElementById('discountMinimumNights').value),maximumNights:document.getElementById('discountMaximumNights').value||null,start:document.getElementById('discountStart').value||null,end:document.getElementById('discountEnd').value||null,eligibleWeekdays:weekdayNumbers(document.getElementById('discountWeekdays').value)});renderPricing(data);resetDiscount();setStatus(status,'Discount saved and verified.','ok');showNotice('Discount saved. Use Test a quote to verify which eligible offer wins.','ok')}catch(error){setStatus(status,error.message,'err');showNotice(error.message,'err')}
  });
  document.getElementById('discountReset')?.addEventListener('click',resetDiscount);
  document.getElementById('discountList')?.addEventListener('click',async e=>{
    const edit=e.target.closest('[data-edit-discount]'),del=e.target.closest('[data-delete-discount]');
    if(edit){const rule=(pricing.discounts||[]).find(item=>String(item.id)===edit.dataset.editDiscount);if(rule)fillDiscount(rule);return}
    if(del&&confirm('Delete this discount?')){try{const data=await postPricing({action:'delete_discount',id:del.dataset.deleteDiscount});renderPricing(data);showNotice('Discount deleted.','ok')}catch(error){showNotice(error.message,'err')}}
  });

  overrideForm?.addEventListener('submit',async e=>{
    e.preventDefault();const status=document.getElementById('overrideStatus');setStatus(status,'Saving…');
    try{const data=await postPricing({action:'save_override',id:document.getElementById('overrideId').value||undefined,name:document.getElementById('overrideName').value,channel:document.getElementById('overrideChannel').value,start:document.getElementById('overrideStart').value,end:document.getElementById('overrideEnd').value,nightlyRate:Number(document.getElementById('overrideRate').value),minNights:document.getElementById('overrideMinimumNights').value||null});renderPricing(data);resetOverride();setStatus(status,'Override saved and verified.','ok');showNotice('Date override saved. Test an affected stay before relying on it.','ok')}catch(error){setStatus(status,error.message,'err');showNotice(error.message,'err')}
  });
  document.getElementById('overrideReset')?.addEventListener('click',resetOverride);
  document.getElementById('overrideList')?.addEventListener('click',async e=>{
    const edit=e.target.closest('[data-edit-override]'),del=e.target.closest('[data-delete-override]');
    if(edit){const rule=(pricing.overrides||[]).find(item=>String(item.id)===edit.dataset.editOverride);if(rule)fillOverride(rule);return}
    if(del&&confirm('Delete this override?')){try{const data=await postPricing({action:'delete_override',id:del.dataset.deleteOverride});renderPricing(data);showNotice('Pricing override deleted.','ok')}catch(error){showNotice(error.message,'err')}}
  });

  document.getElementById('costChannel')?.addEventListener('change',e=>fillCostPolicy(e.target.value));
  costPolicyForm?.addEventListener('submit',async e=>{
    e.preventDefault();const status=document.getElementById('costStatus');setStatus(status,'Saving…');
    try{const data=await postPricing({action:'save_cost_policy',channel:document.getElementById('costChannel').value,mode:document.getElementById('costMode').value,monthlyOperatingCost:Number(document.getElementById('monthlyOperatingCost').value),cleaningCost:Number(document.getElementById('cleaningCost').value),channelFeeRate:Number(document.getElementById('channelFeeRate').value),minimumContribution:Number(document.getElementById('minimumContribution').value)});renderPricing(data);setStatus(status,`${document.getElementById('costChannel').value} cost policy saved.`,'ok');showNotice('Cost policy saved. Monitor mode does not change public guest prices.','ok')}catch(error){setStatus(status,error.message,'err');showNotice(error.message,'err')}
  });

  async function readImportFile(){
    importFile=document.getElementById('pricingCsv').files[0]||null;
    if(!importFile)throw new Error('Choose a CSV file first.');
    if(importFile.size>500000)throw new Error('Pricing CSV must be 500 KB or smaller.');
    importCsv=await importFile.text();return importCsv;
  }
  function renderImportPreview(result){
    const box=document.getElementById('importPreview');box.classList.remove('hidden');
    const rows=result.rows||[];
    box.innerHTML=`<div class="report-meta"><strong>${esc(result.fileName||'Pricing file')}</strong><span>${esc(result.validCount||0)} of ${esc(result.rowCount||0)} rows valid</span></div><div class="pricing-table-wrap"><table class="pricing-table"><thead><tr><th>Row</th><th>Type</th><th>Name</th><th>Channel</th><th>Result</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${esc(row.rowNumber)}</td><td>${esc(row.recordType||'—')}</td><td>${esc(row.data?.name||'—')}</td><td>${esc(row.data?.channel||'—')}</td><td class="${row.valid?'':'import-error'}">${row.valid?'Ready':esc((row.errors||[]).join('; '))}</td></tr>`).join('')}</tbody></table></div>`;
    document.getElementById('confirmImport').disabled=!result.ok;
  }
  document.getElementById('previewImport')?.addEventListener('click',async()=>{
    const status=document.getElementById('importStatus');setStatus(status,'Reading and validating…');
    try{await readImportFile();const result=await postPricing({action:'preview_import',fileName:importFile.name,csv:importCsv});renderImportPreview(result);setStatus(status,result.ok?'Preview ready. Review every row, then confirm.':'Fix the highlighted rows before importing.',result.ok?'ok':'err')}catch(error){setStatus(status,error.message,'err');document.getElementById('confirmImport').disabled=true}
  });
  document.getElementById('confirmImport')?.addEventListener('click',async()=>{
    const status=document.getElementById('importStatus'),button=document.getElementById('confirmImport');button.disabled=true;setStatus(status,'Importing validated rows…');
    try{const data=await postPricing({action:'commit_import',fileName:importFile.name,csv:importCsv});renderPricing(data);setStatus(status,data.message||'Pricing file imported.','ok');showNotice(data.message||'Pricing file imported and saved.','ok')}catch(error){setStatus(status,error.message,'err');showNotice(error.message,'err')}finally{button.disabled=false}
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
      setPricingDirty(false);
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
      setPricingDirty(false);
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
    refreshSeasonView();
  });

  seasonTable.addEventListener('click',async e=>{
    const editBtn=e.target.closest('[data-edit-season]');
    if(editBtn){
      const id=Number(editBtn.getAttribute('data-edit-season'));
      const season=(pricing?.seasons||[]).find(s=>Number(s.id)===id);
      if(!season)return;
      fillSeasonForm(season);
      refreshSeasonView();
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

  settingsForm.addEventListener('input',()=>setPricingDirty(true));
  seasonForm.addEventListener('input',()=>setPricingDirty(true));
  document.getElementById('savePricingSticky')?.addEventListener('click',()=>{
    if(editingSeasonId||document.getElementById('seasonName')?.value)document.getElementById('saveSeasonBtn')?.click();
    else document.getElementById('saveSettingsBtn')?.click();
  });

  filterMonths?.addEventListener('click',e=>{
    const btn=e.target.closest('[data-months]');
    if(!btn)return;
    seasonFilters.months=btn.dataset.months;
    refreshSeasonView();
  });
  filterYear?.addEventListener('change',()=>{
    seasonFilters.year=filterYear.value;
    refreshSeasonView();
  });
  seasonSearch?.addEventListener('input',()=>{
    seasonFilters.q=seasonSearch.value;
    refreshSeasonView();
  });
  clearSeasonFilters?.addEventListener('click',()=>{
    seasonFilters.year='all';
    seasonFilters.months='near';
    seasonFilters.q='';
    if(seasonSearch)seasonSearch.value='';
    refreshSeasonView();
  });

  async function loadPricing(){
    const refreshBtn=document.getElementById('refreshPricing');
    if(refreshBtn)refreshBtn.disabled=true;
    summary?.classList.add('is-loading');
    try{
      const data=await getPricing();
      showApp();
      const keepId=editingSeasonId;
      if(!keepId)resetSeasonForm();
      renderPricing(data);
      if(keepId){
        const updated=(data.seasons||[]).find(s=>Number(s.id)===Number(keepId));
        if(updated)fillSeasonForm(updated);
        else resetSeasonForm();
      }
    }catch(error){
      summary?.classList.remove('is-loading');
      if(error.message==='unauthorized')showLogin();
      else{
        showApp();
        showNotice(error.message,'err');
        if(seasonTable)seasonTable.innerHTML='<div class="empty">Published seasons could not be loaded. The Neon schedule was not changed.</div>';
        if(shell()?.setLastChecked)shell().setLastChecked('Load failed');
        else{
          const last=document.getElementById('lastChecked');
          if(last)last.textContent='Load failed';
        }
      }
    }finally{
      if(refreshBtn)refreshBtn.disabled=false;
    }
  }
  document.getElementById('refreshPricing')?.addEventListener('click',loadPricing);

  loginForm.addEventListener('submit',async e=>{
    e.preventDefault();
    const btn=loginForm.querySelector('button[type="submit"]');
    if(btn?.disabled)return;
    if(btn)btn.disabled=true;
    loginMsg.textContent='Signing in…';
    try{
      const r=await fetch('/api/owner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',passcode:document.getElementById('passcode').value})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||'invalid_passcode');
      document.getElementById('passcode').value='';
      loginMsg.textContent='';
      if(window.CJTOwnerShell?.afterLogin?.())return;
      showApp();
      loadPricing();
    }catch(error){
      loginMsg.textContent=error.message==='owner_login_not_configured'?'Owner login is not configured for this environment.':'Invalid passcode.';
    }finally{
      if(btn)btn.disabled=false;
    }
  });

  loadPricing();
})();
