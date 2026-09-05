export function drawBatteryChart(cv: HTMLCanvasElement, history?: [number, number][]) {
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const W = cv.width;
  const H = cv.height;
  ctx.clearRect(0, 0, W, H);
  if (!history || history.length < 2) {
    ctx.fillStyle = '#444';
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

  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1;
  [lo, hi].forEach(v => {
    ctx.beginPath();
    ctx.moveTo(8, Y(v));
    ctx.lineTo(W - 8, Y(v));
    ctx.stroke();
    ctx.fillStyle = '#555';
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(v + '%', 10, Y(v) - 4);
  });

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(34,197,94,0.45)');
  grad.addColorStop(1, 'rgba(34,197,94,0.02)');
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
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.stroke();

  const lx = X(pts.length - 1);
  const ly = Y(pts[pts.length - 1][1]);
  ctx.beginPath();
  ctx.arc(lx, ly, 6, 0, 7);
  ctx.fillStyle = '#4ade80';
  ctx.fill();
}

export function drawSpark(cv: HTMLCanvasElement, history?: [number, number][], color = '#38bdf8') {
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const W = cv.width;
  const H = cv.height;
  ctx.clearRect(0, 0, W, H);
  if (!history || history.length < 2) {
    ctx.fillStyle = '#444';
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
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.stroke();
  const lx = X(pts.length - 1);
  const ly = Y(pts[pts.length - 1][1]);
  ctx.beginPath();
  ctx.arc(lx, ly, 5, 0, 7);
  ctx.fillStyle = color;
  ctx.fill();
}