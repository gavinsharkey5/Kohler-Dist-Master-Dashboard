(async function(){
'use strict';
const box=document.getElementById('brandFitApp'),B=window.KdhBrandFit,F=window.KdhBrandFitEngine,E=B.E;
const u=window.kdhUser?.();
if(u?.role!=='manager'||u.preview){box.innerHTML='<h1>Brand Fits</h1><p>Managers Only</p>';return;}
let data,scope,index,catalog,products,permissions,accounts=[],histories={},brandScope=null,selectedRep='';
async function json(p){const r=await fetch(p,{cache:'no-store'});if(!r.ok)throw Error('Account or product data is unavailable. Try again.');return r.json();}
function withinBrands(p){return !brandScope||brandScope.includes(p[2])||brandScope.includes(p[3]);}
function render(){
  const ac=accounts.filter(a=>!selectedRep||a.rep===selectedRep);
  const s=F.summarize(ac,{...data,catalog:catalog.products,permissions,histories,ref:index.salesRef,products:products.products,brands:brandScope});
  const families=[...new Set(catalog.products.filter(withinBrands).map(p=>p[3]).filter(Boolean))].sort();
  box.innerHTML=`<a href="./">← Accounts</a><h1>Brand Fits</h1><p class="bf-note">${E(F.periodLabel(index.months,index.salesRef))} · ${E(scope.admin?'All Reps':scope.team===null?'Assigned Brands':'Your Team')}</p>
    <div class="bf-card bf-kpis"><div><strong>${ac.length}</strong><span>Accounts</span></div><div><strong>${s.tagged}</strong><span>Tagged</span></div><div><strong>${s.untagged}</strong><span>Not Tagged</span></div></div>
    <label>Rep<select id="bfRep"><option value="">All Authorized Reps</option>${[...new Set(accounts.map(a=>a.rep))].sort().map(r=>`<option ${r===selectedRep?'selected':''}>${E(r)}</option>`).join('')}</select></label>
    <section class="bf-card"><h2>Missing Brands By Account Type</h2>${s.rows.length?s.rows.map((r,i)=>`<details><summary>${E(r.type)} · ${E(r.family)} · ${r.missing} Missing</summary><div class="bf-row"><span><b>Eligible</b> ${r.eligible}</span><span><b>Buying</b> ${r.buying}</span><span><b>History Unavailable</b> ${r.unknown}</span></div><div class="bf-detail">${r.accounts.map(a=>`<a href="./#acct=${encodeURIComponent(a.n)}&rep=${encodeURIComponent(a.rep)}&sec=products">${E(a.name)}<span class="bf-note"> · ${E(a.rep)}</span></a>`).join('')||'<p>No missing brands in this group.</p>'}</div></details>`).join(''):'<p>No tagged, eligible accounts yet.</p>'}<details><summary>Definitions</summary><p class="bf-note">Buying = positive net brand-family cases in the last 3 complete months. Only carried products with confirmed territory permission count. Untagged accounts are excluded; unavailable history is never counted as missing. Account types are manager-verified tags, separate from Encompass Customer Type.</p></details></section>
    <section class="bf-card"><h2>Account Types &amp; Brands</h2>${data.types.map(t=>`<details><summary>${E(t.label)}</summary><p>${t.families.map(E).join(' · ')||'No Brands Assigned'}</p><button class="btn outline" data-edit="${E(t.id)}">Edit Mapping</button></details>`).join('')}<button class="btn" id="bfNew">Add Account Type</button><div id="bfEditor"></div><p role="status" id="bfStatus"></p></section>`;
  box.querySelector('#bfRep').onchange=e=>{selectedRep=e.target.value;render();};
  box.querySelector('#bfNew').onclick=()=>edit(null);
  box.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>edit(data.types.find(t=>t.id===b.dataset.edit)));
  function edit(t){
    const area=box.querySelector('#bfEditor');
    // An assigned brand manager may edit only mappings fully within their scope.
    if(t&&brandScope&&t.families.some(f=>!families.includes(f))){box.querySelector('#bfStatus').textContent='This mapping includes brands outside your assignment.';return;}
    area.innerHTML=`<form id="bfMapping"><div class="bf-form"><label>Account Type<input name="label" maxlength="60" required value="${E(t?.label||'')}"></label><label>Brand Families<select multiple name="families" aria-label="Brand Families" aria-describedby="bfMulti">${[...new Set([...families,...(t?.families||[])])].sort().map(f=>`<option ${t?.families.includes(f)?'selected':''}>${E(f)}</option>`).join('')}</select></label></div><p id="bfMulti" class="bf-note">Choose one or more brand families. Saving a mapping does not tag accounts.</p><div class="bf-actions"><button class="btn">Save Mapping</button><button type="button" class="btn outline" id="bfCancel">Cancel</button></div><p role="status"></p></form>`;
    area.querySelector('input').focus();area.querySelector('#bfCancel').onclick=()=>area.replaceChildren();
    area.querySelector('form').onsubmit=async e=>{
      e.preventDefault();const form=e.currentTarget,msg=form.querySelector('[role=status]'),button=form.querySelector('button');
      const label=form.elements.label.value.trim(),chosen=[...form.elements.families.selectedOptions].map(x=>x.value);
      if(!label||!chosen.length){msg.textContent='Enter an account type and choose at least one brand family.';return;}
      if(chosen.some(f=>!families.includes(f))){msg.textContent='Choose carried brands in your assignment.';return;}
      button.disabled=true;msg.textContent='Saving…';
      try{await B.write('account_fit_types',t?'PATCH':'POST',{label,families:chosen},t?'?id=eq.'+encodeURIComponent(t.id):'');data=await B.load();render();box.querySelector('#bfStatus').textContent='Mapping Saved';}
      catch(err){msg.textContent=err.message;button.disabled=false;}
    };
  }
}
async function boot(){
  box.innerHTML='<h1>Brand Fits</h1><p role="status">Loading your account scope…</p>';
  try{
    [data,scope,index,catalog,products,permissions]=await Promise.all([B.load(),B.rest('rpc/kdh_program_scope','POST',{}),json('data/index.json'),json('data/catalog.json'),json('data/products.json'),B.permissions(HUB_BRANDS)]);
    if(!scope?.manager)throw Error('Your manager scope is unavailable.');
    if(!scope.admin && (!('team' in scope)||!('brands' in scope)))throw Error('Your manager scope is unavailable.');
    brandScope=scope.admin||scope.hybrid?null:scope.brands;
    const names=scope.admin||scope.team===null?null:(scope.team||[]);
    const reps=index.reps.filter(r=>!names||names.some(n=>n===r.rep||window.kdhMatchName?.(n,[r.rep])));
    if(!reps.length||brandScope?.length===0){box.innerHTML='<h1>Brand Fits</h1><p>No team or brands are assigned to this sign-in.</p>';return;}
    accounts=[];histories={};
    await Promise.all(reps.map(async r=>{
      const [book,h]=await Promise.all([json('data/reps/'+r.key+'.json'),json('data/hist/'+r.key+'.json').catch(()=>null)]);
      (book.accounts||[]).forEach(a=>accounts.push({...a,rep:r.rep,repKey:r.key}));histories[r.key]=h;
    }));
    render();
  }catch(err){box.innerHTML=`<h1>Brand Fits</h1><p role="status">${E(err.message)}</p><button class="btn">Retry</button>`;box.querySelector('button').onclick=boot;}
}
await boot();
})();
