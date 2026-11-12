function endTurn() {
  // 쿨다운 감소 (현재 턴 플레이어 기준)
  const me = state.players[state.current];
  me.mp = Math.min(me.maxMp, me.mp + 1);
  Object.keys(me.cooldowns).forEach(k => {
    if (me.cooldowns[k] > 0) me.cooldowns[k]--;
  });

  state.current = otherPlayer(state.current);
  // 새 턴이 시작되면 직전 방어 효과를 만료시킨다.
  state.players[state.current].defended = false;
  state.phase = 'select';
  state.selectedSkillId = null;
  state.hoverSkillId = null;
  state.turn++;

  if (state.turn > CONFIG.MAX_TURN) { finishByHP(); return; }

  const nextPlayer = state.players[state.current];
  if (nextPlayer.bleedTurns > 0) {
    const bleedDamage = nextPlayer.bleedDamage;
    nextPlayer.hp = Math.max(0, nextPlayer.hp - bleedDamage);
    nextPlayer.bleedTurns--;
    log(`🩸 ${playerFullLabel(state.current)} 출혈 피해 HP -${bleedDamage} (남은 ${nextPlayer.bleedTurns}턴)`);
    setMotion(nextPlayer, nextPlayer.hp <= 0 ? 'death' : 'hurt');
    if (nextPlayer.hp <= 0) {
      finish(checkWin());
      return;
    }
  }

  if (nextPlayer.stunTurns > 0) {
    nextPlayer.stunTurns--;
    log(`💫 ${playerFullLabel(state.current)} 기절로 턴을 건너뜁니다`);
    state.current = otherPlayer(state.current);
    const resumedPlayer = state.players[state.current];
    resumedPlayer.defended = false;
    state.turn++;
    if (state.turn > CONFIG.MAX_TURN) { finishByHP(); return; }
  }

  render();

  if (state.mode === 'single' && state.current === 'p2' && !state.over) {
    scheduleBotTurn();
  }
}

function findBehindLandingTile(attackerId, attacker, defender) {
  const stepR = Math.sign(defender.pos.r - attacker.pos.r);
  const stepC = Math.sign(defender.pos.c - attacker.pos.c);
  const ideal = { r: defender.pos.r + stepR, c: defender.pos.c + stepC };
  const isAvailable = tile => tile.r >= 0 && tile.r < CONFIG.SIZE &&
    tile.c >= 0 && tile.c < CONFIG.SIZE &&
    !Object.entries(state.players).some(([pid, player]) =>
      pid !== attackerId && player.pos.r === tile.r && player.pos.c === tile.c);
  if (isAvailable(ideal)) return ideal;

  const attackerVector = {
    r: attacker.pos.r - defender.pos.r,
    c: attacker.pos.c - defender.pos.c
  };
  const candidates = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const tile = { r: defender.pos.r + dr, c: defender.pos.c + dc };
      if (tile.r === attacker.pos.r && tile.c === attacker.pos.c) continue;
      if (!isAvailable(tile)) continue;
      const behind = dr * attackerVector.r + dc * attackerVector.c < 0;
      candidates.push({ tile, behind, idealDistance: Math.abs(tile.r - ideal.r) + Math.abs(tile.c - ideal.c) });
    }
  }
  candidates.sort((a, b) => Number(b.behind) - Number(a.behind) || a.idealDistance - b.idealDistance);
  return candidates[0]?.tile ?? null;
}

