const crypto=require('crypto');
const {db,ensureSchema}=require('./db');

function hashToken(token){return crypto.createHash('sha256').update(String(token||'')).digest('hex');}

async function ensureGuestAccessSchema(){
  await ensureSchema();
  const sql=db();
  await sql`
    CREATE TABLE IF NOT EXISTS guest_access_tokens (
      reservation_id text PRIMARY KEY REFERENCES reservations(id) ON DELETE CASCADE,
      token_hash text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL DEFAULT (now()+interval '180 days')
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS guest_access_tokens_hash_idx ON guest_access_tokens(token_hash)`;
}

async function createGuestAccessToken(reservationId){
  await ensureGuestAccessSchema();
  const sql=db();
  const token=crypto.randomBytes(32).toString('base64url');
  const tokenHash=hashToken(token);
  await sql`
    INSERT INTO guest_access_tokens (reservation_id,token_hash,created_at,expires_at)
    VALUES (${reservationId},${tokenHash},now(),now()+interval '180 days')
    ON CONFLICT (reservation_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,created_at=now(),expires_at=EXCLUDED.expires_at
  `;
  return token;
}

async function getReservationByGuestToken(token){
  if(!token||String(token).length<20)return null;
  await ensureGuestAccessSchema();
  const sql=db();
  const rows=await sql`
    SELECT r.id,r.property,r.checkin::text,r.checkout::text,r.guests,r.status,r.hold_expires_at,
           r.contract_sent_at,r.contract_signed_at,r.deposit_received_at,r.created_at
    FROM guest_access_tokens g
    JOIN reservations r ON r.id=g.reservation_id
    WHERE g.token_hash=${hashToken(token)} AND g.expires_at>now()
    LIMIT 1
  `;
  return rows[0]||null;
}

module.exports={createGuestAccessToken,getReservationByGuestToken,ensureGuestAccessSchema};
