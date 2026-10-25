// IDs are saved in skin profiles and shared with the convoy. Keep them stable.
export const BUS_MODELS = Object.freeze([
  Object.freeze({id:'nil-kirilli',name:'Nil Kirilli',subtitle:'Blue Chick 02',description:'Ocean blue · blue touring cabin',color:'#0876dc',accent:'#e9d399',cockpit:'#103b75'}),
  Object.freeze({id:'dam-rejina',name:'Dam Rajina',subtitle:'S & S Group',description:'Magenta pink · decorated touring cabin',color:'#dc1689',accent:'#f5d76b',cockpit:'#59133f'}),
]);
export const BUS_MODEL_IDS = Object.freeze(BUS_MODELS.map(model=>model.id));
export const normalizeBusModelId = value => BUS_MODEL_IDS.includes(value) ? value : BUS_MODEL_IDS[0];
export const getBusModelSpec = value => BUS_MODELS.find(model=>model.id===normalizeBusModelId(value));
