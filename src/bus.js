import * as THREE from 'three';
import { createBusModel } from './imported-bus.js';
import { RearTextPanel } from './rear-text.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const box = (w,h,d,mat,x=0,y=0,z=0) => {const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat); m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;return m;};
const material=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.68,...extra});

export class Bus {
  constructor(skin={}) {
    this.group=new THREE.Group();this.wheels=[];this.textures=[];this.skin={color:'#e4a44b',accent:'#f5eed9',pattern:'stripe',rearText:'',name:'COAST CLUB',destination:'THE LONG WAY HOME',...skin};
    this.bodyMaterial=material(this.skin.color);this.accentMaterial=material(this.skin.accent);
    const dark=material('#172e34'), glass=material('#264a52',{metalness:.25,roughness:.22}), chrome=material('#c3c6b9',{metalness:.6}), rubber=material('#1b282c');
    this.group.add(box(2.75,2.8,9.4,this.bodyMaterial,0,1.96,0));
    this.group.add(box(2.84,.35,9.45,this.accentMaterial,0,3.48,0));
    this.group.add(box(2.6,.18,9.05,dark,0,.58,0));
    this.group.add(box(2.6,.35,3.6,this.accentMaterial,0,3.8,-.5));
    this.group.add(box(2.44,1.3,.04,glass,0,2.65,4.72));
    this.group.add(box(.055,1.32,.055,chrome,0,2.65,4.76));
    this.group.add(box(2.4,1.14,.04,glass,0,2.65,-4.72));
    for(const side of [-1,1]){
      for(let n=0;n<7;n++)this.group.add(box(.035,1.12,.91,glass,side*1.39,2.69,-3.62+n*1.08));
      this.group.add(box(.075,.11,9.1,chrome,side*1.42,1.88,0));
      this.group.add(box(.16,.12,.6,dark,side*1.64,2.28,4.04));
      this.group.add(box(.12,.54,.3,dark,side*1.76,2.48,4.12));
      for(const z of [-2.9,3]){
        const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.6,.6,.3,20),rubber);wheel.rotation.z=Math.PI/2;wheel.position.set(side*1.39,.65,z);wheel.castShadow=true;this.group.add(wheel);this.wheels.push(wheel);
        const hub=new THREE.Mesh(new THREE.CylinderGeometry(.32,.32,.32,12),chrome);hub.rotation.z=Math.PI/2;hub.position.copy(wheel.position);this.group.add(hub);
      }
      this.group.add(box(.05,2.3,.035,chrome,side*1.43,1.95,3.7));
      this.group.add(box(.05,2.3,.035,chrome,side*1.43,1.95,2.65));
    }
    this.group.add(box(2.9,.26,.24,chrome,0,.8,4.78));this.group.add(box(2.9,.26,.24,chrome,0,.8,-4.78));
    this.lampMaterial=material('#fff1ba',{emissive:'#ffe7a0',emissiveIntensity:.45});
    for(const x of [-.94,.94]){this.group.add(box(.45,.26,.06,this.lampMaterial,x,1.25,4.74));this.group.add(box(.32,.48,.06,material('#bb4c37',{emissive:'#bd3d26',emissiveIntensity:.25}),x,1.16,-4.74));}
    this.group.add(box(1.1,.28,.06,dark,0,1.2,4.74));
    // Merge the stationary body by material so a convoy stays inexpensive.
    const batches=new Map();
    for(const mesh of [...this.group.children]){
      if(this.wheels.includes(mesh))continue;
      mesh.updateMatrix();const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrix);
      if(!batches.has(mesh.material))batches.set(mesh.material,[]);batches.get(mesh.material).push(geometry);
      this.group.remove(mesh);mesh.geometry.dispose();
    }
    for(const [mat,geometries]of batches){const geometry=mergeGeometries(geometries);for(const g of geometries)g.dispose();const mesh=new THREE.Mesh(geometry,mat);mesh.castShadow=true;mesh.receiveShadow=true;this.group.add(mesh);}
    this.sidePanels=[];
    for(const side of [-1,1]){const panel=new THREE.Mesh(new THREE.PlaneGeometry(8.25,1.07),new THREE.MeshStandardMaterial({roughness:.8}));panel.position.set(side*1.386,1.28,0);panel.rotation.y=side*Math.PI/2;this.group.add(panel);this.sidePanels.push(panel);}
    this.destination=new THREE.Mesh(new THREE.PlaneGeometry(2.43,.4),new THREE.MeshStandardMaterial({roughness:.7,emissive:'#fff1cb',emissiveIntensity:.3}));this.destination.position.set(0,3.48,4.74);this.group.add(this.destination);
    this.rearPanel=new RearTextPanel();this.group.add(this.rearPanel.mesh);
    this.setSkin(this.skin);
    this.ready=this.loadModel();
  }
  async loadModel(){
    try {
      const model=await createBusModel();
      if(this.disposed){this.disposeModel(model);return;}
      // Retain editable signs and liveries while replacing the procedural shell.
      const retained=new Set([...this.sidePanels,this.destination,this.cockpit,this.rearPanel.mesh]);
      for(const child of [...this.group.children]){
        if(retained.has(child))continue;
        this.group.remove(child);this.disposeModel(child);
      }
      this.group.scale.setScalar(10.934/9.8);this.group.add(model);this.importedModel=model;
      this.wheels=[];
      model.traverse(mesh=>{
        if(mesh.userData.wheel){mesh.userData.radius*=10.934/9.8;this.wheels.push(mesh);}
        if(mesh.material?.name==='Material.006')this.accentMaterial=mesh.material;
        if(['Material_1.003','Material.011'].includes(mesh.material?.name)||mesh.name==='Nil Kirilli white'){
          mesh.material.emissive.set('#ffe7a0');
          mesh.material.emissiveIntensity=this.lampMaterial.emissiveIntensity;
          if(!this.headlights)this.headlights=[];
          this.headlights.push(mesh.material);
        }
      });
      for(const panel of this.sidePanels){
        panel.geometry.dispose();panel.geometry=new THREE.PlaneGeometry(3.8,.2);
        panel.position.set(panel.position.x>0?1.035:-.944,1.37,.2);
      }
      this.destination.geometry.dispose();this.destination.geometry=new THREE.PlaneGeometry(1.7,.24);
      this.destination.position.set(.045,2.59,4.566);
      this.rearPanel.useImportedModel();
      this.setSkin(this.skin);
      return true;
    }catch(error){console.warn('Using the classic bus because the Sri Lanka model could not load.',error);return false;}
  }
  disposeModel(root){
    const mats=new Set(),geoms=new Set(),textures=new Set();
    root.traverse(o=>{if(o.geometry)geoms.add(o.geometry);for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(m){mats.add(m);if(!m.userData.sharedTextures)for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});
    for(const t of textures)t.dispose();for(const m of mats)m.dispose();for(const g of geoms)g.dispose();
  }
  setSkin(next){
    Object.assign(this.skin,next);this.rearPanel.setSkin(this.skin);const s=this.skin;
    if(this.importedModel&&this.panelImageMode!==Boolean(s.image)){this.panelImageMode=Boolean(s.image);for(const panel of this.sidePanels){panel.geometry.dispose();panel.geometry=new THREE.PlaneGeometry(3.8,s.image?.55:.2);}}
    if(!this.importedModel)this.bodyMaterial.color.set(s.color);this.accentMaterial.color.set(this.importedModel?'#0876dc':s.accent);
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=160;const c=canvas.getContext('2d');
    c.fillStyle=s.color;c.fillRect(0,0,1024,160);c.fillStyle=s.accent;
    if(s.pattern==='wave'){c.beginPath();c.moveTo(0,85);for(let x=0;x<=1024;x+=8)c.lineTo(x,85+Math.sin(x/130)*35);c.lineTo(1024,160);c.lineTo(0,160);c.fill();}
    else if(s.pattern==='retro'||s.pattern==='sunset'){for(let i=0;i<3;i++){c.globalAlpha=1-i*.17;c.fillRect(0,85+i*22,1024,15);}c.globalAlpha=1;}
    else if(s.pattern==='dots'){for(let x=20;x<1024;x+=50)for(let y=15;y<160;y+=45){c.beginPath();c.arc(x,y,8,0,Math.PI*2);c.fill();}}
    else if(s.pattern!=='solid'){c.fillRect(0,105,1024,24);c.fillRect(0,143,1024,8);}
    c.fillStyle=s.accent;c.font='bold 47px sans-serif';c.textAlign='center';c.fillText((s.name||'COAST CLUB').toUpperCase().slice(0,24),512,67);
    const sideTexture=new THREE.CanvasTexture(canvas);sideTexture.colorSpace=THREE.SRGBColorSpace;
    const previous=new Set(this.sidePanels.map(p=>p.material.map).filter(Boolean));
    const imageUnchanged=s.image&&s.image===this.loadedImage&&this.uploadedTexture;
    const nextTexture=imageUnchanged?this.uploadedTexture:sideTexture;
    for(const p of this.sidePanels){p.material.map=nextTexture;p.material.needsUpdate=true;}
    if(imageUnchanged)sideTexture.dispose();
    for(const tex of previous)if(tex!==nextTexture)tex.dispose();
    if(!imageUnchanged)this.uploadedTexture=null;
    const sign=document.createElement('canvas');sign.width=512;sign.height=88;const sc=sign.getContext('2d');sc.fillStyle='#182b2c';sc.fillRect(0,0,512,88);sc.fillStyle='#ffe6a9';sc.textAlign='center';sc.font='bold 30px monospace';sc.fillText((s.destination||'THE LONG WAY HOME').toUpperCase().slice(0,25),256,56);
    if(this.destination.material.map)this.destination.material.map.dispose();this.destination.material.map=new THREE.CanvasTexture(sign);this.destination.material.map.colorSpace=THREE.SRGBColorSpace;this.destination.material.needsUpdate=true;
    if(s.image&&!imageUnchanged){this.loadedImage=s.image;const source=s.image;const version=(this.imageVersion||0)+1;this.imageVersion=version;new THREE.TextureLoader().load(source,tex=>{if(this.disposed||this.loadedImage!==source||this.imageVersion!==version){tex.dispose();return;}tex.colorSpace=THREE.SRGBColorSpace;this.uploadedTexture=tex;const old=new Set(this.sidePanels.map(p=>p.material.map));for(const p of this.sidePanels){p.material.map=tex;p.material.needsUpdate=true;}for(const t of old)if(t)t.dispose();});}
    if(!s.image){this.loadedImage=null;this.imageVersion=(this.imageVersion||0)+1;}
  }
  animate(speed,dt){for(const wheel of this.wheels)wheel.rotation.x+=speed*dt/(wheel.userData.radius||.6);for(const mat of this.headlights||[])mat.emissiveIntensity=this.lampMaterial.emissiveIntensity;}
  dispose(){this.disposed=true;this.rearPanel.dispose();this.disposeModel(this.group);this.bodyMaterial.dispose();this.lampMaterial.dispose();}
}
