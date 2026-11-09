/* ============================================================
   게임 상수
============================================================ */
const CONFIG = {
  SIZE: 5,
  MAX_TURN: 50,
  DEFEND_REDUCTION: 0.5,
  BOT_DELAY: 650
};

/* ============================================================
   공격 패턴 헬퍼
============================================================ */
const PATTERNS = {
  lineDiagonal: (from, to, range) => {
    const dr = Math.abs(from.r - to.r), dc = Math.abs(from.c - to.c);
    const aligned = dr === 0 || dc === 0 || dr === dc;
    return aligned && Math.max(dr, dc) > 0 && Math.max(dr, dc) <= range;
  },
  diagonal: (from, to, range) => {
    const dr = Math.abs(from.r - to.r), dc = Math.abs(from.c - to.c);
    return dr === dc && dr > 0 && dr <= range;
  },
  adjacent4: (from, to) =>
    Math.abs(from.r - to.r) + Math.abs(from.c - to.c) === 1,
  adjacent8: (from, to) => {
    const dr = Math.abs(from.r - to.r), dc = Math.abs(from.c - to.c);
    return dr <= 1 && dc <= 1 && (dr + dc) > 0;
  },
  knight: (from, to) => {
    const dr = Math.abs(from.r - to.r), dc = Math.abs(from.c - to.c);
    return (dr === 2 && dc === 1) || (dr === 1 && dc === 2);
  },
  star: (from, to, range) => {
    const dr = Math.abs(from.r - to.r), dc = Math.abs(from.c - to.c);
    if (dr === 0 && dc === 0) return false;
    const isLine = (dr === 0 || dc === 0);
    const isDiag = (dr === dc);
    if (!isLine && !isDiag) return false;
    return Math.max(dr, dc) <= range;
  },
  // 특정 방향(상대 방향)으로만 뻗는 직선
  forwardLine: (from, to) => {
    if (from.r !== to.r) return false;
    const dir = Math.sign(to.c - from.c);
    // 상대가 있는 방향으로만. 여기서는 단순히 같은 행 + 3칸 이내
    return Math.abs(to.c - from.c) <= 3 && dir !== 0;
  },
  // 십자(+) 형태, 거리 1~2
  cross: (from, to, range) => {
    const dr = Math.abs(from.r - to.r), dc = Math.abs(from.c - to.c);
    if (dr === 0 && dc === 0) return false;
    if (dr !== 0 && dc !== 0) return false;
    return Math.max(dr, dc) <= range;
  }
};

/* ============================================================
   이동 방향 헬퍼
============================================================ */
const MOVE_DIRS = {
  orthogonal: [[-1, 0], [1, 0], [0, -1], [0, 1]],
  diagonal:   [[-1, -1], [-1, 1], [1, -1], [1, 1]],
  all:        [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]],
  knight:     [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]
};

function tilesByAttack(from, attackFn) {
  const tiles = [];
  for (let r = 0; r < CONFIG.SIZE; r++)
    for (let c = 0; c < CONFIG.SIZE; c++)
      if (attackFn(from, { r, c })) tiles.push({ r, c });
  return tiles;
}

function tilesByMove(from, dirs) {
  const tiles = [];
  for (const [dr, dc] of dirs) {
    const r = from.r + dr, c = from.c + dc;
    if (r >= 0 && r < CONFIG.SIZE && c >= 0 && c < CONFIG.SIZE)
      tiles.push({ r, c });
  }
  return tiles;
}

/* ============================================================
   스킬 팩토리: canAttack/attackTiles 자동 생성
============================================================ */
function makeSkill({ id, name, desc, damage, cd, pattern, range, mpCost, ignoreDefense = false, stunTurns = 0, dashBehind = false, bleedTurns = 0, bleedDamage = 0 }) {
  return {
    id, name, desc, damage, cd,
    mpCost: mpCost ?? Math.max(1, damage + (cd >= 3 ? 2 : cd >= 2 ? 1 : 0)),
    ignoreDefense,
    stunTurns,
    dashBehind,
    bleedTurns,
    bleedDamage,
    pattern,
    range,
    canAttack(from, to) {
      return pattern(from, to, range);
    },
    attackTiles(from) {
      return tilesByAttack(from, t => pattern(from, t, range));
    }
  };
}

