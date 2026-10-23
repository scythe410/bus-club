export {BusRoom} from './room.js';
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(url.pathname==='/health')return Response.json({ok:true});
    if(url.pathname==='/ws') {
      const code=(url.searchParams.get('room')??'').toUpperCase();
      if(!/^[A-Z0-9]{6}$/.test(code))return new Response('Invalid room code',{status:400});
      url.searchParams.set('room',code);
      return env.BUS_ROOM.getByName(code).fetch(new Request(url,request));
    }
    return env.ASSETS ? env.ASSETS.fetch(request) : Response.json({service:'Bus Club convoy server',ok:true});
  }
};
