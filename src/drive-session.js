/** Only the latest uncancelled request may start the currently selected bus. */
export function createDriveSession({getReady,activate,onUnavailable=()=>{}}) {
  let generation=0,pending=false;
  return {
    get pending(){return pending;},
    cancel(){generation++;pending=false;},
    async start(){
      const request=++generation;
      pending=true;
      try {
        while(request===generation){
          const ready=getReady();
          let loaded;
          try{loaded=await ready;}
          catch(error){
            if(request!==generation)return false;
            if(ready!==getReady())continue;
            throw error;
          }
          if(request!==generation)return false;
          if(ready!==getReady())continue;
          if(!loaded){onUnavailable();return false;}
          activate();
          return true;
        }
        return false;
      } finally {
        if(request===generation)pending=false;
      }
    },
  };
}
