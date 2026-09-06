const assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const {validateRows,saveRows}=require('../lib/pricing-import');
const tick=()=>new Promise(r=>setTimeout(r,0));
(async()=>{
  const good=[{date:'2027-01-08',nightly_rate:425,min_nights:2,label:'Weekend'}];
  assert.equal(validateRows(good)[0].nightly_rate,425);
  for(const invalid of [[],[...good,...good],[{...good[0],date:'2027-02-30'}],[{...good[0],nightly_rate:-1}],[{...good[0],nightly_rate:5.123}],[{...good[0],min_nights:31}]]){
    assert.throws(()=>validateRows(invalid));
  }
  let writes=0;
  await saveRows(async(parts,...values)=>{writes++;assert.match(parts.join('?'),/jsonb_to_recordset/);assert.equal(values[0],123);return [{stay_date:'2027-01-08'}]},good,123);
  assert.equal(writes,1);
  const dom=new JSDOM(fs.readFileSync('owner.html','utf8'),{url:'https://example.com',runScripts:'outside-only'});
  const w=dom.window,doc=w.document;
  let config={pricing_rules:{weekday_rate:300,weekend_rate:400,default_min_nights:2}},overrides=[];
  let fees={configured:true,cleaning_fee:240,tax_pct:0,deposit_pct:35,taxable_cleaning:true};
  let fail=false,mismatch=false,postCount=0;
  w.confirm=()=>true;
  w.eval('var state={user:{role:"admin"}};function render(){}');
  w.fetch=async(url,opts={})=>{
    if(fail)throw Error('Network unavailable');
    if(opts.method==='POST'){
      postCount++;const p=JSON.parse(opts.body);
      if(url.includes('booking-settings'))fees=p;
      else if(p.action==='pricing_rules_update'){const {action,...v}=p;config.pricing_rules=v;}
      else if(p.action==='promo_update')config[p.key]=p.value;
      else if(p.action==='pricing_import')overrides=p.rows.map(r=>({...r,stay_date:r.date}));
      else if(p.action==='pricing_override_range_upsert')overrides=[{stay_date:p.start_date,nightly_rate:p.nightly_rate,min_nights:p.min_nights,label:p.label}];
      else if(p.action==='pricing_override_range_delete')overrides=[];
      return {ok:true,json:async()=>({ok:true})};
    }
    return {ok:true,json:async()=>url.includes('booking-settings')?{user:{role:'admin'},config:fees}:{user:{role:'admin'},siteConfig:mismatch?{}:config,pricingOverrides:overrides}};
  };
  w.eval(fs.readFileSync('owner-booking-settings.js','utf8'));
  w.eval(fs.readFileSync('owner-pricing-controls.js','utf8'));
  doc.getElementById('portal').classList.remove('hidden');
  await tick();await tick();
  assert.equal(doc.getElementById('customerTax').value,'0','zero tax preserved after sign-in');
  const set=(id,v)=>doc.getElementById(id).value=v;
  const submit=id=>doc.getElementById(id).onsubmit({preventDefault(){}});
  set('weekdayRate',310);set('weekendRate',450);set('defaultMinNights',2);
  await submit('pricingRulesForm');assert.match(doc.getElementById('pricingRulesMsg').textContent,/Saved and verified/);
  set('midPct',10);set('midMin',2);await submit('midweekForm');
  assert.match(doc.getElementById('midweekSaveMsg').textContent,/Saved and verified/);
  for(const id of ['sevenPct','fourteenPct','twentyeightPct'])set(id,15);
  await submit('longForm');assert.match(doc.getElementById('longSaveMsg').textContent,/Saved and verified/);
  doc.getElementById('customerPricingEnabled').checked=false;
  await submit('customerPricingForm');assert.match(doc.getElementById('customerPricingMsg').textContent,/Saved and verified/);
  assert.equal(fees.configured,false);
  set('overrideStart','2027-01-08');set('overrideEnd','2027-01-08');set('overrideRate',425);
  await submit('overrideForm');assert.match(doc.getElementById('overrideMsg').textContent,/Saved and verified/);
  set('overrideRate','');await doc.getElementById('clearOverrideBtn').onclick();
  assert.match(doc.getElementById('overrideMsg').textContent,/Custom rates cleared/);
  const file=doc.getElementById('pricingFile');
  Object.defineProperty(file,'files',{configurable:true,value:[{size:100,text:async()=>fs.readFileSync('pricing-template.csv','utf8')}]});
  await file.onchange();assert.equal(doc.getElementById('pricingImportSave').disabled,false);
  await doc.getElementById('pricingImportSave').onclick();
  assert.match(doc.getElementById('pricingImportMsg').textContent,/3 imported dates verified/);
  Object.defineProperty(file,'files',{configurable:true,value:[{size:100,text:async()=>'date,nightly_rate,min_nights,label\n2027-02-30,20,2,bad'}]});
  const before=postCount;await file.onchange();assert.equal(doc.getElementById('pricingImportSave').disabled,true);assert.equal(postCount,before);
  mismatch=true;await submit('pricingRulesForm');assert.match(doc.getElementById('pricingRulesMsg').textContent,/verification failed/);
  mismatch=false;fail=true;await submit('midweekForm');assert.match(doc.getElementById('midweekSaveMsg').textContent,/could not be confirmed/);
  assert.equal(doc.querySelector('#midweekForm button').disabled,false);
  dom.window.close();
  console.log('PASS: all pricing saves, readback mismatch, network failure, clear without replacement rate, CSV preview/import, invalid-file rejection, post-login loading and zero-value preservation.');
})().catch(e=>{console.error(e);process.exit(1)});
