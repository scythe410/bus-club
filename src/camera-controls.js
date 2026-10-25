const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));

// Trackpad pinch arrives as Ctrl+wheel in Chromium/Firefox; Safari also sends
// gesture events. macOS Three Finger Drag arrives as ordinary pointer dragging.
export class CameraControls {
  constructor(canvas,enabled){
    this.canvas=canvas;this.enabled=enabled;this.reset();this.listeners=[];
    const listen=(name,fn,options)=>{canvas.addEventListener(name,fn,options);this.listeners.push([name,fn,options]);};
    listen('wheel',event=>{
      if(!enabled())return;
      event.preventDefault();
      if(this.gesture)return;
      const unit=event.deltaMode===1?16:event.deltaMode===2?canvas.clientHeight:1;
      const dx=clamp(event.deltaX*unit,-200,200),dy=clamp(event.deltaY*unit,-200,200);
      if(event.ctrlKey||event.metaKey)this.zoom(dy*.008);
      else this.orbit(-dx*.005,-dy*.004);
    },{passive:false});
    listen('gesturestart',event=>{
      if(!enabled())return;
      event.preventDefault();this.gesture={scale:1};
    },{passive:false});
    listen('gesturechange',event=>{
      if(!enabled()||!this.gesture)return;
      event.preventDefault();
      if(Number.isFinite(event.scale)&&event.scale>0){this.zoom(Math.log(this.gesture.scale/event.scale));this.gesture.scale=event.scale;}
    },{passive:false});
    listen('gestureend',event=>{if(this.gesture)event.preventDefault();this.gesture=null;},{passive:false});
    listen('pointerdown',event=>{
      if(!enabled()||event.pointerType==='touch'||event.button!==0)return;
      this.drag={id:event.pointerId,x:event.clientX,y:event.clientY};
      canvas.setPointerCapture(event.pointerId);
    });
    listen('pointermove',event=>{
      if(!this.drag||this.drag.id!==event.pointerId)return;
      if(!enabled()){this.cancel();return;}
      this.orbit((event.clientX-this.drag.x)*.006,(event.clientY-this.drag.y)*.005);
      this.drag.x=event.clientX;this.drag.y=event.clientY;
    });
    const release=event=>{if(this.drag?.id===event.pointerId)this.cancel();};
    listen('pointerup',release);listen('pointercancel',release);listen('lostpointercapture',release);
    listen('dblclick',event=>{if(enabled()){event.preventDefault();this.reset();}});
  }
  reset(){this.yaw=0;this.elevation=0;this.zoomScale=1;this.active=false;this.cancel();}
  cancel(){
    const id=this.drag?.id;this.drag=null;this.gesture=null;
    if(id!==undefined&&this.canvas.hasPointerCapture(id))this.canvas.releasePointerCapture(id);
  }
  zoom(delta){if(!Number.isFinite(delta)||!delta)return;this.active=true;this.zoomScale=clamp(this.zoomScale*Math.exp(clamp(delta,-1,1)),.6,3);}
  orbit(horizontal,vertical){
    if(!Number.isFinite(horizontal)||!Number.isFinite(vertical)||(!horizontal&&!vertical))return;
    this.active=true;this.yaw=Math.atan2(Math.sin(this.yaw+horizontal),Math.cos(this.yaw+horizontal));
    this.elevation=clamp(this.elevation+vertical,-.2,1.1);
  }
  pose(chase){
    const pivot=1.8;
    const angle=clamp(Math.atan2(chase.height-pivot,chase.distance)+this.elevation,.08,1.25);
    const radius=clamp(Math.hypot(chase.distance,chase.height-pivot)*this.zoomScale,8,48);
    return {back:Math.cos(this.yaw)*Math.cos(angle)*radius,side:Math.sin(this.yaw)*Math.cos(angle)*radius,height:pivot+Math.sin(angle)*radius,pivot};
  }
  dispose(){this.cancel();for(const [name,fn,options]of this.listeners)this.canvas.removeEventListener(name,fn,options);}
}
