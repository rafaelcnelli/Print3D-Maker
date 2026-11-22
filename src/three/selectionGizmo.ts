import * as THREE from 'three';

export type GizmoHandleId =
  | 'corner-pp'
  | 'corner-pn'
  | 'corner-np'
  | 'corner-nn'
  | 'side-px'
  | 'side-nx'
  | 'side-pz'
  | 'side-nz'
  | 'top-y';

export interface SelectionGizmoAnchors {
  xLabel: THREE.Vector3;
  yLabel: THREE.Vector3;
  zLabel: THREE.Vector3;
}

export interface SelectionGizmoRig {
  group: THREE.Group;
  handleHitMeshes: THREE.Mesh[];
  anchors: SelectionGizmoAnchors;
  updateForBox: (box: THREE.Box3) => void;
  setHoveredHandle: (id: GizmoHandleId | null) => void;
  setActiveHandle: (id: GizmoHandleId | null) => void;
  dispose: () => void;
}

interface HandleVisual {
  id: GizmoHandleId;
  root: THREE.Group;
  hitMesh: THREE.Mesh;
  visualMesh: THREE.Mesh;
  baseMaterial: THREE.MeshBasicMaterial;
}

function markNonExportable(obj: THREE.Object3D): void {
  obj.userData.excludeFromExport = true;
}

/**
 * Tinkercad-inspired 3D interactive selection bounding box & resize handles.
 * Displays:
 *  - Cyan selection perimeter accent + crisp dashed footprint on the build plate
 *  - 4 white corner handles with dark outlines (X & Z, or uniform XYZ when locked)
 *  - 4 dark charcoal mid-side handles (single-axis X or Z)
 *  - Vertical dashed height stem + white top handle (Y height / thickness)
 * Every object has userData.excludeFromExport = true so STL/OBJ exports stay 100% pure.
 */
