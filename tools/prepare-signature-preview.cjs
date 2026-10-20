/* Release preparation for the requested branch preview; no network or credentials. */
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),version='20261020ws';
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.name.startsWith('.')||e.name==='node_modules'?[]:e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
let count=0;
for(const file of walk(root)){
 if(!file.endsWith('.html')||file.includes(path.sep+'designs'+path.sep))continue;
 const before=fs.readFileSync(file,'utf8');
 const after=before.replace(/((?:shared\/kdh-user\.js|shared\/kdh(?:-skin)?\.css|(?:rep\/)?rep\.css)\?v=)[\w.-]+/g,'$1'+version);
 if(after!==before){fs.writeFileSync(file,after);count++;}
}
for(const rel of ['rep/rep.css','shared/kdh-skin.css']){
 const file=path.join(root,rel),before=fs.readFileSync(file,'utf8');
 fs.writeFileSync(file,before.replace(/(kdh\.css\?v=)[\w.-]+/g,'$1'+version));
}
const archive=path.join(root,'designs/kohler-theme-directions/concepts.html');
const concept=fs.readFileSync(archive,'utf8').replaceAll('1671827','1234567').replaceAll('320.78','100.00').replaceAll('U.S. Beverage','Example supplier').replaceAll('US Bev','Example').replaceAll('Gavin Sharkey','Preview Manager').replaceAll('Gavin.','Manager.');
fs.writeFileSync(archive,concept);
console.log('Updated shared asset versions on '+count+' pages; versioned concepts use synthetic examples.');
