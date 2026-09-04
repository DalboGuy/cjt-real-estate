const fs=require('fs');
const path=require('path');

const OWNER_MODULES=[
  '/owner-login-theme.js?v=20260904-1',
  '/owner-login-guard.js?v=20260904-1',
  '/owner-navigation.js?v=20260904-1',
  '/owner-calendar-ui.js?v=20260904-3',
  '/owner-calendar-theme.js?v=20260904-3',
  '/owner-dashboard-ui.js?v=20260904-3',
  '/owner-finance-ui.js?v=20260904-4',
  '/owner-finance-import.js?v=20260904-2',
  '/owner-live-reservations.js?v=20260904-2',
  '/owner-booking-settings.js?v=20260904-2',
  '/owner-detail-drawer.js?v=20260904-1'
];

module.exports=async function(req,res){
  try{
    const file=path.join(process.cwd(),'owner.html');
    let html=fs.readFileSync(file,'utf8');
    const tags=OWNER_MODULES.map(src=>`<script src="${src}"></script>`).join('\n');
    html=html.replace('</body>',`<!-- Owner portal modules -->\n${tags}\n</body>`);
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','no-store, max-age=0');
    return res.status(200).send(html);
  }catch(e){
    console.error('owner-page error',e);
    return res.status(500).send('Owner portal unavailable');
  }
};
