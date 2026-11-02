const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');
const startScreen = document.getElementById('startScreen');
const gameScreen = document.getElementById('gameScreen');
const resultOverlay = document.getElementById('resultOverlay');
const resultMessage = document.getElementById('resultMessage');
const resultTitle = document.getElementById('resultTitle');

const cells = [];

// background.png의 실제 5×5 타일 경계(이미지 픽셀 좌표).
const BOARD_IMAGE = { width: 1402, height: 1122 };
const BOARD_ROWS = {
  y:     [365, 446, 535, 632, 748, 885],
  left:  [314, 300, 281, 266, 251, 236],
  right: [1093, 1108, 1127, 1142, 1157, 1171]
};

function tileGeometry(r, c) {
  const topLeft = BOARD_ROWS.left[r] + (BOARD_ROWS.right[r] - BOARD_ROWS.left[r]) * c / CONFIG.SIZE;
  const topRight = BOARD_ROWS.left[r] + (BOARD_ROWS.right[r] - BOARD_ROWS.left[r]) * (c + 1) / CONFIG.SIZE;
  const bottomLeft = BOARD_ROWS.left[r + 1] + (BOARD_ROWS.right[r + 1] - BOARD_ROWS.left[r + 1]) * c / CONFIG.SIZE;
  const bottomRight = BOARD_ROWS.left[r + 1] + (BOARD_ROWS.right[r + 1] - BOARD_ROWS.left[r + 1]) * (c + 1) / CONFIG.SIZE;
  const minX = Math.min(topLeft, bottomLeft);
  const maxX = Math.max(topRight, bottomRight);
  const minY = BOARD_ROWS.y[r];
  const maxY = BOARD_ROWS.y[r + 1];
  const local = (x, y) => `${((x - minX) / (maxX - minX) * 100).toFixed(2)}% ${((y - minY) / (maxY - minY) * 100).toFixed(2)}%`;
  return {
    left: minX / BOARD_IMAGE.width * 100,
    top: minY / BOARD_IMAGE.height * 100,
    width: (maxX - minX) / BOARD_IMAGE.width * 100,
    height: (maxY - minY) / BOARD_IMAGE.height * 100,
    points: [local(topLeft, minY), local(topRight, minY), local(bottomRight, maxY), local(bottomLeft, maxY)].join(', '),
    centerX: (topLeft + topRight + bottomLeft + bottomRight) / 4 / BOARD_IMAGE.width * 100,
    centerY: (minY + maxY) / 2 / BOARD_IMAGE.height * 100
  };
}

const SPRITE_FRAME_COUNTS = { idle: 4, walk: 5, attack: 5, hurt: 5, death: 5 };

function spriteFrameUrl(charId, player) {
  const motion = player.hp <= 0 ? 'death' : (player.motion || 'idle');
  const frameCount = SPRITE_FRAME_COUNTS[motion] || SPRITE_FRAME_COUNTS.idle;
  const elapsed = Date.now() - (player.motionStarted || 0);
  const frame = motion === 'idle'
    ? Math.floor(Date.now() / 320) % frameCount + 1
    : Math.floor(elapsed / 105) % frameCount + 1;
  // 같은 캐릭터의 모션 프레임을 유지하고 방향은 렌더 단계에서 좌우 반전한다.
  const row = '01';
  return `assets/characters/${charId}/${motion}/row_${row}_frame_${String(frame).padStart(2, '0')}.png`;
}

function applySprite(el, charId, player) {
  el.classList.add('sprite-unit');
  el.style.backgroundImage = `url("${spriteFrameUrl(charId, player)}")`;
  el.style.backgroundSize = 'contain';
  el.style.backgroundPosition = 'center';
  el.style.setProperty('--sprite-flip', player.facing === 'Left' ? '-1' : '1');
}

function setMotion(player, motion) {
  player.motion = motion;
  player.motionStarted = Date.now();
}

function buildBoard() {
  boardEl.innerHTML = '';
  cells.length = 0;
  for (let r = 0; r < CONFIG.SIZE; r++) {
    cells[r] = [];
    for (let c = 0; c < CONFIG.SIZE; c++) {
      const div = document.createElement('div');
      div.className = 'cell';
      div.dataset.r = r;
      div.dataset.c = c;
      const geometry = tileGeometry(r, c);
      div.style.left = `${geometry.left}%`;
      div.style.top = `${geometry.top}%`;
      div.style.width = `${geometry.width}%`;
      div.style.height = `${geometry.height}%`;
      div.style.setProperty('--tile-points', geometry.points);
      div.addEventListener('click', () => onCellClick(r, c));
      boardEl.appendChild(div);
      cells[r][c] = div;
    }
  }
}

