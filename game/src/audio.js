// All sound is synthesised with WebAudio: no audio files, no network. Shots are
// per-weapon noise bursts with distance falloff; everything else is a short
// oscillator or filtered-noise blip. Mute with M.
export function createAudio() {
  let ctx = null;
  let muted = false;
  let master = null;

  function ensure() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain();
        master.gain.value = 0.4;
        master.connect(ctx.destination);
      } catch {
        ctx = null;
      }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function noiseBurst(duration, filterFreq, gainValue, type = 'lowpass') {
    const ac = ensure();
    if (!ac) return;
    const len = Math.max(1, Math.floor(ac.sampleRate * duration));
    const buffer = ac.createBuffer(1, len, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    src.buffer = buffer;
    const filter = ac.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(gainValue, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
    src.connect(filter).connect(gain).connect(master);
    src.start();
  }

  function tone(freq, duration, gainValue, type = 'sine', slideTo = null) {
    const ac = ensure();
    if (!ac) return;
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ac.currentTime + duration);
    const gain = ac.createGain();
    gain.gain.setValueAtTime(gainValue, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
    osc.connect(gain).connect(master);
    osc.start();
    osc.stop(ac.currentTime + duration);
  }

  function distanceGain(dist) {
    return Math.max(0.05, 1 - dist / 70);
  }

  return {
    unlock() { ensure(); },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.4;
      return muted;
    },
    get muted() { return muted; },
    shot(id, dist = 0) {
      const g = distanceGain(dist);
      if (id === 'longshot') { noiseBurst(0.28, 900, 0.9 * g); tone(140, 0.2, 0.25 * g, 'sawtooth', 60); }
      else if (id === 'sandstorm') { noiseBurst(0.22, 700, 0.95 * g); }
      else if (id === 'devil') { noiseBurst(0.09, 1600, 0.5 * g, 'bandpass'); }
      else if (id === 'sidewinder') { noiseBurst(0.12, 1300, 0.55 * g); }
      else { noiseBurst(0.13, 1100, 0.7 * g); }
    },
    dryFire() { tone(1800, 0.05, 0.12, 'square'); },
    reload() { tone(500, 0.07, 0.15, 'square'); setTimeout(() => tone(700, 0.07, 0.15, 'square'), 260); },
    hit() { tone(1200, 0.06, 0.2, 'sine'); },
    kill() { tone(880, 0.09, 0.22, 'sine'); setTimeout(() => tone(1320, 0.12, 0.22, 'sine'), 90); },
    hurt() { tone(220, 0.18, 0.3, 'sawtooth', 110); },
    step() { noiseBurst(0.05, 500, 0.08); },
    plantBeep() { tone(980, 0.1, 0.2, 'square'); },
    explosion() { noiseBurst(0.9, 300, 1); tone(70, 0.7, 0.5, 'sine', 35); },
    buy() { tone(660, 0.08, 0.18, 'sine'); },
    grenade() { tone(300, 0.12, 0.2, 'triangle', 500); },
    flash() { tone(2400, 0.4, 0.15, 'sine', 1200); },
    win() { tone(523, 0.14, 0.22, 'sine'); setTimeout(() => tone(659, 0.14, 0.22, 'sine'), 140); setTimeout(() => tone(784, 0.22, 0.22, 'sine'), 280); },
    lose() { tone(392, 0.18, 0.22, 'sine'); setTimeout(() => tone(311, 0.26, 0.22, 'sine'), 180); },
  };
}
