import {decodeSkinImage,isImageField} from './skin-image.js';

const DEFAULT_SKIN={color:'#f4a261',secondary:'#fff5df',pattern:'stripe',text:'BUS CLUB',image:null};

/** One protocol validator for Node and Cloudflare; never publish unchecked artwork. */
export function validProfile(input={}) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid player profile.');
  const name=String(input.name??'Driver').trim().slice(0,24)||'Driver';
  const skin=input.skin??DEFAULT_SKIN;
  if(!skin||typeof skin!=='object'||Array.isArray(skin)||Object.keys(skin).length>16)throw Error('Invalid bus skin.');
  const clean={};
  for(const [key,value] of Object.entries(skin)) {
    if(!/^[a-zA-Z][a-zA-Z0-9]{0,23}$/.test(key))throw Error('Invalid skin property.');
    if(value===null){clean[key]=null;continue;}
    if(typeof value!=='string')throw Error('Skin properties must be text.');
    if(isImageField(key)) {
      if(value===''){clean[key]=null;continue;}
      decodeSkinImage(value);
    }else if(key==='rearText'?value.length>80||/[\u0000-\u0009\u000b-\u001f]/.test(value)||value.split('\n').length>2:value.length>80||/[\u0000-\u001f]/.test(value))throw Error('Skin text is too long or contains invalid line breaks.');
    clean[key]=value;
  }
  return {name,skin:clean};
}
