const crypto=require('crypto');
const {db,ensureSchema,expireHolds}=require('../lib/db');
const {getOtaCalendarEvents}=require('../lib/availability');
const {parseAirbnbConfirmation,parseBookingPayoutCsv}=require('../lib/financial-import');

function parseCookies(header=''){return Object.fromEntries(header.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return [decodeURIComponent(v.slice(0,i)),decodeURIComponent(v.slice(i+1))];}));}
function tokenHash(v){return crypto.createHash('sha256').update(String(v||'')).digest('hex');}
function clean(v,max=500){return String(v||'').trim().slice(0,max);}
function validDate(v){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(v||'')))return false;const d=new Date(`${v}T00:00:00Z`);return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v;}
function amount(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)&&n>=0&&n<=1000000?Math.round(n*100)/100:NaN;}
async function auth(req){
  const token=parseCookies(req.headers.cookie||'').cjt_owner_session;
  if(!token)return null;
  const sql=db();
  const rows=await sql`SELECT u.id,u.name,u.email,u.role,u.active,u.must_change_password FROM owner_sessions s JOIN owner_users u ON u.id=s.user_id WHERE s.token_hash=${tokenHash(token)} AND s.expires_at>now() AND u.active=true LIMIT 1`;
  return rows[0]||null;
}
async function upsertFinancial(sql,row,userId){
  await sql`
    INSERT INTO booking_financials(booking_key,channel,checkin,checkout,status,gross_revenue,taxes,cleaning_fee,expected_payout,collected_amount,currency,source,external_reference,notes,updated_by_user_id)
    VALUES (${row.booking_key},${row.channel},${row.checkin},${row.checkout},${row.status||'confirmed'},${row.gross_revenue??null},${row.taxes??null},${row.cleaning_fee??null},${row.expected_payout??null},${row.collected_amount??null},${row.currency||'USD'},${row.source||'owner_entry'},${row.external_reference||null},${row.notes||null},${userId||null})
    ON CONFLICT (booking_key) DO UPDATE SET
      channel=EXCLUDED.channel,checkin=EXCLUDED.checkin,checkout=EXCLUDED.checkout,status=EXCLUDED.status,
      gross_revenue=COALESCE(EXCLUDED.gross_revenue,booking_financials.gross_revenue),
      taxes=COALESCE(EXCLUDED.taxes,booking_financials.taxes),cleaning_fee=COALESCE(EXCLUDED.cleaning_fee,booking_financials.cleaning_fee),
      expected_payout=COALESCE(EXCLUDED.expected_payout,booking_financials.expected_payout),
      collected_amount=COALESCE(EXCLUDED.collected_amount,booking_financials.collected_amount),
      source=EXCLUDED.source,external_reference=COALESCE(EXCLUDED.external_reference,booking_financials.external_reference),
      notes=COALESCE(EXCLUDED.notes,booking_financials.notes),updated_by_user_id=COALESCE(EXCLUDED.updated_by_user_id,booking_financials.updated_by_user_id),updated_at=now()
  `;
}
async function reconcileAirbnb(sql,events){
  let created=0;
  for(const e of events||[]){
    if(e.source!=='airbnb'||e.kind!=='reservation_like'||!e.externalReference)continue;
    const key=`airbnb:${e.externalReference}`;
    const rows=await sql`SELECT booking_key FROM booking_financials WHERE booking_key=${key} LIMIT 1`;
    if(rows.length)continue;
    await upsertFinancial(sql,{booking_key:key,channel:'airbnb',checkin:e.start,checkout:e.end,status:'confirmed',source:'airbnb_ical',external_reference:e.externalReference,notes:'Automatically matched from Airbnb calendar; financial amounts pending import.'},null);
    created++;
  }
  return created;
}

