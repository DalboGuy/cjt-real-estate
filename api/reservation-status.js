const {db,ensureSchema,expireHolds}=require('../lib/db');
const {getReservationByGuestToken}=require('../lib/guest-access');

module.exports=async function(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
  try{
    await ensureSchema();
    await expireHolds();
    const token=String((req.query&&req.query.token)||'');
    const reservation=await getReservationByGuestToken(token);
    if(!reservation)return res.status(404).json({error:'not_found',message:'Reservation status link is invalid or expired.'});

    const sql=db();
    const q=await sql`
      SELECT metadata->'quote' AS quote
      FROM booking_events
      WHERE reservation_id=${reservation.id} AND event_type='inquiry_created'
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const quote=q[0]&&q[0].quote?q[0].quote:null;
    const labels={
      inquiry_hold:'Dates on temporary hold',
      hold_verified:'Hold reviewed by CJT',
      contract_sent:'Agreement sent',
      contract_signed:'Agreement signed',
      confirmed:'Reservation confirmed',
      released:'Hold released',
      expired:'Hold expired',
      cancelled:'Reservation cancelled'
    };
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({
      reservation:{
        id:reservation.id,
        property:reservation.property,
        checkin:reservation.checkin,
        checkout:reservation.checkout,
        guests:reservation.guests,
        status:reservation.status,
        statusLabel:labels[reservation.status]||reservation.status,
        holdExpiresAt:reservation.hold_expires_at,
        contractSentAt:reservation.contract_sent_at,
        contractSignedAt:reservation.contract_signed_at,
        depositReceivedAt:reservation.deposit_received_at,
        createdAt:reservation.created_at
      },
      quote
    });
  }catch(e){
    console.error('reservation status error',e);
    return res.status(500).json({error:'status_unavailable',message:'Reservation status is temporarily unavailable.'});
  }
};
