/* Kohler Signature home composition. Reuses real task state and existing tool links.
   No requests, no writes, no illustrative production metrics. */
(function(){
 'use strict';
 function start(){
  var home=document.querySelector('main.home'),u=window.kdhUser&&kdhUser();
  if(!home||!u||home.dataset.signatureReady)return;
  home.dataset.signatureReady='1';
  var finance=u.ws==='finance',associate=u.role==='associate';
  var h=home.querySelector('.hh h1');if(h){var first=String(u.name||'').trim().split(/\s+/)[0];h.textContent=first?'Welcome, '+first+'.':h.textContent;}
  // slow rollout (2026-10-21): a rep / associate home is just the program cards kdh-user.js left visible -- no My Day, shortcuts or tool directory
  if(window.kdhLimited&&kdhLimited()){home.classList.add('signature-limited');return;}
  if(finance){
   home.classList.add('signature-finance');
   var financeCard=home.querySelector('[data-my-day]');
   if(financeCard){financeCard.hidden=false;financeCard.removeAttribute('data-my-day');financeCard.className='signature-programs';var heading=document.createElement('h2');heading.textContent='Your finance workspace';financeCard.replaceChildren(heading);[['supplier-budget/#new','New Expense','Enter an expense and attach its invoice PDF'],['supplier-budget/','Supplier Budgets','Review expenses, invoices, and billbacks'],['hub/','Programs','Open incentive and MPO recaps']].forEach(function(spec){var a=document.createElement('a'),b=document.createElement('b'),small=document.createElement('small');a.href=spec[0];b.textContent=spec[1];small.textContent=spec[2];a.append(b,small);financeCard.appendChild(a);});}
   return;
  }
  if(associate)home.classList.add('signature-associate');
  var card=home.querySelector('[data-my-day]');
  if(!card||!['manager','rep','associate'].includes(u.role))return;
  var sections=Array.from(home.children).filter(function(e){return e.matches('section.hs');});
  var stats=document.createElement('section');stats.className='signature-stats';stats.setAttribute('aria-label','Your task summary');stats.hidden=true;
  [['My open tasks','Planned for today'],associate?['Completed today','Your finished assignments']:['Delegated tasks','Assigned to someone else'],['Blocked tasks','In your task list']].forEach(function(x,i){var box=document.createElement('div');box.className='signature-stat';var h=document.createElement('h2');h.textContent=x[0];var number=document.createElement('strong');number.dataset.signatureMetric=String(i);number.textContent='—';var p=document.createElement('p');p.textContent=x[1];box.append(h,number,p);stats.appendChild(box);});
  card.before(stats);
  var grid=document.createElement('div');grid.className='signature-work-grid';card.before(grid);grid.appendChild(card);
  var watch=document.createElement('aside');watch.className='signature-programs';watch.setAttribute('aria-label',associate?'Your field work':'Program shortcuts');var title=document.createElement('h2');title.textContent=associate?'Your field work':'Programs at a glance';watch.appendChild(title);
  (associate?[['a.kt[href*="tasks/"]','Field Tasks'],['a.kt[href*="accounts/"]','Accounts & Photos']]:[['a.kt[href*="hub/"]','Incentives'],['#off, #c-off','Off-Premise MPOs'],['#on, #c-on','On-Premise MPOs']]).forEach(function(spec){var original=home.querySelector(spec[0]);if(!original||original.hidden)return;var a=document.createElement('a');a.href=original.href;var b=document.createElement('b');b.textContent=spec[1];var small=document.createElement('small');a.append(b,small);watch.appendChild(a);var update=function(){a.href=original.href;var status=original.querySelector(associate?'.kt-s':'.kt-st');small.textContent=status?status.textContent.trim():associate?'Open your field work':'View results and program details';};update();new MutationObserver(update).observe(original,{childList:true,subtree:true,attributes:true,attributeFilter:['href']});});
  grid.appendChild(watch);
  var shortcuts=document.createElement('nav');shortcuts.className='signature-shortcuts';shortcuts.setAttribute('aria-label','Frequently used tools');
  var wanted=associate?[]:u.role==='manager'?(window.kdhWsViewer&&kdhWsViewer(u)?[['wine-spirits/','Wine & Spirits','W&S distribution & execution']]:[]).concat([['supplier-budget/','Supplier Budgets','Expenses, PDFs & billbacks'],['accounts/','Team Accounts','Follow-ups & opportunities'],['inventory/','What Can I Sell','Available & running low']]):[['accounts/','My Accounts','Follow-ups & opportunities'],['hub/','Programs','Your incentives & MPOs'],['inventory/','What Can I Sell','Available & running low']];
  wanted.forEach(function(spec){var original=Array.from(home.querySelectorAll('a.kt')).find(function(a){return !a.hidden&&new URL(a.href).pathname.replace(/\/index\.html$/,'/').endsWith('/'+spec[0]);});if(!original)return;var a=document.createElement('a');a.href=original.href;a.textContent=spec[1];var small=document.createElement('small');small.textContent=spec[2];a.appendChild(small);shortcuts.appendChild(a);});
  grid.after(shortcuts);
  var directory=document.createElement('details');directory.className='signature-directory';var summary=document.createElement('summary');summary.textContent='All tools & reports';directory.appendChild(summary);
  // Keep rep attention and account-search controls readily available, ahead of the directory.
  sections.forEach(function(section){if(section.id==='todaySec'||section.querySelector('#acctSearch, #accountSearch'))return;directory.appendChild(section);});
  if(associate){shortcuts.remove();directory.remove();}else shortcuts.after(directory);
  function paintTaskStats(data){if(!data)return;[data.open,associate?data.completed:data.delegated,data.blocked].forEach(function(n,i){var node=stats.querySelector('[data-signature-metric="'+i+'"]');node.textContent=String(n);});stats.hidden=false;}
  document.addEventListener('kdh:work-summary',function(e){paintTaskStats(e.detail);});paintTaskStats(card.kdhTaskSummary);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
