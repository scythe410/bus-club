// SI units. Viking-class reference, not a homologated model of the supplied mesh.
// Sources, mesh measurements and explicitly assumed tuning: review/bus-physics.md.
export const BUS_PHYSICS = Object.freeze({
  wheelbase: 5.5, track: 1.95, centerOfMassHeight: 1.25,
  emptyMass: 9500, passengerMass: 75, passengerCapacity: 58, maximumMass: 16200,
  frontWeightFraction: .42, enginePower: 147000, drivelineEfficiency: .85,
  tractionForce: 20000, brakeForce: 60000, maximumSpeed: 120 / 3.6, reverseSpeed: 4,
  // Gameplay drag allows the requested 120 km/h with the original bus power
  // and passenger mass; this is tuning, not a measured aerodynamic coefficient.
  aerodynamicDrag: 1.6,
  fullLock: .55, cornerAcceleration: 2.5, offroadCornerAcceleration: 1.5,
});
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const approach = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));

export function vehicleMass(passengers = 0, config = BUS_PHYSICS) {
  return Math.min(config.maximumMass, config.emptyMass + clamp(passengers, 0, config.passengerCapacity) * config.passengerMass);
}

// Pure step so handling can be checked without WebGL. Positive steering means
// screen-right (-X while looking down +Z); yaw is THREE's rotation about +Y.
export function stepVehicle(state, input, deltaTime, config = BUS_PHYSICS) {
  const dt = clamp(deltaTime, 0, .05);
  const previousSpeed = state.speed || 0;
  const throttle = clamp(input.throttle || 0, -1, 1);
  const brake = clamp(input.brake || 0, 0, 1);
  const mass = vehicleMass(input.passengers, config);
  const absSpeed = Math.abs(previousSpeed);
  const friction = input.offroad ? .38 : .65;
  const engineForce = Math.min(config.tractionForce, config.enginePower * config.drivelineEfficiency / Math.max(absSpeed, 3));
  const resistance = mass * 9.81 * (input.offroad ? .06 : .012) + config.aerodynamicDrag * absSpeed * absSpeed;
  const driveAcceleration = throttle * engineForce / mass;
  const resistanceAcceleration = resistance / mass;
  // A brake opposes motion and cannot push a stopped bus into reverse.
  const brakingAcceleration = Math.min(config.brakeForce / mass, friction * 9.81 * .85) * brake;
  let speed = previousSpeed + driveAcceleration * dt;
  speed = Math.sign(speed) * Math.max(0, Math.abs(speed) - (resistanceAcceleration + brakingAcceleration) * dt);
  speed = clamp(speed, -config.reverseSpeed, config.maximumSpeed);
  if (!throttle && Math.abs(speed) < .03) speed = 0;
  const acceleration = dt > 0 ? (speed - previousSpeed) / dt : 0;
  const steeringTarget = clamp(input.steer || 0, -1, 1);
  const previousSteering = state.steering || 0;
  // Let the wheel unwind promptly on release and respond to countersteering,
  // while keeping turn-in progressive and the same lateral acceleration cap.
  const steeringRate = !steeringTarget ? 6 : steeringTarget * previousSteering < 0 ? 5 : 3.5;
  const steering = approach(previousSteering, steeringTarget, steeringRate, dt);
  const availableLateral = Math.sqrt(Math.max(0, (friction * 9.81) ** 2 - brakingAcceleration ** 2));
  const cornerLimit = Math.min(availableLateral, input.offroad ? config.offroadCornerAcceleration : config.cornerAcceleration);
  // A long-wheelbase bicycle model, with a conservative driving assist that
  // reduces steering at speed. No artificial sideways road-centre force.
  const maxAngle = Math.min(config.fullLock, Math.atan(cornerLimit * config.wheelbase / Math.max(speed * speed, .01)));
  const wheelAngle = -steering * maxAngle;
  const targetYawRate = speed * Math.tan(wheelAngle) / config.wheelbase;
  let yawRate = approach(state.yawRate || 0, targetYawRate, 1 / (.32 + mass / 50000), dt);
  const yawLimit = Math.min(Math.abs(speed) * Math.tan(config.fullLock) / config.wheelbase, cornerLimit / Math.max(Math.abs(speed), .01));
  yawRate = clamp(yawRate, -yawLimit, yawLimit);
  const lateralAcceleration = speed * yawRate;
  const targetRoll = clamp(lateralAcceleration * .022, -.07, .07);
  let roll = state.roll || 0, rollRate = state.rollRate || 0;
  // Keep the visual braking dip consistent in forward and reverse. Use the
  // previous direction through the stopping tick, and throttle when launching.
  // This presentation cue is separate from signed axle load transfer below.
  const travelDirection = Math.sign(previousSpeed) || Math.sign(speed) || Math.sign(throttle) || 1;
  const targetPitch = clamp(-acceleration * travelDirection * .00765, -.02125, .0425);
  let pitch = state.pitch || 0, pitchRate = state.pitchRate || 0;
  // Substeps keep the damped suspension stable across frame rates.
  const steps = Math.max(1, Math.ceil(dt / .01)), h = dt / steps;
  for (let i = 0; i < steps; i++) {
    rollRate += ((targetRoll - roll) * 28 - rollRate * 9) * h;
    roll += rollRate * h;
    pitchRate += ((targetPitch - pitch) * 28 - pitchRate * 9) * h;
    pitch += pitchRate * h;
  }
  // Rigid-body load transfer approximation; fractions sum to one. Assumed CoM
  // and axle bias are tunable until this bus has measured axle weights.
  const frontLoadFraction = clamp(config.frontWeightFraction - acceleration * config.centerOfMassHeight / (9.81 * config.wheelbase), 0, 1);
  const outerLoadFraction = clamp(.5 + Math.abs(lateralAcceleration) * config.centerOfMassHeight / (9.81 * config.track), .5, 1);
  const rearToCenter = config.wheelbase * config.frontWeightFraction;
  const slipAngle = Math.abs(speed) > .01 ? Math.atan(rearToCenter * yawRate / speed) : 0;
  return { speed, steering, yawRate, roll, rollRate, pitch, pitchRate, acceleration, lateralAcceleration,
    wheelAngle, slipAngle, mass, frontLoadFraction, rearLoadFraction: 1 - frontLoadFraction,
    outerLoadFraction, innerLoadFraction: 1 - outerLoadFraction };
}
