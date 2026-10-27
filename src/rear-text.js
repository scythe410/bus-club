import * as THREE from 'three';

export const REAR_TEXT_MAX_LENGTH = 80;
let fontReady;
const rearTextFontURL = new URL('./assets/noto-sans-sinhala.ttf', import.meta.url).href;

/** Keep native Sinhala grapheme clusters intact at the network's UTF-16 limit. */
export function formatRearText(value) {
  const text = String(value ?? '').normalize('NFC').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '');
  const [first, ...rest] = text.split('\n');
  const twoLines = rest.length ? `${first}\n${rest.join(' ')}` : first;
  const clusters = typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter('si', { granularity: 'grapheme' }).segment(twoLines)].map(part => part.segment)
    : twoLines.match(/\P{M}\p{M}*|\p{M}+/gu) || [];
  let result = '';
  for (const cluster of clusters) {
    if (result.length + cluster.length > REAR_TEXT_MAX_LENGTH) break;
    result += cluster;
  }
  return result;
}

export function loadRearTextFont() {
  if (!fontReady) {
    fontReady = (async () => {
      if (typeof FontFace === 'undefined' || !document.fonts) return false;
      const face = new FontFace('Bus Sinhala', `url("${rearTextFontURL}")`, { weight: '600', style: 'normal', display: 'swap' });
      document.fonts.add(await face.load());
      return true;
    })().catch(() => false);
  }
  return fontReady;
}

export class RearTextPanel {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 256;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.1, .525), new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false }));
    this.mesh.rotation.y = Math.PI;
    this.mesh.position.set(0, 1.66, -4.735);
    this.mesh.visible = false;
    loadRearTextFont().then(loaded => {
      if (loaded && !this.disposed && this.text?.trim()) this.draw();
    });
  }
  setSkin(skin) {
    const text = formatRearText(skin.rearText);
    const color = skin.color || '#e9d7ad';
    const accent = skin.accent || '#e86d48';
    if (text === this.text && color === this.color && accent === this.accent) return;
    this.text = text;
    this.color = color;
    this.accent = accent;
    this.mesh.visible = Boolean(text.trim());
    if (this.mesh.visible) this.draw();
  }
  useImportedModel() {
    this.mesh.geometry.dispose();
    this.mesh.geometry = new THREE.PlaneGeometry(1.65, .4125);
    // The normalized GLB rear shell reaches z=-4.86 below its window grilles.
    this.mesh.position.set(.035, .84, -4.985);
  }
  draw() {
    const c = this.canvas.getContext('2d');
    c.clearRect(0, 0, 1024, 256);
    c.fillStyle = '#182b2c';
    c.fillRect(0, 0, 1024, 256);
    c.fillStyle = this.accent;
    c.fillRect(0, 0, 1024, 8);
    c.fillRect(0, 248, 1024, 8);
    const lines = this.text.trim().split('\n').map(line => line.trim());
    let size = lines.length > 1 ? 76 : 98;
    const setFont = () => { c.font = `600 ${size}px "Bus Sinhala", system-ui, sans-serif`; };
    setFont();
    while (size > 10 && lines.some(line => c.measureText(line).width > 944)) { size -= 2; setFont(); }
    c.fillStyle = '#fff5dc';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const lineHeight = size * 1.45;
    const firstY = 128 - (lines.length - 1) * lineHeight / 2;
    lines.forEach((line, index) => c.fillText(line, 512, firstY + index * lineHeight));
    this.texture.needsUpdate = true;
  }
  dispose() {
    this.disposed = true;
    // Bus.disposeModel owns the mesh's geometry, material and texture.
  }
}
