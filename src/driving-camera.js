const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const smooth = value => value * value * (3 - 2 * value);

// Roadside objects and lane markings still move at their actual world speed.
// A lower eye line increases their natural parallax; a restrained FOV increase
// and acceleration squat provide speed cues without blur or camera shake.
export function chaseCamera(speed = 0, acceleration = 0) {
  const pace = smooth(clamp(Math.abs(Number.isFinite(speed) ? speed : 0) / (120 / 3.6), 0, 1));
  const travelAcceleration = (Number.isFinite(acceleration) ? acceleration : 0) * (speed < 0 ? -1 : 1);
  const pull = clamp(travelAcceleration / 2, 0, 1);
  const braking = clamp(-travelAcceleration / 6, 0, 1) * pace;
  return {
    distance: 14 - pace * 1.9 - pull * .45 - braking * .2,
    height: 5.2 - pace * 1.35 - pull * .22 + braking * .12,
    lookAhead: 13 + pace * 9,
    lookHeight: 2.35,
    fov: 52 + pace * 11 + pull * .6 - braking * .5,
    insideFov: 68 + pace * 4,
    scenicFov: 52 + pace * 5,
  };
}
