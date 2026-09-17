/* ==================== 01 总配置：路线、物体、门和阶段 ====================
   模型只加载一次。坐标单位为米；Y 是高度，Z 越小越接近结尾。
   要移动某个互动点/门，优先改这里，不需要改下面的运行逻辑。
   path.width 是中心线到两侧空气墙的距离；碰撞检测时再扣除玩家半径。 */
const WORLD = {
  start: { x: 8.0, z: 77.35 },
  eyeHeight: 1.62,
  // 正常开头位于 Z≈77，沿扫描走廊向 Z≈-18 前进，最后进入安静空间。
  path: [
    { x: 8.0, z: 77.6, width: 1.15 },
    { x: 7.65, z: 66.5, width: 1.15 },
    { x: 1.0, z: 60.0, width: 1.08 },
    { x: 0.35, z: 16.0, width: 1.02 },
    { x: 1.55, z: 11.5, width: 1.12 },
    { x: 1.55, z: -17.8, width: 1.12 },
    { x: 1.55, z: -25.3, width: 1.95 }
  ],
  objects: [
    { x: 7.95, y: 1.05, z: 74.95 },
    { x: 6.15, y: 1.35, z: 65.0 },
    { x: 0.35, y: 0.43, z: 27.0 },
    { x: 1.55, y: 1.15, z: -15.0 }
  ],
  doors: [
    { x: 7.95, z: 73.0 },
    { x: 0.96, z: 59.6 },
    { x: 1.05, z: 13.3 },
    { x: 1.55, z: -17.8 }
  ],
  stages: [
    { z: Infinity, number: "01", name: "FAMILIAR" },
    { z: 72.3, number: "02", name: "SLIGHTLY WRONG" },
    { z: 58.9, number: "03", name: "UNSTABLE" },
    { z: 12.6, number: "04", name: "OVERWHELMING" },
    { z: -8, number: "05", name: "UNRECOGNIZABLE" },
    { z: -18.5, number: "06", name: "REGULATION" }
  ],
  thresholdNames: ["Slightly Wrong", "Unstable", "Overwhelming", "Regulation"]
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/* ==================== 02 空气墙：按走廊中心线限制通行 ====================
   把相邻点连成通道，转弯处自动重叠，避免穿墙或掉出扫描地面。 */
function insidePath(x, z, radius = 0.3) {
  return WORLD.path.slice(1).some((end, i) => {
    const start = WORLD.path[i], dx = end.x - start.x, dz = end.z - start.z;
    const t = clamp(((x - start.x) * dx + (z - start.z) * dz) / (dx * dx + dz * dz), 0, 1);
    const width = start.width + (end.width - start.width) * t;
    return Math.hypot(x - start.x - dx * t, z - start.z - dz * t) <= width - radius;
  });
}

/* ==================== 03 行走控制：加减速、碰撞、脚步起伏和鼠标朝向 ==================== */
AFRAME.registerComponent("walk-controls", {
  schema: {
    speed: { default: 2.25 },
    acceleration: { default: 9.5 },
    damping: { default: 8.5 },
    radius: { default: 0.3 }
  },

  init() {
    this.keys = new Set();
    this.velocity = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.walkDistance = 0;
    this.camera = document.querySelector("#camera");
    this.cameraObject = null;
    this.game = null;
    this.onKeyDown = event => this.keys.add(event.code);
    this.onKeyUp = event => this.keys.delete(event.code);
    this.onBlur = () => { this.keys.clear(); this.velocity.set(0, 0, 0); };
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  },

  remove() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
  },

  isAllowed(x, z) {
    const r = this.data.radius;
    if (!insidePath(x, z, r)) return false;
    if (!this.game) return true;
    return !this.game.isDoorBlocking(x, z, r) && !this.game.isBenchBlocking(x, z, r);
  },

  tick(time, deltaMs) {
    if (!document.body.classList.contains("is-playing")) return;
    if (!this.game) this.game = document.querySelector("#scene").components["game-manager"];
    const dt = Math.min(deltaMs / 1000, 0.05);
    if (!dt || !this.camera) return;

    const xInput = (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) -
      (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0);
    const zInput = (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0) -
      (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0);

    if (!this.cameraObject) this.cameraObject = this.camera.getObject3D("camera");
    if (!this.cameraObject) return;
    this.cameraObject.getWorldDirection(this.forward);
    this.forward.y = 0;
    this.forward.normalize();
    this.right.set(-this.forward.z, 0, this.forward.x);
    this.direction.set(0, 0, 0)
      .addScaledVector(this.forward, zInput)
      .addScaledVector(this.right, xInput);
    if (this.direction.lengthSq() > 1) this.direction.normalize();

    const targetX = this.direction.x * this.data.speed;
    const targetZ = this.direction.z * this.data.speed;
    const blend = 1 - Math.exp(-(this.direction.lengthSq() ? this.data.acceleration : this.data.damping) * dt);
    this.velocity.x += (targetX - this.velocity.x) * blend;
    this.velocity.z += (targetZ - this.velocity.z) * blend;

    const position = this.el.object3D.position;
    const dx = this.velocity.x * dt;
    const dz = this.velocity.z * dt;
    if (this.isAllowed(position.x + dx, position.z)) position.x += dx;
    else this.velocity.x = 0;
    if (this.isAllowed(position.x, position.z + dz)) position.z += dz;
    else this.velocity.z = 0;

    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.walkDistance += speed * dt;
    const bob = speed > 0.12 ? Math.sin(this.walkDistance * 9.5) * Math.min(speed / this.data.speed, 1) : 0;
    this.camera.object3D.position.y = WORLD.eyeHeight + bob * 0.022;
    const intensity = this.game ? this.game.overload : 0;
    // 中后段的视野像呼吸一样缓慢收放；不转动玩家方向，也不让人物上下穿模。
    const late = clamp((intensity - .34) / .66, 0, 1);
    const breathing = late * late * (Math.sin(time * .00072) * 3.2 + Math.sin(time * .00113) * .6);
    const fov = 72 + Math.min(speed / this.data.speed, 1) * 1.2 + breathing;
    if (Math.abs(this.cameraObject.fov - fov) > 0.06) {
      this.cameraObject.fov = fov;
      this.cameraObject.updateProjectionMatrix();
    }

    const stepIndex = Math.floor(this.walkDistance / 0.72);
    if (stepIndex !== this.lastStepIndex && speed > 0.6) {
      this.lastStepIndex = stepIndex;
      AUDIO.step(Math.min(speed / this.data.speed, 1));
    }
  }
});

