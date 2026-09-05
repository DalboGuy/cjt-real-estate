const {ensureGuestSchema}=require('../lib/guests');

module.exports = async function(req,res){
  res.setHeader('Cache-Control','no-store');
  let guestDatabaseReady=false;
  let guestDatabaseError=null;
  if(process.env.DATABASE_URL){
    try{
      await ensureGuestSchema();
      guestDatabaseReady=true;
    }catch(error){
      guestDatabaseError=String(error&&error.message||error).slice(0,180);
      console.error('guest database readiness error',error);
    }
  }
  res.status(200).json({
    houfyIcalConfigured:Boolean(process.env.HOUFY_ICAL_URL),
    houfyApiConfigured:Boolean(process.env.HOUFY_API_TOKEN),
    bookingComIcalConfigured:Boolean(process.env.BOOKING_COM_ICAL_URL),
    databaseConfigured:Boolean(process.env.DATABASE_URL),
    guestDatabaseReady,
    guestDatabaseError,
    checkedAt:new Date().toISOString()
  });
};