# Sri Lankan bus scale and handling review

Reviewed 24 October 2026. Scope: current imported Sri Lankan bus mesh, procedural road, single-player and shared multiplayer spawn. This is a game handling model, not a vehicle certification or measured tire/suspension model.

## What the sources support

- [Lanka Ashok Leyland: Viking](https://lal.lk/bus/viking/) describes the local Viking with a six-cylinder Euro 4 engine, six-speed gearbox, multi-leaf springs with double-acting dampers, full air dual-line ABS brakes, and 42–58-seat configurations. The local page does **not** specify this supplied mesh's identity, kerb weight, axle weights, center of gravity, roll stiffness, or dimensions.
- [Ashok Leyland: current Viking specifications](https://www.ashokleyland.com/in/buses/brands/viking/specification) provides an analogous manufacturer reference: 5.334/5.639 m wheelbase, 10.934/11.422 m length, 2.600 m width, 16,200 kg maximum GVW, 147 kW and 700 Nm. These are current Indian variants, not evidence that this downloaded bus has those exact specifications. **Maximum GVW includes payload; it is not the empty bus weight.**
- [Sri Lanka RDA: National Road Master Plan 2018–2027 draft](https://rda.gov.lk/images/publications/pdf/national_road_master/nrmp_2018_2027_draft.pdf) lists cross sections with lane widths including 2.5, 3.1 and 3.5 m. This supports using two 3.5 m lanes as a representative game road, not claiming every Sri Lankan road has that width.
- [NZ Transport Agency: heavy vehicle stability guide](https://www.nzta.govt.nz/resources/heavy-vehicle-stability-guide) and [preventing rollover](https://www.nzta.govt.nz/vehicles/choosing-the-right-vehicle/choosing-and-operating-a-heavy-vehicle/preventing-rollover) explain the effects of speed, load height/distribution and cornering on stability. This is engineering guidance from another jurisdiction, not Sri Lankan operating law or this bus's measured rollover threshold. Its truck/trailer legal thresholds are not bus configuration values.

## Baseline measurements before this change

Computed bounding boxes use all node world transforms, accessor vertex min/max, then the existing +90° Y rotation. All lengths below assume one world unit is one metre, consistent with the game's speed multiplied by 3.6 for km/h.

| Item | Baseline | Suggested conservative presentation |
| --- | --- | --- |
| Overall mesh length | 9.800 m | 10.934 m, uniform scale ×1.115714 |
| Overall mesh width including protrusions | 2.259 m | 2.521 m after the same uniform scale |
| Mesh height | 2.873 m | 3.206 m after uniform scale |
| Approximate wheel-center spacing | 4.99 m | approximately 5.56 m after scale |
| Road surface | 14 m total, two lanes of 7 m | representative two-lane road: 7 m total |
| Max speed | 31 m/s =111.6 km/h | 25 m/s =90 km/h game tuning |
| Peak throttle term | 5.7 m/s² before drag | force/power/mass model, about 2 m/s² at launch empty |
| Full braking term | 13 m/s² (>1g) | finite brake force and grip limit |

Mesh values are art measurements, not manufacturer dimensions. Uniform scaling should preserve the authored proportions; stretching its width to exactly match a different manufacturer's variant is unjustified. Set `Bus.group.scale.setScalar(10.934 / 9.8)` only after the imported bus successfully loads so editable panels and signs scale together. The old y=3.05 driver camera collided with the visor after scaling. The verified seat uses model-local eye (-0.46, 2.12, 3.68), transformed through the bus pose/scale, 68° vertical FOV and a 0.05 m near clip. A lightweight wheel/dashboard supplements the source model, which omits those parts.

The old full-steer yaw formula at 31 m/s gives 1.31 rad/s, a 23.7 m center-path radius and approximately **40.6 m/s² (4.14g)** lateral acceleration. Its visual roll is disconnected from that acceleration. The new module caps assisted lateral acceleration at 2.5 m/s² (0.255g) on pavement and 1.5 m/s² off road. At 25 m/s this means a minimum center-path radius of 250 m. At low speed the 0.55 rad wheel-angle lock and 5.5 m wheelbase give approximately a 9 m rear-axle radius. These are game tuning values, not a verified factory turning-circle specification.

## Implemented module and assumptions

`src/vehicle-physics.js` is a pure, renderer-independent step. Its parameters are deliberately exposed:

- Power-limited traction, 147 kW ×0.85 assumed drivetrain efficiency; 20 kN low-speed tractive force.
- **Assumed** empty running mass 9,500 kg; 75 kg per passenger including allowance, up to 58 passengers; absolute model mass bound 16,200 kg. No primary source found for this bus's actual empty mass. At 58 passengers the assumed running mass is 13,850 kg.
- Brake force 60 kN, paved/rough-surface grip assumptions, rolling resistance and quadratic aerodynamic resistance. These are reasonable tunable game approximations, not measured bus coefficients.
- Wheelbase 5.5 m, track 1.95 m, CoM height 1.25 m, static front axle fraction 0.42 are assumed pending measurements. The wheelbase fits the uniformly scaled visual wheel positions and the analogous manufacturer class.
- Smoothed steering and yaw, conservative speed-dependent steer restriction, no yaw while stationary; reverse steering preserves direction correctly. The restriction is an intentional driving assist, not a claim that a real bus physically cannot turn its wheels at speed.
- A damped second-order visual roll driven by lateral acceleration. Outer/inner load fractions derive from `m*a*h/track`; front/rear fractions use longitudinal `m*a*h/wheelbase`. These diagnostics conserve total load but **do not** apply per-wheel tire forces, deform suspension, dynamically change CoM, model passengers moving, slide, lift wheels, or simulate rollover. The body pivots around the group origin rather than a measured roll center.
- A bicycle-model velocity angle approximates the center's motion and long-wheelbase path. It is not tire slip. Explicit rear wheel swept-path collision and body-corner collision against road edges remain future work.

At 2.5 m/s² lateral acceleration and the assumed geometry, about 16.3% of total normal load transfers from inside to outside: outer side ~66.3%, inner side ~33.7%. Mass increases the transferred **force**, but mass cancels from this normalized fraction for unchanged CoM/track/acceleration. More mass alone is not a valid reason to multiply body roll or reduce the static tipping angle. Higher/uneven passenger loading would change CoM; this approximation keeps it fixed and says so.

## Applied changes

The local implementation now uses the module in the real game loop, clears its state
on reset/network placement, and drives visual body roll from its response. The bus
is uniformly scaled to 10.934 m after its asset loads; wheel spin uses scaled radii.

Road and multiplayer placement share geometry constants. The road has two 3.5 m
lanes plus 0.4 m of paved margin on each side (7.8 m total), matching the new bus
width. Solo reset starts in the left-hand lane. Convoy spawn uses lane centers
±1.75 m and safe staggered rows when an existing driver blocks both lanes. Roadside
markers/stops moved inward with the road. Off-road detection includes an approximate
1 m tire half-track and the road normal on curves.

Validation covers steering direction through the actual camera, acceleration under
load, cornering limits, braking/reverse, load conservation and transfer, suspension
settling, frame rates, and all eight spawn footprints fitting the road. This remains
an assisted casual driving model, with no vehicle collisions or rollover simulation.

Road gradient forces and a changing passenger center of mass are not modeled. The mass/load-transfer values remain explicitly assumed game parameters.
