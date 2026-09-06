(() => {
  const $ = id => document.getElementById(id);
  const pricing = $('pricing');
  if (!pricing) return;
  function message(id) {
    let el = $(id);
    if (!el) { el = document.createElement('p'); el.id = id; el.className = 'meta'; }
    el.setAttribute('role','status'); el.setAttribute('aria-live','polite');
    return el;
  }
  for (const [form,id] of [['midweekForm','midweekSaveMsg'],['longForm','longSaveMsg']]) $(form).append(message(id));
  const notices = ['pricingRulesMsg','overrideMsg','customerPricingMsg','midweekSaveMsg','longSaveMsg'];
  notices.forEach(message);
  async function request(url, payload) {
    const r = await fetch(url,{cache:'no-store',...(payload ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)} : {})});
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Request failed (' + r.status + ')');
    return data;
  }
  const number = id => Number($(id).value);
  const matches = (actual,expected) => actual && Object.keys(expected).every(k => actual[k] === expected[k]);
  let saving = false;
  async function save(form,msgId,url,payload,verify,summary) {
    if (saving || !form.reportValidity()) return;
    saving = true;
    const controls = [...pricing.querySelectorAll('input,button,select')].map(el=>[el,el.disabled]);
    controls.forEach(([el])=>el.disabled=true);
    const msg = message(msgId);
    msg.className = 'meta'; msg.textContent = 'Saving…';
    let acknowledged = false;
    try {
      await request(url,payload); acknowledged = true;
      msg.textContent = 'Saved; checking stored values…';
      const stored = await request(url);
      if (!verify(stored)) throw new Error('Stored values did not match. Reload and review before retrying.');
      if (url === '/api/owner') { state = stored; render(); }
      msg.className = 'meta success';
      msg.textContent = 'Saved and verified at ' + new Date().toLocaleTimeString() + '. ' + summary;
    } catch (e) {
      msg.className = 'meta error';
      msg.textContent = (acknowledged ? 'Save received, but verification failed. ' : 'Save could not be confirmed. ') + e.message;
    } finally {
      controls.forEach(([el,disabled])=>el.disabled=disabled);
      saving = false;
    }
  }
  function bind(formId,msgId,build,key,summary) {
    const form = $(formId);
    form.onsubmit = e => {
      e.preventDefault();
      const payload = build();
      const expected = payload.value || Object.fromEntries(Object.entries(payload).filter(([k])=>k!=='action'));
      return save(form,msgId,'/api/owner',payload,d=>matches(d.siteConfig[key],expected),summary(expected));
    };
  }
  bind('pricingRulesForm','pricingRulesMsg',()=>({action:'pricing_rules_update',weekday_rate:number('weekdayRate'),weekend_rate:number('weekendRate'),default_min_nights:number('defaultMinNights')}),'pricing_rules',v=>'Base rates: $'+v.weekday_rate+' Sun–Thu; $'+v.weekend_rate+' Fri–Sat; '+v.default_min_nights+' night minimum.');
  bind('midweekForm','midweekSaveMsg',()=>({action:'promo_update',key:'midweek_offer',value:{enabled:$('midEnabled').checked,discount_pct:number('midPct'),min_nights:number('midMin')}}),'midweek_offer',v=>'Midweek offer '+(v.enabled?'enabled':'disabled')+'; '+v.discount_pct+'% for '+v.min_nights+'+ nights.');
  bind('longForm','longSaveMsg',()=>({action:'promo_update',key:'long_stay_offer',value:{enabled:$('longEnabled').checked,seven_night_pct:number('sevenPct'),fourteen_night_pct:number('fourteenPct'),twentyeight_night_pct:number('twentyeightPct')}}),'long_stay_offer',v=>'Extended offer '+(v.enabled?'enabled':'disabled')+'; 7 / 14 / 28 nights: '+[v.seven_night_pct,v.fourteen_night_pct,v.twentyeight_night_pct].join('% / ')+'%.');
  const fees = $('customerPricingForm');
  fees.onsubmit = e => {
    e.preventDefault();
    const p = {configured:$('customerPricingEnabled').checked,cleaning_fee:number('customerCleaning'),tax_pct:number('customerTax'),deposit_pct:number('customerDeposit'),taxable_cleaning:$('customerTaxCleaning').checked};
    return save(fees,'customerPricingMsg','/api/booking-settings',p,d=>matches(d.config,p),
      'Cleaning $'+p.cleaning_fee+'; tax '+p.tax_pct+'%; deposit '+p.deposit_pct+'%; customer pricing '+(p.configured?'enabled (positive nightly rates also required).':'disabled.'));
  };
  function dates(a,b) {
    const out=[];
    for(let d=new Date(a+'T00:00:00Z');Number.isFinite(d.getTime())&&d<=new Date(b+'T00:00:00Z')&&out.length<=180;d.setUTCDate(d.getUTCDate()+1))out.push(d.toISOString().slice(0,10));
    return out;
  }
  $('overrideForm').onsubmit = e => {
    e.preventDefault();
    const p={action:'pricing_override_range_upsert',start_date:$('overrideStart').value,end_date:$('overrideEnd').value,nightly_rate:number('overrideRate'),min_nights:$('overrideMin').value===''?null:number('overrideMin'),label:$('overrideLabel').value.trim()||null};
    const days=dates(p.start_date,p.end_date);
    if(!days.length||days.length>180){$('overrideMsg').textContent='Choose an ordered date range of up to 180 days.';return;}
    return save($('overrideForm'),'overrideMsg','/api/owner',p,d=>days.every(day=>d.pricingOverrides.some(r=>r.stay_date===day&&matches(r,{nightly_rate:p.nightly_rate,min_nights:p.min_nights,label:p.label}))),days.length+' custom nightly rates updated. Calendar refreshed.');
  };
  $('clearOverrideBtn').onclick = () => {
    const a=$('overrideStart').value,b=$('overrideEnd').value||a,days=dates(a,b);
    if(!days.length||days.length>180){$('overrideMsg').textContent='Choose an ordered date range of up to 180 days.';return;}
    if(!confirm('Clear custom rates from '+a+' through '+b+'? Base rates will apply.'))return;
    // Clearing does not require a replacement nightly rate.
    return save({reportValidity:()=>true},'overrideMsg','/api/owner',{action:'pricing_override_range_delete',start_date:a,end_date:b},d=>days.every(day=>!d.pricingOverrides.some(r=>r.stay_date===day)),'Custom rates cleared. Base rates now apply.');
  };

  const card=document.createElement('div');card.className='card';
  card.innerHTML='<h3>Upload nightly pricing</h3><p class="meta">Upload a CSV exported from Excel. One row per date, up to 730 dates. Imported rows replace custom rates, minimum stays and labels for those dates only. Blank minimum nights uses the base minimum. Calendar blocks and reservations are unchanged. Direct Booking only.</p><a class="btn ghost" href="/pricing-template.csv" download>Download CSV template</a><p><label for="pricingFile">Pricing CSV file</label><input id="pricingFile" type="file" accept=".csv,text/csv"></p><div id="pricingImportPreview" style="max-height:320px;overflow:auto"></div><button id="pricingImportSave" type="button" class="btn primary" disabled>Save uploaded pricing</button><p id="pricingImportMsg" class="meta" role="status" aria-live="polite"></p>';
  pricing.append(card);
  let rows=null;
  function parseCSV(text) {
    const result=[];let row=[],cell='',quoted=false;
    text=text.replace(/^\uFEFF/,'');
    for(let i=0;i<text.length;i++){
      const ch=text[i];
      if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
      else if(ch===','&&!quoted){row.push(cell.trim());cell='';}
      else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell.trim());if(row.some(Boolean))result.push(row);row=[];cell='';}
      else cell+=ch;
    }
    if(quoted)throw new Error('Unclosed quote in CSV.');
    row.push(cell.trim());if(row.some(Boolean))result.push(row);
    const header=result.shift()||[];
    if(header.join(',')!=='date,nightly_rate,min_nights,label')throw new Error('Use template columns: date,nightly_rate,min_nights,label.');
    if(!result.length||result.length>730)throw new Error('Use 1–730 pricing rows.');
    const seen=new Set();
    return result.map((r,i)=>{
      if(r.length!==4)throw new Error('Expected four columns on row '+(i+2));
      const [date,rate,min,label]=r,d=new Date(date+'T00:00:00Z');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==date)throw new Error('Invalid date on row '+(i+2)+'. Use YYYY-MM-DD.');
      if(seen.has(date))throw new Error('Duplicate date: '+date);seen.add(date);
      if(!rate||!Number.isFinite(Number(rate))||Number(rate)<=0||Number(rate)>5000||Math.abs(Number(rate)*100-Math.round(Number(rate)*100))>0.000001)throw new Error('Invalid rate for '+date+'. Use 0.01–5000 and at most two decimals.');
      if(min!==''&&(!Number.isInteger(Number(min))||Number(min)<1||Number(min)>30))throw new Error('Invalid minimum nights for '+date);
      if(label.length>100)throw new Error('Label too long for '+date);
      return {date,nightly_rate:Number(rate),min_nights:min===''?null:Number(min),label:label||null};
    });
  }
  $('pricingFile').onchange=async()=>{
    rows=null;$('pricingImportSave').disabled=true;$('pricingImportPreview').replaceChildren();
    try{
      const f=$('pricingFile').files[0];if(!f)return;
      if(f.size>256000)throw new Error('CSV must be smaller than 256 KB.');
      rows=parseCSV(await f.text());
      const table=document.createElement('table');table.style.width='100%';
      for(const r of [['Date','Nightly rate','Minimum nights','Label'],...rows.map(r=>[r.date,'$'+r.nightly_rate.toFixed(2),r.min_nights??'Base minimum',r.label||''])]){
        const tr=document.createElement('tr');for(const v of r){const td=document.createElement('td');td.textContent=v;td.style.padding='8px';tr.append(td);}table.append(tr);
      }
      $('pricingImportPreview').append(table);
      $('pricingImportMsg').textContent=rows.length+' dates validated. Review all rows, then Save uploaded pricing.';
      $('pricingImportSave').disabled=state.user?.role!=='admin';
    }catch(e){rows=null;$('pricingImportMsg').textContent=e.message;}
  };
  $('pricingImportSave').onclick=async()=>{
    if(!rows||state.user?.role!=='admin')return;
    const selected=rows;
    if(!confirm('Replace custom pricing for these '+selected.length+' dates?'))return;
    await save({reportValidity:()=>true},'pricingImportMsg','/api/owner',{action:'pricing_import',rows:selected},d=>selected.every(r=>d.pricingOverrides.some(v=>v.stay_date===r.date&&matches(v,{nightly_rate:r.nightly_rate,min_nights:r.min_nights,label:r.label}))),selected.length+' imported dates verified. Calendar refreshed.');
  };
  function access(){if(saving)return;const admin=state.user?.role==='admin';$('pricingFile').disabled=!admin;$('pricingImportSave').disabled=!admin||!rows;}
  new MutationObserver(access).observe($('portal'),{attributes:true,attributeFilter:['class']});
  access();
})();
