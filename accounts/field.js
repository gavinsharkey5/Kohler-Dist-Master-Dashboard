/* Associate account directory: all customers, photos, and RLS-scoped tasks. */
(function(){
'use strict';
const app=document.getElementById('fieldAccounts'),U=window.kdhUser?window.kdhUser():null;
const E=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let accounts=[],catalog=[],limit=80,revision=0;const filters={q:'',prem:'',rep:''};
const get=async url=>{const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error('Account data could not be loaded. Please try again.');return r.json();};
function listing(){
 app.innerHTML='<header class="field-head"><h1>Accounts</h1><p>Find any customer account, add photos, and open your assigned tasks.</p></header><div class="field-filters"><label>Search accounts<input type="search" id="fieldSearch" placeholder="Name, account number, city or address" value="'+E(filters.q)+'"></label><label>Premise<select id="fieldPrem"><option value="">All premises</option><option value="On">On-premise</option><option value="Off">Off-premise</option></select></label><label>Sales rep<select id="fieldRep"><option value="">All sales reps</option>'+[...new Set(accounts.map(a=>a.rep).filter(Boolean))].sort().map(n=>'<option value="'+E(n)+'">'+E(n)+'</option>').join('')+'</select></label></div><p id="fieldCount"></p><div class="field-list" id="fieldList"></div><button class="btn outline" id="fieldMore" type="button">Show more accounts</button>';
 document.getElementById('fieldPrem').value=filters.prem;document.getElementById('fieldRep').value=filters.rep;
 document.getElementById('fieldSearch').addEventListener('input',e=>{filters.q=e.target.value;limit=80;rows();});
 for(const [id,key] of [['fieldPrem','prem'],['fieldRep','rep']])document.getElementById(id).addEventListener('change',e=>{filters[key]=e.target.value;limit=80;rows();});
 document.getElementById('fieldMore').addEventListener('click',()=>{limit+=80;rows();});rows();
}
function rows(){
 const q=filters.q.trim().toLowerCase().split(/\s+/).filter(Boolean),found=accounts.filter(a=>(!filters.prem||a.prem===filters.prem)&&(!filters.rep||a.rep===filters.rep)&&q.every(t=>[a.n,a.name,a.city,a.address,a.rep].join(' ').toLowerCase().includes(t)));
 document.getElementById('fieldCount').textContent=found.length+(found.length===1?' account':' accounts')+(found.length>limit?' · showing '+limit:'');
 document.getElementById('fieldList').innerHTML=found.slice(0,limit).map(a=>'<a class="field-account" href="#acct='+encodeURIComponent(a.n)+'"><b>'+E(a.name)+'</b><span>'+E(['#'+a.n,a.city,a.prem==='On'?'On-premise':a.prem==='Off'?'Off-premise':''].filter(Boolean).join(' · '))+'</span><span>'+E(a.address)+'</span><span>'+E(a.rep)+'</span></a>').join('')||'<p>No accounts match your search.</p>';
 document.getElementById('fieldMore').hidden=found.length<=limit;
}
async function render(){
 const current=++revision,n=new URLSearchParams(location.hash.slice(1)).get('acct');
 if(!n){listing();return;}
 const a=accounts.find(a=>a.n===n);
 if(!a){app.innerHTML='<a class="field-back" href="#">← Accounts</a><div class="kdh-state">Account not found.</div>';return;}
 app.innerHTML='<a class="field-back" href="#">← Accounts</a><header class="field-head"><h1>'+E(a.name)+'</h1><p>'+E(['#'+a.n,a.address,a.city,a.rep].filter(Boolean).join(' · '))+'</p></header><section class="field-section"><h2>Assigned Tasks</h2><div class="card" id="fieldTasks">Loading tasks…</div></section><section class="field-section"><h2>Photos &amp; Merchandising</h2><div class="card" id="actPhotosAll">Loading photos…</div></section>';
 const ctx={n:a.n,name:a.name,area:a.area,prem:a.prem,rep:a.rep,me:U,readOnly:!!(U&&U.preview),readOnlyWhy:'Saving is off in preview.',isMgr:false,extra:{catalog,bought:[],opps:[]},progName:s=>s,hubLink:()=>''};
 const st=await window.KdhActivity.load(a.n,true);if(current!==revision)return;
 const tasks=(st.tasks||[]).filter(t=>!U?.preview||(t.associate_email||'').toLowerCase()===(U.previewEmail||'').toLowerCase()),box=document.getElementById('fieldTasks');
 box.innerHTML=st.tasksError?'<p>Tasks could not be loaded. <a href="../tasks/">Open Field Tasks</a></p>':tasks.map(t=>'<a class="field-task" href="../tasks/#task='+encodeURIComponent(t.id)+'"><b>'+E(t.title)+'</b><span>'+E({assigned:'Assigned',in_progress:'In Progress',done:'Done',blocked:'Blocked'}[t.status]||t.status)+'</span></a>').join('')||'<p>No tasks assigned to you for this account. <a href="../tasks/">View all your tasks</a></p>';
 await window.KdhActivity.attach(ctx);if(window.kdhSyncNav)window.kdhSyncNav();
}
async function start(){
 try{const directory=await get('../api/field-accounts');accounts=directory.accounts||[];
 catalog=(await get('data/catalog.json').catch(()=>({products:[]}))).products||[];
 await render();window.addEventListener('hashchange',()=>render().catch(showError));
 }catch(e){showError(e);}
}
function showError(e){app.innerHTML='<div class="kdh-state"><p>'+E(e.message||'Accounts could not be loaded.')+'</p><button class="btn" id="fieldRetry">Try again</button></div>';document.getElementById('fieldRetry').onclick=()=>location.reload();}
start();
})();
