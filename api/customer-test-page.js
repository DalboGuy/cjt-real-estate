const fs=require('fs');
const path=require('path');

module.exports=async function(req,res){
  if(process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_GIT_COMMIT_REF!=='customer-v3-ops')return res.status(404).send('Booking test is unavailable on this deployment.');
  try{
    const file=path.join(process.cwd(),'v3.html');
    let html=fs.readFileSync(file,'utf8');

    html=html.replace('<body>','<body data-booking-test="1">')
      .replace('<div class="topbar">Book direct and ask about shoulder-season, midweek and extended-stay opportunities.</div>','<div class="topbar">CUSTOMER BOOKING TEST · Temporary inquiry holds are ignored and test submissions do not reserve dates.</div>')
      .replace('Unavailable dates are consolidated from Airbnb, VRBO, Booking.com and active direct-booking holds.','Unavailable dates reflect Airbnb, VRBO, Booking.com and confirmed direct bookings. Temporary inquiry holds are ignored in this test.')
      .replace('<h2>Found open dates? Place a temporary hold.</h2><p>Submit your dates and group size. If the dates are still available, the website immediately places a 24-hour inquiry hold while the CJT Partners review your request. The hold is not a confirmed reservation until CJT completes the direct-booking process with you.</p>','<h2>Test the direct-booking flow.</h2><p>Submit dates and guest details to test availability and pricing. This test does not create a reservation or place a temporary hold. Confirmed bookings and connected OTA blocks still remain unavailable.</p>')
      .replaceAll('Hold Dates & Request Direct Rate','Test Dates & Direct Rate')
      .replace('Submitting places a temporary 24-hour hold if the dates are still available. No payment is collected here.','Test submissions do not place a hold, create a reservation, or collect payment.')
      .replace("fetch('/api/calendar',{","fetch('/api/calendar?booking_test=1',{")
      .replace("fetch('/api/inquiries',{","fetch('/api/inquiries?booking_test=1',{")
      .replace("btn.textContent='Placing hold…'","btn.textContent='Testing request…'")
      .replace("'We could not place the hold.'","'The test request could not be completed.'")
      .replace('<strong>Your dates are on temporary hold.</strong><br>Reference: ${d.reservation.id}<br>Hold expires: ${new Date(d.reservation.hold_expires_at).toLocaleString()}<br>The CJT Partners will review your request and follow up with direct-booking details.','<strong>Test submission complete.</strong><br>Reference: ${d.reservation.id}<br>No dates were held and no reservation was created.<br>The dates remain available for additional testing.')
      .replace('Availability synced across Airbnb, VRBO, Booking.com and direct holds · last checked ${new Date(d.checkedAt).toLocaleString()}','Test availability synced across Airbnb, VRBO, Booking.com and confirmed direct bookings · temporary holds ignored · last checked ${new Date(d.checkedAt).toLocaleString()}');

    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','no-store, max-age=0');
    return res.status(200).send(html);
  }catch(e){
    console.error('customer-test-page error',e);
    return res.status(500).send('Customer booking test unavailable');
  }
};
