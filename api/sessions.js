const crypto=require('crypto');
const {db,ensureSchema}=require('../lib/db');
const {requireNamedUser,requireAdmin,parseCookies,sha256,clearSessionCookie}=require('../lib/auth');
const {writeAudit}=require('../lib/audit');

const COOKIE_NAME='cjt_owner_session';
function bodyOf(req){return typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});}
function publicId(hash){return crypto.createHash('sha256').update(`public:${hash}`).digest('hex').slice(0,16);}
function currentHash(req){const token=parseCookies(req.headers.cookie||'')[COOKIE_NAME];return token?sha256(token):null;}
function rowOut(row,current){return {
  id:publicId(row.token_hash),
  userId:row.user_id||null,
  name:row.name||null,
  email:row.email||null,
  role:row.role||null,
  createdAt:row.created_at,
  expiresAt:row.expires_at,
  current:row.token_hash===current
};}

module.exports=async function(req,res){
  try{
    await ensureSchema();
    const sql=db();
    const isAdminScope=String(req.query?.scope||'')==='admin';
    const session=isAdminScope?await requireAdmin(req,res):await requireNamedUser(req,res);
    if(!session)return;
    const current=currentHash(req);

    if(req.method==='GET'){
      const rows=isAdminScope
        ?await sql`SELECT s.token_hash,s.user_id,s.created_at,s.expires_at,u.name,u.email,u.role FROM owner_sessions s LEFT JOIN owner_users u ON u.id=s.user_id WHERE s.user_id IS NOT NULL AND s.expires_at>now() ORDER BY s.created_at DESC LIMIT 200`
        :await sql`SELECT s.token_hash,s.user_id,s.created_at,s.expires_at,u.name,u.email,u.role FROM owner_sessions s LEFT JOIN owner_users u ON u.id=s.user_id WHERE s.user_id=${session.user.id} AND s.expires_at>now() ORDER BY s.created_at DESC LIMIT 50`;
      res.setHeader('Cache-Control','no-store');
      return res.status(200).json({sessions:rows.map(r=>rowOut(r,current)),scope:isAdminScope?'admin':'account'});
    }

    if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
    const body=bodyOf(req);
    const action=String(body.action||'');

    if(action==='revoke_others'&&!isAdminScope){
      const result=await sql`DELETE FROM owner_sessions WHERE user_id=${session.user.id} AND token_hash<>${current||''} RETURNING token_hash`;
      await writeAudit({req,actorUserId:session.user.id,eventType:'session.revoke_others',targetType:'user',targetId:String(session.user.id),metadata:{revokedCount:result.length}});
      return res.status(200).json({ok:true,revoked:result.length});
    }

    if(action==='revoke'){
      const wanted=String(body.sessionId||'');
      if(!wanted)return res.status(400).json({error:'session_id_required'});
      const candidates=isAdminScope
        ?await sql`SELECT token_hash,user_id FROM owner_sessions WHERE user_id IS NOT NULL AND expires_at>now()`
        :await sql`SELECT token_hash,user_id FROM owner_sessions WHERE user_id=${session.user.id} AND expires_at>now()`;
      const target=candidates.find(r=>publicId(r.token_hash)===wanted);
      if(!target)return res.status(404).json({error:'session_not_found'});
      await sql`DELETE FROM owner_sessions WHERE token_hash=${target.token_hash}`;
      const revokedCurrent=target.token_hash===current;
      if(revokedCurrent)clearSessionCookie(res);
      await writeAudit({req,actorUserId:session.user.id,eventType:isAdminScope?'admin.session_revoked':'session.revoked',targetType:'session',targetId:wanted,metadata:{targetUserId:target.user_id,revokedCurrent}});
      return res.status(200).json({ok:true,revokedCurrent});
    }

    return res.status(400).json({error:'invalid_action'});
  }catch(e){
    console.error('sessions api error',e);
    return res.status(500).json({error:'sessions_api_error'});
  }
};
