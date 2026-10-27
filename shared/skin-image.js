// Inspect headers only: never inflate attacker-controlled image data on the server.
export const MAX_IMAGE_BYTES = 192 * 1024; // Includes the data-URL/base64 overhead.
export const MAX_IMAGE_DIMENSION = 2048;
export const MAX_IMAGE_PIXELS = 2 * 1024 * 1024;
export const isImageField = key => /image|decal|livery/i.test(key);
const invalid = () => { throw Error('Use a static PNG, JPEG or WebP skin up to 2048 pixels per side and 2 megapixels.'); };
const dimensions = (width,height) => {
  if(!width||!height||width>MAX_IMAGE_DIMENSION||height>MAX_IMAGE_DIMENSION||width*height>MAX_IMAGE_PIXELS)invalid();
  return {width,height};
};
const ascii = (bytes,start,length) => String.fromCharCode(...bytes.subarray(start,start+length));

function png(bytes,view) {
  if(bytes.length<45||!bytes.subarray(0,8).every((n,i)=>n===[137,80,78,71,13,10,26,10][i]))invalid();
  let size,hasData=false,ended=false;
  for(let offset=8;offset<bytes.length;) {
    if(offset+12>bytes.length)invalid();
    const length=view.getUint32(offset),type=ascii(bytes,offset+4,4),end=offset+12+length;
    if(end>bytes.length)invalid();
    if(offset===8) {
      if(type!=='IHDR'||length!==13)invalid();
      size=dimensions(view.getUint32(offset+8),view.getUint32(offset+12));
      const depth=bytes[offset+16],color=bytes[offset+17];
      const depths={0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};
      if(!depths[color]?.includes(depth)||bytes[offset+18]!==0||bytes[offset+19]!==0||bytes[offset+20]>1)invalid();
    // Compressed metadata can expand independently of the raster dimensions.
    // Keep ordinary sRGB/gamma chunks; uploaded skins need no embedded text/ICC.
    }else if(type==='IHDR'||['acTL','fcTL','fdAT','iCCP','zTXt','iTXt'].includes(type))invalid();
    if(type==='IDAT')hasData=true;
    if(type==='IEND') {
      if(length!==0||!hasData||end!==bytes.length)invalid();
      ended=true;
    }
    offset=end;
  }
  if(!ended)invalid();
  return size;
}

function jpeg(bytes,view) {
  if(bytes[0]!==255||bytes[1]!==216)invalid();
  let offset=2,size,scanned=false;
  // Walk markers even after SOS; progressive scans are allowed, replacement
  // frames/DNL and concatenated images cannot override the bounded dimensions.
  while(offset<bytes.length) {
    if(bytes[offset++]!==255) {if(scanned)continue;invalid();}
    while(bytes[offset]===255)offset++;
    if(offset>=bytes.length)invalid();
    const marker=bytes[offset++];
    if(scanned&&(marker===0||(marker>=208&&marker<=215)))continue;
    if(marker===217) {if(!size||!scanned||offset!==bytes.length)invalid();return size;}
    if(marker===216||marker===220||marker===222||marker===223||offset+2>bytes.length)invalid();
    const length=view.getUint16(offset),end=offset+length;
    if(length<2||end>bytes.length)invalid();
    if(marker>=192&&marker<=207&&![196,200,204].includes(marker)) {
      if(size||![192,193,194].includes(marker)||length<11)invalid();
      const components=bytes[offset+7];
      if(components<1||components>4||length!==8+3*components)invalid();
      size=dimensions(view.getUint16(offset+5),view.getUint16(offset+3));
    }
    if(marker===218){if(!size||length<6)invalid();scanned=true;}
    offset=end;
  }
  invalid();
}

function webp(bytes,view) {
  if(bytes.length<20||ascii(bytes,0,4)!=='RIFF'||ascii(bytes,8,4)!=='WEBP'||view.getUint32(4,true)!==bytes.length-8)invalid();
  let canvas,size;
  for(let offset=12;offset<bytes.length;) {
    if(offset+8>bytes.length)invalid();
    const type=ascii(bytes,offset,4),length=view.getUint32(offset+4,true),start=offset+8,end=start+length;
    if(end+(length&1)>bytes.length)invalid();
    if(type==='ANIM'||type==='ANMF')invalid();
    if(type==='VP8X') {
      if(offset!==12||length!==10||(bytes[start]&0xc3)!==0)invalid();
      const uint24=p=>bytes[p]+bytes[p+1]*256+bytes[p+2]*65536;
      canvas=dimensions(uint24(start+4)+1,uint24(start+7)+1);
    }
    if(type==='VP8 '||type==='VP8L') {
      if(size)invalid();
      if(type==='VP8 ') {
        if(length<10||(bytes[start]&1)||ascii(bytes,start+3,3)!=='\x9d\x01\x2a')invalid();
        size=dimensions(view.getUint16(start+6,true)&0x3fff,view.getUint16(start+8,true)&0x3fff);
      }else{
        if(length<5||bytes[start]!==47)invalid();
        const bits=view.getUint32(start+1,true);
        if(bits>>>29)invalid();
        size=dimensions((bits&0x3fff)+1,((bits>>>14)&0x3fff)+1);
      }
    }
    offset=end+(length&1);
  }
  if(!size||canvas&&(canvas.width!==size.width||canvas.height!==size.height))invalid();
  return size;
}

export function decodeSkinImage(value) {
  if(typeof value!=='string')invalid();
  if(value.length>MAX_IMAGE_BYTES)throw Error('Use a PNG, JPEG or WebP skin smaller than 192 KB.');
  const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if(!match||match[2].length%4!==0)invalid();
  let bytes;
  try {bytes=Uint8Array.from(atob(match[2]),character=>character.charCodeAt(0));}catch{invalid();}
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const size=match[1]==='image/png'?png(bytes,view):match[1]==='image/jpeg'?jpeg(bytes,view):webp(bytes,view);
  return {contentType:match[1],bytes,...size};
}
