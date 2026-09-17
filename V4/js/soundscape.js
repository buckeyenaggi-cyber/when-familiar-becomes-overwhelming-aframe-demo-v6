/* ==================== 01 声音配置：真实人声与脚步 ====================
   每层使用不同片段起点与左右位置，避免所有声音同步循环。
   at = 开始加入的过载程度；base = 开头音量；gain = 后段增加量。
   后期的“吵”来自更多声音同时争夺注意力，不使用电子白噪音。
   录音来源及 CC0 许可见 audio/CREDITS.md；全部文件随项目附带。 */
const SOUND = {
  volume: 0.72,
  // 耳鸣从中段开始加入。gain 是合成器增益，最终仍经过总音量控制。
  ringing: [
    { frequency: 2850, at: .32, gain: .028, pan: -.16 },
    { frequency: 4270, at: .65, gain: .009, pan: .18 }
  ],
  layers: [
    { file: 'voices', at: 0, base: .07, gain: .32, pan: -.65, offset: 1 },
    { file: 'voices', at: .18, base: 0, gain: .34, pan: .65, offset: 13 },
    { file: 'voices', at: .43, base: 0, gain: .32, pan: -.25, offset: 26 },
    { file: 'voices', at: .63, base: 0, gain: .30, pan: .35, offset: 36 },
    { file: 'steps', at: 0, base: .11, gain: .40, pan: .72, offset: 3 },
    { file: 'steps', at: .26, base: 0, gain: .44, pan: -.75, offset: 16 },
    { file: 'steps', at: .57, base: 0, gain: .36, pan: .1, offset: 31 }
  ]
};

class Soundscape {
  constructor() {
    this.context = null;
    this.layers = [];
    this.ringing = [];
    this.level = 0;
    this.quiet = false;
    this.volume = SOUND.volume;
    this.buffers = {};
    // 先获取本地文件；AudioContext 只在用户点“进入”后启动。
    this.files = Object.fromEntries(Object.entries({
      voices: 'audio/hall-voices.mp3', steps: 'audio/hall-footsteps.mp3', step: 'audio/player-step.wav'
    }).map(([key, url]) => [key, fetch(url).then(r => {
      if (!r.ok) throw new Error(url);
      return r.arrayBuffer();
    }).catch(() => null)]));
  }

