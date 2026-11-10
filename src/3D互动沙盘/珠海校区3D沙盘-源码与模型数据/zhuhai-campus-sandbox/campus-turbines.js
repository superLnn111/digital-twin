/* Four operating miniature horizontal-axis turbines in the existing test site.
   Call makeTestWindTurbines() after makeCampusSites(), and call
   updateWindTurbines(dt) once per rendered frame, independently of camera motion. */

var windTurbineRotors = [];

function makeTestWindTurbines() {
  const site = world.getObjectByName('campus-test-site');
  if (!site) return [];
  const existing = site.getObjectByName('test-site-wind-turbines');
  if (existing) {
    if (!windTurbineRotors.length) existing.traverse(o => {
      if (o.userData.isWindTurbineRotor) windTurbineRotors.push(o);
    });
    return windTurbineRotors;
  }
  const feature = site.userData.feature || features.find(f => f.id === 'test-site');
  const landmark = feature?.landmark || site.userData.landmark;
  const group = new T.Group();
  group.name = 'test-site-wind-turbines';
  group.userData = { kind: 'operating-wind-turbines', turbineCount: 4,
    schematicDimensions: true, planned: false, independentOfCameraAnimation: true };
  site.add(group);

  const shell = standard(0xe9ece8, { roughness: 0.62, metalness: 0.12 });
  const concrete = standard(0xc4c7be, { roughness: 1, metalness: 0 });
  const gray = standard(0xa0aba8, { roughness: 0.55, metalness: 0.25 });
  const dark = standard(0x5b6968, { roughness: 0.72, metalness: 0.15 });
  const bladeWhite = standard(0xeff0e9, { roughness: 0.6, metalness: 0.06, side: T.DoubleSide });
  const bladeTip = standard(0xa77469, { roughness: 0.7, metalness: 0.03, side: T.DoubleSide });
  const benchMat = standard(0xb0b5a6, { roughness: 0.8, metalness: 0.1 });
  const boxMat = standard(0x6d7568, { roughness: 0.65, metalness: 0.4 });
  const cableMat = standard(0x3a4040, { roughness: 0.5, metalness: 0.1 });
  const camMat = standard(0x3c4245, { roughness: 0.4, metalness: 0.35 });
  const antennaMat = standard(0xd8ddd0, { roughness: 0.3, metalness: 0.5 });

  function bladeGeometry() {
    const stations = [
      [1.16, 0.43, 19], [2.13, 0.86, 16], [3.83, 0.96, 12],
      [6.21, 0.74, 8], [8.67, 0.38, 4], [9.44, 0.24, 3], [10.2, 0.11, 2]
    ];
    const chordSteps = 9, profile = [];
    for (let i = 0; i <= chordSteps; i++) profile.push([i / chordSteps, 1]);
    for (let i = chordSteps - 1; i > 0; i--) profile.push([i / chordSteps, -1]);
    const vertices = [], indices = [], ringSize = profile.length;
    for (const [radius, chord, pitch] of stations) {
      const theta = pitch * Math.PI / 180, sweep = -0.1 * (radius / 10.2) ** 2;
      for (const [u, side] of profile) {
        const thickness = side * 5 * 0.14 * chord *
          (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1036 * u ** 4);
        const x = (u - 0.35) * chord;
        vertices.push(x * Math.cos(theta) + thickness * Math.sin(theta) + sweep,
          radius, -x * Math.sin(theta) + thickness * Math.cos(theta));
      }
    }
    const geometry = new T.BufferGeometry();
    for (let s = 0; s < stations.length - 1; s++) {
      const first = indices.length;
      for (let j = 0; j < ringSize; j++) {
        const k = (j + 1) % ringSize;
        const a = s * ringSize + j, b = s * ringSize + k;
        const c = (s + 1) * ringSize + j, d = (s + 1) * ringSize + k;
        indices.push(a, b, c, b, d, c);
      }
      geometry.addGroup(first, indices.length - first, s >= stations.length - 2 ? 1 : 0);
    }
    for (const end of [0, stations.length - 1]) {
      const first = indices.length, offset = end * ringSize;
      for (let j = 1; j < ringSize - 1; j++) {
        if (end === 0) indices.push(offset, offset + j + 1, offset + j);
        else indices.push(offset, offset + j, offset + j + 1);
      }
      geometry.addGroup(first, indices.length - first, end === 0 ? 0 : 1);
    }
    geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return geometry;
  }

  const blade = bladeGeometry();
  const footingGeometry = new T.CylinderGeometry(2.15, 2.45, 0.5, 20);
  const nacelleGeometry = new T.CapsuleGeometry(0.78, 2.3, 4, 12);
  nacelleGeometry.rotateX(Math.PI / 2);
  const hubGeometry = new T.ConeGeometry(0.62, 1.1, 24);
  hubGeometry.rotateX(-Math.PI / 2);
  const shaftGeometry = new T.CylinderGeometry(0.23, 0.23, 0.9, 12);
  shaftGeometry.rotateX(Math.PI / 2);

  const yaw = 0.22;
  const benchY = 2.2;
  const turbineHeights = [18.8, 20, 19.3, 21.5];
  const avgHeight = (turbineHeights[0] + turbineHeights[1] + turbineHeights[2] + turbineHeights[3]) / 4;
  const rotorRadius = 10.2;

  // --- Long bench ---
  const benchX = 107, benchZ = 163;
  const bench = new T.Mesh(new T.BoxGeometry(48, 3.5, 7), benchMat);
  bench.position.set(benchX, benchY, benchZ);
  bench.name = 'test-bench'; bench.receiveShadow = true; bench.castShadow = true;
  group.add(bench);

  var legs = [];
  for (var lx = benchX - 22; lx <= benchX + 22; lx += 11) {
    for (var lz = benchZ - 2.5; lz <= benchZ + 2.5; lz += 5) {
      var leg = new T.Mesh(new T.BoxGeometry(1.5, benchY - 0.3, 1.5), concrete);
      leg.position.set(lx, (benchY - 0.3) / 2, lz);
      leg.castShadow = true; leg.receiveShadow = true;
      legs.push(leg.position);
      group.add(leg);
    }
  }

  // 4 turbines in a row, placed ON the bench
  const turbBaseZ = benchZ;
  const turbBaseY = benchY + 1.75;
  const turbX = [87, 100, 115, 128];
  const speeds = [1.63, 1.81, 1.54, 1.72];
  const phases = [0.18, 1.04, 2.13, 0.64];

  // --- Distribution box under bench, centered ---
  const distBox = new T.Mesh(new T.BoxGeometry(4.5, 1.6, 3), boxMat);
  distBox.position.set(benchX, 0.8, benchZ + 1.5);
  distBox.name = 'distribution-box'; distBox.castShadow = true; distBox.receiveShadow = true;
  group.add(distBox);
  const distBoxPos = { x: benchX, y: 1.6, z: benchZ + 1.5 };

  // --- Camera pole in front of bench ---
  const camPoleX = benchX, camPoleZ = benchZ - 10;
  const poleHeight = avgHeight * 0.85;
  const pole = new T.Mesh(new T.CylinderGeometry(0.35, 0.5, poleHeight, 12), dark);
  pole.position.set(camPoleX, poleHeight / 2 + 0.2, camPoleZ);
  pole.name = 'camera-pole'; pole.castShadow = true; group.add(pole);
  const camBox = new T.Mesh(new T.BoxGeometry(1.4, 0.9, 1.1), camMat);
  camBox.position.set(camPoleX, poleHeight + 0.65, camPoleZ - 0.25);
  camBox.name = 'camera-head'; camBox.castShadow = true; group.add(camBox);
  const camLens = new T.Mesh(new T.CylinderGeometry(0.2, 0.25, 0.7, 12), dark);
  camLens.rotation.x = Math.PI / 2;
  camLens.position.set(camPoleX, poleHeight + 0.4, camPoleZ - 0.85);
  camLens.name = 'camera-lens'; group.add(camLens);
  const camPos = { x: camPoleX, y: poleHeight + 0.4, z: camPoleZ - 0.85 };

  // --- Square antenna on right side of bench ---
  const antX = benchX + 24.5, antY = benchY + 4.0, antZ = benchZ;
  const antBracket = new T.Mesh(new T.CylinderGeometry(0.2, 0.2, 1.5, 8), dark);
  antBracket.position.set(antX, benchY + 1.5 + 0.75, antZ);
  antBracket.name = 'antenna-bracket'; antBracket.castShadow = true; group.add(antBracket);
  const antPlate = new T.Mesh(new T.BoxGeometry(2.2, 2.2, 0.2), antennaMat);
  antPlate.position.set(antX, antY, antZ);
  antPlate.name = 'antenna-plate'; antPlate.userData.isAntenna = true;
  antPlate.castShadow = true; group.add(antPlate);
  const antPos = { x: antX, y: antY, z: antZ };

  // --- Cables from distribution box ---
  var cableTargets = [];
  for (var ti = 0; ti < 4; ti++) {
    cableTargets.push({ x: turbX[ti], y: turbBaseY + 1.0, z: turbBaseZ, label: 'turbine-' + (ti + 1) });
  }
  cableTargets.push({ x: camPos.x, y: camPos.y, z: camPos.z, label: 'camera' });
  cableTargets.push({ x: antPos.x, y: antPos.y - 1.8, z: antPos.z, label: 'antenna' });

  for (var ci = 0; ci < cableTargets.length; ci++) {
    var tgt = cableTargets[ci];
    var startX = distBoxPos.x, startY = distBoxPos.y, startZ = distBoxPos.z;
    var endX = tgt.x, endY = tgt.y, endZ = tgt.z;
    var dx = endX - startX, dy = endY - startY, dz = endZ - startZ;
    var len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    var midX = (startX + endX) / 2, midY = (startY + endY) / 2, midZ = (startZ + endZ) / 2;
    var cableGeo = new T.CylinderGeometry(0.1, 0.1, len, 6);
    var cable = new T.Mesh(cableGeo, cableMat);
    cable.position.set(midX, midY, midZ);
    cable.name = 'cable-to-' + tgt.label;
    var dir = new T.Vector3(dx, dy, dz).normalize();
    cable.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir);
    cable.castShadow = true; group.add(cable);
  }

  // --- Turbines ---
  const defaults = [
    { x: turbX[0], z: turbBaseZ, height: turbineHeights[0], speed: speeds[0], phase: phases[0] },
    { x: turbX[1], z: turbBaseZ, height: turbineHeights[1], speed: speeds[1], phase: phases[1] },
    { x: turbX[2], z: turbBaseZ, height: turbineHeights[2], speed: speeds[2], phase: phases[2] },
    { x: turbX[3], z: turbBaseZ, height: turbineHeights[3], speed: speeds[3], phase: phases[3] }
  ];
  const records = [];
  for (let i = 0; i < defaults.length; i++) {
    const setting = defaults[i], turbine = new T.Group();
    turbine.name = 'test-wind-turbine-' + (i + 1);
    turbine.position.set(setting.x, turbBaseY, setting.z);
    turbine.userData = { kind: 'horizontal-axis-wind-turbine', turbineIndex: i + 1,
      mapCenter: [setting.x + CX, setting.z + CZ], towerHeight: setting.height, rotorRadius: rotorRadius,
      bladeCount: 3, operating: true, schematicDimensions: true, planned: false };
    group.add(turbine);
    const footing = new T.Mesh(footingGeometry, concrete);
    footing.position.y = -0.25;
    footing.name = 'turbine-concrete-footing-' + (i + 1);
    turbine.add(footing);
    const tower = new T.Mesh(new T.CylinderGeometry(0.34, 0.67, setting.height, 16), shell);
    tower.position.y = setting.height / 2; turbine.add(tower);
    const collar = new T.Mesh(new T.CylinderGeometry(0.8, 0.8, 0.24, 16), gray);
    collar.position.y = 0.12; turbine.add(collar);
    const head = new T.Group(); head.position.y = setting.height; head.rotation.y = yaw;
    head.name = 'turbine-nacelle-yaw-' + (i + 1); turbine.add(head);
    const nacelle = new T.Mesh(nacelleGeometry, shell);
    nacelle.position.z = 0.32; head.add(nacelle);
    for (const side of [-1, 1]) {
      const vent = new T.Mesh(new T.BoxGeometry(0.04, 0.44, 1.2), dark);
      vent.position.set(side * 0.76, -0.02, 0.75); head.add(vent);
    }
    const shaft = new T.Mesh(shaftGeometry, gray);
    shaft.position.z = -1.83; head.add(shaft);
    const rotor = new T.Group(); rotor.position.z = -2.25;
    rotor.rotation.z = setting.phase; rotor.name = 'test-wind-rotor-' + (i + 1);
    rotor.userData = { isWindTurbineRotor: true, operating: true, turbineIndex: i + 1,
      angularSpeed: setting.speed, rotorRadius: rotorRadius, bladeCount: 3,
      rotationAxis: 'local Z; horizontal shaft', animationIndependentOfOrbit: true };
    head.add(rotor);
    for (let j = 0; j < 3; j++) {
      const airfoil = new T.Mesh(blade, [bladeWhite, bladeTip]);
      airfoil.rotation.z = j * Math.PI * 2 / 3;
      airfoil.name = 'turbine-' + (i + 1) + '-blade-' + (j + 1);
      airfoil.userData.bladeIndex = j + 1; rotor.add(airfoil);
    }
    const hub = new T.Mesh(hubGeometry, shell);
    hub.position.z = -0.3; hub.name = 'turbine-spinner-' + (i + 1); rotor.add(hub);
    windTurbineRotors.push(rotor);
    records.push({ id: turbine.name, mapCenter: [setting.x + CX, setting.z + CZ], towerHeight: setting.height,
      rotorRadius: rotorRadius, angularSpeed: setting.speed, bladeCount: 3 });
  }
  group.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = !object.userData.bladeIndex; object.receiveShadow = true;
    if (feature) object.userData.feature = feature;
    if (landmark) object.userData.landmark = landmark;
    pickables.push(object);
  });
  group.userData.turbines = records;
  site.userData.windTurbineCount = 4;
  site.userData.operatingWindTurbines = true;
  if (feature) {
    feature.windTurbineCount = 4;
    feature.height = Math.max(feature.height || 0, turbBaseY + 21.5 + rotorRadius - (feature.base || 2.35));
  }
  return windTurbineRotors;
}

function updateWindTurbines(dt) {
  if (!Number.isFinite(dt) || dt <= 0) return;
  const elapsed = Math.min(dt, 0.25), turn = Math.PI * 2;
  for (const rotor of windTurbineRotors) {
    rotor.rotation.z = (rotor.rotation.z + rotor.userData.angularSpeed * elapsed) % turn;
  }
}