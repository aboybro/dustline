// Dustline boot and the one loop: a fixed 60 Hz simulation feeding a render at
// the display's rate. ?shot=start|play|bomb|end with &seed=N stages a deterministic
// frame for a capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, WEAPONS, GRENADES } from './weapon.js';
import { createBots } from './bots.js';
import { createRounds, BUY_SECONDS } from './rounds.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color('#e8d5b0'), 34, 95);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const weapon = createWeapon(camera);
const hud = createHud();
const player = createPlayer(world.colliders);
const bots = createBots(scene, world);
const rounds = createRounds();
const effects = createEffects(scene);
const audio = createAudio();
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 100;
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const hitPoint = new THREE.Vector3();
const tmpVec = new THREE.Vector3();

const body = player.state;
const R = rounds.state;
let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let stepTimer = 0;
let playerPlanting = 0;
let playerDefusing = 0;
let flashUntil = 0;
const owned = new Set(['sunburst', 'sidewinder']);
const grenadeCount = { frag: 0, smoke: 0, flash: 0 };
const grenades = [];
let buyOpen = false;
let currentWeaponId = 'sunburst';

const WEAPON_KEYS = ['sunburst', 'devil', 'longshot', 'sandstorm', 'sidewinder'];

function aliveCount(team) {
  let n = 0;
  for (const b of bots.bots) if (b.alive && b.team === team) n += 1;
  if (team === 'dust' && player.state.alive) n += 1;
  return n;
}

function botCtx() {
  return {
    player: player.state,
    playerPos: player.state.position,
    smokes: effects.smokes,
    phase: R.phase,
    attackers: R.attackers,
    plantSite: R.plantSite,
    planted: R.planted,
    plantedSite: R.plantedSite,
    playerPlanting: playerPlanting > 0,
    onPlant,
    onDefuse,
    botShoot,
  };
}

function onPlant(bot, site) {
  if (R.planted) return;
  rounds.plant(site);
  effects.showCharge(world.sites[site]);
  audio.plantBeep();
  hud.killfeed(`${bot.name} planted the charge at site ${site}`);
}

function onDefuse(bot) {
  if (!R.planted) return;
  effects.hideCharge();
  hud.killfeed(`${bot.name} defused the charge`);
  endRound(R.attackers === 'dust' ? 'heat' : 'dust', 'defused');
}

