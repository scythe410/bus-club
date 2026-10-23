import test from 'node:test';
import assert from 'node:assert/strict';
import { BUS_PHYSICS, stepVehicle, vehicleMass } from '../src/vehicle-physics.js';

const run = (initial, input, seconds, hz = 60) => {
  let state = initial;
  for (let i = 0; i < seconds * hz; i++) state = stepVehicle(state, input, 1 / hz);
  return state;
};
test('passenger mass is bounded by the seating capacity, not lifetime pickup count', () => {
  assert.equal(vehicleMass(0), 9500);
  assert.equal(vehicleMass(58), 13850);
  assert.equal(vehicleMass(1000), vehicleMass(58));
  assert.equal(vehicleMass(-4), vehicleMass(0));
});
test('a loaded bus accelerates more slowly with the same available power', () => {
  const empty = run({}, { throttle: 1 }, 10);
  const loaded = run({}, { throttle: 1, passengers: 58 }, 10);
  assert.ok(empty.speed > loaded.speed + 1);
  assert.ok(empty.speed < 20, 'cannot accelerate like a sports car');
});
test('full steering at highway speed respects the lateral acceleration budget', () => {
  const state = run({ speed: 25 }, { throttle: 1, steer: 1 }, 3);
  assert.ok(Math.abs(state.lateralAcceleration) <= BUS_PHYSICS.cornerAcceleration + 1e-9);
  assert.ok(state.yawRate < 0, 'right input turns toward -X');
  assert.ok(state.outerLoadFraction > .5 && state.innerLoadFraction > .3);
  assert.ok(state.roll < 0 && Math.abs(state.roll) < .07);
});
test('brakes stop both forward and reverse without changing direction', () => {
  assert.equal(run({ speed: 15 }, { brake: 1 }, 10).speed, 0);
  assert.equal(run({ speed: -4 }, { brake: 1 }, 5).speed, 0);
  assert.equal(run({}, { brake: 1 }, 5).speed, 0);
});
test('braking transfers load forward and turn reversal transfers body lean smoothly', () => {
  const braking = stepVehicle({ speed: 15 }, { brake: 1 }, 1 / 60);
  assert.ok(braking.frontLoadFraction > BUS_PHYSICS.frontWeightFraction);
  assert.equal(braking.frontLoadFraction + braking.rearLoadFraction, 1);
  const corner = run({ speed: 12 }, { steer: 1, throttle: .3 }, 3);
  const reversed = stepVehicle(corner, { steer: -1, throttle: .3 }, 1 / 60);
  assert.ok(Math.abs(reversed.roll - corner.roll) < .003);
  assert.ok(Number.isFinite(reversed.rollRate));
});
test('stationary steering creates no yaw or load transfer', () => {
  const state = run({}, { steer: 1 }, 2);
  assert.equal(state.yawRate, 0);
  assert.equal(state.lateralAcceleration, 0);
  assert.equal(state.roll, 0);
});
test('handling converges across normal frame rates', () => {
  const a = run({}, { throttle: 1, steer: .4, passengers: 30 }, 12, 30);
  const b = run({}, { throttle: 1, steer: .4, passengers: 30 }, 12, 120);
  assert.ok(Math.abs(a.speed - b.speed) < .1);
  assert.ok(Math.abs(a.roll - b.roll) < .002);
});
