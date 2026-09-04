const fs=require('fs');
const path=require('path');

module.exports=async function(req,res){
  try{
    const file=path.join(process.cwd(),'owner.html');
    let html=fs.readFileSync(file,'utf8');
    if(!html.includes('/owner-calendar-ui.js'))html=html.replace('</body>','<script src="/owner-calendar-ui.js"></script>\n</body>');
    if(!html.includes('/owner-calendar-theme.js'))html=html.replace('</body>','<script src="/owner-calendar-theme.js"></script>\n</body>');
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    return res.status(200).send(html);
  }catch(e){
    console.error('owner-page error',e);
    return res.status(500).send('Owner portal unavailable');
  }
};
