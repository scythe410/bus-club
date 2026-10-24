import {spawnState} from './shared/spawn.js';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';

export const MAX_IMAGE_BYTES = 192 * 1024;
const MAX_PAYLOAD = MAX_IMAGE_BYTES + 4096;
const ROOM_SIZE = 8;
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2','.ttf':'font/ttf','.glb':'model/gltf-binary'};

const DEFAULT_SKIN = {color:'#f4a261', secondary:'#fff5df', pattern:'stripe', text:'BUS CLUB', image:null};
function validProfile(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Invalid player profile.');
  const name = String(input.name ?? 'Driver').trim().slice(0,24) || 'Driver';
  const skin = input.skin ?? DEFAULT_SKIN;
  if (!skin || typeof skin !== 'object' || Array.isArray(skin) || Object.keys(skin).length > 16) throw Error('Invalid bus skin.');
  const clean = {};
  for (const [key,value] of Object.entries(skin)) {
    if (!/^[a-zA-Z][a-zA-Z0-9]{0,23}$/.test(key)) throw Error('Invalid skin property.');
    if (value === null) { clean[key] = null; continue; }
    if (typeof value !== 'string') throw Error('Skin properties must be text.');
    if (/image|decal|livery/i.test(key) && value.startsWith('data:')) {
      if (value.length > MAX_IMAGE_BYTES || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]*={0,2}$/.test(value)) throw Error('Use a PNG, JPEG or WebP skin smaller than 192 KB.');
    } else if (key==='rearText' ? value.length>80 || /[\u0000-\u0009\u000b-\u001f]/.test(value) || value.split('\n').length>2 : value.length>80 || /[\u0000-\u001f]/.test(value)) throw Error('Skin text is too long or contains invalid line breaks.');
    clean[key] = value;
  }
  return {name,skin:clean};
}
function validState(input) {
  if (!input || typeof input !== 'object') throw Error('Invalid bus position.');
  const result = {};
  for (const key of ['x','z','yaw','speed']) {
    if (typeof input[key] !== 'number' || !Number.isFinite(input[key]) || Math.abs(input[key]) > 1e7) throw Error('Invalid bus position.');
    result[key] = input[key];
  }
  result.y = Number.isFinite(input.y) && Math.abs(input.y) < 1e7 ? input.y : 0;
  return result;
}

