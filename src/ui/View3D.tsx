import { useEffect, useRef } from 'react';
// Named imports (the three.js-recommended form). Note: rollup already tree-shakes
// the unused slice of three with either import style, so this does not shrink the
// bundle on its own — the WebGLRenderer + shader library it pulls in is the
// irreducible ~500kB floor of any three.js WebGL scene. That chunk is isolated as
// a lazy `three` vendor chunk in vite.config.ts and only loads on the 3D toggle.
import {
  Vector2,
  Vector3,
  Scene,
  Color,
  PerspectiveCamera,
  WebGLRenderer,
  AmbientLight,
  DirectionalLight,
  GridHelper,
  Group,
  Raycaster,
  CylinderGeometry,
  SphereGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  Mesh,
  type ColorRepresentation,
  type Material,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useNetworkStore } from '../store/networkStore';
import { useShallow } from 'zustand/react/shallow';
import { computeRange, colorForValue } from '../display/mapping';
import { colorValue } from '../display/variables';
import { FAN_STATE_STYLE } from '../display/fanStyle';
import { CONTAMINANT_EPS } from '../display/glyphs';
import type { VentNetwork, VentNode } from '../model/types';

/** World up — status glyph markers stack along this above an airway midpoint. */
const UP = new Vector3(0, 1, 0);

interface MapInfo {
  cx: number;
  cy: number;
  cz: number;
  scale: number;
}

/** Map a node (x, y plan; z depth) to three-space (x, depth->Y up, y->Z). */
function mapNode(n: VentNode, m: MapInfo): Vector3 {
  return new Vector3(
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

function cylinderBetween(a: Vector3, b: Vector3, radius: number, color: ColorRepresentation) {
  const dir = new Vector3().subVectors(b, a);
  const len = dir.length() || 0.0001;
  const geom = new CylinderGeometry(radius, radius, len, 12);
  const mat = new MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1 });
  const mesh = new Mesh(geom, mat);
  mesh.position.copy(new Vector3().addVectors(a, b).multiplyScalar(0.5));
  // orient default +Y axis to dir
  mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir.clone().normalize());
  return mesh;
}

/**
 * A flat-shaded status-glyph marker (3D counterpart of a 2D canvas glyph). Colour
 * carries the meaning — it matches the GlyphLayersPanel legend swatch — so an
 * unlit MeshBasicMaterial is used to keep the colour true regardless of lighting.
 */
function markerSphere(pos: Vector3, color: ColorRepresentation, radius: number, userData: object) {
  const geom = new SphereGeometry(radius, 12, 12);
  const mat = new MeshBasicMaterial({ color });
  const mesh = new Mesh(geom, mat);
  mesh.position.copy(pos);
  mesh.userData = userData;
  return mesh;
}

/** Translucent blue sleeve around an airway — the 3D "select same layer" halo. */
function haloCylinder(a: Vector3, b: Vector3, radius: number, userData: object) {
  const dir = new Vector3().subVectors(b, a);
  const len = dir.length() || 0.0001;
  const geom = new CylinderGeometry(radius, radius, len, 12);
  const mat = new MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.3 });
  const mesh = new Mesh(geom, mat);
  mesh.position.copy(new Vector3().addVectors(a, b).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir.clone().normalize());
  mesh.userData = userData;
  return mesh;
}