/* ==================== 04 引导灯：只有下一个互动目标亮起 ==================== */
AFRAME.registerComponent("beacon-state", {
  schema: { active: { default: false } },

  init() {
    this.setActive(this.data.active);
  },

  setActive(active) {
    this.active = active;
    this.el.classList.toggle("locked", !active);
    const core = this.el.querySelector(".beacon-core");
    const ring = this.el.querySelector(".beacon-ring");
    const light = this.el.querySelector(".beacon-light");
    if (core) {
      if (active) core.setAttribute("material", "color", "#ffb66a");
      core.setAttribute("material", "emissiveIntensity", active ? 1 : 0.12);
      core.setAttribute("animation__pulse", active ? {
        property: "scale", from: "0.88 0.88 0.88", to: "1.13 1.13 1.13",
        dir: "alternate", loop: true, dur: 1250, easing: "easeInOutSine"
      } : { property: "scale", to: "1 1 1", dur: 240 });
    }
    if (ring) {
      ring.setAttribute("material", "opacity", active ? 0.82 : 0.14);
      ring.setAttribute("animation__spin", active ? {
        property: "rotation", to: "90 360 0", loop: true, dur: 5200, easing: "linear"
      } : { property: "rotation", to: "90 0 0", dur: 200 });
    }
    if (light) light.setAttribute("light", "intensity", active ? 1.05 : 0);
  }
});

/* ==================== 05 触碰检测：靠近当前目标即触发，不能跳过顺序 ==================== */
AFRAME.registerComponent("touch-trigger", {
  schema: {
    index: { type: "int" },
    radius: { default: 1.1 }
  },

  init() {
    this.player = document.querySelector("#player");
    this.game = null;
    this.worldPosition = new THREE.Vector3();
    this.triggered = false;
  },

  tick() {
    if (this.triggered || !document.body.classList.contains("is-playing")) return;
    if (!this.game) this.game = document.querySelector("#scene").components["game-manager"];
    if (!this.game || this.game.activeObject !== this.data.index) return;
    this.el.object3D.getWorldPosition(this.worldPosition);
    const playerPosition = this.player.object3D.position;
    const distance = Math.hypot(this.worldPosition.x - playerPosition.x, this.worldPosition.z - playerPosition.z);
    if (distance <= this.data.radius) {
      this.triggered = true;
      this.game.collect(this.data.index);
    }
  }
});

