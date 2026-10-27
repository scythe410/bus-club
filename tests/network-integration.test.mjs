import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createBusServer} from '../server.mjs';
import {RoomClient} from '../src/network.js';
import {WebSocket} from 'ws';

const waitUntil=async(predicate,label)=>{
  const end=Date.now()+2500;
  while(!predicate()){
    if(Date.now()>end)throw Error(`Timed out waiting for ${label}`);
    await new Promise(resolve=>setTimeout(resolve,10));
  }
};
const profile=name=>({name,skin:{modelId:'nil-kirilli',color:'#148ddd',accent:'#ffffff',name,destination:'99',image:null}});

test('real RoomClients preserve profiles and motion through membership deltas, edits and departure',async()=>{
  const app=createBusServer();app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
  const previousLocation=globalThis.location,previousWebSocket=globalThis.WebSocket;
  globalThis.location={protocol:'http:',host:`127.0.0.1:${app.server.address().port}`,href:`http://127.0.0.1:${app.server.address().port}/`};
  globalThis.WebSocket=WebSocket;
  const states={host:{peers:[]},peer:{peers:[]},late:{peers:[]}},clients=[];
  const client=key=>{const value=new RoomClient({onRoom:room=>{states[key].room=room;},onPeers:peers=>{states[key].peers=peers;}});clients.push(value);return value;};
  try{
    const host=client('host');await host.create(profile('Host'));
    const peer=client('peer');await peer.join(host.code,profile('Friend'));
    await waitUntil(()=>states.host.peers.length===1,'second member');
    const hostId=host.selfId,friendId=peer.selfId;
    const hostSkin=states.peer.peers.find(p=>p.id===hostId).skin;
    const pose=states.host.room.players.find(p=>p.id===hostId);
    host.sendState({...pose,z:pose.z+1,speed:0,paused:true});
    await waitUntil(()=>states.peer.peers.some(p=>p.id===hostId&&p.z===pose.z+1),'motion sample');
    const late=client('late');await late.join(host.code,profile('Late friend'));
    await waitUntil(()=>states.peer.peers.length===2,'late member delta');
    const existingHost=states.peer.peers.find(p=>p.id===hostId);
    assert.equal(existingHost.skin,hostSkin,'joining another member must preserve the existing skin object');
    assert.equal(existingHost.z,pose.z+1,'membership updates must preserve the latest motion');
    host.updateProfile(profile('Edited host'));
    await waitUntil(()=>states.peer.peers.some(p=>p.id===hostId&&p.name==='Edited host'),'profile delta');
    assert.equal(states.peer.peers.find(p=>p.id===hostId).z,pose.z+1);
    peer.leave();
    await waitUntil(()=>states.host.peers.length===1&&!states.host.peers.some(p=>p.id===friendId),'departure delta');
    await new Promise(resolve=>setTimeout(resolve,150));
    assert.equal(states.host.peers.length,1,'later snapshots must not resurrect a departed member');
    assert.equal(states.late.peers.length,1);
  }finally{
    for(const value of clients)value.leave();
    globalThis.location=previousLocation;globalThis.WebSocket=previousWebSocket;
    await app.close();
  }
});
