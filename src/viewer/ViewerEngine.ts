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
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  PointLight,
  Raycaster,
  SkinnedMesh,
  Scene,
  ShadowMaterial,
  Vector2,
  Vector3,
  BufferAttribute,
  BufferGeometry,
  WebGLRenderer,
} from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { CraftObjectInfo } from '../craft/builder/object';
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
  /** The loaded object inside `model`, and the scale applied to its wrapper. */
  private modelObject: Object3D | null = null;
  private modelScale = 1;
  private processed: Object3D | null = null;
  private viewMode: 'original' | 'lowpoly' | 'split' = 'original';
  private splitRatio = 0.5;
  private size = { w: 1, h: 1 };
  private updater: ((seconds: number, craft: CraftObjectInfo | null) => void) | null = null;
  private readonly startedAt = performance.now();
  private gizmo: TransformControls | null = null;
  private readonly gizmoProxy = new Object3D();
  private gizmoListener: GizmoListener | null = null;
  private gizmoDragging = false;
  private highlight: Mesh | null = null;
  private readonly raycaster = new Raycaster();
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
    this.renderer.shadowMap.type = PCFShadowMap;
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
      this.renderFrame();
    };
    tick();
  }

  private renderFrame() {
    if (this.updater) {
      const craft = (this.modelObject?.userData.craft as CraftObjectInfo | undefined) ?? null;
      this.updater((performance.now() - this.startedAt) / 1000, craft);
    }
    const original = this.model;
    const processed = this.processed;
    if (!(this.viewMode === 'split' && original && processed)) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    // Before/after: draw the scene twice, each time clipped to one side of the divider.
    const { w, h } = this.size;
    const cut = Math.round(w * this.splitRatio);
    const r = this.renderer;
    r.setScissorTest(true);
    original.visible = true;
    processed.visible = false;
    r.setViewport(0, 0, w, h);
    r.setScissor(0, 0, cut, h);
    r.render(this.scene, this.camera);
    original.visible = false;
    processed.visible = true;
    r.setScissor(cut, 0, w - cut, h);
    r.render(this.scene, this.camera);
    r.setScissorTest(false);
    original.visible = true;
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.size = { w, h };
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
  setModel(object: Object3D, bytes: number, opts: { keepView?: boolean } = {}) {
    // For edits to the same model, keep the placement and camera so nothing jumps around.
    const keep =
      opts.keepView && this.modelObject
        ? { scale: this.modelScale, position: this.modelObject.position.clone() }
        : null;
    this.clearModel();

    // Center on the pedestal, rest on its top, and normalize the size.
    const box = new Box3().setFromObject(object);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const scale = keep ? keep.scale : normalizeScale(Math.max(size.x, size.y, size.z), MODEL_SIZE);

    const wrapper = new Group();
    wrapper.add(object);
    if (keep) object.position.copy(keep.position);
    else object.position.set(-center.x, -box.min.y, -center.z);
    wrapper.scale.setScalar(scale);

    wrapper.traverse((o) => {
      if (o instanceof Mesh) {
        o.castShadow = true;
        o.receiveShadow = false;
      }
    });

    this.modelHolder.add(wrapper);
    this.model = wrapper;
    this.modelObject = object;
    this.modelScale = scale;
    this.stats = computeStats(object, bytes);
    this.applyMaterialModes();

    if (keep) return;
    const height = size.y * scale;
    const radius = Math.max(1.5, height / 2 + 0.3);
    this.setHomeView(radius, height / 2);
    this.resetView();
  }

  clearModel() {
    this.highlight = null; // disposed together with the model it was attached to
    this.setProcessed(null);
    if (!this.model) return;
    this.modelHolder.remove(this.model);
    disposeObject(this.model);
    this.model = null;
    this.modelObject = null;
    this.stats = null;
  }

  /** Show a low-poly version next to the original. Pass null to remove it. */
  setProcessed(object: Object3D | null) {
    if (this.processed) {
      this.modelHolder.remove(this.processed);
      // Texture-mode materials share textures with the original, so keep those alive.
      disposeObject(this.processed, { textures: false });
      this.processed = null;
    }
    if (!object || !this.modelObject) {
      this.applyVisibility();
      return;
    }
    const wrapper = new Group();
    wrapper.add(object);
    // Same placement as the original so the two line up exactly.
    object.position.copy(this.modelObject.position);
    wrapper.scale.setScalar(this.modelScale);
    wrapper.traverse((o) => {
      if (o instanceof Mesh) o.castShadow = true;
    });
    this.modelHolder.add(wrapper);
    this.processed = wrapper;
    this.processedStats = computeStats(object, 0);
    this.applyMaterialModes();
    this.applyVisibility();
  }

  private processedStats: ModelStats | null = null;

  /** The low-poly group (the wrapper's only child), for in-place recoloring. */
  getProcessedObject(): Group | null {
    const child = this.processed?.children[0];
    return child instanceof Group ? child : null;
  }

  getProcessedStats(): ModelStats | null {
    return this.processed ? this.processedStats : null;
  }

  setViewMode(mode: 'original' | 'lowpoly' | 'split') {
    this.viewMode = mode;
    this.applyVisibility();
  }

  /** 0..1 position of the before/after divider. */
  setSplitRatio(ratio: number) {
    this.splitRatio = Math.min(0.95, Math.max(0.05, ratio));
  }

  private applyVisibility() {
    if (!this.model) return;
    if (!this.processed) {
      this.model.visible = true;
      return;
    }
    this.model.visible = this.viewMode !== 'lowpoly';
    this.processed.visible = this.viewMode !== 'original';
  }

  getStats(): ModelStats | null {
    return this.stats;
  }

  // ---- craft editing: pose preview, picking, highlight, gizmo -----------------------------

  /** Run `fn` every frame (for pose previews). Pass null to stop and return the rig to its rest pose. */
  setUpdater(fn: ((seconds: number, craft: CraftObjectInfo | null) => void) | null) {
    this.updater = fn;
    if (!fn) {
      const craft = this.modelObject?.userData.craft as CraftObjectInfo | undefined;
      craft?.skeleton.bones.forEach((b) => b.rotation.set(0, 0, 0));
    }
  }

  /** Index of the triangle under a screen position, or null. */
  pickFace(clientX: number, clientY: number): number | null {
    if (!this.model) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObject(this.model, true);
    const hit = hits.find((h) => h.object instanceof SkinnedMesh && h.faceIndex != null);
    return hit?.faceIndex ?? null;
  }

  /** Outline the given triangles (9 numbers each, model space). Pass null to clear. */
  setHighlight(positions: Float32Array | null) {
    if (this.highlight) {
      this.highlight.parent?.remove(this.highlight);
      this.highlight.geometry.dispose();
      (this.highlight.material as Material).dispose();
      this.highlight = null;
    }
    if (!positions || !this.modelObject) return;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    const mesh = new Mesh(
      geometry,
      new MeshBasicMaterial({
        color: 0xffd43b,
        wireframe: true,
        depthTest: false,
        transparent: true,
        opacity: 0.95,
      }),
    );
    mesh.renderOrder = 10;
    mesh.frustumCulled = false;
    this.modelObject.add(mesh);
    this.highlight = mesh;
  }

  onGizmo(listener: GizmoListener | null) {
    this.gizmoListener = listener;
  }

  /** Show move/rotate/scale handles at a model-space transform. Pass null to hide them. */
  setGizmo(
    opts: {
      position: [number, number, number];
      rotation: [number, number, number];
      mode: 'translate' | 'rotate' | 'scale';
      snap: boolean;
    } | null,
  ) {
    if (!opts) {
      if (this.gizmoDragging) return;
      this.gizmo?.detach();
      return;
    }
    if (!this.modelObject || this.gizmoDragging) return;
    if (!this.gizmo) this.createGizmo();
    const gizmo = this.gizmo!;
    this.modelObject.updateWorldMatrix(true, false);
    this.gizmoProxy.position.copy(this.modelObject.localToWorld(new Vector3(...opts.position)));
    const k = Math.PI / 180;
    this.gizmoProxy.rotation.set(
      opts.rotation[0] * k,
      opts.rotation[1] * k,
      opts.rotation[2] * k,
      'XYZ',
    );
    this.gizmoProxy.scale.set(1, 1, 1);
    gizmo.setMode(opts.mode);
    gizmo.setTranslationSnap(opts.snap ? 0.05 * this.modelScale : null);
    gizmo.setRotationSnap(opts.snap ? 15 * k : null);
    gizmo.setScaleSnap(opts.snap ? 0.05 : null);
    gizmo.attach(this.gizmoProxy);
  }

  private createGizmo() {
    const gizmo = new TransformControls(this.camera, this.renderer.domElement);
    gizmo.setSize(0.8);
    this.scene.add(this.gizmoProxy);
    this.scene.add(gizmo.getHelper());
    const emit = (phase: 'start' | 'change' | 'end') => {
      if (!this.modelObject || !this.gizmoListener) return;
      this.modelObject.updateWorldMatrix(true, false);
      const local = this.modelObject.worldToLocal(this.gizmoProxy.position.clone());
      const r = this.gizmoProxy.rotation;
      const d = 180 / Math.PI;
      this.gizmoListener(
        {
          position: [local.x, local.y, local.z],
          rotation: [r.x * d, r.y * d, r.z * d],
          scale: [this.gizmoProxy.scale.x, this.gizmoProxy.scale.y, this.gizmoProxy.scale.z],
        },
        phase,
      );
    };
    gizmo.addEventListener('dragging-changed', (e) => {
      const dragging = Boolean((e as unknown as { value: boolean }).value);
      this.gizmoDragging = dragging;
      this.controls.enabled = !dragging;
      emit(dragging ? 'start' : 'end');
    });
    gizmo.addEventListener('objectChange', () => emit('change'));
    this.gizmo = gizmo;
  }

  /** True while a handle is being dragged or hovered, so clicks on the model should be ignored. */
  isGizmoBusy() {
    return this.gizmoDragging || Boolean(this.gizmo?.axis);
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
    this.modelHolder.traverse((o) => {
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
    this.gizmo?.dispose();
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

export type GizmoListener = (
  t: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
  },
  phase: 'start' | 'change' | 'end',
) => void;
