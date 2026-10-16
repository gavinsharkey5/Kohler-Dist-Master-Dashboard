/* Reusable accessible catalog picker. The caller owns saving and newsletter permissions. */
(function(g){
  'use strict';
  const C=g.KdhProductCatalog,esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function open({catalog,selectedIds=[],limit=200}){
    const chosen=new Set(selectedIds.filter(id=>catalog.get(id))),filters={},expanded=new Set();let query='',field='all',group='brand',shown=40;
    const dialog=document.createElement('dialog');dialog.className='kdh-product-picker';dialog.setAttribute('aria-labelledby','kdhPickerTitle');
    dialog.innerHTML=`<header><h2 id="kdhPickerTitle">Select newsletter products</h2><p>Search the catalog or expand a brand to select individual SKUs. Your descriptions and photos stay with the newsletter.</p></header><div class="kdh-picker-filters"><label>Search products<input type="search" data-search placeholder="Product ID, name, brand, or supplier" autocomplete="off"></label><label>Search field<select data-field><option value="all">All fields</option>${Object.entries(C.fields).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label>${['brandFamily','brand','supplier','package','productType','status'].map(k=>`<label>${C.fields[k]}<select data-filter="${k}"><option value="">All</option>${catalog.values(k).map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select></label>`).join('')}<label>Group results by<select data-group><option value="brand">Brand</option><option value="brandFamily">Brand Family</option><option value="none">Individual SKUs</option></select></label></div><p data-summary role="status" aria-live="polite"></p><p data-warning role="alert" hidden></p><div class="kdh-picker-columns"><div data-results class="kdh-picker-results"></div><aside><h3>Selected products</h3><div data-selected></div></aside></div><footer><button type="button" data-cancel>Cancel</button><button type="button" data-apply>Apply selection</button></footer>`;
    document.body.append(dialog);
    const results=dialog.querySelector('[data-results]'),selected=dialog.querySelector('[data-selected]'),warning=dialog.querySelector('[data-warning]');
    const matches=()=>catalog.search(query,filters,field);
    function row(p){return `<label class="kdh-picker-sku"><input type="checkbox" data-id="${esc(p.productId)}" ${chosen.has(p.productId)?'checked':''}><span><strong>${esc(p.name)}</strong><small>ID ${esc(p.productId)} · ${esc(p.package)} · ${esc(p.status)}</small></span></label>`;}
    function render(){
      const active=document.activeElement,focusKey=active&&['id','remove','expand','selectGroup','more'].find(k=>active.dataset&&active.dataset[k]!==undefined),focusValue=focusKey&&active.dataset[focusKey];
      const found=matches();let count;
      const exact=catalog.get(query.trim());if(exact&&group!=='none'&&found.some(p=>p.productId===exact.productId))expanded.add(exact[group]||'(Unspecified)');
      if(group==='none'){count=found.length;results.innerHTML=found.slice(0,shown).map(row).join('');}
      else{const groups=new Map();found.forEach(p=>{const key=p[group]||'(Unspecified)';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);});count=groups.size;results.innerHTML=[...groups].slice(0,shown).map(([key,items])=>{
        const selectedCount=items.filter(p=>chosen.has(p.productId)).length;
        return `<div class="kdh-picker-group"><div class="kdh-picker-group-head"><button type="button" data-expand="${esc(key)}" aria-expanded="${expanded.has(key)}">${expanded.has(key)?'−':'+'} ${esc(key)} <small>${items.length} SKUs</small></button><button type="button" data-select-group="${esc(key)}">${selectedCount===items.length?'Deselect':'Select'} matching SKUs</button></div>${expanded.has(key)?items.map(row).join(''):''}</div>`;
      }).join('');}
      if(!count)results.innerHTML='<p>No products match your search.</p>';
      if(count>shown)results.innerHTML+='<button type="button" data-more>Show more results</button>';
      dialog.querySelector('[data-summary]').textContent=`${found.length.toLocaleString()} matching products · ${chosen.size} selected · ${limit} maximum per section`;
      selected.innerHTML=[...chosen].map(id=>{const p=catalog.get(id);return `<div class="kdh-picker-selected"><span>${esc(p.name)}<small>ID ${esc(id)} · ${esc(p.package)}</small></span><button type="button" data-remove="${esc(id)}" aria-label="Remove ${esc(p.name)}">Remove</button></div>`;}).join('')||'<p>No products selected.</p>';
      if(focusKey){const target=[...dialog.querySelectorAll('button,input')].find(el=>el.dataset[focusKey]===focusValue);(target||dialog.querySelector('[data-search]')).focus();}
    }
    function change(ids,on){const next=new Set(chosen);ids.forEach(id=>on?next.add(id):next.delete(id));if(next.size>limit){warning.textContent=`Select up to ${limit} catalog products for this section. Narrow your filters or select individual SKUs.`;warning.hidden=false;render();return;}chosen.clear();next.forEach(id=>chosen.add(id));warning.hidden=true;render();}
    render();dialog.showModal();dialog.querySelector('[data-search]').focus();
    return new Promise(resolve=>{
      function finish(value){dialog.close();dialog.remove();resolve(value);}
      dialog.addEventListener('cancel',e=>{e.preventDefault();finish(null);});
      dialog.addEventListener('input',e=>{if(e.target.matches('[data-search]')){query=e.target.value;shown=40;const found=matches();if(found.length<=40&&group!=='none')found.forEach(p=>expanded.add(p[group]||'(Unspecified)'));render();}});
      dialog.addEventListener('change',e=>{const t=e.target;if(t.dataset.id){change([t.dataset.id],t.checked);return;}if(!t.matches('select'))return;if(t.dataset.filter){filters[t.dataset.filter]=t.value;shown=40;}if(t.hasAttribute('data-field'))field=t.value;if(t.hasAttribute('data-group'))group=t.value;render();});
      dialog.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-cancel'))finish(null);else if(b.hasAttribute('data-apply'))finish([...chosen].map(id=>catalog.get(id)));else if(b.dataset.remove)change([b.dataset.remove],false);else if(b.hasAttribute('data-more')){shown+=40;render();}else if(b.dataset.expand){expanded.has(b.dataset.expand)?expanded.delete(b.dataset.expand):expanded.add(b.dataset.expand);render();}else if(b.dataset.selectGroup){const ids=matches().filter(p=>(p[group]||'(Unspecified)')===b.dataset.selectGroup).map(p=>p.productId);change(ids,!ids.every(id=>chosen.has(id)));}});
    });
  }
  g.KdhProductSelector={open};
})(window);