  /* ==================== 02 混音与空间回声 ====================
     各层 → 音量/低通/左右声道 → 干声 + 混响 → 压缩器 → 总音量。
     越后面：更多层出现、声音更近更清晰、混响尾巴更突出。
     不会无限增加增益；音量滑块/M 静音始终可用。 */
  init() {
    if (this.context) { this.context.resume(); return; }
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    const c = this.context = new Context();
    c.resume();
    this.master = c.createGain(); this.master.gain.value = this.volume;
    const compressor = c.createDynamicsCompressor();
    compressor.threshold.value = -14; compressor.knee.value = 10;
    compressor.ratio.value = 5; compressor.attack.value = .015; compressor.release.value = .28;
    this.bus = c.createGain(); this.bus.connect(compressor);
    compressor.connect(this.master).connect(c.destination);
    this.createRinging(c, compressor);
    const reverb = c.createConvolver();
    const impulse = c.createBuffer(2, Math.floor(c.sampleRate * 1.65), c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = impulse.getChannelData(ch);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random()*2-1)*Math.pow(1-i/d.length, 3);
    }
    // 随机数只用于构造混响响应，本身不作为声源播放。
    reverb.buffer = impulse;
    this.wet = c.createGain(); this.wet.gain.value = .08;
    this.bus.connect(reverb); reverb.connect(this.wet).connect(compressor);
    const hum = c.createOscillator(); hum.frequency.value = 58;
    this.humGain = c.createGain(); this.humGain.gain.value = .008;
    hum.connect(this.humGain).connect(this.bus); hum.start();
    this.ready = this.load(c).catch(error => {
      document.querySelector('#audioStatus').textContent = 'Audio could not load. Check the audio folder.';
      console.warn('Ambient audio:', error);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) c.suspend(); else c.resume();
    });
  }

  /* ==================== 02B 耳鸣层：中后段逐渐浮现的细长高音 ====================
     使用两条低增益正弦音，音高轻微漂移、音量缓慢起伏。
     直接进入压缩器，不经过走廊混响，形成“耳内高音”的主观感觉。
     at 控制出现时机；gain 控制强度；frequency 控制音高。
     开头完全静音；进入安静空间后平缓消退，M 键和 Sound 滑块同样有效。 */
  createRinging(c, output) {
    this.ringing = SOUND.ringing.map(config => {
      const oscillator = c.createOscillator();
      oscillator.type = 'sine'; oscillator.frequency.value = config.frequency;
      const gain = c.createGain(); gain.gain.value = 0;
      const pan = c.createStereoPanner(); pan.pan.value = config.pan;
      oscillator.connect(gain).connect(pan).connect(output);
      oscillator.start();
      return { ...config, oscillator, gainNode: gain, panNode: pan, targetGain: 0 };
    });
  }

  async load(c) {
    const entries = await Promise.all(Object.entries(this.files).map(async ([key, promise]) => {
      const bytes = await promise;
      return [key, bytes ? await c.decodeAudioData(bytes) : null];
    }));
    this.buffers = Object.fromEntries(entries);
    if (entries.some(([, buffer]) => !buffer)) {
      document.querySelector('#audioStatus').textContent = 'Some sounds could not load. Check the audio folder.';
    }
    SOUND.layers.forEach(config => {
      if (!this.buffers[config.file]) return;
      const source = c.createBufferSource(); source.buffer = this.buffers[config.file]; source.loop = true;
      const gain = c.createGain(); gain.gain.value = 0;
      const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1300;
      const pan = c.createStereoPanner(); pan.pan.value = config.pan;
      source.connect(gain).connect(filter).connect(pan).connect(this.bus);
      source.start(0, config.offset % source.buffer.duration);
      this.layers.push({ ...config, source, gainNode: gain, filter, panNode: pan, targetGain: 0 });
    });
    this.setIntensity(this.level, this.quiet);
  }

  /* ==================== 03 渐进曲线：增加层数、清晰度与密度 ==================== */
  setIntensity(value, quiet) {
    this.level = value; this.quiet = quiet;
    if (!this.context) return;
    const now = this.context.currentTime;
    this.layers.forEach((layer, i) => {
      let t = Math.max(0, Math.min(1, (value-layer.at)/(1-layer.at)));
      t = t*t*(3-2*t);
      // 每组交谈有缓慢起伏：声音轮流突出，后期互相覆盖。
      const swell = .87 + .13*Math.sin(now*(.32+i*.045)+i*1.8);
      layer.targetGain = quiet ? 0 : (layer.base + layer.gain*t)*swell;
      layer.gainNode.gain.setTargetAtTime(layer.targetGain, now, quiet ? 1.8 : .7);
      layer.filter.frequency.setTargetAtTime(quiet ? 900 : 1400 + value*5400, now, .9);
      layer.panNode.pan.setTargetAtTime(layer.pan + .12*value*Math.sin(now*.17+i), now, .6);
    });
    this.wet.gain.setTargetAtTime(quiet ? .025 : .08 + value*.42, now, 1.3);
    this.humGain.gain.setTargetAtTime(quiet ? .003 : .008 + value*.012, now, 1);
    this.ringing.forEach((tone, i) => {
      let t = Math.max(0, Math.min(1, (value-tone.at)/(1-tone.at)));
      t = t*t*(3-2*t);
      const swell = .82 + .18*Math.sin(now*.72+i*1.9);
      tone.targetGain = quiet ? 0 : tone.gain*t*swell;
      tone.gainNode.gain.setTargetAtTime(tone.targetGain, now, quiet ? 1.6 : 1.2);
      tone.oscillator.frequency.setTargetAtTime(tone.frequency + t*(45*Math.sin(now*.31+i)+i*18), now, .65);
      tone.panNode.pan.setTargetAtTime(tone.pan + .07*t*Math.sin(now*.24+i), now, .8);
    });
  }

  setVolume(value) {
    this.volume = value;
    if (this.master) this.master.gain.setTargetAtTime(value, this.context.currentTime, .08);
  }

  /* ==================== 04 玩家脚步与互动提示音 ====================
     自己的脚步由行走距离触发；背景脚步独立运行，因此停下来仍能听见别人。 */
  step(strength = 1) {
    if (!this.context || !this.buffers.step) return;
    const source = this.context.createBufferSource(); source.buffer = this.buffers.step;
    source.playbackRate.value = .94 + Math.random()*.12;
    const gain = this.context.createGain(); gain.gain.value = .14*strength;
    source.connect(gain).connect(this.bus); source.start();
    source.onended = () => { source.disconnect(); gain.disconnect(); };
  }

  chime(index) {
    if (!this.context) return;
    const c = this.context, now = c.currentTime;
    [0, 7].forEach((offset, part) => {
      const osc = c.createOscillator(), gain = c.createGain();
      osc.type = 'sine'; osc.frequency.value = 330*Math.pow(2,(index*2+offset)/12);
      gain.gain.setValueAtTime(.0001,now);
      gain.gain.exponentialRampToValueAtTime(.055,now+.03);
      gain.gain.exponentialRampToValueAtTime(.0001,now+.8);
      osc.connect(gain).connect(this.bus); osc.start(now+part*.07); osc.stop(now+1);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    });
  }
}

const AUDIO = new Soundscape();