function endRound(winner, reason) {
  if (R.phase === 'over') return;
  rounds.endRound(winner, reason);
  effects.hideCharge();
  if (winner === 'dust') audio.win();
  else audio.lose();
  if (R.matchOver) {
    const dustWon = R.dustWins > R.heatWins;
    hud.showOverlay('matchEnd', dustWon
      ? `Dustline wins the match ${R.dustWins} — ${R.heatWins}. The solar farm is yours.`
      : `Heat wins the match ${R.heatWins} — ${R.dustWins}. The solar farm is lost.`);
    if (document.pointerLockElement) document.exitPointerLock();
  } else {
    hud.showOverlay('roundEnd', winner === 'dust'
      ? `Dust takes the round (${reason}). ${R.dustWins} — ${R.heatWins}. Click for the next round.`
      : `Heat takes the round (${reason}). ${R.dustWins} — ${R.heatWins}. Click for the next round.`);
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

function startRoundSetup() {
  rounds.startRound();
  player.reset(world.spawns.dust[0], Math.PI);
  bots.reset(world.spawns, {
    dust: R.attackers === 'dust'
      ? [world.routes.west, world.routes.mid, world.routes.east]
      : [world.routes.defendA, world.routes.defendB, world.routes.mid],
    heat: R.attackers === 'dust'
      ? [world.routes.defendA, world.routes.defendB, world.routes.mid]
      : [world.routes.west, world.routes.mid, world.routes.east],
  }, R.attackers === 'dust');
  playerPlanting = 0;
  playerDefusing = 0;
  buyOpen = false;
  hud.setBuy('', false);
  hud.setBomb('');
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name);
  hud.setHealth(player.state.hp);
}

function botShoot(bot, target, err) {
  const from = tmpVec.set(bot.pos.x, 1.35, bot.pos.z);
  const to = target.kind === 'player'
    ? new THREE.Vector3(target.pos.x, 1.3, target.pos.z)
    : new THREE.Vector3(target.pos.x, 1.2, target.pos.z);
  const dist = from.distanceTo(to);
  const hitChance = Math.max(0.12, 0.62 - dist * 0.006 - err * 4);
  const hit = Math.random() < hitChance;
  if (!hit) {
    to.x += (Math.random() - 0.5) * 2.5;
    to.y += (Math.random() - 0.5) * 1.6;
    to.z += (Math.random() - 0.5) * 2.5;
  }
  effects.tracer(from, to);
  audio.shot('sunburst', dist);
  if (!hit) return;
  if (target.kind === 'player') {
    const died = player.damage(11);
    audio.hurt();
    hud.damageFlash();
    hud.setHealth(player.state.hp);
    if (died) hud.killfeed(`${bot.name} killed you`);
  } else {
    const died = bots.damage(target.bot, 14);
    if (died) hud.killfeed(`${bot.name} ▸ ${target.bot.name}`);
  }
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function shoot(spread) {
  const def = weapon.def();
  if (!weapon.takeRound()) {
    audio.dryFire();
    return false;
  }
  camera.getWorldDirection(direction);
  let hitAny = false;
  for (let p = 0; p < def.pellets; p += 1) {
    const d = direction.clone();
    d.x += (random() * 2 - 1) * spread;
    d.y += (random() * 2 - 1) * spread;
    d.z += (random() * 2 - 1) * spread;
    d.normalize();
    muzzle.copy(camera.position).addScaledVector(d, 0.6);
    raycaster.set(camera.position, d);
    raycaster.far = def.range;
    const targets = world.shootables.concat(bots.hitMeshes());
    const hit = raycaster.intersectObjects(targets, false)[0];
    const end = hit ? hit.point : camera.position.clone().addScaledVector(d, def.range);
    effects.tracer(muzzle, end);
    if (hit && hit.object.userData.bot) {
      const bot = hit.object.userData.bot;
      const dmg = def.damage * (hit.object.userData.part === 'head' ? def.headMult : 1);
      const died = bots.damage(bot, dmg);
      hitPoint.copy(hit.point);
      effects.sparkAt(hitPoint, 5);
      hud.hitMarker(died, shot ? 4000 : 120);
      audio.hit();
      if (died) {
        rounds.addKill();
        audio.kill();
        hud.killfeed(`You ▸ ${bot.name}${hit.object.userData.part === 'head' ? ' (headshot)' : ''}`);
      }
      hitAny = true;
    } else if (hit) {
      effects.sparkAt(hit.point, 4);
    }
  }
  weapon.pullTrigger();
  player.recoil(0.009 + random() * 0.004, (random() * 2 - 1) * 0.004);
  audio.shot(def.id, 0);
  bots.hearNoise(player.state.position, world.routes.mid);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, def.name);
  return hitAny;
}

function throwGrenade() {
  const order = ['frag', 'smoke', 'flash'];
  const id = order.find((k) => grenadeCount[k] > 0);
  if (!id) return;
  grenadeCount[id] -= 1;
  camera.getWorldDirection(direction);
  const vel = direction.clone().multiplyScalar(17);
  vel.y += 3.5;
  grenades.push({
    id,
    pos: camera.position.clone().addScaledVector(direction, 0.5),
    vel,
    timer: id === 'frag' ? 1.7 : 1.2,
    bounced: 0,
  });
  audio.grenade();
}

function stepGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const g = grenades[i];
    g.vel.y -= 12 * dt;
    g.pos.addScaledVector(g.vel, dt);
    if (g.pos.y < 0.15) {
      g.pos.y = 0.15;
      if (g.id === 'smoke') {
        effects.addSmoke(g.pos, GRENADES.smoke.duration);
        grenades.splice(i, 1);
        continue;
      }
      g.vel.y = Math.abs(g.vel.y) * 0.4;
      g.vel.x *= 0.7;
      g.vel.z *= 0.7;
      g.bounced += 1;
    }
    g.timer -= dt;
    if (g.timer <= 0 || g.bounced > 2) {
      if (g.id === 'frag') {
        audio.explosion();
        effects.sparkAt(g.pos, 14);
        for (const bot of bots.bots) {
          if (!bot.alive) continue;
          const d = Math.hypot(bot.pos.x - g.pos.x, bot.pos.z - g.pos.z);
          if (d < GRENADES.frag.radius) {
            const died = bots.damage(bot, GRENADES.frag.damage * (1 - d / (GRENADES.frag.radius * 1.4)));
            if (died) { rounds.addKill(); hud.killfeed(`You ▸ ${bot.name} (frag)`); }
          }
        }
        const pd = Math.hypot(player.state.position.x - g.pos.x, player.state.position.z - g.pos.z);
        if (pd < GRENADES.frag.radius && player.state.alive) {
          player.damage(GRENADES.frag.damage * 0.5 * (1 - pd / (GRENADES.frag.radius * 1.4)));
          hud.setHealth(player.state.hp);
          hud.damageFlash();
        }
      } else if (g.id === 'flash') {
        audio.flash();
        const toG = tmpVec.copy(g.pos).sub(camera.position);
        const dist = toG.length();
        camera.getWorldDirection(direction);
        if (dist < GRENADES.flash.radius && direction.dot(toG.normalize()) > 0.2) {
          hud.flashBang(1 - dist / GRENADES.flash.radius);
          flashUntil = elapsed + 1.6;
        }
        for (const bot of bots.bots) {
          if (bot.alive) bot.shootCooldown = Math.max(bot.shootCooldown, 2);
        }
      } else if (g.id === 'smoke') {
        effects.addSmoke(g.pos, GRENADES.smoke.duration);
      }
      grenades.splice(i, 1);
    }
  }
}

