/* Supabase with the viewer's token; no local substitute for saved account tags. */
(function(g){
'use strict';
const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const user=()=>g.kdhUser?g.kdhUser():null;
const canEdit=()=>user()?.role==='manager'&&!user()?.preview;
const permissionURL=new URL('data/brand-fit-permissions.json?v=20261023p5b',document.currentScript.src).href;
async function permissions(base){
  const r=await fetch(permissionURL,{cache:'no-store'});
  if(!r.ok)throw Error('Brand permissions are unavailable. Try again.');
  const extra=await r.json();
  return {...base,families:{...(base?.families||{}),...extra.families}};
}
function cookie(n){const m=document.cookie.match(new RegExp('(?:^|;\\s*)'+n+'=([^;]*)'));return m?decodeURIComponent(m[1]):'';}
async function rest(path,method='GET',body){
  const c=g.KDH_AUTH||{},token=cookie('kdh_at');
  if(!c.url||!c.key||!token)throw Error('Sign in to load Brand Fits.');
  const r=await fetch(c.url.replace(/\/$/,'')+'/rest/v1/'+path,{method,headers:{apikey:c.key,authorization:'Bearer '+token,accept:'application/json',...(body?{'content-type':'application/json'}:{}),...(method!=='GET'?{Prefer:'return=representation'}:{})},body:body?JSON.stringify(body):undefined});
  const d=await r.json().catch(()=>null);
  if(!r.ok){if(['42P01','PGRST205'].includes(d?.code))throw Error('Brand Fits setup is pending.');throw Error(r.status===403?'You cannot change these Brand Fits.':'Brand Fits could not be loaded or saved. Try again.');}
  return d;
}
async function all(table,select){
  const out=[];for(let offset=0;;offset+=500){const d=await rest(table+'?select='+select+'&order='+ (table==='account_fit_types'?'id':'customer_num,type_id')+'&limit=500&offset='+offset);if(!Array.isArray(d))throw Error('Brand Fits returned an invalid response.');out.push(...d);if(d.length<500)return out;}
}
async function load(n){
  const [types,tags]=await Promise.all([all('account_fit_types','id,label,families'),n?rest('account_fit_tags?select=customer_num,type_id&customer_num=eq.'+encodeURIComponent(n)):all('account_fit_tags','customer_num,type_id')]);
  return {types,tags};
}
async function write(table,method,body,filter=''){
  if(!canEdit())throw Error('Editing is off in preview.');
  const d=await rest(table+filter,method,body);
  if(!Array.isArray(d)||d.length!==1)throw Error('The change was not saved. Reload and try again.');
  return d[0];
}
async function mount(box,{a,sales,catalog,permissions}){
  if(!box)return;
  box.innerHTML='<h2>Brands That Fit</h2><p role="status">Loading Brand Fits…</p>';
  try{
    const [data,confirmed]=await Promise.all([load(String(a.n)),g.KdhBrandFit.permissions(permissions)]);if(!box.isConnected)return;
    const months=sales?.months||[],ref=sales?.ref||'';
    const history=sales?Object.fromEntries((sales.products||[]).map(p=>[String(p[0]),p[5]])):null;
    const products=sales?(sales.products||[]).map(p=>[p[0],p[1],p[3],p[2]]):[];
    const selected=new Set(data.tags.map(t=>t.type_id));
    const rr=g.KdhBrandFitEngine.rows({account:a,...data,catalog:catalog.products,permissions:confirmed,history,months,ref,products});
    const period=g.KdhBrandFitEngine.periodLabel(months,ref);
    box.innerHTML=`<h2>Brands That Fit</h2><p>${selected.size?data.types.filter(t=>selected.has(t.id)).map(t=>E(t.label)).join(' · '):'Account Type Not Tagged'}</p>`+
      (rr.length?`<p class="bf-note">Buying Window · ${E(period)}</p><div class="bf-rows">${rr.map(r=>`<div class="bf-row"><strong>${E(r.family)}</strong><span class="bf-status ${r.known&&!r.buying?'bf-pitch':''}">${r.known?(r.buying?'Buying':'Pitch Idea'):'History Unavailable'}</span></div>`).join('')}</div>`:`<p class="bf-note">${selected.size?'No mapped brands have confirmed permission here.':'Assign a verified account type to see pitch ideas.'}</p>`)+
      (canEdit()?`<details><summary>Edit Account Types</summary><form class="bf-tags"><fieldset><legend>Verified Account Types</legend>${data.types.map(t=>`<label class="bf-check"><input type="checkbox" value="${E(t.id)}" ${selected.has(t.id)?'checked':''}>${E(t.label)}</label>`).join('')}</fieldset><button class="btn" ${data.types.length?'':'disabled'}>Save Account Types</button><p role="status"></p></form><a href="brand-fit.html">Manage Types &amp; Brands</a></details>`:'');
    box.querySelector('form')?.addEventListener('submit',async e=>{
      e.preventDefault();const f=e.currentTarget,msg=f.querySelector('[role=status]'),button=f.querySelector('button');button.disabled=true;msg.textContent='Saving…';
      try{
        // Individual acknowledged writes; reload on error also reveals any partial save.
        for(const input of f.querySelectorAll('input')){
          if(input.checked===selected.has(input.value))continue;
          const body={customer_num:String(a.n),type_id:input.value};
          await write('account_fit_tags',input.checked?'POST':'DELETE',input.checked?body:undefined,input.checked?'':'?customer_num=eq.'+encodeURIComponent(a.n)+'&type_id=eq.'+encodeURIComponent(input.value));
          if(input.checked)selected.add(input.value);else selected.delete(input.value);
        }
        await mount(box,{a,sales,catalog,permissions});box.querySelector('details')?.setAttribute('open','');const status=box.querySelector('[role=status]');if(status)status.textContent='Saved';
      }catch(err){msg.textContent=err.message+' Reload to check any completed changes.';button.disabled=false;}
    });
  }catch(err){if(!box.isConnected)return;box.innerHTML=`<h2>Brands That Fit</h2><p role="status">${E(err.message)}</p><button class="btn outline">Retry</button>`;box.querySelector('button').onclick=()=>mount(box,{a,sales,catalog,permissions});}
}
g.KdhBrandFit={E,load,rest,write,canEdit,mount,permissions};
})(window);
