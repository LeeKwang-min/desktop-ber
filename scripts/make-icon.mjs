// 베르 얼굴 아이콘을 그린다. 외부 의존성 없음.
//  - assets/app-icon.png (1024, 컬러, tauri icon 입력)
//  - src-tauri/icons/tray.png (44 = 22pt@2x, 메뉴바 템플릿: 검은 실루엣 + 투명한 눈)
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const FUR = [35, 37, 43], WHITE = [244, 243, 238], IRIS = [197, 214, 61], PUPIL = [12, 12, 14], SHINE = [255, 255, 255], BLACK = [0, 0, 0];
const CLEAR = 'clear';

const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const inTri = (x, y, [ax, ay], [bx, by], [cx, cy]) => {
  const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
  const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
  const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};
const ears = (x, y) => inTri(x, y, [250, 420], [330, 120], [470, 330]) || inTri(x, y, [774, 420], [694, 120], [554, 330]);
const head = (x, y) => inEllipse(x, y, 512, 560, 360, 320);
const eyes = (x, y) => inEllipse(x, y, 380, 540, 70, 76) || inEllipse(x, y, 644, 540, 70, 76);

// 모양 좌표는 1024 기준. 배열 뒤쪽이 위에 그려진다. CLEAR는 그 자리를 투명하게 뚫는다.
const FACE = [
  [FUR, ears], [FUR, head],
  [WHITE, (x, y) => inEllipse(x, y, 512, 760, 120, 80)],
  [WHITE, (x, y) => inEllipse(x, y, 450, 700, 80, 62) || inEllipse(x, y, 574, 700, 80, 62)],
  [FUR, (x, y) => inEllipse(x, y, 512, 668, 34, 24)],
  [IRIS, eyes],
  [PUPIL, (x, y) => inEllipse(x, y, 380, 548, 28, 62) || inEllipse(x, y, 644, 548, 28, 62)],
  [SHINE, (x, y) => inEllipse(x, y, 402, 508, 16, 16) || inEllipse(x, y, 666, 508, 16, 16)],
];
const SILHOUETTE = [[BLACK, ears], [BLACK, head], [CLEAR, eyes]];

function draw(S, layers, SS = 4) {
  const px = Buffer.alloc(S * S * 4), k = 1024 / S;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const fx = (x + (sx + 0.5) / SS) * k, fy = (y + (sy + 0.5) / SS) * k;
      let col = null;
      for (const [c, hit] of layers) if (hit(fx, fy)) col = c;
      if (col && col !== CLEAR) { r += col[0]; g += col[1]; b += col[2]; a += 1; }
    }
    const i = (y * S + x) * 4;
    if (a) { px[i] = r / a; px[i + 1] = g / a; px[i + 2] = b / a; }
    px[i + 3] = Math.round((a / (SS * SS)) * 255);
  }
  return px;
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const v of buf) c = crcTable[(c ^ v) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
function writePng(path, S, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(S * (S * 4 + 1));
  for (let y = 0; y < S; y++) px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
  writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
  console.log('wrote', path);
}

mkdirSync('assets', { recursive: true });
writePng('assets/app-icon.png', 1024, draw(1024, FACE));
writePng('src-tauri/icons/tray.png', 44, draw(44, SILHOUETTE, 8));
