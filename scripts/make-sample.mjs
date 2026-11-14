// Generates public/models/sample.glb: a tiny low-poly toy fox built from primitives.
// The model is created by this script, so it is released under CC0 (see public/models/SAMPLE_LICENSE.txt).
// Run with: node scripts/make-sample.mjs
import { writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

// GLTFExporter reads Blobs through FileReader, which Node lacks.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buf).toString('base64')}`;
      this.onloadend?.();
    });
  }
};

const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0 });
const orange = mat('#ff9f43');
const cream = mat('#fff3d6');
const dark = mat('#22184a');
const pink = mat('#ff6b9d');

const root = new THREE.Group();
root.name = 'Fox';

function add(name, geometry, material, position, rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const m = new THREE.Mesh(geometry, material);
  m.name = name;
  m.position.set(...position);
  m.rotation.set(...rotation);
  m.scale.set(...scale);
  root.add(m);
  return m;
}

add(
  'Body',
  new THREE.IcosahedronGeometry(0.5, 1),
  orange,
  [0, 0.62, 0],
  [0, 0, 0],
  [1.35, 0.9, 0.9],
);
add(
  'Belly',
  new THREE.IcosahedronGeometry(0.4, 0),
  cream,
  [0.05, 0.5, 0],
  [0, 0, 0],
  [1.3, 0.8, 0.95],
);
add(
  'Head',
  new THREE.IcosahedronGeometry(0.34, 1),
  orange,
  [0.78, 0.98, 0],
  [0, 0, 0],
  [1, 0.9, 1.05],
);
add('Snout', new THREE.ConeGeometry(0.16, 0.36, 5), cream, [1.14, 0.92, 0], [0, 0, -Math.PI / 2]);
add('Nose', new THREE.IcosahedronGeometry(0.05, 0), dark, [1.33, 0.92, 0]);
add('EyeL', new THREE.IcosahedronGeometry(0.045, 0), dark, [1.02, 1.05, 0.15]);
add('EyeR', new THREE.IcosahedronGeometry(0.045, 0), dark, [1.02, 1.05, -0.15]);
add('EarL', new THREE.ConeGeometry(0.12, 0.3, 4), orange, [0.72, 1.35, 0.17], [0.15, 0, 0]);
add('EarR', new THREE.ConeGeometry(0.12, 0.3, 4), orange, [0.72, 1.35, -0.17], [-0.15, 0, 0]);
add('InnerEarL', new THREE.ConeGeometry(0.06, 0.18, 4), pink, [0.74, 1.33, 0.17], [0.15, 0, 0]);
add('InnerEarR', new THREE.ConeGeometry(0.06, 0.18, 4), pink, [0.74, 1.33, -0.17], [-0.15, 0, 0]);
for (const [name, x, z] of [
  ['LegFL', 0.5, 0.25],
  ['LegFR', 0.5, -0.25],
  ['LegBL', -0.5, 0.25],
  ['LegBR', -0.5, -0.25],
]) {
  add(name, new THREE.CylinderGeometry(0.09, 0.07, 0.42, 5), dark, [x, 0.21, z]);
}
add(
  'Tail',
  new THREE.ConeGeometry(0.2, 0.8, 5),
  orange,
  [-0.95, 0.85, 0],
  [0, 0, Math.PI / 2 + 0.6],
);
add(
  'TailTip',
  new THREE.ConeGeometry(0.12, 0.28, 5),
  cream,
  [-1.28, 1.14, 0],
  [0, 0, Math.PI / 2 + 0.6],
);

// Non-indexed geometry keeps every facet separate, which suits flat shading.
root.traverse((o) => {
  if (o.isMesh && o.geometry.index) o.geometry = o.geometry.toNonIndexed();
});

const exporter = new GLTFExporter();
const glb = await exporter.parseAsync(root, { binary: true });
writeFileSync(new URL('../public/models/sample.glb', import.meta.url), Buffer.from(glb));
console.log(`sample.glb written (${glb.byteLength} bytes)`);
