import * as THREE from 'three';
import { loadRearTextFont } from './rear-text.js';
import { clearRearDoorAtlas } from './bus-doors.js';

// The source UV layout is shared with Nil Kirilli. Clear the donor's opaque
// window paint so the burgundy cabin is visible through the separate glass.
export function createDamRejinaAtlas(source, artwork) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2048, source.width); canvas.height = Math.round(canvas.width * source.height / source.width);
  const c = canvas.getContext('2d'); c.drawImage(source, 0, 0, canvas.width, canvas.height);
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
      pixels.data[i] = 153 + light * 88; pixels.data[i+1] = 15 + light * 36; pixels.data[i+2] = 93 + light * 75;
    } else if (b > 150 && b > r * 1.8) {
      pixels.data[i] = 107; pixels.data[i+1] = 22; pixels.data[i+2] = 120;
    }
  }
  c.putImageData(pixels,0,0);
  c.save(); c.scale(canvas.width/1024,canvas.height/512);
  function sidePanel(x,y,w,h,mirror=false) {
    c.save(); c.beginPath(); c.rect(x,y,w,h); c.clip();
    c.translate(0,2*y+h); c.scale(1,-1);
    const gradient=c.createLinearGradient(x,y,x,y+h);
    gradient.addColorStop(0,'#f741b1');gradient.addColorStop(.55,'#db1b92');gradient.addColorStop(1,'#792479');
    c.fillStyle=gradient;c.fillRect(x,y,w,h);
    if(artwork){
      // Preserve the macaw's proportions while letting the long lettering and
      // flames fill the rest of the flank. The atlas rows run in opposite
      // front-to-back directions. Move the bird, without reversing lettering.
      const birdSourceWidth=Math.round(artwork.width*.25);
      const birdWidth=h*birdSourceWidth/artwork.height;
      c.drawImage(artwork,0,0,birdSourceWidth,artwork.height,mirror?x+w-birdWidth:x,y,birdWidth,h);
      c.drawImage(artwork,birdSourceWidth,0,artwork.width-birdSourceWidth,artwork.height,mirror?x:x+birdWidth,y,w-birdWidth,h);
      c.restore();return;
    }
    // Original sweeping feather forms interpret the pale bird graphics visible
    // in the side photographs; these are not a traced or fabricated portrait.
    for (let feather=0;feather<7;feather++) {
      c.beginPath();c.moveTo(x+w*.12,y+h*.82);
      c.bezierCurveTo(x+w*.44,y+h*(.1+feather*.04),x+w*.62,y+h*(1.08-feather*.1),x+w*(.98-feather*.035),y+h*(.06+feather*.10));
      c.strokeStyle=feather%2 ? '#e5c7f3' : '#fff0fa'; c.lineWidth=feather===0?7:3;c.stroke();
    }
    c.beginPath();c.moveTo(x+w*.16,y+h*.74);c.bezierCurveTo(x+w*.35,y+h*.96,x+w*.58,y+h*.88,x+w*.82,y+h*.56);
    c.strokeStyle='#50295f';c.lineWidth=6;c.stroke();
    c.restore();
  }
  // The source mural starts with the parrot at the front on both flanks.
  sidePanel(202,56,800,86,true);sidePanel(296,311,702,87);
  if(artwork){
    // Carry the floral paint around the rear corners. Rear lettering, plate,
    // lamp banks and the black center panel remain separate, legible fittings.
    c.save();c.beginPath();c.rect(15,62,167,77);c.clip();
    c.translate(0,201);c.scale(1,-1);
    c.drawImage(artwork,artwork.width*.72,0,artwork.width*.28,artwork.height,15,62,167,77);
    c.restore();
  }
  c.restore();
  clearRearDoorAtlas(c,canvas.width,canvas.height);
  const texture=new THREE.CanvasTexture(canvas);texture.flipY=false;texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
  return texture;
}

