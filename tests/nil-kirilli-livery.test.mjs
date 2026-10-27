import {test} from 'node:test';
import assert from 'node:assert/strict';
import {paintNilSideMural,createNilGrilleGeometry,NIL_GRILLE} from '../src/nil-kirilli-livery.js';

test('side portraits retain their proportions on both opposite-running UV rows',()=>{
  const artwork={width:2048,height:683};
  for(const reverse of [false,true]){
    const calls=[];paintNilSideMural({drawImage(...args){calls.push(args);}},artwork,202,56,800,86,reverse);
    for(const index of [1,3]){
      const [,sx,sy,sw,sh,dx,dy,dw,dh]=calls[index];
      assert.ok(Math.abs(sw/sh-dw/dh)<1e-9,'portrait blocks must not stretch with the long flank');
      assert.ok(dx>=202&&dx+dw<=1002,'portraits stay inside the side panel');
      assert.equal(sy,0);assert.equal(dy,56);
      assert.equal(sx,index===1?0:artwork.width*.85);
    }
    const spans=calls.map(call=>[call[5],call[5]+call[7]]).sort((a,b)=>a[0]-b[0]);
    assert.ok(Math.abs(spans[0][0]-202)<1e-9);assert.ok(Math.abs(spans.at(-1)[1]-1002)<1e-9);
    for(let i=1;i<spans.length;i++)assert.ok(Math.abs(spans[i][0]-spans[i-1][1])<1e-9,'mural sections join without blank seams');
  }
});
test('grille painting is thirteen separated strips with one continuous projected image',()=>{
  const g=createNilGrilleGeometry(),p=g.attributes.position,uv=g.attributes.uv;
  assert.equal(p.count,NIL_GRILLE.count*4);
  for(let slat=0;slat<NIL_GRILLE.count;slat++){
    const ys=[];
    for(let corner=0;corner<4;corner++){
      const i=slat*4+corner;ys.push(p.getY(i));
      assert.ok(Math.abs(uv.getX(i)-(p.getX(i)+.975)/2.04)<1e-6);
      assert.ok(Math.abs(uv.getY(i)-(p.getY(i)-.60)/.94)<1e-6);
    }
    assert.ok(Math.abs(Math.max(...ys)-Math.min(...ys)-NIL_GRILLE.slatHeight)<1e-6);
  }
  assert.ok(NIL_GRILLE.spacing-NIL_GRILLE.slatHeight>.015,'portrait cannot bridge the black grille gaps');
  g.dispose();
});
