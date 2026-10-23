import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({command,mode}) => {
  const env=loadEnv(mode,process.cwd(),'');
  return {
    define: command==='build' ? {'import.meta.env.VITE_WS_URL':JSON.stringify(env.VITE_WS_URL || 'wss://bus-club-rooms.neuralshift-games.workers.dev/ws')} : {},
    server:{host:'0.0.0.0',proxy:{'/ws':{target:'ws://127.0.0.1:8787',ws:true},'/health':'http://127.0.0.1:8787'}},
    build:{target:'es2022',sourcemap:false},
  };
});
