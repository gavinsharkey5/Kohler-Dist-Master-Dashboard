/* Authenticated associate/manager directory; no generated customer export. */
import { readFile } from 'node:fs/promises';

export function parseDirectory(csv){
 const rows=[];let row=[],value='',quoted=false;
 for(let i=0;i<csv.length;i++){
  const c=csv[i];
  if(c==='"'){if(quoted&&csv[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
  else if(c===','&&!quoted){row.push(value);value='';}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&csv[i+1]==='\n')i++;row.push(value);rows.push(row);row=[];value='';}
  else value+=c;
 }
 if(quoted)throw Error('Incomplete customer source');
 if(row.length||value){row.push(value);rows.push(row);}
 const header=(rows.shift()||[]).map(x=>x.replace(/^\uFEFF/,'').trim()),col=n=>{const i=header.indexOf(n);if(i<0)throw Error('Missing customer source column');return i;};
 const indexes={n:col('Customer ID'),name:col('Customer Name'),rep:col('Sales Rep Name'),city:col('City'),address:col('Shipping Address'),area:col('Distribution Area'),prem:col('On Premise')};
 const accounts=new Map();for(const row of rows){const a=Object.fromEntries(Object.entries(indexes).map(([k,i])=>[k,(row[i]||'').trim()]));if(!/^\d+$/.test(a.n))continue;a.prem={'On Premise':'On','Off Premise':'Off'}[a.prem]||'';accounts.set(a.n,a);}
 return [...accounts.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.n.localeCompare(b.n));
}
let directory;
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('Vary','Cookie');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
 const match=String(req.headers.cookie||'').match(/(?:^|;\s*)kdh_at=([^;]*)/);let token='';
 try{token=match?decodeURIComponent(match[1]):'';}catch{}
 if(!token)return res.status(401).json({error:'Sign in to open Accounts.'});
 const base=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY;
 if(!base||!key)return res.status(503).json({error:'Accounts are temporarily unavailable.'});
 try{
  const auth=await fetch(base+'/rest/v1/allowed_users?select=role,workspace&limit=1',{headers:{apikey:key,authorization:'Bearer '+token,accept:'application/json'}});
  if(!auth.ok)return res.status(auth.status===401?401:503).json({error:'Could not verify your sign-in.'});
  const rows=await auth.json(),u=Array.isArray(rows)?rows[0]:null;
  if(!u||!['associate','manager'].includes(u.role)||u.workspace==='finance')return res.status(403).json({error:'Accounts are not available in this workspace.'});
  if(!directory)directory=parseDirectory(await readFile(new URL('../territory-accounts/customers_active.csv',import.meta.url),'utf8'));
  return res.status(200).json({accounts:directory});
 }catch{return res.status(503).json({error:'Accounts could not be loaded. Please try again.'});}
}
