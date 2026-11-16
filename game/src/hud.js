// The DOM HUD: crosshair, hit marker, health, ammo, timer, score, money, alive
// counts, killfeed, bomb status, buy menu and a live 2D minimap. It never touches
// the simulation; main.js pushes numbers in and reads the play callback out.
const COPY = {
  start: {
    title: 'Dustline',
    copy: 'A desert solar farm. Plant the charge at A or B, or wipe out Heat. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'Dustline',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  roundEnd: {
    title: 'Round over',
    copy: '',
    action: 'Next round',
  },
  matchEnd: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const ammo = $('ammo');
  const weaponName = $('weapon-name');
  const healthFill = $('health-fill');
  const healthNum = $('health-num');
  const timerEl = $('timer');
  const scoreEl = $('score-value');
  const moneyEl = $('money-value');
  const aliveEl = $('alive-value');
  const bombEl = $('bomb-status');
  const killfeedEl = $('killfeed');
  const buyEl = $('buy-menu');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const damageEl = $('damage');
  const flashEl = $('flash');
  const mapCanvas = $('minimap');
  const mapCtx = mapCanvas.getContext('2d');
  let hitTimer = 0;
  let lastMag = -1;
  let lastReserve = -1;
  let lastHp = -1;
  let lastTimer = '';
  let lastScore = '';
  let lastMoney = -1;
  let lastAlive = '';

  function fmtTime(sec) {
    const s = Math.max(0, Math.ceil(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  return {
    setAmmo(mag, reserve, name) {
      if (mag !== lastMag || reserve !== lastReserve) {
        lastMag = mag;
        lastReserve = reserve;
        ammoMag.textContent = String(mag);
        ammoReserve.textContent = `/ ${reserve}`;
        ammo.classList.toggle('empty', mag === 0);
      }
      if (name && weaponName.textContent !== name) weaponName.textContent = name;
    },
    setHealth(hp) {
      const v = Math.max(0, Math.round(hp));
      if (v === lastHp) return;
      lastHp = v;
      healthFill.style.width = `${v}%`;
      healthNum.textContent = String(v);
      healthFill.style.background = v > 50 ? '#ffd27a' : (v > 25 ? '#ff7a1a' : '#d63a2a');
    },
    setTimer(sec, phase) {
      const text = `${phase === 'buy' ? 'BUY ' : ''}${fmtTime(sec)}`;
      if (text === lastTimer) return;
      lastTimer = text;
      timerEl.textContent = text;
    },
    setScore(dust, heat, round) {
      const text = `${dust} — ${heat}  ·  R${round}`;
      if (text === lastScore) return;
      lastScore = text;
      scoreEl.textContent = text;
    },
    setMoney(money) {
      if (money === lastMoney) return;
      lastMoney = money;
      moneyEl.textContent = `$${money}`;
    },
    setAlive(dust, heat) {
      const text = `${dust} v ${heat}`;
      if (text === lastAlive) return;
      lastAlive = text;
      aliveEl.textContent = text;
    },
    setBomb(text) {
      if (bombEl.textContent !== text) bombEl.textContent = text;
    },
    setBuy(html, show) {
      buyEl.innerHTML = html;
      buyEl.hidden = !show;
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.25)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    setSpread(px) {
      const gap = Math.max(4, Math.min(26, px));
      crosshair.style.setProperty('--gap', `${gap}px`);
    },
    damageFlash() {
      damageEl.classList.add('on');
      setTimeout(() => damageEl.classList.remove('on'), 180);
    },
    flashBang(strength) {
      flashEl.style.opacity = String(Math.min(1, strength));
      setTimeout(() => { flashEl.style.opacity = '0'; }, 700);
    },
    killfeed(text) {
      const line = document.createElement('div');
      line.textContent = text;
      killfeedEl.prepend(line);
      while (killfeedEl.children.length > 5) killfeedEl.removeChild(killfeedEl.lastChild);
      setTimeout(() => { if (line.parentNode) line.parentNode.removeChild(line); }, 6000);
    },
    drawMinimap(sites, player, bots, plantedSite) {
      const W = mapCanvas.width;
      const H = mapCanvas.height;
      const sx = (x) => ((x + 28) / 56) * W;
      const sz = (z) => ((z + 20) / 40) * H;
      mapCtx.clearRect(0, 0, W, H);
      mapCtx.fillStyle = 'rgba(20, 14, 8, 0.55)';
      mapCtx.fillRect(0, 0, W, H);
      mapCtx.fillStyle = '#d9a05b';
      mapCtx.fillRect(0, 0, W, H);
      // Panel blocks.
      mapCtx.fillStyle = '#1e3a5f';
      for (const [x, z, w, d] of [[-20, -6, 14, 12], [-3, -4, 16, 16], [18, 0, 12, 12]]) {
        mapCtx.fillRect(sx(x - w / 2), sz(z - d / 2), (w / 56) * W, (d / 40) * H);
      }
      // Sites.
      for (const key of ['A', 'B']) {
        const s = sites[key];
        mapCtx.fillStyle = plantedSite === key ? '#ff2a1a' : '#ff7a1a';
        mapCtx.beginPath();
        mapCtx.arc(sx(s.x), sz(s.z), 6, 0, Math.PI * 2);
        mapCtx.fill();
        mapCtx.fillStyle = '#2b1d12';
        mapCtx.font = 'bold 9px sans-serif';
        mapCtx.textAlign = 'center';
        mapCtx.textBaseline = 'middle';
        mapCtx.fillText(key, sx(s.x), sz(s.z));
      }
      // Bots.
      for (const bot of bots) {
        if (!bot.alive) continue;
        mapCtx.fillStyle = bot.team === 'dust' ? '#ffd27a' : '#d63a2a';
        mapCtx.beginPath();
        mapCtx.arc(sx(bot.pos.x), sz(bot.pos.z), 3.5, 0, Math.PI * 2);
        mapCtx.fill();
      }
      // Player with facing wedge.
      if (player.alive) {
        const px = sx(player.position.x);
        const pz = sz(player.position.z);
        mapCtx.fillStyle = '#ffffff';
        mapCtx.beginPath();
        mapCtx.moveTo(px + Math.sin(player.yaw) * -8, pz + Math.cos(player.yaw) * -8);
        mapCtx.lineTo(px + Math.cos(player.yaw) * 5, pz - Math.sin(player.yaw) * 5);
        mapCtx.lineTo(px - Math.cos(player.yaw) * 5, pz + Math.sin(player.yaw) * 5);
        mapCtx.closePath();
        mapCtx.fill();
      }
    },
    showOverlay(mode, detail = '') {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = detail || text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
