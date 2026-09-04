const crypto=require('crypto');
const { db, ensureSchema, expireHolds, getActiveReservations }=require('../lib/db');
const { getOtaBlockedDates, eachDate }=require('../lib/availability');
const quoteHandler=require('./quote');
const inquiryHandler=require('./inquiries');
const calendarHandler=require('./calendar');

function iso(d){return d.toISOString().slice(0,10)}
function addDays(s,n){const d=new Date(`${s}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return iso(d)}
function makeRes(){
  const out={statusCode:200,headers:{},body:null};
  return {
    out,
    status(code){out.statusCode=code;return this},
    json(body){out.body=body;return this},
    setHeader(k,v){out.headers[String(k).toLowerCase()]=v}
  };
}
async function call(handler,method,body){
  const res=makeRes();
  await handler({method,body,headers:{}},res);
  return res.out;
}
function activeDates(rows){const s=new Set();for(const r of rows)eachDate(r.checkin,r.checkout).forEach(d=>s.add(d));return s}
function findOpenStay(blocked,nights,startOffset=21,maxDays=240){
  const today=iso(new Date());
  for(let i=startOffset;i<maxDays;i++){
    const checkin=addDays(today,i),checkout=addDays(checkin,nights);
    const dates=eachDate(checkin,checkout);
    if(dates.every(d=>!blocked.has(d)))return {checkin,checkout,dates};
  }
  return null;
}

module.exports=async function(req,res){
  if(process.env.VERCEL_ENV==='production')return res.status(404).json({error:'not_found'});
  if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
  const cleanup=[];
  try{
    await ensureSchema();
    await expireHolds();
    const sql=db();
    const configRows=await sql`SELECT key,value,updated_at FROM site_config WHERE key IN ('pricing_rules','midweek_offer','long_stay_offer','booking_fees') ORDER BY key`;
    const config=Object.fromEntries(configRows.map(r=>[r.key,r.value||{}]));
    const ota=await getOtaBlockedDates();
    const active=await getActiveReservations();
    const blocked=new Set(ota.dates||[]);activeDates(active).forEach(d=>blocked.add(d));
    const minBase=Math.max(2,Number(config.pricing_rules&&config.pricing_rules.default_min_nights||2));
    let stay=findOpenStay(blocked,Math.max(3,minBase));
    if(!stay)throw new Error('No open test stay found in scan window');

    let quote=await call(quoteHandler,'POST',{checkin:stay.checkin,checkout:stay.checkout,guests:2});
    if(quote.statusCode===400&&quote.body&&quote.body.error==='minimum_nights'&&quote.body.minNights){
      stay=findOpenStay(blocked,Math.max(Number(quote.body.minNights),3));
      if(!stay)throw new Error('No open stay found for minimum-night rule');
      quote=await call(quoteHandler,'POST',{checkin:stay.checkin,checkout:stay.checkout,guests:2});
    }

    const q=quote.body&&quote.body.quote||null;
    const expectedTaxes=q?Math.round(((q.lodgingAfterDiscount+Number(q.cleaningFee||0))*Number(q.taxPct||0)/100+Number.EPSILON)*100)/100:null;
    const expectedTotal=q?Math.round((q.lodgingAfterDiscount+Number(q.cleaningFee||0)+Number(q.taxes||0)+Number.EPSILON)*100)/100:null;
    const expectedDeposit=q&&q.total!==null?Math.round((Number(q.total)*Number(q.depositPct||0)/100+Number.EPSILON)*100)/100:null;

    const inquiry=await call(inquiryHandler,'POST',{
      name:'Phase 1 Audit',email:'phase1-audit@example.invalid',phone:'',guests:2,
      checkin:stay.checkin,checkout:stay.checkout,message:'Automated Phase 1 preview audit; auto-cleaned.'
    });
    const reservationId=inquiry.body&&inquiry.body.reservation&&inquiry.body.reservation.id;
    if(reservationId)cleanup.push(reservationId);

    const calendarAfterHold=await call(calendarHandler,'GET',null);
    const holdDatesBlocked=stay.dates.every(d=>calendarAfterHold.body&&calendarAfterHold.body.blockedDates&&calendarAfterHold.body.blockedDates.includes(d));
    const secondQuote=await call(quoteHandler,'POST',{checkin:stay.checkin,checkout:stay.checkout,guests:2});
    let persisted=null,eventCount=0;
    if(reservationId){
      const rows=await sql`SELECT id,status,checkin::text,checkout::text,guests,hold_expires_at FROM reservations WHERE id=${reservationId}`;
      persisted=rows[0]||null;
      const ev=await sql`SELECT count(*)::int AS n FROM booking_events WHERE reservation_id=${reservationId}`;
      eventCount=ev[0]&&ev[0].n||0;
      await sql`DELETE FROM reservations WHERE id=${reservationId}`;
      cleanup.splice(cleanup.indexOf(reservationId),1);
    }
    const quoteAfterCleanup=await call(quoteHandler,'POST',{checkin:stay.checkin,checkout:stay.checkout,guests:2});

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

    let otaRejection={tested:false};
    const today=iso(new Date());
    const futureOta=[...(ota.dates||[])].filter(d=>d>=today).sort()[0];
    if(futureOta){
      const r=await call(quoteHandler,'POST',{checkin:futureOta,checkout:addDays(futureOta,1),guests:2});
      otaRejection={tested:true,date:futureOta,statusCode:r.statusCode,error:r.body&&r.body.error,pass:r.statusCode===409&&r.body&&r.body.error==='dates_unavailable'};
    }

    const checks={
      quoteEndpoint:quote.statusCode===200,
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
    return res.status(pass?200:422).json({
      pass,environment:process.env.VERCEL_ENV||null,testStay:stay,checks,
      quote: q?{nights:q.nights,minNights:q.minNights,nightly:q.nightly,nightlySubtotal:q.nightlySubtotal,discountName:q.discountName,discountPct:q.discountPct,discountAmount:q.discountAmount,lodgingAfterDiscount:q.lodgingAfterDiscount,cleaningFee:q.cleaningFee,taxPct:q.taxPct,taxes:q.taxes,total:q.total,depositPct:q.depositPct,depositDue:q.depositDue,pricingReady:q.pricingReady,rateStatus:q.rateStatus,feeStatus:q.feeStatus}:null,
      bookingConfig:config,otaSources:ota.sources||[],otaRejection,expiredCount
    });
  }catch(e){
    try{const sql=db();for(const id of cleanup)await sql`DELETE FROM reservations WHERE id=${id}`;}catch(_){ }
    console.error('phase1 audit error',e);
    return res.status(500).json({pass:false,error:'phase1_audit_failed',message:e.message});
  }
};