/* ============================================================
   캐릭터 정의 (8종 × 4스킬 + 기본 공격)
============================================================ */
const CHARACTERS = {
  /* ============ 블레이드 — 근접 딜러 ============ */
  blade: {
    id: 'blade', name: '블레이드', symbol: '⚔', color: '#2196f3',
    role: '근접 딜러',
    hp: 12, maxMp: 10,
    armor: 1,
    moveDirs: MOVE_DIRS.all,
    skills: [
      makeSkill({ id: 'slash',   name: '베기',     desc: '직선·대각선 2칸, 데미지 3',   damage: 3, cd: 0, pattern: PATTERNS.lineDiagonal, range: 2 }),
      makeSkill({ id: 'thrust',  name: '찌르기',   desc: '직선·대각선 3칸, 방어 무시 데미지 4', damage: 4, cd: 1, mpCost: 6, ignoreDefense: true, pattern: PATTERNS.lineDiagonal, range: 3 }),
      makeSkill({ id: 'sweep',   name: '휩쓸기',   desc: '인접 4칸, 데미지 3',           damage: 3, cd: 1, pattern: PATTERNS.adjacent4, range: 1 }),
      makeSkill({ id: 'execute', name: '처형',     desc: '인접 1칸, 데미지 7 (궁극기)',  damage: 7, cd: 3, pattern: PATTERNS.adjacent4, range: 1 })
    ]
  },

  /* ============ 시어 — 원거리 견제 ============ */
  seer: {
    id: 'seer', name: '시어', symbol: '👁', color: '#9c27b0',
    role: '원거리 견제',
    hp: 8, maxMp: 16,
    moveDirs: MOVE_DIRS.all,
    skills: [
      makeSkill({ id: 'glance',  name: '응시',     desc: '대각선 2칸, 데미지 2',           damage: 2, cd: 0, pattern: PATTERNS.diagonal, range: 2 }),
      makeSkill({ id: 'pierce',  name: '관통',     desc: '대각선 3칸, 데미지 2 · 2턴 기절', damage: 2, cd: 1, mpCost: 5, stunTurns: 2, pattern: PATTERNS.diagonal, range: 3 }),
      makeSkill({ id: 'cross',   name: '십자 시선', desc: '십자 2칸, 데미지 2',            damage: 2, cd: 1, pattern: PATTERNS.cross,    range: 2 }),
      makeSkill({ id: 'omni',    name: '전지',     desc: '전방위 2칸, 데미지 4 (궁극기)', damage: 4, cd: 3, pattern: PATTERNS.star,     range: 2 })
    ]
  },

  /* ============ 타이탄 — 근접 탱커 ============ */
  titan: {
    id: 'titan', name: '타이탄', symbol: '🛡', color: '#f44336',
    role: '근접 탱커',
    hp: 20, maxMp: 10,
    basicDamage: 1,
    armor: 1,
    moveDirs: MOVE_DIRS.all,
    skills: [
      makeSkill({ id: 'smash',   name: '강타',     desc: '인접 4칸, 데미지 2',           damage: 2, cd: 0, pattern: PATTERNS.adjacent4, range: 1 }),
      makeSkill({ id: 'quake',   name: '지진',     desc: '인접 8칸, 데미지 1 · 1턴 기절', damage: 1, cd: 2, mpCost: 3, stunTurns: 1, pattern: PATTERNS.adjacent8, range: 1 }),
      makeSkill({ id: 'charge',  name: '돌진',     desc: '직선·대각선 3칸, 방어 무시 데미지 3', damage: 3, cd: 2, mpCost: 5, ignoreDefense: true, pattern: PATTERNS.lineDiagonal, range: 3 }),
      makeSkill({ id: 'annihilate', name: '섬멸',  desc: '인접 4칸, 데미지 4 (궁극기)', damage: 4, cd: 4, mpCost: 7, pattern: PATTERNS.adjacent4, range: 1 })
    ]
  },

  /* ============ 위습 — 기동 암살자 ============ */
  wisp: {
    id: 'wisp', name: '위습', symbol: '✦', color: '#4caf50',
    role: '기동 암살자',
    hp: 9, maxMp: 10,
    armor: 1,
    moveDirs: MOVE_DIRS.all,
    skills: [
      makeSkill({ id: 'jab',     name: '찌르기',   desc: '나이트 1회, 데미지 3',         damage: 3, cd: 0, pattern: PATTERNS.knight,   range: 1 }),
      makeSkill({ id: 'blink',   name: '그림자 추격', desc: '직선·대각선 4칸 돌진, 데미지 2 · 2턴 출혈', damage: 2, cd: 2, mpCost: 5, dashBehind: true, bleedTurns: 2, bleedDamage: 1, pattern: PATTERNS.lineDiagonal, range: 4 }),
      makeSkill({ id: 'ambush',  name: '기습',     desc: '나이트, 데미지 5',             damage: 5, cd: 2, pattern: PATTERNS.knight, range: 1 }),
      makeSkill({ id: 'shadow',  name: '그림자 습격', desc: '전방위 1칸, 데미지 6 (궁극기)', damage: 6, cd: 3, pattern: PATTERNS.adjacent8, range: 1 })
    ]
  },

  /* ============ 워든 — 방어형 ============ */
  warden: {
    id: 'warden', name: '워든', symbol: '◈', color: '#607d8b',
    role: '방어형',
    hp: 20, maxMp: 8,
    basicDamage: 1,
    armor: 1,
    defendReduction: 0.25,
    moveDirs: MOVE_DIRS.all,
    skills: [
      makeSkill({ id: 'shieldBash', name: '방패 치기', desc: '인접 4칸, 데미지 1 · 1턴 기절', damage: 1, cd: 0, mpCost: 3, stunTurns: 1, pattern: PATTERNS.adjacent4, range: 1 }),
      makeSkill({ id: 'fortify',    name: '강화',      desc: '인접 4칸, 데미지 1',        damage: 1, cd: 1, pattern: PATTERNS.adjacent4, range: 1 }),
      makeSkill({ id: 'counter',    name: '반격',      desc: '십자 2칸, 데미지 1',        damage: 1, cd: 1, pattern: PATTERNS.cross, range: 2 }),
      makeSkill({ id: 'judgment',   name: '심판',      desc: '인접 8칸, 방어 무시 데미지 3 (궁극기)', damage: 3, cd: 4, mpCost: 7, ignoreDefense: true, pattern: PATTERNS.adjacent8, range: 1 })
    ]
  },

  /* ============ 리버 — 포위형 ============ */
  reaver: {
    id: 'reaver', name: '리버', symbol: '✖', color: '#ff9800',
    role: '포위형',
    hp: 13, maxMp: 8,
    armor: 1,
    moveDirs: MOVE_DIRS.all,
    skills: [
      makeSkill({ id: 'claw',    name: '할퀴기',   desc: '인접 8칸, 방어 무시 데미지 3', damage: 3, cd: 0, mpCost: 5, ignoreDefense: true, pattern: PATTERNS.adjacent8, range: 1 }),
      makeSkill({ id: 'reap',    name: '수확',     desc: '대각선 3칸, 데미지 4',         damage: 4, cd: 1, pattern: PATTERNS.diagonal, range: 3 }),
      makeSkill({ id: 'whirl',   name: '회전 베기', desc: '전방위 2칸, 데미지 3',        damage: 3, cd: 2, pattern: PATTERNS.star,     range: 2 }),
      makeSkill({ id: 'carnage', name: '학살',     desc: '인접 8칸, 데미지 6 (궁극기)',  damage: 6, cd: 4, pattern: PATTERNS.adjacent8, range: 1 })
    ]
  },

  /* ============ 랜스 — 중거리 ============ */
  lance: {
    id: 'lance', name: '랜스', symbol: '➤', color: '#00bcd4',
    role: '중거리',
    hp: 10, maxMp: 14,
    moveDirs: MOVE_DIRS.all,
    skills: [
      makeSkill({ id: 'poke',    name: '찌르기',   desc: '직선·대각선 2칸, 데미지 2',   damage: 2, cd: 0, pattern: PATTERNS.lineDiagonal, range: 2 }),
      makeSkill({ id: 'pierce',  name: '관통',     desc: '직선·대각선 3칸, 데미지 3',   damage: 3, cd: 1, pattern: PATTERNS.lineDiagonal, range: 3 }),
      makeSkill({ id: 'hook',    name: '갈고리',   desc: '대각선 2칸, 데미지 2',         damage: 2, cd: 1, pattern: PATTERNS.diagonal, range: 2 }),
      makeSkill({ id: 'impale',  name: '꿰뚫기',   desc: '직선·대각선 4칸, 방어 무시 데미지 4 (궁극기)', damage: 4, cd: 3, mpCost: 7, ignoreDefense: true, pattern: PATTERNS.lineDiagonal, range: 4 })
    ]
  },

  /* ============ 오라클 — 특수 ============ */
  oracle: {
    id: 'oracle', name: '오라클', symbol: '◉', color: '#e91e63',
    role: '특수',
    hp: 9, maxMp: 18,
    moveDirs: MOVE_DIRS.all,
    skills: [
      makeSkill({ id: 'spark',   name: '불꽃',     desc: '전방위 1칸, 데미지 1',         damage: 1, cd: 0, pattern: PATTERNS.star,     range: 1 }),
      makeSkill({ id: 'beam',    name: '광선',     desc: '직선·대각선 3칸, 데미지 2',   damage: 2, cd: 1, pattern: PATTERNS.lineDiagonal, range: 3 }),
      makeSkill({ id: 'nova',    name: '신성 폭발', desc: '전방위 2칸, 데미지 2',        damage: 2, cd: 2, pattern: PATTERNS.star,     range: 2 }),
      makeSkill({ id: 'apocalypse', name: '계시',  desc: '전방위 3칸, 데미지 2 · 2턴 기절 (궁극기)', damage: 2, cd: 4, mpCost: 7, stunTurns: 2, pattern: PATTERNS.star, range: 3 })
    ]
  }
};

// 모든 캐릭터는 MP를 소모하지 않는 기본 공격을 항상 사용할 수 있다.
Object.values(CHARACTERS).forEach(char => {
  const basicDamage = char.basicDamage ?? 2;
  char.skills.unshift(makeSkill({
    id: 'basic', name: '기본 공격', desc: `인접 4칸, 데미지 ${basicDamage} · MP 소모 없음`,
    damage: basicDamage, cd: 0, mpCost: 0, pattern: PATTERNS.adjacent4, range: 1
  }));
});


const CHARACTER_LIST = Object.values(CHARACTERS);

const DEFAULT_P1_CHAR = 'blade';
const DEFAULT_P2_CHAR = 'seer';

/* 캐릭터별 이동 타일 */
function charMoveTiles(char, from) {
  return tilesByMove(from, char.moveDirs);
}
