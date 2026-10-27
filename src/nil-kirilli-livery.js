import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadRearTextFont } from './rear-text.js';
import { clearRearDoorAtlas } from './bus-doors.js';

// The two side UV rows run in opposite directions. Give both portraits their
// natural aspect ratios; stretch only the long tribal ribbons between them.
export function paintNilSideMural(c, artwork, x, y, w, h, reverse = false) {
  if (!artwork) return;
  const sections = [[0, .055], [0, .26], [.26, .59], [.85, .15], [.55, .30]];
  const leftWidth = h * artwork.width * .26 / artwork.height;
  const rightWidth = h * artwork.width * .15 / artwork.height;
  const widths = [w * .10, leftWidth, w * .46 - leftWidth, rightWidth, w * .44 - rightWidth];
  let cursor = reverse ? x + w : x;
  for (let i = 0; i < sections.length; i++) {
    const [start, fraction] = sections[i], width = widths[i];
    if (reverse) cursor -= width;
    c.drawImage(artwork, start * artwork.width, 0, fraction * artwork.width, artwork.height, cursor, y, width, h);
    if (!reverse) cursor += width;
  }
}

export function createNilKirilliAtlas(source, artwork, frontArtwork) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(4096, source.width); canvas.height = Math.round(canvas.width * source.height / source.width);
  const c = canvas.getContext('2d'); c.drawImage(source, 0, 0, canvas.width, canvas.height);
  const pixels = c.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const x = (i / 4 % canvas.width) / canvas.width * 1024;
    const y = Math.floor(i / 4 / canvas.width) / canvas.height * 512;
    const r = pixels.data[i], g = pixels.data[i + 1], b = pixels.data[i + 2];
    const sideWindow = (y > 157 && y < 209 && x > 204 && x < 1003) || (y > 411 && y < 464 && x > 300 && x < 1003);
    const endWindow = x > 26 && x < 169 && ((y > 159 && y < 202) || (y > 406 && y < 458));
    if ((sideWindow && r > 42 && Math.abs(r - g) < 8 && Math.abs(g - b) < 8) || (endWindow && r > 42)) pixels.data[i + 3] = 0;
    else if (r > 140 && g > 140 && b > 140) {
      const light = (r + g + b) / 765;
      pixels.data[i] = 12 + light * 18; pixels.data[i + 1] = 113 + light * 58; pixels.data[i + 2] = 187 + light * 53;
    } else if (b > 150 && b > r * 1.8) {
      pixels.data[i] = 10; pixels.data[i + 1] = 78; pixels.data[i + 2] = 181;
    }
  }
  c.putImageData(pixels, 0, 0);
  c.save(); c.scale(canvas.width / 1024, canvas.height / 512);
  for (const [x, y, w, h, reverse] of [[202, 56, 800, 86, true], [296, 311, 702, 87, false]]) {
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    c.translate(0, 2 * y + h); c.scale(1, -1);
    c.fillStyle = '#079cde'; c.fillRect(x, y, w, h);
    paintNilSideMural(c, artwork, x, y, w, h, reverse);
    c.restore();
  }
  if (frontArtwork) {
    // Rear corners and the front nose carry matching marbling. The donor UVs
    // are upside down on these panels, just like the two long side panels.
    for (const [x, y, w, h] of [[15, 62, 167, 77], [15, 318, 167, 77]]) {
      c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
      c.translate(0, 2 * y + h); c.scale(1, -1);
      c.drawImage(frontArtwork, 0, 0, frontArtwork.width, frontArtwork.height * .56, x, y, w, h);
      c.restore();
    }
  }
  c.restore();
  clearRearDoorAtlas(c, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas); texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}

