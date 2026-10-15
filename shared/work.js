/* My Day and employee communication. Supabase is authoritative; no local-only saves. */
(function(){
'use strict';
const U=window.kdhUser&&window.kdhUser();
if(!U || U.preview || U.ws==='finance' || !['rep','manager','associate'].includes(U.role)) return;
const root=new URL('../',document.currentScript.src), url=p=>new URL(p,root).href;
const E=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const me=(U.email||'').toLowerCase(), uuid=()=>crypto.randomUUID();
const day=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(d||new Date());
const token=()=>{const m=document.cookie.match(/(?:^|;\s*)kdh_at=([^;]*)/);return m?decodeURIComponent(m[1]):'';};
const rpc=(name,body)=>rest('rpc/'+name,{method:'POST',body});
async function rest(path,o={},retry=false){
 const c=window.KDH_AUTH;if(!c||!token()) throw Error('Sign in to save your work.');
 const r=await fetch(c.url.replace(/\/$/,'')+'/rest/v1/'+path,{method:o.method||'GET',headers:{apikey:c.key,authorization:'Bearer '+token(),'content-type':'application/json',prefer:o.prefer||'return=representation'},body:o.body===undefined?undefined:JSON.stringify(o.body)});
 if(r.status===401&&!retry&&window.kdhFreshToken){await window.kdhFreshToken();return rest(path,o,true);}
 const b=await r.json().catch(()=>null);
 if(!r.ok) throw Error(b&&/PGRST20[45]|42P01|42703/.test(b.code)?'This feature is awaiting the Hub update.':b&&b.message||'Could not save. Check your connection and retry.');
 return b;
}
async function all(path){let rows=[],offset=0;for(;;){const batch=await rest(path+(path.includes('?')?'&':'?')+'limit=500&offset='+offset);rows.push(...batch);if(batch.length<500)return rows;offset+=500;}}
async function patch(id,body){const r=await rest('field_tasks?id=eq.'+encodeURIComponent(id),{method:'PATCH',body});if(!r||!r.length)throw Error('Task changed or access was removed. Refresh and retry.');return r[0];}
const taskLink=id=>url('tasks/#task='+encodeURIComponent(id));
let tasks=[],notifications=[],people=[],conversations=[],reads=[],view='personal',pendingAdd=null,draftTitle='',ordering=false,busy=false,dialog=null,current=null,refreshing=false,refreshQueued=false;
let card=document.querySelector('[data-my-day]');
const css=document.createElement('link');css.rel='stylesheet';css.href=url('shared/work.css?v=20261015ui');document.head.append(css);
function showError(e,host){const root=host||card||dialog;const el=root&&root.querySelector('[data-work-error]');if(el)el.textContent=e.message||String(e);}
let selectedTask=null,taskRequest=0,commentDrafts=new Map(),commentPending=new Map();
const initials=name=>String(name||'?').trim().split(/\s+/).map(n=>n[0]).slice(0,2).join('').toUpperCase();
const stamp=value=>value?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value)):'';
const avatar=(name,extra='')=>'<span class="work-avatar '+extra+'" aria-hidden="true">'+E(initials(name))+'</span>';
const dueLabel=value=>value===day()?'Today':new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
const taskStatus=t=>t.status==='done'?'Completed':t.status==='blocked'?'Blocked':t.due_date&&t.due_date<day()?'Overdue':t.status==='in_progress'?'In progress':'To do';
function taskRow(t,personal){
 const status=taskStatus(t),selected=selectedTask===t.id;
 return '<div class="work-row '+(t.status==='done'?'work-done ':'')+(selected?'work-selected':'')+'">'+(personal?'<label class="work-check"><input type="checkbox" data-check="'+E(t.id)+'" aria-label="Complete '+E(t.title)+'" '+(t.status==='done'?'checked':'')+'></label>':'')+'<button class="work-task-title" data-task="'+E(t.id)+'" aria-pressed="'+selected+'"><span class="work-title">'+E(t.title)+'</span><small>'+E([t.account_name|| (t.account_num?'Account #'+t.account_num:'Personal task'),personal?(t.rep_email!==me?'From '+t.rep_name:''):t.associate_name,t.due_date?'Due '+dueLabel(t.due_date):''].filter(Boolean).join(' · '))+'</small></button><span class="work-status '+(['Blocked','Overdue'].includes(status)?'work-warning':'')+'">'+E(status)+'</span>'+(personal&&ordering?'<button data-up="'+E(t.id)+'" aria-label="Move '+E(t.title)+' up">↑</button>':'')+'</div>';
}
function renderDay(){
 if(!card)return;
 const today=day(),mine=tasks.filter(t=>t.associate_email===me&&((t.status!=='done'&&t.planned_on<=today)||(t.status==='done'&&t.completed_at&&day(new Date(t.completed_at))===today))).sort((a,b)=>a.sort_order-b.sort_order||a.created_at.localeCompare(b.created_at));
 const delegated=tasks.filter(t=>t.rep_email===me&&t.associate_email!==me&&t.status!=='done'),list=view==='delegated'?delegated:mine,manager=U.role==='manager',done=mine.filter(t=>t.status==='done').length;
 if(selectedTask&&!tasks.some(t=>t.id===selectedTask))selectedTask=null;
 let groups='';
 if(ordering){groups=list.map(t=>taskRow(t,view==='personal')).join('');}
 else for(const group of ['Needs attention',view==='delegated'?'Delegated':'Today','Completed']){
 const rows=list.filter(t=>(t.status==='done'?'Completed':t.status==='blocked'||t.due_date&&t.due_date<today?'Needs attention':view==='delegated'?'Delegated':'Today')===group);
 if(rows.length)groups+='<h3 class="work-group '+(group==='Needs attention'?'work-warn-text':'')+'">'+group+' · '+rows.length+'</h3>'+rows.map(t=>taskRow(t,view==='personal')).join('');
 }
 card.className='work-card';card.innerHTML='<div class="work-workspace-head"><div><h2>'+(manager?'My Day & Team':'My Day')+'</h2><p class="work-muted">'+E(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'long',month:'long',day:'numeric'}).format(new Date()))+'</p></div>'+(U.role!=='associate'?'<a class="work-link" href="'+url('tasks/#new')+'">+ '+(manager?'Assign task':'New task')+'</a>':'')+'</div><div class="work-tabs"><button aria-pressed="true">Tasks</button><button data-open-messages>Messages <span class="work-badge" data-card-msg-count></span></button></div><div class="work-layout"><div class="work-list-panel"><div class="work-summary"><div><h3>Your day at a glance</h3><span class="work-muted">'+done+' of '+mine.length+' complete</span><div class="work-progress" role="progressbar" aria-label="Daily tasks completed" aria-valuenow="'+done+'" aria-valuemin="0" aria-valuemax="'+Math.max(1,mine.length)+'"><span style="width:'+(mine.length?done/mine.length*100:0)+'%"></span></div></div>'+(manager?'<a class="work-team-summary" href="'+url('tasks/')+'">'+tasks.filter(t=>t.status!=='done'&&t.due_date&&t.due_date<today).length+' overdue<br>'+tasks.filter(t=>t.status==='blocked').length+' blocked</a>':'')+'</div><div class="work-filters"><button data-view="personal" aria-pressed="'+(view==='personal')+'">My tasks</button><button data-view="delegated" aria-pressed="'+(view==='delegated')+'">Delegated <span class="work-badge">'+delegated.length+'</span></button></div><div data-work-error class="work-error" role="status"></div><div>'+ (groups||'<p class="work-empty">'+(view==='personal'?'Your day is clear. Add your next task below.':'No delegated work pending.')+'</p>')+'</div>'+(U.role!=='associate'?'<form class="work-entry"><input name="title" required maxlength="160" placeholder="+ Add something to your day" aria-label="New task" autocomplete="off"><button>Add Task</button></form>':'')+'<div class="work-actions"><a class="work-link" href="'+url('tasks/')+'">'+(manager?'View Team Tasks':'View All Tasks')+' →</a><button data-order aria-pressed="'+ordering+'">'+(ordering?'Done Reordering':'Reorder')+'</button></div></div><'+(matchMedia('(max-width:760px)').matches?'dialog':'aside')+' class="work-detail" aria-label="Task details" '+(!selectedTask?'hidden':'')+'></'+(matchMedia('(max-width:760px)').matches?'dialog':'aside')+'></div>';
 card.querySelector('[data-open-messages]').onclick=()=>openMessages();
 card.querySelector('[data-order]').onclick=()=>{if(busy)return;ordering=!ordering;renderDay();};
 const input=card.querySelector('input[name=title]');
 if(input){input.value=draftTitle;input.oninput=()=>{draftTitle=input.value;};
 card.querySelector('form.work-entry').onsubmit=async e=>{e.preventDefault();if(busy)return;const title=input.value.trim();if(!title)return;
 if(!pendingAdd||pendingAdd.title!==title)pendingAdd={id:uuid(),title,task_type:'other',associate_email:me,planned_on:day(),sort_order:Date.now()};
 busy=true;const b=e.submitter;b.disabled=true;
 try{const r=await rest('field_tasks?on_conflict=id',{method:'POST',body:pendingAdd,prefer:'resolution=ignore-duplicates,return=representation'});if(!r.length){const found=await rest('field_tasks?id=eq.'+pendingAdd.id);if(!found.length)throw Error('Task was not saved. Retry.');}pendingAdd=null;draftTitle='';await refresh(true);}catch(err){showError(err);}finally{busy=false;b.disabled=false;}};}
 card.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{if(busy)return;view=b.dataset.view;selectedTask=null;renderDay();});
 card.querySelectorAll('[data-check]').forEach(b=>b.onchange=()=>changeStatus(tasks.find(t=>t.id===b.dataset.check),b.checked,b));
 card.querySelectorAll('[data-task]').forEach(b=>b.onclick=()=>{selectedTask=b.dataset.task;renderDay();card.querySelector('.work-detail [data-detail-close]').focus();});
 card.querySelectorAll('[data-up]').forEach(b=>b.onclick=async()=>{if(busy)return;const i=mine.findIndex(t=>t.id===b.dataset.up);if(i<1)return;busy=true;try{const rank=i===1?mine[0].sort_order-1024:(mine[i-2].sort_order+mine[i-1].sort_order)/2;await patch(mine[i].id,{sort_order:rank});await refresh(true);}catch(e){showError(e);}finally{busy=false;}});
 if(selectedTask)renderTaskDetail();badges();
}
async function changeStatus(t,done,button){
 if(busy){if(button.type==='checkbox')button.checked=t.status==='done';return;}
 if(done&&['display','tap_handle'].includes(t.task_type)){location.href=taskLink(t.id);return;}
 busy=true;button.disabled=true;
 try{await patch(t.id,{status:done?'done':'assigned'});await refresh(true);}catch(e){if(button.type==='checkbox')button.checked=t.status==='done';showError(e,card.querySelector('.work-detail:not([hidden])')||card);}finally{busy=false;button.disabled=false;}
}
function renderTaskDetail(){
 const host=card.querySelector('.work-detail'),t=tasks.find(t=>t.id===selectedTask);if(!host||!t)return;
 const request=++taskRequest,canEdit=t.rep_email===me||U.role==='manager',canStatus=t.associate_email===me||U.role==='manager';
 host.innerHTML='<div class="work-detail-head"><span>Task details</span><button data-detail-close aria-label="Close task details">✕</button></div><div class="work-detail-body"><span class="work-status '+(['Overdue','Blocked'].includes(taskStatus(t))?'work-warning':'')+'">'+E(taskStatus(t))+'</span><h3>'+E(t.title)+'</h3><dl class="work-properties"><dt>Account</dt><dd>'+E(t.account_name||t.account_num||'Personal task')+'</dd><dt>Assigned to</dt><dd>'+avatar(t.associate_name)+'<span>'+E(t.associate_email===me?'You':t.associate_name||t.associate_email)+'</span></dd><dt>Due date</dt><dd>'+E(t.due_date?dueLabel(t.due_date):'No due date')+'</dd></dl>'+(t.description?'<p class="work-note">'+E(t.description)+'</p>':'')+(t.blocked_reason?'<p class="work-note work-warn-text">Blocked: '+E(t.blocked_reason)+'</p>':'')+((t.photo_path||['display','tap_handle'].includes(t.task_type))?'<a class="work-link" href="'+taskLink(t.id)+'">'+(t.photo_path?'View completion photo':'Open task to add completion photo')+' →</a>':'')+'<a class="work-link" href="'+taskLink(t.id)+'">Open full task →</a><h4>Task conversation</h4><div data-task-comments><p class="work-muted">Loading conversation…</p></div><form class="work-comment-form"><label class="work-sr-only" for="work-comment">Task comment</label><textarea id="work-comment" rows="2" maxlength="2000" required placeholder="Add a comment…"></textarea><button>Post</button></form><div data-work-error class="work-error" role="status"></div></div><div class="work-detail-actions">'+(canEdit?'<a class="work-button" href="'+url('tasks/#edit='+t.id)+'">Edit or delegate</a>':'<a class="work-button" href="'+taskLink(t.id)+'">Open full task</a>')+(canStatus?'<button class="work-primary" data-detail-complete>'+(t.status==='done'?'Reopen task':'Mark complete')+'</button>':'')+'</div>';
 const closeDetail=()=>{selectedTask=null;taskRequest++;if(host.tagName==='DIALOG')host.close();host.hidden=true;card.querySelectorAll('[data-task]').forEach(b=>b.setAttribute('aria-pressed','false'));card.querySelectorAll('.work-selected').forEach(b=>b.classList.remove('work-selected'));const button=card.querySelector('[data-task="'+CSS.escape(t.id)+'"]');if(button)button.focus();};host.querySelector('[data-detail-close]').onclick=closeDetail;if(host.tagName==='DIALOG'){host.showModal();host.addEventListener('cancel',e=>{e.preventDefault();closeDetail();});}
 const complete=host.querySelector('[data-detail-complete]');if(complete)complete.onclick=()=>changeStatus(t,t.status!=='done',complete);
 const input=host.querySelector('textarea');input.value=commentDrafts.get(t.id)||'';input.oninput=()=>commentDrafts.set(t.id,input.value);
 host.querySelector('form').onsubmit=async e=>{e.preventDefault();const body=input.value.trim(),button=e.submitter;if(!body||button.disabled)return;let pending=commentPending.get(t.id);if(!pending||pending.body!==body){pending={body,id:uuid()};commentPending.set(t.id,pending);}button.disabled=true;
 try{await rest('field_task_comments?on_conflict=author_email,client_id',{method:'POST',body:{task_id:t.id,body,kind:'comment',client_id:pending.id},prefer:'resolution=ignore-duplicates,return=representation'});commentPending.delete(t.id);commentDrafts.delete(t.id);if(selectedTask===t.id){renderTaskDetail();}window.dispatchEvent(new Event('kdh:work-changed'));}catch(e){showError(e,host);}finally{button.disabled=false;}};
 loadTaskComments(t.id,request,host);
}
async function loadTaskComments(id,request,host){
 const viewedAt=new Date().toISOString();
 try{const rows=await all('field_task_comments?task_id=eq.'+encodeURIComponent(id)+'&order=created_at.asc,id.asc');
 if(request!==taskRequest||selectedTask!==id||!host.isConnected)return;
 host.querySelector('[data-task-comments]').innerHTML=rows.length?rows.map(c=>'<div class="work-comment">'+avatar(c.author_name||c.author_email)+'<div><strong>'+E(c.author_name||c.author_email)+'</strong><small>'+E(stamp(c.created_at))+'</small>'+(c.body?'<p>'+E(c.body)+'</p>':'')+(c.photo_path?'<a class="work-link" href="'+taskLink(id)+'">View attached photo →</a>':'')+'</div></div>').join(''):'<p class="work-muted">No comments yet. Start with an update.</p>';
 if(document.visibilityState!=='visible'||request!==taskRequest)return;
 await rest('field_task_reads?on_conflict=task_id,email',{method:'POST',body:{task_id:id,email:me},prefer:'resolution=merge-duplicates,return=minimal'});
 await rest('work_notifications?task_id=eq.'+encodeURIComponent(id)+'&recipient=eq.'+encodeURIComponent(me)+'&read_at=is.null&created_at=lte.'+encodeURIComponent(viewedAt),{method:'PATCH',body:{read_at:viewedAt},prefer:'return=minimal'});
 notifications.filter(n=>n.task_id===id&&n.created_at<=viewedAt).forEach(n=>n.read_at=viewedAt);badges();
 }catch(e){if(request===taskRequest&&host.isConnected)showError(e,host);}
}
const toolbar=document.createElement('div');toolbar.className='work-tools';toolbar.innerHTML='<button data-messages>Messages <span class="work-badge" data-msg-count></span></button><button data-alerts aria-label="Notifications">Alerts <span class="work-badge" data-alert-count></span></button>';
const bar=document.querySelector('#kdhBar .kdh-bar-in')||document.querySelector('#kdhBar')||document.querySelector('.kdh-bar');if(bar)bar.append(toolbar);else{toolbar.style.justifyContent='flex-end';document.body.prepend(toolbar);}
// Explicit source link: this plans work without changing the original program/survey.
if(U.role!=='associate' && /\/(hub|MPOs|isellbeer|redbull|carbliss-onprem-targets|nonbuy|exceptions)\//i.test(location.pathname)){
 const host=document.querySelector('main')||document.querySelector('#app');
 if(host){const link=document.createElement('a');link.className='work-link';link.textContent='Add to My Day';link.style.margin='8px 16px';
 link.onclick=()=>{const from=location.pathname+location.search+location.hash;const title=(document.querySelector('meta[name="kdh-page"]')||{}).content||document.title;const params=new URLSearchParams({title:'Follow up: '+title,source:'hub:'+from,from});link.href=url('tasks/?'+params+'#new');};link.href=url('tasks/#new');host.prepend(link);}
}
function openPanel(title){current=null;if(dialog)dialog.close();dialog=document.createElement('dialog');dialog.className='work-dialog';dialog.setAttribute('aria-label',title);dialog.innerHTML='<div class="work-head"><h2>'+E(title)+'</h2><button data-close aria-label="Close">Close</button></div><div data-work-error class="work-error" role="status"></div><div data-panel></div>';document.body.append(dialog);dialog.querySelector('[data-close]').onclick=()=>dialog.close();const d=dialog;d.addEventListener('close',()=>{if(dialog===d){dialog=null;current=null;}d.remove();});d.showModal();return d.querySelector('[data-panel]');}
function badges(){const unread=notifications.filter(n=>!n.read_at);toolbar.querySelector('[data-alert-count]').textContent=unread.length||'';const count=new Set(unread.filter(n=>n.conversation_id).map(n=>n.conversation_id)).size||'';toolbar.querySelector('[data-msg-count]').textContent=count;const badge=card&&card.querySelector('[data-card-msg-count]');if(badge)badge.textContent=count;}
toolbar.querySelector('[data-alerts]').onclick=()=>{const panel=openPanel('Notifications');panel.innerHTML='<div class="work-inbox">'+(notifications.length?notifications.map(n=>'<button class="'+(!n.read_at?'unread':'')+'" data-notice="'+n.id+'">'+E(n.label)+'<small class="work-muted"> · '+E(new Date(n.created_at).toLocaleString())+'</small></button>').join(''):'<p>No notifications yet.</p>')+'</div>';panel.querySelectorAll('[data-notice]').forEach(b=>b.onclick=async()=>{const n=notifications.find(n=>String(n.id)===b.dataset.notice);try{await rest('work_notifications?id=eq.'+n.id,{method:'PATCH',body:{read_at:new Date().toISOString()}});n.read_at=new Date().toISOString();badges();if(n.task_id)location.href=taskLink(n.task_id);else if(n.conversation_id){await loadInbox();const c=conversations.find(c=>c.id===n.conversation_id);if(c)await openConversation(c.person_a===me?c.person_b:c.person_a,c.id);}}catch(e){showError(e,dialog);}});};
let previews=[],messageDrafts=new Map(),messagePending=new Map(),threadRequest=0,inboxRequest=0;
async function loadInbox(){[people,conversations,reads,previews]=await Promise.all([rpc('kdh_work_people',{p_assign:false}),all('work_conversations?order=created_at.desc'),all('work_message_reads'),rest('work_messages?order=id.desc&limit=200')]);}
function renderInbox(){
 if(!dialog||!dialog.classList.contains('work-messaging'))return;
 const host=dialog.querySelector('[data-conversation-list]'),searchInput=dialog.querySelector('[data-inbox-search]');if(!host||!searchInput)return;const search=searchInput.value.trim().toLowerCase();
 const rows=conversations.map(c=>{const other=c.person_a===me?c.person_b:c.person_a,p=people.find(p=>p.email===other),latest=previews.find(m=>m.conversation_id===c.id);return {c,other,name:p?p.name:other,latest};}).sort((a,b)=>Number(b.latest?.id||0)-Number(a.latest?.id||0));
 const filtered=rows.filter(r=>r.name.toLowerCase().includes(search));
 host.innerHTML=filtered.length?filtered.map(({c,other,name,latest})=>{const unread=notifications.some(n=>n.conversation_id===c.id&&!n.read_at);return '<button class="work-person '+(current&&current.other===other?'work-person-selected ':'')+(unread?'unread':'')+'" data-conversation="'+E(c.id)+'" aria-pressed="'+!!(current&&current.other===other)+'">'+avatar(name)+'<span class="work-person-copy"><span class="work-person-top"><strong>'+E(name)+'</strong>'+(unread?'<span class="work-unread-dot" aria-label="Unread"></span>':'')+'</span><span class="work-preview">'+E(latest?(latest.author_email===me?'You: ':'')+latest.body:'Open conversation')+'</span><small>'+E(stamp(latest?.created_at||c.created_at))+'</small></span></button>';}).join(''):'<p class="work-empty">'+(search?'No matching conversations.':'No conversations yet. Start a new message above.')+'</p>';
 host.querySelectorAll('[data-conversation]').forEach(b=>b.onclick=()=>{const c=conversations.find(c=>c.id===b.dataset.conversation);openConversation(c.person_a===me?c.person_b:c.person_a,c.id);});
}
async function openMessages(other,id){
 const panel=openPanel('Messages'),owner=dialog;
 owner.classList.add('work-messaging');panel.innerHTML='<p class="work-empty">Loading conversations…</p>';const request=++inboxRequest;
 try{await loadInbox();if(dialog!==owner||request!==inboxRequest)return;
 panel.innerHTML='<div class="work-inbox-layout"><aside class="work-people"><div class="work-people-head"><h3>Conversations</h3><button data-new-message>+ New message</button><label class="work-sr-only" for="work-search">Search conversations</label><input id="work-search" data-inbox-search type="search" placeholder="Search people…" autocomplete="off"><div data-new-person hidden><label for="work-person">Message an employee</label><select id="work-person"><option value="">Choose a teammate…</option>'+people.filter(p=>p.email!==me).map(p=>'<option value="'+E(p.email)+'">'+E(p.name)+' · '+E(p.role)+'</option>').join('')+'</select></div></div><div data-conversation-list></div></aside><section class="work-chat" aria-label="Conversation"><div class="work-chat-empty"><h3>Your team, one conversation away.</h3><p>Select a conversation or start a new message.</p></div></section></div>';
 panel.querySelector('[data-inbox-search]').oninput=renderInbox;
 panel.querySelector('[data-new-message]').onclick=()=>{const picker=panel.querySelector('[data-new-person]');picker.hidden=false;panel.querySelector('select').focus();};
 panel.querySelector('#work-person').onchange=e=>{if(e.target.value){openConversation(e.target.value);panel.querySelector('[data-new-person]').hidden=true;e.target.value='';}};
 renderInbox();
 if(other)await openConversation(other,id);
 else if(conversations.length&&matchMedia('(min-width:761px)').matches){const c=conversations.find(c=>notifications.some(n=>n.conversation_id===c.id&&!n.read_at))||conversations[0];await openConversation(c.person_a===me?c.person_b:c.person_a,c.id);}
 else if(!conversations.length){panel.querySelector('[data-new-person]').hidden=false;}
 }catch(e){if(dialog===owner){panel.innerHTML='<p class="work-empty">Could not load your inbox. Close it and try again.</p>';showError(e,owner);}}
}
toolbar.querySelector('[data-messages]').onclick=()=>openMessages();
async function openConversation(other,id){
 if(!dialog||!dialog.classList.contains('work-messaging')){await openMessages(other,id);return;}
 const p=people.find(p=>p.email===other),name=p?p.name:other,owner=dialog,panel=owner.querySelector('.work-chat'),c=conversations.find(c=>c.person_a===other||c.person_b===other);
 const state=current={other,id:id||(c&&c.id),lastRead:0};owner.classList.add('work-thread-open');
 panel.innerHTML='<div class="work-chat-head"><button data-inbox-back aria-label="Back to conversations">‹</button>'+avatar(name)+'<div><h3>'+E(name)+'</h3><small>Direct message · only you and this person</small></div></div><div class="work-thread" role="log" aria-label="Messages" aria-live="polite">'+(!state.id?'<p class="work-chat-empty">Start the conversation.</p>':'')+'</div><form class="work-composer"><label class="work-sr-only" for="work-message">Message</label><textarea id="work-message" maxlength="2000" required placeholder="Write a message…" rows="2"></textarea><button class="work-primary">Send</button></form><p class="work-chat-hint">Keep account updates in the task conversation.</p>';
 panel.querySelector('[data-inbox-back]').onclick=()=>{owner.classList.remove('work-thread-open');current=null;renderInbox();owner.querySelector('[data-new-message]').focus();};
 const ta=panel.querySelector('textarea');ta.value=messageDrafts.get(other)||'';ta.oninput=()=>messageDrafts.set(other,ta.value);
 panel.querySelector('form').onsubmit=async e=>{e.preventDefault();const b=e.submitter,body=ta.value.trim();if(!body||b.disabled)return;
 let pending=messagePending.get(other);if(!pending||pending.body!==body){pending={body,id:uuid()};messagePending.set(other,pending);}b.disabled=true;
 try{const msg=await rpc('kdh_message_send',{p_to:other,p_body:body,p_client:pending.id});state.id=msg.conversation_id;messagePending.delete(other);messageDrafts.delete(other);
 if(!previews.some(m=>m.id===msg.id))previews.unshift(msg);
 if(!conversations.some(c=>c.id===state.id))conversations.unshift({id:state.id,person_a:me,person_b:other,created_at:msg.created_at});
 if(current===state&&dialog===owner){ta.value='';owner.querySelector('[data-work-error]').textContent='';await updateThread();const thread=panel.querySelector('.work-thread');thread.scrollTop=thread.scrollHeight;}renderInbox();await refresh();
 }catch(err){if(dialog===owner)showError(err,owner);}finally{b.disabled=false;}};
 renderInbox();await updateThread();
}
async function updateThread(){
 const state=current,owner=dialog;if(!state||!state.id||!owner)return;const request=++threadRequest;
 try{const rows=await all('work_messages?conversation_id=eq.'+state.id+'&order=id.asc');if(current!==state||dialog!==owner||request!==threadRequest)return;
 const thread=owner.querySelector('.work-thread');if(!thread)return;
 const atBottom=thread.scrollHeight-thread.scrollTop-thread.clientHeight<60,oldTop=thread.scrollTop,key=rows.map(m=>m.id).join(',');
 if(thread.dataset.rows!==key){thread.innerHTML=rows.map(m=>{const mine=m.author_email===me,name=mine?'You':(people.find(p=>p.email===m.author_email)||{}).name||m.author_email;return '<div class="work-msg '+(mine?'me':'')+'">'+(!mine?avatar(name):'')+'<div class="work-bubble"><p>'+E(m.body)+'</p><small>'+E(name)+' · '+E(stamp(m.created_at))+'</small></div></div>';}).join('')||'<p class="work-chat-empty">Start the conversation.</p>';thread.dataset.rows=key;thread.scrollTop=atBottom?thread.scrollHeight:oldTop;}
 if(rows.length&&document.visibilityState==='visible'&&thread.getClientRects().length&&state.lastRead<Number(rows[rows.length-1].id)){
 const last=rows[rows.length-1].id;await rpc('kdh_message_read',{p_conversation:state.id,p_last:last});state.lastRead=Number(last);
 notifications.filter(n=>n.conversation_id===state.id&&Number(n.event_key.split(':')[1])<=last).forEach(n=>n.read_at='read');badges();renderInbox();
 }
 }catch(e){if(dialog===owner&&current===state)showError(e,owner);}
}
async function refresh(force=false){if(refreshing){if(force)refreshQueued=true;return;}refreshing=true;try{const result=await Promise.all([all('work_notifications?order=created_at.desc,id.desc'),card?all('field_tasks?archived_at=is.null&order=created_at.asc,id.asc'):Promise.resolve([])]);notifications=result[0];tasks=result[1];badges();if(card&&(force||!card.contains(document.activeElement)))renderDay();if(dialog&&dialog.classList.contains('work-messaging')){const owner=dialog;const inbox=await Promise.all([all('work_conversations?order=created_at.desc'),rest('work_messages?order=id.desc&limit=200')]);if(dialog===owner){conversations=inbox[0];previews=inbox[1];renderInbox();}}if(current)await updateThread();}catch(e){if(dialog)showError(e,dialog);if(card){if(!card.querySelector('[data-work-error]')){card.className='work-card';card.innerHTML='<h2>My Day</h2><p data-work-error role="status"></p>';}showError(e);}}finally{refreshing=false;if(refreshQueued){refreshQueued=false;refresh(true);}}}
async function realtime(){try{if(!window.supabase)return;const c=window.KDH_AUTH;const client=window.supabase.createClient(c.url,c.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});await client.realtime.setAuth(token());let timer;client.channel('work-'+uuid()).on('postgres_changes',{event:'*',schema:'public',table:'work_notifications'},()=>{clearTimeout(timer);timer=setTimeout(refresh,200);}).on('postgres_changes',{event:'*',schema:'public',table:'field_tasks'},()=>{refresh();window.dispatchEvent(new Event('kdh:work-changed'));}).on('postgres_changes',{event:'INSERT',schema:'public',table:'work_messages'},()=>updateThread()).on('postgres_changes',{event:'INSERT',schema:'public',table:'field_task_comments'},()=>{window.dispatchEvent(new Event('kdh:work-changed'));if(card&&selectedTask){const host=card.querySelector('.work-detail');if(host&&!host.hidden)loadTaskComments(selectedTask,++taskRequest,host);}}).subscribe();document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')client.realtime.setAuth(token());});setInterval(()=>client.realtime.setAuth(token()),60000);window.addEventListener('pagehide',()=>client.removeAllChannels());}catch(e){/* polling remains authoritative */}}
window.KdhWork={rest,rpc,refresh,day,taskLink};
async function boot(){if(!window.KDH_AUTH){const s=document.createElement('script');s.src=url('shared/auth-config.js');await new Promise(resolve=>{s.onload=s.onerror=resolve;document.head.append(s);});}await refresh();const sdk=document.createElement('script');sdk.src=url('shared/vendor/supabase-2.57.4.js');sdk.onload=realtime;document.head.append(sdk);setInterval(()=>{if(document.visibilityState==='visible'&&!busy)refresh();},30000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh();});window.addEventListener('online',()=>refresh());}
boot();
})();
