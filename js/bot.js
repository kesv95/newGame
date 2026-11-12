function scheduleBotTurn() {
  state.botThinking = true;
  render();
  setTimeout(() => {
    state.botThinking = false;
    if (state.over) { render(); return; }
    botAct();
  }, CONFIG.BOT_DELAY);
}

function botAct() {
  const botId = 'p2';
  const oppId = 'p1';
  const me = state.players[botId];
  const opp = state.players[oppId];
  const char = getChar(botId);
  const oppChar = getChar(oppId);

  // 1) 사용 가능한 스킬 중 상대를 맞출 수 있는 것 찾기 (첫 턴 제외)
  if (state.turn !== 1) {
    const usableSkills = char.skills.filter(s => me.cooldowns[s.id] === 0 && me.mp >= s.mpCost);
    const hittable = usableSkills.filter(s => {
      if (s.target === 'self') {
        if (!s.canAttack(me.pos, me.pos)) return false;
        if (s.heal && me.hp >= me.maxHp) return false;
        if (s.attackBuff && me.attackBuffHits > 0) return false;
        return true;
      }
      if (!s.canAttack(me.pos, opp.pos)) return false;
      if (s.weakenHits && opp.weakenedHits > 0) return false;
      return true;
    });

    if (hittable.length > 0) {
      // 효과가 있는 기술을 우선 고려하고, 동률이면 쿨다운이 긴 기술을 사용한다.
      const skillValue = skill => skill.damage +
        (skill.heal ? Math.min(skill.heal, me.maxHp - me.hp) + 2 : 0) +
        (skill.attackBuff ? skill.attackBuff * skill.attackBuffHits + 2 : 0) +
        (skill.weakenHits ? skill.weakenAmount * skill.weakenHits + 2 : 0) +
        (skill.stunTurns ? 3 : 0) + (skill.ignoreDefense ? 2 : 0);
      hittable.sort((a, b) => {
        if (skillValue(b) !== skillValue(a)) return skillValue(b) - skillValue(a);
        return b.cd - a.cd;
      });
      const chosen = hittable[0];
      log(`🤖 봇: 「${chosen.name}」 사용`);
      const targetId = chosen.target === 'self' ? botId : oppId;
      applyAttack(botId, targetId, state.players[targetId], chosen.id);
      return;
    }
  }

  // 2) 상대 위협 범위 안 + 방어 가능 → 방어
  //    상대의 어떤 스킬이든 맞을 수 있는 위치인지 확인
  const inDanger = oppChar.skills.some(s => s.canAttack(opp.pos, me.pos));
  if (inDanger && !me.lastDefended) {
    log('🤖 봇: 방어');
    me.defended = true;
    me.lastDefended = true;
    endTurn();
    return;
  }

  // 3) 안전한 칸으로 이동 (다음 턴 공격 가능 칸 우선)
  const moves = getMoveTiles(me.pos, botId).filter(t => !isOccupied(t.r, t.c));

  const scoreMove = (t) => {
    let s = 0;

    // 안전도: 상대 스킬 범위 밖이면 큰 가산
    const safe = !oppChar.skills.some(s => s.canAttack(opp.pos, t));
    if (safe) s += 10;

    // 다음 턴 공격 가능성: 내 스킬 중 하나라도 닿으면 가산
    if (char.skills.some(s => s.canAttack(t, opp.pos))) s += 6;

    // 거리: 가까울수록 약간 가산 (근접 캐릭터일수록 유리)
    const d = Math.abs(t.r - opp.pos.r) + Math.abs(t.c - opp.pos.c);
    s += Math.max(0, 4 - d);

    return s;
  };

  if (moves.length > 0) {
    const best = moves.slice().sort((a, b) => scoreMove(b) - scoreMove(a))[0];
    me.pos = { r: best.r, c: best.c };
    me.lastDefended = false;
    faceToward(me, opp.pos);
    setMotion(me, 'walk');
    state.animating = true;
    log(`🤖 봇: 이동 → (${best.r},${best.c})`);
    render();
    setTimeout(() => {
      setMotion(me, 'idle');
      state.animating = false;
      endTurn();
    }, 525);
    return;
  }

  // 4) 이동 불가 → 방어 or 대기
  if (!me.lastDefended) {
    log('🤖 봇: 방어 (이동 불가)');
    me.defended = true;
    me.lastDefended = true;
  } else {
    log('🤖 봇: 대기');
    me.lastDefended = false;
  }
  endTurn();
}
 
