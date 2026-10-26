/** Keep the world inaccessible until assets, GPU preparation and minimum display time finish. */
export function createLoadingScreen({overlay,ui,canvas,requestFrame=requestAnimationFrame,
  minimumMs=3000,now=()=>performance.now(),delay=ms=>new Promise(resolve=>setTimeout(resolve,ms)),onFinish=()=>{}}){
  const detail=overlay.querySelector('[data-loading-detail]'),retry=overlay.querySelector('button');
  // Start the minimum after the orb has actually had a chance to paint, rather
  // than counting synchronous game setup time as visible animation time.
  const firstPaint=new Promise(resolve=>requestFrame(()=>requestFrame(()=>resolve(now()))));
  let finished=false,failed=false,disposed=false;
  const dispose=()=>{if(!disposed){disposed=true;onFinish();}};
  retry.addEventListener('click',()=>location.reload());
  const release=()=>{
    finished=true;dispose();overlay.hidden=true;
    ui.inert=false;ui.setAttribute('aria-busy','false');canvas.removeAttribute('aria-hidden');
  };
  return {
    async wait(downloads,prepare=()=>{}){
      await Promise.all(downloads);
      if(failed||finished)return;
      await prepare();
      // Let the complete world paint behind the overlay before revealing it.
      await new Promise(resolve=>requestFrame(()=>requestFrame(resolve)));
      if(failed||finished)return;
      const startedAt=await firstPaint;
      const remaining=minimumMs-(now()-startedAt);
      if(remaining>0)await delay(remaining);
      if(failed||finished)return;
      release();
    },
    fail(message='Something could not download. Check your connection and try again.'){
      finished=true;failed=true;dispose();
      const heading=overlay.querySelector('h1');
      heading.textContent='Could not finish loading';heading.hidden=false;detail.hidden=false;
      detail.textContent=message;overlay.classList.add('loading-failed');retry.hidden=false;
    },
    release,
  };
}
