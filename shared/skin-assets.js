import {decodeSkinImage,isImageField} from './skin-image.js';

// Images travel over cacheable HTTP, independently of the motion WebSocket.
export function publicProfile(profile,id,code) {
  const skin={};
  for(const [field,value] of Object.entries(profile.skin||{})) {
    skin[field]=isImageField(field)
      ? typeof value==='string'&&value.startsWith('data:image/')
        ? `/skin?${new URLSearchParams({room:code,player:id,revision:String(profile.profileRevision||1),field,policy:'2'})}`
        : null
      : value;
  }
  return {name:profile.name,skin,profileRevision:profile.profileRevision||1};
}

export function profileImage(profile,field,revision) {
  if(!profile||String(profile.profileRevision||1)!==revision||!Object.hasOwn(profile.skin||{},field))return null;
  const value=profile.skin[field];
  if(typeof value!=='string')return null;
  // Recheck stored profiles too, including rooms created before a deployment.
  try{return decodeSkinImage(value);}
  catch{return null;}
}
