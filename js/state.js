let state;

function initState(mode, p1CharId, p2CharId) {
  state = {
    mode,
    turn: 1,
    current: 'p1',
    phase: 'select',
    botThinking: false,
    animating: false,
    hoverSkillId: null,
    players: {
      p1: makePlayerState(p1CharId, { r: 4, c: 0 }),
      p2: makePlayerState(p2CharId, { r: 0, c: 4 })
    },
    over: false,
    resultText: ''
  };
}

function makePlayerState(charId, pos) {
  const char = CHARACTERS[charId];
  return {
    charId,
    pos,
    hp: char.hp,
    maxHp: char.hp,
    mp: char.maxMp,
    maxMp: char.maxMp,
    defended: false,
    lastDefended: false,
    stunTurns: 0,
    bleedTurns: 0,
    bleedDamage: 0,
    motion: 'idle',
    motionStarted: Date.now(),
    // 시작 위치에서 P1은 오른쪽, P2/봇은 왼쪽을 바라본다.
    facing: pos.c === 0 ? 'Right' : 'Left',
    // 스킬별 쿨다운: { skillId: 남은턴 }
    cooldowns: Object.fromEntries(char.skills.map(s => [s.id, 0]))
  };
}

function getChar(pid) {
  return CHARACTERS[state.players[pid].charId];
}