/* ==================== 06 互动反馈：纸张展开、长椅移开、灯光回应 ==================== */
AFRAME.registerComponent("object-reaction", {
  schema: { index: { type: "int" } },

  complete() {
    const beacon = this.el.components["beacon-state"];
    if (beacon) beacon.setActive(false);
    this.el.classList.add("completed");
    const core = this.el.querySelector(".beacon-core");
    if (core) {
      core.setAttribute("material", "color", this.data.index === 3 ? "#d7fff2" : "#fff1d9");
      core.setAttribute("material", "emissive", this.data.index === 3 ? "#8fe2ca" : "#ff9d62");
      core.setAttribute("material", "emissiveIntensity", 0.85);
    }

    if (this.data.index === 1) {
      const left = this.el.querySelector(".paper-a");
      const right = this.el.querySelector(".paper-b");
      left.setAttribute("animation__move", "property: position; to: -1.15 0.4 0; dur: 900; easing: easeOutCubic");
      left.setAttribute("animation__turn", "property: rotation; to: 0 25 -18; dur: 900; easing: easeOutCubic");
      right.setAttribute("animation__move", "property: position; to: 1.15 -0.12 0; dur: 900; easing: easeOutCubic");
      right.setAttribute("animation__turn", "property: rotation; to: 0 -25 18; dur: 900; easing: easeOutCubic");
    }
    if (this.data.index === 2) {
      const strip = this.el.querySelector(".signal-strip");
      strip.setAttribute("material", "color", "#fff0dc");
      strip.setAttribute("material", "emissiveIntensity", 1.2);
      strip.setAttribute("animation__stretch", "property: scale; from: 0.05 1 1; to: 1 1 1; dur: 850; easing: easeOutCubic");
      this.el.setAttribute("animation__clear", "property: position.x; to: -1.12; dur: 950; easing: easeInOutCubic");
    }
  }
});

/* ==================== 07 门与转场：门打开后才能走过 ==================== */
AFRAME.registerComponent("transition-door", {
  schema: { index: { type: "int" } },

  init() {
    this.isOpen = false;
    this.crossed = false;
  },

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.openedAt = performance.now();
    this.el.classList.add("open");
    const left = this.el.querySelector(".door-left");
    const right = this.el.querySelector(".door-right");
    left.setAttribute("animation__open", "property: position; to: -2.7 0 0; dur: 1050; easing: easeInOutCubic");
    right.setAttribute("animation__open", "property: position; to: 2.7 0 0; dur: 1050; easing: easeInOutCubic");
  },

  tick() {
    if (!this.isOpen || this.crossed || performance.now() - this.openedAt < 1000) return;
    const player = document.querySelector("#player").object3D.position;
    if (player.z < this.el.object3D.position.z - 0.65) {
      this.crossed = true;
      const game = document.querySelector("#scene").components["game-manager"];
      game.showThreshold(this.data.index);
    }
  }
});

