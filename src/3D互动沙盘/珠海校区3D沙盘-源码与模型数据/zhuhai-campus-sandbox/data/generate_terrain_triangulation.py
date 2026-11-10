"""Exact polygon clipping of 5px terrain-grid triangles.

The emitted indices have negative algebraic XY signed area, hence +Y normals
under the app's (px-CX, height, py-CZ) mapping. `boundary` is the ordered, open
outer mesh ring, subdivided at actual grid intersections for crack-free skirts.
"""
import sys,json,math,collections,time
from pathlib import Path
P=Path(__file__).resolve().parent
sys.path.insert(0,str(P/'deps'))
import shapely
from shapely.geometry import Polygon,box,Point
from shapely.prepared import prep
from PIL import Image,ImageDraw

t0=time.perf_counter()
revisions=json.loads((P/'campus-revisions.json').read_text(encoding='utf-8'))
# This exact final ring is also consumed by the application. Do not independently
# reconstruct a second boundary from the older planning map.
ring=revisions['boardRing']
board=Polygon(ring)
assert board.is_valid and not board.interiors
test_site=box(*revisions['testSite']['bbox'])
assert board.covers(test_site)
prepared=prep(board)
vertices=[];lookup={};indices=[];triangles=[]
fully_inside=0;clipped_source=0;discarded_area=0.;minimum_normal_y=float('inf')

def vertex(p):
    x,y=map(float,p)
    key=(round(x,4),round(y,4))
    if key not in lookup:
        lookup[key]=len(vertices);vertices.append([x,y])
    else:
        old=vertices[lookup[key]]
        assert math.hypot(x-old[0],y-old[1])<.00015
    return lookup[key]

def emit(coords):
    global discarded_area,minimum_normal_y
    p=list(coords)[:3]
    area2=(p[1][0]-p[0][0])*(p[2][1]-p[0][1])-(p[1][1]-p[0][1])*(p[2][0]-p[0][0])
    if abs(area2)<1e-12:return
    ids=[vertex(q) for q in p]
    if len(set(ids))<3:
        discarded_area+=abs(area2)/2;return
    if area2>0:ids[1],ids[2]=ids[2],ids[1]
    q=[vertices[i] for i in ids]
    a2=(q[1][0]-q[0][0])*(q[2][1]-q[0][1])-(q[1][1]-q[0][1])*(q[2][0]-q[0][0])
    assert a2<0
    minimum_normal_y=min(minimum_normal_y,-a2)
    indices.extend(ids);triangles.append(Polygon(q))

def polygons(g):
    if g.is_empty:return
    if g.geom_type=='Polygon':yield g
    elif hasattr(g,'geoms'):
        for item in g.geoms:yield from polygons(item)

step=5
# A boundary corner can land in the middle of a grid edge. Both neighboring
# cells must explicitly contain that point, including a fully covered cell;
# otherwise their triangles form a T-junction and crack after height sampling.
board_nodes_by_cell=collections.defaultdict(list)
for px,py in ring:
    gx=math.floor(px/step)*step;gy=math.floor(py/step)*step
    xs=[gx,gx-step] if px%step==0 else [gx]
    ys=[gy,gy-step] if py%step==0 else [gy]
    for xx in xs:
        for yy in ys:board_nodes_by_cell[(xx,yy)].append((px,py))
conformity_splits=0

def triangle_polygon(q,candidates):
    points=[]
    for j,a in enumerate(q):
        b=q[(j+1)%3];dx=b[0]-a[0];dy=b[1]-a[1];ll=dx*dx+dy*dy
        points.append(a);insert=[]
        for p in candidates:
            cross=dx*(p[1]-a[1])-dy*(p[0]-a[0])
            t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/ll
            if abs(cross)<1e-10 and 1e-10<t<1-1e-10:insert.append((t,p))
        points.extend(p for t,p in sorted(insert))
    return Polygon(points)

minx,miny,maxx,maxy=board.bounds
for y in range(int(math.floor(miny/step)*step),int(math.ceil(maxy/step)*step),step):
    for x in range(int(math.floor(minx/step)*step),int(math.ceil(maxx/step)*step),step):
        cell=box(x,y,x+step,y+step)
        if prepared.disjoint(cell):continue
        source=[[(x,y),(x+step,y),(x+step,y+step)],[(x,y),(x+step,y+step),(x,y+step)]]
        candidates=board_nodes_by_cell.get((x,y),[])
        if prepared.covers(cell):
            fully_inside+=2
            for q in source:
                poly=triangle_polygon(q,candidates)
                if len(poly.exterior.coords)==4:emit(q)
                else:
                    conformity_splits+=1
                    for tri in shapely.constrained_delaunay_triangles(poly).geoms:emit(list(tri.exterior.coords)[:3])
            continue
        for q in source:
            clipped=triangle_polygon(q,candidates).intersection(board)
            for part in polygons(clipped):
                if part.area<1e-12:continue
                clipped_source+=1
                # GEOS constrained triangulation retains polygon boundary edges;
                # unlike unconstrained Delaunay, it cannot bridge concave corners.
                for tri in shapely.constrained_delaunay_triangles(part).geoms:
                    emit(list(tri.exterior.coords)[:3])

