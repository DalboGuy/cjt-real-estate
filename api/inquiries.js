const crypto = require('crypto');
const { db, ensureSchema, expireHolds } = require('../lib/db');
const { getOtaBlockedDates, eachDate, toYmd } = require('../lib/availability');
const { sendGuestHoldEmail } = require('../lib/email');

function clean(v,max=500){return String(v||'').trim().slice(0,max);}
function validDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(String(v||''));}
function makeId(checkin){return `DB-${String(checkin).replace(/-/g,'')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;}

module.exports=async function(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'method_not_allowed'});
  try{
    await ensureSchema();
    await expireHolds();
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const guest_name=clean(body.name,120),guest_email=clean(body.email,180),guest_phone=clean(body.phone,60),notes=clean(body.message,2000);
    const checkin=clean(body.checkin,10),checkout=clean(body.checkout,10),guests=Number(body.guests);
    if(!guest_name||!guest_email.includes('@')||!validDate(checkin)||!validDate(checkout)||!Number.isInteger(guests)||guests<1||guests>12){
      return res.status(400).json({error:'invalid_request',message:'Please complete all required booking fields.'});
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
      WHERE status IN ('inquiry_hold','hold_verified','checkout_pending','payment_received','contract_sent','contract_signed','confirmed')
        AND daterange(checkin,checkout,'[)') && daterange(${checkin}::date,${checkout}::date,'[)')
      LIMIT 1
    `;
    if(overlap.length) return res.status(409).json({error:'dates_unavailable',message:'Those dates are currently being held or are booked.'});

    const id=makeId(checkin);
    let rows;
    try{
      rows=await sql`
        INSERT INTO reservations (id,guest_name,guest_email,guest_phone,guests,notes,checkin,checkout,status,hold_expires_at)
        VALUES (${id},${guest_name},${guest_email},${guest_phone||null},${guests},${notes||null},${checkin}::date,${checkout}::date,'inquiry_hold',now()+interval '24 hours')
        RETURNING id,checkin::text,checkout::text,status,hold_expires_at
      `;
    }catch(e){
      if(String(e.message||'').toLowerCase().includes('reservations_no_overlap')){
        return res.status(409).json({error:'dates_unavailable',message:'Those dates were just placed on hold by another guest.'});
      }
      throw e;
    }
    await sql`INSERT INTO booking_events (reservation_id,event_type,actor,metadata) VALUES (${id},'inquiry_created','guest',${JSON.stringify({guests})}::jsonb)`;
    const reservation={
      ...rows[0],
      checkin:toYmd(rows[0].checkin),
      checkout:toYmd(rows[0].checkout)
    };
    let email={attempted:false,sent:false,skipped:true};
    try{
      email=await sendGuestHoldEmail({
        to:guest_email,
        name:guest_name,
        id:reservation.id,
        checkin:reservation.checkin,
        checkout:reservation.checkout,
        expiresAt:reservation.hold_expires_at
      });
    }catch(e){
      console.error('guest confirmation email error',e);
      email={attempted:true,sent:false};
    }
    res.setHeader('Cache-Control','no-store');
    return res.status(201).json({
      reservation,
      email,
      message:'Your dates are temporarily held for 24 hours while CJT reviews your request. This is not a confirmed reservation, and no payment was collected.'
    });
  }catch(e){
    console.error('inquiry error',e);
    return res.status(500).json({error:'booking_unavailable',message:'We could not place the hold. Please contact CJT directly.'});
  }
};
