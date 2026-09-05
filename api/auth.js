const {db,ensureSchema}=require('../lib/db');
const {
  normalizeEmail,safeEqual,createPassword,verifyPassword,
  createSession,getSession,destroySession,requireNamedUser
}=require('../lib/auth');

function bodyOf(req){return typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});}
function publicUser(user){
  if(!user)return null;
  return {id:user.id,name:user.name,email:user.email,role:user.role,active:user.active,mustChangePassword:user.mustChangePassword};
}

module.exports=async function(req,res){
  try{
    await ensureSchema();
    const sql=db();

    if(req.method==='GET'){
      const [countRows,session]=await Promise.all([
        sql`SELECT count(*)::int AS count FROM owner_users`,
        getSession(req)
      ]);
      res.setHeader('Cache-Control','no-store');
      return res.status(200).json({
        authenticated:!!session,
        legacy:!!session?.legacy,
        user:publicUser(session?.user),
        session:session?{createdAt:session.createdAt,expiresAt:session.expiresAt}:null,
        needsBootstrap:(countRows[0]?.count||0)===0
      });
    }

    if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
    const body=bodyOf(req);

    if(body.action==='bootstrap'){
      const countRows=await sql`SELECT count(*)::int AS count FROM owner_users`;
      if((countRows[0]?.count||0)!==0)return res.status(409).json({error:'bootstrap_already_completed'});
      if(!process.env.OWNER_PORTAL_PASSCODE)return res.status(503).json({error:'owner_login_not_configured'});
      if(!safeEqual(body.passcode,process.env.OWNER_PORTAL_PASSCODE))return res.status(401).json({error:'invalid_passcode'});

      const name=String(body.name||'').trim();
      const email=normalizeEmail(body.email);
      const password=String(body.password||'');
      if(name.length<2)return res.status(400).json({error:'name_required'});
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({error:'valid_email_required'});
      if(password.length<12)return res.status(400).json({error:'password_too_short'});

      const creds=createPassword(password);
      const rows=await sql`
        INSERT INTO owner_users(name,email,password_salt,password_hash,role,active,must_change_password)
        VALUES (${name},${email},${creds.salt},${creds.hash},'admin',true,false)
        RETURNING id,name,email,role,active,must_change_password
      `;
      const user=rows[0];
      await createSession(res,user.id);
      return res.status(201).json({ok:true,user:{id:user.id,name:user.name,email:user.email,role:user.role,active:user.active,mustChangePassword:user.must_change_password}});
    }

    if(body.action==='login'){
      const email=normalizeEmail(body.email);
      const password=String(body.password||'');
      const rows=await sql`
        SELECT id,name,email,password_salt,password_hash,role,active,must_change_password
        FROM owner_users
        WHERE lower(email)=lower(${email})
        LIMIT 1
      `;
      const user=rows[0];
      if(!user||!user.active||!verifyPassword(password,user.password_salt,user.password_hash))return res.status(401).json({error:'invalid_credentials'});
      await createSession(res,user.id);
      return res.status(200).json({ok:true,user:{id:user.id,name:user.name,email:user.email,role:user.role,active:user.active,mustChangePassword:user.must_change_password}});
    }

    if(body.action==='logout'){
      await destroySession(req,res);
      return res.status(200).json({ok:true});
    }

    if(body.action==='change_password'){
      const session=await requireNamedUser(req,res);
      if(!session)return;
      const currentPassword=String(body.currentPassword||'');
      const newPassword=String(body.newPassword||'');
      if(newPassword.length<12)return res.status(400).json({error:'password_too_short'});
      const rows=await sql`SELECT password_salt,password_hash FROM owner_users WHERE id=${session.user.id} LIMIT 1`;
      if(!rows.length||!verifyPassword(currentPassword,rows[0].password_salt,rows[0].password_hash))return res.status(401).json({error:'current_password_invalid'});
      const creds=createPassword(newPassword);
      await sql`UPDATE owner_users SET password_salt=${creds.salt},password_hash=${creds.hash},must_change_password=false,updated_at=now() WHERE id=${session.user.id}`;
      return res.status(200).json({ok:true});
    }

    return res.status(400).json({error:'invalid_action'});
  }catch(e){
    console.error('auth api error',e);
    return res.status(500).json({error:'auth_api_error'});
  }
};