export function createBusServer({dist = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist')} = {}) {
  const rooms = new Map();
  const root = path.resolve(dist);
  const server = http.createServer(async (req,res) => {
    const headers = {'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'};
    if (req.url?.split('?')[0] === '/health') {res.writeHead(200,{...headers,'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,rooms:rooms.size}));return;}
    if (req.method !== 'GET' && req.method !== 'HEAD') {res.writeHead(405,headers);res.end();return;}
    try {
      let pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').some(p=>p.startsWith('.'))) {res.writeHead(404,headers);res.end();return;}
      let target = path.resolve(root,'.' + pathname);
      if (target !== root && !target.startsWith(root + path.sep)) {res.writeHead(404,headers);res.end();return;}
      try {if ((await stat(target)).isDirectory()) target = path.join(target,'index.html');}
      catch {if (!path.extname(pathname)) target = path.join(root,'index.html');}
      const info = await stat(target);
      const etag = `W/"${info.size.toString(16)}-${info.mtimeMs.toString(16)}"`;
      const fingerprinted = path.relative(root,target).split(path.sep)[0] === 'assets';
      const assetHeaders = {...headers,'Content-Type':MIME[path.extname(target)] || 'application/octet-stream','Cache-Control':fingerprinted?'public, max-age=31536000, immutable':'no-cache','ETag':etag};
      if (req.headers['if-none-match']?.split(',').some(value=>value.trim()==='*'||value.trim().replace(/^W\//,'')===etag.replace(/^W\//,''))) {
        res.writeHead(304,assetHeaders);res.end();return;
      }
      if (req.method === 'HEAD') {res.writeHead(200,{...assetHeaders,'Content-Length':info.size});res.end();return;}
      const body = await readFile(target);
      res.writeHead(200,{...assetHeaders,'Content-Length':body.length});
      res.end(body);
    } catch {res.writeHead(404,headers);res.end('Not found');}
  });
  const wss = new WebSocketServer({noServer:true,maxPayload:MAX_PAYLOAD,perMessageDeflate:false});
  server.on('upgrade',(req,socket,head)=> {
    if (req.url?.split('?')[0] !== '/ws' || wss.clients.size >= 512) {socket.destroy();return;}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
  });
  function send(ws,message) {if (ws.readyState===WebSocket.OPEN && ws.bufferedAmount < MAX_PAYLOAD * 4) ws.send(typeof message==='string'?message:JSON.stringify(message));}
  function playerData(player) {return {id:player.id,name:player.name,skin:player.skin,...player.state};}
  function publishRoom(room) {
    const players = [...room.players.values()].map(playerData);
    for (const p of room.players.values()) send(p.ws,{type:'room',code:room.code,selfId:p.id,players});
  }
  function leave(ws) {
    if (!ws.room) return;
    const room = rooms.get(ws.room);
    room?.players.delete(ws.id);ws.room=null;
    if (room && !room.players.size) rooms.delete(room.code);
    else if (room) publishRoom(room);
  }
  wss.on('connection',ws=> {
    ws.id=randomUUID();ws.room=null;ws.alive=true;ws.windowStart=Date.now();ws.messages=0;ws.profileAt=0;
    ws.on('pong',()=>ws.alive=true);
    ws.on('error',()=>{});
    ws.on('close',()=>leave(ws));
    send(ws,{type:'connected',id:ws.id});
    ws.on('message',data=> {
      const now=Date.now();
      if (now-ws.windowStart>1000) {ws.windowStart=now;ws.messages=0;}
      if (++ws.messages>40) {send(ws,{type:'error',message:'Sending updates too quickly.'});if(ws.messages>80)ws.close(1008,'Rate limit');return;}
      try {
        const msg=JSON.parse(data.toString());
        if (!msg || typeof msg.type!=='string') throw Error('Invalid message.');
        if (msg.type==='ping') {send(ws,{type:'pong',time:now});return;}
        if (msg.type==='leave') {leave(ws);send(ws,{type:'left'});return;}
        if (msg.type==='create' || msg.type==='join') {
          const profile=validProfile(msg.profile ?? {name:msg.name,skin:msg.skin});
          let room;
          if (msg.type==='create') {
            if (rooms.size>=100) throw Error('The server is busy. Try again shortly.');
            let code;do {code=randomBytes(4).toString('hex').slice(0,6).toUpperCase();} while(rooms.has(code));
            room={code,players:new Map()};rooms.set(code,room);
          } else {
            if (typeof msg.code!=='string' || !/^[A-Z0-9]{6}$/.test(msg.code.toUpperCase())) throw Error('Enter a six-character room code.');
            room=rooms.get(msg.code.toUpperCase());
            if (!room) throw Error('Room not found. Ask your friend to create a convoy.');
            if (room.players.size>=ROOM_SIZE && !room.players.has(ws.id)) throw Error('This convoy is full (8 drivers).');
          }
          leave(ws);ws.room=room.code;
          room.players.set(ws.id,{id:ws.id,ws,...profile,state:spawnState([...room.players.values()])});
          // Reinsert when the same connection rejoins its otherwise empty room.
          rooms.set(room.code,room);publishRoom(room);return;
        }
        const room=rooms.get(ws.room);const player=room?.players.get(ws.id);
        if (!player) throw Error('Join a convoy first.');
        if (msg.type==='state') {player.state=validState(msg.state ?? msg);return;}
        if (msg.type==='profile') {
          if (now-ws.profileAt<300) throw Error('Please wait before updating your skin again.');
          Object.assign(player,validProfile(msg.profile ?? {name:msg.name,skin:msg.skin}));ws.profileAt=now;publishRoom(room);return;
        }
        throw Error('Unknown message.');
      } catch(error) {send(ws,{type:'error',message:error.message || 'Invalid message.'});}
    });
  });
  const snapshots=setInterval(()=> {
    for (const room of rooms.values()) {
      const players=[...room.players.values()].map(p=>({id:p.id,...p.state}));
      const snapshot=JSON.stringify({type:'snapshot',players,time:Date.now()});
      for (const p of room.players.values()) send(p.ws,snapshot);
    }
  },1000/15);
  const heartbeat=setInterval(()=> {
    for (const ws of wss.clients) {if (!ws.alive) {ws.terminate();continue;}ws.alive=false;ws.ping();}
  },30000);
  server.on('close',()=>{clearInterval(snapshots);clearInterval(heartbeat);for(const ws of wss.clients)ws.terminate();wss.close();});
  return {server,wss,rooms,close:()=>new Promise(resolve=>{for(const ws of wss.clients)ws.terminate();server.close(resolve);})};
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const {server}=createBusServer();const port=Number(process.env.PORT)||8787;
  server.listen(port,'0.0.0.0',()=>console.log(`Bus Club listening on http://localhost:${port}`));
}