// One painted projection is shared by the lower nose and every grille slat.
// The gaps stay black; a full opaque portrait plane would seal the grille.
export const NIL_GRILLE = Object.freeze({ x: .05, bottom: .976, count: 13, spacing: .039, width: .76, slatHeight: .019, z: 4.671 });
export function createNilGrilleGeometry() {
  const geometries = [];
  for (let i = 0; i < NIL_GRILLE.count; i++) {
    const g = new THREE.PlaneGeometry(NIL_GRILLE.width, NIL_GRILLE.slatHeight);
    g.translate(NIL_GRILLE.x, NIL_GRILLE.bottom + i * NIL_GRILLE.spacing, NIL_GRILLE.z);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let j = 0; j < p.count; j++) uv.setXY(j, (p.getX(j) + .975) / 2.04, (p.getY(j) - .60) / .94);
    geometries.push(g);
  }
  const result = mergeGeometries(geometries); geometries.forEach(g => g.dispose());
  return result;
}

export function createNilKirilliSigns(artwork, frontArtwork, windowDecal) {
  const group = new THREE.Group(); group.name = 'Nil Kirilli murals and window stickers';
  const redraw = [];
  function panel(name, w, h, x, y, z, rotation, draw, { width = 1536, height = 384, transparent = false } = {}) {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: texture, transparent, alphaTest: transparent ? .04 : 0, depthWrite: !transparent, roughness: .52, metalness: .06 }));
    mesh.name = name; mesh.position.set(x, y, z); mesh.rotation.y = rotation; group.add(mesh);
    const paint = () => { const c = canvas.getContext('2d'); c.clearRect(0, 0, width, height); draw(c, width, height); texture.needsUpdate = true; };
    paint(); redraw.push(paint); return mesh;
  }
  function lettering(c, text, x, y, size, maxWidth, fill = '#f4f5e9') {
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    c.font = `italic 600 ${size}px "Bus Sinhala", sans-serif`;
    for (const [color, width] of [['#09234b', size * .18], ['#e2edf0', size * .12], ['#1a4a81', size * .045]]) {
      c.strokeStyle = color; c.lineWidth = width; c.strokeText(text, x, y, maxWidth);
    }
    c.fillStyle = fill; c.fillText(text, x, y, maxWidth);
  }
  const marble = (c, w, h) => {
    c.fillStyle = '#078fd5'; c.fillRect(0, 0, w, h);
    if (frontArtwork) c.drawImage(frontArtwork, 0, 0, frontArtwork.width, frontArtwork.height * .5, 0, 0, w, h);
  };
  const decal = (c, x, y, w, h) => {
    if (windowDecal) {
      // Tight crop removes transparent outer margins, retaining the underline.
      c.drawImage(windowDecal, 0, windowDecal.height * .13, windowDecal.width, windowDecal.height * .73, x, y, w, h);
    } else lettering(c, 'නිල් කිරිල්ලී', x + w / 2, y + h / 2, h * .65, w * .94);
  };
  panel('Nil Kirilli SPECIAL front destination crown', 1.80, .235, .045, 2.87, 4.587, 0, (c, w, h) => {
    marble(c, w, h); c.strokeStyle = '#173747'; c.lineWidth = 14; c.beginPath(); c.roundRect(9, 9, w - 18, h - 18, 65); c.stroke();
    c.strokeStyle = '#bba558'; c.lineWidth = 3; c.beginPath(); c.roundRect(22, 22, w - 44, h - 44, 54); c.stroke();
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '600 41px Georgia, serif'; c.fillStyle = '#eed393'; c.fillText('Travel with nil kirilli', w / 2, 65);
    c.font = 'italic 900 246px sans-serif'; c.strokeStyle = '#be936c'; c.lineWidth = 6; c.strokeText('SPECIAL', w / 2, 230, w - 125); c.fillStyle = '#1686bd'; c.fillText('SPECIAL', w / 2, 230, w - 125);
  });
  panel('Nil Kirilli front upper windscreen vinyl', 1.88, .28, .045, 2.385, 4.569, 0, (c, w, h) => decal(c, 0, 0, w, h), { transparent: true });
  // Thin yellow pinstripes frame the two clear windshield panes in the photos.
  for (const x of [-.445, .535]) panel('Nil Kirilli yellow windshield pinstripe', .925, .78, x, 2.015, 4.567, 0, (c, w, h) => {
    c.strokeStyle = '#e9c436'; c.lineWidth = 5; c.strokeRect(5, 5, w - 10, h - 10);
  }, { width: 512, height: 512, transparent: true });
  panel('Nil Kirilli front chrome SUDHARAKA name strip', 1.77, .071, .045, 1.505, 4.619, 0, (c, w, h) => {
    c.fillStyle = '#e9e7d0'; c.fillRect(0, 0, w, h); c.fillStyle = '#063f9d'; c.font = '900 125px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('SUDHARAKA JET LINER 02', w / 2, h / 2, w - 80);
  }, { height: 192 });
  panel('Nil Kirilli lower grille BLUE CHICK 02 label', .83, .085, .05, .929, 4.692, 0, (c, w, h) => {
    c.fillStyle = '#e7db94'; c.fillRect(0, 0, w, h); c.fillStyle = '#123d80'; c.font = '900 137px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('BLUE CHICK 02', w / 2, h / 2, w - 80);
  }, { height: 192 });

  // The same left-hand woman from the side master appears on the nose. Reuse
  // her pixels so facial identity cannot drift between independent generations.
  const nose = document.createElement('canvas'); nose.width = 1536; nose.height = 768;
  const nc = nose.getContext('2d'); marble(nc, 1536, 768);
  if (artwork) {
    nc.save(); nc.beginPath(); nc.rect(448, 30, 640, 738); nc.clip();
    // Feather the crop's outside edges into the marbling without altering her face.
    const portrait = document.createElement('canvas'); portrait.width = 640; portrait.height = 738;
    const pc = portrait.getContext('2d');
    pc.drawImage(artwork, artwork.width * .075, artwork.height * .06, artwork.width * .17, artwork.height * .58, 0, 0, 640, 738);
    pc.globalCompositeOperation = 'destination-in';
    const fade = pc.createLinearGradient(0, 0, 640, 0); fade.addColorStop(0, 'transparent'); fade.addColorStop(.12, 'white'); fade.addColorStop(.88, 'white'); fade.addColorStop(1, 'transparent');
    pc.fillStyle = fade; pc.fillRect(0, 0, 640, 738); nc.drawImage(portrait, 448, 30); nc.restore();
  }
  const noseTexture = new THREE.CanvasTexture(nose); noseTexture.colorSpace = THREE.SRGBColorSpace; noseTexture.anisotropy = 4;
  const painted = new THREE.MeshStandardMaterial({ map: noseTexture, roughness: .47, metalness: .12 });
  const nosePanel = new THREE.Mesh(new THREE.PlaneGeometry(2.04, .94), painted); nosePanel.position.set(.045, 1.07, 4.578); nosePanel.name = 'Nil Kirilli marbled front nose and shared pale woman'; group.add(nosePanel);
  const grille = new THREE.Mesh(createNilGrilleGeometry(), painted); grille.name = 'Nil Kirilli pale woman painted on separated grille slats'; group.add(grille);

  panel('Nil Kirilli rear upper destination sticker', 1.69, .245, .045, 2.69, -4.955, Math.PI, (c, w, h) => { marble(c, w, h); decal(c, 45, 10, w - 90, h - 20); });
  panel('Nil Kirilli rear marbled panel above tail lamps', 1.98, .42, .045, 1.54, -4.951, Math.PI, marble);
  panel('Nil Kirilli full rear window name and swoosh sticker', 1.80, .71, .045, 2.11, -4.96, Math.PI, (c, w, h) => {
    c.fillStyle = '#071a25'; c.fillRect(0, 0, w, h); c.strokeStyle = '#a3cedb'; c.lineWidth = 10; c.beginPath(); c.roundRect(7, 7, w - 14, h - 14, 42); c.stroke();
    // Subtle pinstripe flourishes sit behind the full-size pale name sticker.
    c.strokeStyle = '#88c3d2'; c.lineWidth = 2;
    for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(55, 85 + i * 9); c.bezierCurveTo(w * .3, 20, w * .7, 160, w - 55, 65 + i * 13); c.stroke(); }
    decal(c, 25, 150, w - 50, h - 270);
    c.textAlign = 'center'; c.font = '600 46px sans-serif'; c.fillStyle = '#d5b76a'; c.fillText('BLUE CHICK 02  •  SUDHARAKA JET LINER', w / 2, h - 40, w - 120);
  }, { height: 768 });
  panel('Nil Kirilli COME FLY WITH ME spoiler lettering', 1.68, .075, .04, 2.975, -4.841, Math.PI, (c, w, h) => {
    c.fillStyle = '#0871c1'; c.fillRect(0, 0, w, h); c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = 'italic 700 132px sans-serif'; c.fillStyle = '#e4eee9'; c.fillText('COME FLY WITH ME', w / 2, h / 2, w - 80);
  }, { height: 192 });
  panel('Nil Kirilli rear black lower quotation panel', 1.79, .43, .045, .84, -4.967, Math.PI, (c, w, h) => {
    c.fillStyle = '#061119'; c.fillRect(0, 0, w, h); c.strokeStyle = '#b5d2d9'; c.lineWidth = 13; c.beginPath(); c.roundRect(8, 8, w - 16, h - 16, 48); c.stroke();
    lettering(c, 'නිල් කිරිල්ලී', w / 2, h * .32, 95, w * .87);
    c.textAlign = 'center'; c.font = 'italic 700 53px Georgia, serif'; c.fillStyle = '#dce8ed'; c.fillText('Blue Chick 02', w / 2, h * .75);
  });
  panel('Nil Kirilli rear decorated mudflap', 2.02, .24, .045, .22, -4.99, Math.PI, (c, w, h) => {
    marble(c, w, h); decal(c, 30, 8, w - 60, h - 16);
  });
  panel('Nil Kirilli gold front Sinhala nameplate', .77, .19, .045, .555, 4.943, 0, (c, w, h) => {
    c.fillStyle = '#c7b066'; c.fillRect(0, 0, w, h); c.strokeStyle = '#e8dfb4'; c.lineWidth = 9; c.strokeRect(5, 5, w - 10, h - 10); lettering(c, 'නිල් කිරිල්ලී', w / 2, h / 2, 225, w - 100, '#123976');
  });
  for (const rear of [false, true]) panel(`Nil Kirilli ${rear ? 'rear' : 'front'} UP ND-4138 registration`, .53, .105, .045, rear ? 1.22 : .415, rear ? -4.977 : 4.953, rear ? Math.PI : 0, (c, w, h) => {
    c.fillStyle = rear ? '#e9c654' : '#e9e6d6'; c.fillRect(0, 0, w, h); c.fillStyle = '#223039'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '700 137px monospace'; c.fillText('UP ND - 4138', w / 2, h / 2, w - 45);
  }, { width: 1024, height: 192 });
  // Small repeated name marks above the main side ribbons are independent of
  // the long mural, so text never reverses when switching to the opposite UV row.
  for (const side of [-1, 1]) {
    const x = side > 0 ? 1.067 : -.954;
    panel('Nil Kirilli side Sinhala name sticker', 2.5, .19, x, 1.61, .05, side * Math.PI / 2, (c, w, h) => decal(c, 0, 0, w, h), { transparent: true });
    panel('Nil Kirilli sweeping Blue Chick side lettering', 3.9, .38, x + side * .002, 1.035, .20, side * Math.PI / 2, (c, w, h) => {
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round'; c.font = 'italic 900 305px Georgia, serif';
      for (const [color, width] of [['#061e40', 30], ['#d7f0f5', 20], ['#154e80', 10]]) { c.lineWidth = width; c.strokeStyle = color; c.strokeText('Blue Chick', w / 2, h * .49, w - 100); }
      const fill = c.createLinearGradient(0, 65, 0, h - 40); fill.addColorStop(0, '#f2fbff'); fill.addColorStop(.45, '#9ecfdf'); fill.addColorStop(.52, '#2d6e9a'); fill.addColorStop(1, '#edfaff'); c.fillStyle = fill; c.fillText('Blue Chick', w / 2, h * .49, w - 100);
    }, { transparent: true });
  }
  loadRearTextFont().then(() => redraw.forEach(draw => draw()));
  return group;
}
