module.exports = async function(req,res){
  res.setHeader('Cache-Control','no-store');
  res.status(200).json({
    houfyIcalConfigured:Boolean(process.env.HOUFY_ICAL_URL),
    houfyApiConfigured:Boolean(process.env.HOUFY_API_TOKEN),
    bookingComIcalConfigured:Boolean(process.env.BOOKING_COM_ICAL_URL),
    databaseConfigured:Boolean(process.env.DATABASE_URL),
    checkedAt:new Date().toISOString()
  });
};
