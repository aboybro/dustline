// Dustline bots: two squads of desert fighters. Dust (teammates) wear sand-tan,
// Heat (enemies) wear rust. Each bot is a state machine: it walks a lane route,
// holds at a site, engages only with a real line of sight, hears gunfire, bursts
// fire with range-based aim error, and falls back when badly hurt. The carrier
// plants the charge; Heat bots defuse and retake a planted site.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const DUST_NAMES = ['Mirage', 'Coyote', 'Sol'];
const HEAT_NAMES = ['Dune', 'Viper', 'Scorch', 'Ember'];

function healthBarTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 8;
  return canvas;
}

export function createBots(scene, world) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 90;
  const eye = new THREE.Vector3();
  const tgt = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const toTarget = new THREE.Vector3();

  function makeSuit(color) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2b1d12, roughness: 0.7 });
    const group = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.78, 8), mat);
    torso.position.y = 1.05;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), new THREE.MeshStandardMaterial({ color: 0xc9a06a, roughness: 0.8 }));
    head.position.y = 1.62;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.2, metalness: 0.6 }));
    visor.position.set(0, 1.64, 0.18);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), dark);
    gun.position.set(0.26, 1.18, -0.2);
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.07, 10), mat);
    hat.position.y = 1.8;
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.62, 8), dark);
    legs.position.y = 0.31;
    for (const m of [torso, head, visor, gun, hat, legs]) {
      m.castShadow = true;
      group.add(m);
    }
    head.userData.part = 'head';
    torso.userData.part = 'body';
    return { group, head, torso };
  }

  function makeBar() {
    const canvas = healthBarTexture();
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sprite.scale.set(0.9, 0.11, 1);
    sprite.position.y = 2.15;
    return { canvas, tex, sprite };
  }

  function makeBot(name, team, spawn, route) {
    const color = team === 'dust' ? 0xc9a86a : 0xb4552d;
    const { group, head, torso } = makeSuit(color);
    group.position.set(spawn.x, 0, spawn.z);
    scene.add(group);
    const bar = makeBar();
    group.add(bar.sprite);
    head.userData.bot = null;
    torso.userData.bot = null;
    const bot = {
      name, team, group, head, torso, bar,
      hp: 100, alive: true,
      pos: group.position,
      yaw: 0, route, routeIndex: 0,
      mode: 'advance', holdUntil: 0, burstLeft: 0, shootCooldown: 0,
      target: null, speed: 3.1, carrier: false, planting: 0, defusing: 0,
      heard: null, heardAt: 0,
    };
    head.userData.bot = bot;
    torso.userData.bot = bot;
    return bot;
  }

  const bots = [];
  const dustSpawns = world.spawns.dust;
  const heatSpawns = world.spawns.heat;
  const dustRoutes = [world.routes.west, world.routes.mid, world.routes.east];
  const heatRoutes = [world.routes.defendA, world.routes.defendB, world.routes.mid];
  for (let i = 0; i < 3; i += 1) {
    bots.push(makeBot(DUST_NAMES[i], 'dust', dustSpawns[i + 1] || dustSpawns[0], dustRoutes[i]));
  }
  for (let i = 0; i < 4; i += 1) {
    bots.push(makeBot(HEAT_NAMES[i], 'heat', heatSpawns[i], heatRoutes[i % heatRoutes.length]));
  }
  bots[3].carrier = false; // Heat never carries; Dust's first bot carries when attacking.
  bots[0].carrier = true;

  function drawBar(bot) {
    const ctx = bot.bar.canvas.getContext('2d');
    ctx.clearRect(0, 0, 64, 8);
    ctx.fillStyle = 'rgba(20,12,6,0.85)';
    ctx.fillRect(0, 0, 64, 8);
    ctx.fillStyle = bot.team === 'dust' ? '#ffd27a' : '#ff7a1a';
    ctx.fillRect(1, 1, 62 * Math.max(0, bot.hp / 100), 6);
    bot.bar.tex.needsUpdate = true;
  }
  for (const bot of bots) drawBar(bot);

  function canSee(bot, targetPos, smokes) {
    eye.set(bot.pos.x, 1.55, bot.pos.z);
    tgt.copy(targetPos);
    dir.copy(tgt).sub(eye);
    const dist = dir.length();
    if (dist > 70) return false;
    dir.normalize();
    raycaster.set(eye, dir);
    const hits = raycaster.intersectObjects(world.shootables, false);
    if (hits.length > 0 && hits[0].distance < dist - 0.4) return false;
    for (const s of smokes) {
      toTarget.copy(s.pos).sub(eye);
      const along = toTarget.dot(dir);
      if (along > 0 && along < dist) {
        const closest = eye.clone().addScaledVector(dir, along);
        if (closest.distanceTo(s.pos) < s.radius) return false;
      }
    }
    return true;
  }

  function faceToward(bot, x, z, dt) {
    const want = Math.atan2(x - bot.pos.x, z - bot.pos.z);
    let diff = want - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff));
    bot.group.rotation.y = bot.yaw;
  }

  function moveToward(bot, x, z, dt, speed) {
    const dx = x - bot.pos.x;
    const dz = z - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.4) return true;
    const stepLen = Math.min(dist, speed * dt);
    bot.pos.x += (dx / dist) * stepLen;
    bot.pos.z += (dz / dist) * stepLen;
    faceToward(bot, x, z, dt);
    return false;
  }

  function damage(bot, amount) {
    if (!bot.alive) return false;
    bot.hp = Math.max(0, bot.hp - amount);
    drawBar(bot);
    if (bot.hp <= 0) {
      bot.alive = false;
      bot.group.visible = false;
      bot.bar.sprite.visible = false;
      return true;
    }
    return false;
  }

  function reset(spawns, routes, attacking) {
    let dustIndex = 0;
    let heatIndex = 0;
    for (let i = 0; i < bots.length; i += 1) {
      const bot = bots[i];
      const teamIndex = bot.team === 'dust' ? dustIndex : heatIndex;
      if (bot.team === 'dust') dustIndex += 1;
      else heatIndex += 1;
      const spawn = bot.team === 'dust' ? spawns.dust[teamIndex] : spawns.heat[teamIndex];
      bot.pos.set(spawn.x, 0, spawn.z);
      bot.hp = 100;
      bot.alive = true;
      bot.group.visible = true;
      bot.bar.sprite.visible = true;
      bot.routeIndex = 0;
      bot.mode = bot.team === (attacking ? 'dust' : 'heat') ? 'advance' : 'hold';
      bot.holdUntil = 0;
      bot.burstLeft = 0;
      bot.shootCooldown = 0;
      bot.target = null;
      bot.planting = 0;
      bot.defusing = 0;
      bot.heard = null;
      drawBar(bot);
      const route = bot.team === 'dust'
        ? routes.dust[teamIndex % routes.dust.length]
        : routes.heat[teamIndex % routes.heat.length];
      bot.route = route;
      bot.yaw = bot.team === 'dust' ? Math.PI : 0;
      bot.group.rotation.y = bot.yaw;
    }
    for (const b of bots) b.carrier = false;
    for (const b of bots) {
      if (b.team === (attacking ? 'dust' : 'heat')) { b.carrier = true; break; }
    }
  }

  function hitMeshes() {
    const out = [];
    for (const bot of bots) {
      if (bot.alive) out.push(bot.head, bot.torso);
    }
    return out;
  }

  return {
    bots,
    canSee,
    damage,
    reset,
    hitMeshes,
    step(ctx, dt, time) {
      for (const bot of bots) {
        if (!bot.alive) continue;
        bot.shootCooldown = Math.max(0, bot.shootCooldown - dt);
        // Pick the nearest visible enemy: the player or an opposing bot.
        let target = null;
        let targetPos = null;
        let targetDist = Infinity;
        const foes = [];
        if (ctx.player.alive && bot.team === 'heat') foes.push({ kind: 'player', pos: ctx.playerPos, hp: ctx.player.hp });
        for (const other of bots) {
          if (other.alive && other.team !== bot.team) foes.push({ kind: 'bot', pos: other.pos, bot: other, hp: other.hp });
        }
        for (const foe of foes) {
          const dx = foe.pos.x - bot.pos.x;
          const dz = foe.pos.z - bot.pos.z;
          const d = Math.hypot(dx, dz);
          if (d < targetDist && canSee(bot, foe.pos, ctx.smokes)) {
            targetDist = d;
            target = foe;
            targetPos = foe.pos;
          }
        }
        bot.target = target;

        // Plant / defuse behaviour.
        if (ctx.phase === 'live') {
          if (bot.carrier && bot.team === ctx.attackers && ctx.plantSite && !ctx.planted) {
            const site = world.sites[ctx.plantSite];
            const d = Math.hypot(site.x - bot.pos.x, site.z - bot.pos.z);
            if (d < 2.5 && !ctx.playerPlanting) {
              bot.planting += dt;
              faceToward(bot, site.x, site.z, dt);
              if (bot.planting >= 3.5) {
                ctx.onPlant(bot, ctx.plantSite);
                bot.planting = 0;
              }
              continue;
            }
            bot.planting = 0;
          }
          if (ctx.planted && bot.team !== ctx.attackers) {
            const site = world.sites[ctx.plantedSite];
            const d = Math.hypot(site.x - bot.pos.x, site.z - bot.pos.z);
            if (d < 2.2) {
              bot.defusing += dt;
              faceToward(bot, site.x, site.z, dt);
              if (bot.defusing >= 5) {
                ctx.onDefuse(bot);
                bot.defusing = 0;
              }
              continue;
            }
            bot.defusing = 0;
          }
        }

        if (target && targetDist < 55) {
          // Engage: face the target and fire in bursts.
          faceToward(bot, targetPos.x, targetPos.z, dt);
          if (bot.shootCooldown <= 0) {
            if (bot.burstLeft <= 0) {
              bot.burstLeft = 3 + Math.floor(Math.random() * 3);
              bot.shootCooldown = 0.5 + Math.random() * 0.7;
            } else {
              bot.burstLeft -= 1;
              bot.shootCooldown = 0.13;
              const err = 0.02 + targetDist * 0.0016;
              ctx.botShoot(bot, target, err);
            }
          }
          continue;
        }

        // No target: follow the route, or hold at the end of it.
        if (bot.mode === 'hold') {
          if (time > bot.holdUntil && bot.heard) {
            bot.mode = 'advance';
            bot.route = bot.heard;
            bot.routeIndex = 0;
            bot.heard = null;
          }
          continue;
        }
        const wp = bot.route[bot.routeIndex];
        if (!wp) {
          bot.mode = 'hold';
          bot.holdUntil = time + 2 + Math.random() * 3;
          continue;
        }
        const arrived = moveToward(bot, wp.x, wp.z, dt, bot.hp < 35 ? bot.speed * 0.7 : bot.speed);
        if (arrived) bot.routeIndex += 1;
      }
    },
    hearNoise(pos, route) {
      for (const bot of bots) {
        if (!bot.alive || bot.target) continue;
        const d = Math.hypot(pos.x - bot.pos.x, pos.z - bot.pos.z);
        if (d < 26) {
          bot.heard = route;
          bot.heardAt = 0;
          if (bot.mode === 'hold') bot.holdUntil = 0;
        }
      }
    },
  };
}
