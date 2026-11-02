function endTurn() {
  // 방어 플래그 해제
  state.players[state.current].defended = false;

  // 쿨다운 감소 (현재 턴 플레이어 기준)
  const me = state.players[state.current];
  me.mp = Math.min(me.maxMp, me.mp + 1);
  Object.keys(me.cooldowns).forEach(k => {
    if (me.cooldowns[k] > 0) me.cooldowns[k]--;
  });

  state.current = otherPlayer(state.current);
  state.phase = 'select';
  state.selectedSkillId = null;
  state.hoverSkillId = null;
  state.turn++;

  if (state.turn > CONFIG.MAX_TURN) { finishByHP(); return; }
  render();

  if (state.mode === 'single' && state.current === 'p2' && !state.over) {
    scheduleBotTurn();
  }
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
  attacker.mp -= skill.mpCost;

  let rawDamage = skill.damage;
  if (defender.defended) {
    const reduction = defChar.defendReduction ?? CONFIG.DEFEND_REDUCTION;
    rawDamage = Math.max(1, Math.round(rawDamage * reduction));
  }

  const armorReduction = Math.min(defChar.armor ?? 0, Math.max(0, rawDamage - 1));
  const dmg = Math.max(1, rawDamage - armorReduction);
  defender.hp -= dmg;
  faceToward(attacker, defender.pos);
  faceToward(defender, attacker.pos);
  setMotion(attacker, 'attack');
  setMotion(defender, defender.hp <= 0 ? 'death' : 'hurt');
  state.animating = true;

  // 쿨다운 설정
  state.players[attackerId].cooldowns[skillId] = skill.cd;

  log(`⚔️ ${playerFullLabel(attackerId)} 「${skill.name}」! ${playerFullLabel(defenderId)} HP -${dmg}${defender.defended ? ' (방어)' : ''}${armorReduction ? ` (방어력 -${armorReduction})` : ''}`);

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