function applyAttack(attackerId, defenderId, defender, skillId) {
  const atkChar = getChar(attackerId);
  const defChar = getChar(defenderId);
  const skill = atkChar.skills.find(s => s.id === skillId);
  if (!skill) return;
  const attacker = state.players[attackerId];
  if (attacker.mp < skill.mpCost) {
    log(`⚠️ MP가 부족합니다 (필요 ${skill.mpCost}, 보유 ${attacker.mp})`);
    render();
    return;
  }

  if (skill.heal || skill.attackBuff || skill.weakenHits) {
    attacker.mp -= skill.mpCost;
    attacker.lastDefended = false;
    state.players[attackerId].cooldowns[skillId] = skill.cd;
    let effectText = '';
    if (skill.heal) {
      const restored = Math.min(skill.heal, attacker.maxHp - attacker.hp);
      attacker.hp += restored;
      effectText = `HP ${restored} 회복`;
    }
    if (skill.attackBuff) {
      attacker.attackBuff = Math.max(attacker.attackBuff, skill.attackBuff);
      attacker.attackBuffHits = Math.max(attacker.attackBuffHits, skill.attackBuffHits);
      effectText = `다음 ${attacker.attackBuffHits}회 공격 피해 +${attacker.attackBuff}`;
    }
    if (skill.weakenHits) {
      defender.weakenedHits = Math.max(defender.weakenedHits, skill.weakenHits);
      defender.weakenAmount = Math.max(defender.weakenAmount, skill.weakenAmount);
      effectText = `다음 ${defender.weakenedHits}회 공격 피해 -${defender.weakenAmount}`;
    }
    setMotion(attacker, 'attack');
    state.animating = true;
    log(`✨ ${playerFullLabel(attackerId)} 「${skill.name}」! ${effectText}`);
    render();
    setTimeout(() => {
      setMotion(attacker, 'idle');
      state.animating = false;
      endTurn();
    }, 400);
    return;
  }

  const dashLanding = skill.dashBehind ? findBehindLandingTile(attackerId, attacker, defender) : null;
  if (skill.dashBehind && !dashLanding) {
    log('⚠️ 상대 뒤쪽에 이동할 수 있는 칸이 없습니다');
    render();
    return;
  }
  attacker.mp -= skill.mpCost;
  attacker.lastDefended = false;
  if (dashLanding) attacker.pos = dashLanding;

  const wasDefended = defender.defended;
  const defenseBlocked = wasDefended && !skill.ignoreDefense;
  const attackWasBuffed = attacker.attackBuffHits > 0;
  const attackWasWeakened = defender.weakenedHits > 0;
  let rawDamage = skill.damage;
  if (defender.weakenedHits > 0) rawDamage = Math.max(1, rawDamage - defender.weakenAmount);
  if (defenseBlocked) {
    const reduction = defChar.defendReduction ?? CONFIG.DEFEND_REDUCTION;
    rawDamage = Math.max(1, Math.round(rawDamage * reduction));
  }

  const armorReduction = skill.ignoreDefense ? 0 :
    Math.min(defChar.armor ?? 0, Math.max(0, rawDamage - 1));
  let dmg = Math.max(1, rawDamage - armorReduction);
  if (attacker.attackBuffHits > 0) dmg += attacker.attackBuff;
  const critical = skill.critChance > 0 && Math.random() < skill.critChance;
  if (critical) dmg = Math.ceil(dmg * skill.critMultiplier);
  if (attacker.attackBuffHits > 0) {
    attacker.attackBuffHits--;
    if (attacker.attackBuffHits === 0) attacker.attackBuff = 0;
  }
  if (defender.weakenedHits > 0) {
    defender.weakenedHits--;
    if (defender.weakenedHits === 0) defender.weakenAmount = 0;
  }
  defender.hp -= dmg;
  const stunApplied = skill.stunTurns > 0 && defender.hp > 0 && !defenseBlocked;
  if (stunApplied) defender.stunTurns = Math.max(defender.stunTurns, skill.stunTurns);
  const bleedApplied = skill.bleedTurns > 0 && defender.hp > 0 && !defenseBlocked;
  if (bleedApplied) {
    defender.bleedTurns = Math.max(defender.bleedTurns, skill.bleedTurns);
    defender.bleedDamage = Math.max(defender.bleedDamage, skill.bleedDamage);
  }
  faceToward(attacker, defender.pos);
  faceToward(defender, attacker.pos);
  setMotion(attacker, 'attack');
  setMotion(defender, defender.hp <= 0 ? 'death' : 'hurt');
  state.animating = true;

  // 쿨다운 설정
  state.players[attackerId].cooldowns[skillId] = skill.cd;

  log(`⚔️ ${playerFullLabel(attackerId)} 「${skill.name}」! ${playerFullLabel(defenderId)} HP -${dmg}${critical ? ' (치명타!)' : ''}${attackWasBuffed ? ' (공격 강화)' : ''}${attackWasWeakened ? ' (공격 약화)' : ''}${dashLanding ? ' (뒤로 이동)' : ''}${defenseBlocked ? ' (방어)' : ''}${wasDefended && skill.ignoreDefense ? ' (방어 무시)' : ''}${armorReduction ? ` (방어력 -${armorReduction})` : ''}${skill.stunTurns && defenseBlocked ? ' (방어로 기절 저항)' : ''}${stunApplied ? ` (기절 ${skill.stunTurns}턴)` : ''}${skill.bleedTurns && defenseBlocked ? ' (방어로 출혈 저항)' : ''}${bleedApplied ? ` (출혈 ${skill.bleedDamage}×${skill.bleedTurns}턴)` : ''}`);

  render();
  const unitEl = boardEl.querySelector(`.unit[data-player="${defenderId}"]`);
  if (unitEl) unitEl.classList.add('hit');

  const result = checkWin();
  const gameEnded = Boolean(result);
  setTimeout(() => {
    state.animating = false;
    if (gameEnded) {
      setMotion(attacker, 'idle');
      finish(result);
      return;
    }
    setMotion(attacker, 'idle');
    setMotion(defender, 'idle');
    endTurn();
  }, gameEnded ? 720 : 525);
}

function checkWin() {
  const p1 = state.players.p1.hp;
  const p2 = state.players.p2.hp;
  if (p1 <= 0 && p2 <= 0) return '무승부!';
  if (p1 <= 0) return `${playerFullLabel('p2')} 승리!`;
  if (p2 <= 0) return `${playerFullLabel('p1')} 승리!`;
  return '';
}

function finish(text) {
  state.over = true;
  state.animating = false;
  state.resultText = text;
  log('🏁 ' + text);
  render();
}

function finishByHP() {
  const p1 = state.players.p1.hp;
  const p2 = state.players.p2.hp;
  if (p1 > p2) finish(`턴 제한 — ${playerFullLabel('p1')} 승리! (${p1} : ${p2})`);
  else if (p2 > p1) finish(`턴 제한 — ${playerFullLabel('p2')} 승리! (${p1} : ${p2})`);
  else finish(`턴 제한 — 무승부! (${p1} : ${p2})`);
}
