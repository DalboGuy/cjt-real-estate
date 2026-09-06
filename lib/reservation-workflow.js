// All mutations and their audit event commit in one PostgreSQL statement.
const holds=['inquiry_hold','hold_verified'];
const active=[...holds,'contract_sent','contract_signed','confirmed'];
const actions={
  processing:{from:holds,to:'hold_verified',stage:'processing',event:'inquiry_processing'},
  accept:{from:holds,to:'hold_verified',stage:'accepted',event:'inquiry_accepted'},
  reject:{from:holds,to:'released',stage:'rejected',event:'inquiry_rejected'},
  maintain_hold:{from:holds,to:'hold_verified',event:'hold_maintained'},
  contract_sent:{from:holds,to:'contract_sent',stage:'accepted',event:'contract_sent'},
  contract_signed:{from:['contract_sent'],to:'contract_signed',stage:'accepted',event:'contract_signed'},
  deposit_received:{from:['contract_signed'],to:'confirmed',stage:'accepted',event:'deposit_received'},
  release_dates:{from:active,to:'released',event:'dates_released'}
};
async function updateReservation(sql,body,user){
  const rule=actions[body.status],id=String(body.id||'').trim().slice(0,80);
  if(!id||!rule)return {code:400,error:'invalid_reservation_action'};
  const version=body.expected_updated_at||null;
  if(version&&Number.isNaN(Date.parse(version)))return {code:400,error:'invalid_version'};
  const metadata=JSON.stringify({user_id:user.id,email:user.email,note:String(body.note||'').trim().slice(0,2000)});
  const rows=await sql.query(`
    WITH changed AS (
      UPDATE reservations SET status=$2,review_stage=COALESCE($3,review_stage),
        hold_expires_at=CASE WHEN $2='hold_verified' THEN GREATEST(COALESCE(hold_expires_at,now()),now()+interval '24 hours') ELSE NULL END,
        contract_sent_at=CASE WHEN $2='contract_sent' THEN COALESCE(contract_sent_at,now()) ELSE contract_sent_at END,
        contract_signed_at=CASE WHEN $2='contract_signed' THEN COALESCE(contract_signed_at,now()) ELSE contract_signed_at END,
        deposit_received_at=CASE WHEN $2='confirmed' THEN COALESCE(deposit_received_at,now()) ELSE deposit_received_at END,
        released_at=CASE WHEN $2='released' THEN now() ELSE released_at END,updated_at=now()
      WHERE id=$1 AND status=ANY($4::text[])
        AND ($2='released' OR status NOT IN ('inquiry_hold','hold_verified') OR hold_expires_at>now())
        AND ($5::timestamptz IS NULL OR updated_at=$5::timestamptz)
        AND ($6<>'processing' OR review_stage IN ('pending','processing'))
      RETURNING *
    ), logged AS (
      INSERT INTO booking_events(reservation_id,event_type,actor,metadata)
      SELECT id,$7,$8,$9::jsonb FROM changed RETURNING id
    ) SELECT id,status,review_stage,hold_expires_at,updated_at FROM changed`,
    [id,rule.to,rule.stage||null,rule.from,version,body.status,rule.event,user.name,metadata]);
  if(rows.length)return {code:200,reservation:rows[0]};
  const exists=await sql`SELECT id FROM reservations WHERE id=${id}`;
  return {code:exists.length?409:404,error:exists.length?'reservation_changed_or_action_unavailable':'reservation_not_found'};
}
module.exports={updateReservation,actions};
