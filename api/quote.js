const crypto=require('crypto');
const { db, ensureSchema, expireHolds, getActiveReservations } = require('../lib/db');
const { getOtaBlockedDates, eachDate } = require('../lib/availability');
const { calculateQuote } = require('../lib/pricing');

const MAX_GUESTS=14;

function clean(v,max=100){return String(v||'').trim().slice(0,max);}
function validDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(String(v||''));}
function iso(d){return d.toISOString().slice(0,10);}
function addDays(s,n){const d=new Date(`${s}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return iso(d);}
function makeMockRes(){
  const out={statusCode:200,headers:{},body:null};
  return {out,status(code){out.statusCode=code;return this;},json(body){out.body=body;return this;},setHeader(k,v){out.headers[String(k).toLowerCase()]=v;}};
}
async function callHandler(handler,method,body){const res=makeMockRes();await handler({method,body,headers:{},query:{}},res);return res.out;}
function reservationDates(rows){const s=new Set();for(const r of rows)eachDate(r.checkin,r.checkout).forEach(d=>s.add(d));return s;}
function findOpenStay(blocked,nights,startOffset=21,maxDays=240){
  const today=iso(new Date());
  for(let i=startOffset;i<maxDays;i++){
    const checkin=addDays(today,i),checkout=addDays(checkin,nights),dates=eachDate(checkin,checkout);
    if(dates.every(d=>!blocked.has(d)))return {checkin,checkout,dates};
  }
  return null;
}

async function handleQuotePost(req,res){
  try{
    await ensureSchema();
    await expireHolds();
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const checkin=clean(body.checkin,10),checkout=clean(body.checkout,10),guests=Number(body.guests||0);
    if(!validDate(checkin)||!validDate(checkout)||checkout<=checkin||!Number.isInteger(guests)||guests<1||guests>MAX_GUESTS){
      return res.status(400).json({error:'invalid_request',message:`Select valid dates and a guest count of 1–${MAX_GUESTS}.`});
    }
    const today=new Date().toISOString().slice(0,10);
    if(checkin<today)return res.status(400).json({error:'past_date',message:'Check-in must be a future date.'});

    const requested=eachDate(checkin,checkout);
    const {dates:otaBlocked}=await getOtaBlockedDates();
    if(requested.some(d=>otaBlocked.has(d)))return res.status(409).json({error:'dates_unavailable',message:'One or more requested nights are unavailable.'});

    const sql=db();
    const overlap=await sql`
      SELECT id FROM reservations
      WHERE status IN ('inquiry_hold','hold_verified','contract_sent','contract_signed','confirmed')
        AND daterange(checkin,checkout,'[)') && daterange(${checkin}::date,${checkout}::date,'[)')
      LIMIT 1
    `;
    if(overlap.length)return res.status(409).json({error:'dates_unavailable',message:'Those dates are currently being held or are booked.'});

    let quote;
    try{quote=await calculateQuote(checkin,checkout);}catch(e){
      if(e.code==='minimum_nights')return res.status(400).json({error:e.code,message:e.message,minNights:e.minNights});
      throw e;
    }
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({available:true,quote,checkedAt:new Date().toISOString()});
  }catch(e){
    console.error('quote error',e);
    return res.status(500).json({error:'quote_unavailable',message:'We could not calculate this stay right now. You can still contact CJT directly.'});
  }
}

async function runPreviewAudit(req,res){
  const cleanup=[];
  try{
    await ensureSchema();
    await expireHolds();
    const sql=db();
    const configRows=await sql`SELECT key,value,updated_at FROM site_config WHERE key IN ('pricing_rules','midweek_offer','long_stay_offer','booking_fees') ORDER BY key`;
    const config=Object.fromEntries(configRows.map(r=>[r.key,r.value||{}]));
    const ota=await getOtaBlockedDates();
    const active=await getActiveReservations();
    const blocked=new Set(ota.dates||[]);reservationDates(active).forEach(d=>blocked.add(d));
    const minBase=Math.max(2,Number(config.pricing_rules&&config.pricing_rules.default_min_nights||2));
    let stay=findOpenStay(blocked,Math.max(3,minBase));
    if(!stay)throw new Error('No open test stay found in scan window');

    let quote=await callHandler(handleQuotePost,'POST',{checkin:stay.checkin,checkout:stay.checkout,guests:2});
    if(quote.statusCode===400&&quote.body&&quote.body.error==='minimum_nights'&&quote.body.minNights){
      stay=findOpenStay(blocked,Math.max(3,Number(quote.body.minNights)));
      if(!stay)throw new Error('No open stay found for minimum-night rule');
      quote=await callHandler(handleQuotePost,'POST',{checkin:stay.checkin,checkout:stay.checkout,guests:2});
    }
    const maxGuestQuote=await callHandler(handleQuotePost,'POST',{checkin:stay.checkin,checkout:stay.checkout,guests:MAX_GUESTS});
    const q=quote.body&&quote.body.quote||null;
    const expectedTaxes=q?Math.round(((Number(q.lodgingAfterDiscount)+Number(q.cleaningFee||0))*Number(q.taxPct||0)/100+Number.EPSILON)*100)/100:null;
    const expectedTotal=q?Math.round((Number(q.lodgingAfterDiscount)+Number(q.cleaningFee||0)+Number(q.taxes||0)+Number.EPSILON)*100)/100:null;
    const expectedDeposit=q&&q.total!==null?Math.round((Number(q.total)*Number(q.depositPct||0)/100+Number.EPSILON)*100)/100:null;

    const inquiryHandler=require('./inquiries');
    const calendarHandler=require('./calendar');
    const inquiry=await callHandler(inquiryHandler,'POST',{
      name:'Phase 1 Audit',email:'phase1-audit@example.invalid',phone:'',guests:2,
      checkin:stay.checkin,checkout:stay.checkout,message:'Automated Phase 1 preview audit; auto-cleaned.'
    });
    const reservationId=inquiry.body&&inquiry.body.reservation&&inquiry.body.reservation.id;
    if(reservationId)cleanup.push(reservationId);

    const calendarAfterHold=await callHandler(calendarHandler,'GET',null);
    const holdDatesBlocked=stay.dates.every(d=>calendarAfterHold.body&&calendarAfterHold.body.blockedDates&&calendarAfterHold.body.blockedDates.includes(d));
    const secondQuote=await callHandler(handleQuotePost,'POST',{checkin:stay.checkin,checkout:stay.checkout,guests:2});
    let persisted=null,eventCount=0;
    if(reservationId){
      const rows=await sql`SELECT id,status,checkin::text,checkout::text,guests,hold_expires_at FROM reservations WHERE id=${reservationId}`;
      persisted=rows[0]||null;
      const ev=await sql`SELECT count(*)::int AS n FROM booking_events WHERE reservation_id=${reservationId}`;
      eventCount=ev[0]&&ev[0].n||0;
      await sql`DELETE FROM reservations WHERE id=${reservationId}`;
      cleanup.splice(cleanup.indexOf(reservationId),1);
    }
    const quoteAfterCleanup=await callHandler(handleQuotePost,'POST',{checkin:stay.checkin,checkout:stay.checkout,guests:2});

    const expId=`TEST-EXP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    await sql`
      INSERT INTO reservations (id,guest_name,guest_email,guests,checkin,checkout,status,hold_expires_at,notes)
      VALUES (${expId},'Phase 1 Expiry','phase1-expiry@example.invalid',2,${stay.checkin}::date,${stay.checkout}::date,'inquiry_hold',now()-interval '1 minute','Automated Phase 1 expiry audit; auto-cleaned.')
    `;
    cleanup.push(expId);
    const expiredCount=await expireHolds();
    const expRows=await sql`SELECT status FROM reservations WHERE id=${expId}`;
    const expEvents=await sql`SELECT count(*)::int AS n FROM booking_events WHERE reservation_id=${expId} AND event_type='hold_expired'`;
    await sql`DELETE FROM reservations WHERE id=${expId}`;
    cleanup.splice(cleanup.indexOf(expId),1);

    let otaRejection={tested:false,pass:null};
    const today=iso(new Date());
    const futureOta=[...(ota.dates||[])].filter(d=>d>=today).sort()[0];
    if(futureOta){
      const r=await callHandler(handleQuotePost,'POST',{checkin:futureOta,checkout:addDays(futureOta,1),guests:2});
      otaRejection={tested:true,date:futureOta,statusCode:r.statusCode,error:r.body&&r.body.error,pass:r.statusCode===409&&r.body&&r.body.error==='dates_unavailable'};
    }

    const checks={
      quoteEndpoint:quote.statusCode===200,
      maxGuestCapacity:maxGuestQuote.statusCode===200,
      pricingReady:!!(q&&q.pricingReady),
      cleaningFee:q&&Number(q.cleaningFee)===240,
      taxPct:q&&Number(q.taxPct)===15,
      taxMath:q&&Number(q.taxes)===expectedTaxes,
      totalMath:q&&Number(q.total)===expectedTotal,
      depositPct:q&&Number(q.depositPct)===35,
      depositMath:q&&Number(q.depositDue)===expectedDeposit,
      holdCreated:inquiry.statusCode===201&&!!reservationId,
      holdPersisted:!!(persisted&&persisted.status==='inquiry_hold'),
      holdEvent:eventCount>0,
      calendarBlocksHold:holdDatesBlocked,
      overlapRejected:secondQuote.statusCode===409&&secondQuote.body&&secondQuote.body.error==='dates_unavailable',
      cleanupRestoresQuote:quoteAfterCleanup.statusCode===200,
      expiredHoldTransitions:expRows[0]&&expRows[0].status==='expired',
      expiredHoldEvent:expEvents[0]&&expEvents[0].n>0,
      otaBlockedDateRejected:otaRejection.tested?otaRejection.pass:null
    };
    const pass=Object.entries(checks).filter(([,v])=>v!==null).every(([,v])=>v===true);
    res.setHeader('Cache-Control','no-store');
    return res.status(pass?200:422).json({pass,environment:process.env.VERCEL_ENV||null,maxGuests:MAX_GUESTS,testStay:stay,checks,
      quote:q?{nights:q.nights,minNights:q.minNights,nightly:q.nightly,nightlySubtotal:q.nightlySubtotal,discountName:q.discountName,discountPct:q.discountPct,discountAmount:q.discountAmount,lodgingAfterDiscount:q.lodgingAfterDiscount,cleaningFee:q.cleaningFee,taxPct:q.taxPct,taxes:q.taxes,total:q.total,depositPct:q.depositPct,depositDue:q.depositDue,pricingReady:q.pricingReady,rateStatus:q.rateStatus,feeStatus:q.feeStatus}:null,
      bookingConfig:config,otaSources:ota.sources||[],otaRejection,expiredCount});
  }catch(e){
    try{const sql=db();for(const id of cleanup)await sql`DELETE FROM reservations WHERE id=${id}`;}catch(_){ }
    console.error('phase1 audit error',e);
    return res.status(500).json({pass:false,error:'phase1_audit_failed',message:e.message});
  }
}

module.exports=async function(req,res){
  if(req.method==='GET'&&process.env.VERCEL_ENV!=='production'&&req.query&&String(req.query.phase1_audit||'')==='1')return runPreviewAudit(req,res);
  if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
  return handleQuotePost(req,res);
};