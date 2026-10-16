/* Source adapter: consumers receive normalized records, independent of CSV or a future service. */
(function(g){
  'use strict';
  const fields={productId:'Product ID',name:'Product Name',brand:'Brand',brandFamily:'Brand Family',supplier:'Supplier',package:'Package',productType:'Product Type',status:'Status'};
  const normalize=s=>String(s||'').toLocaleLowerCase();
  function catalog(products,source=''){
    const byId=new Map();
    products.forEach(p=>{if(typeof p.productId!=='string'||!p.productId||byId.has(p.productId))throw Error('Catalog Product IDs must be unique and nonblank.');byId.set(p.productId,Object.freeze({...p}));});
    const records=Object.freeze([...byId.values()]);
    return {source,records,get:id=>byId.get(String(id)),values:key=>[...new Set(records.map(p=>p[key]).filter(Boolean))].sort((a,b)=>a.localeCompare(b)),
      search(query='',filters={},field='all'){
        const q=normalize(query).trim();
        const found=records.filter(p=>Object.entries(filters).every(([k,v])=>!v||p[k]===v)&&(!q||(field==='all'?Object.keys(fields):[field]).some(k=>normalize(p[k]).includes(q))));
        return found.sort((a,b)=>(Number(normalize(b.productId)===q)-Number(normalize(a.productId)===q))||a.name.localeCompare(b.name)||a.productId.localeCompare(b.productId));
      }};
  }
  async function load(url){const response=await fetch(url);if(!response.ok)throw Error('The product catalog could not be loaded. Please try again.');const data=await response.json();return catalog(data.products,data.source);}
  function snapshot(p,source){return {...p,catalogSource:source,description:'',date:'',photo:null,logo:null};}
  g.KdhProductCatalog={fields,catalog,load,snapshot};
})(typeof window!=='undefined'?window:globalThis);
