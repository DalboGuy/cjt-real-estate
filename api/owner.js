const crypto=require('crypto');
const { db, ensureSchema, expireHolds }=require('../lib/db');

function parseCookies(header=''){return Object.fromEntries(header.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return [decodeURIComponent(v.slice(0,i)),decodeURIComponent(v.slice(i+1))];}));}
function tokenHash(v){return crypto.createHash('sha256').update(String(v||'')).digest('hex');}
function safeEqual(a,b){const A=Buffer.from(String(a||'')),B=Buffer.from(String(b||''));return A.length===B.length&&crypto.timingSafeEqual(A,B);}
function passwordHash(password,salt){return crypto.scryptSync(String(password),String(salt),64).toString('hex');}
function clean(v,max=500){return String(v||'').trim().slice(0,max);}
function email(v){return clean(v,180).toLowerCase();}
function validPassword(v){return typeof v==='string'&&v.length>=10&&v.length<=200;}
function setSessionCookie(res,token){res.setHeader('Set-Cookie',`cjt_owner_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`);}
function clearSessionCookie(res){res.setHeader('Set-Cookie','cjt_owner_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');}

async function authUser(req){
  const token=parseCookies(req.headers.cookie||'').cjt_owner_session;
  if(!token)return null;
  const sql=db();
  const rows=await sql`
    SELECT u.id,u.name,u.email,u.role,u.active,u.must_change_password
    FROM owner_sessions s JOIN owner_users u ON u.id=s.user_id
    WHERE s.token_hash=${tokenHash(token)} AND s.expires_at>now() AND u.active=true
    LIMIT 1
  `;
  return rows[0]||null;
}

async function createSession(sql,res,userId){
  const token=crypto.randomBytes(32).toString('hex');
  await sql`DELETE FROM owner_sessions WHERE expires_at<=now() OR user_id IS NULL`;
  await sql`INSERT INTO owner_sessions(token_hash,user_id,expires_at) VALUES (${tokenHash(token)},${userId},now()+interval '12 hours')`;
  setSessionCookie(res,token);
}

