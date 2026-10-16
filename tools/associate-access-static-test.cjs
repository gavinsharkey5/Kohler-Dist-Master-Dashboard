const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'middleware.js'),'utf8').replace(/^import .*$/mg,'').replace(/export default /g,'').replace(/export /g,'');
const context=vm.createContext({Response,Request,URL,console});vm.runInContext(source,context);
let checks=0;
function route(p,role='associate',document=false){context.req=new Request('https://example.test'+p,{headers:{accept:document?'text/html':'application/json'}});context.url=new URL(context.req.url);context.verdict={ok:true,role};return vm.runInContext('route(req,url,verdict)',context);}
for(const p of ['/accounts/field.html','/accounts/field.js','/accounts/field.css','/accounts/accounts.css','/accounts/activity.js','/api/field-accounts','/api/field-accounts/','/accounts/data/catalog.json','/shared/merch-types.js','/tasks/']){assert.equal(route(p).headers.get('x-middleware-next'),'1',p);checks++;}
for(const p of ['/accounts/data/sales/rep-one/001.json','/accounts/data/reps/rep-one.json','/hub/data/accounts.js','/supplier-budget/','/manage-programs/','/api/chat','/api/geocode']){assert.equal(route(p).status,403,p);checks++;}
assert.ok(route('/accounts/', 'associate',true).headers.get('x-middleware-rewrite').endsWith('/accounts/field.html'));checks++;
for(const p of ['/api/field-accounts','/accounts/field.html']){assert.equal(route(p,'rep').status,403);checks++;}
(async()=>{
const {default:handler,parseDirectory}=await import('../api/field-accounts.js');
const parsed=parseDirectory('Customer ID,Customer Name,Sales Rep Name,City,Shipping Address,Distribution Area,On Premise\r\n1,"Example, Market",Rep One,Example,"100 Example\nStreet",Example,Off Premise\r\n');
assert.equal(parsed[0].name,'Example, Market');assert.equal(parsed[0].address,'100 Example\nStreet');checks++;
process.env.SUPABASE_URL='https://fixture.test';process.env.SUPABASE_PUBLISHABLE_KEY='synthetic';
let identity={role:'associate'},authCalls=0;
global.fetch=async()=>{authCalls++;return new Response(JSON.stringify(identity?[identity]:[]),{status:200,headers:{'content-type':'application/json'}});};
async function request(cookie='kdh_at=synthetic',method='GET'){const out={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(body){this.body=body;return this;}};await handler({headers:{cookie},method},out);return out;}
assert.equal((await request('')).code,401);assert.equal(authCalls,0);checks++;
for(const role of ['rep','it']){identity={role};assert.equal((await request()).code,403);checks++;}
identity={role:'manager',workspace:'finance'};assert.equal((await request()).code,403);checks++;
identity=null;assert.equal((await request()).code,403);checks++;
identity={role:'associate'};const result=await request();assert.equal(result.code,200);assert.equal(result.headers['Cache-Control'],'private, no-store');
assert.ok(result.body.accounts.length>2000);assert.equal(new Set(result.body.accounts.map(a=>a.n)).size,result.body.accounts.length);
for(const a of result.body.accounts)assert.deepEqual(Object.keys(a).sort(),['n','name','rep','city','address','area','prem'].sort());checks++;
identity={role:'manager'};assert.equal((await request()).code,200);checks++;
assert.equal((await request('kdh_at=synthetic','POST')).code,405);checks++;
assert.equal(fs.existsSync(path.join(root,'accounts/data/field-directory.json')),false);checks++;
console.log(`${checks} associate route, API authorization, CSV and directory checks passed`);
})().catch(e=>{console.error(e);process.exitCode=1;});