export function View3D() {
  const { network, result, display, selection, glyphs, selectedAirways, setSelection } =
    useNetworkStore(
      useShallow((s) => ({
        network: s.activeNetwork(),
        result: s.result,
        display: s.display,
        selection: s.selection,
        glyphs: s.glyphs,
        selectedAirways: s.selectedAirways,
        setSelection: s.setSelection,
      })),
    );

  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene>(null);
  const cameraRef = useRef<PerspectiveCamera>(null);
  const rendererRef = useRef<WebGLRenderer>(null);
  const controlsRef = useRef<OrbitControls>(null);
  const groupRef = useRef<Group>(null);
  const raycaster = useRef(new Raycaster());
  // latest data for the click handler (avoids stale closure)
  const dataRef = useRef({ network, result, display, setSelection });
  dataRef.current = { network, result, display, setSelection };

  // --- one-time scene setup ---
  useEffect(() => {
    const mount = mountRef.current!;
    const scene = new Scene();
    scene.background = new Color(0xf1f5f9);
    const camera = new PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(0, 14, 26);
    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new AmbientLight(0xffffff, 0.7));
    const dir = new DirectionalLight(0xffffff, 0.8);
    dir.position.set(10, 20, 15);
    scene.add(dir);
    scene.add(new GridHelper(40, 20, 0xcbd5e1, 0xe2e8f0));

    const group = new Group();
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
      const ndc = new Vector2(
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
      const mesh = child as Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material as Material | Material[] | undefined;
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

    const groupSet = new Set(selectedAirways); // "select same layer" highlight

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
      const dirh = new Vector3(p2.x - p1.x, 0, p2.z - p1.z);
      const perp = new Vector3(-dirh.z, 0, dirh.x).normalize().multiplyScalar(offsetIndex * 0.6);
      const a1 = p1.clone().add(perp);
      const a2 = p2.clone().add(perp);

      const res = resById.get(a.id);
      const selected = selection?.type === 'airway' && selection.id === a.id;
      const blocked = a.blocked && glyphs.blocked;
      let color: ColorRepresentation = 0x94a3b8;
      if (res && range) color = new Color(colorForValue(colorValue(display.primary.variable, res), range)).getHex();
      if (blocked) color = 0x94a3b8; // sealed: render grey like the 2D canvas
      if (selected) color = 0x0f172a;
      const ud = { kind: 'airway' as const, id: a.id };
      if (groupSet.has(a.id)) group.add(haloCylinder(a1, a2, selected ? 0.34 : 0.28, ud));
      const cyl = cylinderBetween(a1, a2, selected ? 0.22 : 0.16, color);
      cyl.userData = ud;
      group.add(cyl);

      // Status-glyph markers, stacked above the airway midpoint. Colours mirror
      // the 2D canvas / GlyphLayersPanel legend so the two views read alike.
      const mid = new Vector3().addVectors(a1, a2).multiplyScalar(0.5);
      const markers: ColorRepresentation[] = [];
      if (a.fan && glyphs.fan) {
        markers.push(res?.fanState ? new Color(FAN_STATE_STYLE[res.fanState].color).getHex() : 0x2563eb);
      }
      if ((a.regulatorResistance ?? 0) > 0 && glyphs.regulator) markers.push(0xb45309);
      if (a.fixedFlow != null && !a.blocked && glyphs.fixedFlow) markers.push(0x7c3aed);
      if (blocked) markers.push(0xdc2626);
      if (glyphs.contaminant && res?.concentration != null && Math.abs(res.concentration) > CONTAMINANT_EPS) {
        markers.push(0x059669);
      }
      markers.forEach((c, i) => {
        group.add(markerSphere(mid.clone().addScaledVector(UP, 0.55 + i * 0.42), c, 0.16, ud));
      });
    }

    for (const n of network.nodes) {
      const p = posById.get(n.id)!;
      const selected = selection?.type === 'node' && selection.id === n.id;
      const fixed = n.fixedPressure != null && glyphs.fixedPressure;
      const color = selected ? 0x0f172a : fixed ? 0x38bdf8 : 0xffffff;
      const geom = new SphereGeometry(selected ? 0.5 : 0.42, 20, 20);
      const mat = new MeshStandardMaterial({ color, roughness: 0.5 });
      const sphere = new Mesh(geom, mat);
      sphere.position.copy(p);
      const ud = { kind: 'node' as const, id: n.id };
      sphere.userData = ud;
      group.add(sphere);

      // Contaminant "report" marker above the node: orange = held source,
      // green = fresh (held 0), light-green = injection. Matches the 2D badge.
      const hasConc = n.contaminantConcentration != null;
      const fresh = hasConc && (n.contaminantConcentration ?? 0) <= CONTAMINANT_EPS;
      const source = hasConc && (n.contaminantConcentration ?? 0) > CONTAMINANT_EPS;
      const injects = (n.contaminantInjection ?? 0) > CONTAMINANT_EPS;
      if (glyphs.contaminant && (hasConc || injects)) {
        const c = source ? 0xd97706 : fresh ? 0x059669 : 0x10b981;
        group.add(markerSphere(p.clone().addScaledVector(UP, 0.78), c, 0.2, ud));
      }
    }
  }, [network, result, display, selection, glyphs, selectedAirways]);

  return <div ref={mountRef} className="h-full w-full" />;
}