# A conforming shared-vertex mesh has exactly two triangles at each interior edge.
edge_counts=collections.Counter();directed={}
for i in range(0,len(indices),3):
    a,b,c=indices[i:i+3]
    for e in [(a,b),(b,c),(c,a)]:
        key=tuple(sorted(e));edge_counts[key]+=1;directed[key]=e
assert max(edge_counts.values())==2
outer_edges=[directed[e] for e,n in edge_counts.items() if n==1]
next_vertex={};incoming=collections.Counter()
for a,b in outer_edges:
    assert a not in next_vertex,('Nonmanifold/T-junction boundary',a)
    next_vertex[a]=b;incoming[b]+=1
assert all(n==1 for n in incoming.values())
start=min(next_vertex,key=lambda i:(vertices[i][1],vertices[i][0]))
boundary_ids=[];cur=start
while cur not in boundary_ids:
    boundary_ids.append(cur);cur=next_vertex[cur]
assert cur==start and len(boundary_ids)==len(outer_edges)
boundary=[vertices[i] for i in boundary_ids]

result={'vertices':vertices,'indices':indices,'boundary':boundary}
(P/'terrain-triangulation.json').write_text(json.dumps(result,separators=(',',':')),encoding='utf-8')

union=shapely.union_all(triangles)
outside=[tri.difference(board).area for tri in triangles]
sum_area=sum(t.area for t in triangles)
max_boundary_distance=max(board.boundary.distance(Point(p)) for p in boundary)
boundary_poly=Polygon(boundary)
report={
 'valid':True,'coordinateSystem':{'width':1960,'height':1248,'unit':'source map pixel','origin':'top-left'},
 'gridSpacingPx':step,'boardRing':ring,'boardAreaPx2':board.area,
 'boundarySource':'campus-revisions.json:boardRing','testSiteBBoxFullyCovered':board.covers(test_site),
 'vertices':len(vertices),'triangles':len(indices)//3,'fullyInteriorGridTriangles':fully_inside,
 'boundarySourceFragments':clipped_source,'boundaryVertices':len(boundary),
 'coveredSourceTrianglesSplitForBoundaryConformity':conformity_splits,
 'winding':'negative algebraic XY signed area (clockwise); +Y normal for X=px-CX,Z=py-CZ',
 'allFlatNormalsPositiveY':minimum_normal_y>0,'minimumFlatNormalYCrossProduct':minimum_normal_y,
 'vertexDeduplicationTolerancePx':.0001,'storedCoordinates':'original double precision, not rounded to the dedup key',
 'triangleOutsideAreaTotalPx2':sum(outside),'triangleOutsideAreaMaxPx2':max(outside),
 'meshUnionAreaPx2':union.area,'meshSymmetricDifferenceAreaPx2':union.symmetric_difference(board).area,
 'triangleOverlapAreaPx2':sum_area-union.area,'holesInUnion':len(union.interiors) if union.geom_type=='Polygon' else None,
 'unionGeometryType':union.geom_type,'maxBoundaryDistanceFromExactRingPx':max_boundary_distance,
 'boundaryRingAreaDifferencePx2':boundary_poly.symmetric_difference(board).area,
 'interiorEdgesAllSharedByTwoTriangles':all(n in [1,2] for n in edge_counts.values()),
 'singleOrderedBoundary':True,'discardedSubtoleranceTriangleAreaPx2':discarded_area,
 'runtimeSeconds':round(time.perf_counter()-t0,3),
}
assert union.geom_type=='Polygon' and len(union.interiors)==0
assert max(outside)<1e-7 and sum(outside)<1e-5
assert abs(sum_area-union.area)<1e-5
assert union.symmetric_difference(board).area<1e-5
assert boundary_poly.symmetric_difference(board).area<1e-5
assert max_boundary_distance<1e-7
assert discarded_area<1e-7
(P/'terrain-triangulation-validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')

# Validation-only image: true boundary in orange over the generated grid.
qa=Image.new('RGB',(1960,1248),'#f4f6f2');draw=ImageDraw.Draw(qa)
for i in range(0,len(indices),3):
    q=[tuple(vertices[j]) for j in indices[i:i+3]];draw.line(q+[q[0]],fill='#a7b9aa',width=1)
draw.line([tuple(p) for p in boundary]+[tuple(boundary[0])],fill='#ea5500',width=2)
qa.save(P/'terrain-triangulation-qa.png')
print(json.dumps(report,indent=2))
