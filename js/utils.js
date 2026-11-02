function otherPlayer(pid) { return pid === 'p1' ? 'p2' : 'p1'; }

// 상대가 현재 플레이어의 어느 쪽 열에 있는지에 맞춰 좌우 방향을 정한다.
function faceToward(player, targetPos) {
  if (targetPos.c < player.pos.c) player.facing = 'Left';
  else if (targetPos.c > player.pos.c) player.facing = 'Right';
}

function isOccupied(r, c) {
  const { p1, p2 } = state.players;
  return (p1.pos.r === r && p1.pos.c === c) ||
         (p2.pos.r === r && p2.pos.c === c);
}

/* 캐릭터의 이동 타일 */
function getMoveTiles(pos, pid) {
  const char = getChar(pid);
  return charMoveTiles(char, pos);
}

/* 캐릭터의 사용 가능한 스킬 목록 */
function getAvailableSkills(pid) {
  const player = state.players[pid];
  const char = getChar(pid);
  return char.skills.filter(s => player.cooldowns[s.id] === 0 && player.mp >= s.mpCost);
}

/* 선택한 스킬의 공격 타일 */
function getSkillTiles(pid, skillId) {
  const player = state.players[pid];
  const char = getChar(pid);
  const skill = char.skills.find(s => s.id === skillId);
  if (!skill) return [];
  return skill.attackTiles(player.pos);
}

/* 스킬 사용 가능 여부 */
function canUseSkill(pid, skillId) {
  const player = state.players[pid];
  const skill = getChar(pid).skills.find(s => s.id === skillId);
  return Boolean(skill && player.cooldowns[skillId] === 0 && player.mp >= skill.mpCost);
}

function playerLabel(pid) {
  if (state.mode === 'single' && pid === 'p2') return '봇';
  return pid === 'p1' ? '플레이어 1' : '플레이어 2';
}

function playerFullLabel(pid) {
  return `${playerLabel(pid)} (${getChar(pid).name})`;
}
