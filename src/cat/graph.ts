// 자세 이름과 허용된 전환. 두뇌(전환 시간 예측)와 애니메이터(실제 보간)가 같이 쓴다.
export type PoseName = 'stand' | 'sit' | 'loaf' | 'groom' | 'lieSide' | 'curl' | 'bellyUp' | 'crouch';
export const POSE_NAMES: PoseName[] = ['stand', 'sit', 'loaf', 'groom', 'lieSide', 'curl', 'bellyUp', 'crouch'];

const EDGES: [PoseName, PoseName][] = [
  ['stand', 'sit'], ['sit', 'groom'],
  ['stand', 'loaf'], ['loaf', 'lieSide'], ['lieSide', 'bellyUp'], ['lieSide', 'curl'],
  ['stand', 'crouch'],
];

export const TRANSITION_SEC = 0.6;

const ADJ = new Map<PoseName, PoseName[]>();
for (const [a, b] of EDGES) {
  ADJ.set(a, [...(ADJ.get(a) ?? []), b]);
  ADJ.set(b, [...(ADJ.get(b) ?? []), a]);
}

/** from에서 to까지 거쳐 가는 자세 목록(양 끝 포함, BFS 최단 경로) */
export function posePath(from: PoseName, to: PoseName): PoseName[] {
  if (from === to) return [from];
  const prev = new Map<PoseName, PoseName>([[from, from]]);
  const queue: PoseName[] = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === to) break;
    for (const n of ADJ.get(cur) ?? []) if (!prev.has(n)) { prev.set(n, cur); queue.push(n); }
  }
  const path: PoseName[] = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0])!);
  return path;
}

export const transitionTime = (from: PoseName, to: PoseName): number => (posePath(from, to).length - 1) * TRANSITION_SEC;
