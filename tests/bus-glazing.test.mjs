import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createPassengerGlazing} from '../src/bus-glazing.js';
import {createRearPassengerDoor} from '../src/bus-doors.js';

test('passenger glazing stops behind the donor front windshield',()=>{
  const glazing=createPassengerGlazing();
  const bounds=new THREE.Box3().setFromObject(glazing);
  // Normalized front windshield starts at z4.383: tint must not cover it.
  assert.ok(bounds.max.z<4.38);
  assert.equal(glazing.children.length,3);
  assert.equal(glazing.children[0].material.opacity,.36);
  assert.equal(glazing.children[0].material.depthWrite,false);
});
test('closed Dam Rejina rear door matches passenger tint without changing Nil',()=>{
  const pink=createRearPassengerDoor({modelId:'dam-rejina'}).getObjectByName('Rear door glass');
  const blue=createRearPassengerDoor({modelId:'nil-kirilli'}).getObjectByName('Rear door glass');
  assert.equal(pink.material.opacity,.36);
  assert.equal(pink.material.color.getHexString(),'333b42');
  assert.equal(blue.material.opacity,.25);
});
test('blue side glazing leaves the full open rear entrance clear',()=>{
  const glazing=createPassengerGlazing({modelId:'nil-kirilli'});
  const panes=glazing.children.filter(pane=>pane.position.x>0.9);
  assert.equal(panes.length,2);
  for(const pane of panes){
    const bounds=new THREE.Box3().setFromObject(pane);
    assert.ok(bounds.min.z>-3.1||bounds.max.z<-4.0,'no transparent pane seals the open doorway');
    assert.equal(pane.material.opacity,.24);
  }
});
