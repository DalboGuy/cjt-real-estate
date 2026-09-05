const assert=require('node:assert/strict'),fs=require('node:fs');const {JSDOM}=require('jsdom');
const tick=()=>new Promise(r=>setImmediate(r));
(async()=>{
 const dom=new JSDOM(fs.readFileSync('v3.html','utf8'),{url:'https://example.com/',runScripts:'outside-only'}),w=dom.window;const calls=[];
 const quote={pricingReady:true,total:1000,nights:3,nightlySubtotal:900,discountAmount:0,cleaningFee:0,taxes:100,depositDue:350};
 w.fetch=async(url,o)=>{calls.push({url,body:JSON.parse(o.body)});return {ok:true,json:async()=>url.includes('/quote')?{quote}:{reservation:{id:'TEST'}}}};
 w.eval(fs.readFileSync('customer-pricing.js','utf8'));const form=w.document.getElementById('bookingForm');
 form.elements.checkin.value='2091-04-02';form.elements.checkout.value='2091-04-05';form.elements.guests.value='3';
 assert.equal(form.elements.phone.required,true);assert.ok(form.elements.trip_type);
 const btn=[...form.querySelectorAll('button')].find(b=>b.type==='button');await btn.onclick();assert.equal(form.querySelector('#submitBtn').disabled,false);assert.match(form.textContent,/1,000.00/);
 form.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();assert.equal(calls[1].body.expected_quote.total,1000);assert.match(form.textContent,/temporarily held/);
 // Changed input invalidates the displayed price and prevents submission.
 form.elements.checkin.dispatchEvent(new w.Event('input'));assert.equal(form.querySelector('#submitBtn').disabled,true);
 dom.window.close();
 const owner=new JSDOM('<body><section id="pricing"><div class="pricingnote"></div></section></body>',{url:'https://example.com',runScripts:'outside-only'}),v=owner.window;v.confirm=()=>true;
 const snap={rules:{value:{weekday_rate:200,weekend_rate:200}},overrides:[]};let published=0;
 v.fetch=async(url,o)=>{const b=JSON.parse(o.body);if(b.action==='pricing_publish'){published++;assert.deepEqual(b.expected_snapshot,snap)}return {ok:true,json:async()=>b.action==='pricing_preview'?{snapshot:snap,entries:[{stay_date:'2091-04-02',old:null,new:{nightly_rate:300}}]}:b.action==='pricing_history'?{history:[]}:{count:1}}};
 v.eval(fs.readFileSync('owner-pricing-adjustments.js','utf8'));const doc=v.document;
 assert.equal(doc.querySelectorAll('input[type=checkbox]:disabled').length,4);
 doc.getElementById('paStart').value='2091-04-02';doc.getElementById('paEnd').value='2091-04-02';doc.getElementById('paAmount').value='300';
 await doc.getElementById('paForm').onsubmit({preventDefault(){}});assert.equal(doc.getElementById('paPublish').hidden,false);await doc.getElementById('paPublish').onclick();assert.equal(published,1);assert.match(doc.getElementById('paMessage').textContent,/Published 1 nights/);
 owner.window.close();console.log('PASS: owner preview/publish, disabled external channels, customer quote rendering, reviewed quote submission and input invalidation.');
})().catch(e=>{console.error(e);process.exit(1)});
