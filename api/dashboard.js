const crypto=require('crypto');
const {db,ensureSchema}=require('../lib/db');
const {previewPasswordFreeActive}=require('../lib/preview-access');
const {loadOwnerFinancials}=require('../lib/financials');
const {loadOwnerTasks}=require('../lib/owner-tasks');
const {buildOwnerCalendarView,addDays,todayInPropertyTz}=require('../lib/calendar-view');
const {KPI_DESTINATIONS}=require('../lib/owner-nav');

function parseCookies(header=''){
  return Object.fromEntries(header.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{
    const i=v.indexOf('=');
    return [decodeURIComponent(v.slice(0,i)),decodeURIComponent(v.slice(i+1))];
  }));
}
function hash(v){return crypto.createHash('sha256').update(v).digest('hex')}
async function authenticated(req){
  if(previewPasswordFreeActive(req))return true;
  await ensureSchema();
  const token=parseCookies(req.headers.cookie||'').cjt_owner_session;
  if(!token)return false;
  const sql=db();
  const rows=await sql`SELECT token_hash FROM owner_sessions WHERE token_hash=${hash(token)} AND expires_at>now() LIMIT 1`;
  return rows.length>0;
}

function withTimeout(promise,ms,label){
  return Promise.race([
    promise,
    new Promise((_,reject)=>setTimeout(()=>reject(new Error(label||'timeout')),ms))
  ]);
}

function chicagoToday(){
  return todayInPropertyTz('America/Chicago');
}

function sourceHonesty(sources=[]){
  const rows=sources||[];
  const failed=rows.filter(s=>s.ok===false);
  const connected=rows.filter(s=>s.ok!==false);
  return {
    available:rows.length>0,
    connected:connected.length,
    failed:failed.length,
    disconnected:failed.length>0||rows.length===0,
    note:rows.length===0
      ? 'No inbound calendar source is connected. Occupancy is not verified.'
      : failed.length
        ? 'At least one inbound source failed. Do not treat a 0 as verified occupancy.'
        : 'Inbound iCal sources were read. This does not mean OTAs imported the CJT export.'
  };
}

