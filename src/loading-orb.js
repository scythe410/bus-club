import {createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {ThinkingOrb} from 'thinking-orbs';

/** React is scoped to this loader; unmounting cancels the orb's animation loop. */
export function mountLoadingOrb(element){
  const root=createRoot(element);
  flushSync(()=>root.render(createElement(ThinkingOrb,{
    state:'solving',size:64,theme:'dark',color:'#ffffff',
  })));
  return ()=>root.unmount();
}
