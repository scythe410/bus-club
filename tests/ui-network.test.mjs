import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RoomClient} from '../src/network.js';

class Socket extends EventTarget {
  static OPEN=1;
  static instances=[];
  constructor(url){super();this.url=url;this.readyState=0;Socket.instances.push(this);}
  send(){}
  close(){this.readyState=3;this.dispatchEvent(new Event('close'));}
  message(value){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(value)}));}
}

test('convoy connection stays pending until a room arrives, and failures/cancellation settle it',async()=>{
  const previousSocket=globalThis.WebSocket,previousLocation=globalThis.location;
  globalThis.WebSocket=Socket;globalThis.location={protocol:'http:',host:'localhost:5173'};
  try{
    const statuses=[];const client=new RoomClient({onStatus:status=>statuses.push(status)});
    let settled=false;
    const pending=client.join(' abc123 ',{}).then(room=>{settled=true;return room;});
    await Promise.resolve();
    assert.equal(settled,false,'Connecting buttons must remain pending while the server has not replied');
    const socket=Socket.instances.at(-1);
    assert.equal(new URL(socket.url).searchParams.get('room'),'ABC123');
    socket.message({type:'room',code:'ABC123',selfId:'one',players:[]});
    assert.equal((await pending).code,'ABC123');
    socket.message({type:'room',code:'ABC123',selfId:'one',players:[{id:'one',name:'Updated driver'}]});
    assert.equal(statuses.filter(status=>status==='connected').length,1,'profile broadcasts must not repeat the connection announcement');

    const failed=client.join('BADBAD',{});
    const failure=assert.rejects(failed,/Room not found/);
    Socket.instances.at(-1).message({type:'error',message:'Room not found'});
    await failure;

    const cancelled=client.join('ABC123',{});
    const cancellation=assert.rejects(cancelled,/cancelled/);
    client.leave();await cancellation;
    assert.equal(client.pendingConnection,null);

    const disconnected=client.join('ABC123',{});
    const closed=assert.rejects(disconnected,/connection closed/);
    Socket.instances.at(-1).close();await closed;
    assert.equal(client.pendingConnection,null);
  }finally{
    globalThis.WebSocket=previousSocket;
    if(previousLocation===undefined)delete globalThis.location;else globalThis.location=previousLocation;
  }
});

test('repeated collision corrections do not rewind a bus after it resumes moving',async()=>{
  const previousSocket=globalThis.WebSocket,previousLocation=globalThis.location;
  globalThis.WebSocket=Socket;globalThis.location={protocol:'http:',host:'localhost:5173'};
  const corrections=[];const client=new RoomClient({onCollision:state=>corrections.push(state)});
  try{
    const pending=client.join('ABC123',{}),socket=Socket.instances.at(-1);
    socket.message({type:'room',code:'ABC123',selfId:'one',players:[{id:'one',collisionRevision:0}]});await pending;
    const state={x:0,z:10,yaw:0,speed:10,collisionRevision:1};
    socket.message({type:'collision',state});
    socket.message({type:'collision',state});
    socket.message({type:'collision',state:{...state,collisionRevision:0}});
    assert.equal(corrections.length,1,'a correction is applied once even while stale outgoing states are in flight');
    socket.message({type:'room',code:'ABC123',selfId:'one',players:[{id:'one',collisionRevision:0}]});
    assert.equal(client.collisionRevision,1,'profile broadcasts cannot regress the acknowledgement');
    socket.message({type:'collision',state:{...state,z:11,collisionRevision:2}});
    assert.equal(corrections.length,2);assert.equal(client.collisionRevision,2);
  }finally{
    client.leave();globalThis.WebSocket=previousSocket;
    if(previousLocation===undefined)delete globalThis.location;else globalThis.location=previousLocation;
  }
});

test('profile and roster deltas retain motion sample clocks and reject repeated snapshots',async()=>{
  const previousSocket=globalThis.WebSocket,previousLocation=globalThis.location;
  globalThis.WebSocket=Socket;globalThis.location={protocol:'http:',host:'localhost:5173'};
  const rooms=[],peers=[];const client=new RoomClient({onRoom:room=>rooms.push(room),onPeers:players=>peers.push(players)});
  try{
    const pending=client.join('ABC123',{}),socket=Socket.instances.at(-1);
    const own={id:'self',x:0,z:0,yaw:0,speed:0,stateTime:1000,stateSeq:0};
    const friendSkin={name:'Sign',image:'/skin?room=ABC123&player=peer&revision=1&field=image'};
    const friend={id:'peer',name:'Peer',skin:friendSkin,profileRevision:1,x:20,z:1,yaw:0,speed:10,stateTime:1000,stateSeq:0};
    socket.message({type:'room',code:'ABC123',selfId:'self',time:1066,players:[own,friend]});await pending;
    const initial=client.players.get('peer'),stamp=initial._sampleTime,skin=initial.skin;
    assert.equal(skin.image,'http://localhost:5173/skin?room=ABC123&player=peer&revision=1&field=image','initial room skins resolve against the WebSocket host');
    socket.message({type:'snapshot',time:1200,players:[friend]});
    assert.equal(client.players.get('peer'),initial,'repeated server state retains sample age and object identity');
    socket.message({type:'snapshot',time:1300,players:[{...friend,x:999,stateSeq:-1}]});
    assert.equal(client.players.get('peer').x,20,'older state cannot rewind a player');
    socket.message({type:'profile',time:1400,player:{id:'peer',name:'Renamed',skin:{...friendSkin},profileRevision:2}});
    assert.equal(client.players.get('peer').name,'Renamed');assert.equal(client.players.get('peer').skin,skin);
    assert.equal(client.players.get('peer')._sampleTime,stamp,'profile-only edits cannot retime motion');
    socket.message({type:'profile',time:1500,player:{id:'peer',name:'Old name',skin:{name:'Old'},profileRevision:1}});
    assert.equal(client.players.get('peer').name,'Renamed');
    socket.message({type:'player',time:1600,player:{...friend,id:'new',stateSeq:0,stateTime:1600}});
    assert.equal(client.players.size,3);assert.equal(peers.at(-1).length,2);
    assert.equal(client.players.get('new').skin.image,skin.image,'member deltas retain resolved asset URLs');
    socket.message({type:'left',time:1700,playerId:'new'});
    assert.equal(client.players.size,2);assert.equal(rooms.at(-1).players.length,2);
    socket.message({type:'snapshot',time:1800,players:[{...friend,z:9,stateTime:1800,stateSeq:1}]});
    assert.equal(client.players.get('peer').z,9);assert.equal(client.players.get('peer').stateSeq,1);
    assert.ok(client.players.get('peer')._sampleTime>stamp);
  }finally{
    client.leave();globalThis.WebSocket=previousSocket;
    if(previousLocation===undefined)delete globalThis.location;else globalThis.location=previousLocation;
  }
});
