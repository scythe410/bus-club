// Shared metre-scale road geometry for rendering and convoy placement.
export const ROAD_HALF_WIDTH = 3.9;
export const LANE_CENTER = 1.75;
export const roadX = z => Math.sin(z * .0022) * 95 + Math.sin(z * .0057) * 23;
export const roadY = z => 7 + Math.sin(z * .0028) * 3 + Math.sin(z * .006) * 1.2;
export const roadYaw = z => Math.atan2(roadX(z + 1) - roadX(z - 1), 2);
