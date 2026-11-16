// Dustline map: "Solara Flats", a desert solar farm, 56 x 40 m. Three lanes run
// north-south between the panel arrays: Panel Row West, Array Mid and Tower Road.
// Site A sits in the west array, site B under the control tower in the east.
// Every solid object is a collider for the player and a surface a bullet stops on.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const MAP_W = 56;
const MAP_D = 40;

function sandTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#d9a05b';
  ctx.fillRect(0, 0, 512, 512);
  let seed = 1234567;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 5200; i += 1) {
    const v = rnd();
    ctx.fillStyle = v < 0.5 ? 'rgba(120, 84, 44, 0.16)' : 'rgba(255, 226, 170, 0.14)';
    const s = 1 + rnd() * 3;
    ctx.fillRect(rnd() * 512, rnd() * 512, s, s);
  }
  // Wind ripples: long soft arcs across the sand.
  ctx.strokeStyle = 'rgba(140, 100, 55, 0.20)';
  ctx.lineWidth = 2;
  for (let r = 0; r < 26; r += 1) {
    const y = rnd() * 512;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.02 + r) * 7);
    ctx.stroke();
  }
  // Darker patches where the ground is packed.
  for (let i = 0; i < 14; i += 1) {
    ctx.fillStyle = 'rgba(150, 108, 60, 0.10)';
    ctx.beginPath();
    ctx.ellipse(rnd() * 512, rnd() * 512, 30 + rnd() * 60, 18 + rnd() * 40, rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(7, 5);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const shootables = [];

  const mats = {};
  for (const name of Object.keys(PALETTE)) {
    mats[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'panel' ? 0.32 : 0.92,
      metalness: name === 'panel' ? 0.55 : 0.04,
    });
  }
  const sandMat = new THREE.MeshStandardMaterial({ map: sandTexture(), roughness: 1, metalness: 0 });
  const panelGlass = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#2a5a8f'), roughness: 0.4, metalness: 0.35,
  });
  const panelEdge = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#c8cdd2'), roughness: 0.4, metalness: 0.8,
  });

  function addCollider(mesh) {
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }
  function box(w, h, d, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) addCollider(mesh);
    return mesh;
  }
  function cyl(rt, rb, h, x, y, z, material, segments = 12) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, segments), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    addCollider(mesh);
    return mesh;
  }

  // Ground slab.
  const ground = new THREE.Mesh(new THREE.BoxGeometry(MAP_W, 0.4, MAP_D), sandMat);
  ground.position.set(0, -0.2, 0);
  ground.receiveShadow = true;
  group.add(ground);
  colliders.push(new THREE.Box3().setFromObject(ground));
  shootables.push(ground);

  // Perimeter dune ridges: low walls of packed sand that bound the play area.
  box(MAP_W + 2, 2.2, 1.6, 0, 1.1, -MAP_D / 2 - 0.8, mats.hairline);
  box(MAP_W + 2, 2.2, 1.6, 0, 1.1, MAP_D / 2 + 0.8, mats.hairline);
  box(1.6, 2.2, MAP_D + 2, -MAP_W / 2 - 0.8, 1.1, 0, mats.hairline);
  box(1.6, 2.2, MAP_D + 2, MAP_W / 2 + 0.8, 1.1, 0, mats.hairline);

  // Corner dunes: big soft mounds, decor only (outside the ridges, no collider).
  const duneMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c99a5e'), roughness: 1 });
  for (const [x, z, s] of [[-26, -18, 5], [26, 18, 6], [-25, 17, 4], [25, -17, 4.5]]) {
    const dune = new THREE.Mesh(new THREE.SphereGeometry(s, 12, 8), duneMat);
    dune.scale.set(1.4, 0.35, 1);
    dune.position.set(x, -0.4, z);
    dune.receiveShadow = true;
    group.add(dune);
  }

  // Solar panel arrays: tilted glass panels on steel legs. Rows leave lane gaps.
  function panelRow(cx, cz, count, gap) {
    for (let i = 0; i < count; i += 1) {
      const x = cx + (i - (count - 1) / 2) * gap;
      const frame = new THREE.Group();
      frame.position.set(x, 0, cz);
      const legL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.5, 0.14), panelEdge);
      legL.position.set(-1.3, 0.75, 0);
      const legR = legL.clone();
      legR.position.x = 1.3;
      const glass = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.1, 2.3), panelGlass);
      glass.position.set(0, 1.75, 0);
      glass.rotation.x = -0.42;
      const rim = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.08, 2.4), panelEdge);
      rim.position.set(0, 1.7, 0);
      rim.rotation.x = -0.42;
      for (const m of [legL, legR, glass, rim]) {
        m.castShadow = true;
        m.receiveShadow = true;
        frame.add(m);
      }
      group.add(frame);
      const hit = new THREE.Box3();
      hit.min.set(x - 1.8, 0, cz - 1.3);
      hit.max.set(x + 1.8, 2.2, cz + 1.3);
      colliders.push(hit);
      shootables.push(glass, rim);
    }
  }
  // West array (site A side), mid array, east array (site B side).
  panelRow(-20, -6, 3, 4.4);
  panelRow(-20, 2, 3, 4.4);
  panelRow(-4, -8, 4, 4.4);
  panelRow(-2, 0, 4, 4.4);
  panelRow(3, 7, 3, 4.4);
  panelRow(18, -4, 3, 4.4);
  panelRow(18, 4, 3, 4.4);

  // Control tower, east: column, cabin, antenna, stair block.
  box(2.6, 11, 2.6, 22, 5.5, -16, mats.rust);
  box(5.4, 2.6, 4.6, 22, 12.2, -16, mats.surface);
  box(5.8, 0.3, 5.0, 22, 13.6, -16, mats.ink);
  cyl(0.08, 0.08, 3.4, 22, 15.2, -16, mats.ink, 6);
  box(0.5, 0.5, 0.5, 22, 17.0, -16, mats.accent);
  box(2.2, 4.2, 1.6, 19.4, 2.1, -13.4, mats.hairline);
  // Glass band on the cabin.
  const cabinGlass = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.9, 4.2), panelGlass);
  cabinGlass.position.set(22, 12.2, -16);
  group.add(cabinGlass);
  shootables.push(cabinGlass);

  // Water tank, west.
  cyl(2.1, 2.1, 4.2, -25, 2.1, 13, mats.rust, 16);
  cyl(2.2, 2.2, 0.3, -25, 4.35, 13, mats.ink, 16);
  box(1.2, 1.0, 1.2, -25, 4.9, 13, mats.accent);

  // Inverter stations: rust boxes with vents, scattered as mid cover.
  for (const [x, z, ry] of [[-10, -2, 0.3], [8, -10, -0.4], [-14, 8, 0.2], [12, 10, 0.5], [0, -14, 0]]) {
    const inv = box(2.2, 1.5, 1.3, x, 0.75, z, mats.rust);
    inv.rotation.y = ry;
    box(1.8, 0.2, 1.0, x, 1.6, z, mats.ink);
  }

  // Crates and sandbag walls: low cover along the lanes.
  const crateMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#a9804e'), roughness: 0.95 });
  for (const [x, z, s, h] of [
    [-8, 4, 1.4, 1.4], [-7, 5.2, 1.1, 1.1], [6, 2, 1.5, 1.5], [7.4, 3.4, 1.0, 1.0],
    [-24, -9, 1.3, 1.3], [14, -8, 1.4, 1.4], [-2, 12, 1.5, 1.5], [10, -15, 1.2, 1.2],
    [-24, -2, 1.2, 1.2], [24, 8, 1.3, 1.3],
  ]) {
    box(s, h, s, x, h / 2, z, crateMat);
  }
  for (const [x, z, ry] of [[-12, -6, 0], [-12, -6.9, 0], [4, -6, 1.57], [4.9, -6, 1.57], [16, 12, 0], [-6, 10, 1.57]]) {
    const bag = box(2.6, 0.95, 0.9, x, 0.48, z, mats.hairline);
    bag.rotation.y = ry;
  }

  // Scrub bushes: small dark cones, decor only.
  const scrubMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.leaf), roughness: 1 });
  for (const [x, z, s] of [[-26, 6, 0.7], [-18, 14, 0.9], [12, 16, 0.8], [24, -10, 0.7], [-6, -17, 0.9], [26, 2, 0.8], [2, 15, 0.7], [-22, -15, 0.8]]) {
    const bush = new THREE.Mesh(new THREE.ConeGeometry(s, s * 1.1, 7), scrubMat);
    bush.position.set(x, s * 0.5, z);
    bush.castShadow = true;
    group.add(bush);
  }

  // Bomb sites: painted rings on the sand plus a marker pole and lamp.
  function siteMarker(x, z, label) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.4, 32),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.03, z);
    group.add(ring);
    const pole = cyl(0.07, 0.07, 3.2, x + 3.6, 1.6, z, mats.ink, 6);
    pole.castShadow = false;
    const flag = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.05),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.8 }));
    flag.position.set(x + 4.1, 2.9, z);
    group.add(flag);
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.accent), 6, 12);
    lamp.position.set(x, 2.6, z);
    group.add(lamp);
    return { x, z, r: 3.4, label };
  }
  const sites = {
    A: siteMarker(-20, -12, 'A'),
    B: siteMarker(20, -12, 'B'),
  };

  // Harsh desert sun: warm key light, long shadows; pale sky fill.
  const sky = new THREE.HemisphereLight(new THREE.Color('#cfe4f2'), new THREE.Color('#c99a5e'), 1.35);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffe6b8'), 3.0);
  sun.position.set(28, 42, 18);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -34;
  sun.shadow.camera.right = 34;
  sun.shadow.camera.top = 26;
  sun.shadow.camera.bottom = -26;
  sun.shadow.camera.far = 110;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  const bounce = new THREE.DirectionalLight(new THREE.Color('#e8c890'), 0.5);
  bounce.position.set(-20, 12, 24);
  scene.add(bounce);

  return {
    colliders,
    shootables,
    group,
    sites,
    routes: {
      west: [{ x: -20, z: 14 }, { x: -22, z: 4 }, { x: -20, z: -4 }, { x: -20, z: -12 }],
      mid: [{ x: 0, z: 14 }, { x: 2, z: 6 }, { x: -2, z: -2 }, { x: 0, z: -10 }],
      east: [{ x: 20, z: 14 }, { x: 22, z: 4 }, { x: 20, z: -4 }, { x: 20, z: -12 }],
      defendA: [{ x: -16, z: -15 }, { x: -20, z: -12 }, { x: -14, z: -8 }],
      defendB: [{ x: 16, z: -15 }, { x: 20, z: -12 }, { x: 14, z: -8 }],
      retake: [{ x: 0, z: -14 }, { x: -8, z: -12 }, { x: 8, z: -12 }],
    },
    spawns: {
      dust: [{ x: -6, z: 16 }, { x: 0, z: 17 }, { x: 6, z: 16 }, { x: -2, z: 15 }],
      heat: [{ x: -8, z: -16 }, { x: 0, z: -17 }, { x: 8, z: -16 }, { x: 14, z: -15 }],
    },
  };
}
