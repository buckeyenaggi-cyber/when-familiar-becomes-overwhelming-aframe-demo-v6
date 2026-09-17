/* ==================== 01 感官过载的视觉隐喻 ====================
   日常环境逐渐变得难以筛选：焦点游移、轮廓重复、亮部扩散，最后过曝。
   这里不使用电视雪花、扫描线、横向撕裂或 RGB 分离。
   strength（0—1）由路线进度控制；不会因等待而在开头突然发作。
   这些是艺术表达，并不是所有自闭症人士的实际视觉体验。 */
AFRAME.registerComponent("sensory-fx", {
  init() {
    this.strength = 0;
    this.whiteLevel = 0;
    this.endingAt = null;
    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.onRenderStart = () => this.setup();
    this.el.addEventListener("renderstart", this.onRenderStart, { once: true });
    if (this.el.renderer) this.setup();
  },

  // 05 单次屏幕后处理：只渲染一份模型，控制显卡开销。
  setup() {
    if (this.renderer) return;
    const T = AFRAME.THREE;
    const renderer = this.el.renderer;
    if (!renderer) return;
    this.renderer = renderer;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    this.size = new T.Vector2();
    this.target = new T.WebGLRenderTarget(1, 1, { depthBuffer: true });
    this.target.texture.colorSpace = T.SRGBColorSpace;
    this.uniforms = {
      frame: { value: this.target.texture },
      intensity: { value: 0 },
      seconds: { value: 0 },
      resolution: { value: new T.Vector2(1, 1) }
    };
    this.material = new T.ShaderMaterial({
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      vertexShader: `
        varying vec2 uvScreen;
        void main() {
          uvScreen = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D frame;
        uniform float intensity;
        uniform float seconds;
        uniform vec2 resolution;
        varying vec2 uvScreen;

        vec3 sampleFrame(vec2 p) { return texture2D(frame, clamp(p, vec2(.001), vec2(.999))).rgb; }

        void main() {
          float mild = smoothstep(.12, .65, intensity);
          float strong = smoothstep(.38, 1.0, intensity);
          float peak = smoothstep(.72, 1.0, intensity);
          vec2 centre = uvScreen - .5;
          vec2 p = uvScreen;

          // 02 空间扭曲：从中段加入，后段加强。只改变画面，不改变空气墙或脚底位置。
          // late 控制出现阶段；下方 .095/.022/.013 是拉伸、倾斜和波动幅度。
          // 中央区域变化较少，保留互动目标；外围出现缓慢弯曲和不对称挤压。
          float late = smoothstep(.34, .95, intensity);
          float edge = smoothstep(.10, .60, length(centre));
          float lens = sin(seconds*.57)*.095*late;
          vec2 bent = centre*(1.0 + lens*edge);
          float tilt = sin(seconds*.39)*.022*late;
          bent = mat2(cos(tilt), -sin(tilt), sin(tilt), cos(tilt))*bent;
          bent.x *= 1.0 + sin(seconds*.67)*.028*late;
          bent.y *= 1.0 - sin(seconds*.67)*.018*late;
          p = .5 + bent;
          p.x += sin(seconds*.63 + centre.y*7.0)*.013*late*edge;
          p.y += sin(seconds*.48 + centre.x*8.0)*.008*late*edge;

          // 03 失焦与轮廓重复：正常画面仍在，多份同色轮廓开始争夺注意力。
          float focus = .55 + .45*sin(seconds*.83);
          vec2 radius = vec2(1.0/resolution.x, 1.0/resolution.y)*(1.0+strong*(3.0+focus*8.0));
          vec3 base = sampleFrame(p);
          vec3 soft = base*.2;
          soft += (sampleFrame(p+vec2(radius.x,0))+sampleFrame(p-vec2(radius.x,0)))*.15;
          soft += (sampleFrame(p+vec2(0,radius.y))+sampleFrame(p-vec2(0,radius.y)))*.15;
          soft += (sampleFrame(p+radius)+sampleFrame(p-radius))*.10;
          vec3 c = mix(base, soft, mild*.86);
          vec2 drift = vec2(.008+.023*strong, .009*sin(seconds*.49))*strong;
          vec3 echo = sampleFrame(p+drift)*.55 + sampleFrame(p-drift*.8)*.45;
          c = mix(c, echo, strong*.40);
          vec3 repeated = sampleFrame(.5+(p-.5)*(.95-.025*peak));
          c = mix(c, repeated, peak*.17);

          // 04 眩光：场景本身的亮部扩散，背景亮度压过前景；无随机噪点。
          vec2 halo = vec2(.014*strong);
          vec3 light = (sampleFrame(p+halo)+sampleFrame(p-halo)+
                        sampleFrame(p+vec2(halo.x,-halo.y))+sampleFrame(p+vec2(-halo.x,halo.y)))*.25;
          c += max(light-vec3(.35),vec3(0.0))*(.7*strong + .7*peak);
          c *= 1.0 + strong*.22;
          float luma = dot(c, vec3(.2126,.7152,.0722));
          c = mix(vec3(luma),c,1.0 + .16*mild - .36*peak);
          gl_FragColor = vec4(max(c, vec3(0.0)), 1.0);
          #include <colorspace_fragment>
        }`
    });
    this.screen = new T.Scene();
    this.quad = new T.Mesh(new T.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.screen.add(this.quad);
    this.camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.originalRender = renderer.render;
    this.renderScene = renderer.render.bind(renderer);
    this.wrappedRender = (scene, camera) => {
      // 桌面使用后处理；头显模式仍由 A-Frame 原生立体渲染。
      if (scene !== this.el.object3D || renderer.xr.isPresenting || this.strength < .002) {
        return this.renderScene(scene, camera);
      }
      renderer.getDrawingBufferSize(this.size);
      const scale = Math.min(1, 1600 / Math.max(this.size.x, this.size.y));
      const width = Math.max(1, Math.round(this.size.x * scale));
      const height = Math.max(1, Math.round(this.size.y * scale));
      if (this.target.width !== width || this.target.height !== height) {
        this.target.setSize(width, height);
        this.uniforms.resolution.value.set(width, height);
      }
      const previousTarget = renderer.getRenderTarget();
      renderer.setRenderTarget(this.target);
      this.renderScene(scene, camera);
      renderer.setRenderTarget(previousTarget);
      this.renderScene(this.screen, this.camera);
    };
    renderer.render = this.wrappedRender;
  },

  // 06 终点白场：缓慢到达全白，停留片刻，再慢慢恢复安静空间。
  beginEnding() {
    if (this.endingAt === null) {
      this.endingAt = performance.now();
      this.endingFrom = this.whiteLevel;
    }
  },

  tick(time, deltaMs = 16.67) {
    const strength = this.reducedMotion ? this.strength * .7 : this.strength;
    if (this.uniforms) {
      this.uniforms.intensity.value = strength;
      this.uniforms.seconds.value = time / 1000 * (this.reducedMotion ? .25 : 1);
    }
    // 沿路线逐渐变白；不用正弦明暗循环，因此不会周期性一闪一灭。
    const peak = Math.max(0, Math.min(1, (this.strength-.64)/.36));
    let target = peak*peak*(3-2*peak)*.76;
    if (this.endingAt !== null) {
      const elapsed = (performance.now()-this.endingAt)/1000;
      const ease = v => { const t=Math.max(0,Math.min(1,v)); return t*t*(3-2*t); };
      if (elapsed < 4) target = this.endingFrom + (1-this.endingFrom)*ease(elapsed/4);
      else if (elapsed < 5.2) target = 1;
      else if (elapsed < 10.2) target = 1-ease((elapsed-5.2)/5);
      else this.endingAt = null;
      this.whiteLevel = target;
    } else {
      this.whiteLevel += (target-this.whiteLevel)*(1-Math.exp(-Math.min(deltaMs/1000,.1)*1.25));
    }
    document.documentElement.style.setProperty("--whiteout", this.whiteLevel.toFixed(3));
  },

  remove() {
    this.el.removeEventListener("renderstart", this.onRenderStart);
    if (this.renderer && this.renderer.render === this.wrappedRender) this.renderer.render = this.originalRender;
    if (this.target) this.target.dispose();
    if (this.material) this.material.dispose();
    if (this.quad) this.quad.geometry.dispose();
    document.documentElement.style.setProperty("--whiteout", "0");
  }
});
