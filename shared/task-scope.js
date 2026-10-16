/* Display-only preview scope. Database RLS remains authoritative for every request. */
(function(g){
 'use strict';
 const key=s=>String(s||'').trim().toLowerCase();
 function create(u,people,roster){
  const candidates=(people||[]).filter(p=>p.role===u.role&&(key(p.name)===key(u.name)||g.kdhMatchName&&g.kdhMatchName(u.name,[p.name])));
  const target=u.previewEmail?candidates.find(p=>key(p.email)===key(u.previewEmail)):candidates.length===1?candidates[0]:null;
  if(!target)throw Error('This preview could not be matched to one employee account. Exit preview and select the person again.');
  const email=key(target.email),names=new Set([key(target.name)]),team=new Set(),reps=new Set();
  if(u.role==='manager'){
   let changed=true;while(changed){changed=false;(roster||[]).forEach(p=>{if(names.has(key(p.reports_to))&&!names.has(key(p.name))){names.add(key(p.name));changed=true;}});}
   (people||[]).forEach(p=>{if(names.has(key(p.name))&&key(p.email)!==email){team.add(key(p.email));if(p.role==='rep')reps.add(key(p.email));}});
  }
  const mine=t=>key(t.associate_email)===email;
  const visible=t=>!t.archived_at&&(mine(t)||key(t.rep_email)===email||u.role==='manager'&&(team.has(key(t.rep_email))||reps.has(key(t.associate_email))));
  return {email,mine,visible};
 }
 g.KdhTaskScope={create};
})(typeof window==='undefined'?globalThis:window);
