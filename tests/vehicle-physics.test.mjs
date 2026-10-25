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
  assert.ok(Math.abs(a.pitch - b.pitch) < .002);
});
test('release and countersteering unwind the wheel promptly without increasing corner forces', () => {
  const corner = run({ speed: 20 }, { throttle: .5, steer: 1 }, 2);
  const released = run(corner, { steer: 0 }, .5);
  assert.ok(Math.abs(released.steering) < .06);
  const countersteered = run(corner, { steer: -1 }, .25);
  assert.ok(countersteered.steering < 0, 'countersteering crosses center in a quarter second');
  assert.ok(Math.abs(countersteered.lateralAcceleration) <= BUS_PHYSICS.cornerAcceleration);
});
test('suspension communicates acceleration and braking then settles at rest', () => {
  const pulling = run({}, { throttle: 1 }, 1);
  assert.ok(pulling.pitch < -.005 && pulling.pitch >= -.025, 'nose rises progressively under power');
  const firstBrake = stepVehicle(pulling, { brake: 1 }, 1 / 60);
  assert.ok(Math.abs(firstBrake.pitch - pulling.pitch) < .003, 'braking does not snap the body angle');
  const braking = run({ speed: 20 }, { brake: 1, passengers: 58 }, 1);
  assert.ok(braking.pitch > .02 && braking.pitch <= .05, 'service braking visibly loads the front');
  const slowFrames = run({ speed: 20 }, { brake: 1, passengers: 58 }, .5, 30);
  const fastFrames = run({ speed: 20 }, { brake: 1, passengers: 58 }, .5, 120);
  assert.ok(Math.abs(slowFrames.pitch - fastFrames.pitch) < .002, 'braking suspension agrees across frame rates');
  const stopped = run(braking, { brake: 1 }, 15);
  assert.equal(stopped.speed, 0);
  assert.ok(Math.abs(stopped.pitch) < .00001 && Math.abs(stopped.pitchRate) < .00001);
  const reverse = run({}, { throttle: -1 }, 1);
  assert.ok(reverse.pitch < 0, 'reverse acceleration uses the same visual squat as forward');
});
test('braking pitch matches in both travel directions and remains slightly restrained', () => {
  const forward = run({ speed: 4 }, { brake: 1 }, .4, 120);
  const reverse = run({ speed: -4 }, { brake: 1 }, .4, 120);
  assert.ok(forward.pitch > 0, 'braking dips the nose');
  assert.ok(Math.abs(forward.pitch - reverse.pitch) < 1e-12, 'reversing must not invert the braking motion');
  assert.ok(forward.pitch < .0425, 'the reduced pitch stays below the previous 0.05 rad limit');
  const stopped = run(reverse, { brake: 1 }, 5, 120);
  assert.equal(stopped.speed, 0);
  assert.ok(Math.abs(stopped.pitch) < .00001, 'pitch settles after stopping in reverse');
});
test('120 km/h is attainable empty and fully loaded with sustained throttle', () => {
  assert.ok(Math.abs(BUS_PHYSICS.maximumSpeed * 3.6 - 120) < 1e-9);
  for (const passengers of [0, 58]) {
    const state = run({}, { throttle: 1, passengers }, 180);
    assert.equal(state.speed, BUS_PHYSICS.maximumSpeed);
    assert.equal(run(state, { throttle: 1, passengers }, 5).speed, BUS_PHYSICS.maximumSpeed);
  }
});
test('120 km/h retains heavy-bus cornering limits and meaningful stopping distance', () => {
  const corner = run({ speed: BUS_PHYSICS.maximumSpeed }, { throttle: 1, steer: 1 }, 3);
  assert.ok(Math.abs(corner.lateralAcceleration) <= BUS_PHYSICS.cornerAcceleration + 1e-9);
  assert.ok(Math.abs(corner.yawRate) < .08);
  let state = { speed: BUS_PHYSICS.maximumSpeed }, distance = 0;
  for (let i = 0; i < 15 * 60; i++) {
    state = stepVehicle(state, { brake: 1, passengers: 58 }, 1 / 60);
    distance += state.speed / 60;
  }
  assert.equal(state.speed, 0);
  assert.ok(distance > 90 && distance < 160, `stopped in ${distance.toFixed(1)} metres`);
});
