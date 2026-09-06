const assert=require('node:assert/strict');
function stub(file,exports){const id=require.resolve(file);require.cache[id]={id,filename:id,loaded:true,exports};}
const sql=async()=>[];let guestWrites=0;
stub('../lib/db',{db:()=>sql,ensureSchema:async()=>{},expireHolds:async()=>{}});
stub('../lib/availability',{getOtaBlockedDates:async()=>({dates:new Set(),sources:[{name:'airbnb',ok:true},{name:'vrbo',ok:true},{name:'booking.com',error:'not_configured'}]}),eachDate:()=>['2091-04-02','2091-04-03']});
const quote={pricingReady:true,total:600,nightlySubtotal:500};stub('../lib/pricing',{calculateQuote:async()=>quote});
stub('../lib/guests',{upsertGuest:async()=>{guestWrites++;throw Error('Unexpected guest write')}});
stub('../lib/guest-access',{createGuestAccessToken:async()=>{throw Error('Unexpected token write')}});
async function call(handler,req){const res={code:200,status(n){this.code=n;return this},json(d){this.body=d;return this},send(d){this.body=d;return this},setHeader(){}};await handler(req,res);return res;}
(async()=>{
 const inquiry=require('../api/inquiries'),quoteApi=require('../api/quote'),page=require('../api/customer-test-page');
 const body={name:'Test',email:'test@example.invalid',phone:'123',trip_type:'Family trip',checkin:'2091-04-02',checkout:'2091-04-04',guests:2,expected_quote:{...quote,total:550}};
 process.env.VERCEL_ENV='production';process.env.VERCEL_GIT_COMMIT_REF='customer-v3-ops';
 assert.equal((await call(inquiry,{method:'POST',body,query:{}})).code,409);assert.equal(guestWrites,0);
 for(const h of [inquiry,quoteApi])assert.equal((await call(h,{method:'POST',body,query:{booking_test:'1'}})).code,400);
 assert.equal((await call(page,{})).code,404);
 process.env.VERCEL_ENV='preview';const test=await call(inquiry,{method:'POST',query:{booking_test:'1'},body:{...body,expected_quote:quote}});assert.equal(test.code,200);assert.equal(test.body.testMode,true);assert.equal(guestWrites,0);
 const html=await call(page,{});assert.match(html.body,/<body data-booking-test="1">/);assert.match(html.body,/customer-pricing.js/);
 const owner=require('../api/owner');assert.equal((await call(owner,{method:'POST',headers:{},body:{action:'pricing_publish'}})).code,401);
 console.log('PASS: changed quotes rejected before guest writes, test-mode guards, no-write test submission, test-page marker and signed-out pricing denial.');
})().catch(e=>{console.error(e);process.exit(1)});
