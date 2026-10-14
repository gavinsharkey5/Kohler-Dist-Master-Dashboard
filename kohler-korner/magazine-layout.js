/* Presentation only. Measures escaped rendered content; never rewrites saved articles. */
(function(g){
  'use strict';
  let activeObserver=null,observedContainer=null;
  function opening(sections){
    const seasonal=sections.find(s=>s.querySelector('.kk-section-label')?.textContent.trim()==='Seasonal Beers');
    const frank=sections.find(s=>s.querySelector('.kk-section-label')?.textContent.trim()==='Message From Frank')||sections.find(s=>s.classList.contains('kk-type-article')&&/Frank Politano/i.test(s.querySelector('.kk-byline')?.textContent||''));
    const remaining=sections.filter(s=>s!==seasonal&&s!==frank);
    return [seasonal,frank,...remaining].filter(Boolean);
  }
  function units(section){
    const header=[],body=[];
    function walk(node){
      if(node.matches('.kk-section-label,h2')||node.matches('.kk-byline')&&!body.length){header.push(node.cloneNode(true));return;}
      if(node.matches('.kk-copy,.kk-article-body,.kk-portrait-story,.kk-event-body,.kk-event-copy')){[...node.children].forEach(walk);return;}
      if(node.matches('.kk-products,.kk-gallery,.kk-people,.kk-recognition')){
        const children=[...node.children],count=node.matches('.kk-recognition')?1:2;
        for(let i=0;i<children.length;i+=count){const group=node.cloneNode(false);group.classList.remove('kk-products-feature','kk-gallery-feature');children.slice(i,i+count).forEach(c=>group.append(c.cloneNode(true)));body.push(group);}return;
      }
      body.push(node.cloneNode(true));
    }
    [...section.children].forEach(walk);
    for(let i=0;i<body.length-1;i++)if(body[i].matches('h3,h4')){const group=document.createElement('div');group.className='kk-keep-heading';group.append(body[i],body[i+1]);body.splice(i,2,group);}
    return {header,body};
  }
  async function prepare(container,{print=false}={}){
    const magazine=container.querySelector('.kk-magazine');if(!magazine)return;
    await document.fonts.ready;
    await Promise.all([...magazine.querySelectorAll('img')].map(i=>i.decode().catch(()=>{})));
    if(!magazine.isConnected)return;
    // A resize restores the source DOM before measuring again.
    const original=magazine._columnSource||magazine.cloneNode(true);magazine._columnSource=original;
    const sections=opening([...original.querySelectorAll(':scope>.kk-story,:scope>.kk-recognition-pair>.kk-story')]);
    if(!sections.length){magazine.replaceChildren(...[...original.childNodes].map(n=>n.cloneNode(true)));return;}
    magazine.classList.add('kk-column-edition');magazine.classList.toggle('kk-print-layout',print);
    magazine.style.zoom='1';magazine.replaceChildren();
    const mast=original.querySelector('.kk-mast'),note=original.querySelector('.kk-sample-note'),foot=original.querySelector('.kk-mag-foot');
    if(!print&&g.innerWidth<=600){magazine.style.width='';magazine.classList.add('kk-column-mobile');if(mast)magazine.append(mast.cloneNode(true));if(note)magazine.append(note.cloneNode(true));const first=sections.slice(0,2),rest=[...original.querySelectorAll(':scope>.kk-story,:scope>.kk-recognition-pair>.kk-story')].filter(s=>!first.includes(s));[...first,...rest].forEach(s=>magazine.append(s.cloneNode(true)));if(foot)magazine.append(foot.cloneNode(true));return;}
    magazine.classList.remove('kk-column-mobile');magazine.style.width='724px';
    let pages=[],page,columns,pageIndex=-1;
    function addPage(){
      pageIndex++;if(pages[pageIndex]){page=pages[pageIndex];columns=[...page.querySelectorAll('.kk-mag-column')];return columns;}
      page=document.createElement('div');page.className='kk-mag-page';
      if(!pages.length){if(mast)page.append(mast.cloneNode(true));if(note)page.append(note.cloneNode(true));}
      const body=document.createElement('div');body.className='kk-mag-columns';columns=[0,1].map(()=>{const col=document.createElement('div');col.className='kk-mag-column kk-compact-column';body.append(col);return col;});page.append(body);
      const footer=document.createElement('footer');footer.className='kk-page-foot';footer.textContent=(foot?.textContent||'Kohler Korner')+' · '+(pages.length+1);page.append(footer);magazine.append(page);pages.push(page);
      body.style.height=Math.max(200,950-(page.getBoundingClientRect().height-body.getBoundingClientRect().height))+'px';
      return columns;
    }
    function height(col){return [...col.children].reduce((h,c)=>h+c.getBoundingClientRect().height,0);}
    function fits(col,node){col.append(node);const fit=col.scrollHeight<=col.clientHeight+1;node.remove();return fit;}
    function fragment(source,header,continued){const node=source.cloneNode(false);node.classList.remove('kk-lead');header.forEach(h=>node.append(h.cloneNode(true)));if(continued){const title=node.querySelector('h2');if(title)title.append(' (continued)');}return node;}
    addPage();
    for(let index=0;index<sections.length;index++){
      if(index>0){pageIndex=0;page=pages[0];columns=[...page.querySelectorAll('.kk-mag-column')];}
      const source=sections[index],whole=source.cloneNode(true);
      // Keep ordinary sections whole. Fill the shortest available column across
      // existing pages before creating a page, so small stories fill earlier gaps.
      const candidates=index<2?[columns[index]]:pages.flatMap(p=>[...p.querySelectorAll('.kk-mag-column')].sort((a,b)=>height(a)-height(b)));
      let col=candidates.find(c=>fits(c,whole));
      if(!col&&index>=2){addPage();col=columns.find(c=>fits(c,whole));}
      if(col){col.append(whole);continue;}
      // Fill available space in natural blocks, keeping a photo and its copy together.
      const {header,body}=units(source);let remaining=body.slice(),continued=false;
      while(remaining.length){
        col=index<2?columns[index]:columns[0];
        if(continued||pageIndex>0)col.classList.add('kk-compact-column');
        let piece=fragment(source,header,continued),count=0;
        col.append(piece);
        for(const unit of remaining){piece.append(unit);if(col.scrollHeight>col.clientHeight+1){unit.remove();break;}count++;}
        if(count){remaining.splice(0,count);continued=true;}
        else{
          piece.remove();
          if(height(col)<1){
            // Oversized paragraphs retain every word across continuation blocks.
            const unit=remaining[0];if(unit.matches('p,blockquote')&&unit.textContent.split(/\s+/).length>30){const words=unit.textContent.split(/\s+/),mid=Math.ceil(words.length/2),a=unit.cloneNode(false),b=unit.cloneNode(false);a.textContent=words.slice(0,mid).join(' ');b.textContent=words.slice(mid).join(' ');remaining.splice(0,1,a,b);continue;}
            // Image-heavy or unusually long nested blocks can break naturally.
            if(unit.children.length>1){remaining.splice(0,1,...[...unit.children].map(c=>c.cloneNode(true)));continue;}
            piece=fragment(source,header,continued);piece.append(remaining.shift());piece.classList.add('kk-natural-overflow');col.append(piece);continued=true;
          }
        }
        if(remaining.length)addPage();
      }
    }
    // Use remaining space for readable type and larger imagery, within editorial
    // limits. Measure each step so neither the PDF nor digital edition clips.
    for(const col of pages.flatMap(p=>[...p.querySelectorAll('.kk-mag-column')])){
      if(!col.children.length)continue;
      let low=0,high=1;
      for(let step=0;step<9;step++){
        const amount=(low+high)/2;col.style.setProperty('--kk-fill',amount);
        if(col.scrollHeight<=col.clientHeight)low=amount;else high=amount;
      }
      col.style.setProperty('--kk-fill',low);
      // Recognition lists can use gentle spacing between service milestones
      // instead of leaving an empty block below a short employee section.
      if(col.querySelector('.kk-recognition')){
        let a=0,b=18;
        for(let step=0;step<9;step++){const space=(a+b)/2;col.style.setProperty('--kk-recognition-space',space+'px');if(col.scrollHeight<=col.clientHeight)a=space;else b=space;}
        col.style.setProperty('--kk-recognition-space',a+'px');
      }
      col.dataset.spaceFit='true';
    }
    for(const p of pages){const cols=p.querySelectorAll('.kk-mag-column');if([...cols].some(c=>c.scrollHeight>c.clientHeight+2))p.classList.add('kk-page-expanded');}
    magazine.dataset.layoutReady='true';
    if(!print)magazine.style.zoom=String(Math.min(1,container.clientWidth/724));
  }
  function schedule(container){
    const task=prepare(container);task.catch(()=>{});
    if(observedContainer!==container){activeObserver?.disconnect();observedContainer=container;let width=container.clientWidth;const observer=new ResizeObserver(()=>{if(Math.abs(container.clientWidth-width)<2)return;width=container.clientWidth;prepare(container).catch(()=>{});});observer.observe(container);activeObserver=observer;}
    return task;
  }
  g.KornerLayout={prepare,schedule};
})(window);
