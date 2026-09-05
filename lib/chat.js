const {db,ensureSchema}=require('./db');

async function ensureChatSchema(){
  await ensureSchema();
  const sql=db();
  await sql`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id bigserial PRIMARY KEY,
      reservation_id text NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
      sender_type text NOT NULL CHECK (sender_type IN ('guest','owner','system')),
      sender_name text,
      body text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      read_by_guest_at timestamptz,
      read_by_owner_at timestamptz
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS chat_messages_reservation_created_idx ON chat_messages(reservation_id,created_at)`;
  await sql`CREATE INDEX IF NOT EXISTS chat_messages_owner_unread_idx ON chat_messages(reservation_id,created_at) WHERE sender_type='guest' AND read_by_owner_at IS NULL`;
}

async function getMessages(reservationId,limit=200){
  await ensureChatSchema();
  const sql=db();
  return sql`
    SELECT id,reservation_id,sender_type,sender_name,body,created_at,read_by_guest_at,read_by_owner_at
    FROM chat_messages
    WHERE reservation_id=${reservationId}
    ORDER BY created_at ASC,id ASC
    LIMIT ${limit}
  `;
}

async function addMessage({reservationId,senderType,senderName,body}){
  await ensureChatSchema();
  const sql=db();
  const rows=await sql`
    INSERT INTO chat_messages(reservation_id,sender_type,sender_name,body)
    VALUES (${reservationId},${senderType},${senderName||null},${body})
    RETURNING id,reservation_id,sender_type,sender_name,body,created_at,read_by_guest_at,read_by_owner_at
  `;
  return rows[0];
}

async function markReadByGuest(reservationId){
  await ensureChatSchema();
  const sql=db();
  await sql`UPDATE chat_messages SET read_by_guest_at=COALESCE(read_by_guest_at,now()) WHERE reservation_id=${reservationId} AND sender_type='owner' AND read_by_guest_at IS NULL`;
}

async function markReadByOwner(reservationId){
  await ensureChatSchema();
  const sql=db();
  await sql`UPDATE chat_messages SET read_by_owner_at=COALESCE(read_by_owner_at,now()) WHERE reservation_id=${reservationId} AND sender_type='guest' AND read_by_owner_at IS NULL`;
}

async function listThreads(){
  await ensureChatSchema();
  const sql=db();
  return sql`
    SELECT r.id,r.guest_name,r.guest_email,r.guest_phone,r.checkin::text,r.checkout::text,r.status,
           m.body AS last_message,m.sender_type AS last_sender,m.created_at AS last_message_at,
           COALESCE(u.unread_count,0)::int AS unread_count
    FROM reservations r
    JOIN LATERAL (
      SELECT body,sender_type,created_at
      FROM chat_messages cm
      WHERE cm.reservation_id=r.id
      ORDER BY created_at DESC,id DESC
      LIMIT 1
    ) m ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS unread_count
      FROM chat_messages cmu
      WHERE cmu.reservation_id=r.id AND cmu.sender_type='guest' AND cmu.read_by_owner_at IS NULL
    ) u ON true
    ORDER BY m.created_at DESC
    LIMIT 250
  `;
}

module.exports={ensureChatSchema,getMessages,addMessage,markReadByGuest,markReadByOwner,listThreads};
