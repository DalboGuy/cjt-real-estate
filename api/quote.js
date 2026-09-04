const { db, ensureSchema, expireHolds } = require('../lib/db');
const { getOtaBlockedDates, eachDate } = require('../lib/availability');
const { calculateQuote } = require('../lib/pricing');

const MAX_GUESTS=14;
function clean(v,max=100){return String(v||'').trim().slice(0,max);}
function validDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(String(v||''));}

module.exports=async function(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
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
};