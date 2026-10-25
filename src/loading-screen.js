/** Keep the initial world inaccessible until downloads and its first render finish. */
export function createLoadingScreen({overlay,ui,canvas,requestFrame=requestAnimationFrame}){
  const detail=overlay.querySelector('[data-loading-detail]');
  const retry=overlay.querySelector('button');
  const messages={
    bus:'Bringing your Sri Lankan bus to the garage.',
    lettering:'Setting the signs for the journey ahead.',
    sounds:'Packing a little roadside atmosphere.',
    world:'Warming up the scenery for a smooth first drive.',
  };
  let finished=false,failed=false;
  const states=new Map();
  const slow=setTimeout(()=>{
    if(finished)return;
    const note=overlay.querySelector('[data-loading-slow]');
    if(note)note.hidden=false;
    retry.hidden=false;
  },15000);
  retry.addEventListener('click',()=>location.reload());
  const stage=(id,state='complete')=>{
    if(finished||!Object.hasOwn(messages,id))return;
    states.set(id,state);
    const item=overlay.querySelector(`[data-loading-stage="${id}"]`);
    item?.setAttribute?.('data-state',state);
    const labels={bus:'Your bus',lettering:'The lettering',sounds:'The sounds',world:'The open road'};
    item?.setAttribute?.('aria-label',`${labels[id]}: ${state==='complete'?'ready':state==='loading'?'preparing':'waiting'}`);
    const active=[...states].find(([,value])=>value==='loading');
    if(detail){detail.hidden=false;detail.textContent=active?messages[active[0]]:'The finishing touches are coming together.';}
  };
  const release=()=>{
    clearTimeout(slow);finished=true;overlay.hidden=true;
    ui.inert=false;ui.setAttribute('aria-busy','false');canvas.removeAttribute('aria-hidden');
  };
  return {
    stage,
    setStage:stage,
    async wait(downloads,prepare=()=>{}){
      await Promise.all(downloads);
      if(failed)return;
      stage('world','loading');
      await prepare();
      // Let a complete rendered frame reach the screen behind the overlay.
      await new Promise(resolve=>requestFrame(()=>requestFrame(resolve)));
      if(failed)return;
      stage('world','complete');
      release();
    },
    fail(message='Something could not download. Check your connection and try again.'){
      clearTimeout(slow);finished=true;failed=true;
      const heading=overlay.querySelector('h1');
      heading.textContent='A little bump in the road.';heading.hidden=false;detail.hidden=false;
      detail.textContent=message;overlay.classList.add('loading-failed');retry.hidden=false;
      const note=overlay.querySelector('[data-loading-slow]');
      if(note&&note!==detail)note.hidden=true;
    },
    release,
  };
}
