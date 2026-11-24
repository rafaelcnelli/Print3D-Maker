import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  extractDimensions,
  getTemplateDimensionBounds,
  scaleDimensions,
  scaleDimensionsFromCorner,
  type Dimensions3D,
} from '../core/dimensionMath';
import {
  computePrintMetrics,
  exportGroupTo3MF,
  exportGroupToBinarySTL,
  exportGroupToOBJ,
} from '../core/stlExporter';
import { createBuildPlateRig, type BuildPlateRig } from '../three/buildPlate';
import {
  createFilamentMaterialPair,
  createLayerLineBumpTexture,
  type FilamentMaterialPair,
} from '../three/filamentMaterials';
import { buildProjectModel, type BuiltModelResult } from '../three/modelBuilder';
import {
  createSelectionGizmoRig,
  type GizmoHandleId,
  type SelectionGizmoRig,
} from '../three/selectionGizmo';
import type {
  BuildPlateSize,
  CameraPresetId,
  PrintMetrics,
  ProjectConfig,
  TemplateId,
  ThemeMode,
} from '../types/project';

export interface Viewport3DHandle {
  exportSTL: () => ArrayBuffer | null;
  exportOBJ: (objectName: string) => string | null;
  export3MF: (objectName: string) => ArrayBuffer | null;
}

interface Viewport3DProps {
  config: ProjectConfig;
  theme: ThemeMode;
  buildPlate: BuildPlateSize;
  cameraPreset: CameraPresetId;
  cameraNonce: number;
  isTextValid: boolean;
  selected: boolean;
  lockProportions: boolean;
  onSelectChange: (selected: boolean) => void;
  onDimensionsChange: (dims: Dimensions3D) => void;
  onMetricsChange: (metrics: PrintMetrics) => void;
  onUserOrbit?: () => void;
}

interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
}

function getCameraPose(
  template: TemplateId,
  preset: CameraPresetId,
  boxLetterLayout: ProjectConfig['boxLetterLayout'] = 'assembled'
): CameraPose {
  if (template === 'heart-name') {
    switch (preset) {
      case 'front':
        return { position: [0, 50, 276], target: [0, 34, 0] };
      case 'top':
        return { position: [0, 258, 16], target: [0, 38, 12] };
      case 'side':
        return { position: [215, 54, 12], target: [0, 36, 0] };
      case 'iso':
      default:
        return { position: [98, 192, 184], target: [0, 32, -2] };
    }
  }

  if (template === 'monogram') {
    switch (preset) {
      case 'front':
        return { position: [0, 52, 294], target: [0, 40, 0] };
      case 'top':
        return { position: [0, 268, 18], target: [0, 44, 0] };
      case 'side':
        return { position: [242, 58, 18], target: [0, 42, 0] };
      case 'iso':
      default:
        return { position: [78, 122, 256], target: [0, 38, 0] };
    }
  }

  if (template === 'box-letter') {
    if (boxLetterLayout === 'separated') {
      switch (preset) {
        case 'front':
          return { position: [0, 118, 226], target: [0, -6, 12] };
        case 'top':
          return { position: [0, 278, 14], target: [0, 0, 14] };
        case 'side':
          return { position: [232, 86, 28], target: [0, 0, 8] };
        case 'iso':
        default:
          return { position: [42, 174, 212], target: [0, -8, 14] };
      }
    }
    switch (preset) {
      case 'front':
        return { position: [0, 34, 242], target: [0, 22, 0] };
      case 'top':
        return { position: [0, 242, 18], target: [0, 18, 8] };
      case 'side':
        return { position: [214, 48, 28], target: [0, 22, 0] };
      case 'iso':
      default:
        return { position: [98, 96, 214], target: [0, 20, 0] };
    }
  }

  if (template === 'svg-keychain') {
    switch (preset) {
      case 'front':
        return { position: [0, 22, 112], target: [0, -2, 0] };
      case 'top':
        return { position: [0, 118, 10], target: [0, 0, 4] };
      case 'side':
        return { position: [98, 24, 14], target: [0, 0, 0] };
      case 'iso':
      default:
        return { position: [42, 88, 80], target: [0, -6, 4] };
    }
  }

  if (template === 'name-sign') {
    switch (preset) {
      case 'front':
        return { position: [0, 28, 210], target: [0, 12, 0] };
      case 'top':
        return { position: [0, 220, 16], target: [0, 10, 8] };
      case 'side':
        return { position: [190, 40, 26], target: [0, 14, 0] };
      case 'iso':
      default:
        return { position: [104, 92, 172], target: [0, 10, 0] };
    }
  }

  if (template === 'keychain') {
    switch (preset) {
      case 'front':
        return { position: [0, 22, 114], target: [0, -2, 0] };
      case 'top':
        return { position: [0, 122, 12], target: [0, 0, 7] };
      case 'side':
        return { position: [98, 24, 16], target: [0, 0, 0] };
      case 'iso':
      default:
        return { position: [48, 86, 84], target: [0, -6, 6] };
    }
  }

  // plaque
  switch (preset) {
    case 'front':
      return { position: [0, 36, 215], target: [0, 0, 0] };
    case 'top':
      return { position: [0, 228, 16], target: [0, 0, 12] };
    case 'side':
      return { position: [192, 34, 24], target: [0, 0, 0] };
    case 'iso':
    default:
      return { position: [86, 146, 138], target: [0, -10, 12] };
  }
}

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function cursorForHandle(id: GizmoHandleId): string {
  switch (id) {
    case 'top-y':
      return 'ns-resize';
    case 'side-px':
    case 'side-nx':
      return 'ew-resize';
    case 'side-pz':
    case 'side-nz':
      return 'ns-resize';
    case 'corner-pp':
    case 'corner-nn':
      return 'nwse-resize';
    case 'corner-pn':
    case 'corner-np':
      return 'nesw-resize';
  }
}

function collectPrintableMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (obj.userData?.excludeFromExport) return;
    if (obj instanceof THREE.Mesh) {
      meshes.push(obj);
    }
  });
  return meshes;
}

function computePrintableBox(root: THREE.Object3D, out: THREE.Box3): THREE.Box3 {
  out.makeEmpty();
  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    if (obj.userData?.excludeFromExport) return;
    if (obj instanceof THREE.Mesh) {
      out.expandByObject(obj);
    }
  });
  return out;
}

// Pre-allocated scratch math objects (zero allocations inside render/pointer loops)
const _targetPos = new THREE.Vector3();
const _targetLook = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _pointerNdc = new THREE.Vector2();
const _dragPlane = new THREE.Plane();
const _dragHit = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _projVec = new THREE.Vector3();
const _boxCenter = new THREE.Vector3();

interface DragSession {
  handleId: GizmoHandleId;
  pointerId: number;
  startHit: THREE.Vector3;
  startDims: Dimensions3D;
  lastEmitted: Dimensions3D;
  template: TemplateId;
}

export const Viewport3D = forwardRef<Viewport3DHandle, Viewport3DProps>(
  function Viewport3D(
    {
      config,
      theme,
      buildPlate,
      cameraPreset,
      cameraNonce,
      isTextValid,
      selected,
      lockProportions,
      onSelectChange,
      onDimensionsChange,
      onMetricsChange,
      onUserOrbit,
    },
    ref
  ) {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const xBadgeRef = useRef<HTMLDivElement | null>(null);
    const yBadgeRef = useRef<HTMLDivElement | null>(null);
    const zBadgeRef = useRef<HTMLDivElement | null>(null);

    const [contextLost, setContextLost] = useState(false);
    const [webglUnavailable, setWebglUnavailable] = useState(false);

    // Refs holding stable Three.js objects across React renders
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const keyLightRef = useRef<THREE.DirectionalLight | null>(null);
    const buildPlateRef = useRef<BuildPlateRig | null>(null);
    const gizmoRef = useRef<SelectionGizmoRig | null>(null);
    const bumpTexRef = useRef<THREE.CanvasTexture | null>(null);
    const activeModelRef = useRef<BuiltModelResult | null>(null);
    const activeMaterialsRef = useRef<FilamentMaterialPair | null>(null);
    const modelBoxRef = useRef<THREE.Box3>(new THREE.Box3());
    const latestMetricsRef = useRef<PrintMetrics>({
      widthMm: config.widthMm,
      heightMm: config.heightMm,
      depthMm: config.depthMm,
      triangleCount: 0,
      volumeCm3: 0,
      filamentGrams: 0,
      estimatedMinutes: 0,
    });
    const isSoftwareGlRef = useRef<boolean>(false);
    const requestRenderRef = useRef<() => void>(() => {});
    const transitionRef = useRef<{
      active: boolean;
      pos: THREE.Vector3;
      look: THREE.Vector3;
    }>({
      active: false,
      pos: new THREE.Vector3(),
      look: new THREE.Vector3(),
    });

    // Latest prop refs for single-mounted Three.js event handlers
    const configRef = useRef(config);
    configRef.current = config;
    const buildPlatePropRef = useRef(buildPlate);
    buildPlatePropRef.current = buildPlate;
    const selectedRef = useRef(selected);
    selectedRef.current = selected;
    const lockProportionsRef = useRef(lockProportions);
    lockProportionsRef.current = lockProportions;
    const onSelectChangeRef = useRef(onSelectChange);
    onSelectChangeRef.current = onSelectChange;
    const onDimensionsChangeRef = useRef(onDimensionsChange);
    onDimensionsChangeRef.current = onDimensionsChange;
    const onMetricsChangeRef = useRef(onMetricsChange);
    onMetricsChangeRef.current = onMetricsChange;
    const onUserOrbitRef = useRef(onUserOrbit);
    onUserOrbitRef.current = onUserOrbit;

    useImperativeHandle(
      ref,
      () => ({
        exportSTL: () => {
          const model = activeModelRef.current?.group;
          if (!model) return null;
          return exportGroupToBinarySTL(model);
        },
        exportOBJ: (objectName: string) => {
          const model = activeModelRef.current?.group;
          if (!model) return null;
          return exportGroupToOBJ(model, objectName);
        },
        export3MF: (objectName: string) => {
          const model = activeModelRef.current?.group;
          if (!model) return null;
          return exportGroupTo3MF(model, {
            objectName,
            config: configRef.current,
            buildPlate: buildPlatePropRef.current,
          });
        },
      }),
      []
    );

    // Mount WebGLRenderer & Studio Scene ONCE
    useEffect(() => {
      const container = mountRef.current;
      if (!container) return;

      const isSoftwareGl = detectSoftwareWebGL();
      isSoftwareGlRef.current = isSoftwareGl;

      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          antialias: !isSoftwareGl,
          powerPreference: 'high-performance',
        });
      } catch {
        setWebglUnavailable(true);
        return;
      }

      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.setPixelRatio(
        isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
      );
      renderer.shadowMap.enabled = !isSoftwareGl;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.setSize(
        container.clientWidth || window.innerWidth,
        container.clientHeight || window.innerHeight
      );

      renderer.domElement.style.display = 'block';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.setAttribute('data-testid', 'viewport-canvas');
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      const scene = new THREE.Scene();
      const initialBgHex = theme === 'dark' ? 0x111620 : 0xeceff3;
      const studioBg = new THREE.Color(initialBgHex);
      scene.background = studioBg;
      scene.fog = new THREE.Fog(initialBgHex, 420, 1020);
      sceneRef.current = scene;

      // Studio PBR Environment Map via RoomEnvironment on EVERY device
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      const envRT = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
      scene.environment = envRT.texture;
      pmremGenerator.dispose();

      // Balanced 3-point warm/cool studio lighting rig
      const hemiLight = new THREE.HemisphereLight(0xdde9ff, 0xb8bec9, 0.95);
      hemiLight.position.set(0, 260, 0);
      scene.add(hemiLight);

      const keyLight = new THREE.DirectionalLight(0xfff5e8, 1.55);
      keyLight.position.set(42, 265, 92);
      keyLight.castShadow = !isSoftwareGl;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 40;
      keyLight.shadow.camera.far = 560;
      const d = Math.max(buildPlatePropRef.current.widthMm, buildPlatePropRef.current.depthMm) * 0.62;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.025;
      scene.add(keyLight);
      keyLightRef.current = keyLight;

      const rimLight = new THREE.DirectionalLight(0xe5f0ff, 0.72);
      rimLight.position.set(-150, 120, -165);
      scene.add(rimLight);

      // Camera & OrbitControls
      const width = container.clientWidth || window.innerWidth;
      const height = container.clientHeight || window.innerHeight;
      const camera = new THREE.PerspectiveCamera(36, width / height, 1, 2000);
      const initialPose = getCameraPose('heart-name', 'iso');
      camera.position.set(...initialPose.position);
      cameraRef.current = camera;

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(...initialPose.target);
      controls.enableDamping = !isSoftwareGl;
      controls.dampingFactor = 0.08;
      controls.minDistance = 55;
      controls.maxDistance = Math.max(
        520,
        Math.max(buildPlatePropRef.current.widthMm, buildPlatePropRef.current.depthMm) * 2.4
      );
      controls.maxPolarAngle = Math.PI * 0.495;
      controls.update();
      controlsRef.current = controls;

      // Multi-part PEI Build Plate assembly
      const maxAniso = renderer.capabilities.getMaxAnisotropy();
      const plateRig = createBuildPlateRig(maxAniso, theme, buildPlatePropRef.current);
      scene.add(plateRig.group);
      buildPlateRef.current = plateRig;

      // Tinkercad-style 3D Selection Gizmo (excluded from STL/OBJ exports)
      const gizmo = createSelectionGizmoRig();
      scene.add(gizmo.group);
      gizmoRef.current = gizmo;

      // Shared procedural FDM layer-line bump texture
      const bumpTex = createLayerLineBumpTexture(maxAniso);
      bumpTexRef.current = bumpTex;

      // Project 3D bounding anchors onto screen-space millimeter tags (zero React re-renders!)
      function updateProjectedDimensionBadges(): void {
        const badges: [HTMLDivElement | null, THREE.Vector3, string][] = [
          [
            xBadgeRef.current,
            gizmo.anchors.xLabel,
            `L ${latestMetricsRef.current.widthMm} mm`,
          ],
          [
            yBadgeRef.current,
            gizmo.anchors.yLabel,
            `A ${latestMetricsRef.current.heightMm} mm`,
          ],
          [
            zBadgeRef.current,
            gizmo.anchors.zLabel,
            `P ${latestMetricsRef.current.depthMm} mm`,
          ],
        ];

        const show = selectedRef.current && !modelBoxRef.current.isEmpty();
        const cw = container?.clientWidth || window.innerWidth;
        const ch = container?.clientHeight || window.innerHeight;

        for (const [el, worldPt, text] of badges) {
          if (!el) continue;
          if (!show) {
            el.style.opacity = '0';
            continue;
          }
          _projVec.copy(worldPt).project(camera);
          if (_projVec.z < -1 || _projVec.z > 1) {
            el.style.opacity = '0';
            continue;
          }
          const sx = (_projVec.x * 0.5 + 0.5) * cw;
          const sy = (-_projVec.y * 0.5 + 0.5) * ch;
          const clampedX = Math.max(46, Math.min(cw - 46, sx));
          const clampedY = Math.max(24, Math.min(ch - 24, sy));
          el.textContent = text;
          el.style.transform = `translate3d(${clampedX.toFixed(1)}px, ${clampedY.toFixed(1)}px, 0) translate(-50%, -50%)`;
          el.style.opacity = '1';
        }
      }

      // Coalesced on-demand renderer with afterDraw software-WebGL pacing
      let frameId = 0;
      let renderBusy = false;
      let renderDirty = false;
      let lastTime = performance.now();
      let disposed = false;

      function afterDraw(cb: () => void) {
        if (disposed) return;
        const gl = renderer.getContext();
        if (gl instanceof WebGL2RenderingContext && typeof gl.fenceSync === 'function') {
          const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
          gl.flush();
          const poll = () => {
            if (disposed) {
              if (sync) gl.deleteSync(sync);
              return;
            }
            const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
            if (state === gl.UNSIGNALED) {
              frameId = window.setTimeout(poll, 5);
            } else {
              if (sync) gl.deleteSync(sync);
              frameId = window.setTimeout(cb, 45);
            }
          };
          frameId = window.setTimeout(poll, 5);
        } else {
          frameId = window.setTimeout(cb, 45);
        }
      }

      function requestRender() {
        if (disposed) return;
        if (renderBusy) {
          renderDirty = true;
          return;
        }
        renderBusy = true;
        frameId = requestAnimationFrame(() => {
          if (disposed) return;
          renderDirty = false;

          const now = performance.now();
          const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
          lastTime = now;

          let needsContinue = false;
          const tr = transitionRef.current;

          if (tr.active) {
            if (isSoftwareGl) {
              camera.position.copy(tr.pos);
              controls.target.copy(tr.look);
              tr.active = false;
            } else {
              const alpha = 1 - Math.exp(-8.5 * dt);
              camera.position.lerp(tr.pos, alpha);
              controls.target.lerp(tr.look, alpha);
              if (
                camera.position.distanceTo(tr.pos) < 0.35 &&
                controls.target.distanceTo(tr.look) < 0.35
              ) {
                camera.position.copy(tr.pos);
                controls.target.copy(tr.look);
                tr.active = false;
              } else {
                needsContinue = true;
              }
            }
          }

          if (controls.update() && !isSoftwareGl) {
            needsContinue = true;
          }

          renderer.render(scene, camera);
          updateProjectedDimensionBadges();

          const done = () => {
            const seqTarget = container?.parentElement ?? container;
            if (seqTarget) {
              const prevSeq = Number(seqTarget.getAttribute('data-render-seq') ?? '0');
              seqTarget.setAttribute('data-render-seq', String(prevSeq + 1));
            }
            renderBusy = false;
            if (!disposed && (renderDirty || needsContinue)) {
              requestRender();
            }
          };

          if (isSoftwareGl) {
            afterDraw(done);
          } else {
            done();
          }
        });
      }

      requestRenderRef.current = requestRender;

      // Pointer & Raycaster interaction: click piece to select, drag handles to resize
      const domEl = renderer.domElement;
      let pointerDownPos: { x: number; y: number } | null = null;
      let pointerMoved = false;
      let dragSession: DragSession | null = null;

      function setRayFromEvent(e: PointerEvent): void {
        const rect = domEl.getBoundingClientRect();
        _pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        _pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        _raycaster.setFromCamera(_pointerNdc, camera);
      }

      function handlePointerDown(e: PointerEvent): void {
        if (e.button !== 0) return;
        pointerDownPos = { x: e.clientX, y: e.clientY };
        pointerMoved = false;

        if (selectedRef.current && gizmo.group.visible) {
          setRayFromEvent(e);
          const hits = _raycaster.intersectObjects(gizmo.handleHitMeshes, false);
          if (hits.length > 0) {
            const handleId = hits[0].object.userData.gizmoHandleId as GizmoHandleId | undefined;
            if (handleId) {
              // Build drag plane
              modelBoxRef.current.getCenter(_boxCenter);
              if (handleId === 'top-y') {
                camera.getWorldDirection(_camDir);
                _camDir.y = 0;
                if (_camDir.lengthSq() < 1e-4) {
                  _camDir.set(0, 0, 1);
                } else {
                  _camDir.normalize();
                }
                _dragPlane.setFromNormalAndCoplanarPoint(_camDir, _boxCenter);
              } else {
                _dragPlane.set(new THREE.Vector3(0, 1, 0), -0.4);
              }

              if (_raycaster.ray.intersectPlane(_dragPlane, _dragHit)) {
                e.stopImmediatePropagation();
                controls.enabled = false;
                domEl.setPointerCapture(e.pointerId);
                domEl.style.cursor = cursorForHandle(handleId);
                const startDims = extractDimensions(configRef.current);
                dragSession = {
                  handleId,
                  pointerId: e.pointerId,
                  startHit: _dragHit.clone(),
                  startDims,
                  lastEmitted: { ...startDims },
                  template: configRef.current.template,
                };
                gizmo.setActiveHandle(handleId);
                requestRender();
              }
            }
          }
        }
      }

      function handlePointerMove(e: PointerEvent): void {
        if (dragSession) {
          e.stopImmediatePropagation();
          setRayFromEvent(e);
          if (!_raycaster.ray.intersectPlane(_dragPlane, _dragHit)) return;

          const { handleId, startHit, startDims, template } = dragSession;
          const locked = lockProportionsRef.current;
          const bounds = getTemplateDimensionBounds(template, buildPlatePropRef.current, {
            boxLetterLayout: configRef.current.boxLetterLayout,
            svgAttachMode: configRef.current.svgAttachMode,
          });
          const isFlat =
            template === 'keychain' ||
            template === 'plaque' ||
            template === 'svg-keychain' ||
            (template === 'box-letter' &&
              configRef.current.boxLetterLayout === 'separated');

          let nextDims: Dimensions3D = startDims;

          if (handleId === 'top-y') {
            const deltaY = _dragHit.y - startHit.y;
            if (isFlat) {
              nextDims = scaleDimensions(
                startDims,
                'depthMm',
                startDims.depthMm + deltaY,
                locked,
                bounds
              );
            } else {
              nextDims = scaleDimensions(
                startDims,
                'heightMm',
                startDims.heightMm + deltaY,
                locked,
                bounds
              );
            }
          } else if (handleId === 'side-px' || handleId === 'side-nx') {
            const sign = handleId === 'side-px' ? 1 : -1;
            const deltaX = (_dragHit.x - startHit.x) * sign;
            nextDims = scaleDimensions(
              startDims,
              'widthMm',
              startDims.widthMm + deltaX * 2,
              locked,
              bounds
            );
          } else if (handleId === 'side-pz' || handleId === 'side-nz') {
            const sign = handleId === 'side-pz' ? 1 : -1;
            const deltaZ = (_dragHit.z - startHit.z) * sign;
            if (isFlat) {
              nextDims = scaleDimensions(
                startDims,
                'heightMm',
                startDims.heightMm + deltaZ * 2,
                locked,
                bounds
              );
            } else {
              nextDims = scaleDimensions(
                startDims,
                'depthMm',
                startDims.depthMm + deltaZ * 2,
                locked,
                bounds
              );
            }
          } else {
            // Corner drag (X & Z simultaneously, plus Y when locked)
            const sx = handleId === 'corner-pp' || handleId === 'corner-pn' ? 1 : -1;
            const sz = handleId === 'corner-pp' || handleId === 'corner-np' ? 1 : -1;
            const deltaX = (_dragHit.x - startHit.x) * sx;
            const deltaZ = (_dragHit.z - startHit.z) * sz;

            if (isFlat) {
              const reqW = startDims.widthMm + deltaX * 2;
              const reqH = startDims.heightMm + deltaZ * 2;
              if (locked) {
                const ratioW = reqW / Math.max(1, startDims.widthMm);
                const ratioH = reqH / Math.max(1, startDims.heightMm);
                const avgRatio = (ratioW + ratioH) * 0.5;
                nextDims = scaleDimensions(
                  startDims,
                  'widthMm',
                  startDims.widthMm * avgRatio,
                  true,
                  bounds
                );
              } else {
                const wScaled = scaleDimensions(startDims, 'widthMm', reqW, false, bounds);
                nextDims = scaleDimensions(wScaled, 'heightMm', reqH, false, bounds);
              }
            } else {
              nextDims = scaleDimensionsFromCorner(
                startDims,
                startDims.widthMm + deltaX * 2,
                startDims.depthMm + deltaZ * 2,
                locked,
                bounds
              );
            }
          }

          if (
            nextDims.widthMm !== dragSession.lastEmitted.widthMm ||
            nextDims.heightMm !== dragSession.lastEmitted.heightMm ||
            nextDims.depthMm !== dragSession.lastEmitted.depthMm
          ) {
            dragSession.lastEmitted = nextDims;
            onDimensionsChangeRef.current(nextDims);
          }
          return;
        }

        if (pointerDownPos) {
          const dx = e.clientX - pointerDownPos.x;
          const dy = e.clientY - pointerDownPos.y;
          if (dx * dx + dy * dy > 25) {
            pointerMoved = true;
          }
        }

        // Hover cursor & handle highlight feedback when idle
        if (e.buttons === 0) {
          setRayFromEvent(e);
          if (selectedRef.current && gizmo.group.visible) {
            const handleHits = _raycaster.intersectObjects(gizmo.handleHitMeshes, false);
            if (handleHits.length > 0) {
              const hid = handleHits[0].object.userData.gizmoHandleId as GizmoHandleId;
              gizmo.setHoveredHandle(hid);
              domEl.style.cursor = cursorForHandle(hid);
              requestRender();
              return;
            }
          }

          gizmo.setHoveredHandle(null);
          const modelGroup = activeModelRef.current?.group;
          if (modelGroup) {
            const printable = collectPrintableMeshes(modelGroup);
            const modelHits = _raycaster.intersectObjects(printable, false);
            domEl.style.cursor = modelHits.length > 0 ? 'pointer' : 'grab';
          } else {
            domEl.style.cursor = 'grab';
          }
        }
      }

      function handlePointerUp(e: PointerEvent): void {
        if (dragSession) {
          e.stopImmediatePropagation();
          if (domEl.hasPointerCapture(dragSession.pointerId)) {
            domEl.releasePointerCapture(dragSession.pointerId);
          }
          dragSession = null;
          controls.enabled = true;
          gizmo.setActiveHandle(null);
          domEl.style.cursor = 'grab';
          requestRender();
          pointerDownPos = null;
          return;
        }

        if (e.button === 0 && pointerDownPos && !pointerMoved) {
          setRayFromEvent(e);
          const modelGroup = activeModelRef.current?.group;
          if (modelGroup) {
            const printable = collectPrintableMeshes(modelGroup);
            const hits = _raycaster.intersectObjects(printable, false);
            onSelectChangeRef.current(hits.length > 0);
          } else {
            onSelectChangeRef.current(false);
          }
        }
        pointerDownPos = null;
      }

      // Use capture phase for pointerdown/move/up so handle drags cleanly preempt OrbitControls
      domEl.addEventListener('pointerdown', handlePointerDown, { capture: true });
      domEl.addEventListener('pointermove', handlePointerMove, { capture: true });
      domEl.addEventListener('pointerup', handlePointerUp, { capture: true });

      const handleControlsStart = () => {
        transitionRef.current.active = false;
        onUserOrbitRef.current?.();
      };
      const handleControlsChange = () => {
        requestRender();
      };

      controls.addEventListener('start', handleControlsStart);
      controls.addEventListener('change', handleControlsChange);

      const handleResize = () => {
        const w = container.clientWidth || window.innerWidth;
        const h = container.clientHeight || window.innerHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        requestRender();
      };

      const resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(container);

      const handleContextLost = (e: Event) => {
        e.preventDefault();
        setContextLost(true);
      };
      const handleContextRestored = () => {
        setContextLost(false);
        requestRender();
      };

      domEl.addEventListener('webglcontextlost', handleContextLost);
      domEl.addEventListener('webglcontextrestored', handleContextRestored);

      if (!isSoftwareGl) {
        renderer.compile(scene, camera);
      }
      requestRender();

      return () => {
        disposed = true;
        cancelAnimationFrame(frameId);
        clearTimeout(frameId);
        resizeObserver.disconnect();
        domEl.removeEventListener('pointerdown', handlePointerDown, { capture: true });
        domEl.removeEventListener('pointermove', handlePointerMove, { capture: true });
        domEl.removeEventListener('pointerup', handlePointerUp, { capture: true });
        controls.removeEventListener('start', handleControlsStart);
        controls.removeEventListener('change', handleControlsChange);
        controls.dispose();
        domEl.removeEventListener('webglcontextlost', handleContextLost);
        domEl.removeEventListener('webglcontextrestored', handleContextRestored);

        if (activeModelRef.current) {
          scene.remove(activeModelRef.current.group);
          activeModelRef.current.disposeGeometries();
          activeModelRef.current = null;
        }
        if (activeMaterialsRef.current) {
          activeMaterialsRef.current.dispose();
          activeMaterialsRef.current = null;
        }
        scene.remove(gizmo.group);
        gizmo.dispose();
        plateRig.dispose();
        bumpTex?.dispose();
        envRT.dispose();
        renderer.dispose();
        if (domEl.parentNode === container) {
          container.removeChild(domEl);
        }
      };
    }, []);

    // Rebuild parametric 3D model cleanly whenever valid config changes
    useEffect(() => {
      const scene = sceneRef.current;
      if (!scene || !isTextValid) return;

      if (activeModelRef.current) {
        scene.remove(activeModelRef.current.group);
        activeModelRef.current.disposeGeometries();
        activeModelRef.current = null;
      }
      if (activeMaterialsRef.current) {
        activeMaterialsRef.current.dispose();
        activeMaterialsRef.current = null;
      }

      const materials = createFilamentMaterialPair(
        config.primaryColor,
        config.accentColor,
        config.useDualColor,
        config.finish,
        bumpTexRef.current
      );
      activeMaterialsRef.current = materials;

      const built = buildProjectModel(config, materials.primary, materials.accent);
      activeModelRef.current = built;
      scene.add(built.group);

      computePrintableBox(built.group, modelBoxRef.current);
      if (gizmoRef.current) {
        gizmoRef.current.updateForBox(modelBoxRef.current);
        gizmoRef.current.group.visible = selectedRef.current;
      }

      const metrics = computePrintMetrics(built.group);
      latestMetricsRef.current = metrics;
      buildPlateRef.current?.updateShadowForBounds(metrics.widthMm, metrics.depthMm);
      onMetricsChangeRef.current(metrics);

      requestRenderRef.current();
    }, [config, isTextValid]);

    // Sync selection gizmo visibility whenever `selected` changes
    useEffect(() => {
      const gizmo = gizmoRef.current;
      if (!gizmo) return;
      gizmo.group.visible = selected;
      if (selected && !modelBoxRef.current.isEmpty()) {
        gizmo.updateForBox(modelBoxRef.current);
      }
      requestRenderRef.current();
    }, [selected]);

    // Smooth camera preset transitions
    useEffect(() => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;

      const pose = getCameraPose(
        config.template,
        cameraPreset,
        config.boxLetterLayout
      );
      _targetPos.set(...pose.position);
      _targetLook.set(...pose.target);

      transitionRef.current.pos.copy(_targetPos);
      transitionRef.current.look.copy(_targetLook);
      transitionRef.current.active = true;
      requestRenderRef.current();
    }, [config.template, config.boxLetterLayout, cameraPreset, cameraNonce]);

    // Sync 3D studio scene & PEI build plate cleanly on Light / Dark theme toggle
    useEffect(() => {
      const scene = sceneRef.current;
      if (!scene) return;
      const bgHex = theme === 'dark' ? 0x111620 : 0xeceff3;
      if (scene.background instanceof THREE.Color) {
        scene.background.setHex(bgHex);
      } else {
        scene.background = new THREE.Color(bgHex);
      }
      if (scene.fog instanceof THREE.Fog) {
        scene.fog.color.setHex(bgHex);
      }
      buildPlateRef.current?.setTheme(theme);
      requestRenderRef.current();
    }, [theme]);

    // Resize PEI build plate, shadow frustum & orbit maxDistance cleanly in-place
    useEffect(() => {
      buildPlateRef.current?.setSize(buildPlate);
      const maxSpan = Math.max(buildPlate.widthMm, buildPlate.depthMm);
      if (keyLightRef.current) {
        const d = maxSpan * 0.62;
        keyLightRef.current.shadow.camera.left = -d;
        keyLightRef.current.shadow.camera.right = d;
        keyLightRef.current.shadow.camera.top = d;
        keyLightRef.current.shadow.camera.bottom = -d;
        keyLightRef.current.shadow.camera.updateProjectionMatrix();
      }
      if (controlsRef.current) {
        controlsRef.current.maxDistance = Math.max(520, maxSpan * 2.4);
      }
      requestRenderRef.current();
    }, [buildPlate]);

    return (
      <div
        className="relative w-full h-full overflow-hidden bg-[#ECEFF3] dark:bg-[#111620] transition-colors"
        data-testid="viewport-container"
        data-template={config.template}
        data-camera={cameraPreset}
        data-theme={theme}
        data-bed={`${buildPlate.widthMm}x${buildPlate.depthMm}x${buildPlate.heightMm}`}
        data-selected={selected ? 'true' : 'false'}
        data-state={webglUnavailable ? 'fallback' : contextLost ? 'context-lost' : 'ready'}
      >
        {/* Dedicated empty WebGL mount container isolated from React overlays */}
        <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

        {/* Screen-projected 3D millimeter dimension tags (updated directly in render pass, zero setState) */}
        <div
          ref={xBadgeRef}
          data-testid="badge-dim-x"
          aria-hidden="true"
          style={{ opacity: 0 }}
          className="pointer-events-none absolute top-0 left-0 z-10 rounded-md border border-[#0284C7]/45 dark:border-[#38BDF8]/55 bg-[#FFFFFF]/95 dark:bg-[#161B26]/95 px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-[#0F172A] dark:text-[#E2E8F0] shadow-xs whitespace-nowrap"
        />
        <div
          ref={yBadgeRef}
          data-testid="badge-dim-y"
          aria-hidden="true"
          style={{ opacity: 0 }}
          className="pointer-events-none absolute top-0 left-0 z-10 rounded-md border border-[#0284C7]/45 dark:border-[#38BDF8]/55 bg-[#FFFFFF]/95 dark:bg-[#161B26]/95 px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-[#0F172A] dark:text-[#E2E8F0] shadow-xs whitespace-nowrap"
        />
        <div
          ref={zBadgeRef}
          data-testid="badge-dim-z"
          aria-hidden="true"
          style={{ opacity: 0 }}
          className="pointer-events-none absolute top-0 left-0 z-10 rounded-md border border-[#0284C7]/45 dark:border-[#38BDF8]/55 bg-[#FFFFFF]/95 dark:bg-[#161B26]/95 px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-[#0F172A] dark:text-[#E2E8F0] shadow-xs whitespace-nowrap"
        />

        {/* Graceful fallback if WebGL is unavailable or context lost */}
        {(webglUnavailable || contextLost) && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#ECEFF3] dark:bg-[#111620] p-6 text-center">
            <div className="max-w-sm rounded-xl border border-[#D7DDE7] dark:border-[#273043] bg-white dark:bg-[#161B26] p-6 shadow-sm">
              <h2 className="font-display text-lg font-semibold text-[#171A21] dark:text-[#F1F5F9]">
                Visualização 3D indisponível
              </h2>
              <p className="mt-2 text-sm text-[#4D5666] dark:text-[#94A3B8]">
                {contextLost
                  ? 'O contexto gráfico WebGL foi interrompido. Recarregue a página para restaurar a pré-visualização.'
                  : 'Seu navegador não pôde iniciar o WebGL para exibir a mesa 3D.'}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }
);
