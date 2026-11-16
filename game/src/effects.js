// Pooled visual effects: tracers, impact sparks, smoke clouds that block bot
// sight, and the blinking planted charge. Pools are fixed at creation, so the
// hot loop never allocates.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_COUNT = 24;
const SPARK_COUNT = 40;

export function createEffects(scene) {
  const tracers = [];
  const tracerMat = new THREE.LineBasicMaterial({ color: new THREE.Color('#ffd27a'), transparent: true, opacity: 0.9 });
  for (let i = 0; i < TRACER_COUNT; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, tracerMat);
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIndex = 0;

  const sparks = [];
  const sparkGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
  const sparkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) });
  for (let i = 0; i < SPARK_COUNT; i += 1) {
    const mesh = new THREE.Mesh(sparkGeo, sparkMat);
    mesh.visible = false;
    scene.add(mesh);
    sparks.push({ mesh, life: 0, vel: new THREE.Vector3() });
  }
  let sparkIndex = 0;

  const smokes = [];
  const smokeMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#d8c8a8'), transparent: true, opacity: 0.5, depthWrite: false,
  });

  // Planted charge: a small rust box with a blinking orange light.
  const charge = new THREE.Group();
  const chargeBox = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.34),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.6 }));
  const chargeLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 9);
  chargeLight.position.y = 0.4;
  const chargeDot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) }));
  chargeDot.position.y = 0.22;
  charge.add(chargeBox, chargeLight, chargeDot);
  charge.visible = false;
  scene.add(charge);

  function tracer(from, to) {
    const t = tracers[tracerIndex];
    tracerIndex = (tracerIndex + 1) % TRACER_COUNT;
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    t.line.visible = true;
    t.life = 0.09;
  }

  function sparkAt(point, count = 6) {
    for (let i = 0; i < count; i += 1) {
      const s = sparks[sparkIndex];
      sparkIndex = (sparkIndex + 1) % SPARK_COUNT;
      s.mesh.position.copy(point);
      s.mesh.visible = true;
      s.life = 0.28;
      s.vel.set((Math.random() - 0.5) * 4, Math.random() * 3 + 1, (Math.random() - 0.5) * 4);
    }
  }

  function addSmoke(pos, duration) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), smokeMat.clone());
    mesh.position.set(pos.x, 1.1, pos.z);
    mesh.scale.setScalar(0.6);
    scene.add(mesh);
    smokes.push({ pos: new THREE.Vector3(pos.x, 1.1, pos.z), radius: 4.2, life: duration, mesh, grow: 0 });
  }

  function showCharge(site) {
    charge.position.set(site.x, 0.18, site.z);
    charge.visible = true;
  }
  function hideCharge() {
    charge.visible = false;
  }

  function step(dt, time) {
    for (const t of tracers) {
      if (t.life > 0) {
        t.life -= dt;
        if (t.life <= 0) t.line.visible = false;
      }
    }
    for (const s of sparks) {
      if (s.life > 0) {
        s.life -= dt;
        s.mesh.position.addScaledVector(s.vel, dt);
        s.vel.y -= 9 * dt;
        if (s.life <= 0) s.mesh.visible = false;
      }
    }
    for (let i = smokes.length - 1; i >= 0; i -= 1) {
      const s = smokes[i];
      s.life -= dt;
      s.grow = Math.min(1, s.grow + dt * 0.5);
      s.mesh.scale.setScalar(0.6 + s.grow * 3.6);
      s.mesh.material.opacity = 0.5 * Math.min(1, s.life / 2);
      if (s.life <= 0) {
        scene.remove(s.mesh);
        s.mesh.material.dispose();
        smokes.splice(i, 1);
      }
    }
    if (charge.visible) {
      const blink = Math.sin(time * 9) > 0;
      chargeLight.intensity = blink ? 10 : 0.5;
      chargeDot.visible = blink;
    }
  }

  return { tracer, sparkAt, addSmoke, showCharge, hideCharge, smokes, step };
}
