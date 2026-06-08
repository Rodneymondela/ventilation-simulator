import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useNetworkStore } from '../store/networkStore';
import { useShallow } from 'zustand/react/shallow';
import { computeRange, colorForValue } from '../display/mapping';
import { colorValue } from '../display/variables';
import type { VentNetwork, VentNode } from '../model/types';

interface MapInfo {
  cx: number;
  cy: number;
  cz: number;
  scale: number;
}

/** Map a node (x, y plan; z depth) to three-space (x, depth->Y up, y->Z). */
function mapNode(n: VentNode, m: MapInfo): THREE.Vector3 {
  return new THREE.Vector3(
    (n.x - m.cx) * m.scale,
    (n.z - m.cz) * m.scale, // depth: more negative z => lower
    (n.y - m.cy) * m.scale,
  );
}

function computeMap(network: VentNetwork): MapInfo {
  if (network.nodes.length === 0) return { cx: 0, cy: 0, cz: 0, scale: 0.05 };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const n of network.nodes) {
    minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
    minZ = Math.min(minZ, n.z); maxZ = Math.max(maxZ, n.z);
  }
  const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1);
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    cz: (minZ + maxZ) / 2,
    scale: 16 / extent,
  };
}

function cylinderBetween(a: THREE.Vector3, b: THREE.Vector3, radius: number, color: THREE.ColorRepresentation) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length() || 0.0001;
  const geom = new THREE.CylinderGeometry(radius, radius, len, 12);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1 });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.copy(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5));
  // orient default +Y axis to dir
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return mesh;
}

export function View3D() {
  const { network, result, display, selection, setSelection } = useNetworkStore(
    useShallow((s) => ({
      network: s.activeNetwork(),
      result: s.result,
      display: s.display,
      selection: s.selection,
      setSelection: s.setSelection,
    })),
  );

  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const rendererRef = useRef<THREE.WebGLRenderer>(null);
  const controlsRef = useRef<OrbitControls>(null);
  const groupRef = useRef<THREE.Group>(null);
  const raycaster = useRef(new THREE.Raycaster());
  // latest data for the click handler (avoids stale closure)
  const dataRef = useRef({ network, result, display, setSelection });
  dataRef.current = { network, result, display, setSelection };

  // --- one-time scene setup ---
  useEffect(() => {
    const mount = mountRef.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(0, 14, 26);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(10, 20, 15);
    scene.add(dir);
    scene.add(new THREE.GridHelper(40, 20, 0xcbd5e1, 0xe2e8f0));

    const group = new THREE.Group();
    scene.add(group);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;
    groupRef.current = group;

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    let raf = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    const onClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.current.setFromCamera(ndc, camera);
      const hits = raycaster.current.intersectObjects(group.children, false);
      const hit = hits.find((h) => h.object.userData?.kind);
      if (hit) {
        const ud = hit.object.userData as { kind: 'node' | 'airway'; id: string };
        dataRef.current.setSelection({ type: ud.kind, id: ud.id });
      }
    };
    renderer.domElement.addEventListener('click', onClick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('click', onClick);
      controls.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  // --- rebuild meshes when data changes ---
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    // clear
    for (const child of [...group.children]) {
      group.remove(child);
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    }

    const m = computeMap(network);
    const posById = new Map(network.nodes.map((n) => [n.id, mapNode(n, m)]));
    const range = result ? computeRange(result.airwayResults, display.primary.variable) : null;
    const resById = new Map((result?.airwayResults ?? []).map((r) => [r.airwayId, r]));

    // parallel offset bookkeeping
    const pairCount = new Map<string, number>();
    const pairSeen = new Map<string, number>();
    for (const a of network.airways) {
      const key = [a.from, a.to].sort().join('|');
      pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
    }

    for (const a of network.airways) {
      const p1 = posById.get(a.from);
      const p2 = posById.get(a.to);
      if (!p1 || !p2) continue;
      const key = [a.from, a.to].sort().join('|');
      const count = pairCount.get(key) ?? 1;
      const seen = pairSeen.get(key) ?? 0;
      pairSeen.set(key, seen + 1);
      const offsetIndex = seen - (count - 1) / 2;
      // perpendicular offset in the horizontal (X-Z) plane
      const dirh = new THREE.Vector3(p2.x - p1.x, 0, p2.z - p1.z);
      const perp = new THREE.Vector3(-dirh.z, 0, dirh.x).normalize().multiplyScalar(offsetIndex * 0.6);
      const a1 = p1.clone().add(perp);
      const a2 = p2.clone().add(perp);

      const res = resById.get(a.id);
      const selected = selection?.type === 'airway' && selection.id === a.id;
      let color: THREE.ColorRepresentation = 0x94a3b8;
      if (res && range) color = new THREE.Color(colorForValue(colorValue(display.primary.variable, res), range)).getHex();
      if (selected) color = 0x0f172a;
      const cyl = cylinderBetween(a1, a2, selected ? 0.22 : 0.16, color);
      cyl.userData = { kind: 'airway', id: a.id };
      group.add(cyl);
    }

    for (const n of network.nodes) {
      const p = posById.get(n.id)!;
      const selected = selection?.type === 'node' && selection.id === n.id;
      const fixed = n.fixedPressure != null;
      const color = selected ? 0x0f172a : fixed ? 0x38bdf8 : 0xffffff;
      const geom = new THREE.SphereGeometry(selected ? 0.5 : 0.42, 20, 20);
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
      const sphere = new THREE.Mesh(geom, mat);
      sphere.position.copy(p);
      sphere.userData = { kind: 'node', id: n.id };
      group.add(sphere);
    }
  }, [network, result, display, selection]);

  return <div ref={mountRef} className="h-full w-full" />;
}
