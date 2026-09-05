function accent(): { rgb: (a: number) => string; hex: string } {
  const v = (getComputedStyle(document.documentElement).getPropertyValue('--accent-blue') || '#00a4dc').trim();
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(v);
  const rgb = m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 164, 220];
  return {
    rgb: a => 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a + ')',
    hex: '#' + rgb.map(c => c.toString(16).padStart(2, '0')).join(''),
  };
}

function theme(): 'light' | 'dark' {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function drawBatteryChart(cv: HTMLCanvasElement, history?: [number, number][]) {
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const W = cv.width;
  const H = cv.height;
  ctx.clearRect(0, 0, W, H);
  const t = theme();
  const a = accent();
  const grid = t === 'light' ? '#e6e8ee' : '#22222e';
  const label = t === 'light' ? '#8a8a98' : '#555';
  const empty = t === 'light' ? '#9a9aa8' : '#444';

  if (!history || history.length < 2) {
    ctx.fillStyle = empty;
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('coletando histórico…', W / 2, H / 2);
    return;
  }
  const pts = history.slice(-120);
  const min = Math.min(...pts.map(p => p[1]));
  const max = Math.max(...pts.map(p => p[1]));
  const lo = Math.max(0, Math.floor(min - 5));
  const hi = Math.min(100, Math.ceil(max + 5)) || 100;
  const X = (i: number) => 8 + (i * (W - 16)) / (pts.length - 1);
  const Y = (v: number) => H - 14 - ((v - lo) / ((hi - lo) || 1)) * (H - 28);

  ctx.strokeStyle = grid;
  ctx.lineWidth = 1;
  [lo, hi].forEach(v => {
    ctx.beginPath();
    ctx.moveTo(8, Y(v));
    ctx.lineTo(W - 8, Y(v));
    ctx.stroke();
    ctx.fillStyle = label;
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(v + '%', 10, Y(v) - 4);
  });

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, a.rgb(0.4));
  grad.addColorStop(1, a.rgb(0.02));
  ctx.beginPath();
  ctx.moveTo(X(0), Y(pts[0][1]));
  pts.forEach((p, i) => ctx.lineTo(X(i), Y(p[1])));
  ctx.lineTo(X(pts.length - 1), H - 8);
  ctx.lineTo(X(0), H - 8);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(X(0), Y(pts[0][1]));
  pts.forEach((p, i) => ctx.lineTo(X(i), Y(p[1])));
  ctx.strokeStyle = a.hex;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.stroke();

  const lx = X(pts.length - 1);
  const ly = Y(pts[pts.length - 1][1]);
  ctx.beginPath();
  ctx.arc(lx, ly, 6, 0, 7);
  ctx.fillStyle = a.hex;
  ctx.fill();
}

export function drawSpark(cv: HTMLCanvasElement, history?: [number, number][]) {
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const W = cv.width;
  const H = cv.height;
  ctx.clearRect(0, 0, W, H);
  const t = theme();
  const a = accent();
  const empty = t === 'light' ? '#9a9aa8' : '#444';

  if (!history || history.length < 2) {
    ctx.fillStyle = empty;
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('coletando…', W / 2, H / 2);
    return;
  }
  const pts = history.slice(-120);
  const max = Math.max(10, Math.ceil(Math.max(...pts.map(p => p[1])) + 5));
  const X = (i: number) => 6 + (i * (W - 12)) / (pts.length - 1);
  const Y = (v: number) => H - 10 - (v / max) * (H - 20);
  ctx.beginPath();
  ctx.moveTo(X(0), Y(pts[0][1]));
  pts.forEach((p, i) => ctx.lineTo(X(i), Y(p[1])));
  ctx.strokeStyle = a.hex;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.stroke();
  const lx = X(pts.length - 1);
  const ly = Y(pts[pts.length - 1][1]);
  ctx.beginPath();
  ctx.arc(lx, ly, 5, 0, 7);
  ctx.fillStyle = a.hex;
  ctx.fill();
}