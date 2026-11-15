// SOLARIS — procedural canvas textures. Golden-hour desert solar farm palette:
// sand gold, panel blue, dark steel, concrete, rust. All textures are drawn once here.
import * as THREE from 'three';

function canvas(size, fn) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  fn(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function speckle(x, s, n, colors, rMin, rMax) {
  for (let i = 0; i < n; i++) {
    x.fillStyle = colors[(Math.random() * colors.length) | 0];
    const r = rMin + Math.random() * (rMax - rMin);
    x.beginPath(); x.arc(Math.random() * s, Math.random() * s, r, 0, 7); x.fill();
  }
}

export function sandTex() {
  return canvas(512, (x, s) => {
    x.fillStyle = '#d9a05b'; x.fillRect(0, 0, s, s);
    // dune ripple bands
    for (let i = 0; i < 26; i++) {
      const y = Math.random() * s, h = 6 + Math.random() * 18;
      const g = x.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, 'rgba(190,130,70,0.25)'); g.addColorStop(0.5, 'rgba(240,190,120,0.18)'); g.addColorStop(1, 'rgba(190,130,70,0)');
      x.fillStyle = g; x.fillRect(0, y, s, h);
    }
    speckle(x, s, 2600, ['#c08a4a', '#e8b878', '#a87a3e', '#f0c184'], 0.6, 2.2);
    // faint tyre / foot tracks
    x.strokeStyle = 'rgba(120,80,40,0.16)'; x.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      x.beginPath(); const y = Math.random() * s;
      x.moveTo(0, y); x.bezierCurveTo(s * 0.3, y + 14, s * 0.6, y - 14, s, y + 6); x.stroke();
    }
  });
}

export function panelTex() {
  return canvas(256, (x, s) => {
    const g = x.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#2a5f8a'); g.addColorStop(0.5, '#1e4a6e'); g.addColorStop(1, '#16395a');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    // cell grid
    x.strokeStyle = 'rgba(150,200,240,0.5)'; x.lineWidth = 1;
    for (let i = 0; i <= 6; i++) {
      x.beginPath(); x.moveTo(i * s / 6, 0); x.lineTo(i * s / 6, s); x.stroke();
      x.beginPath(); x.moveTo(0, i * s / 6); x.lineTo(s, i * s / 6); x.stroke();
    }
    // busbar shine
    x.strokeStyle = 'rgba(220,240,255,0.35)'; x.lineWidth = 2;
    for (let i = 1; i < 6; i += 2) { x.beginPath(); x.moveTo(0, i * s / 6); x.lineTo(s, i * s / 6); x.stroke(); }
    speckle(x, s, 120, ['#3a7ab0', '#123a5c'], 0.5, 1.5);
    // frame
    x.strokeStyle = '#aab2ba'; x.lineWidth = 10; x.strokeRect(0, 0, s, s);
  });
}

export function concreteTex() {
  return canvas(256, (x, s) => {
    x.fillStyle = '#9a938a'; x.fillRect(0, 0, s, s);
    speckle(x, s, 1800, ['#8a837a', '#aaa39a', '#7c766e'], 0.5, 2);
    // stains
    for (let i = 0; i < 8; i++) {
      const r = 20 + Math.random() * 50;
      const g = x.createRadialGradient(Math.random() * s, Math.random() * s, 0, Math.random() * s, Math.random() * s, r);
      g.addColorStop(0, 'rgba(90,80,70,0.18)'); g.addColorStop(1, 'rgba(90,80,70,0)');
      x.fillStyle = g; x.fillRect(0, 0, s, s);
    }
    // panel seams
    x.strokeStyle = 'rgba(60,55,50,0.35)'; x.lineWidth = 2;
    x.strokeRect(1, 1, s - 2, s - 2);
    x.beginPath(); x.moveTo(s / 2, 0); x.lineTo(s / 2, s); x.stroke();
  });
}

export function metalTex() {
  return canvas(256, (x, s) => {
    x.fillStyle = '#3a4046'; x.fillRect(0, 0, s, s);
    // brushed lines
    for (let i = 0; i < 90; i++) {
      x.strokeStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
      x.lineWidth = 1; const y = Math.random() * s;
      x.beginPath(); x.moveTo(0, y); x.lineTo(s, y + (Math.random() * 4 - 2)); x.stroke();
    }
    // rust spots
    for (let i = 0; i < 14; i++) {
      const px = Math.random() * s, py = Math.random() * s, r = 3 + Math.random() * 12;
      const g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, 'rgba(150,80,35,0.5)'); g.addColorStop(1, 'rgba(150,80,35,0)');
      x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
    }
    speckle(x, s, 300, ['#4a5058', '#2c3136'], 0.5, 1.5);
  });
}

export function roofTex() {
  return canvas(256, (x, s) => {
    x.fillStyle = '#6b5a44'; x.fillRect(0, 0, s, s);
    for (let i = 0; i < 16; i++) {
      x.fillStyle = i % 2 ? 'rgba(0,0,0,0.18)' : 'rgba(255,220,160,0.10)';
      x.fillRect(i * s / 16, 0, s / 32, s);
    }
    speckle(x, s, 500, ['#7d6b52', '#54432e'], 0.5, 1.8);
  });
}

export function skyTex() {
  // vertical golden-hour gradient for the sky dome (equirect-ish, used on a backside sphere)
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#2c4a6b'); g.addColorStop(0.35, '#7d8aa8'); g.addColorStop(0.55, '#e8a35c');
  g.addColorStop(0.7, '#ffb347'); g.addColorStop(0.85, '#e08a3c'); g.addColorStop(1, '#8a5a30');
  x.fillStyle = g; x.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function hazardTex() {
  return canvas(128, (x, s) => {
    x.fillStyle = '#e8b13a'; x.fillRect(0, 0, s, s);
    x.fillStyle = '#1c1c1c';
    for (let i = -2; i < 6; i++) {
      x.beginPath();
      x.moveTo(i * 32, s); x.lineTo(i * 32 + 16, 0); x.lineTo(i * 32 + 32, 0); x.lineTo(i * 32 + 16, s);
      x.fill();
    }
  });
}
