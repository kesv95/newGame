/* ============================================================
   진입점: 초기화, 게임 시작/재시작, 캐릭터 선택
============================================================ */

let selectedP1Char = DEFAULT_P1_CHAR;   // 'blade'
let selectedP2Char = DEFAULT_P2_CHAR;   // 'seer'
let lastBotCharId = null;

/**
 * 1인 모드: 봇 캐릭터를 유저가 고르지 않은 것 중 랜덤 선택.
 * 직전 판의 봇 캐릭터는 제외하여 연속 중복을 완화.
 */
function pickBotCharacter(excludeId) {
  let pool = CHARACTER_LIST.filter(
    ch => ch.id !== excludeId && ch.id !== lastBotCharId
  );
  // 후보가 없으면 직전 캐릭터 제외 조건만 해제
  if (pool.length === 0) {
    pool = CHARACTER_LIST.filter(ch => ch.id !== excludeId);
  }
  const picked = pool[Math.floor(Math.random() * pool.length)].id;
  lastBotCharId = picked;
  return picked;
}

function startGame(mode) {
  let p2CharId;

  if (mode === 'single') {
    p2CharId = pickBotCharacter(selectedP1Char);
  } else {
    p2CharId = selectedP2Char;
    if (p2CharId === selectedP1Char) {
      log('⚠️ 두 플레이어가 같은 캐릭터를 선택했습니다');
    }
  }

  initState(mode, selectedP1Char, p2CharId);
  logEl.innerHTML = '';
  startScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');

  const modeTxt = mode === 'single' ? '1인 · 봇 대전' : '2인 · 핫시트';
  const p2Label = mode === 'single' ? '봇' : 'P2';
  log(`새 게임 시작 (${modeTxt})`);
  log(`P1: ${CHARACTERS[selectedP1Char].name} / ${p2Label}: ${CHARACTERS[p2CharId].name}`);

  render();
}

function returnToStart() {
  startScreen.classList.remove('hidden');
  gameScreen.classList.add('hidden');
}

function populateCharSelects() {
  const p1Sel = document.getElementById('p1Char');
  const p2Sel = document.getElementById('p2Char');

  p1Sel.innerHTML = '';
  p2Sel.innerHTML = '';

  CHARACTER_LIST.forEach(ch => {
    const label = `${ch.name} [${ch.role}]`;
    p1Sel.innerHTML += `<option value="${ch.id}">${label}</option>`;
    p2Sel.innerHTML += `<option value="${ch.id}">${label}</option>`;
  });

  p1Sel.value = selectedP1Char;
  p2Sel.value = selectedP2Char;

  p1Sel.addEventListener('change', e => selectedP1Char = e.target.value);
  p2Sel.addEventListener('change', e => selectedP2Char = e.target.value);
}

/**
 * 시작 화면 모드 버튼 이벤트 및 P2 선택 영역 토글.
 * 1인 모드에서는 봇이 랜덤 캐릭터를 쓰므로 P2 선택이 의미 없음을 시각적으로 안내.
 */
function bindGlobalEvents() {
  const btnSingle = document.getElementById('btnSingle');
  const btnDouble = document.getElementById('btnDouble');
  const p2CharBox = document.getElementById('p2CharBox');

  btnSingle.addEventListener('click', () => startGame('single'));
  btnDouble.addEventListener('click', () => startGame('double'));

  // 1인 버튼에 마우스 올리면 P2 선택 영역을 흐리게 (봇 랜덤 선택 암시)
  btnSingle.addEventListener('mouseenter', () => {
    p2CharBox.style.opacity = '0.3';
    p2CharBox.style.pointerEvents = 'none';
  });
  btnSingle.addEventListener('mouseleave', () => {
    p2CharBox.style.opacity = '1';
    p2CharBox.style.pointerEvents = '';
  });

  document.getElementById('restart').addEventListener('click', returnToStart);
}

/* ============================================================
   초기화
============================================================ */
buildBoard();
bindInputEvents();
bindGlobalEvents();
populateCharSelects();
