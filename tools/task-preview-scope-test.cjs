const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),ctx=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(root,'shared/task-scope.js'),'utf8'),ctx);
const people=[{name:'Manager',role:'manager',email:'m@test'},{name:'Nested Manager',role:'manager',email:'n@test'},{name:'Rep',role:'rep',email:'r@test'},{name:'Associate',role:'associate',email:'a@test'},{name:'Other Rep',role:'rep',email:'o@test'}];
const roster=[{name:'Nested Manager',reports_to:'Manager'},{name:'Rep',reports_to:'Nested Manager'},{name:'Associate',reports_to:'Manager'}];
let checks=0;const check=(value,want)=>{assert.equal(value,want);checks++;};
const make=role=>ctx.KdhTaskScope.create({...people.find(p=>p.role===role),preview:true},people,roster);
const task=(creator,assignee)=>({rep_email:creator,associate_email:assignee});
const manager=make('manager'),rep=make('rep'),associate=make('associate');
check(manager.email,'m@test');check(manager.visible(task('m@test','a@test')),true);check(manager.visible(task('r@test','a@test')),true);check(manager.visible(task('n@test','a@test')),true);
check(manager.visible(task('o@test','a@test')),false);check(manager.visible(task('o@test','r@test')),true);check(manager.visible(task('o@test','o@test')),false);check(manager.visible({...task('r@test','a@test'),archived_at:'2026-10-16'}),false);
check(manager.mine(task('r@test','m@test')),true);check(manager.mine(task('r@test','a@test')),false);
check(rep.visible(task('r@test','a@test')),true);check(rep.visible(task('m@test','r@test')),true);check(rep.visible(task('o@test','a@test')),false);check(rep.mine(task('r@test','a@test')),false);check(rep.mine(task('m@test','r@test')),true);
check(associate.visible(task('o@test','a@test')),true);check(associate.visible(task('r@test','r@test')),false);check(associate.mine(task('r@test','a@test')),true);
for(const [user,list] of [[{name:'Unknown',role:'rep'},people],[{name:'Rep',role:'rep'},people.concat({...people[2],email:'duplicate@test'})]]){assert.throws(()=>ctx.KdhTaskScope.create(user,list,roster));checks++;}
check(ctx.KdhTaskScope.create({name:'Rep',role:'rep',previewEmail:'r@test'},people.concat({...people[2],email:'duplicate@test'}),roster).email,'r@test');
const shell=fs.readFileSync(path.join(root,'shared/work.js'),'utf8');const rest=shell.slice(shell.indexOf('async function rest('),shell.indexOf('async function all('));
(async()=>{let calls=0;const test=vm.createContext({PREVIEW:true,window:{KDH_AUTH:{url:'https://example.test',key:'fixture'}},token:()=> 'fixture',fetch:async()=>{calls++;return {ok:true,json:async()=>[]};}});vm.runInContext(rest,test);
for(const method of ['POST','PATCH','DELETE']){await assert.rejects(vm.runInContext('rest("field_tasks",{method:"'+method+'"})',test),/read-only/);checks++;}
await assert.rejects(vm.runInContext('rest("rpc/kdh_message_read",{method:"POST"})',test),/read-only/);checks++;
check(calls,0);await vm.runInContext('rest("rpc/kdh_work_people",{method:"POST"})',test);await vm.runInContext('rest("field_tasks")',test);check(calls,2);
console.log(checks+' task preview scope, hierarchy, shared-associate isolation and read-only checks passed');})();