function render() {
  boardEl.querySelectorAll('.unit').forEach(unit => unit.remove());
  // 셀 초기화
  for (let r = 0; r < CONFIG.SIZE; r++)
    for (let c = 0; c < CONFIG.SIZE; c++) {
      cells[r][c].className = 'cell';
    }

  const me = state.players[state.current];
  const oppId = otherPlayer(state.current);
  const opp = state.players[oppId];
  const isBotTurn = state.mode === 'single' && state.current === 'p2';

  // 상대 위협 범위 (모든 스킬 범위 합집합, 쿨다운 무시 — 위협은 항상 표시)
  if (!state.over) {
    const threatSet = new Set();
    getChar(oppId).skills.forEach(skill => {
      skill.attackTiles(opp.pos).forEach(({ r, c }) => threatSet.add(`${r},${c}`));
    });
    threatSet.forEach(key => {
      const [r, c] = key.split(',').map(Number);
      if (!(r === me.pos.r && c === me.pos.c))
        cells[r][c].classList.add('threat');
    });
  }

  // 하이라이트
  if (!state.over && !isBotTurn) {
    if (state.phase === 'move') {
      getMoveTiles(me.pos, state.current).forEach(({ r, c }) => {
        if (!isOccupied(r, c)) cells[r][c].classList.add('move-ok');
      });
    }
    const previewSkillId = state.hoverSkillId || state.selectedSkillId;
    if (state.phase === 'attack' && previewSkillId) {
      const previewClass = state.hoverSkillId ? 'attack-hover' : 'attack-ok';
      getSkillTiles(state.current, previewSkillId).forEach(({ r, c }) => {
        cells[r][c].classList.add(previewClass);
      });
    }
  }

  // 유닛 배치
  ['p1', 'p2'].forEach(pid => {
    const p = state.players[pid];
    const char = getChar(pid);
    const unit = document.createElement('div');
    unit.className = 'unit ' + pid;
    unit.dataset.player = pid;
    unit.setAttribute('aria-label', char.name);
    applySprite(unit, p.charId, p);
    const geometry = tileGeometry(p.pos.r, p.pos.c);
    unit.style.left = `${geometry.centerX}%`;
    unit.style.top = `${geometry.centerY}%`;
    unit.style.zIndex = String(10 + p.pos.r);
    boardEl.appendChild(unit);
  });

  updateHP('p1');
  updateHP('p2');
  updateButtons(isBotTurn);
  resultOverlay.classList.toggle('hidden', !state.over);
  if (state.over) {
    const { p1, p2 } = state.players;
    const isDraw = p1.hp === p2.hp;
    resultTitle.textContent = isDraw ? '무승부!' :
      (p1.hp > p2.hp ? 'P1 승리!' : (state.mode === 'single' ? '봇 승리!' : 'P2 승리!'));
    resultMessage.textContent = state.resultText;
  }
  renderSkillPanel(isBotTurn);
  updateStatus(isBotTurn);
}

function updateHP(pid) {
  const p = state.players[pid];
  const el = document.getElementById(pid === 'p1' ? 'hp1' : 'hp2');
  el.querySelector('.hp-fill').style.width = Math.max(0, (p.hp / p.maxHp) * 100) + '%';
  el.querySelector('.hp-num').textContent = `${Math.max(0, p.hp)} / ${p.maxHp}`;
  el.querySelector('.mp-fill').style.width = Math.max(0, (p.mp / p.maxMp) * 100) + '%';
  el.querySelector('.mp-num').textContent = `${p.mp} / ${p.maxMp}`;
  el.querySelector('.name').textContent = playerLabel(pid) + (pid === 'p1' ? '(P1)' : '(P2)');
}

function updateButtons(isBotTurn) {
  document.querySelectorAll('.action-panel').forEach(panel => {
    const pid = panel.dataset.player;
    panel.querySelector('.action-owner').textContent =
      state.mode === 'single' && pid === 'p2' ? '봇 행동' : `${pid.toUpperCase()} 행동`;
    const isCurrent = state.current === pid;
    const canControl = !state.over && !state.botThinking && !state.animating &&
      (state.mode === 'double' ? isCurrent : pid === 'p1' && isCurrent && !isBotTurn);
    panel.classList.toggle('turn-active', isCurrent && !state.over);
    panel.classList.toggle('turn-inactive', !canControl);
    panel.querySelectorAll('.action-button').forEach(button => {
      button.disabled = !canControl;
      button.classList.toggle('active', isCurrent &&
        ((button.dataset.action === 'move' && state.phase === 'move') ||
         (button.dataset.action === 'attack' && state.phase === 'attack')));
    });
  });
}

