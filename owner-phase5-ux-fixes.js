(()=>{
  const root=document.documentElement;
  if(root.dataset.ownerPhase5UxFixesLoaded)return;
  root.dataset.ownerPhase5UxFixesLoaded='1';

  const style=document.createElement('style');
  style.textContent=`
    .phase5-backbar{position:fixed!important;right:18px!important;bottom:18px!important;z-index:108!important;margin:0!important;padding:9px 11px!important;border:1px solid var(--line)!important;border-radius:999px!important;background:#fff!important;box-shadow:0 14px 36px rgba(13,43,49,.18)!important;max-width:min(360px,calc(100vw - 28px));transition:transform .16s ease,box-shadow .16s ease,opacity .16s ease}
    .phase5-backbar:not(.hidden){display:flex!important}.phase5-backbar #phase5Back{background:var(--deep)!important;color:#fff!important}.phase5-backbar #phase5BackLabel{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px}
    .phase5-backbar.phase5-back-pulse{animation:phase5BackPulse .65s ease}
    @keyframes phase5BackPulse{0%{transform:scale(.96)}45%{transform:scale(1.05);box-shadow:0 18px 44px rgba(13,43,49,.24)}100%{transform:scale(1)}}
    .taskcard.phase5-task-completing{opacity:.48;transform:translateX(8px);transition:opacity .18s ease,transform .18s ease}
    .taskcard.phase5-task-next{box-shadow:inset 0 0 0 2px rgba(49,93,100,.28),0 8px 22px rgba(13,43,49,.07)!important;animation:phase5TaskNext 1.1s ease}
    @keyframes phase5TaskNext{0%{transform:translateY(-4px)}100%{transform:translateY(0)}}
    .phase5-task-toast{position:fixed;left:50%;bottom:84px;transform:translateX(-50%);z-index:109;width:min(560px,calc(100vw - 28px));background:#fff;border:1px solid var(--line);border-radius:15px;box-shadow:0 16px 44px rgba(13,43,49,.2);padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:.82rem}
    .phase5-task-toast strong{display:block;margin-bottom:2px}.phase5-task-toast .actions{margin:0;flex:0 0 auto}
    @media(max-width:560px){.phase5-backbar{right:10px!important;bottom:10px!important}.phase5-backbar #phase5BackLabel{max-width:145px}.phase5-task-toast{bottom:72px;align-items:flex-start;flex-direction:column}.phase5-task-toast .actions{width:100%}}
  `;
  document.head.appendChild(style);

  function pulseBack(){
    const bar=document.querySelector('.phase5-backbar');
    if(!bar||bar.classList.contains('hidden'))return;
    bar.classList.remove('phase5-back-pulse');
    void bar.offsetWidth;
    bar.classList.add('phase5-back-pulse');
  }
  window.addEventListener('cjt:owner-nav',()=>setTimeout(pulseBack,120));

  let toastTimer=null;
  function toast(title,message,{showDone=false}={}){
    document.querySelector('.phase5-task-toast')?.remove();
    const box=document.createElement('div');
    box.className='phase5-task-toast';
    box.innerHTML=`<div><strong>${escapeHtml(title)}</strong><div class="meta">${escapeHtml(message)}</div></div><div class="actions">${showDone?'<button class="btn ghost small" type="button" data-view-done>View Done</button>':''}<button class="btn ghost small" type="button" data-dismiss>Dismiss</button></div>`;
    document.body.appendChild(box);
    box.querySelector('[data-dismiss]')?.addEventListener('click',()=>box.remove());
    box.querySelector('[data-view-done]')?.addEventListener('click',()=>{
      document.querySelector('#tasks > .phase5-context button')?.click();
      document.querySelector('#tasks-done')?.scrollIntoView({behavior:'smooth',block:'center'});
      box.remove();
    });
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.remove(),7000);
  }
  function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}

  function dueText(card){
    const meta=card?.querySelector('.meta')?.textContent||'';
    const m=meta.match(/Due:\s*([^\n]+)/i);
    return m?m[1].trim():'';
  }
  function recurrenceText(card){
    const badge=[...card.querySelectorAll('.badge')].find(x=>/^Repeats\s+/i.test(x.textContent.trim()));
    return badge?badge.textContent.trim().replace(/^Repeats\s+/i,''):'';
  }
  function titleText(card){return card?.querySelector('h4')?.textContent?.trim()||'Task'}
  function matchingCards(selector,title){return [...document.querySelectorAll(`${selector} .taskcard`)].filter(c=>titleText(c)===title)}

  function markNextOccurrence(title,oldDue,repeat){
    const cards=matchingCards('#tasks-open',title);
    const next=cards.find(c=>dueText(c)!==oldDue)||cards[0];
    if(!next)return null;
    next.classList.add('phase5-task-next');
    const badgeHost=next.firstElementChild;
    if(badgeHost&&!badgeHost.querySelector('[data-next-occurrence]')){
      const badge=document.createElement('span');
      badge.className='badge good';badge.dataset.nextOccurrence='1';badge.textContent='Next occurrence';badgeHost.prepend(badge);
    }
    setTimeout(()=>next.classList.remove('phase5-task-next'),2200);
    return {card:next,due:dueText(next),repeat};
  }

  function confirmCompletion(info,attempt=0){
    const done=matchingCards('#tasks-done',info.title);
    const next=info.recurrence?markNextOccurrence(info.title,info.oldDue,info.recurrence):null;
    const completed=done.length>0;
    if(completed&&(info.recurrence?!!next:true)){
      const openFilter=!!document.querySelector('#tasks-done')?.closest('.boardcol')?.classList.contains('phase5-hidden');
      if(info.recurrence){
        const when=next?.due&&next.due!==info.oldDue?` for ${next.due}`:'';
        toast(`${info.title} completed`,`The completed task moved to Done. A new ${info.recurrence} occurrence was created${when}.`,{showDone:openFilter});
      }else{
        toast(`${info.title} completed`,openFilter?'The task moved to Done. Done is hidden while the open-tasks filter is active.':'The task moved to Done.',{showDone:openFilter});
      }
      return;
    }
    if(attempt<16)setTimeout(()=>confirmCompletion(info,attempt+1),220);
  }

  document.addEventListener('click',e=>{
    const button=e.target.closest('#tasks button[data-s="done"]');
    if(!button)return;
    const card=button.closest('.taskcard');if(!card)return;
    const info={title:titleText(card),oldDue:dueText(card),recurrence:recurrenceText(card)};
    card.classList.add('phase5-task-completing');
    setTimeout(()=>confirmCompletion(info),260);
  },true);
})();
