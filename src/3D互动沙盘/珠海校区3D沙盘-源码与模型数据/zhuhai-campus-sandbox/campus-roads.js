/* Campus roads: source-mask distance and clipped, flat road surfaces.
 * Load after utils.js/world.js; DATA.roadDistance and DATA.roadSurfaces are
 * embedded by the build. This module does not modify the terrain function.
 */
function roadDistanceAt(px,py){
  if(typeof designedRoadDistance==='function')return designedRoadDistance(px,py);
  const field=DATA.roadDistance;
  if(!field||!field.data||!Number.isFinite(px)||!Number.isFinite(py))return 100;
  const mapWidth=field.mapWidth||1960,mapHeight=field.mapHeight||1248;
  if(px<0||py<0||px>=mapWidth||py>=mapHeight)return 100;
  const cell=field.cellSizePx||4;
  const x=Math.min(field.width-1,Math.floor(px/cell));
  const y=Math.min(field.height-1,Math.floor(py/cell));
  // Each value is a conservative minimum over its complete source-image cell.
  // Bilinear averaging would incorrectly lift some narrow road crossings.
  const value=field.data[y*field.width+x];
  return Number.isFinite(value)?Math.max(0,Math.min(100,value)):100;
}

function roadFlattenWeight(px,py){
  // The explicit motor-road corridors share one level; mountain terrain outside
  // their narrow clearance smoothly recovers its own height.
  const distance=roadDistanceAt(px,py);
  if(distance<=8)return 1;
  if(distance>=24)return 0;
  const t=(distance-8)/16;
  return 1-t*t*(3-2*t);
}

let campusRoadSurfaceGroup=null;
function MakeRoadSurfaces(){
  if(campusRoadSurfaceGroup&&campusRoadSurfaceGroup.parent)return campusRoadSurfaceGroup;
  const source=DATA.roadSurfaces;
  if(!source||!Array.isArray(source.polygons))return null;
  const group=new T.Group();
  group.name='campus-road-surfaces';
  group.userData={kind:'clipped-main-roads',source:'actual source road polygons',
    y:2.28,excluded:'water, sports fields, exterior, western mountain paths'};
  const pavement=standard(0x526367,{roughness:.97,metalness:0,
    polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  const edgePositions=[];
  for(const polygon of source.polygons){
    if(!polygon.outer||polygon.outer.length<3)continue;
    // Preprocessing clips every polygon to BOARD_RING and (x>=600 OR y>=600),
    // subtracts lake/field areas, and retains the original interior holes.
    const mesh=mapPlane(polygon,pavement,2.28);
    mesh.name=polygon.id||'campus-road';
    mesh.renderOrder=2;
    mesh.userData={kind:'road-surface',sourceId:polygon.id};
    group.add(mesh);
    for(const ring of [polygon.outer,...(polygon.holes||[])]){
      for(let i=0;i<ring.length;i++){
        const a=ring[i],b=ring[(i+1)%ring.length];
        edgePositions.push(a[0]-CX,2.335,a[1]-CZ,b[0]-CX,2.335,b[1]-CZ);
      }
    }
  }
  if(edgePositions.length){
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(edgePositions,3));
    const edges=new T.LineSegments(geometry,new T.LineBasicMaterial({
      color:0xd8dccb,transparent:true,opacity:.85,depthWrite:false}));
    edges.name='campus-road-edges';
    edges.renderOrder=3;
    group.add(edges);
  }
  world.add(group);
  campusRoadSurfaceGroup=group;
  return group;
}