module.exports=async function(req,res){
  try{
    if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
    await ensureSchema();
    if(!(await authenticated(req)))return res.status(401).json({error:'unauthorized'});
    const sql=db();
    const today=chicagoToday();
    const weekEnd=addDays(today,7);

    const [reservationSummary,recentReservations,weekReservations,communicationSummary,recentMessages,financials,tasks,pricingSummary]=await Promise.all([
      sql`
        SELECT
          count(*) FILTER (WHERE status NOT IN ('released','expired','cancelled') AND checkout>=current_date)::int AS upcoming,
          count(*) FILTER (WHERE status IN ('inquiry_hold','hold_verified','contract_sent','contract_signed'))::int AS action_needed,
          count(*) FILTER (WHERE status='inquiry_hold')::int AS pending,
          min(checkin) FILTER (WHERE status NOT IN ('released','expired','cancelled') AND checkin>=current_date)::text AS next_checkin,
          count(*)::int AS total
        FROM reservations
      `,
      sql`
        SELECT id,guest_name,checkin::text,checkout::text,status,guests
        FROM reservations
        WHERE status NOT IN ('released','expired','cancelled') AND checkout>=current_date
        ORDER BY checkin ASC
        LIMIT 5
      `,
      sql`
        SELECT id,guest_name,checkin::text,checkout::text,status,guests
        FROM reservations
        WHERE status NOT IN ('released','expired','cancelled')
          AND checkin<=${weekEnd}
          AND checkout>=${today}
        ORDER BY checkin ASC
        LIMIT 20
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
        LIMIT 5
      `,
      loadOwnerFinancials(sql),
      loadOwnerTasks(sql),
      sql`
        SELECT
          (SELECT count(*)::int FROM pricing_overrides WHERE stay_date>=current_date) AS future_overrides,
          EXISTS(SELECT 1 FROM site_config WHERE key='pricing_rules') AS rules_configured
      `.catch(()=>[{future_overrides:null,rules_configured:false}])
    ]);

    let calendar={available:false,conflicts:null,preview:[],upcoming:[],sources:sourceHonesty([])};
    try{
      const snapshot=await withTimeout(buildOwnerCalendarView({view:'week'}),8000,'calendar_timeout');
      const preview=[];
      for(let i=0;i<7;i+=1){
        const date=addDays(today,i);
        const night=snapshot.nights?.[date]||{channels:[],eventIds:[],conflict:false};
        preview.push({
          date,
          channels:night.channels||[],
          conflict:Boolean(night.conflict),
          open:!((night.eventIds||[]).length)
        });
      }
      calendar={
        available:true,
        conflicts:(snapshot.conflicts||[]).length,
        preview,
        upcoming:(snapshot.upcoming||[]).slice(0,5),
        sources:sourceHonesty(snapshot.sync?.sources||[])
      };
    }catch{
      calendar={available:false,conflicts:null,preview:[],upcoming:[],sources:sourceHonesty([])};
    }

    const pending=reservationSummary[0]?.pending||0;
    const unread=communicationSummary[0]?.unread||0;
    const taskSummary=tasks.summary||{available:false};
    const needsAttention=[];
    if(pending)needsAttention.push({id:'pending',label:`${pending} booking request${pending===1?'':'s'} awaiting review`,href:KPI_DESTINATIONS.bookingsPending(),tone:'warn'});
    if(reservationSummary[0]?.action_needed)needsAttention.push({id:'action',label:`${reservationSummary[0].action_needed} bookings need a next step`,href:KPI_DESTINATIONS.bookingsAction(),tone:'warn'});
    if(unread)needsAttention.push({id:'unread',label:`${unread} unread guest message${unread===1?'':'s'}`,href:KPI_DESTINATIONS.messagesUnread(),tone:'warn'});
    if(taskSummary.available&&taskSummary.overdue)needsAttention.push({id:'tasks',label:`${taskSummary.overdue} overdue task${taskSummary.overdue===1?'':'s'}`,href:KPI_DESTINATIONS.tasksOverdue(),tone:'danger'});
    if(calendar.available&&calendar.conflicts)needsAttention.push({id:'conflicts',label:`${calendar.conflicts} overlapping calendar night${calendar.conflicts===1?'':'s'}`,href:KPI_DESTINATIONS.calendarConflicts(),tone:'warn'});
    if(calendar.sources.disconnected)needsAttention.push({id:'sources',label:calendar.sources.note,href:KPI_DESTINATIONS.calendarSources(),tone:'warn'});

    const arrivals=weekReservations.filter(row=>row.checkin>=today&&row.checkin<weekEnd);
    const departures=weekReservations.filter(row=>row.checkout>=today&&row.checkout<weekEnd);
    const staying=weekReservations.filter(row=>row.checkin<=today&&row.checkout>today);

    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({
      checkedAt:new Date().toISOString(),
      temporaryPasswordFree:previewPasswordFreeActive(req),
      destinations:{
        bookingsPending:KPI_DESTINATIONS.bookingsPending(),
        bookingsAction:KPI_DESTINATIONS.bookingsAction(),
        calendarAgenda:KPI_DESTINATIONS.calendarAgenda(),
        calendarConflicts:KPI_DESTINATIONS.calendarConflicts(),
        calendarSources:KPI_DESTINATIONS.calendarSources(),
        messagesUnread:KPI_DESTINATIONS.messagesUnread(),
        tasksOverdue:KPI_DESTINATIONS.tasksOverdue(),
        tasksOpen:KPI_DESTINATIONS.tasksOpen(),
        financialsPeriod:KPI_DESTINATIONS.financialsPeriod('month'),
        financialsStays:KPI_DESTINATIONS.financialsStays('month'),
        financialsUpcoming:KPI_DESTINATIONS.financialsUpcoming()
      },
      needsAttention,
      todayNext7:{
        today,
        weekEnd,
        arrivals,
        departures,
        staying
      },
      reservations:{summary:reservationSummary[0]||{},recent:recentReservations},
      communications:{summary:communicationSummary[0]||{},recent:recentMessages},
      financials:financials.summary||{},
      tasks:taskSummary,
      pricing:pricingSummary[0]||{},
      calendar
    });
  }catch(e){
    console.error('dashboard api error',e);
    return res.status(500).json({error:'dashboard_api_error'});
  }
};
