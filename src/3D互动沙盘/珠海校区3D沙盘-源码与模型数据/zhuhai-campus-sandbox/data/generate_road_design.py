"""Regenerate smooth campus-road geometry after editing routes[].points.

Run from any directory: python data/generate_road_design.py
Uses the existing data/deps Shapely package; no installation is performed.
Only data/road-design.json is written. Current revisions, water, fields,
parking and test site are excluded; the sole B075 gap remains y730..748.
"""
from pathlib import Path
import sys,json,math
P=Path(__file__).resolve().parents[1];sys.path.insert(0,str(P/'data/deps'))
import shapely
from shapely.geometry import Polygon,LineString,Point,box
from shapely.ops import unary_union
from shapely import affinity
path=P/'data/road-design.json';d=json.loads(path.read_text(encoding='utf-8'));fp=json.loads((P/'data/building-footprints.json').read_text(encoding='utf-8'));rev=json.loads((P/'data/campus-revisions.json').read_text(encoding='utf-8'))
def pol(o):return Polygon(o['outer'],o.get('holes',[]))
def geoms(g,kind):
 if g.is_empty:return
 if g.geom_type==kind:yield g
 elif hasattr(g,'geoms'):
  for x in g.geoms:yield from geoms(x,kind)
def sample(points,radius):
 out=[list(points[0])]
 for i in range(1,len(points)-1):
  a,b,c=points[i-1],points[i],points[i+1];ab=math.dist(a,b);bc=math.dist(b,c);r=min(radius,ab*.22,bc*.22)
  if r<.01:out.append(list(b));continue
  p=[b[k]+(a[k]-b[k])*r/ab for k in (0,1)];q=[b[k]+(c[k]-b[k])*r/bc for k in (0,1)];out.append(p)
  for j in range(1,7):
   t=j/6;out.append([(1-t)**2*p[k]+2*(1-t)*t*b[k]+t*t*q[k] for k in (0,1)])
 out.append(list(points[-1]));return out
board=Polygon(rev['boardRing']);water=unary_union([shapely.make_valid(pol(x)) for x in fp['lakes']]);fields=unary_union([affinity.scale(Point(1339,568).buffer(1,quad_segs=32),32,56),box(1063,665,1101,722),Polygon([(1059,638),(1094,648),(1078,704),(1043,695)]),box(1186,510,1216,572)]);parking=box(*d['parkingBBoxXYXY']);test_site=box(1075,780,1135,850)
active=[]
for b in fp['buildings']:
 if b['id'] in rev.get('removeFootprints', ['B100','B088']):continue
 g=shapely.make_valid(pol(b))
 if b['id']=='B075':g=g.difference(box(0,730,1960,748))
 active.append(g)
buildings=unary_union(active);blocked=unary_union([water,fields,parking,test_site,buildings]);allowed=board.difference(blocked);cores=[];outers=[];checks=[]
for r in d['routes']:
 r['sampledPoints']=sample(r['points'],r.get('rounding',0));line=LineString(r['sampledPoints']);cores.append(line.buffer(r['width']/2,quad_segs=6,cap_style='round',join_style='round'));outers.append(line.buffer(r['width']/2+d['edgeWidth'],quad_segs=6,cap_style='round',join_style='round'))
 checks.append({'id':r['id'],'lengthPx':round(line.length,2),'waterCenterlineLengthPx':round(line.intersection(water).length,3),'buildingCenterlineLengthPx':round(line.intersection(buildings).length,3),'fieldCenterlineLengthPx':round(line.intersection(fields).length,3),'parkingCenterlineLengthPx':round(line.intersection(parking).length,3),'exteriorCenterlineLengthPx':round(line.difference(board).length,3),'testSiteCenterlineLengthPx':round(line.intersection(test_site).length,3)})
core=unary_union(cores).intersection(allowed).simplify(.12,preserve_topology=True).intersection(allowed);outer=unary_union(outers).intersection(allowed);edge=outer.difference(core)
def records(geo,prefix):
 out=[]
 for g in geoms(geo,'Polygon'):
  if g.area<.03:continue
  x0,y0,x1,y1=g.bounds;out.append({'id':prefix+str(len(out)+1),'outer':[list(p) for p in list(g.exterior.coords)[:-1]],'holes':[[list(p) for p in list(h.coords)[:-1]] for h in g.interiors],'bbox':[x0,y0,x1-x0,y1-y0]})
 return out
d['corePolygons']=records(core,'designed-core-');d['edgePolygons']=records(edge,'designed-edge-');core=unary_union([pol(x) for x in d['corePolygons']]);d['centerlineSegments']=[]
for r in d['routes']:
 if r.get('centerline'):
  for line in geoms(LineString(r['sampledPoints']).intersection(core),'LineString'):
   if line.length>8:d['centerlineSegments'].append({'routeId':r['id'],'points':[list(p) for p in line.coords]})
spine=next(pol(b) for b in fp['buildings'] if b['id']=='B075');spine_road=core.intersection(spine)
def clean(x):return 0 if abs(x)<1e-7 else x
validation={'routes':len(d['routes']),'corePolygons':len(d['corePolygons']),'edgePolygons':len(d['edgePolygons']),'coreVertices':sum(len(x['outer'])+sum(len(h) for h in x['holes']) for x in d['corePolygons']),'outsideBoardAreaPx2':clean(core.difference(board).area),'waterOverlapAreaPx2':clean(core.intersection(water).area),'fieldOverlapAreaPx2':clean(core.intersection(fields).area),'parkingOverlapAreaPx2':clean(core.intersection(parking).area),'activeBuildingOverlapAreaPx2':clean(core.intersection(buildings).area),'spineRoadBounds':list(spine_road.bounds),'spineRoadOutsideSingleAllowedBandAreaPx2':clean(spine_road.difference(box(0,730,1960,748)).area),'routeChecks':checks}
print(json.dumps({k:v for k,v in validation.items() if k!='routeChecks'},indent=2))
assert all(validation[k]==0 for k in ['outsideBoardAreaPx2','waterOverlapAreaPx2','fieldOverlapAreaPx2','parkingOverlapAreaPx2','activeBuildingOverlapAreaPx2','spineRoadOutsideSingleAllowedBandAreaPx2'])
assert core.geom_type=='Polygon', 'Road network must remain connected.'
assert all(row[k]==0 for row in checks for k in ['waterCenterlineLengthPx','buildingCenterlineLengthPx','fieldCenterlineLengthPx','parkingCenterlineLengthPx','exteriorCenterlineLengthPx','testSiteCenterlineLengthPx']), 'A centerline crosses an exclusion; revise its anchors instead of leaving a clipped gap.'
validation['singleConnectedCore']=True
d['validation']=validation;d['ready']=True;d['distanceDefinition']='Exact signed Euclidean distance to final clipped gray core boundary; negative inside, positive outside, magnitude capped at100px. Runtime polygon-edge spatial hash, no THREE required.';d['exclusions']={'boardRing':rev['boardRing'],'water':'All source lake polygons.','fields':'Jinyuan buffered field; central visible courts/field; northern small courts.','parkingBBoxXYXY':d['parkingBBoxXYXY'],'testSiteBBoxXYXY':[1075,780,1135,850],'activeBuildings':'Current active source footprints after campus-revisions.json removeFootprints; B074/B074-2 restored. B075 blocked except sole y730..748 passage band.'};path.write_text(json.dumps(d,ensure_ascii=False,separators=(',',':')),encoding='utf-8')