module.exports=async function(req,res){
  try{
    await ensureSchema();
    const sql=db();
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});

    if(req.method==='GET'&&String(req.query&&req.query.mode||'')==='status'){
      const count=await sql`SELECT count(*)::int AS count FROM owner_users WHERE active=true`;
      return res.status(200).json({bootstrapNeeded:(count[0]&&count[0].count===0)});
    }

    if(req.method==='POST'&&body.action==='bootstrap'){
      const count=await sql`SELECT count(*)::int AS count FROM owner_users`;
      if(count[0]&&count[0].count>0)return res.status(409).json({error:'bootstrap_complete'});
      if(!process.env.OWNER_PORTAL_PASSCODE)return res.status(503).json({error:'bootstrap_not_configured'});
      if(!safeEqual(body.ownerPasscode,process.env.OWNER_PORTAL_PASSCODE))return res.status(401).json({error:'invalid_passcode'});
      const name=clean(body.name,120),mail=email(body.email),password=body.password;
      if(!name||!mail.includes('@')||!validPassword(password))return res.status(400).json({error:'invalid_owner'});
      const salt=crypto.randomBytes(16).toString('hex');
      const hash=passwordHash(password,salt);
      const rows=await sql`INSERT INTO owner_users(name,email,password_salt,password_hash,role,must_change_password) VALUES (${name},${mail},${salt},${hash},'admin',false) RETURNING id,name,email,role,must_change_password`;
      await createSession(sql,res,rows[0].id);
      return res.status(201).json({ok:true,user:rows[0]});
    }

    if(req.method==='POST'&&body.action==='login'){
      const mail=email(body.email),password=String(body.password||'');
      const rows=await sql`SELECT id,name,email,role,password_salt,password_hash,active,must_change_password FROM owner_users WHERE email=${mail} LIMIT 1`;
      const user=rows[0];
      if(!user||!user.active||!validPassword(password))return res.status(401).json({error:'invalid_login'});
      const candidate=passwordHash(password,user.password_salt);
      if(!safeEqual(candidate,user.password_hash))return res.status(401).json({error:'invalid_login'});
      await createSession(sql,res,user.id);
      return res.status(200).json({ok:true,user:{id:user.id,name:user.name,email:user.email,role:user.role,must_change_password:user.must_change_password}});
    }

    const user=await authUser(req);
    if(!user)return res.status(401).json({error:'unauthorized'});

    if(req.method==='POST'&&body.action==='logout'){
      const token=parseCookies(req.headers.cookie||'').cjt_owner_session;
      if(token)await sql`DELETE FROM owner_sessions WHERE token_hash=${tokenHash(token)}`;
      clearSessionCookie(res);
      return res.status(200).json({ok:true});
    }

    if(req.method==='POST'&&body.action==='change_password'){
      const newPassword=body.newPassword;
      if(!validPassword(newPassword))return res.status(400).json({error:'invalid_password'});
      const current=await sql`SELECT password_salt,password_hash FROM owner_users WHERE id=${user.id} LIMIT 1`;
      if(!current.length)return res.status(404).json({error:'user_not_found'});
      const same=passwordHash(newPassword,current[0].password_salt);
      if(safeEqual(same,current[0].password_hash))return res.status(400).json({error:'password_must_be_new'});
      const salt=crypto.randomBytes(16).toString('hex'),hash=passwordHash(newPassword,salt);
      await sql`UPDATE owner_users SET password_salt=${salt},password_hash=${hash},must_change_password=false,updated_at=now() WHERE id=${user.id}`;
      return res.status(200).json({ok:true});
    }

    if(user.must_change_password){
      return res.status(428).json({error:'password_change_required',user:{id:user.id,name:user.name,email:user.email,role:user.role}});
    }

    if(req.method==='GET'){
      await expireHolds();
      const reservations=await sql`
        SELECT id,guest_name,guest_email,guest_phone,guests,notes,checkin::text,checkout::text,status,
               hold_expires_at,contract_sent_at,contract_signed_at,deposit_received_at,released_at,created_at,updated_at
        FROM reservations
        ORDER BY CASE WHEN status IN ('released','expired','cancelled') THEN 1 ELSE 0 END, checkin ASC, created_at DESC
        LIMIT 250
      `;
      const tasks=await sql`
        SELECT t.id,t.title,t.description,t.status,t.priority,t.due_at,t.reservation_id,t.created_at,t.updated_at,
               u.id AS assigned_user_id,u.name AS assigned_user_name,u.email AS assigned_user_email
        FROM tasks t LEFT JOIN owner_users u ON u.id=t.assigned_user_id
        ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
                 CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
                 t.due_at NULLS LAST,t.created_at DESC
        LIMIT 300
      `;
      const users=await sql`SELECT id,name,email,role,active,must_change_password,created_at FROM owner_users ORDER BY name ASC`;
      const configRows=await sql`SELECT key,value,updated_at FROM site_config`;
      const siteConfig=Object.fromEntries(configRows.map(r=>[r.key,r.value]));
      const events=await sql`SELECT reservation_id,event_type,actor,metadata,created_at FROM booking_events ORDER BY created_at DESC LIMIT 100`;
      return res.status(200).json({user,reservations,tasks,users,siteConfig,events});
    }

    if(req.method==='POST'&&body.action==='reservation_update'){
      const id=clean(body.id,80),next=clean(body.status,40);
      if(!id)return res.status(400).json({error:'missing_id'});
      let eventType;
      if(next==='maintain_hold'){
        await sql`UPDATE reservations SET status='hold_verified',hold_expires_at=GREATEST(COALESCE(hold_expires_at,now()),now())+interval '24 hours',updated_at=now() WHERE id=${id} AND status IN ('inquiry_hold','hold_verified')`;
        eventType='hold_maintained';
      }else if(next==='contract_sent'){
        await sql`UPDATE reservations SET status='contract_sent',contract_sent_at=COALESCE(contract_sent_at,now()),hold_expires_at=NULL,updated_at=now() WHERE id=${id} AND status NOT IN ('released','cancelled','expired')`;
        eventType='contract_sent';
      }else if(next==='contract_signed'){
        await sql`UPDATE reservations SET status='contract_signed',contract_signed_at=COALESCE(contract_signed_at,now()),hold_expires_at=NULL,updated_at=now() WHERE id=${id} AND status NOT IN ('released','cancelled','expired')`;
        eventType='contract_signed';
      }else if(next==='deposit_received'){
        await sql`UPDATE reservations SET status='confirmed',deposit_received_at=COALESCE(deposit_received_at,now()),hold_expires_at=NULL,updated_at=now() WHERE id=${id} AND status NOT IN ('released','cancelled','expired')`;
        eventType='deposit_received';
      }else if(next==='release_dates'){
        await sql`UPDATE reservations SET status='released',released_at=now(),hold_expires_at=NULL,updated_at=now() WHERE id=${id} AND status<>'cancelled'`;
        eventType='dates_released';
      }else return res.status(400).json({error:'invalid_status'});
      await sql`INSERT INTO booking_events(reservation_id,event_type,actor,metadata) VALUES (${id},${eventType},${user.name},${JSON.stringify({user_id:user.id,email:user.email})}::jsonb)`;
      return res.status(200).json({ok:true});
    }

    if(req.method==='POST'&&body.action==='task_create'){
      const title=clean(body.title,180),description=clean(body.description,2000),priority=clean(body.priority||'normal',20),reservationId=clean(body.reservation_id,80)||null;
      const assigned=body.assigned_user_id?Number(body.assigned_user_id):null;
      const due=body.due_at?new Date(body.due_at):null;
      if(!title||!['low','normal','high','urgent'].includes(priority)||assigned!==null&&!Number.isInteger(assigned)||due&&Number.isNaN(due.getTime()))return res.status(400).json({error:'invalid_task'});
      const rows=await sql`
        INSERT INTO tasks(title,description,priority,due_at,assigned_user_id,reservation_id,created_by_user_id)
        VALUES (${title},${description||null},${priority},${due?due.toISOString():null},${assigned},${reservationId},${user.id}) RETURNING id
      `;
      return res.status(201).json({ok:true,id:rows[0].id});
    }

    if(req.method==='POST'&&body.action==='task_update'){
      const id=Number(body.id),status=clean(body.status,30);
      if(!Number.isInteger(id)||!['open','in_progress','done','cancelled'].includes(status))return res.status(400).json({error:'invalid_task'});
      await sql`UPDATE tasks SET status=${status},updated_at=now() WHERE id=${id}`;
      return res.status(200).json({ok:true});
    }

    if(req.method==='POST'&&body.action==='user_create'){
      if(user.role!=='admin')return res.status(403).json({error:'admin_required'});
      const name=clean(body.name,120),mail=email(body.email),password=body.password,role=clean(body.role||'owner',20);
      if(!name||!mail.includes('@')||!validPassword(password)||!['admin','owner','manager'].includes(role))return res.status(400).json({error:'invalid_owner'});
      const salt=crypto.randomBytes(16).toString('hex'),hash=passwordHash(password,salt);
      try{
        await sql`INSERT INTO owner_users(name,email,password_salt,password_hash,role,must_change_password) VALUES (${name},${mail},${salt},${hash},${role},true)`;
      }catch(e){if(String(e.message||'').toLowerCase().includes('unique'))return res.status(409).json({error:'email_exists'});throw e;}
      return res.status(201).json({ok:true});
    }

    if(req.method==='POST'&&body.action==='promo_update'){
      if(user.role!=='admin')return res.status(403).json({error:'admin_required'});
      const key=clean(body.key,60);
      if(!['midweek_offer','long_stay_offer'].includes(key))return res.status(400).json({error:'invalid_config'});
      const value=body.value&&typeof body.value==='object'?body.value:{};
      await sql`
        INSERT INTO site_config(key,value,updated_by_user_id,updated_at) VALUES (${key},${JSON.stringify(value)}::jsonb,${user.id},now())
        ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=now()
      `;
      return res.status(200).json({ok:true});
    }

    return res.status(405).json({error:'method_not_allowed'});
  }catch(e){console.error('owner api error',e);return res.status(500).json({error:'owner_api_error'});}
};
