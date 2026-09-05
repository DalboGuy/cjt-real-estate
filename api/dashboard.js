const crypto=require('crypto');
const {db,ensureSchema,expireHolds}=require('../lib/db');

function parseCookies(header=''){
  return Object.fromEntries(header.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{
    const i=v.indexOf('=');
    return [decodeURIComponent(v.slice(0,i)),decodeURIComponent(v.slice(i+1))];
  }));
}
function hash(v){return crypto.createHash('sha256').update(v).digest('hex')}
async function authenticated(req){
  await ensureSchema();
  const token=parseCookies(req.headers.cookie||'').cjt_owner_session;
  if(!token)return false;
  const sql=db();
  const rows=await sql`SELECT token_hash FROM owner_sessions WHERE token_hash=${hash(token)} AND expires_at>now() LIMIT 1`;
  return rows.length>0;
}

module.exports=async function(req,res){
  try{
    if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
    await ensureSchema();
    if(!(await authenticated(req)))return res.status(401).json({error:'unauthorized'});
    await expireHolds();
    const sql=db();

    const [reservationSummary,recentReservations,communicationSummary,recentMessages,financialSummary,taskSummary,pricingSummary]=await Promise.all([
      sql`
        SELECT
          count(*) FILTER (WHERE status NOT IN ('released','expired','cancelled') AND checkout>=current_date)::int AS upcoming,
          count(*) FILTER (WHERE status IN ('inquiry_hold','hold_verified','contract_sent','contract_signed'))::int AS action_needed,
          min(checkin) FILTER (WHERE status NOT IN ('released','expired','cancelled') AND checkin>=current_date)::text AS next_checkin,
          count(*)::int AS total
        FROM reservations
      `,
      sql`
        SELECT id,guest_name,checkin::text,checkout::text,status,guests
        FROM reservations
        WHERE status NOT IN ('released','expired','cancelled') AND checkout>=current_date
        ORDER BY checkin ASC
        LIMIT 3
      `,
      sql`
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE is_read=false)::int AS unread,
          count(*) FILTER (WHERE platform='airbnb' AND is_read=false)::int AS airbnb_unread,
          count(*) FILTER (WHERE platform='vrbo' AND is_read=false)::int AS vrbo_unread,
          count(*) FILTER (WHERE platform IN ('booking','booking.com') AND is_read=false)::int AS booking_unread,
          count(*) FILTER (WHERE platform='houfy' AND is_read=false)::int AS houfy_unread
        FROM communications_messages
      `,
      sql`
        SELECT id,platform,guest_name,subject,snippet,received_at,is_read
        FROM communications_messages
        ORDER BY received_at DESC
        LIMIT 3
      `,
      sql`
        SELECT
          count(*)::int AS records,
          COALESCE(sum(gross_revenue) FILTER (
            WHERE checkin>=date_trunc('month',current_date)::date
              AND checkin<(date_trunc('month',current_date)+interval '1 month')::date
          ),0) AS mtd_gross,
          COALESCE(sum(expected_payout) FILTER (
            WHERE checkin>=date_trunc('month',current_date)::date
              AND checkin<(date_trunc('month',current_date)+interval '1 month')::date
          ),0) AS mtd_expected_payout
        FROM booking_financials
      `,
      sql`
        SELECT
          count(*) FILTER (WHERE lower(COALESCE(status,'')) NOT IN ('completed','done','closed','cancelled'))::int AS open,
          count(*) FILTER (WHERE lower(COALESCE(priority,'')) IN ('high','urgent') AND lower(COALESCE(status,'')) NOT IN ('completed','done','closed','cancelled'))::int AS high_priority
        FROM tasks
      `,
      sql`
        SELECT
          (SELECT count(*)::int FROM pricing_overrides WHERE stay_date>=current_date) AS future_overrides,
          EXISTS(SELECT 1 FROM site_config WHERE key='pricing_rules') AS rules_configured
      `
    ]);

    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({
      checkedAt:new Date().toISOString(),
      reservations:{summary:reservationSummary[0]||{},recent:recentReservations},
      communications:{summary:communicationSummary[0]||{},recent:recentMessages},
      financials:financialSummary[0]||{},
      tasks:taskSummary[0]||{},
      pricing:pricingSummary[0]||{}
    });
  }catch(e){
    console.error('dashboard api error',e);
    return res.status(500).json({error:'dashboard_api_error'});
  }
};