module.exports=async function(req,res){
  try{
    await ensureSchema();
    await expireHolds();
    const user=await auth(req);
    if(!user)return res.status(401).json({error:'unauthorized'});
    if(user.must_change_password)return res.status(428).json({error:'password_change_required'});
    const sql=db();

    if(req.method==='GET'){
      let ota={events:[],sources:[]};
      try{ota=await getOtaCalendarEvents();await reconcileAirbnb(sql,ota.events);}catch(e){ota={events:[],sources:[{name:'ota',ok:false,error:e.message}]};}
      const direct=await sql`
        SELECT id,checkin::text,checkout::text,status
        FROM reservations
        WHERE status IN ('inquiry_hold','hold_verified','contract_sent','contract_signed','confirmed')
        ORDER BY checkin ASC
        LIMIT 250
      `;
      const financials=await sql`
        SELECT booking_key,channel,checkin::text,checkout::text,status,
               gross_revenue::float8,taxes::float8,cleaning_fee::float8,expected_payout::float8,collected_amount::float8,
               currency,source,external_reference,notes,created_at,updated_at
        FROM booking_financials
        ORDER BY checkin ASC,created_at DESC
        LIMIT 500
      `;
      const payouts=await sql`
        SELECT payout_key,channel,reservation_reference,checkin::text,payout_date::text,amount::float8,currency,source,descriptor,matched_booking_key,created_at
        FROM booking_payouts ORDER BY payout_date DESC LIMIT 500
      `;
      res.setHeader('Cache-Control','no-store');
      return res.status(200).json({
        user:{id:user.id,name:user.name,role:user.role},otaEvents:ota.events,sources:ota.sources,
        directReservations:direct.map(r=>({key:`direct:${r.id}`,source:'direct',start:r.checkin,end:r.checkout,summary:r.status.replaceAll('_',' '),kind:'direct',reservationId:r.id,status:r.status})),
        financials,payouts,checkedAt:new Date().toISOString()
      });
    }

    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    if(req.method==='POST'&&body.action==='financial_import'){
      const format=clean(body.format,40),text=String(body.text||'');
      if(!text||text.length>1000000)return res.status(400).json({error:'invalid_import_text'});
      if(format==='airbnb_email'){
        const ota=await getOtaCalendarEvents();
        const row=parseAirbnbConfirmation(text,ota.events);
        await upsertFinancial(sql,row,user.id);
        return res.status(200).json({ok:true,format,imported:1,booking_key:row.booking_key,record:row});
      }
      if(format==='booking_csv'){
        const rows=parseBookingPayoutCsv(text);let matched=0;
        for(const p of rows){
          const matches=await sql`
            SELECT booking_key FROM booking_financials
            WHERE channel='booking.com' AND (external_reference=${p.reservation_reference} OR checkin=${p.checkin})
            ORDER BY CASE WHEN external_reference=${p.reservation_reference} THEN 0 ELSE 1 END LIMIT 1
          `;
          const match=matches[0]?.booking_key||null;if(match)matched++;
          await sql`
            INSERT INTO booking_payouts(payout_key,channel,reservation_reference,checkin,payout_date,amount,currency,source,descriptor,matched_booking_key)
            VALUES (${p.payout_key},${p.channel},${p.reservation_reference},${p.checkin||null},${p.payout_date},${p.amount},${p.currency},${p.source},${p.descriptor||null},${match})
            ON CONFLICT (payout_key) DO UPDATE SET matched_booking_key=COALESCE(EXCLUDED.matched_booking_key,booking_payouts.matched_booking_key),updated_at=now()
          `;
        }
        return res.status(200).json({ok:true,format,imported:rows.length,matched,unmatched:rows.length-matched});
      }
      return res.status(400).json({error:'unsupported_import_format'});
    }

    if(req.method==='POST'&&body.action==='financial_upsert'){
      const channel=clean(body.channel,30),checkin=clean(body.checkin,10),checkout=clean(body.checkout,10),status=clean(body.status||'confirmed',20);
      if(!['airbnb','vrbo','booking.com','houfy','direct','other'].includes(channel)||!validDate(checkin)||!validDate(checkout)||checkout<=checkin||!['confirmed','pending','completed','cancelled'].includes(status))return res.status(400).json({error:'invalid_booking'});
      const values={gross:amount(body.gross_revenue),taxes:amount(body.taxes),cleaning:amount(body.cleaning_fee),payout:amount(body.expected_payout),collected:amount(body.collected_amount)};
      if(Object.values(values).some(Number.isNaN))return res.status(400).json({error:'invalid_amount'});
      const requested=clean(body.booking_key,100),key=requested||`${channel}:${checkin}:${checkout}:${crypto.randomBytes(5).toString('hex')}`;
      const row={booking_key:key,channel,checkin,checkout,status,gross_revenue:values.gross,taxes:values.taxes,cleaning_fee:values.cleaning,expected_payout:values.payout,collected_amount:values.collected,currency:'USD',source:clean(body.source||'owner_entry',40)||'owner_entry',external_reference:clean(body.external_reference,100)||null,notes:clean(body.notes,1000)||null};
      await upsertFinancial(sql,row,user.id);
      return res.status(200).json({ok:true,booking_key:key});
    }

    if(req.method==='POST'&&body.action==='financial_delete'){
      const key=clean(body.booking_key,100);if(!key)return res.status(400).json({error:'missing_booking_key'});
      const rows=await sql`DELETE FROM booking_financials WHERE booking_key=${key} RETURNING booking_key`;
      if(!rows.length)return res.status(404).json({error:'booking_not_found'});
      return res.status(200).json({ok:true});
    }

    return res.status(405).json({error:'method_not_allowed'});
  }catch(e){
    console.error('owner-calendar error',e);
    return res.status(500).json({error:e.message||'owner_calendar_failed'});
  }
};
