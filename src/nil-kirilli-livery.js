import * as THREE from 'three';
import { loadRearTextFont } from './rear-text.js';

// Repaint the supplied UV atlas, preserving door edges and revealing the cabin
// through the window cutouts. Artwork is original, inspired by Blue Chick 02.
export function createNilKirilliAtlas(source, artwork) {
  const canvas = document.createElement('canvas');
  canvas.width = source.width; canvas.height = source.height;
  const c = canvas.getContext('2d'); c.drawImage(source, 0, 0);
  const pixels = c.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const x = (i / 4 % canvas.width) / canvas.width * 1024;
    const y = Math.floor(i / 4 / canvas.width) / canvas.height * 512;
    const r=pixels.data[i], g=pixels.data[i+1], b=pixels.data[i+2];
    const sideWindow = (y > 157 && y < 209 && x > 204 && x < 1003) || (y > 411 && y < 464 && x > 300 && x < 1003);
    const endWindow = x > 26 && x < 169 && ((y > 159 && y < 202) || (y > 406 && y < 458));
    if ((sideWindow && r > 42 && Math.abs(r-g) < 8 && Math.abs(g-b) < 8) || (endWindow && r > 42)) pixels.data[i+3] = 0;
    else if (r > 140 && g > 140 && b > 140) {
      const light = (r + g + b) / 765;
      pixels.data[i] = 15 + light * 24; pixels.data[i+1] = 100 + light * 65; pixels.data[i+2] = 186 + light * 56;
    } else if (b > 150 && b > r * 1.8) {
      pixels.data[i] = 14; pixels.data[i+1] = 66; pixels.data[i+2] = 183;
    }
  }
  c.putImageData(pixels,0,0);
  c.save(); c.scale(canvas.width/1024,canvas.height/512);
  const mural = (x,y,w,h) => {
    c.save();c.beginPath();c.rect(x,y,w,h);c.clip();
    c.translate(0,2*y+h);c.scale(1,-1);
    const gradient=c.createLinearGradient(x,y,x,y+h);gradient.addColorStop(0,'#40c8fa');gradient.addColorStop(.52,'#148ddd');gradient.addColorStop(1,'#1252b9');c.fillStyle=gradient;c.fillRect(x,y,w,h);
    if(artwork){
      // Repeat at half length to keep faces and birds close to their proportions.
      c.drawImage(artwork,x,y,w/2,h);c.drawImage(artwork,x+w/2,y,w/2,h);
    }
    else {
      for(let j=0;j<16;j++) {
        c.beginPath();c.moveTo(x-20,y+h*.7+j*3);c.bezierCurveTo(x+w*.28,y-h*.2+j*4,x+w*.52,y+h*1.8-j*4,x+w+20,y+h*.1+j*2);
        c.strokeStyle=['#a5e9fa','#0876cc','#0b3b8d','#65c7ed'][j%4];c.lineWidth=j%4===0?3:1;c.stroke();
      }
    }
    c.restore();
  };
  mural(202,56,800,86);mural(296,311,702,87);
  c.restore();
  const texture=new THREE.CanvasTexture(canvas);texture.flipY=false;texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
  return texture;
}

export function createNilKirilliSigns(artwork) {
  const group=new THREE.Group();group.name='Nil Kirilli painted lettering';
  const signs=[];
  function sign(w,h,x,y,z,rotation,text,sub='',background='#096ac3') {
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const material=new THREE.MeshStandardMaterial({map:texture,transparent:true,roughness:.4,emissive:'#9ad9ff',emissiveIntensity:.12,depthWrite:false});
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),material);mesh.position.set(x,y,z);mesh.rotation.y=rotation;group.add(mesh);
    const draw=()=>{const c=canvas.getContext('2d');c.clearRect(0,0,1024,256);if(background){c.fillStyle=background;c.fillRect(0,0,1024,256);c.strokeStyle='#d7d99b';c.lineWidth=8;c.strokeRect(7,7,1010,242);}c.textAlign='center';c.textBaseline='middle';c.font='600 105px "Bus Sinhala", sans-serif';c.lineWidth=10;c.strokeStyle='#153565';c.strokeText(text,512,sub?102:128,970);c.fillStyle='#f7f5df';c.fillText(text,512,sub?102:128,970);if(sub){c.font='bold 35px sans-serif';c.fillStyle='#f8d989';c.fillText(sub,512,207,970);}texture.needsUpdate=true;};
    draw();signs.push(draw);
  }
  sign(1.82,.21,.045,2.87,4.574,0,'නිල් කිරිල්ලී','NIL KIRILLI • BLUE CHICK 02');
  sign(1.75,.19,.045,2.39,4.552,0,'නිල් කිරිල්ලී','','');
  sign(1.7,.44,.04,1.81,-4.89,Math.PI,'නිල් කිරිල්ලී','BLUE CHICK 02 • SUDHARAKA JET LINER');
  if(artwork){const texture=new THREE.Texture(artwork);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;const panel=new THREE.Mesh(new THREE.PlaneGeometry(1.9,.46),new THREE.MeshStandardMaterial({map:texture,roughness:.45}));panel.rotation.y=Math.PI;panel.position.set(.04,1.13,-4.891);group.add(panel);}
  sign(1.76,.16,.045,1.51,4.619,0,'SUDHARAKA JET LINER','','#136dc5');
  sign(.53,.13,.045,.47,4.941,0,'ND - 4138','','#d8b36d');
  loadRearTextFont().then(()=>signs.forEach(draw=>draw()));
  return group;
}