function tryBuy(id) {
  if (R.phase !== 'buy') return;
  if (WEAPONS[id]) {
    const def = WEAPONS[id];
    if (owned.has(id)) {
      equipWeapon(id);
      return;
    }
    if (rounds.spend(def.price)) {
      owned.add(id);
      equipWeapon(id);
      audio.buy();
    }
    return;
  }
  const g = GRENADES[id];
  if (g && rounds.spend(g.price)) {
    grenadeCount[id] += 1;
    audio.buy();
  }
}

function equipWeapon(id) {
  if (!owned.has(id)) return;
  currentWeaponId = id;
  weapon.equip(id);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name);
}

function buyMenuHtml() {
  const rows = WEAPON_KEYS.map((id, i) => {
    const def = WEAPONS[id];
    const has = owned.has(id);
    return `[${i + 1}] ${def.name} — ${has ? 'owned' : `$${def.price}`} · ${def.damage} dmg · ${def.mag} rnd`;
  });
  const gRows = [['frag', 6], ['smoke', 7], ['flash', 8]].map(([id, key]) => {
    const g = GRENADES[id];
    return `[${key}] ${g.name} — $${g.price} (have ${grenadeCount[id]})`;
  });
  return `<b>BUY PHASE</b> — $${R.money}<br>${rows.join('<br>')}<br>${gRows.join('<br>')}<br>Press B to close`;
}

function handlePressed() {
  const p = input.state.pressed;
  if (p.has('KeyR')) weapon.reload();
  if (p.has('KeyM')) audio.toggleMute();
  if (p.has('KeyB') && R.phase === 'buy') {
    buyOpen = !buyOpen;
    hud.setBuy(buyOpen ? buyMenuHtml() : '', buyOpen);
  }
  if (p.has('KeyQ') && R.phase === 'live' && player.state.alive) throwGrenade();
  if (R.phase === 'buy') {
    const map = { Digit1: 'sunburst', Digit2: 'devil', Digit3: 'longshot', Digit4: 'sandstorm', Digit5: 'sidewinder', Digit6: 'frag', Digit7: 'smoke', Digit8: 'flash' };
    for (const [code, id] of Object.entries(map)) {
      if (p.has(code)) tryBuy(id);
    }
  } else if (R.phase === 'live') {
    const map = { Digit1: 'sunburst', Digit2: 'devil', Digit3: 'longshot', Digit4: 'sandstorm', Digit5: 'sidewinder' };
    for (const [code, id] of Object.entries(map)) {
      if (p.has(code)) equipWeapon(id);
    }
  }
  input.clearPressed();
}