export function createSelectionGizmoRig(): SelectionGizmoRig {
  const group = new THREE.Group();
  group.name = 'SelectionGizmo';
  group.visible = false;
  markNonExportable(group);

  const disposables: { dispose: () => void }[] = [];

  // 1. Dashed footprint rectangle on the bed (Y = 0.35mm)
  const footprintPositions = new Float32Array(5 * 3);
  const footprintGeo = new THREE.BufferGeometry();
  footprintGeo.setAttribute('position', new THREE.BufferAttribute(footprintPositions, 3));
  disposables.push(footprintGeo);

  const footprintMat = new THREE.LineDashedMaterial({
    color: 0x1e293b,
    dashSize: 2.6,
    gapSize: 1.8,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
  });
  disposables.push(footprintMat);

  const footprintLine = new THREE.Line(footprintGeo, footprintMat);
  footprintLine.renderOrder = 20;
  markNonExportable(footprintLine);
  group.add(footprintLine);

  // 2. Subtle cyan selection cage accent around full 3D bounding box
  const cyanBoxGeo = new THREE.BoxGeometry(1, 1, 1);
  const cyanEdgesGeo = new THREE.EdgesGeometry(cyanBoxGeo);
  cyanBoxGeo.dispose();
  disposables.push(cyanEdgesGeo);

  const cyanEdgesMat = new THREE.LineBasicMaterial({
    color: 0x0ea5e9,
    transparent: true,
    opacity: 0.58,
  });
  disposables.push(cyanEdgesMat);

  const cyanCage = new THREE.LineSegments(cyanEdgesGeo, cyanEdgesMat);
  cyanCage.renderOrder = 18;
  markNonExportable(cyanCage);
  group.add(cyanCage);

  // 3. Vertical dashed height ruler stem rising from bed center to top handle
  const stemPositions = new Float32Array(2 * 3);
  const stemGeo = new THREE.BufferGeometry();
  stemGeo.setAttribute('position', new THREE.BufferAttribute(stemPositions, 3));
  disposables.push(stemGeo);

  const stemMat = new THREE.LineDashedMaterial({
    color: 0x1e293b,
    dashSize: 2.0,
    gapSize: 1.6,
    transparent: true,
    opacity: 0.92,
    depthTest: false,
  });
  disposables.push(stemMat);

  const stemLine = new THREE.Line(stemGeo, stemMat);
  stemLine.renderOrder = 21;
  markNonExportable(stemLine);
  group.add(stemLine);

  // 4. Shared handle geometries & materials
  const cornerVisualGeo = new THREE.BoxGeometry(4.4, 2.2, 4.4);
  const sideVisualGeo = new THREE.BoxGeometry(3.4, 2.0, 3.4);
  const topVisualGeo = new THREE.BoxGeometry(4.6, 3.6, 4.6);
  const hitGeo = new THREE.BoxGeometry(10.5, 8.5, 10.5);
  const cornerEdgeGeo = new THREE.EdgesGeometry(cornerVisualGeo);
  const sideEdgeGeo = new THREE.EdgesGeometry(sideVisualGeo);
  const topEdgeGeo = new THREE.EdgesGeometry(topVisualGeo);
  disposables.push(
    cornerVisualGeo,
    sideVisualGeo,
    topVisualGeo,
    hitGeo,
    cornerEdgeGeo,
    sideEdgeGeo,
    topEdgeGeo
  );

  const whiteHandleMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const darkHandleMat = new THREE.MeshBasicMaterial({
    color: 0x262c36,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const hoverHandleMat = new THREE.MeshBasicMaterial({
    color: 0x0ea5e9,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const activeHandleMat = new THREE.MeshBasicMaterial({
    color: 0xd93848,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const outlineMat = new THREE.LineBasicMaterial({
    color: 0x1e293b,
    depthTest: true,
  });
  const hitMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
  });
  disposables.push(
    whiteHandleMat,
    darkHandleMat,
    hoverHandleMat,
    activeHandleMat,
    outlineMat,
    hitMat
  );

  const handleDefs: { id: GizmoHandleId; kind: 'corner' | 'side' | 'top' }[] = [
    { id: 'corner-pp', kind: 'corner' },
    { id: 'corner-pn', kind: 'corner' },
    { id: 'corner-np', kind: 'corner' },
    { id: 'corner-nn', kind: 'corner' },
    { id: 'side-px', kind: 'side' },
    { id: 'side-nx', kind: 'side' },
    { id: 'side-pz', kind: 'side' },
    { id: 'side-nz', kind: 'side' },
    { id: 'top-y', kind: 'top' },
  ];

  const handles = new Map<GizmoHandleId, HandleVisual>();
  const handleHitMeshes: THREE.Mesh[] = [];

  for (const def of handleDefs) {
    const root = new THREE.Group();
    root.name = `Handle_${def.id}`;
    markNonExportable(root);

    const visualGeo =
      def.kind === 'corner'
        ? cornerVisualGeo
        : def.kind === 'side'
          ? sideVisualGeo
          : topVisualGeo;
    const edgeGeo =
      def.kind === 'corner'
        ? cornerEdgeGeo
        : def.kind === 'side'
          ? sideEdgeGeo
          : topEdgeGeo;
    const baseMaterial = def.kind === 'side' ? darkHandleMat : whiteHandleMat;

    const visualMesh = new THREE.Mesh(visualGeo, baseMaterial);
    visualMesh.renderOrder = 24;
    markNonExportable(visualMesh);
    root.add(visualMesh);

    const outline = new THREE.LineSegments(edgeGeo, outlineMat);
    outline.renderOrder = 25;
    markNonExportable(outline);
    root.add(outline);

    const hitMesh = new THREE.Mesh(hitGeo, hitMat);
    hitMesh.userData.gizmoHandleId = def.id;
    hitMesh.renderOrder = 26;
    markNonExportable(hitMesh);
    root.add(hitMesh);

    group.add(root);
    handleHitMeshes.push(hitMesh);
    handles.set(def.id, {
      id: def.id,
      root,
      hitMesh,
      visualMesh,
      baseMaterial,
    });
  }

  let hoveredId: GizmoHandleId | null = null;
  let activeId: GizmoHandleId | null = null;

  function refreshHandleMaterials(): void {
    for (const h of handles.values()) {
      if (h.id === activeId) {
        h.visualMesh.material = activeHandleMat;
        h.root.scale.setScalar(1.22);
      } else if (h.id === hoveredId) {
        h.visualMesh.material = hoverHandleMat;
        h.root.scale.setScalar(1.14);
      } else {
        h.visualMesh.material = h.baseMaterial;
        h.root.scale.setScalar(1.0);
      }
    }
  }

  const anchors: SelectionGizmoAnchors = {
    xLabel: new THREE.Vector3(),
    yLabel: new THREE.Vector3(),
    zLabel: new THREE.Vector3(),
  };

  function updateForBox(box: THREE.Box3): void {
    if (box.isEmpty()) return;

    const pad = 1.6;
    const minX = box.min.x - pad;
    const maxX = box.max.x + pad;
    const minZ = box.min.z - pad;
    const maxZ = box.max.z + pad;
    const minY = Math.max(0.25, box.min.y);
    const maxY = Math.max(minY + 1, box.max.y);
    const cx = (minX + maxX) * 0.5;
    const cz = (minZ + maxZ) * 0.5;
    const bedY = 0.4;

    // Scale handle proportions subtly for smaller pieces like keychains
    const span = Math.max(maxX - minX, maxZ - minZ);
    const handleScale = THREE.MathUtils.clamp(span / 105, 0.65, 1.15);

    // 1. Update dashed footprint perimeter
    const fp = footprintGeo.getAttribute('position') as THREE.BufferAttribute;
    fp.setXYZ(0, minX, bedY, minZ);
    fp.setXYZ(1, maxX, bedY, minZ);
    fp.setXYZ(2, maxX, bedY, maxZ);
    fp.setXYZ(3, minX, bedY, maxZ);
    fp.setXYZ(4, minX, bedY, minZ);
    fp.needsUpdate = true;
    footprintLine.computeLineDistances();

    // 2. Update cyan selection cage
    cyanCage.scale.set(
      Math.max(1, maxX - minX),
      Math.max(0.8, maxY - box.min.y + 0.6),
      Math.max(1, maxZ - minZ)
    );
    cyanCage.position.set(cx, (box.min.y + maxY) * 0.5 + 0.2, cz);

    // 3. Update vertical height ruler stem (slightly forward so it never hides inside tall letters)
    const topHandleY = maxY + Math.max(5.5, 7 * handleScale);
    const stemAttr = stemGeo.getAttribute('position') as THREE.BufferAttribute;
    stemAttr.setXYZ(0, cx, bedY, cz);
    stemAttr.setXYZ(1, cx, topHandleY, cz);
    stemAttr.needsUpdate = true;
    stemLine.computeLineDistances();

    // 4. Position all 9 handles
    const setPos = (id: GizmoHandleId, x: number, y: number, z: number) => {
      const h = handles.get(id);
      if (!h) return;
      h.root.position.set(x, y, z);
      h.root.scale.setScalar(handleScale);
    };

    const cornerY = bedY + 1.1 * handleScale;
    setPos('corner-pp', maxX, cornerY, maxZ);
    setPos('corner-pn', maxX, cornerY, minZ);
    setPos('corner-np', minX, cornerY, maxZ);
    setPos('corner-nn', minX, cornerY, minZ);

    setPos('side-px', maxX, cornerY, cz);
    setPos('side-nx', minX, cornerY, cz);
    setPos('side-pz', cx, cornerY, maxZ);
    setPos('side-nz', cx, cornerY, minZ);

    setPos('top-y', cx, topHandleY, cz);

    // 5. Update 3D anchor points for screen-space mm badges
    anchors.xLabel.set(cx, bedY + 1.5, maxZ + 8.5);
    anchors.zLabel.set(maxX + 9.5, bedY + 1.5, cz);
    anchors.yLabel.set(cx + 12, topHandleY + 3.5, cz);

    refreshHandleMaterials();
  }

  return {
    group,
    handleHitMeshes,
    anchors,
    updateForBox,
    setHoveredHandle: (id) => {
      if (hoveredId === id) return;
      hoveredId = id;
      refreshHandleMaterials();
    },
    setActiveHandle: (id) => {
      if (activeId === id) return;
      activeId = id;
      refreshHandleMaterials();
    },
    dispose: () => {
      for (const d of disposables) {
        d.dispose();
      }
    },
  };
}
