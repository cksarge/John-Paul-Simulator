import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { setAnisotropy } from './textures.js';

export const PRESETS = {
  low: { renderScale: 0.75, shadows: 'off', bloom: false, ao: false, aa: 'fxaa' },
  medium: { renderScale: 1, shadows: 'low', bloom: false, ao: false, aa: 'fxaa' },
  high: { renderScale: 1.5, shadows: 'high', bloom: true, ao: false, aa: 'msaa' },
  ultra: { renderScale: 2, shadows: 'ultra', bloom: true, ao: true, aa: 'msaa' },
};

export const DEFAULT_SETTINGS = {
  preset: 'high', ...PRESETS.high,
  fov: 90, viewmodelFov: 70, sens: 1.0, scopedSens: 0.8, invertY: false,
  volume: 0.7, showFps: true, maxFps: 0, keepLoadout: false, killcam: true, menuScene: true,
  crosshairColor: '#3dff8f', crosshairSize: 6, crosshairGap: 4, crosshairThick: 2, crosshairDot: false,
};

const SHADOW_SIZE = { off: 0, low: 1024, high: 2048, ultra: 4096 };

export function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('jps_settings') || '{}') }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}
export function saveSettings(s) {
  try { localStorage.setItem('jps_settings', JSON.stringify(s)); } catch { /* storage unavailable */ }
}

// Owns the single WebGL context, post-processing chain, and per-map lighting.
export class Engine {
  constructor(container, settings) {
    this.container = container;
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    setAnisotropy(Math.min(16, this.renderer.capabilities.getMaxAnisotropy()));

    this.camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, 600);
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(settings.viewmodelFov, 1, 0.01, 10);
    this.vmScene.add(new THREE.HemisphereLight(0xdde6ff, 0x3a3228, 1.2));
    this.vmSun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.vmSun.position.set(-1, 2, 1);
    this.vmScene.add(this.vmSun);
    this.scene = new THREE.Scene();
    this.pmrem = new THREE.PMREMGenerator(this.renderer);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  // Builds sky, sun and fog for a map theme. Returns the sun light.
  setupEnvironment(scene, theme, size) {
    const sky = new Sky();
    sky.scale.setScalar(4000);
    const u = sky.material.uniforms;
    u.turbidity.value = theme.sky.turbidity;
    u.rayleigh.value = theme.sky.rayleigh;
    u.mieCoefficient.value = 0.005;
    u.mieDirectionalG.value = 0.8;
    const phi = THREE.MathUtils.degToRad(90 - theme.sky.elevation), th = THREE.MathUtils.degToRad(theme.sky.azimuth);
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, phi, th);
    u.sunPosition.value.copy(sunDir);
    scene.add(sky);

    // Image-based lighting from the same sky.
    const envScene = new THREE.Scene();
    const envSky = new Sky();
    envSky.scale.setScalar(1000);
    envSky.material.uniforms.turbidity.value = theme.sky.turbidity;
    envSky.material.uniforms.rayleigh.value = theme.sky.rayleigh;
    envSky.material.uniforms.sunPosition.value.copy(sunDir);
    envScene.add(envSky);
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(envScene, 0, 0.1, 2000);
    scene.environment = this.envRT.texture;
    scene.environmentIntensity = 0.45;
    this.vmScene.environment = this.envRT.texture;
    this.vmScene.environmentIntensity = 0.5;

    scene.fog = new THREE.FogExp2(theme.fog, theme.fogDensity);
    const [skyC, groundC, hi] = theme.hemi;
    scene.add(new THREE.HemisphereLight(skyC, groundC, hi));

    const sun = new THREE.DirectionalLight(theme.sun, theme.sunIntensity);
    const center = new THREE.Vector3(size.x / 2, 0, size.z / 2);
    sun.position.copy(center).addScaledVector(sunDir, 120);
    sun.target.position.copy(center);
    scene.add(sun, sun.target);
    const half = Math.max(size.x, size.z) * 0.72;
    const cam = sun.shadow.camera;
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half; cam.near = 1; cam.far = 300;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    this.sun = sun;
    this.vmSun.color.set(theme.sun);
    this.vmSun.position.copy(sunDir);
    this.renderer.toneMappingExposure = theme.exposure;
    this.applyShadows();
    return sun;
  }

  setScene(scene) {
    this.scene = scene;
    this.rebuildComposer();
  }

  applyShadows() {
    const size = SHADOW_SIZE[this.settings.shadows] || 0;
    this.renderer.shadowMap.enabled = size > 0;
    if (this.sun) {
      this.sun.castShadow = size > 0;
      if (size && this.sun.shadow.mapSize.x !== size) {
        this.sun.shadow.mapSize.set(size, size);
        this.sun.shadow.map?.dispose();
        this.sun.shadow.map = null;
      }
    }
    this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  }

  applySettings(s) {
    this.settings = s;
    this.camera.fov = s.fov;
    this.vmCamera.fov = s.viewmodelFov;
    this.applyShadows();
    this.resize();
    this.rebuildComposer();
  }

  rebuildComposer() {
    const s = this.settings;
    if (this.composer) this.composer.dispose();
    const pr = s.renderScale;
    const w = Math.max(1, Math.floor(innerWidth)), h = Math.max(1, Math.floor(innerHeight));
    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: s.aa === 'msaa' ? 4 : 0 });
    const composer = new EffectComposer(this.renderer, rt);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    composer.addPass(new RenderPass(this.scene, this.camera));
    if (s.ao) {
      try {
        const ao = new GTAOPass(this.scene, this.camera, w * pr, h * pr);
        ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1, scale: 1.1, samples: 12 });
        ao.blendIntensity = 0.85;
        // GTAO's depth/normal pass would treat sprites (smoke, flashes) and other transparent
        // objects as solid geometry and paint them black, so hide them while it renders.
        const renderAO = ao.render.bind(ao);
        ao.render = (...args) => {
          const hidden = [];
          this.scene.traverseVisible((o) => { if (o.isSprite || o.material?.transparent) hidden.push(o); });
          for (const o of hidden) o.visible = false;
          renderAO(...args);
          for (const o of hidden) o.visible = true;
        };
        composer.addPass(ao);
      } catch (e) { console.warn('GTAO unavailable', e); }
    }
    const vm = new RenderPass(this.vmScene, this.vmCamera);
    vm.clear = false; vm.clearDepth = true;
    composer.addPass(vm);
    if (s.bloom) composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.22, 0.5, 0.92));
    composer.addPass(new OutputPass());
    if (s.aa === 'smaa') composer.addPass(new SMAAPass());
    if (s.aa === 'fxaa') {
      const fx = new ShaderPass(FXAAShader);
      fx.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
      composer.addPass(fx);
    }
    this.composer = composer;
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(this.settings.renderScale);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.vmCamera.aspect = w / h; this.vmCamera.updateProjectionMatrix();
    if (this.composer) this.rebuildComposer();
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  clearScene() {
    this.scene.traverse((o) => {
      if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
    });
    this.scene = new THREE.Scene();
    this.vmScene.children.filter((c) => !c.isLight).forEach((c) => c.removeFromParent());
    if (this.composer) { this.composer.dispose(); this.composer = null; }
    this.sun = null;
  }
}