function step(dt) {
  elapsed += dt;
  // Round clock.
  if (R.phase === 'buy') {
    R.timeLeft -= dt;
    if (R.timeLeft <= 0) {
      rounds.beginLive();
      buyOpen = false;
      hud.setBuy('', false);
    }
  } else if (R.phase === 'live') {
    if (R.planted) {
      R.plantTimeLeft -= dt;
      if (R.plantTimeLeft <= 0) {
        audio.explosion();
        effects.sparkAt(new THREE.Vector3(world.sites[R.plantedSite].x, 1, world.sites[R.plantedSite].z), 20);
        const pd = Math.hypot(player.state.position.x - world.sites[R.plantedSite].x, player.state.position.z - world.sites[R.plantedSite].z);
        if (pd < 8 && player.state.alive) player.damage(80);
        endRound(R.attackers, 'detonation');
      }
    } else {
      R.timeLeft -= dt;
      if (R.timeLeft <= 0) {
        endRound(R.attackers === 'dust' ? 'heat' : 'dust', 'time');
      }
    }
  } else if (R.phase === 'over') {
    R.timeLeft -= dt;
    if (R.timeLeft <= 0 && !R.matchOver) {
      rounds.nextRound();
      startRoundSetup();
      hud.showOverlay('start', `Round ${R.round}. ${R.attackers === 'dust' ? 'Dust attacks' : 'Heat attacks'} — plant at site ${R.plantSite}.`);
    }
  }

  if (R.phase !== 'over') {
    player.step(dt, input.state.keys);
    // Footsteps.
    const speed = player.groundSpeed();
    if (speed > 1 && player.state.onGround) {
      stepTimer -= dt * speed;
      if (stepTimer <= 0) {
        stepTimer = 2.2;
        audio.step();
      }
    }
  }
  weapon.step(dt);
  if (R.phase === 'live') {
    bots.step(botCtx(), dt, elapsed);
    stepGrenades(dt);
    // Player plant / defuse (hold E).
    const nearSite = (site) => {
      const s = world.sites[site];
      return Math.hypot(s.x - player.state.position.x, s.z - player.state.position.z) < s.r;
    };
    if (player.state.alive && input.state.keys.has('KeyE')) {
      if (!R.planted && R.attackers === 'dust' && nearSite(R.plantSite)) {
        playerPlanting += dt;
        if (playerPlanting >= 3.5) {
          playerPlanting = 0;
          onPlant({ name: 'You' }, R.plantSite);
        }
      } else if (R.planted && R.attackers === 'heat' && nearSite(R.plantedSite)) {
        playerDefusing += dt;
        if (playerDefusing >= 5) {
          playerDefusing = 0;
          effects.hideCharge();
          hud.killfeed('You defused the charge');
          endRound('dust', 'defused');
        }
      } else {
        playerPlanting = 0;
        playerDefusing = 0;
      }
    } else {
      playerPlanting = 0;
      playerDefusing = 0;
    }
    // Elimination win check.
    if (R.phase === 'live') {
      if (aliveCount('heat') === 0) endRound('dust', 'elimination');
      else if (aliveCount('dust') === 0) endRound('heat', 'elimination');
    }
  }
  effects.step(dt, elapsed);
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function updateHud() {
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name);
  hud.setHealth(player.state.hp);
  hud.setTimer(R.timeLeft, R.phase);
  hud.setScore(R.dustWins, R.heatWins, R.round);
  hud.setMoney(R.money);
  hud.setAlive(aliveCount('dust'), aliveCount('heat'));
  const bomb = R.planted
    ? `CHARGE PLANTED — ${Math.max(0, Math.ceil(R.plantTimeLeft))}s`
    : (playerPlanting > 0 ? `PLANTING ${Math.ceil(playerPlanting / 3.5 * 100)}%`
      : (playerDefusing > 0 ? `DEFUSING ${Math.ceil(playerDefusing / 5 * 100)}%` : ''));
  hud.setBomb(bomb);
  const spreadPx = 4 + weapon.spread(player.groundSpeed(), player.state.sprinting) * 320;
  hud.setSpread(spreadPx);
  hud.drawMinimap(world.sites, player.state, bots.bots, R.planted ? R.plantedSite : null);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (elapsed < flashUntil) {
      // Flashed: look is sluggish and the view drifts.
      player.look(look.x * 0.2, look.y * 0.2);
    } else {
      player.look(look.x, look.y);
    }
    handlePressed();
    if (input.state.firing && weapon.ready() && R.phase === 'live' && player.state.alive) {
      shoot(shot ? 0 : weapon.spread(player.groundSpeed(), player.state.sprinting));
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    updateHud();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    audio.unlock();
    hud.hideOverlay();
  } else if (!R.matchOver && R.phase !== 'over') {
    hud.showOverlay(started ? 'paused' : 'start');
  }
}

hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name);
hud.setHealth(100);
hud.setScore(0, 0, 1);
hud.setMoney(800);
startRoundSetup();
hud.onPlay(() => {
  if (shot) return;
  if (R.phase === 'over' && !R.matchOver) {
    // Clicking through the round-end overlay resumes into the buy phase.
    input.requestLock();
    return;
  }
  if (R.matchOver) {
    location.reload();
    return;
  }
  input.requestLock();
});

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    updateHud();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  body.pitch = 0;
  if (name === 'start') {
    body.position.set(-2, 0, 17);
    body.yaw = Math.PI + 0.35;
    settle(20);
    aimAt(new THREE.Vector3(18, 9, -14));
    hud.showOverlay('start');
  } else if (name === 'play') {
    rounds.beginLive();
    // Stage a mid-map firefight: two Heat bots in the open, one Dust teammate near.
    const heat = bots.bots.filter((b) => b.team === 'heat');
    const dust = bots.bots.filter((b) => b.team === 'dust');
    heat[0].pos.set(-4, 0, 2);
    heat[1].pos.set(5, 0, -3);
    dust[0].pos.set(-3, 0, 8);
    body.position.set(0, 0, 14);
    body.yaw = Math.PI;
    settle(20);
    aimAt(new THREE.Vector3(heat[0].pos.x, 1.3, heat[0].pos.z));
    shoot(0);
    settle(8);
    aimAt(new THREE.Vector3(heat[1].pos.x, 1.3, heat[1].pos.z));
    shoot(0);
    settle(10);
    hud.setHealth(100);
  } else if (name === 'bomb') {
    rounds.beginLive();
    rounds.plant('A');
    effects.showCharge(world.sites.A);
    const heat = bots.bots.filter((b) => b.team === 'heat');
    heat[0].pos.set(-23, 0, -9);
    body.position.set(-14, 0, -8.5);
    body.yaw = Math.PI / 2;
    player.damage(45);
    hud.setHealth(55);
    settle(20);
    aimAt(new THREE.Vector3(world.sites.A.x, 0.6, world.sites.A.z));
  } else {
    // end: round over, Dust up 1-0.
    R.dustWins = 1;
    R.phase = 'over';
    R.winner = 'dust';
    body.position.set(0, 0, 10);
    body.yaw = Math.PI;
    settle(20);
    aimAt(new THREE.Vector3(0, 2, -12));
    hud.showOverlay('roundEnd', 'Dust takes the round (elimination). 1 — 0. Click for the next round.');
  }
  hud.setScore(R.dustWins, R.heatWins, R.round);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name);
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
