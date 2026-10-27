import * as THREE from 'three';
import { clearRearDoorAtlas, clearFrontDoorAtlas } from './bus-doors.js';
import { loadRearTextFont } from './rear-text.js';

// The supplied photos show several SLTB buses, rather than one surveyed bus.
// Use the legible 120 Kalawana–Colombo / NB-3328 identity from the front photo;
// the rear layout follows the rear photo, with the user's explicit blue glass.
export const SLTB_LIVERY = Object.freeze({
  red: '#d91824', stripe: '#263557', trim: '#d7d3bd',
  route: '120', from: 'කලවාන', to: 'කොළඹ', plate: 'NB - 3328',
});

export function createSLTBAtlas(source) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2048, source.width);
  canvas.height = Math.round(canvas.width * source.height / source.width);
  const c = canvas.getContext('2d');
  c.drawImage(source, 0, 0, canvas.width, canvas.height);
  const pixels = c.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const x = (i / 4 % canvas.width) / canvas.width * 1024;
    const y = Math.floor(i / 4 / canvas.width) / canvas.height * 512;
    const r = pixels.data[i], g = pixels.data[i + 1], b = pixels.data[i + 2];
    const sideWindow = (y > 157 && y < 209 && x > 204 && x < 1003)
      || (y > 411 && y < 464 && x > 300 && x < 1003);
    const endWindow = x > 26 && x < 169 && ((y > 159 && y < 202) || (y > 406 && y < 458));
    if ((sideWindow && r > 42 && Math.abs(r - g) < 8 && Math.abs(g - b) < 8) || (endWindow && r > 42)) {
      pixels.data[i + 3] = 0;
    } else if (r > 140 && g > 140 && b > 140) {
      // Keep a little of the original shaded sheet-metal detail in the repaint.
      const light = (r + g + b) / 765;
      pixels.data[i] = 160 + light * 65;
      pixels.data[i + 1] = 12 + light * 20;
      pixels.data[i + 2] = 21 + light * 20;
    } else if (b > 150 && b > r * 1.8) {
      pixels.data[i] = 38; pixels.data[i + 1] = 53; pixels.data[i + 2] = 87;
    }
  }
  c.putImageData(pixels, 0, 0);
  c.save(); c.scale(canvas.width / 1024, canvas.height / 512);
  for (const [x, y, w, h] of [[202, 56, 800, 86], [296, 311, 702, 87]]) {
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    // Both donor body rows are vertically inverted relative to the windows.
    c.translate(0, 2 * y + h); c.scale(1, -1);
    c.fillStyle = SLTB_LIVERY.red; c.fillRect(x, y, w, h);
    c.fillStyle = SLTB_LIVERY.trim; c.fillRect(x, y, w, 4.4);
    c.fillStyle = '#e6e4d6'; c.fillRect(x, y + .8, w, .8);
    c.fillStyle = '#959890'; c.fillRect(x, y + 4.0, w, .5);
    c.fillStyle = SLTB_LIVERY.stripe; c.fillRect(x, y + 12.0, w, 12.4);
    c.fillStyle = '#c4c7bd'; c.fillRect(x, y + 25.3, w, 1.1);
    // Subtle skirt seam, rather than decorative artwork on the service bus.
    c.fillStyle = '#a5111a'; c.fillRect(x, y + h - 3, w, .7);
    c.restore();
  }
  for (const [x, y, w, h] of [[15, 62, 167, 77], [15, 318, 167, 77]]) {
    c.fillStyle = SLTB_LIVERY.red; c.fillRect(x, y, w, h);
  }
  c.restore();
  // Independent open door meshes supply the skins, glazing and metal edges.
  clearRearDoorAtlas(c, canvas.width, canvas.height);
  clearFrontDoorAtlas(c, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false; texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}

