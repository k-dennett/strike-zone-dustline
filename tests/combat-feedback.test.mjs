import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombatFeedback, threatBearing } from '../combat-feedback.js';
const player = { hp: 100, position: { x: 0, z: 0 }, yaw: 0 };
test('damage indicator tracks attacker bearing when the player turns', () => {
  const pos = player.position;
  assert.equal(threatBearing({x:0,z:-5},pos,0),0);
  assert.equal(threatBearing({x:5,z:0},pos,0),Math.PI/2);
  assert.equal(Math.abs(threatBearing({x:0,z:5},pos,0)),Math.PI);
  assert.ok(Math.abs(threatBearing({x:5,z:0},pos,-Math.PI/2)) < 1e-12);
  const combat = createCombatFeedback();
  combat.hit(12,{x:5,z:0});
  assert.equal(combat.update(0.01,player).directionAngle,Math.PI/2);
  assert.ok(Math.abs(combat.update(0.01,{...player,yaw:-Math.PI/2}).directionAngle)<1e-12);
});
test('hits flash and incoming fire persists briefly then clears', () => {
  const combat = createCombatFeedback();
  combat.hit(10,{x:0,z:-4});
  let state = combat.update(0.05,player);
  assert.equal(state.level,'fire');assert(state.damageOpacity>0.6);assert(state.directionOpacity>0.9);
  state = combat.update(2,player);
  assert.equal(state.level,'fire');assert.equal(state.directionOpacity,0);
  state = combat.update(1.1,player);
  assert.equal(state.level,'');assert.equal(state.damageOpacity,0);
});
test('proximity does not invent damage; critical health takes priority', () => {
  const combat=createCombatFeedback();
  let state=combat.update(0.01,{...player,nearby:2});
  assert.equal(state.level,'near');assert.equal(state.damageOpacity,0);assert.equal(state.directionOpacity,0);
  combat.shot();
  state=combat.update(0.01,{...player,hp:25,nearby:2});
  assert.equal(state.level,'critical');assert.equal(state.heartbeat,true);
  assert.equal(combat.update(0.5,{...player,hp:25}).heartbeat,false);
  assert.equal(combat.update(0.56,{...player,hp:25}).heartbeat,true);
  assert.equal(combat.update(0.01,player).heartbeat,false);
});
test('alert cues are rate limited and practice/reset removes all feedback', () => {
  const combat=createCombatFeedback();
  assert.equal(combat.update(0.01,{...player,nearby:1}).alert,true);
  combat.shot();assert.equal(combat.update(0.01,player).alert,false);
  combat.hit(20,{x:1,z:1});
  const state=combat.update(0.01,{...player,hp:15,active:false});
  assert.equal(state.level,'');assert.equal(state.heartbeat,false);assert.equal(state.directionOpacity,0);
  assert.equal(combat.update(0.01,player).damageOpacity,0);
});
test('reduced effects attenuate flashes and replace critical pulsing by a constant', () => {
  const combat=createCombatFeedback();combat.hit(20,{x:1,z:1});
  assert(combat.update(0.01,{...player,reducedEffects:true}).damageOpacity<=0.2);
  const a=combat.update(2,{...player,hp:20,reducedEffects:true});
  const b=combat.update(0.3,{...player,hp:20,reducedEffects:true});
  assert.equal(a.damageOpacity,0.16);assert.equal(b.damageOpacity,0.16);
});
