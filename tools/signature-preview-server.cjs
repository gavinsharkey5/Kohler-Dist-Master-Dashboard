/* Local visual QA of the REAL pages, with synthetic API fixtures only.
   node tools/signature-preview-server.cjs · tools/ is excluded from deployment.
   Sign in locally at /__review/as/manager, /__review/as/finance, /__review/as/rep.
   No credentials or live Supabase connections are used. */
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),port=Number(process.env.KDH_REVIEW_PORT||8770);
const people={manager:{name:'Preview Manager',email:'manager@example.test',role:'manager',title:'Sales Manager',upc:1,pa:1},finance:{name:'Preview Finance',email:'finance@example.test',role:'manager',ws:'finance',title:'Finance'},rep:{name:'Preview Rep',email:'rep@example.test',role:'rep',title:'Sales Representative'},associate:{name:'Preview Associate',email:'associate@example.test',role:'associate'},it:{name:'Preview IT',email:'it@example.test',role:'it'}};
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const account={id:'10000000-0000-0000-0000-000000000001',year:2026,account:'Example supplier account',supplier:'Example Supplier',brand_manager:'Preview Manager',code:'423001',description:'Marketing allocation',budget_amount:25000,active:true,billback_rule:'split'};
const expenses=[['1234567','Fall display materials',480,240,false],['1234568','Account activation',250,125,false],['1234569','Printed point of sale',625,312.5,true],['1234570','October samples',200,100,true]].map((e,i)=>({id:'20000000-0000-0000-0000-00000000000'+(i+1),account_id:account.id,year:2026,expense_date:'2026-10-'+(12+i),invoice:e[0],vendor:i%2?'Kohler Distributing':'Custom Vendor',items_purchased:e[1],total_amount:e[2],billback_amount:e[3],kohler_spend:e[2]-e[3],billback_received:e[4],received_date:e[4]?'2026-10-16':null,source:'site',created_at:'2026-10-16T10:00:00Z',entered_by_name:'Preview Finance',notes:'Synthetic design review example'}));
const docs=[{id:'30000000-0000-0000-0000-000000000001',expense_id:expenses[0].id,file_name:'1234567 Example.pdf',size_bytes:126797,sha256:'0'.repeat(64),storage_path:expenses[0].id+'/30000000-0000-0000-0000-000000000001.pdf',uploaded_name:'Preview Finance',created_at:'2026-10-16T10:00:00Z'}];
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.ttf':'font/ttf','.woff2':'font/woff2','.json':'application/json','.csv':'text/csv'};
function json(res,data,status=200){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));}
http.createServer((req,res)=>{
 const origin='http://127.0.0.1:'+port,url=new URL(req.url,origin),p=decodeURIComponent(url.pathname);
 if(p.startsWith('/__review/as/')){const who=people[p.split('/').pop()];if(!who)return json(res,{},404);res.writeHead(302,{'set-cookie':['kdh_user='+encodeURIComponent(JSON.stringify(who))+'; Path=/; SameSite=Lax','kdh_at=synthetic-preview; Path=/; SameSite=Lax','kdh_preview=; Max-Age=0; Path=/'],'location':url.searchParams.get('next')?.startsWith('/')&&!url.searchParams.get('next').startsWith('//')?url.searchParams.get('next'):'/' });return res.end();}
 if(p==='/shared/auth-config.js'){res.setHeader('content-type',types['.js']);return res.end('window.KDH_AUTH={url:'+JSON.stringify(origin)+',key:"synthetic-preview"}');}
 if(p==='/api/session')return json(res,{});
 let user=people.manager;try{user=JSON.parse(decodeURIComponent((req.headers.cookie||'').match(/kdh_user=([^;]+)/)?.[1]||''));}catch{}
 if(p.startsWith('/rest/v1/')){
  const table=p.slice('/rest/v1/'.length);
  if(table==='rpc/kdh_budget_me')return json(res,{editor:true,admin:true,manager:true});
  if(table==='rpc/kdh_upc_can')return json(res,user.ws!=='finance');
  if(table==='rpc/kdh_team'||table==='rpc/kdh_people'||table==='rpc/kdh_work_people')return json(res,Object.values(people));
  if(table==='budget_accounts')return json(res,[account]);
  if(table==='supplier_expenses')return req.method==='GET'?json(res,expenses):json(res,{message:'Local design review is read-only.'},409);
  if(table==='supplier_invoice_documents')return json(res,docs);
  if(table==='budget_vendors')return json(res,[{name:'Custom Vendor',uses:8},{name:'Kohler Distributing',uses:5}]);
  if(table==='field_tasks'){
   const task=(id,title,status,delegated=false)=>({id:'40000000-0000-0000-0000-00000000000'+id,title,description:'Synthetic design review task',task_type:'other',rep_email:user.email,rep_name:user.name,associate_email:delegated?'associate@example.test':user.email,associate_name:delegated?'Preview Associate':user.name,personal:!delegated,status,planned_on:day,due_date:day,sort_order:id,created_at:'2026-10-16T10:00:00Z',updated_at:'2026-10-16T10:00:00Z',archived_at:null});
   return req.method==='GET'?json(res,[task(1,'Review supplier recap','assigned'),task(2,'Check display photos','blocked'),task(3,'Review October results','assigned',true)]):json(res,{message:'Local design review is read-only.'},409);
  }
  return json(res,[]);
 }
 if(p.startsWith('/storage/'))return json(res,{message:'This local design review does not upload or open real PDFs.'},409);
 const file=path.resolve(root,'.'+p),full=p.endsWith('/')?path.join(file,'index.html'):file;
 if(!file.startsWith(root+path.sep)&&file!==root)return json(res,{},403);
 try{let body=fs.readFileSync(full);res.setHeader('content-type',types[path.extname(full)]||'application/octet-stream');res.setHeader('cache-control','no-store');res.end(body);}catch{return json(res,{},404);}
}).listen(port,'127.0.0.1',()=>console.log('Signature real-page QA: http://127.0.0.1:'+port+'/__review/as/manager · synthetic data only'));