export function createDamRejinaSigns(frontMural) {
  const group=new THREE.Group();group.name='Dam Rejina touring lettering';
  const redraw=[];
  function sign(w,h,x,y,z,rotation,text,sub='',background='#da2294',color='#fff2f6') {
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const material=new THREE.MeshStandardMaterial({map:texture,transparent:true,roughness:.42,emissive:'#ff8ed5',emissiveIntensity:.10,depthWrite:false});
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),material);mesh.position.set(x,y,z);mesh.rotation.y=rotation;group.add(mesh);
    function draw(){
      const c=canvas.getContext('2d');c.clearRect(0,0,1024,256);
      if(background){c.fillStyle=background;c.fillRect(0,0,1024,256);}
      c.textAlign='center';c.textBaseline='middle';c.font='900 114px "Bus Sinhala", sans-serif';
      c.lineWidth=9;c.strokeStyle='#54203d';c.strokeText(text,512,sub?99:128,980);c.fillStyle=color;c.fillText(text,512,sub?99:128,980);
      if(sub){c.font='bold 42px sans-serif';c.fillStyle='#fff0b0';c.fillText(sub,512,207,980);}texture.needsUpdate=true;
    }
    draw();redraw.push(draw);
  }
  // Both photographs show a two-line pink crown, with pale Member Of script
  // above the large yellow group name. Keep the corners free for diamond decals.
  function crown(w,h,y,z,rotation) {
    const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=384;
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:texture,roughness:.4}));
    mesh.name=rotation?'Dam Rejina rear Member Of crown':'Dam Rejina front Member Of crown';
    mesh.position.set(.045,y,z);mesh.rotation.y=rotation;group.add(mesh);
    const c=canvas.getContext('2d');
    const gradient=c.createLinearGradient(0,0,0,384);
    gradient.addColorStop(0,'#8b124f');gradient.addColorStop(.22,'#ec319a');gradient.addColorStop(.48,'#ffc3e1');gradient.addColorStop(.74,'#db147b');gradient.addColorStop(1,'#7c0c45');
    c.fillStyle=gradient;c.fillRect(0,0,1536,384);
    c.strokeStyle='#291624';c.lineWidth=18;c.beginPath();c.roundRect(12,12,1512,360,70);c.stroke();
    c.textAlign='center';c.textBaseline='middle';c.font='italic 106px Georgia, serif';
    c.lineWidth=9;c.strokeStyle='#7c3457';c.strokeText('Member Of',768,98,1320);c.lineWidth=3;c.strokeStyle='#e7ffe8';c.strokeText('Member Of',768,98,1320);c.fillStyle='#c5f2cf';c.fillText('Member Of',768,98,1320);
    c.font='900 188px Georgia, serif';c.lineWidth=19;c.strokeStyle='#331925';c.strokeText('S & S Group',768,261,1410);c.fillStyle='#ffe22e';c.fillText('S & S Group',768,261,1410);
    texture.needsUpdate=true;
  }
  crown(1.46,.255,2.87,4.586,0);
  crown(1.53,.29,2.71,-4.955,Math.PI);
  // A narrow black-green sunstrip backs the upper Sinhala stickers. It stops
  // above the main viewing area and leaves the center divider unobscured.
  const sunstripMaterial=new THREE.MeshStandardMaterial({
    color:'#071b17',transparent:true,opacity:.94,roughness:.36,
    depthWrite:false,
  });
  for (const x of [-.435,.525]) {
    const band=new THREE.Mesh(new THREE.PlaneGeometry(.94,.29),sunstripMaterial);
    band.name='Dam Rejina upper windshield dark sticker backing';
    band.position.set(x,2.29,4.56);group.add(band);
  }
  // Separate white-edged red Sinhala decals sit high on each windshield half.
  // A clear center leaves the chrome division unobscured, as on the real bus.
  for (const [x,text] of [[-.465,'දම්'],[.555,'රැජිණ']]) {
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(.89,.205),new THREE.MeshStandardMaterial({map:texture,transparent:true,depthWrite:false,roughness:.45}));
    mesh.name=`Dam Rejina upper windshield ${text}`;mesh.position.set(x,2.27,4.565);group.add(mesh);
    function draw(){
      const c=canvas.getContext('2d');c.clearRect(0,0,1024,256);c.textAlign='center';c.textBaseline='middle';
      c.font='italic 900 196px "Bus Sinhala", sans-serif';
      c.lineJoin='round';c.lineWidth=40;c.strokeStyle='#12282a';c.strokeText(text,512,127,940);
      c.lineWidth=25;c.strokeStyle='#e4ffef';c.strokeText(text,512,127,940);
      c.lineWidth=10;c.strokeStyle='#28383c';c.strokeText(text,512,127,940);
      c.fillStyle='#ed277c';c.fillText(text,512,127,940);texture.needsUpdate=true;
    }
    draw();redraw.push(draw);
  }
  function rearArtwork(w,h,y,z,name,draw) {
    const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=768;
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:texture,roughness:.5}));
    mesh.name=name;mesh.rotation.y=Math.PI;mesh.position.set(.045,y,z);group.add(mesh);
    const redrawPanel=()=>{draw(canvas.getContext('2d'));texture.needsUpdate=true;};
    redrawPanel();redraw.push(redrawPanel);
  }
  rearArtwork(1.8,.70,2.12,-4.96,'Dam Rejina rear automotive and Sinhala window stickers',c=>{
    c.fillStyle='#090e12';c.fillRect(0,0,1536,768);
    c.strokeStyle='#778080';c.lineWidth=12;c.beginPath();c.roundRect(9,9,1518,750,64);c.stroke();
    // Gold gear emblem and lettering occupy the left of the dark window.
    c.save();c.translate(283,196);c.fillStyle='#e1b333';
    for(let i=0;i<10;i++){c.rotate(Math.PI/5);c.fillRect(-25,-139,50,62);}
    c.beginPath();c.arc(0,0,115,0,Math.PI*2);c.fill();c.fillStyle='#090e12';c.beginPath();c.arc(0,0,76,0,Math.PI*2);c.fill();c.restore();
    c.textAlign='center';c.textBaseline='middle';c.font='italic 900 83px Georgia, serif';c.strokeStyle='#d6bc5d';c.lineWidth=5;c.strokeText('AUTOMOTIVE',278,286,467);c.fillStyle='#fcf6d8';c.fillText('AUTOMOTIVE',278,286,467);
    c.textAlign='left';c.font='bold 30px sans-serif';c.fillStyle='#e6e8e8';
    c.fillText('BEYOND THE REALM OF IMAGINATION',574,99,866);
    c.font='bold 28px sans-serif';
    ['STICKERS • WRAPS & PAINTING • LIGHT CONVERSION','SOUND SYSTEMS • CUSTOM INTERIORS','ACCESSORIES & BUS STYLING'].forEach((line,i)=>c.fillText(line,574,159+i*48,866));
    c.fillStyle='#d51c18';c.fillRect(570,299,880,65);c.font='900 35px sans-serif';c.fillStyle='#ffd53a';c.fillText('ALL KIND OF BUS MODIFICATIONS',590,334,837);
    c.textAlign='center';c.font='italic 900 188px "Bus Sinhala", sans-serif';c.lineJoin='round';
    c.lineWidth=28;c.strokeStyle='#e8eeeb';c.strokeText('දම් රැජිණ',768,514,1400);c.lineWidth=13;c.strokeStyle='#17232b';c.strokeText('දම් රැජිණ',768,514,1400);c.fillStyle='#df2771';c.fillText('දම් රැජිණ',768,514,1400);
    c.font='600 65px "Bus Sinhala", sans-serif';c.fillStyle='#e6d53c';c.fillText('ඔබ ප්‍රවාහන සේවයේ අගරැජිණිය',768,679,1340);
  });
  rearArtwork(1.8,.46,.83,-4.96,'Dam Rejina lower rear black booking vent',c=>{
    c.fillStyle='#080b0d';c.fillRect(0,0,1536,768);c.strokeStyle='#667072';c.lineWidth=15;c.beginPath();c.roundRect(9,9,1518,750,75);c.stroke();
    c.strokeStyle='#181d20';c.lineWidth=4;for(let x=35;x<1510;x+=14){c.beginPath();c.moveTo(x,25);c.lineTo(x,654);c.stroke();}
    c.textAlign='center';c.font='bold 60px sans-serif';c.fillStyle='#efefec';c.fillText('Online Booking/www.dhamrajini.lk',768,702,1390);
  });
  rearArtwork(2.03,.24,.22,-4.99,'Dam Rejina Purple Queen Voyage mudflap banner',c=>{
    c.fillStyle='#b71722';c.fillRect(0,0,1536,768);c.strokeStyle='#bab4a6';c.lineWidth=28;c.strokeRect(7,7,1522,754);
    c.textAlign='center';c.textBaseline='middle';c.font='italic 900 241px Georgia, serif';c.strokeStyle='#56393b';c.lineWidth=10;c.strokeText('Purple Queen Voyage',768,284,1450);c.fillStyle='#e9e7d9';c.fillText('Purple Queen Voyage',768,284,1450);
    c.font='italic bold 87px Georgia, serif';c.fillText("Nobody’s Perfect, Xcept The Queen...",768,586,1370);
  });
  if(frontMural){
    const texture=new THREE.Texture(frontMural);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;
    const mural=new THREE.Mesh(new THREE.PlaneGeometry(1.12,.69),new THREE.MeshStandardMaterial({map:texture,roughness:.48}));
    mural.name='Dam Rejina macaw grille mural';mural.position.set(.05,1.20,4.71);group.add(mural);
  }
  // Reference front: a small maker badge above the mural, with the decorated
  // Sinhala nameplate below it. Neither label blocks the central bird painting.
  sign(.77,.065,.045,1.605,4.75,0,'ASHOK LEYLAND','','#392034','#d9d9d9');
  sign(.53,.13,.78,.69,4.94,0,'NB - 4110','','#f2efdd','#28202a');
  sign(.55,.17,.045,1.40,-5.005,Math.PI,'NB - 4110','','#e4b852','#28202a');
  function frontArtwork(w,h,x,y,z,name,draw) {
    const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=256;
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:texture,roughness:.45}));
    mesh.name=name;mesh.position.set(x,y,z);group.add(mesh);
    const redrawPanel=()=>{draw(canvas.getContext('2d'));texture.needsUpdate=true;};
    redrawPanel();redraw.push(redrawPanel);
  }
  frontArtwork(1.1,.16,.045,.76,4.79,'Dam Rejina ornate Sinhala front nameplate',c=>{
    c.fillStyle='#192629';c.fillRect(0,0,1536,256);
    c.strokeStyle='#cad9d5';c.lineWidth=11;c.strokeRect(7,7,1522,242);
    c.textAlign='center';c.textBaseline='middle';c.lineJoin='round';c.font='italic 900 191px "Bus Sinhala", sans-serif';
    c.lineWidth=27;c.strokeStyle='#d8ebe2';c.strokeText('දම් රැජිණ',768,133,1400);
    c.lineWidth=13;c.strokeStyle='#34333f';c.strokeText('දම් රැජිණ',768,133,1400);
    c.fillStyle='#e72f82';c.fillText('දම් රැජිණ',768,133,1400);
    // Rows of tiny rivets follow the polished surround in the close front view.
    for(let x=26;x<1530;x+=35){c.fillStyle='#f0f4eb';c.beginPath();c.arc(x,18,4,0,Math.PI*2);c.fill();}
  });
  frontArtwork(2.08,.29,.045,.50,4.87,'Dam Rejina pink purple white bumper camouflage',c=>{
    c.fillStyle='#df1482';c.fillRect(0,0,1536,256);
    let seed=4110;
    const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<38;i++){
      const x=random()*1650-60,y=random()*320-30,w=40+random()*100,h=25+random()*90;
      c.fillStyle=['#54124e','#8d1c73','#f2dfeb','#ff72c3'][i%4];
      c.beginPath();c.moveTo(x-w,y-h*.2);c.lineTo(x-w*.3,y-h*.8);c.lineTo(x+w*.4,y-h*.7);
      c.lineTo(x+w*.25,y-h*.05);c.lineTo(x+w,y+h*.1);c.lineTo(x+w*.6,y+h*.75);
      c.lineTo(x,y+h*.45);c.lineTo(x-w*.6,y+h);c.closePath();c.fill();
    }
  });
  loadRearTextFont().then(()=>redraw.forEach(draw=>draw()));
  return group;
}
