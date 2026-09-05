const {db,ensureSchema}=require('./db');

let guestSchemaReady;

function clean(v,max=500){return String(v||'').trim().slice(0,max);}
function emailKey(v){return clean(v,180).toLowerCase();}
function phoneKey(v){return clean(v,60).replace(/\D/g,'');}

async function ensureGuestSchema(){
  if(guestSchemaReady)return guestSchemaReady;
  guestSchemaReady=(async()=>{
    await ensureSchema();
    const sql=db();
    await sql`
      CREATE TABLE IF NOT EXISTS guests (
        id bigserial PRIMARY KEY,
        name text NOT NULL,
        email text NOT NULL,
        email_key text NOT NULL UNIQUE,
        phone text,
        phone_key text,
        notes text,
        first_seen_at timestamptz NOT NULL DEFAULT now(),
        last_seen_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS guests_phone_key_idx ON guests(phone_key) WHERE phone_key IS NOT NULL AND phone_key<>''`;
    await sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS guest_id bigint REFERENCES guests(id) ON DELETE SET NULL`;
    await sql`CREATE INDEX IF NOT EXISTS reservations_guest_id_idx ON reservations(guest_id)`;

    await sql`
      INSERT INTO guests(name,email,email_key,phone,phone_key,first_seen_at,last_seen_at)
      SELECT
        latest.guest_name,
        latest.guest_email,
        latest.email_key,
        latest.guest_phone,
        regexp_replace(COALESCE(latest.guest_phone,''),'[^0-9]','','g'),
        history.first_seen_at,
        history.last_seen_at
      FROM (
        SELECT DISTINCT ON (lower(trim(guest_email)))
          guest_name,guest_email,guest_phone,lower(trim(guest_email)) AS email_key
        FROM reservations
        WHERE guest_email IS NOT NULL AND trim(guest_email)<>''
        ORDER BY lower(trim(guest_email)),created_at DESC
      ) latest
      JOIN (
        SELECT lower(trim(guest_email)) AS email_key,min(created_at) AS first_seen_at,max(created_at) AS last_seen_at
        FROM reservations
        WHERE guest_email IS NOT NULL AND trim(guest_email)<>''
        GROUP BY lower(trim(guest_email))
      ) history ON history.email_key=latest.email_key
      ON CONFLICT (email_key) DO UPDATE SET
        name=EXCLUDED.name,
        email=EXCLUDED.email,
        phone=COALESCE(EXCLUDED.phone,guests.phone),
        phone_key=CASE WHEN EXCLUDED.phone_key<>'' THEN EXCLUDED.phone_key ELSE guests.phone_key END,
        first_seen_at=LEAST(guests.first_seen_at,EXCLUDED.first_seen_at),
        last_seen_at=GREATEST(guests.last_seen_at,EXCLUDED.last_seen_at),
        updated_at=now()
    `;
    await sql`
      UPDATE reservations r
      SET guest_id=g.id
      FROM guests g
      WHERE r.guest_id IS NULL AND g.email_key=lower(trim(r.guest_email))
    `;
  })().catch(error=>{guestSchemaReady=undefined;throw error;});
  return guestSchemaReady;
}

async function findGuest({email,phone}){
  await ensureGuestSchema();
  const sql=db();
  const ekey=emailKey(email),pkey=phoneKey(phone);
  if(ekey){
    const rows=await sql`SELECT * FROM guests WHERE email_key=${ekey} LIMIT 1`;
    if(rows[0])return rows[0];
  }
  if(pkey){
    const rows=await sql`SELECT * FROM guests WHERE phone_key=${pkey} ORDER BY updated_at DESC LIMIT 2`;
    if(rows.length===1)return rows[0];
  }
  return null;
}

async function upsertGuest({name,email,phone,notes}){
  await ensureGuestSchema();
  const sql=db();
  const guestName=clean(name,120),guestEmail=clean(email,180),guestPhone=clean(phone,60);
  const ekey=emailKey(guestEmail),pkey=phoneKey(guestPhone);
  if(!guestName||!ekey)throw new Error('guest name and email are required');

  let existing=await findGuest({email:guestEmail,phone:guestPhone});
  if(existing){
    try{
      const rows=await sql`
        UPDATE guests SET
          name=${guestName},email=${guestEmail},email_key=${ekey},
          phone=${guestPhone||existing.phone||null},
          phone_key=${pkey||existing.phone_key||null},
          notes=COALESCE(${clean(notes,2000)||null},notes),
          last_seen_at=now(),updated_at=now()
        WHERE id=${existing.id}
        RETURNING *
      `;
      return rows[0];
    }catch(error){
      if(error&&error.code==='23505'){
        const rows=await sql`SELECT * FROM guests WHERE email_key=${ekey} LIMIT 1`;
        if(rows[0])existing=rows[0];else throw error;
      }else throw error;
    }
  }

  const rows=await sql`
    INSERT INTO guests(name,email,email_key,phone,phone_key,notes,first_seen_at,last_seen_at)
    VALUES (${guestName},${guestEmail},${ekey},${guestPhone||null},${pkey||null},${clean(notes,2000)||null},now(),now())
    ON CONFLICT (email_key) DO UPDATE SET
      name=EXCLUDED.name,email=EXCLUDED.email,
      phone=COALESCE(EXCLUDED.phone,guests.phone),
      phone_key=COALESCE(EXCLUDED.phone_key,guests.phone_key),
      notes=COALESCE(EXCLUDED.notes,guests.notes),
      last_seen_at=now(),updated_at=now()
    RETURNING *
  `;
  return rows[0];
}

async function linkReservationToGuest(reservationId,guestId){
  await ensureGuestSchema();
  const sql=db();
  await sql`UPDATE reservations SET guest_id=${guestId},updated_at=now() WHERE id=${reservationId}`;
}

async function getGuestByReservation(reservationId){
  await ensureGuestSchema();
  const sql=db();
  const rows=await sql`
    SELECT g.*,count(r2.id)::int AS reservation_count,
           min(r2.checkin)::text AS first_stay,max(r2.checkout)::text AS latest_stay
    FROM reservations r
    JOIN guests g ON g.id=r.guest_id
    LEFT JOIN reservations r2 ON r2.guest_id=g.id
    WHERE r.id=${reservationId}
    GROUP BY g.id
    LIMIT 1
  `;
  return rows[0]||null;
}

module.exports={ensureGuestSchema,findGuest,upsertGuest,linkReservationToGuest,getGuestByReservation,emailKey,phoneKey};
