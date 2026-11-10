/* User-requested campus corrections. Site layouts and equipment are schematic;
   no new building footprints or terrain measurements are introduced here. */
function makeCampusSites() {
  const previous = world.getObjectByName('campus-sites');
  if (previous) return previous.userData.result;
  const revision = DATA.revisions || {};
  const root = new T.Group();
  root.name = 'campus-sites';
  root.userData.module = 'campus-sites';
  root.userData.planned = false;
  world.add(root);

  const asphalt = standard(0x7e8783, { roughness: 0.98, metalness: 0 });
  const testPaving = standard(0xa2a6a0, { roughness: 0.96, metalness: 0 });
  const concrete = standard(0xd4d2c7, { roughness: 1, metalness: 0 });
  const concreteDark = standard(0xbabdb5, { roughness: 1, metalness: 0 });
  const white = standard(0xeeeee6, { roughness: 0.87, metalness: 0.01 });
  const steel = standard(0x6e7c79, { roughness: 0.65, metalness: 0.18 });
  const glass = standard(0x51666b, { roughness: 0.32, metalness: 0.15 });
  const rubber = standard(0x444e4a, { roughness: 0.94, metalness: 0 });
  const marking = standard(0xece9d9, { roughness: 0.9, metalness: 0 });
  const roadMaterial = standard(0x526367, { roughness: 0.99, metalness: 0 });
  const instrument = standard(0x7f9397, { roughness: 0.75, metalness: 0.12 });
  const safety = standard(0xbaa96f, { roughness: 0.8, metalness: 0.07 });

  function group(name) {
    const g = new T.Group(); g.name = name; root.add(g); return g;
  }
  function box(parent, w, h, d, material, x, y, z, rotation = 0) {
    const m = boxMesh(w, h, d, material, x - CX, y, z - CZ, parent);
    m.rotation.y = rotation; return m;
  }
  function surface(parent, points, material, y, name) {
    const shape = new T.Shape(points.map(p => new T.Vector2(p[0] - CX, -(p[1] - CZ))));
    const geometry = new T.ShapeGeometry(shape); geometry.rotateX(-Math.PI / 2);
    const mesh = new T.Mesh(geometry, material); mesh.position.y = y;
    mesh.name = name; mesh.receiveShadow = true;
    mesh.userData.sourceCoordinates = points.map(p => [...p]);
    parent.add(mesh); return mesh;
  }
  function instances(parent, items, material, name) {
    if (!items.length) return null;
    const mesh = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), material, items.length);
    const matrix = new T.Matrix4(), q = new T.Quaternion(), axis = new T.Vector3(0, 1, 0);
    items.forEach((p, i) => {
      q.setFromAxisAngle(axis, p.rotation || 0);
      matrix.compose(new T.Vector3(p.x - CX, p.y, p.z - CZ), q, new T.Vector3(p.w, p.h, p.d));
      mesh.setMatrixAt(i, matrix);
    });
    mesh.name = name; mesh.frustumCulled = false;
    mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  }
  function lineItems(parent, segments, material, name, y = 2.38, width = 0.19) {
    return instances(parent, segments.map(([a, b]) => ({
      x: (a[0] + b[0]) / 2, y, z: (a[1] + b[1]) / 2,
      w: width, h: 0.025, d: Math.hypot(b[0] - a[0], b[1] - a[1]),
      rotation: Math.atan2(b[0] - a[0], b[1] - a[1])
    })), material, name);
  }
  function pointInside(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }
  function overlapLakeSamples(outer, bbox) {
    let count = 0;
    for (let y = Math.floor(bbox[1]); y < bbox[3]; y++) for (let x = Math.floor(bbox[0]); x < bbox[2]; x++) {
      if (pointInside(x + 0.5, y + 0.5, outer) && (DATA.footprints?.lakes || []).some(l => pointInside(x + 0.5, y + 0.5, l.outer))) count++;
    }
    return count;
  }
  // Smooth enough for low-detail paved roads, but retains the supplied route.
  function ribbon(parent, points, width, material, y, name) {
    const edges = points.map((p, i) => {
      const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const nx = (b[1] - a[1]) / length, nz = -(b[0] - a[0]) / length;
      return [[p[0] + nx * width / 2, p[1] + nz * width / 2], [p[0] - nx * width / 2, p[1] - nz * width / 2]];
    });
    const pointsAround = [...edges.map(e => e[0]), ...edges.map(e => e[1]).reverse()];
    const mesh = surface(parent, pointsAround, material, y, name);
    mesh.userData.route = points.map(p => [...p]); mesh.userData.width = width;
    return { mesh, edges };
  }
  function registerFeature(id, g, center, bbox, use, description, height) {
    const landmark = DATA.landmarks.find(l => l.id === id) || {
      id, name: id === 'east-parking' ? '教学楼东侧停车场' : '工程试验场',
      cx: center[0], cy: center[1], bbox, use, shape: description,
      sourceMapStatus: 'existing_user_confirmed'
    };
    const f = { id, landmark, name: landmark.name, category: 'public_support',
      sourceMapStatus: 'existing_user_confirmed', status: 'existing_user_confirmed',
      planned: false, height, base: 2.35, mesh: g, center };
    g.userData.feature = f; g.userData.landmark = landmark; g.userData.planned = false;
    g.traverse(o => {
      if (!o.isMesh) return;
      o.userData.feature = f; o.userData.landmark = landmark;
      o.receiveShadow = true; pickables.push(o);
    });
    features.push(f); landmarkObjects.set(id, f); return f;
  }

  // Parking replaces the six red-wall bars east of the teaching spine.
  const parkingConfig=revision.parking,parkingBBox=parkingConfig.bbox,parkingOuter=parkingConfig.outer;
  const parking=group('campus-east-parking');parking.userData.kind='parking';parking.userData.removedFootprints=['B078','B079','B080','B081','B082','B083'];
  parking.userData.lakeOverlapSampleCells=overlapLakeSamples(parkingOuter,parkingBBox);
  surface(parking,parkingOuter,asphalt,2.35,'east-parking-surface');
  const stalls=[],cars=[],[px0,pz0,px1,pz1]=parkingBBox;
  for(let row=0;row<2;row++)for(let col=0;col<8;col++){
   let x=px0+4+col*7.2,z=row?pz1-3:pz0+3,inside=row?-1:1;
   stalls.push([[x,z],[x,z+inside*10]]);cars.push({x:x+3.1,z:z+inside*5.1,angle:0});
  }
  stalls.push([[px0+4,pz0+13],[px1-2,pz0+13]],[[px0+4,pz1-13],[px1-2,pz1-13]]);
  lineItems(parking,stalls,marking,'parking-stall-markings');
  const aisleMarks=[];for(let x=px0+8;x<px1-5;x+=10)aisleMarks.push([[x,(pz0+pz1)/2],[x+4,(pz0+pz1)/2]]);
  lineItems(parking,aisleMarks,marking,'parking-aisle-markings',2.39,.17);
  const connections=parkingConfig.entrances;connections.forEach((route,i)=>ribbon(parking,route,5.2,asphalt,2.35,'parking-road-entrance-'+i));
  const carBodies=Array.from({length:4},()=>[]),carGlass=[],tires=[];
  cars.forEach((car,i)=>{if(i%5===2)return;carBodies[i%4].push({x:car.x,y:3.05,z:car.z,w:2.2,h:.88,d:4.15,rotation:car.angle});carGlass.push({x:car.x,y:3.65,z:car.z,w:1.7,h:.62,d:2.05,rotation:car.angle});for(let side of[-1,1])for(let axle of[-1,1])tires.push({x:car.x+side*1.03,y:2.74,z:car.z+axle*1.25,w:.3,h:.58,d:.7})});
  [0xe3e2d9,0xaeb8b5,0x6c8791,0x92746b].forEach((color,i)=>instances(parking,carBodies[i],standard(color),'parking-car-bodies-'+i));
  instances(parking,carGlass,glass,'parking-car-glazing');instances(parking,tires,rubber,'parking-car-wheels');parking.userData.carCount=carGlass.length;
  const parkingFeature=registerFeature('east-parking',parking,[parkingConfig.cx,parkingConfig.cy],parkingBBox,'停车设施','教学长轴东侧原六条红墙建筑的位置，含车位、车辆及出入口。',1.65);

  // 2. A distinct working compound: test slabs, steel loading frames, instrument
  // cabinets, a small single-storey cabin, and a perimeter fence with a west gate.
  const testConfig = revision.testSite || {}, testBBox = testConfig.bbox || [1075, 780, 1135, 850];
  const [tx0, tz0, tx1, tz1] = testBBox;
  const test = group('campus-test-site'); test.userData.kind = 'engineering-test-compound';
  test.userData.equipmentSchematic = true;
  surface(test, [[tx0, tz0], [tx1, tz0], [tx1, tz1], [tx0, tz1]], testPaving, 2.35, 'test-site-paved-compound');
  box(test, 14, 4, 10, white, tx0 + 12, 4.4, tz0 + 10);
  box(test, 15, 0.3, 11, steel, tx0 + 12, 6.55, tz0 + 10);
  box(test, 2.7, 2.4, 0.12, glass, tx0 + 15.5, 4.4, tz0 + 15.08);
  box(test, 2.5, 2.8, 0.14, steel, tx0 + 7.8, 4, tz0 + 15.09);
  const slabCenters = [[tx0 + 15, tz0 + 36], [tx0 + 42, tz0 + 36], [tx0 + 42, tz0 + 57]];
  slabCenters.forEach(([x, z], i) => {
    box(test, 16, 0.45, 11, i === 1 ? concreteDark : concrete, x, 2.66, z);
    lineItems(test, [[[x - 8, z], [x + 8, z]], [[x, z - 5.5], [x, z + 5.5]]], steel, 'test-slab-joints-' + i, 2.9, 0.1);
  });
  // Steel loading frame above the central concrete specimen.
  for (const x of [tx0 + 36, tx0 + 48]) {
    box(test, 0.8, 8, 0.8, steel, x, 6.86, tz0 + 36);
    box(test, 2.4, 0.3, 3.4, steel, x, 3.04, tz0 + 36);
  }
  box(test, 13.6, 1, 1.5, steel, tx0 + 42, 10.9, tz0 + 36);
  box(test, 1.1, 4, 1.1, instrument, tx0 + 42, 7.9, tz0 + 36);
  box(test, 8, 1.3, 1.8, concreteDark, tx0 + 42, 3.55, tz0 + 36);
  // A second field rig and instrument cabinet make this read as a test site.
  for (const x of [tx0 + 10.5, tx0 + 19.5]) box(test, 0.65, 6.5, 0.65, safety, x, 6.12, tz0 + 36);
  box(test, 10, 0.7, 0.7, safety, tx0 + 15, 9.2, tz0 + 36);
  box(test, 0.35, 5.5, 0.35, steel, tx0 + 15, 5.8, tz0 + 36);
  box(test, 4, 2.5, 2.6, instrument, tx0 + 29, 3.9, tz0 + 55);
  for (let i = 0; i < 3; i++) box(test, 2.5, 1.5 + i * 0.5, 2.5, concreteDark, tx0 + 37 + i * 4.8, 3.6 + i * 0.25, tz0 + 57);
  const posts = [], fenceRails = [];
  const segments = [ [[tx0, tz0], [tx1, tz0]], [[tx1, tz0], [tx1, tz1]],
    [[tx1, tz1], [tx0, tz1]], [[tx0, tz0], [tx0, tz0 + 41]], [[tx0, tz0 + 54], [tx0, tz1]] ];
  segments.forEach(([a, b]) => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(length / 6);
    for (let i = 0; i <= n; i++) posts.push({ x: a[0] + (b[0] - a[0]) * i / n, y: 3.65,
      z: a[1] + (b[1] - a[1]) * i / n, w: 0.26, h: 2.6, d: 0.26 });
    for (let y of [3.05, 4.65]) fenceRails.push({ x: (a[0] + b[0]) / 2, y, z: (a[1] + b[1]) / 2,
      w: 0.12, h: 0.12, d: length, rotation: Math.atan2(b[0] - a[0], b[1] - a[1]) });
  });
  instances(test, posts, steel, 'test-site-fence-posts');
  instances(test, fenceRails, steel, 'test-site-fence-rails');
  ribbon(test, [[tx0 + 4, tz0 + 47.5], [tx0 - 8, tz0 + 47.5]], 8, testPaving, 2.35, 'test-site-west-gate');
  test.userData.slabCount = slabCenters.length; test.userData.instrumentRigCount = 2;
  const testFeature = registerFeature('test-site', test,
    [testConfig.cx || 1105, testConfig.cy || 815], testBBox,
    '工程试验设施', '主路西侧的围合试验场；混凝土试验板、加载架、仪器箱与单层值班房为示意。', 9.1);

  // 3. A terrain-draped stair, not a suspended flat ribbon. Each horizontal tread
  // samples terrain on its ends and across its width; risers embed into the slope.
  const stairConfig = revision.stairs || {}, start = stairConfig.start || [1286, 919], end = stairConfig.end || [1278, 868];
  const stairWidth = stairConfig.width || 9, dx = end[0] - start[0], dz = end[1] - start[1];
  const stairLength = Math.hypot(dx, dz), treadCount = Math.max(1, Math.ceil(stairLength / 1.3));
  const run = stairLength / treadCount, ux = dx / stairLength, uz = dz / stairLength;
  const stair = group('campus-library-hill-stairs');
  const widthAt=t=>3.0+(stairWidth-3.0)*smoothUnit((t-.20)/.15);
  const centerAt=t=>[start[0]+dx*Math.max(0,(t-.20)/.80),start[1]+dz*t];
  const treadItems = [], treadSamples = [], railPosts = [];
  for (let i = 0; i < treadCount; i++) {
    const t = (i + 0.5) / treadCount,a=centerAt(i/treadCount),b=centerAt((i+1)/treadCount),x=(a[0]+b[0])/2,z=(a[1]+b[1])/2;
    const span=Math.hypot(b[0]-a[0],b[1]-a[1]),ux=(b[0]-a[0])/span,uz=(b[1]-a[1])/span,nx=uz,nz=-ux,tw=widthAt(t),angle=Math.atan2(ux,uz);
    const levels = [terrainHeight(x, z), terrainHeight(x - ux * run / 2, z - uz * run / 2),
      terrainHeight(x + ux * run / 2, z + uz * run / 2),
      terrainHeight(x + nx * tw / 2, z + nz * tw / 2),
      terrainHeight(x - nx * tw / 2, z - nz * tw / 2)];
    const top = Math.max(...levels) + 0.13, bottom = Math.min(...levels) - 0.22;
    treadItems.push({ x, y: (top + bottom) / 2, z, w: tw, h: top - bottom, d: span + 0.04, rotation: angle });
    treadSamples.push({ x, z, top, terrain: levels[0], bottom, width:tw, nx, nz, span, ux, uz });
  }
  instances(stair, treadItems, concrete, 'hill-stair-terrain-following-treads');
  for (const side of [-1, 1]) {
    const rail = [];
    for (let i = 0; i <= treadCount; i++) {
      const t=i/treadCount,c=centerAt(t),sample=treadSamples[Math.min(i,treadCount-1)],halfWidth=widthAt(t)/2+.12;
      const x = c[0] + side * sample.nx * halfWidth;
      const z = c[1] + side * sample.nz * halfWidth;
      const y = treadSamples[Math.min(i, treadCount - 1)].top;
      rail.push(new T.Vector3(x - CX, y + 1.1, z - CZ));
      if (i % 4 === 0 || i === treadCount) railPosts.push({ x, y: y + 0.55, z, w: 0.12, h: 1.1, d: 0.12 });
    }
    const handrail = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(rail), treadCount * 3, 0.07, 6, false), steel);
    handrail.name = side < 0 ? 'stairs-left-terrain-rail' : 'stairs-right-terrain-rail';
    handrail.castShadow = true; stair.add(handrail);
  }
  instances(stair, railPosts, steel, 'hill-stair-handrail-posts');
  stair.userData = { kind: 'hill-stairs', terrainDraped: true, start: [...start], end: [...end],
    width: stairWidth, entranceWidth:3.0, treadCount, runPerTread: run, handrailHeight: 1.1, treadSamples, persistent: true };

  const result = { parking: parkingFeature, testSite: testFeature, stairs: stair };
  root.userData.result = result;
  return result;
}
