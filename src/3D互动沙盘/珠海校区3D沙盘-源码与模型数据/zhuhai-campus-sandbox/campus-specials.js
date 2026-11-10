/* Photo-based miniature. Dimensions are visual proportions, not a surveyed model.
   Call makeObservatory() after the terrain and ordinary buildings are created. */
function makeObservatory() {
  const landmark = DATA.landmarks.find(l => l.id === 'observatory');
  if (!landmark) return null;
  const previous = features.find(f => f.id === 'observatory');
  if (previous) return previous;

  const group = new T.Group();
  group.name = 'observatory-photo-model';
  const site = { cx: 13, cz: 0, width: 112, depth: 80, radius: 9 };
  const rotation = Number.isFinite(landmark.rotationRadians) ? landmark.rotationRadians : 0;
  // Raise a flat paved plateau just above the sampled hill surface. Its retaining
  // plinth reaches the low side of the slope; the building itself stays level.
  const samples = [];
  for (let iz = 0; iz < 5; iz++) for (let ix = 0; ix < 5; ix++) {
    const x = site.cx - site.width / 2 + ix * site.width / 4;
    const z = site.cz - site.depth / 2 + iz * site.depth / 4;
    const px = landmark.cx + x * Math.cos(rotation) + z * Math.sin(rotation);
    const py = landmark.cy - x * Math.sin(rotation) + z * Math.cos(rotation);
    samples.push(terrainHeight(px, py));
  }
  const base = Math.max(...samples) + 0.55;
  const retainingDepth = Math.max(2.4, base - Math.min(...samples) + 0.7);
  group.position.set(landmark.cx - CX, base, landmark.cy - CZ);
  group.rotation.y = rotation;

  const white = standard(0xf0eee8, { roughness: 0.88, metalness: 0.01 });
  const roof = standard(0xdeddd3, { roughness: 0.94, metalness: 0.01 });
  const stone = standard(0xb8b7a8, { roughness: 1, metalness: 0 });
  const paving = standard(0xd7d5c7, { roughness: 1, metalness: 0 });
  const glazing = standard(0x536164, { roughness: 0.35, metalness: 0.16 });
  const frame = standard(0xa8aaa5, { roughness: 0.62, metalness: 0.15 });
  const fenceMetal = standard(0x707772, { roughness: 0.75, metalness: 0.12 });
  const grass = standard(0x8e996b, { roughness: 1, metalness: 0 });

  function box(w, h, d, material, x, y, z) {
    return boxMesh(w, h, d, material, x, y, z, group);
  }
  function roundedShape(width, depth, radius, clockwise = false) {
    const shape = clockwise ? new T.Path() : new T.Shape();
    const x = -width / 2, y = -depth / 2, r = radius;
    shape.moveTo(x + r, y);
    shape.lineTo(x + width - r, y);
    shape.quadraticCurveTo(x + width, y, x + width, y + r);
    shape.lineTo(x + width, y + depth - r);
    shape.quadraticCurveTo(x + width, y + depth, x + width - r, y + depth);
    shape.lineTo(x + r, y + depth);
    shape.quadraticCurveTo(x, y + depth, x, y + depth - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);
    return shape;
  }
  function extrusion(shape, height, material, x, y, z) {
    const geometry = new T.ExtrudeGeometry(shape, {
      depth: height, bevelEnabled: false, steps: 1, curveSegments: 8
    });
    geometry.rotateX(-Math.PI / 2);
    const mesh = new T.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }
  function cylinder(radiusTop, radiusBottom, height, material, x, y, z, segments = 32) {
    const mesh = new T.Mesh(new T.CylinderGeometry(radiusTop, radiusBottom, height, segments), material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }
  function instances(items, geometry, material, name) {
    if (!items.length) return;
    const mesh = new T.InstancedMesh(geometry, material, items.length);
    mesh.name = name;
    const matrix = new T.Matrix4(), quaternion = new T.Quaternion();
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      quaternion.setFromAxisAngle(new T.Vector3(0, 1, 0), p.rotation || 0);
      matrix.compose(new T.Vector3(p.x, p.y, p.z), quaternion, new T.Vector3(p.w, p.h, p.d));
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  }

  extrusion(roundedShape(site.width, site.depth, site.radius), retainingDepth,
    stone, site.cx, -retainingDepth, site.cz);
  extrusion(roundedShape(site.width - 0.3, site.depth - 0.3, site.radius), 0.24,
    paving, site.cx, -0.08, site.cz);
  // A grass island separates the narrow white enclosure from the main building.
  box(27, 0.09, 48, grass, 40, 0.2, 0);

  // Two-storey white rectangular main building: 45 × 28, about 11 units high.
  box(45, 10.6, 28, white, 0, 5.6, 0);
  box(46.4, 0.38, 29.3, roof, 0, 11.09, 0);
  box(46.4, 0.6, 0.5, white, 0, 11.5, -14.4);
  box(46.4, 0.6, 0.5, white, 0, 11.5, 14.4);
  box(0.5, 0.6, 28.3, white, -22.95, 11.5, 0);
  box(0.5, 0.6, 28.3, white, 22.95, 11.5, 0);
  // Shallow stone skirting, continuous floor band, and front entrance porch.
  box(45.4, 0.55, 28.4, stone, 0, 0.59, 0);
  box(45.35, 0.22, 28.35, roof, 0, 5.1, 0);
  box(14, 0.38, 6, roof, 0, 4.65, 16.2);
  box(0.45, 4.1, 0.45, white, -6.1, 2.6, 18.5);
  box(0.45, 4.1, 0.45, white, 6.1, 2.6, 18.5);
  box(10, 3.5, 0.14, glazing, 0, 2.6, 14.1);
  box(14, 0.35, 5.4, stone, 0, 0.37, 17.9);
  box(15.4, 0.22, 6.8, paving, 0, 0.18, 19.2);

  // Batch repeated windows and mullions to keep the miniature inexpensive.
  const windows = [], frames = [];
  function windowAt(x, y, z, side = false, width = 1.75, height = 2.9) {
    windows.push({ x, y, z, w: side ? 0.12 : width, h: height, d: side ? width : 0.12 });
    const dx = side ? 0 : width / 2 + 0.07, dz = side ? width / 2 + 0.07 : 0;
    for (let sign of [-1, 1]) frames.push({ x: x + sign * dx, y, z: z + sign * dz,
      w: side ? 0.17 : 0.12, h: height + 0.22, d: side ? 0.12 : 0.17 });
    for (let sign of [-1, 1]) frames.push({ x, y: y + sign * (height / 2 + 0.05), z,
      w: side ? 0.17 : width + 0.22, h: 0.11, d: side ? width + 0.22 : 0.17 });
  }
  for (const x of [1, 4.5, 8, 11.5, 17, 20.5]) windowAt(x, 8.1, 14.09);
  for (const x of [-18.5, -14.7, 15, 19]) windowAt(x, 2.8, 14.09, false, 1.9, 2.5);
  for (const y of [2.8, 8.1]) {
    for (const x of [-18, -12, -6, 0, 6, 12, 18]) windowAt(x, y, -14.09);
    for (const z of [-9, -3, 3, 9]) {
      windowAt(-22.59, y, z, true);
      windowAt(22.59, y, z, true);
    }
  }
  instances(windows, new T.BoxGeometry(1, 1, 1), glazing, 'observatory-windows');
  instances(frames, new T.BoxGeometry(1, 1, 1), frame, 'observatory-window-frames');

  // Offset rear-left instrument dome. It is a real half sphere on a cylindrical
  // drum, rather than a complete sphere sinking through the flat roof.
  const domeX = -16, domeZ = -11.8, drumTop = 14.25;
  cylinder(8.1, 8.1, drumTop - 0.24, white, domeX, (drumTop + 0.24) / 2, domeZ, 48);
  cylinder(8.35, 8.35, 0.34, roof, domeX, drumTop - 0.17, domeZ, 48);
  const dome = new T.Mesh(new T.SphereGeometry(8, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), white);
  dome.position.set(domeX, drumTop, domeZ);
  group.add(dome);
  const ribs = [];
  for (let k = 0; k < 16; k++) {
    const azimuth = k / 16 * Math.PI * 2;
    for (let j = 0; j < 12; j++) {
      for (const polar of [j / 12 * Math.PI / 2, (j + 1) / 12 * Math.PI / 2]) {
        ribs.push(domeX + Math.sin(polar) * 8.025 * Math.cos(azimuth),
          drumTop + Math.cos(polar) * 8.025,
          domeZ + Math.sin(polar) * 8.025 * Math.sin(azimuth));
      }
    }
  }
  const ribGeometry = new T.BufferGeometry();
  ribGeometry.setAttribute('position', new T.Float32BufferAttribute(ribs, 3));
  group.add(new T.LineSegments(ribGeometry, new T.LineBasicMaterial({ color: 0xc3c6c1 })));
  // The slender mast visible in the supplied photograph, kept intentionally fine.
  cylinder(0.055, 0.13, 21, frame, -20.2, 21.9, -10.6, 8);

  // Adjacent long rounded enclosure is open at the top in the photograph.
  // A shaped wall with a true interior hole avoids turning it into another dome.
  const enclosure = roundedShape(17, 43, 5.2);
  enclosure.holes.push(roundedShape(15.4, 41.4, 4.4, true));
  extrusion(enclosure, 10.2, white, 42, 0.24, -0.5);
  extrusion(roundedShape(15.3, 41.3, 4.3), 0.11, roof, 42, 0.24, -0.5);
  const coping = roundedShape(17.25, 43.25, 5.32);
  coping.holes.push(roundedShape(15.2, 41.2, 4.3, true));
  extrusion(coping, 0.18, roof, 42, 10.42, -0.5);

  // Low white perimeter piers and fine dark railings, with a southeast gate gap.
  const outline = roundedShape(site.width - 2.2, site.depth - 2.2, site.radius).getSpacedPoints(104);
  const piers = [], pierCaps = [], bars = [], railVertices = [];
  let running = 0, nextPier = 0;
  function gate(x, z) { return z > 35 && x > 45 && x < 60; }
  for (let i = 0; i < outline.length - 1; i++) {
    const a = { x: outline[i].x + site.cx, z: -outline[i].y + site.cz };
    const b = { x: outline[i + 1].x + site.cx, z: -outline[i + 1].y + site.cz };
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.ceil(length / 1.15));
    for (let j = 0; j < steps; j++) {
      const t = j / steps, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      if (!gate(x, z)) bars.push({ x, y: 1.25, z, w: 0.07, h: 1.9, d: 0.07 });
    }
    while (nextPier <= running + length) {
      const t = (nextPier - running) / length;
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      if (!gate(x, z)) {
        piers.push({ x, y: 1.5, z, w: 0.85, h: 2.6, d: 0.85 });
        pierCaps.push({ x, y: 2.8, z, w: 0.86, h: 0.72, d: 0.86 });
      }
      nextPier += 6.3;
    }
    if (!gate((a.x + b.x) / 2, (a.z + b.z) / 2)) {
      for (const y of [0.55, 2.0]) railVertices.push(a.x, y, a.z, b.x, y, b.z);
    }
    running += length;
  }
  instances(piers, new T.BoxGeometry(1, 1, 1), white, 'observatory-fence-piers');
  instances(pierCaps, new T.SphereGeometry(0.5, 10, 6), white, 'observatory-rounded-pier-caps');
  instances(bars, new T.BoxGeometry(1, 1, 1), fenceMetal, 'observatory-fence-pickets');
  const railGeometry = new T.BufferGeometry();
  railGeometry.setAttribute('position', new T.Float32BufferAttribute(railVertices, 3));
  group.add(new T.LineSegments(railGeometry, new T.LineBasicMaterial({ color: 0x747973 })));

  // Legible photo-derived facade name when close enough; no external image asset.
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 768; canvas.height = 192;
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = '#303b39'; context.textAlign = 'center';
      context.font = '46px "Microsoft YaHei", sans-serif';
      context.fillText('中 山 大 学', 384, 70);
      context.font = '34px "Microsoft YaHei", sans-serif';
      context.fillText('天琴计划激光测距台站', 384, 132);
      const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace;
      const sign = new T.Mesh(new T.PlaneGeometry(18.5, 4.63),
        new T.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
      sign.position.set(-11.8, 8.05, 14.17);
      group.add(sign);
    }
  }

  const feature = {
    id: 'observatory', landmark, name: landmark.name || '天琴计划激光测距台站',
    category: 'teaching_research_office', planned: false,
    sourceMapStatus: 'existing_user_confirmed', status: 'existing_user_confirmed',
    height: 32.4, base, mesh: group, center: [landmark.cx, landmark.cy],
    modelSource: 'user-supplied observatory photograph; miniature proportions, not surveyed',
    plateau: { ...site, rotationRadians: rotation, topY: base + 0.16 }
  };
  group.userData.feature = feature;
  group.userData.landmark = landmark;
  group.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.userData.feature = feature;
    object.userData.landmark = landmark;
    pickables.push(object);
  });
  buildingsLayer.add(group);
  features.push(feature);
  landmarkObjects.set('observatory', feature);
  return feature;
}
