/* Explicit campus corridors. DATA.roadDesign contains plan-anchored routes
 * and clipped core/curb polygons. No source raster contours are drawn here.
 * initializeDesignedRoads and distance/canvas helpers do not require THREE.
 */
let designedRoadCache=null;
let designedRoadSceneGroup=null;

function initializeDesignedRoads(){
  const source=DATA.roadDesign;
  if(!source||!source.ready||!Array.isArray(source.corePolygons))return null;
  if(designedRoadCache&&designedRoadCache.source===source)return designedRoadCache;
  const cell=64,segments=[],buckets=new Map(),scanRows=new Map();
  const append=(map,key,id)=>{let list=map.get(key);if(!list)map.set(key,list=[]);list.push(id)};
  for(const polygon of source.corePolygons){
    for(const ring of [polygon.outer,...(polygon.holes||[])]){
      for(let i=0;i<ring.length;i++){
        const a=ring[i],b=ring[(i+1)%ring.length];
        const dx=b[0]-a[0],dy=b[1]-a[1],length2=dx*dx+dy*dy;
        if(length2<1e-15)continue;
        const id=segments.length;
        segments.push({ax:a[0],ay:a[1],bx:b[0],by:b[1],dx,dy,length2});
        const x0=Math.floor(Math.min(a[0],b[0])/cell),x1=Math.floor(Math.max(a[0],b[0])/cell);
        const y0=Math.floor(Math.min(a[1],b[1])/cell),y1=Math.floor(Math.max(a[1],b[1])/cell);
        for(let y=y0;y<=y1;y++){
          append(scanRows,y,id);
          for(let x=x0;x<=x1;x++)append(buckets,x+','+y,id);
        }
      }
    }
  }
  designedRoadCache={source,cell,segments,buckets,scanRows};
  return designedRoadCache;
}

function designedRoadDistance(px,py){
  if(!Number.isFinite(px)||!Number.isFinite(py))return 100;
  const cache=initializeDesignedRoads();
  if(!cache)return 100;
  const {cell,segments,buckets,scanRows}=cache;
  // Even/odd scan over the final union boundary includes courtyard/water holes.
  // Only edges in this horizontal 64px row can cross the ray.
  let inside=false;
  const ray=scanRows.get(Math.floor(py/cell))||[];
  for(const id of ray){
    const s=segments[id];
    if((s.ay>py)!==(s.by>py)&&px<s.ax+s.dx*(py-s.ay)/s.dy)inside=!inside;
  }
  let best=10000;
  const visited=new Set();
  const x0=Math.floor((px-100)/cell),x1=Math.floor((px+100)/cell);
  const y0=Math.floor((py-100)/cell),y1=Math.floor((py+100)/cell);
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    const candidates=buckets.get(x+','+y);
    if(!candidates)continue;
    for(const id of candidates){
      if(visited.has(id))continue;
      visited.add(id);
      const s=segments[id];
      const t=Math.max(0,Math.min(1,((px-s.ax)*s.dx+(py-s.ay)*s.dy)/s.length2));
      const dx=px-s.ax-t*s.dx,dy=py-s.ay-t*s.dy;
      best=Math.min(best,dx*dx+dy*dy);
    }
  }
  const distance=Math.min(100,Math.sqrt(best));
  if(distance<1e-7)return 0;
  return inside?-distance:distance;
}

function drawDesignedRoadsOnCanvas(ctx,width,height){
  const cache=initializeDesignedRoads();
  if(!cache)return false;
  const source=cache.source;
  const path=polygons=>{
    ctx.beginPath();
    for(const polygon of polygons)for(const ring of [polygon.outer,...(polygon.holes||[])]){
      if(!ring.length)continue;
      ctx.moveTo(ring[0][0],ring[0][1]);
      for(let i=1;i<ring.length;i++)ctx.lineTo(ring[i][0],ring[i][1]);
      ctx.closePath();
    }
  };
  ctx.save();
  ctx.scale(width/source.coordinateSystem.width,height/source.coordinateSystem.height);
  path(source.edgePolygons||[]);ctx.fillStyle=source.colors.edge;ctx.fill('evenodd');
  path(source.corePolygons);ctx.fillStyle=source.colors.core;ctx.fill('evenodd');
  ctx.save();path(source.corePolygons);ctx.clip('evenodd');
  ctx.strokeStyle=source.colors.centerline;ctx.globalAlpha=.38;
  ctx.lineWidth=.45;ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash([4,7]);
  for(const section of source.centerlineSegments||[]){
    ctx.beginPath();
    section.points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));
    ctx.stroke();
  }
  ctx.restore();ctx.restore();return true;
}

function makeDesignedRoads(){
  const cache=initializeDesignedRoads();
  if(!cache)return null;
  if(designedRoadSceneGroup&&designedRoadSceneGroup.parent)return designedRoadSceneGroup;
  const source=cache.source,group=new T.Group();
  group.name='designed-campus-roads';
  group.userData={source:'Explicit smooth plan-anchored corridors',singleSpineCrossing:[1275,738.8]};
  const coreMaterial=standard(source.colors.core,{roughness:.96,metalness:0});
  const edgeMaterial=standard(source.colors.edge,{roughness:.97,metalness:0});
  for(const polygon of source.corePolygons){
    const mesh=mapPlane(polygon,coreMaterial,source.surfaceY||2.3);
    mesh.name=polygon.id;mesh.renderOrder=2;group.add(mesh);
  }
  // Curbs are strips outside the gray core, not pale disks covering the road.
  for(const polygon of source.edgePolygons||[]){
    const mesh=mapPlane(polygon,edgeMaterial,source.edgeY||2.32);
    mesh.name=polygon.id;mesh.renderOrder=3;group.add(mesh);
  }
  const centerMaterial=new T.LineDashedMaterial({color:source.colors.centerline,
    transparent:true,opacity:.38,dashSize:4,gapSize:7,depthWrite:false});
  for(const section of source.centerlineSegments||[]){
    const geometry=new T.BufferGeometry().setFromPoints(section.points.map(p=>
      new T.Vector3(p[0]-CX,(source.edgeY||2.32)+.015,p[1]-CZ)));
    const line=new T.Line(geometry,centerMaterial);line.computeLineDistances();
    line.name='designed-centerline-'+section.routeId;line.renderOrder=4;group.add(line);
  }
  world.add(group);designedRoadSceneGroup=group;return group;
}