/* 스킬 선택 패널 */
function renderSkillPanel(isBotTurn) {
  let panel = document.getElementById('skillPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'skillPanel';
    document.getElementById('panel').after(panel);
  }

  if (!panel.dataset.rangePreviewBound) {
    panel.dataset.rangePreviewBound = 'true';
    panel.addEventListener('mouseover', event => {
      const button = event.target.closest('.skill-btn');
      if (!button || state.hoverSkillId === button.dataset.skill) return;
      state.hoverSkillId = button.dataset.skill;
      refreshAttackRangePreview();
    });
    panel.addEventListener('mouseout', event => {
      if (!event.target.closest('.skill-btn')) return;
      if (event.relatedTarget?.closest?.('.skill-btn')) return;
      state.hoverSkillId = null;
      refreshAttackRangePreview();
    });
    panel.addEventListener('mouseleave', () => {
      if (!state.hoverSkillId) return;
      state.hoverSkillId = null;
      refreshAttackRangePreview();
    });
  }

  // 공격 단계가 아니거나 봇 턴이면 숨김
  if (state.over || isBotTurn || state.phase !== 'attack') {
    panel.style.display = 'none';
    return;
  }

  const char = getChar(state.current);
  const player = state.players[state.current];
  panel.style.display = 'flex';
  panel.innerHTML = char.skills.map(skill => {
    const cdLeft = player.cooldowns[skill.id];
    const disabled = cdLeft > 0 || player.mp < skill.mpCost;
    const active = state.selectedSkillId === skill.id;
    return `
      <button class="skill-btn ${active ? 'active' : ''}" data-skill="${skill.id}"
        ${disabled ? 'disabled' : ''}>
        <span class="skill-name">${skill.name}</span>
        <span class="skill-meta">데미지 ${skill.damage} · MP ${skill.mpCost} · CD ${skill.cd}</span>
        <span class="skill-desc">${skill.desc}</span>
        ${cdLeft > 0 ? `<span class="skill-cd">쿨다운 ${cdLeft}턴</span>` : ''}
        ${player.mp < skill.mpCost ? `<span class="skill-cd">MP 부족</span>` : ''}
      </button>
    `;
  }).join('');

  // 스킬 버튼 클릭 이벤트
  panel.querySelectorAll('.skill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      state.selectedSkillId = btn.dataset.skill;
      state.hoverSkillId = null;
      render();
    });
  });
}

function refreshAttackRangePreview() {
  cells.flat().forEach(cell => cell.classList.remove('attack-ok', 'attack-hover'));
  if (!state || state.over || state.phase !== 'attack') return;
  const skillId = state.hoverSkillId || state.selectedSkillId;
  if (!skillId) return;
  const previewClass = state.hoverSkillId ? 'attack-hover' : 'attack-ok';
  getSkillTiles(state.current, skillId).forEach(({ r, c }) => {
    cells[r][c].classList.add(previewClass);
  });
}

function updateStatus(isBotTurn) {
  if (state.over) { statusEl.textContent = state.resultText; return; }
  if (state.botThinking) { statusEl.textContent = '봇이 생각 중...'; return; }
  const name = playerFullLabel(state.current);
  let phaseTxt;
  if (state.phase === 'select') phaseTxt = '행동 선택';
  else if (state.phase === 'move') phaseTxt = '이동할 칸 클릭';
  else if (state.phase === 'attack') {
    if (!state.selectedSkillId) phaseTxt = '스킬 선택';
    else {
      const skill = getChar(state.current).skills.find(s => s.id === state.selectedSkillId);
      phaseTxt = `${skill.name} — 대상 칸 클릭`;
    }
  }
  else phaseTxt = '방어 확정';
  statusEl.textContent = `${name}의 턴 (${state.turn}/${CONFIG.MAX_TURN}) — ${phaseTxt}`;
}

function log(msg) {
  const div = document.createElement('div');
  div.textContent = msg;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
}

// 프레임만 바꾸고 보드 DOM은 다시 만들지 않아 입력 상태를 유지한다.
setInterval(() => {
  if (!state || !state.players) return;
  ['p1', 'p2'].forEach(pid => {
    const player = state.players[pid];
    const unit = boardEl.querySelector(`.unit[data-player="${pid}"]`);
    if (unit) unit.style.backgroundImage = `url("${spriteFrameUrl(player.charId, player)}")`;
  });
}, 105);