/* ==================== 08 体验管理：串联路线进度、声音、视觉和界面 ==================== */
AFRAME.registerComponent("game-manager", {
  init() {
    this.ready = false;
    if (this.el.hasLoaded) this.setup();
    else this.el.addEventListener("loaded", () => this.setup(), { once: true });
  },

  setup() {
    this.activeObject = 0;
    this.completed = 0;
    this.highestStage = 0;
    this.overload = 0;
    this.maxProgress = 0;
    this.lastUI = -1000;
    this.quiet = false;
    this.lastLockedMessage = 0;
    this.player = document.querySelector("#player");
    this.worldLight = document.querySelector("#worldLight");
    this.message = document.querySelector("#message");
    this.stageNumber = document.querySelector("#stageNumber");
    this.stageName = document.querySelector("#stageName");
    this.dots = [...document.querySelectorAll("#progressDots i")];
    this.entry = document.querySelector("#entry");
    this.enterButton = document.querySelector("#enterButton");
    this.loadText = document.querySelector("#loadText");
    this.loadBar = document.querySelector("#loadBar");
    this.thresholdCard = document.querySelector("#thresholdCard");
    this.fade = document.querySelector("#fade");

    this.player.object3D.position.set(WORLD.start.x, 0, WORLD.start.z);
    WORLD.objects.forEach((point, i) => document.querySelector(`#object${i}`).setAttribute("position", point));
    WORLD.doors.forEach((point, i) => document.querySelector(`#door${i}`).setAttribute("position", { x: point.x, y: 1.35, z: point.z }));
    this.doors = WORLD.doors.map((_, i) => document.querySelector(`#door${i}`).components["transition-door"]);
    this.bench = document.querySelector("#object2");
    this.fogNormal = new THREE.Color("#11151a");
    this.fogPeak = new THREE.Color("#d7d4cd");
    this.lightNormal = new THREE.Color("#fff5e8");
    this.lightRed = new THREE.Color("#fff2dc");
    this.lightCyan = new THREE.Color("#e2efff");
    this.lightMix = new THREE.Color();

    const corridor = document.querySelector("#corridor");
    corridor.addEventListener("model-loaded", () => this.modelReady());
    corridor.addEventListener("model-error", event => this.modelError(event));
    if (corridor.getObject3D("mesh")) this.modelReady();
    this.enterButton.addEventListener("click", () => this.start());
    const volume = document.querySelector('#volume');
    volume.addEventListener('input', () => AUDIO.setVolume(Number(volume.value)));
    window.addEventListener('keydown', event => {
      if (event.code !== 'KeyM' || event.repeat || event.target.tagName === 'INPUT') return;
      const next = AUDIO.volume > 0 ? 0 : SOUND.volume;
      volume.value = next; AUDIO.setVolume(next);
    });
    this.updateDots();
    this.addDebugZones();
    this.ready = true;
  },

  modelReady() {
    this.loadText.textContent = "Ready · Follow the breathing light";
    this.loadBar.classList.add("is-ready");
    this.enterButton.disabled = false;
    // 在最后一道门后裁切扫描模型，让安静空间接在实际路线末端。
    const mesh = document.querySelector("#corridor").getObject3D("mesh");
    if (mesh) mesh.traverse(child => {
      if (!child.isMesh) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach(material => {
        // 修正扫描材质的默认金属度，避免未设置环境贴图时墙面变黑。
        material.metalness = 0;
        material.roughness = 1;
        material.emissiveMap = material.map;
        material.emissive.set("#ffffff");
        material.emissiveIntensity = 0.22;
        material.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 0, 1), -WORLD.doors[3].z + 0.2)];
        material.needsUpdate = true;
      });
    });
    if (this.el.renderer) this.el.renderer.localClippingEnabled = true;
  },

  modelError(event) {
    console.error("Corridor model failed to load", event.detail);
    this.loadText.textContent = "The corridor could not load. Run this folder through a local server.";
  },

  start() {
    AUDIO.init();
    document.body.classList.add("is-playing");
    this.entry.classList.add("is-hidden");
    this.message.textContent = "Follow the breathing light.";
    const canvas = this.el.canvas;
    if (canvas && canvas.requestPointerLock) {
      const lock = canvas.requestPointerLock();
      if (lock && lock.catch) lock.catch(() => {}); // 无法锁定鼠标时，仍可按住拖动。
    }
  },

  isDoorBlocking(x, z, radius) {
    return WORLD.doors.some((door, index) => {
      const component = this.doors[index];
      if (component && component.isOpen && performance.now() - component.openedAt > 1000) return false;
      // 门关闭时挡住整个通道截面，不能从门边绕过。
      return Math.abs(z - door.z) < 0.22 + radius;
    });
  },

  isBenchBlocking(x, z, radius) {
    const p = this.bench.object3D.position;
    return Math.abs(x - p.x) < 0.7 + radius && Math.abs(z - p.z) < 0.36 + radius;
  },

  collect(index) {
    if (index !== this.activeObject) return;
    const object = document.querySelector(`#object${index}`);
    const reaction = object.components["object-reaction"];
    const door = document.querySelector(`#door${index}`).components["transition-door"];
    if (reaction) reaction.complete();
    if (door) door.open();
    AUDIO.chime(index);

    this.completed = index + 1;
    this.activeObject = index + 1;
    this.dots[index].classList.add("done");
    if (index < 3) {
      const next = document.querySelector(`#object${index + 1}`);
      next.components["beacon-state"].setActive(true);
      this.message.textContent = "A door opened. The next light is now awake.";
    } else {
      this.message.textContent = "The final threshold is open. Follow the cool light.";
    }
    this.updateDots();
  },

  updateDots() {
    this.dots.forEach((dot, index) => {
      dot.classList.toggle("done", index < this.completed);
      dot.classList.toggle("active", index === this.activeObject && index < 4);
    });
  },

  showThreshold(index) {
    if (index === 3) {
      this.endingAt = performance.now();
      this.el.components["sensory-fx"].beginEnding();
      this.message.textContent = "Keep following the light. Let the scene settle.";
      return;
    }
    this.fade.classList.remove("flash");
    this.thresholdCard.classList.remove("show");
    void this.fade.offsetWidth;
    this.fade.classList.add("flash");
    this.thresholdCard.querySelector("span").textContent = WORLD.thresholdNames[index];
    this.thresholdCard.classList.add("show");

  },

  stageForZ(z) {
    let stage = 0;
    WORLD.stages.forEach((item, index) => { if (z <= item.z) stage = index; });
    return stage;
  },

  addDebugZones() {
    if (!new URLSearchParams(location.search).has("debug")) return;
    WORLD.path.slice(1).forEach((end, index) => {
      const start = WORLD.path[index];
      const box = document.createElement("a-box");
      box.setAttribute("position", `${(start.x + end.x) / 2} 0.15 ${(start.z + end.z) / 2}`);
      box.setAttribute("rotation", `0 ${Math.atan2(end.x - start.x, end.z - start.z) * 180 / Math.PI} 0`);
      box.setAttribute("width", start.width + end.width);
      box.setAttribute("height", 0.04);
      box.setAttribute("depth", Math.hypot(end.x - start.x, end.z - start.z));
      box.setAttribute("material", "wireframe: true; color: #39ffb6; transparent: true; opacity: 0.3");
      this.el.appendChild(box);
    });
  },

  tick(time, deltaMs) {
    if (!this.ready || !document.body.classList.contains("is-playing")) return;
    const position = this.player.object3D.position;
    const stage = this.stageForZ(position.z);
    this.highestStage = Math.max(this.highestStage, Math.min(stage, 4));
    // 09 终点留出 4 秒缓慢白场，再降低刺激；不会刚过门就突然恢复正常。
    const wasQuiet = this.quiet;
    const endingReady = this.endingAt !== undefined && performance.now()-this.endingAt >= 4000;
    this.quiet = position.z < WORLD.stages[5].z && this.completed === 4 && endingReady;
    if (this.quiet && !wasQuiet) this.message.textContent = "Stay here. Let the sounds fall away.";
    const progress = clamp((WORLD.start.z - position.z) / (WORLD.start.z + 15), 0, 1);
    this.maxProgress = Math.max(this.maxProgress, progress);
    const target = this.quiet ? 0 : Math.max(Math.pow(this.maxProgress, 1.2), this.completed * 0.08);
    this.overload += (target - this.overload) * (1 - Math.exp(-Math.min(deltaMs / 1000, 0.06) * 1.4));
    const fx = this.el.components["sensory-fx"];
    if (fx) fx.strength = this.overload;

    // 10 声画共用 overload 曲线；界面与音频参数每 140 毫秒更新一次。
    if (time - this.lastUI < 140) return;
    this.lastUI = time;
    const label = WORLD.stages[this.quiet ? 5 : this.highestStage];
    this.stageNumber.textContent = label.number;
    this.stageName.textContent = label.name;
    document.body.classList.toggle("is-quiet", this.quiet);
    document.documentElement.style.setProperty("--overload", this.overload.toFixed(3));
    AUDIO.setIntensity(this.overload, this.quiet);
    const fog = this.el.object3D.fog;
    if (fog) {
      fog.density = this.quiet ? 0.002 : 0.006 + this.overload * 0.009;
      fog.color.copy(this.fogNormal).lerp(this.fogPeak, this.overload);
    }
    const light = this.worldLight.getObject3D("light");
    if (light) {
      this.lightMix.copy(this.lightRed).lerp(this.lightCyan, 0.5 + 0.5 * Math.sin(time * 0.0009));
      light.color.copy(this.lightNormal).lerp(this.lightMix, this.overload * this.overload);
    }

    const nextDoor = WORLD.doors[this.activeObject];
    if (nextDoor && Math.abs(position.z - nextDoor.z) < 2.2 && performance.now() - this.lastLockedMessage > 2200) {
      this.message.textContent = "This threshold is waiting for the lit object behind you.";
      this.lastLockedMessage = performance.now();
    }
  }
});
