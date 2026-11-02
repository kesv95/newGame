function onCellClick(r, c) {
  if (state.over) return;
  if (state.animating) return;
  if (state.mode === 'single' && state.current === 'p2') return;
  if (state.botThinking) return;

  const me = state.players[state.current];
  const oppId = otherPlayer(state.current);
  const opp = state.players[oppId];

  // ----- 이동 -----
  if (state.phase === 'move') {
    const valid = getMoveTiles(me.pos, state.current).some(t => t.r === r && t.c === c);
    if (!valid || isOccupied(r, c)) {
      log('⚠️ 이동할 수 없는 칸');
      return;
    }

    // 렌더링 파트에서 걷기 모션을 재생할 수 있도록 상태 설정
    me.isMoving = true;

    // 위치 이동
    me.pos = { r, c };
    faceToward(me, opp.pos);
    setMotion(me, 'walk');
    state.animating = true;
    log(`${playerFullLabel(state.current)} 이동 → (${r},${c})`);

    // 화면 갱신 (이동한 위치로 DOM 이동)
    render();

    // 걷기 프레임이 재생된 뒤 다음 턴으로 넘어간다.
    setTimeout(() => {
      me.isMoving = false;
      setMotion(me, 'idle');
      state.animating = false;
      render();
      endTurn();
    }, 525);

    return;
  }

  // ----- 공격 -----
  if (state.phase === 'attack') {
    if (!state.selectedSkillId) {
      log('⚠️ 스킬을 먼저 선택하세요');
      return;
    }
    const char = getChar(state.current);
    const skill = char.skills.find(s => s.id === state.selectedSkillId);

    if (!skill.canAttack(me.pos, { r, c })) {
      log('⚠️ 스킬 범위 밖');
      return;
    }
    if (!canUseSkill(state.current, state.selectedSkillId)) {
      log(`⚠️ MP가 부족하거나 쿨다운 중인 스킬입니다 (필요 MP ${skill.mpCost})`);
      return;
    }
    if (!(r === opp.pos.r && c === opp.pos.c)) {
      log('⚠️ 상대가 없는 칸');
      return;
    }

    faceToward(me, opp.pos);

    // 공격 실행 (actions.js 내부에서 피격 모션 등이 처리됨)
    applyAttack(state.current, oppId, opp, state.selectedSkillId);
    return;
  }

  log('행동을 먼저 선택하세요');
}

function bindInputEvents() {
  // 이동 버튼
  btnMove.addEventListener('click', () => {
    if (state.over || state.botThinking || state.animating) return;
    state.phase = 'move';
    state.selectedSkillId = null;
    state.hoverSkillId = null;
    render();
  });

  // 공격 버튼
  btnAttack.addEventListener('click', () => {
    if (state.over || state.botThinking || state.animating) return;
    if (state.turn === 1) {
      log('⚠️ 첫 턴에는 공격할 수 없습니다 (선공 보정)');
      return;
    }
    state.phase = 'attack';
    state.selectedSkillId = null;
    state.hoverSkillId = null;
    render();
  });

  // 방어 버튼
  btnDefend.addEventListener('click', () => {
    if (state.over || state.botThinking || state.animating) return;
    const me = state.players[state.current];
    if (me.lastDefended) {
      log('⚠️ 연속 방어는 불가합니다');
      return;
    }

    // [추가] 방어 상태 저장
    me.defended = true;
    me.lastDefended = true;
    me.isDefending = true; // 렌더링 파트에서 방어 모션을 그리기 위함
    state.animating = true;

    log(`🛡️ ${playerFullLabel(state.current)} 방어`);
    render();

    // [추가] 방어 모션 시간(약 400ms) 후 턴 종료
    setTimeout(() => {
      me.isDefending = false;
      state.animating = false;
      endTurn();
    }, 400);
  });
}
