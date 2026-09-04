(()=>{
  const root=document.documentElement;
  if(root.dataset.liveReservationsLoaded)return;
  root.dataset.liveReservationsLoaded='1';

  const LIVE_PORTAL='https://cjtbookingpage.vercel.app/owner';
  const style=document.createElement('style');
  style.textContent=`
    .live-res-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    .live-res-notice{background:#eef6f4;border:1px solid #bfd7d2;border-radius:14px;padding:13px 15px;margin:12px 0;color:#24494f}
    .live-res-notice strong{display:block;margin-bottom:3px}
    .live-res-list{display:grid;gap:12px;margin-top:14px}
    .live-res-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px;box-shadow:0 8px 24px rgba(13,43,49,.045)}
    .live-res-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
    .live-res-id{font-size:.78rem;font-weight:900;letter-spacing:.025em;color:var(--muted)}
    .live-res-dates{font-size:1.18rem;font-weight:900;margin:5px 0}
    .live-res-empty{background:#f5fbf7;border:1px solid #b9d8c5;border-radius:16px;padding:18px;color:#225b38;font-weight:800}
    .live-res-error{background:#fff7f7;border:1px solid #e3bcbc;border-radius:16px;padding:16px;color:#7a2929}
    .live-res-status{min-height:20px;margin-top:10px}
  `;
  document.head.appendChild(style);

  let section,list,refreshButton,statusHost,loading=false;
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const nights=(start,end)=>Math.max(0,Math.round((new Date(`${end}T00:00:00Z`)-new Date(`${start}T00:00:00Z`))/86400000));
  const pretty=v=>new Date(`${v}T12:00:00`).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});

  async function liveApi(options={}){
    const response=await fetch('/api/live-direct-bookings',{
      headers:{'Content-Type':'application/json'},
      ...options
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok){const error=new Error(data.error||'live_direct_request_failed');error.status=response.status;throw error;}
    return data;
  }

  function updateTopCount(count){
    const el=document.getElementById('kpiReservations');
    if(el)el.textContent=String(count);
  }

  async function releaseBlock(block,button){
    if(!confirm(`Release ${block.checkin} through ${block.checkout} from the live direct-booking calendar?`))return;
    const passcode=prompt('Enter the production owner passcode to release these dates.');
    if(passcode===null)return;
    button.disabled=true;
    statusHost.className='live-res-status meta';
    statusHost.textContent='Releasing live calendar block…';
    try{
      await liveApi({method:'POST',body:JSON.stringify({action:'release_live_direct',id:block.id,passcode})});
      statusHost.className='live-res-status success';
      statusHost.textContent='Dates released from the live direct-booking source. Connected calendars will clear after their next sync.';
      await new Promise(resolve=>setTimeout(resolve,900));
      await renderLiveReservations();
    }catch(error){
      statusHost.className='live-res-status error';
      statusHost.textContent=error.message==='invalid_live_owner_passcode'?'The production owner passcode was not accepted.':`Could not release the live block: ${error.message}`;
    }finally{
      button.disabled=false;
    }
  }

  async function renderLiveReservations(){
    if(!list||loading)return;
    loading=true;
    if(refreshButton){refreshButton.disabled=true;refreshButton.textContent='Refreshing…';}
    list.innerHTML='<div class="card">Loading live direct-booking blocks…</div>';
    try{
      const data=await liveApi();
      const blocks=Array.isArray(data.blocks)?data.blocks:[];
      updateTopCount(blocks.length);
      if(!blocks.length){
        list.innerHTML='<div class="live-res-empty">No live direct-booking blocks are currently being published.</div>';
        return;
      }
      const host=document.createElement('div');host.className='live-res-list';
      for(const block of blocks){
        const card=document.createElement('div');card.className='live-res-card';
        const count=nights(block.checkin,block.checkout);
        card.innerHTML=`<div class="live-res-card-head"><div><div class="live-res-id">${esc(block.id)}</div><div class="live-res-dates">${esc(pretty(block.checkin))} → ${esc(pretty(block.checkout))}</div><div class="meta">${count} occupied night${count===1?'':'s'} · Live production direct-booking feed</div></div><button class="btn danger small" type="button">Release dates</button></div>`;
        card.querySelector('button').addEventListener('click',event=>releaseBlock(block,event.currentTarget));
        host.appendChild(card);
      }
      list.innerHTML='';list.appendChild(host);
    }catch(error){
      updateTopCount(0);
      list.innerHTML=`<div class="live-res-error"><strong>Live reservation controls could not load.</strong><div class="meta" style="margin-top:5px">${esc(error.message)}</div></div>`;
    }finally{
      loading=false;
      if(refreshButton){refreshButton.disabled=false;refreshButton.textContent='Refresh live blocks';}
    }
  }

  function install(){
    section=document.getElementById('reservations');
    list=document.getElementById('reservationList');
    if(!section||!list){setTimeout(install,120);return;}

    const heading=section.querySelector('h2');
    if(heading)heading.textContent='Live Direct Bookings & Holds';
    const description=section.querySelector('.sectionhead .meta');
    if(description)description.textContent='Production direct-booking blocks with owner release controls.';

    const actions=section.querySelector('.sectionhead > :last-child');
    const toolbar=document.createElement('div');toolbar.className='live-res-toolbar';
    refreshButton=document.createElement('button');refreshButton.className='btn ghost small';refreshButton.type='button';refreshButton.textContent='Refresh live blocks';
    refreshButton.addEventListener('click',renderLiveReservations);
    const liveLink=document.createElement('a');liveLink.className='btn ghost small';liveLink.href=LIVE_PORTAL;liveLink.target='_blank';liveLink.rel='noopener';liveLink.textContent='Open production controls';
    toolbar.append(refreshButton,liveLink);
    if(actions&&actions.tagName==='A')toolbar.appendChild(actions);
    section.querySelector('.sectionhead')?.appendChild(toolbar);

    const notice=document.createElement('div');notice.className='live-res-notice';notice.innerHTML='<strong>Live production source</strong>This tab reads the calendar feed that is connected to Airbnb, Vrbo and Booking.com. It does not use the separate preview database.';
    section.querySelector('.sectionhead')?.insertAdjacentElement('afterend',notice);
    statusHost=document.createElement('div');statusHost.className='live-res-status meta';
    list.insertAdjacentElement('beforebegin',statusHost);

    window.renderReservations=renderLiveReservations;
    document.querySelector('.tab[data-tab="reservations"]')?.addEventListener('click',renderLiveReservations);
    const portal=document.getElementById('portal');
    const activate=()=>{if(portal&&!portal.classList.contains('hidden'))renderLiveReservations();};
    activate();
    if(portal)new MutationObserver(activate).observe(portal,{attributes:true,attributeFilter:['class']});
  }

  install();
})();
