import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createDamRejinaFrontDetails } from './dam-rejina-front.js';

// Coordinates share the imported bus normalization: +Z is forward, length 9.8 m.
// Keep the ornament as geometry, so its silhouette also reads from the road camera.
export function createDamRejinaDetails() {
  const group = new THREE.Group();
  group.name = 'Dam Rejina chrome and touring equipment';
  const materials = {
    chrome: new THREE.MeshStandardMaterial({ color: '#d8e8ef', metalness: .78, roughness: .2 }),
    gold: new THREE.MeshStandardMaterial({ color: '#d7dce2', metalness: .75, roughness: .24 }),
    blue: new THREE.MeshStandardMaterial({ color: '#e6299b', metalness: .35, roughness: .28 }),
    black: new THREE.MeshStandardMaterial({ color: '#071725', roughness: .4 }),
    mirror: new THREE.MeshStandardMaterial({ color: '#9fcbdf', metalness: .85, roughness: .12 }),
    white: new THREE.MeshStandardMaterial({ color: '#fff5d9', emissive: '#f9e3b1', emissiveIntensity: .55, roughness: .25 }),
    amber: new THREE.MeshStandardMaterial({ color: '#ffc02b', emissive: '#ff8d0a', emissiveIntensity: .45, roughness: .28 }),
    redPaint: new THREE.MeshStandardMaterial({ color: '#b51b37', roughness: .58, metalness: .12 }),
    red: new THREE.MeshStandardMaterial({ color: '#ef352d', emissive: '#db161b', emissiveIntensity: .4, roughness: .28 }),
    cyan: new THREE.MeshStandardMaterial({ color: '#76f6d2', emissive: '#28dca3', emissiveIntensity: .55, roughness: .25 }),
  };
  materials.white.userData.headlight = true;
  const batches = new Map();
  const add = (geometry, material, x, y, z, rotation) => {
    if (geometry.index) {
      const original = geometry;
      geometry = geometry.toNonIndexed();
      original.dispose();
    }
    const transform = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(rotation || new THREE.Euler()),
      new THREE.Vector3(1, 1, 1),
    );
    geometry.applyMatrix4(transform);
    if (!batches.has(material)) batches.set(material, []);
    batches.get(material).push(geometry);
  };
  const box = (w, h, d, mat, x, y, z, radius = .015) =>
    add(new RoundedBoxGeometry(w, h, d, 1, Math.min(radius, w / 3, h / 3, d / 3)), mat, x, y, z);
  const cylinder = (r, depth, mat, x, y, z, rotation = new THREE.Euler(Math.PI / 2, 0, 0)) =>
    add(new THREE.CylinderGeometry(r, r, depth, 20), mat, x, y, z, rotation);
  const ring = (r, tube, mat, x, y, z) =>
    add(new THREE.TorusGeometry(r, tube, 6, 24), mat, x, y, z);
  const rod = (points, radius, mat) => {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    add(new THREE.TubeGeometry(curve, Math.max(8, points.length * 5), radius, 7, false), mat, 0, 0, 0);
  };
  const { chrome, gold, blue, black, mirror, white, amber, red, redPaint, cyan } = materials;

  // The reference has a broad painted face with an uninterrupted macaw
  // mural. Thin metal louvres sit over that paint instead of an opaque grille.
  box(2.08,.92,.06,blue,.045,1.12,4.665,.025);
  box(2.08,.028,.065,chrome,.045,1.585,4.69,.007);
  box(2.08,.014,.068,chrome,.045,1.625,4.687,.004);
  // The center grille tapers beneath its broad shoulders. Its vertical trim
  // runs down the left edge, leaving the bird's face unobstructed.
  for(let i=0;i<16;i++){
    const t=i/15;
    box(.74+.40*t,.008,.018,chrome,.05,.90+i*.042,4.735,.002);
  }
  rod([[-.54,1.55,4.737],[-.54,1.26,4.737],[-.46,1.0,4.737],[-.34,.86,4.737]],.009,chrome);
  rod([[.64,1.55,4.737],[.64,1.26,4.737],[.56,1.0,4.737],[.44,.86,4.737]],.007,chrome);
  for(const x of [-.745,.845]){
    for(let i=0;i<8;i++)box(.38,.008,.018,chrome,x,1.18+i*.042,4.735,.002);
    box(.39,.018,.035,chrome,x,1.55,4.742,.006);
  }
  // Four lenses in the low black rectangular banks, with fine chrome edging.
  for(const x of [-.70,.80]){
    box(.52,.31,.05,chrome,x,.94,4.73,.012);
    box(.48,.272,.022,black,x,.94,4.762,.009);
    for(let i=0;i<11;i++)for(const y of [.795,1.085])cylinder(.006,.008,chrome,x-.235+i*.047,y,4.781);
  }
  for(const x of [-.82,-.58,.68,.92]){
    cylinder(.114,.045,black,x,.94,4.765);
    ring(.105,.012,chrome,x,.94,4.794);
    cylinder(.093,.014,white,x,.94,4.800);
    for(const dx of [-.045,0,.045])box(.005,.146,.007,mirror,x+dx,.94,4.811,.001);
  }
  for(const x of [-.99,1.08]){
    box(.085,.20,.05,black,x,.94,4.728,.013);
    box(.065,.176,.024,amber,x,.94,4.766,.009);
  }
  // Short license mount below the right lamps; the sticker texture supplies
  // the white NB 4110 plate. The left side instead carries a red marker strip.
  box(.48,.13,.032,chrome,.78,.69,4.893,.009);
  box(.34,.045,.026,red,-.75,.72,4.894,.005);
  // Painted bumper panels sit behind the one central guard hoop and leave
  // the bright outer tips exposed, as in the close reference photograph.
  box(2.08,.29,.10,blue,.045,.50,4.80,.028);
  for(const x of [-.87,.96]){
    box(.34,.040,.08,chrome,x,.325,4.925,.014);
    box(.30,.014,.05,chrome,x,.277,4.91,.004);
    box(.15,.09,.025,black,x,.49,4.875,.009);
    for(let i=0;i<3;i++)box(.032,.018,.01,white,x-.048+i*.048,.49,4.893,.002);
    for(let i=0;i<5;i++)box(.027,.012,.013,cyan,x-.11+i*.055,.305,4.943,.002);
  }

  // High touring destination pod with rolled chrome edges and pink sun visor.
  const crown = new THREE.Shape();
  crown.moveTo(-1.06, 2.715); crown.lineTo(1.06, 2.715);
  crown.lineTo(1.06, 2.88); crown.quadraticCurveTo(.98, 3.065, .45, 3.065);
  crown.lineTo(-.45, 3.065); crown.quadraticCurveTo(-.98, 3.065, -1.06, 2.88); crown.closePath();
  add(new THREE.ExtrudeGeometry(crown,{depth:.40,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.018,bevelThickness:.018,curveSegments:8}),blue,.045,0,4.06);
  box(1.53, .245, .055, chrome, .045, 2.87, 4.515, .035);
  box(1.45, .187, .025, black, .045, 2.87, 4.554, .025);
  box(2.2, .08, .42, chrome, .045, 2.681, 4.365, .025);
  box(2.19, .055, .45, blue, .045, 2.72, 4.365, .02);
  // Multiple roof spotlights are mounted above, not drawn into the paint.
  for (let i = 0; i < 4; i++) {
    const x = -.47 + i * .34;
    box(.25, .14, .14, black, x, 3.105, 4.24, .035);
    box(.20, .105, .018, mirror, x, 3.105, 4.322, .02);
    box(.045, .08, .08, black, x, 3.01, 4.24);
  }
  for (const x of [-.94, -.78, .87, 1.03]) {
    cylinder(.055, .065, chrome, x, 3.04, 4.24);
    cylinder(.042, .01, cyan, x, 3.04, 4.28);
  }
  // Side marker lamps travel down the roof line and read in profile views.
  for (const s of [-1, 1]) {
    rod([[s * .94, 2.84, 3.75], [s * .97, 2.87, .3], [s * .96, 2.83, -4.2]], .018, chrome);
    for (let i = 0; i < 11; i++) {
      const z = 3.65 - i * .74;
      box(.05, .045, .095, i === 10 ? amber : cyan, s * 1.009 + .04, 2.805, z, .012);
    }
  }

  // Long articulated mirror brackets, separate polished housing and glass.
  for (const s of [-1, 1]) {
    rod([[.045 + s * .91, 2.39, 4.27], [.045 + s * 1.2, 2.56, 4.37], [.045 + s * 1.46, 2.48, 4.57], [.045 + s * 1.46, 2.13, 4.62]], .026, gold);
    rod([[.045 + s * .94, 2.16, 4.24], [.045 + s * 1.22, 2.28, 4.45], [.045 + s * 1.43, 2.2, 4.59]], .017, chrome);
    box(.19, .47, .16, gold, .045 + s * 1.47, 2.08, 4.62, .06);
    box(.145, .39, .018, mirror, .045 + s * 1.47, 2.08, 4.526, .035);
    box(.17, .16, .13, chrome, .045 + s * 1.46, 1.73, 4.63, .035);
    box(.13, .11, .016, mirror, .045 + s * 1.46, 1.73, 4.552, .025);
    // Small chrome air horns behind the front light rack.
    add(new THREE.ConeGeometry(.095, .32, 16, 1, true), chrome, s * .77, 3.025, 3.8, new THREE.Euler(Math.PI / 2, 0, 0));
    cylinder(.095, .015, black, s * .77, 3.025, 3.968);
    rod([[s * .77, 2.88, 3.7], [s * .77, 3.02, 3.69]], .018, chrome);
  }

  // Rear crown sits below a thin roof spoiler: the reference's red center
  // cluster and small clear lamps form two distinct horizontal rows.
  box(2.12, .075, .32, blue, .04, 3.08, -4.62, .025);
  box(2.14, .024, .34, chrome, .04, 3.025, -4.62, .008);
  for (const x of [-.88,.96]) box(.065,.22,.17,blue,x,2.98,-4.57);
  box(.64,.072,.045,black,.04,3.095,-4.813);
  for(let i=0;i<4;i++) box(.12,.045,.024,red,-.20+i*.16,3.095,-4.844,.008);
  for(let i=0;i<11;i++){
    const x=-.83+i*.174;
    cylinder(.035,.04,chrome,x,2.99,-4.82);
    cylinder(.024,.014,white,x,2.99,-4.848);
  }
  box(2.01,.40,.08,blue,.04,2.72,-4.85,.055);
  box(1.65,.325,.024,chrome,.04,2.72,-4.906,.035);
  box(1.59,.28,.019,black,.04,2.72,-4.926,.03);
  for(const x of [-.90,.98]){
    add(new THREE.BoxGeometry(.13,.13,.018),chrome,x,2.72,-4.922,new THREE.Euler(0,0,Math.PI/4));
    cylinder(.052,.035,chrome,x,2.72,-4.914);
    cylinder(.038,.015,amber,x,2.72,-4.94);
  }
  // The black rear window carries the large advertising and Sinhala decals.
  box(1.93,.83,.04,chrome,.04,2.10,-4.886,.06);
  box(1.87,.77,.035,black,.04,2.10,-4.914,.045);
  for(const y of [1.635,1.68]) box(2.06,.018,.035,chrome,.04,y,-4.92,.006);
  // Narrow left ladder crosses the window and reaches the roof lamp rack.
  for(const x of [-.69,-.97]) rod([[x,1.30,-4.99],[x,2.72,-4.99],[x,3.08,-4.76]],.018,chrome);
  for(let i=0;i<7;i++) box(.31,.025,.045,chrome,-.83,1.42+i*.235,-4.995,.007);
  for(let i=0;i<5;i++){
    const y=1.59+i*.235;
    rod([[-.94,y,-4.997],[-.87,y+.055,-4.997],[-.94,y+.11,-4.997]],.008,chrome);
    rod([[-.72,y,-4.997],[-.79,y+.055,-4.997],[-.72,y+.11,-4.997]],.008,chrome);
  }
  // Both rectangular rear lamp banks have two close rows of red LEDs with
  // amber at their outer ends, matching the low wide reference clusters.
  for(const x of [-.74,.83]){
    box(.52,.205,.055,chrome,x,1.40,-4.907,.02);
    box(.47,.16,.025,black,x,1.40,-4.943,.012);
    for(let col=0;col<10;col++) for(let row=0;row<2;row++)
      box(.031,.039,.018,col===0||col===9?amber:red,x-.2025+col*.045,1.435-row*.07,-4.966,.005);
  }
  box(.78,.27,.06,chrome,.045,1.40,-4.92,.035);
  box(.69,.205,.025,black,.045,1.40,-4.96,.025);
  // The separate lower engine vent is a broad black inset, not a lamp panel.
  box(1.69,.62,.04,chrome,.045,.86,-4.90,.045);
  box(1.63,.56,.03,black,.045,.86,-4.93,.035);
  for(let i=0;i<30;i++) box(.009,.47,.01,mirror,-.73+i*.053,.86,-4.95,.003);
  box(.92,.10,.07,chrome,.045,.46,-4.94,.025);
  // Raised rear wing tips and projecting chrome front bullbar.
  for (const x of [-.98,1.06]) box(.08,.24,.40,blue,x,3.08,-4.62,.025);
  // A single rounded central hoop replaces the wide rectangular cage.
  rod([[-.65,.35,4.985],[-.62,.51,4.98],[-.57,.66,4.965],[-.45,.70,4.96],[.54,.70,4.96],[.66,.66,4.965],[.71,.51,4.98],[.74,.35,4.985]],.024,chrome);
  rod([[-.62,.43,4.98],[.71,.43,4.98]],.017,chrome);
  // Separate low swept blade and six small round auxiliary lamps.
  rod([[-.52,.29,4.99],[-.47,.245,5.0],[-.19,.235,5.0],[.045,.27,5.0],[.28,.235,5.0],[.56,.245,5.0],[.61,.29,4.99]],.027,chrome);
  for(let i=0;i<6;i++){
    const x=-.46+i*.20;
    cylinder(.027,.035,chrome,x,.36,4.99);
    cylinder(.018,.009,white,x,.36,5.014);
  }
  for(const x of [-.90,1.0]){
    rod([[x,.32,4.94],[x,.23,4.94]],.007,black);
    add(new THREE.ConeGeometry(.026,.09,6),cyan,x,.19,4.94);
  }
  for (const y of [.46, .61]) box(2.11, .065, .12, chrome, .045, y, -4.925, .025);
  // Red twin touring mudflaps have a polished border and a narrow central gap.
  for(const x of [-.43,.52]){
    box(.92,.29,.035,chrome,x,.205,-4.94,.01);
    box(.88,.25,.02,redPaint,x,.205,-4.965,.006);
  }
  for (const s of [-1, 1]) {
    const x = .045 + s * 1.01;
    // Belt strips stop at door openings instead of bridging the entrances.
    const beltSegments=s>0?[[.15,6.1],[-4.42,.55]]:[[-.48,8.18]];
    for(const [z,length] of beltSegments){
      box(.018, .025, length, chrome, x, 1.345, z, .005);
      box(.02, .009, length, gold, x + s * .003, 1.305, z, .003);
    }
    // Split skirt strips at the wheel arches instead of crossing the tires.
    for (const [z, length] of [[-3.78, 2.03], [.22, 4.16], [3.94, 1.36]]) {
      for (const y of [.36, .455]) box(.045, .035, length, chrome, x, y, z, .009);
    }
  }

  for (const [material, geometries] of batches) {
    // Normalized non-indexed geometry keeps all primitive attribute layouts compatible.
    const geometry = mergeGeometries(geometries, false);
    if (!geometry) throw new Error('Could not batch Dam Rejina equipment');
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `Dam Rejina ${Object.keys(materials).find(key => materials[key] === material)}`;
    group.add(mesh);
    geometries.forEach(g => g.dispose());
  }
  group.add(createDamRejinaFrontDetails());
  return group;
}
