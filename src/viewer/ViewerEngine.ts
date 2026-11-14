import {
  AmbientLight,
  Box3,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PointLight,
  Scene,
  ShadowMaterial,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  computeStats,
  disposeObject,
  fitDistance,
  normalizeScale,
  type ModelStats,
} from './helpers';

/** Longest side of a loaded model, in scene units. The pedestal is 1.7 units in radius. */
const MODEL_SIZE = 2.4;
const FOV = 38;
const PEDESTAL_RADIUS = 1.7;
const PEDESTAL_HEIGHT = 0.4;

export class ViewerEngine {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(FOV, 1, 0.05, 100);
  readonly controls: OrbitControls;

  private readonly modelHolder = new Group();
  private model: Object3D | null = null;
  private stats: ModelStats | null = null;
  private wireframe = false;
  private flat = false;
  private raf = 0;
  private running = false;
  private disposed = false;
  private readonly resizeObserver: ResizeObserver;
  private readonly home = { position: new Vector3(), target: new Vector3() };

  constructor(private readonly container: HTMLElement) {
    this.renderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    this.buildPedestal();
    this.buildLights();
    this.scene.add(this.modelHolder);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 20;
    this.controls.maxPolarAngle = Math.PI * 0.495; // never dip under the pedestal
    this.controls.autoRotateSpeed = 2.2;

    this.setHomeView(1.5, MODEL_SIZE * 0.3);
    this.resetView();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  // ---- scene setup -------------------------------------------------------

  private buildPedestal() {
    const top = new Mesh(
      new CylinderGeometry(PEDESTAL_RADIUS, PEDESTAL_RADIUS, 0.18, 48),
      new MeshStandardMaterial({ color: new Color('#9b7bff'), roughness: 0.55 }),
    );
    top.position.y = -0.09;
    top.receiveShadow = true;

    const base = new Mesh(
      new CylinderGeometry(
        PEDESTAL_RADIUS + 0.12,
        PEDESTAL_RADIUS + 0.2,
        PEDESTAL_HEIGHT - 0.18,
        48,
      ),
      new MeshStandardMaterial({ color: new Color('#ff6b9d'), roughness: 0.6 }),
    );
    base.position.y = -0.18 - (PEDESTAL_HEIGHT - 0.18) / 2;
    base.receiveShadow = true;

    // Soft contact shadow that only draws where the model blocks the key light.
    const shadow = new Mesh(
      new CircleGeometry(PEDESTAL_RADIUS, 48),
      new ShadowMaterial({ opacity: 0.28 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.002;
    shadow.receiveShadow = true;

    this.scene.add(top, base, shadow);
  }

  private buildLights() {
    this.scene.add(new AmbientLight('#ffffff', 0.7));
    this.scene.add(new HemisphereLight('#ffffff', '#b9a8ff', 0.9));

    const key = new DirectionalLight('#ffffff', 2.2);
    key.position.set(3, 5, 2.5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.radius = 5;
    key.shadow.bias = -0.0004;
    const s = 3;
    Object.assign(key.shadow.camera, {
      left: -s,
      right: s,
      top: s,
      bottom: -s,
      near: 0.5,
      far: 14,
    });
    this.scene.add(key);

    // Colored rim lights from behind and the sides.
    const pink = new PointLight('#ff6b9d', 18, 12, 2);
    pink.position.set(-3, 1.6, -2.4);
    const sky = new PointLight('#4dabf7', 18, 12, 2);
    sky.position.set(3, 1.6, -2.6);
    const mint = new PointLight('#3dd9b0', 8, 10, 2);
    mint.position.set(0, 0.6, 3.2);
    this.scene.add(pink, sky, mint);
  }

  // ---- loop --------------------------------------------------------------

  start() {
    if (this.running || this.disposed) return;
    this.running = true;
    const tick = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---- camera ------------------------------------------------------------

  private setHomeView(radius: number, centerY: number) {
    const dist = fitDistance(radius, FOV, this.camera.aspect);
    // Look slightly down at the model from the front-right.
    const dir = new Vector3(0.55, 0.38, 1).normalize();
    this.home.target.set(0, centerY, 0);
    this.home.position.copy(dir.multiplyScalar(dist)).add(this.home.target);
  }

  resetView() {
    this.camera.position.copy(this.home.position);
    this.controls.target.copy(this.home.target);
    this.controls.update();
  }

  setAutoRotate(on: boolean) {
    this.controls.autoRotate = on;
  }

  // ---- model -------------------------------------------------------------

  /** Replace the current model. The previous one is disposed first. */
  setModel(object: Object3D, bytes: number) {
    this.clearModel();

    // Center on the pedestal, rest on its top, and normalize the size.
    const box = new Box3().setFromObject(object);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const scale = normalizeScale(Math.max(size.x, size.y, size.z), MODEL_SIZE);

    const wrapper = new Group();
    wrapper.add(object);
    object.position.set(-center.x, -box.min.y, -center.z);
    wrapper.scale.setScalar(scale);

    wrapper.traverse((o) => {
      if (o instanceof Mesh) {
        o.castShadow = true;
        o.receiveShadow = false;
      }
    });

    this.modelHolder.add(wrapper);
    this.model = wrapper;
    this.stats = computeStats(object, bytes);
    this.applyMaterialModes();

    const height = size.y * scale;
    const radius = Math.max(1.5, height / 2 + 0.3);
    this.setHomeView(radius, height / 2);
    this.resetView();
  }

  clearModel() {
    if (!this.model) return;
    this.modelHolder.remove(this.model);
    disposeObject(this.model);
    this.model = null;
    this.stats = null;
  }

  getStats(): ModelStats | null {
    return this.stats;
  }

  // ---- display modes -----------------------------------------------------

  setWireframe(on: boolean) {
    this.wireframe = on;
    this.applyMaterialModes();
  }

  setFlatShading(on: boolean) {
    this.flat = on;
    this.applyMaterialModes();
  }

  private applyMaterialModes() {
    if (!this.model) return;
    const seen = new Set<Material>();
    this.model.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (seen.has(m)) continue;
        seen.add(m);
        const mat = m as Material & { wireframe?: boolean; flatShading?: boolean };
        if ('wireframe' in mat) mat.wireframe = this.wireframe;
        if ('flatShading' in mat) {
          mat.flatShading = this.flat;
          mat.needsUpdate = true;
        }
      }
    });
  }

  /** Exposed for the dev-only leak check. */
  memoryInfo() {
    const { geometries, textures } = this.renderer.info.memory;
    return { geometries, textures, programs: this.renderer.info.programs?.length ?? 0 };
  }

  // ---- teardown ----------------------------------------------------------

  dispose() {
    this.disposed = true;
    this.stop();
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.clearModel();
    this.scene.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as Material | Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
