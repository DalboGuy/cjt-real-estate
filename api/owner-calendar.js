const crypto=require('crypto');
const {db,ensureSchema,expireHolds}=require('../lib/db');
const {getOtaCalendarEvents}=require('../lib/availability');

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
      try{ota=await getOtaCalendarEvents();}catch(e){ota={events:[],sources:[{name:'ota',ok:false,error:e.message}]};}
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
      res.setHeader('Cache-Control','no-store');
      return res.status(200).json({
        user:{id:user.id,name:user.name,role:user.role},
        otaEvents:ota.events,
        sources:ota.sources,
        directReservations:direct.map(r=>({key:`direct:${r.id}`,source:'direct',start:r.checkin,end:r.checkout,summary:r.status.replaceAll('_',' '),kind:'direct',reservationId:r.id,status:r.status})),
        financials,
        checkedAt:new Date().toISOString()
      });
    }

    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    if(req.method==='POST'&&body.action==='financial_upsert'){
      const channel=clean(body.channel,30),checkin=clean(body.checkin,10),checkout=clean(body.checkout,10),status=clean(body.status||'confirmed',20);
      if(!['airbnb','vrbo','booking.com','houfy','direct','other'].includes(channel)||!validDate(checkin)||!validDate(checkout)||checkout<=checkin||!['confirmed','pending','completed','cancelled'].includes(status))return res.status(400).json({error:'invalid_booking'});
      const values={gross:amount(body.gross_revenue),taxes:amount(body.taxes),cleaning:amount(body.cleaning_fee),payout:amount(body.expected_payout),collected:amount(body.collected_amount)};
      if(Object.values(values).some(Number.isNaN))return res.status(400).json({error:'invalid_amount'});
      const requested=clean(body.booking_key,100);
      const key=requested||`${channel}:${checkin}:${checkout}:${crypto.randomBytes(5).toString('hex')}`;
      const source=clean(body.source||'owner_entry',40)||'owner_entry';
      const ref=clean(body.external_reference,100)||null,notes=clean(body.notes,1000)||null;
      await sql`
        INSERT INTO booking_financials(booking_key,channel,checkin,checkout,status,gross_revenue,taxes,cleaning_fee,expected_payout,collected_amount,currency,source,external_reference,notes,updated_by_user_id)
        VALUES (${key},${channel},${checkin},${checkout},${status},${values.gross},${values.taxes},${values.cleaning},${values.payout},${values.collected},'USD',${source},${ref},${notes},${user.id})
        ON CONFLICT (booking_key) DO UPDATE SET
          channel=EXCLUDED.channel,checkin=EXCLUDED.checkin,checkout=EXCLUDED.checkout,status=EXCLUDED.status,
          gross_revenue=EXCLUDED.gross_revenue,taxes=EXCLUDED.taxes,cleaning_fee=EXCLUDED.cleaning_fee,
          expected_payout=EXCLUDED.expected_payout,collected_amount=EXCLUDED.collected_amount,
          source=EXCLUDED.source,external_reference=EXCLUDED.external_reference,notes=EXCLUDED.notes,
          updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=now()
      `;
      return res.status(200).json({ok:true,booking_key:key});
    }

    if(req.method==='POST'&&body.action==='financial_delete'){
      const key=clean(body.booking_key,100);
      if(!key)return res.status(400).json({error:'missing_booking_key'});
      const rows=await sql`DELETE FROM booking_financials WHERE booking_key=${key} RETURNING booking_key`;
      if(!rows.length)return res.status(404).json({error:'booking_not_found'});
      return res.status(200).json({ok:true});
    }

    return res.status(405).json({error:'method_not_allowed'});
  }catch(e){
    console.error('owner-calendar error',e);
    return res.status(500).json({error:'owner_calendar_failed'});
  }
};