export function createSLTBSigns() {
  const group = new THREE.Group(); group.name = 'SLTB Kalawana route boards and window lettering';
  const redraw = [];
  const panel = (name, w, h, x, y, z, rotation, draw, width = 1536, height = 256) => {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    const material = new THREE.MeshStandardMaterial({ map: texture, roughness: .68, metalness: .02 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.name = name; mesh.position.set(x, y, z); mesh.rotation.y = rotation; group.add(mesh);
    const paint = () => { const c = canvas.getContext('2d'); c.clearRect(0, 0, width, height); draw(c, width, height); texture.needsUpdate = true; };
    paint(); redraw.push(paint); return mesh;
  };
  function routeBoard(c, w, h) {
    c.fillStyle = '#f2e7a1'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#18211e'; c.lineWidth = 8; c.beginPath(); c.roundRect(5, 5, w - 10, h - 10, 24); c.stroke();
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#16221c';
    c.font = '600 108px "Bus Sinhala", sans-serif';
    c.fillText(SLTB_LIVERY.from, w * .245, h * .31, w * .39);
    c.fillText(SLTB_LIVERY.to, w * .755, h * .31, w * .39);
    c.font = '700 52px sans-serif';
    c.fillText('KALAWANA', w * .245, h * .78, w * .39);
    c.fillText('COLOMBO', w * .755, h * .78, w * .39);
    c.fillStyle = '#145595'; c.beginPath(); c.arc(w * .5, h * .50, h * .385, 0, Math.PI * 2); c.fill();
    c.font = '700 102px Georgia, serif'; c.fillStyle = '#fff9d8'; c.fillText(SLTB_LIVERY.route, w * .5, h * .52, h * .70);
  }
  // This crown is physically above the windshield; do not put it on the glass.
  panel('SLTB raised front 120 Kalawana Colombo route banner', 1.78, .245, .045, 2.80, 4.595, 0, routeBoard);
  panel('SLTB raised rear 120 Kalawana Colombo route banner', 1.66, .22, .045, 2.69, -4.967, Math.PI, routeBoard);
  for (const [x, text] of [[-.435, 'Kalawana'], [.525, 'Express']]) {
    panel(`SLTB upper front black ${text} lettering band`, .925, .155, x, 2.40, 4.573, 0, (c, w, h) => {
      c.fillStyle = '#081316'; c.fillRect(0, 0, w, h);
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = 'italic 700 174px Georgia, serif';
      c.strokeStyle = '#e9eee2'; c.lineWidth = 9; c.strokeText(text, w / 2, h * .51, w - 70);
      c.fillStyle = '#4a719c'; c.fillText(text, w / 2, h * .51, w - 70);
      c.fillStyle = '#c8bd74'; c.fillRect(8, h - 10, w - 16, 4);
    });
  }
  // Blue glazing remains exposed between opaque black lettering bands.
  const blueGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.80, .71), new THREE.MeshStandardMaterial({
    color: '#1b76a7', transparent: true, opacity: .78, roughness: .21, metalness: .12,
    depthWrite: false, side: THREE.DoubleSide,
  }));
  blueGlass.name = 'SLTB blue rear window'; blueGlass.position.set(.045, 2.11, -4.96); blueGlass.rotation.y = Math.PI; group.add(blueGlass);
  for (const [x, text] of [[-.48, SLTB_LIVERY.from], [.57, SLTB_LIVERY.to]]) {
    panel('SLTB rear window upper black destination lettering', .58, .115, x, 2.34, -4.979, Math.PI, (c, w, h) => {
      c.fillStyle = '#071116'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#f1f0df'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = '600 153px "Bus Sinhala", sans-serif'; c.fillText(text, w / 2, h * .48, w - 80);
    });
  }
  panel('SLTB rear window black Kalawana Express lettering band', 1.70, .18, .045, 1.88, -4.98, Math.PI, (c, w, h) => {
    c.fillStyle = '#061116'; c.fillRect(0, 0, w, h);
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    c.font = '600 112px "Bus Sinhala", sans-serif'; c.strokeStyle = '#174664'; c.lineWidth = 12;
    c.strokeText(`${SLTB_LIVERY.from} — ${SLTB_LIVERY.to}`, w / 2, h * .33, w - 80);
    c.fillStyle = '#e9eee4'; c.fillText(`${SLTB_LIVERY.from} — ${SLTB_LIVERY.to}`, w / 2, h * .33, w - 80);
    c.font = 'italic 700 73px Georgia, serif'; c.fillText('Kalawana Express', w / 2, h * .80, w - 160);
  });
  panel('SLTB front LANKA ASHOK LEYLAND maker lettering', 1.48, .065, .045, 1.625, 4.755, 0, (c, w, h) => {
    c.fillStyle = '#111d1c'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#f2e8c4'; c.font = '700 142px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('LANKA ASHOK LEYLAND', w / 2, h / 2, w - 70);
  });
  panel('SLTB rear small cream LANKA ASHOK LEYLAND maker label', 1.22, .065, .045, 1.13, -4.981, Math.PI, (c, w, h) => {
    c.fillStyle = '#e6d9b6'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#2c241e'; c.font = '700 140px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('LANKA ASHOK LEYLAND', w / 2, h / 2, w - 55);
  });
  panel('SLTB rear transport board lettering', 1.13, .055, .045, 1.035, -4.98, Math.PI, (c, w, h) => {
    c.fillStyle = SLTB_LIVERY.red; c.fillRect(0, 0, w, h);
    c.fillStyle = '#e8d7ac'; c.font = '600 130px "Bus Sinhala", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('ශ්‍රී ලංකා ගමනාගමන මණ්ඩලය', w / 2, h / 2, w - 45);
  });
  for (const rear of [false, true]) {
    panel(`SLTB ${rear ? 'rear' : 'front'} NB-3328 registration`, .52, .105, rear ? .045 : .72, rear ? 1.30 : .68, rear ? -4.983 : 4.805, rear ? Math.PI : 0, (c, w, h) => {
      c.fillStyle = rear ? '#d5b948' : '#e9e7d7'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#20211b'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '700 135px monospace';
      c.fillText(SLTB_LIVERY.plate, w / 2, h / 2, w - 60);
    });
  }
  loadRearTextFont().then(() => redraw.forEach(draw => draw()));
  return group;
}
