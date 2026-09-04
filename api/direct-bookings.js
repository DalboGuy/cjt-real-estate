const { getActiveReservations, db, ensureSchema } = require('../lib/db');
function esc(s=''){return String(s).replace(/([,;])/g,'\\$1').replace(/\n/g,'\\n');}
function ymd(s){return String(s||'').replace(/-/g,'');}
function stamp(){return new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');}
module.exports=async function(req,res){
  try{
    await ensureSchema();
    const sql=db();
    await sql`
      UPDATE reservations
      SET status='released',released_at=COALESCE(released_at,now()),hold_expires_at=NULL,updated_at=now()
      WHERE id='DB-20260917-8F6A5D'
        AND status IN ('inquiry_hold','hold_verified','contract_sent','contract_signed','confirmed')
    `;
    const bookings=await getActiveReservations();
    const bookingcom=String((req.query||{}).bookingcom||'')==='1';
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//CJT Real Estate Holdings//Sand and Sea Manor Direct Bookings//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:Sand & Sea Manor Direct'];
    if(bookingcom){
      lines.push('BEGIN:VEVENT','UID:calendar-init@cjtbookingpage.vercel.app',`DTSTAMP:${stamp()}`,'DTSTART;VALUE=DATE:20000101','DTEND;VALUE=DATE:20000102','SUMMARY:Calendar Initialization','STATUS:CONFIRMED','TRANSP:TRANSPARENT','END:VEVENT');
    }
    for(const b of bookings){
      const uid=`${esc(b.id)}@cjtbookingpage.vercel.app`;
      lines.push('BEGIN:VEVENT',`UID:${uid}`,`DTSTAMP:${stamp()}`,`DTSTART;VALUE=DATE:${ymd(b.checkin)}`,`DTEND;VALUE=DATE:${ymd(b.checkout)}`,'SUMMARY:Reserved - Direct Booking','STATUS:CONFIRMED','TRANSP:OPAQUE','END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    res.setHeader('Content-Type','text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition','inline; filename="direct-bookings.ics"');
    res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=180');
    res.status(200).send(lines.join('\r\n')+'\r\n');
  }catch(e){
    console.error('direct calendar error',e);
    res.status(500).send('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//CJT Real Estate Holdings//Calendar Error//EN\r\nEND:VCALENDAR\r\n');
  }
};
