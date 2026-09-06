const crypto=require('crypto');
const { db, ensureSchema }=require('../lib/db');

const VERIFIED_TAX_DEFAULTS={
  configured:true,
  cleaning_fee:240,
  tax_pct:15,
  taxable_cleaning:true,
  deposit_pct:35,
  tax_note:'Galveston lodging tax: 6% Texas state HOT + 9% City of Galveston HOT. Cleaning/readiness charges are included in the taxable room amount under Texas hotel occupancy tax rules.'
};

function parseCookies(header=''){return Object.fromEntries(header.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return [decodeURIComponent(v.slice(0,i)),decodeURIComponent(v.slice(i+1))];}));}
function tokenHash(v){return crypto.createHash('sha256').update(String(v||'')).digest('hex');}
function number(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function isLegacyPlaceholder(v={}){return v.saved_by_owner!==true&&v.configured!==true&&Number(v.cleaning_fee||0)===0&&Number(v.deposit_pct||0)===0;}

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

module.exports=async function(req,res){
  try{
    await ensureSchema();
    const user=await authUser(req);
    if(!user)return res.status(401).json({error:'unauthorized'});
    if(user.must_change_password)return res.status(428).json({error:'password_change_required'});
    const sql=db();
    if(req.method==='GET'){
      res.setHeader('Cache-Control','no-store');
      const rows=await sql`SELECT value,updated_at FROM site_config WHERE key='booking_fees' LIMIT 1`;
      const stored=rows[0]&&rows[0].value||{};
      const shouldMigrate=!rows.length||isLegacyPlaceholder(stored);
      const value=shouldMigrate?VERIFIED_TAX_DEFAULTS:{...VERIFIED_TAX_DEFAULTS,...stored};
      if(shouldMigrate){
        await sql`
          INSERT INTO site_config(key,value,updated_at)
          VALUES ('booking_fees',${JSON.stringify(value)}::jsonb,now())
          ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()
        `;
      }
      return res.status(200).json({user:{id:user.id,name:user.name,role:user.role},config:value,updatedAt:shouldMigrate?new Date().toISOString():rows[0]&&rows[0].updated_at||null});
    }
    if(req.method==='POST'){
      if(user.role!=='admin')return res.status(403).json({error:'admin_required'});
      const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
      const cleaning=number(body.cleaning_fee),tax=number(body.tax_pct),deposit=number(body.deposit_pct);
      if(cleaning===null||cleaning<0||cleaning>5000||tax===null||tax<0||tax>30||deposit===null||deposit<0||deposit>100){
        return res.status(400).json({error:'invalid_booking_fees'});
      }
      const value={
        configured:body.configured===true,
        saved_by_owner:true,
        cleaning_fee:Math.round(cleaning*100)/100,
        tax_pct:Math.round(tax*10000)/10000,
        taxable_cleaning:body.taxable_cleaning===true,
        deposit_pct:Math.round(deposit*10000)/10000,
        tax_note:VERIFIED_TAX_DEFAULTS.tax_note
      };
      await sql`
        INSERT INTO site_config(key,value,updated_by_user_id,updated_at)
        VALUES ('booking_fees',${JSON.stringify(value)}::jsonb,${user.id},now())
        ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=now()
      `;
      return res.status(200).json({ok:true,config:value});
    }
    return res.status(405).json({error:'method_not_allowed'});
  }catch(e){
    console.error('booking settings error',e);
    return res.status(500).json({error:'booking_settings_error'});
  }
};
