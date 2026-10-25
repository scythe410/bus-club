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
