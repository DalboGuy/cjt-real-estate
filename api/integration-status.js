const {db}=require('../lib/db');
const {ensureGuestSchema}=require('../lib/guests');

module.exports = async function(req,res){
  res.setHeader('Cache-Control','no-store');

  let guestDatabaseReady=false;
  let guestBackfillComplete=false;
  let guestLinkIntegrity=false;

  if((process.env.CJT_DATABASE_URL || process.env.DATABASE_URL)){
    try{
      await ensureGuestSchema();
      const sql=db();
      const backfill=await sql`
        SELECT NOT EXISTS (
          SELECT 1
          FROM reservations
          WHERE guest_email IS NOT NULL
            AND trim(guest_email)<>''
            AND guest_id IS NULL
        ) AS ok
      `;
      const links=await sql`
        SELECT NOT EXISTS (
          SELECT 1
          FROM reservations r
          JOIN guests g ON g.id=r.guest_id
          WHERE lower(trim(r.guest_email))<>g.email_key
        ) AS ok
      `;
      guestDatabaseReady=true;
      guestBackfillComplete=Boolean(backfill[0]&&backfill[0].ok);
      guestLinkIntegrity=Boolean(links[0]&&links[0].ok);
    }catch(error){
      console.error('guest database readiness error',error);
    }
  }

  res.status(200).json({
    houfyIcalConfigured:Boolean(process.env.HOUFY_ICAL_URL),
    houfyApiConfigured:Boolean(process.env.HOUFY_API_TOKEN),
    bookingComIcalConfigured:Boolean(process.env.BOOKING_COM_ICAL_URL),
    databaseConfigured:Boolean((process.env.CJT_DATABASE_URL || process.env.DATABASE_URL)),
    guestIdentityMode:'email_only',
    guestDatabaseReady,
    guestBackfillComplete,
    guestLinkIntegrity,
    checkedAt:new Date().toISOString()
  });
};