// Dustline arsenal: one data table per weapon, one per grenade. The view model is
// built from boxes per weapon so each gun reads differently at a glance. main.js
// owns the ray and the damage; this module owns the numbers, the magazine, the
// reload and the spread that punishes moving and sustained fire.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  sunburst: {
    id: 'sunburst', name: 'AR-9 Sunburst', price: 2600, damage: 32, headMult: 4,
    mag: 30, reserve: 90, fireGap: 0.105, reloadTime: 1.9, auto: true,
    spreadStill: 0.0024, spreadMove: 0.03, pellets: 1, kick: 0.011, range: 60,
  },
  devil: {
    id: 'devil', name: 'Dust Devil SMG', price: 1400, damage: 22, headMult: 3,
    mag: 32, reserve: 96, fireGap: 0.07, reloadTime: 1.6, auto: true,
    spreadStill: 0.005, spreadMove: 0.038, pellets: 1, kick: 0.008, range: 38,
  },
  longshot: {
    id: 'longshot', name: 'Longshot DMR', price: 3900, damage: 95, headMult: 3,
    mag: 8, reserve: 24, fireGap: 0.85, reloadTime: 2.6, auto: false,
    spreadStill: 0.0006, spreadMove: 0.05, pellets: 1, kick: 0.03, range: 90,
  },
  sandstorm: {
    id: 'sandstorm', name: 'Sandstorm 12', price: 1700, damage: 13, headMult: 2,
    mag: 6, reserve: 24, fireGap: 0.8, reloadTime: 2.4, auto: false,
    spreadStill: 0.02, spreadMove: 0.045, pellets: 8, kick: 0.035, range: 22,
  },
  sidewinder: {
    id: 'sidewinder', name: 'P9 Sidewinder', price: 0, damage: 26, headMult: 3,
    mag: 15, reserve: 45, fireGap: 0.16, reloadTime: 1.3, auto: false,
    spreadStill: 0.004, spreadMove: 0.03, pellets: 1, kick: 0.009, range: 40,
  },
};

export const GRENADES = {
  frag: { id: 'frag', name: 'Cactus Frag', price: 300, radius: 6.5, damage: 110 },
  smoke: { id: 'smoke', name: 'Dust Smoke', price: 300, radius: 5, duration: 14 },
  flash: { id: 'flash', name: 'Sunflare', price: 250, radius: 16 },
};

const VIEW = {
  sunburst: { len: 0.46, barrel: 0.42, color: 0x3a2e22, accent: 0xff7a1a },
  devil: { len: 0.34, barrel: 0.26, color: 0x4a3a28, accent: 0xd9a05b },
  longshot: { len: 0.62, barrel: 0.58, color: 0x2b2b26, accent: 0x1e3a5f },
  sandstorm: { len: 0.44, barrel: 0.4, color: 0x5a3a20, accent: 0xb4552d },
  sidewinder: { len: 0.24, barrel: 0.16, color: 0x333333, accent: 0xff7a1a },
};

export function createWeapon(camera) {
  const group = new THREE.Group();
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9,
      depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  flash.position.set(0.22, -0.16, -0.95);
  flash.visible = false;
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.22, -0.14, -0.6);
  camera.add(group, flash, flashLight);

  let model = null;
  function buildModel(id) {
    if (model) {
      group.remove(model);
      model.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    const v = VIEW[id];
    const body = new THREE.MeshStandardMaterial({ color: v.color, roughness: 0.55, metalness: 0.35 });
    const accent = new THREE.MeshStandardMaterial({ color: v.accent, roughness: 0.5, metalness: 0.3 });
    model = new THREE.Group();
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, v.len), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, v.barrel), accent);
    barrel.position.set(0, 0.03, -(v.len / 2 + v.barrel / 2 - 0.05));
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09), body);
    grip.position.set(0, -0.11, 0.08);
    grip.rotation.x = 0.3;
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.2), body);
    stock.position.set(0, -0.02, v.len / 2 + 0.06);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.12), accent);
    sight.position.set(0, 0.08, -0.05);
    model.add(receiver, barrel, grip, stock, sight);
    model.position.set(0.24, -0.23, -0.5);
    model.scale.setScalar(0.66);
    group.add(model);
  }

  const state = {
    id: 'sunburst', mag: 30, reserve: 90, cooldown: 0, reloadLeft: 0,
    reloadTime: 1.9, flash: 0, kick: 0, bloom: 0,
  };

  function equip(id) {
    const def = WEAPONS[id];
    state.id = id;
    state.mag = def.mag;
    state.reserve = def.reserve;
    state.cooldown = 0;
    state.reloadLeft = 0;
    state.reloadTime = def.reloadTime;
    state.flash = 0;
    state.kick = 0;
    state.bloom = 0;
    buildModel(id);
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.bloom = Math.max(0, state.bloom - dt * 0.9);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    if (model) {
      model.position.z = -0.5 + state.kick;
      model.rotation.x = state.kick * 2.4;
      if (state.reloadLeft > 0) {
        model.rotation.x = -0.55 * Math.min(1, (state.reloadTime - state.reloadLeft) * 2);
      }
    }
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      if (state.reloadLeft === 0) {
        const def = WEAPONS[state.id];
        const need = def.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  buildModel('sunburst');
  return {
    state,
    step,
    equip,
    def() { return WEAPONS[state.id]; },
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      const def = WEAPONS[state.id];
      state.cooldown = def.fireGap;
      state.flash = 0.06;
      state.kick = 0.055;
      state.bloom = Math.min(0.05, state.bloom + 0.006);
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      const def = WEAPONS[state.id];
      if (state.reloadLeft > 0 || state.mag === def.mag || state.reserve === 0) return;
      state.reloadLeft = def.reloadTime;
    },
    spread(speed, moving) {
      const def = WEAPONS[state.id];
      const move = Math.min(1, speed / 5.4);
      return def.spreadStill + move * def.spreadMove + state.bloom + (moving ? 0.004 : 0);
    },
  };
}
