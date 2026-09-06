(()=>{
  if(window.CJTInquiryWorkflow)return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const closed=r=>['released','expired','cancelled'].includes(r.status);
  const stage=r=>closed(r)?(r.review_stage==='rejected'?'rejected':r.status):(['contract_sent','contract_signed','confirmed'].includes(r.status)?r.status:r.review_stage==='pending'?'new':r.review_stage||'new');
  let filter='active',search='',focusId='',busy=false,list,message;
  const records=()=>typeof state!=='undefined'?state.reservations||[]:[];
  const style=document.createElement('style');style.textContent='.inquiry-toolbar,.inquiry-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.inquiry-card{border:1px solid var(--line);background:white;border-radius:14px;padding:16px;margin:12px 0;overflow-wrap:anywhere}.inquiry-card button{min-height:44px}.inquiry-card:focus{outline:3px solid #2b8074}.inquiry-card textarea{width:100%;box-sizing:border-box}.block-review{max-width:560px;width:calc(100% - 48px);border:1px solid #aaa;border-radius:16px;padding:20px}.block-review::backdrop{background:#0008}';document.head.append(style);
  function buttons(r){
    if(closed(r))return [];
    const out=[];
    if(['inquiry_hold','hold_verified'].includes(r.status)){
      if(stage(r)!=='accepted')out.push(['processing','Processing'],['accept','Accept & hold 24h']);
      out.push(['maintain_hold','Keep hold 24h'],['reject','Reject inquiry'],['contract_sent','Mark contract sent']);
    }
    if(r.status==='contract_sent')out.push(['contract_signed','Mark contract signed']);
    if(r.status==='contract_signed')out.push(['deposit_received','Mark deposit received']);
    out.push(['release_dates','Release dates']);return out;
  }
  function render(){
    if(!list)return;
    const all=records(),shown=all.filter(r=>(!focusId||r.id===focusId)&&(filter==='all'||filter==='active'&&!closed(r)||filter==='closed'&&closed(r)||stage(r)===filter)&&[r.id,r.guest_name,r.guest_email,r.checkin,r.checkout].join(' ').toLowerCase().includes(search.toLowerCase()));
    list.innerHTML=shown.length?'':'<p>No inquiries match this view.</p>';
    for(const r of shown){
      const history=(typeof state!=='undefined'?state.events||[]:[]).filter(e=>e.reservation_id===r.id);
      const card=document.createElement('article');card.className='inquiry-card';card.dataset.inquiryId=r.id;card.tabIndex=-1;
      card.innerHTML=`<h3>${esc(r.guest_name||'Direct inquiry')} · ${esc(stage(r).replaceAll('_',' '))}</h3><p><strong>${esc(r.checkin)} → ${esc(r.checkout)}</strong> · ${esc(r.guests)} guests</p><p>${esc(r.id)}<br>${esc(r.guest_email)}<br>${esc(r.guest_phone||'')}</p><p>${esc(r.notes||'')}</p>${r.hold_expires_at&&!closed(r)?`<p>Hold expires ${esc(new Date(r.hold_expires_at).toLocaleString())}</p>`:''}${closed(r)?'<p>Direct dates are released. Other calendar sources may still block these dates.</p>':'<label>Internal decision note (optional)<textarea maxlength="2000" rows="2"></textarea></label>'}<div class="inquiry-actions">${buttons(r).map(([action,label])=>`<button type="button" class="btn ghost small" data-action="${action}" ${busy?'disabled':''}>${label}</button>`).join('')}</div>`;
      if(history.length){const details=document.createElement('details');details.innerHTML='<summary>Recent activity</summary>'+history.map(e=>`<p>${esc(e.event_type.replaceAll('_',' '))} · ${esc(e.actor)} · ${esc(new Date(e.created_at).toLocaleString())}${e.metadata?.note?`<br>${esc(e.metadata.note)}`:''}</p>`).join('');card.append(details);}
      card.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>update(r,b.dataset.action,card.querySelector('textarea')?.value||''));list.append(card);
    }
  }
  async function update(r,action,note){
    if(busy)return;
    const labels=Object.fromEntries(buttons(r));
    if(!confirm(`${labels[action]} for ${r.guest_name}, ${r.checkin} → ${r.checkout}? ${['reject','release_dates'].includes(action)?'This releases the direct hold only. Other platforms must be managed separately.':'This records your decision; it does not send a contract, collect payment, or message the guest.'}`))return;
    busy=true;list.querySelectorAll('button').forEach(b=>b.disabled=true);message.textContent='Saving decision…';
    try{
      const response=await fetch('/api/owner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'reservation_update',id:r.id,status:action,note,expected_updated_at:r.updated_at})});
      const data=await response.json();
      if(!response.ok){if(response.status===409){await load();throw new Error('This inquiry changed or its hold expired. Review the refreshed record before trying again.');}throw new Error(data.error||'Unable to save');}
      await load();window.dispatchEvent(new CustomEvent('cjt:reservation-updated'));
      message.textContent='Decision saved. Direct availability updated; imported calendars clear on their next source sync. No guest message was sent.';
    }catch(e){message.textContent=e.message;}finally{busy=false;render();}
  }
  function open(id){
    filter='all';focusId=id||'';search='';document.getElementById('inquiryFilter').value=filter;document.getElementById('inquirySearch').value=search;
    if(window.CJTOwnerNav)window.CJTOwnerNav.openTab('reservations');else document.querySelector('[data-tab="reservations"]')?.click();
    render();const card=[...list.children].find(c=>c.dataset.inquiryId===id);card?.focus();card?.scrollIntoView({block:'center'});
  }
  function reviewBlock(events){
    document.getElementById('inquiryBlockReview')?.remove();
    const dialog=document.createElement('dialog');dialog.id='inquiryBlockReview';dialog.className='block-review';
    const links={airbnb:'https://www.airbnb.com/hosting/calendar',vrbo:'https://www.vrbo.com/', 'booking.com':'https://admin.booking.com/',houfy:'https://www.houfy.com/'};
    dialog.innerHTML='<h2>Manage blocked dates</h2><p>Each listed source can block these nights. Revenue entries do not change availability.</p>';
    for(const e of events){const item=document.createElement('div');item.innerHTML=`<h3>${esc(e.source)} · ${esc(e.start)} → ${esc(e.end)}</h3><p>${esc(e.summary||'Calendar block')}</p>`;
      if(e.source==='direct'&&e.reservationId){const b=document.createElement('button');b.className='btn';b.textContent='Review inquiry / release dates';b.onclick=()=>{dialog.close();open(e.reservationId)};item.append(b);}
      else{const p=document.createElement('p');p.textContent='Open the original booking or manual block on this platform. If it was imported there, remove it at its original source, then refresh after calendars synchronize.';item.append(p);if(links[e.source]){const a=document.createElement('a');a.href=links[e.source];a.target='_blank';a.rel='noopener';a.textContent=`Open ${e.source}`;item.append(a);}}
      dialog.append(item);
    }
    const close=document.createElement('button');close.textContent='Close';close.className='btn ghost';close.onclick=()=>dialog.close();dialog.append(close);dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
  }
  function install(){
    const section=document.getElementById('reservations');list=document.getElementById('reservationList');if(!section||!list)return;
    section.querySelector('h2').textContent='Booking inquiries & reservations';
    const description=section.querySelector('.sectionhead .meta');if(description)description.textContent='Review direct inquiries, record contract and payment milestones, and release direct holds.';
    const toolbar=document.createElement('div');toolbar.className='inquiry-toolbar';toolbar.innerHTML='<label>View <select id="inquiryFilter"><option value="active">Active</option><option value="new">New</option><option value="processing">Processing</option><option value="accepted">Accepted</option><option value="confirmed">Confirmed</option><option value="closed">Closed / rejected</option><option value="all">All</option></select></label><label>Find inquiry <input id="inquirySearch" type="search" placeholder="Guest, dates, or booking ID"></label><button type="button" class="btn ghost">Refresh inquiries</button>';
    list.before(toolbar);message=document.createElement('p');message.setAttribute('role','status');list.before(message);
    toolbar.querySelector('select').onchange=e=>{focusId='';filter=e.target.value;render()};toolbar.querySelector('input').oninput=e=>{focusId='';search=e.target.value;render()};toolbar.querySelector('button').onclick=()=>load();window.renderReservations=render;render();
  }
  window.CJTInquiryWorkflow={open,reviewBlock};install();
})();
