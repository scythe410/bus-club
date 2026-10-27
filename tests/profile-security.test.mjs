import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decodeSkinImage,MAX_IMAGE_BYTES} from '../shared/skin-image.js';
import {validProfile} from '../shared/profile.js';
import {profileImage,publicProfile} from '../shared/skin-assets.js';
import {png,alternatePng,jpeg,webp,imageBytes} from './fixtures/skin-images.mjs';

const data=(bytes,type='png')=>`data:image/${type};base64,${bytes.toString('base64')}`;
function oversizedPng(width=16384,height=16384){
  const bytes=imageBytes(png);bytes.writeUInt32BE(width,16);bytes.writeUInt32BE(height,20);
  // Inspect headers only; invalid dimensions must never reach a native decoder.
  return data(bytes);
}
const chunk=(name,body)=>{
  const bytes=Buffer.alloc(body.length+12);bytes.writeUInt32BE(body.length);bytes.write(name,4);body.copy(bytes,8);return bytes;
};
const injectPng=(name,body)=>{const bytes=imageBytes(png);return data(Buffer.concat([bytes.subarray(0,33),chunk(name,body),bytes.subarray(33)]));};
const riff=chunks=>{const body=Buffer.concat(chunks),header=Buffer.alloc(12);header.write('RIFF');header.writeUInt32LE(body.length+4,4);header.write('WEBP',8);return data(Buffer.concat([header,body]),'webp');};
const webpChunk=(name,body)=>{const b=Buffer.alloc(8+body.length+(body.length&1));b.write(name);b.writeUInt32LE(body.length,4);body.copy(b,8);return b;};

test('bounded real PNG, JPEG and WebP images retain their exact original bytes',()=>{
  for(const image of [png,alternatePng,jpeg,webp]){
    const asset=decodeSkinImage(validProfile({name:'Driver',skin:{image}}).skin.image);
    assert.equal(asset.width,1);assert.equal(asset.height,1);
    assert.deepEqual(Buffer.from(asset.bytes),imageBytes(image));
  }
});

test('small encoded oversized dimensions and excessive total pixels are rejected before decoding',()=>{
  for(const [w,h] of [[0,1],[1,0],[2049,1],[1,2049],[2048,1025],[16384,16384]]){
    const image=oversizedPng(w,h);assert.ok(image.length<MAX_IMAGE_BYTES);
    assert.throws(()=>validProfile({skin:{image}}),/2048|megapixels/);
  }
});

test('every artwork field rejects arbitrary URLs, scripts, SVG and MIME spoofing',()=>{
  for(const field of ['image','decal','livery','sideImage'])for(const image of [
    'https://attacker.invalid/huge.png','//attacker.invalid/a','/assets/a.png','javascript:alert(1)',
    'data:image/svg+xml;base64,PHN2Zy8+',png.replace('image/png','image/jpeg')
  ])assert.throws(()=>validProfile({skin:{[field]:image}}));
  assert.equal(validProfile({skin:{image:''}}).skin.image,null);
  assert.equal(validProfile({skin:{image:null}}).skin.image,null);
});

test('encoded limits, malformed base64, truncated and duplicate image headers fail closed',()=>{
  assert.throws(()=>decodeSkinImage('data:image/png;base64,'+'A'.repeat(MAX_IMAGE_BYTES)),/192 KB/);
  for(const image of ['data:image/png;base64,AAAA=','data:image/png;base64,!!!!',data(Buffer.alloc(64)),
    data(imageBytes(png).subarray(0,32)),injectPng('IHDR',imageBytes(png).subarray(16,29))])assert.throws(()=>decodeSkinImage(image));
});

test('PNG/WebP animation and compressed PNG metadata cannot multiply decode work',()=>{
  for(const type of ['acTL','fcTL','fdAT','iCCP','zTXt','iTXt'])assert.throws(()=>decodeSkinImage(injectPng(type,Buffer.alloc(8))));
  const extended=Buffer.alloc(10);extended[0]=2;
  assert.throws(()=>decodeSkinImage(riff([webpChunk('VP8X',extended),imageBytes(webp).subarray(12)])));
  assert.throws(()=>decodeSkinImage(riff([webpChunk('ANIM',Buffer.alloc(6)),imageBytes(webp).subarray(12)])));
});

test('WebP validates both canvas and frame dimensions plus RIFF/chunk bounds',()=>{
  const frame=imageBytes(webp).subarray(12),canvas=Buffer.alloc(10);
  assert.equal(decodeSkinImage(riff([webpChunk('VP8X',canvas),frame])).width,1);
  canvas.writeUIntLE(1,4,3);
  assert.throws(()=>decodeSkinImage(riff([webpChunk('VP8X',canvas),frame])));
  const huge=imageBytes(webp);huge.writeUInt16LE(4096,26);
  assert.throws(()=>decodeSkinImage(data(huge,'webp')));
  const truncated=imageBytes(webp);truncated.writeUInt32LE(1000,16);
  assert.throws(()=>decodeSkinImage(data(truncated,'webp')));
});

test('JPEG rejects dimension override markers and concatenated images',()=>{
  const bytes=imageBytes(jpeg),frame=bytes.indexOf(Buffer.from([255,192]));assert.ok(frame>0);
  const huge=Buffer.from(bytes);huge.writeUInt16BE(16384,frame+5);
  assert.throws(()=>decodeSkinImage(data(huge,'jpeg')));
  assert.throws(()=>decodeSkinImage(data(Buffer.concat([bytes,bytes]),'jpeg')));
  const dnl=Buffer.from(bytes);dnl[frame+1]=220;
  assert.throws(()=>decodeSkinImage(data(dnl,'jpeg')));
});

test('stored legacy artwork is checked when served and cache URLs opt into the new policy',()=>{
  const profile={name:'Driver',skin:{image:png},profileRevision:1};
  assert.equal(profileImage(profile,'image','1').width,1);
  assert.equal(profileImage({...profile,skin:{image:oversizedPng()}},'image','1'),null);
  const url=new URL(publicProfile(profile,'one','ABC123').skin.image,'https://example.test');
  assert.equal(url.searchParams.get('policy'),'2');
  assert.equal(publicProfile({...profile,skin:{image:'https://attacker.invalid/a'}},'one','ABC123').skin.image,null);
});

test('profile structure and text limits remain shared and bounded',()=>{
  for(const value of [null,[],1,'bad'])assert.throws(()=>validProfile(value));
  for(const skin of [[],{bad:1},{'__bad':'x'},{rearText:'a\nb\nc'},{destination:'x'.repeat(81)}])assert.throws(()=>validProfile({skin}));
  assert.equal(validProfile({name:'  Driver  ',skin:{rearText:'සුබ ගමන්\nSafe travels'}}).name,'Driver');
});
