const { db, ensureSchema }=require('../lib/db');
const {ownerAuthOpen,requireOwnerAuth}=require('../lib/owner-auth');

module.exports=async function(req,res){
  try{
    await ensureSchema();
    if(!(await requireOwnerAuth(req,res)))return;
    const sql=db();
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});

    if(req.method==='GET'){
      const rows=await sql`
        SELECT id,thread_id,platform,message_type,guest_name,subject,body,snippet,
               stay_checkin::text,stay_checkout::text,reservation_ref,platform_url,gmail_url,
               source_email,reply_to,received_at,is_read,status
        FROM communications_messages
        ORDER BY received_at DESC
        LIMIT 300
      `;
      const counts=await sql`
        SELECT platform,count(*)::int total,count(*) FILTER (WHERE is_read=false)::int unread
        FROM communications_messages GROUP BY platform
      `;
      return res.status(200).json({messages:rows,counts,ownerAuthOpen:ownerAuthOpen()});
    }

    if(req.method==='POST'){
      const id=String(body.id||'').trim();
      if(!id)return res.status(400).json({error:'missing_id'});
      if(body.action==='mark_read'){
        await sql`UPDATE communications_messages SET is_read=true,updated_at=now() WHERE id=${id}`;
        return res.status(200).json({ok:true});
      }
      if(body.action==='mark_unread'){
        await sql`UPDATE communications_messages SET is_read=false,updated_at=now() WHERE id=${id}`;
        return res.status(200).json({ok:true});
      }
      if(body.action==='archive'){
        await sql`UPDATE communications_messages SET status='archived',is_read=true,updated_at=now() WHERE id=${id}`;
        return res.status(200).json({ok:true});
      }
      if(body.action==='reopen'){
        await sql`UPDATE communications_messages SET status='open',updated_at=now() WHERE id=${id}`;
        return res.status(200).json({ok:true});
      }
      return res.status(400).json({error:'invalid_action'});
    }
    return res.status(405).json({error:'method_not_allowed'});
  }catch(e){console.error('communications api error',e);return res.status(500).json({error:'communications_api_error'});}
};
