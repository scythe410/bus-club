import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Exercise the production room handler with hibernating socket attachments.
const source=(await readFile(new URL('../worker/room.js',import.meta.url),'utf8'))
 .replace("import {DurableObject} from 'cloudflare:workers';",'class DurableObject {}')
 .replaceAll("'../shared/",`'${new URL('../shared/',import.meta.url).href}`);
const {BusRoom}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
function socket(id,joined=true){return {readyState:1,data:{id,joined,windowStart:Date.now(),messages:0},messages:[],deserializeAttachment(){return {...this.data};},serializeAttachment(data){this.data={...data};},send(raw){this.messages.push(JSON.parse(raw));}};}
test('Cloudflare room relays nine valid sounds, persists cooldown and excludes sender/unjoined sockets',()=>{
 const host=socket('host'),peer=socket('peer'),pending=socket('pending',false);
 const room=Object.create(BusRoom.prototype);room.ctx={getWebSockets:()=>[host,peer,pending]};
 for(let soundId=1;soundId<=9;soundId++){
  host.data.soundAt=Date.now()-601;
  room.webSocketMessage(host,JSON.stringify({type:'sound',soundId,playerId:'spoof'}));
 }
 assert.deepEqual(peer.messages.map(m=>m.soundId),[1,2,3,4,5,6,7,8,9]);
 assert.ok(peer.messages.every(m=>m.playerId==='host'));
 room.webSocketMessage(host,JSON.stringify({type:'sound',soundId:1}));
 assert.equal(peer.messages.length,9);
 assert.equal(host.messages.length,0);assert.equal(pending.messages.length,0);
 room.webSocketMessage(host,JSON.stringify({type:'sound',soundId:10}));
 assert.equal(host.messages.at(-1).message,'Invalid sound.');
 room.webSocketMessage(pending,JSON.stringify({type:'sound',soundId:1}));
 assert.equal(pending.messages.at(-1).message,'Join a convoy first.');
});
