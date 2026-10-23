/* Isolated PostgreSQL fixture. Identity tokens are local labels, not real sign-ins. */
const fs=require('fs'),path=require('path');
const {PGlite}=require(process.env.KDH_PGLITE||'../shots/brand-fit/runtime/node_modules/@electric-sql/pglite');
async function database(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 grant usage on schema auth to authenticated,anon;
 create table public.allowed_users(email text primary key,name text,role text,workspace text);
 alter table public.allowed_users enable row level security;
 grant select on public.allowed_users to authenticated;
 create policy own_allow on public.allowed_users for select to authenticated using(email=auth.jwt()->>'email');
 create table public.account_assignments(customer_num text primary key,rep_key text);
 create function public.kdh_caller_email() returns text language sql stable as $$select coalesce(auth.jwt()->>'email','')$$;
 create function public.kdh_can_access_account(n text) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.allowed_users u where u.email=public.kdh_caller_email() and u.role='manager') or exists(select 1 from public.account_assignments a where a.customer_num=n and a.rep_key=public.kdh_caller_email())$$;
 insert into allowed_users values('mgr','Local Manager','manager',null),('rep','Chris Payton','rep',null),('other','Other Rep','rep',null),('associate','Local Associate','associate',null),('finance','Finance','manager','finance'),('it','IT','it',null);
 alter default privileges in schema public grant all on tables to anon,authenticated;`);
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261023145203_account_brand_fit.sql'),'utf8'));
 return db;
}
async function identity(db,token=''){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(token?{email:token,sub:'00000000-0000-0000-0000-000000000001'}:{})]);await db.exec('set role '+(token?'authenticated':'anon'));}
module.exports={database,identity};
