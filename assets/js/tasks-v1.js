const loginShell=document.getElementById('loginShell');
const ownerApp=document.getElementById('ownerApp');
const loginForm=document.getElementById('loginForm');
const loginMsg=document.getElementById('loginMsg');
let taskFilter={status:'open',due:'',assignee:'',q:''};

function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function showLogin(){ownerApp.classList.add('hidden');loginShell.classList.remove('hidden')}
function showApp(){loginShell.classList.add('hidden');ownerApp.classList.remove('hidden')}
function notice(text){const n=document.getElementById('moduleNotice');n.textContent=text;n.classList.remove('hidden')}
function countOrDash(v,available){return available&&v!=null?String(v):'—'}

function applyTaskContext(){
  const ctx=window.CJTOwnerShell?.readContext?.()||{};
  taskFilter.status=ctx.status||'open';
  taskFilter.due=ctx.due||'';
  taskFilter.assignee=ctx.assignee||'';
  taskFilter.q=ctx.q||'';
  const assignee=document.getElementById('taskAssignee');
  if(assignee)assignee.value=taskFilter.assignee;
}

function persistTaskContext(push){
  window.CJTOwnerShell?.writeContext?.({
    status:taskFilter.status==='all'?null:taskFilter.status,
    due:taskFilter.due||null,
    assignee:taskFilter.assignee||null,
    q:taskFilter.q||null
  },{push:Boolean(push)});
}

async function tasksApi(opts={}){
  const ctx=taskFilter;
  const params=new URLSearchParams();
  if(ctx.status)params.set('status',ctx.status);
  if(ctx.due)params.set('due',ctx.due);
  if(ctx.assignee)params.set('assignee',ctx.assignee);
  if(ctx.q)params.set('q',ctx.q);
  const r=await fetch(`/api/owner-tasks?${params}`,{headers:{'Content-Type':'application/json'},cache:'no-store',...opts});
  const d=await r.json().catch(()=>({}));
  if(r.status===401)throw new Error('unauthorized');
  if(!r.ok)throw new Error(d.message||d.error||'tasks_request_failed');
  return d;
}

function renderFilters(){
  const vals=[['open','Open'],['overdue','Overdue'],['all','All']];
  document.getElementById('taskFilters').innerHTML=vals.map(([v,l])=>{
    const active=(v==='overdue'&&taskFilter.due==='overdue')||(v!=='overdue'&&taskFilter.status===v&&taskFilter.due!=='overdue');
    return `<button class="filter-btn ${active?'active':''}" data-filter="${v}" type="button">${l}</button>`;
  }).join('');
  document.querySelectorAll('#taskFilters [data-filter]').forEach(btn=>btn.onclick=()=>{
    const v=btn.dataset.filter;
    if(v==='overdue'){taskFilter.due='overdue';taskFilter.status='open';}
    else {taskFilter.status=v;taskFilter.due='';}
    persistTaskContext(true);
    loadTasks();
  });
}

function renderTasks(data){
  const available=data.available!==false;
  const s=data.summary||{};
  document.getElementById('taskSummary').innerHTML=`
    <a class="summary-card kpi-card" href="/owner-v1/tasks?status=open&property=sand-sea-manor"><span>Open</span><b>${esc(countOrDash(s.open,available))}</b><span>${available?'Not done or cancelled':'Unavailable'}</span></a>
    <a class="summary-card kpi-card" href="/owner-v1/tasks?due=overdue&status=open&property=sand-sea-manor"><span>Overdue</span><b>${esc(countOrDash(s.overdue,available))}</b><span>${available?'Past due and still open':'Not verified'}</span></a>
    <div class="summary-card"><span>High priority</span><b>${esc(countOrDash(s.high_priority,available))}</b><span>${available?'Open high/urgent':'Not verified'}</span></div>`;
  const list=document.getElementById('taskList');
  if(!available){
    list.innerHTML='<div class="empty">The operations task table is not on this database yet. Open is shown as unavailable — not 0.</div>';
    return;
  }
  const rows=data.tasks||[];
  if(!rows.length){
    list.innerHTML='<div class="empty">No tasks match these filters.</div>';
    return;
  }
  list.innerHTML=rows.map(t=>`
    <article class="reservation-card">
      <div class="reservation-grid">
        <div>
          <span class="badge ${t.overdue?'warn':t.open?'':'good'}">${esc(t.status)}</span>
          <h3>${esc(t.title)}</h3>
          <div class="reservation-meta">${esc(t.assignee||'Unassigned')}${t.due?` · due ${esc(t.due)}`:''}${t.priority?` · ${esc(t.priority)}`:''}</div>
        </div>
      </div>
    </article>`).join('');
}

async function loadTasks(){
  try{
    applyTaskContext();
    renderFilters();
    const data=await tasksApi();
    showApp();
    renderTasks(data);
    document.getElementById('lastChecked').textContent=`Updated ${new Date(data.checkedAt||Date.now()).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}`;
    if(taskFilter.due==='overdue'&&data.available&&!(data.tasks||[]).length&&(data.summary?.overdue||0)===0){
      notice(window.CJTOwnerShell?.cannotApply?.('overdue tasks','Tasks')||'No overdue tasks in the current list.');
    }
  }catch(e){
    if(e.message==='unauthorized')return showLogin();
    showApp();
    notice('Tasks could not be loaded. No production data was changed.');
  }
}

document.getElementById('taskAssignee').addEventListener('change',()=>{
  taskFilter.assignee=document.getElementById('taskAssignee').value.trim();
  persistTaskContext(true);
  loadTasks();
});
document.getElementById('addTask').addEventListener('click',async()=>{
  const input=document.getElementById('taskTitle');
  const btn=document.getElementById('addTask');
  const title=(input?.value||'').trim();
  if(!title){notice('Enter a task title.');return;}
  if(btn.disabled)return;
  btn.disabled=true;
  try{
    await tasksApi({method:'POST',body:JSON.stringify({action:'create',title,assignee:document.getElementById('taskAssignee').value.trim()})});
    if(input)input.value='';
    notice('Task saved.');
    await loadTasks();
  }catch(e){
    notice(e.message==='unauthorized'?'Sign in to add a task.':'This page could not save a task until the operations table is confirmed.');
  }finally{
    btn.disabled=false;
  }
});
window.addEventListener('cjt-context-change',loadTasks);
loginForm.addEventListener('submit',async e=>{
  e.preventDefault();
  const btn=loginForm.querySelector('button[type="submit"]');
  if(btn?.disabled)return;
  if(btn)btn.disabled=true;
  loginMsg.textContent='Signing in…';
  try{
    const r=await fetch('/api/owner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',passcode:document.getElementById('passcode').value})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){loginMsg.textContent=d.error==='owner_login_not_configured'?'Owner login is not configured for this environment.':'Invalid passcode.';return}
    document.getElementById('passcode').value='';loginMsg.textContent='';loadTasks();
  }catch(err){
    loginMsg.textContent='Sign-in could not be completed. Try again.';
  }finally{
    if(btn)btn.disabled=false;
  }
});
loadTasks();
