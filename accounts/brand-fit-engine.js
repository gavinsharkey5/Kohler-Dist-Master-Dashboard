/* Account types are explicit manager tags. No inference from names, chains or classes.
   Buying = positive net brand-family cases in the latest three complete months. */
(function(g){
'use strict';
function windowMonths(months,ref){
  if(!/^\d{4}-\d{2}$/.test(ref||'')) return [];
  const [y,m]=ref.split('-').map(Number),out=[];
  for(let i=2;i>=0;i--){const d=new Date(Date.UTC(y,m-1-i,1));out.push(d.toISOString().slice(0,7));}
  return out.every(x=>months.includes(x))?out:[];
}
function periodLabel(months,ref){
  const p=windowMonths(months,ref);if(!p.length)return 'Window Unavailable';
  const names=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return names[Number(p[0].slice(5))-1]+(p[0].slice(0,4)===p[2].slice(0,4)?'':' '+p[0].slice(0,4))+'–'+names[Number(p[2].slice(5))-1]+' '+p[2].slice(0,4);
}
function eligible(a,p,permissions){
  const status=permissions?.families?.[p[3]]?.areas?.[a.area];
  if(status!=='CAN SELL') return false; // unknown permission is never a pitch
  return !/whole foods/i.test(a.name||'') || /non.?alcoholic|\bN\/?A\b|alcohol.?free|0\.0%|0\.5%/i.test(p[1]);
}
function rows({account,types,tags,catalog,permissions,history,months,ref,products,brands=null}){
  const selected=new Set(tags.filter(t=>String(t.customer_num)===String(account.n)).map(t=>t.type_id));
  const period=windowMonths(months||[],ref),idx=period.map(m=>months.indexOf(m));
  const known=!!history && period.length===3;
  const out=[];
  types.filter(t=>selected.has(t.id)).forEach(t=>{
    [...new Set(t.families||[])].forEach(family=>{
      const carried=catalog.filter(p=>p[3]===family && (!brands || brands.includes(p[2]) || brands.includes(p[3])));
      const allowed=carried.filter(p=>eligible(account,p,permissions));
      if(!allowed.length) return;
      // All historical SKUs count toward family buying, even a discontinued package.
      let hundredths=0;
      (products||catalog).filter(p=>p[3]===family).forEach(p=>{
        const s=history?.[String(p[0])];idx.forEach(i=>{hundredths+=Math.round(Number(s?.[i]||0)*100);});
      });
      out.push({type:t.label,typeId:t.id,family,known,buying:known&&hundredths>0,products:allowed.map(p=>String(p[0]))});
    });
  });
  return out;
}
function summarize(accounts,options){
  const result=new Map();let tagged=0,unknown=0;
  const ids=new Set(options.types.map(t=>t.id));
  const taggedIds=new Set(options.tags.filter(t=>ids.has(t.type_id)).map(t=>String(t.customer_num)));
  accounts.forEach(a=>{
    if(taggedIds.has(String(a.n))) tagged++;
    const h=options.histories[a.repKey];
    const rr=rows({...options,account:a,history:h?.accounts?.[String(a.n)] || (h?.accounts?{}:null),months:h?.months||[],ref:options.ref});
    rr.forEach(r=>{
      const k=r.typeId+'|'+r.family;
      if(!result.has(k))result.set(k,{type:r.type,typeId:r.typeId,family:r.family,eligible:0,buying:0,missing:0,unknown:0,accounts:[]});
      const v=result.get(k);v.eligible++;
      if(!r.known){v.unknown++;unknown++;}else if(r.buying)v.buying++;else{v.missing++;v.accounts.push(a);}
    });
  });
  return {rows:[...result.values()].sort((a,b)=>b.missing-a.missing||a.type.localeCompare(b.type)||a.family.localeCompare(b.family)),tagged,untagged:accounts.length-tagged,unknown};
}
g.KdhBrandFitEngine={windowMonths,periodLabel,eligible,rows,summarize};
})(typeof window!=='undefined'?window:globalThis);
