const crypto = require('crypto');
const { db, ensureSchema, expireHolds } = require('../lib/db');
const { getOtaBlockedDates, eachDate } = require('../lib/availability');
const { calculateQuote } = require('../lib/pricing');
const { createGuestAccessToken } = require('../lib/guest-access');
const { upsertGuest } = require('../lib/guests');

const MAX_GUESTS=14;
function clean(v,max=500){return String(v||'').trim().slice(0,max);}
function validDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(String(v||''));}
function makeId(checkin){return `DB-${String(checkin).replace(/-/g,'')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;}
function tripTypeFromNotes(notes){const m=String(notes||'').match(/^Trip type:\s*(.+)$/m);return m?clean(m[1],120):'';}

module.exports=async function(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'method_not_allowed'});
  try{
    await ensureSchema();
    await expireHolds();
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const guest_name=clean(body.name,120),guest_email=clean(body.email,180),guest_phone=clean(body.phone,60),notes=clean(body.message,2000);
    const checkin=clean(body.checkin,10),checkout=clean(body.checkout,10),guests=Number(body.guests),tripType=tripTypeFromNotes(notes);
    if(!guest_name||!guest_email.includes('@')||!guest_phone||!tripType||!validDate(checkin)||!validDate(checkout)||!Number.isInteger(guests)||guests<1||guests>MAX_GUESTS){
      return res.status(400).json({error:'invalid_request',message:'Please complete all required booking fields, including phone and trip type.'});
    }
    if(checkout<=checkin) return res.status(400).json({error:'invalid_dates',message:'Check-out must be after check-in.'});
    const today=new Date().toISOString().slice(0,10);
    if(checkin<today) return res.status(400).json({error:'past_date',message:'Check-in must be a future date.'});

    const {dates:otaBlocked}=await getOtaBlockedDates();
    const requested=eachDate(checkin,checkout);
    if(requested.some(d=>otaBlocked.has(d))){
      return res.status(409).json({error:'dates_unavailable',message:'One or more requested dates are no longer available.'});
    }

    const sql=db();
    const overlap=await sql`
      SELECT id FROM reservations
      WHERE status IN ('inquiry_hold','hold_verified','contract_sent','contract_signed','confirmed')
        AND daterange(checkin,checkout,'[)') && daterange(${checkin}::date,${checkout}::date,'[)')
      LIMIT 1
    `;
    if(overlap.length) return res.status(409).json({error:'dates_unavailable',message:'Those dates are currently being held or are booked.'});

    let quote;
    try{quote=await calculateQuote(checkin,checkout);}catch(e){
      if(e.code==='minimum_nights')return res.status(400).json({error:e.code,message:e.message,minNights:e.minNights});
      throw e;
    }

    const guest=await upsertGuest({name:guest_name,email:guest_email,phone:guest_phone});
    const id=makeId(checkin);
    let rows;
    try{
      rows=await sql`
        INSERT INTO reservations (id,guest_id,guest_name,guest_email,guest_phone,guests,notes,checkin,checkout,status,hold_expires_at)
        VALUES (${id},${guest.id},${guest_name},${guest_email},${guest_phone},${guests},${notes||null},${checkin}::date,${checkout}::date,'inquiry_hold',now()+interval '24 hours')
        RETURNING id,guest_id,checkin::text,checkout::text,status,hold_expires_at
      `;
    }catch(e){
      if(String(e.message||'').toLowerCase().includes('reservations_no_overlap')){
        return res.status(409).json({error:'dates_unavailable',message:'Those dates were just placed on hold by another guest.'});
      }
      throw e;
    }
    await sql`INSERT INTO booking_events (reservation_id,event_type,actor,metadata) VALUES (${id},'inquiry_created','guest',${JSON.stringify({guests,tripType,quote,guestId:guest.id})}::jsonb)`;

    let statusUrl=null;
    try{
      const token=await createGuestAccessToken(id);
      statusUrl=`/reservation.html?token=${encodeURIComponent(token)}`;
    }catch(tokenError){
      console.error('guest status token error',tokenError);
    }

    res.setHeader('Cache-Control','no-store');
    return res.status(201).json({reservation:rows[0],quote,statusUrl,message:'Your dates are temporarily held for 24 hours while CJT reviews your request.'});
  }catch(e){
    console.error('inquiry error',e);
    return res.status(500).json({error:'booking_unavailable',message:'We could not place the hold. Please contact CJT directly.'});
  }
};