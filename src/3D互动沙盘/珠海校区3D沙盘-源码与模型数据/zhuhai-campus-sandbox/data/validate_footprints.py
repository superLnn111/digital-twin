import sys,json,collections
from pathlib import Path
import numpy as np
P=Path(__file__).resolve().parent
sys.path.insert(0,str(P/'deps'))
import cv2
from shapely.geometry import Polygon
from shapely.validation import explain_validity
d=json.loads((P/'building-footprints.json').read_text(encoding='utf-8'))
issues=[];vertices=0;gap=1e9
def crossings(ring):
    p=np.asarray(ring,float);q=np.roll(p,-1,axis=0);n=len(p);bad=[]
    def cross(a,b):return a[...,0]*b[...,1]-a[...,1]*b[...,0]
    for i in range(n):
        js=np.arange(i+2,n-(1 if i==0 else 0))
        if not len(js):continue
        a,b=p[i],q[i];c,e=p[js],q[js]
        o1=cross(b-a,c-a);o2=cross(b-a,e-a);o3=cross(e-c,a-c);o4=cross(e-c,b-c)
        hit=(o1*o2<-.0001)&(o3*o4<-.0001)
        if hit.any():bad.extend([(i,int(j)) for j in js[hit]])
    return bad
for f in d['buildings']:
    o=np.array(f['outer'],np.float32)
    planar=Polygon(f['outer'],f['holes'])
    if not planar.is_valid:issues.append([f['id'],'invalid planar geometry',explain_validity(planar)])
    for k,ring in enumerate([f['outer'],*f['holes']]):
        vertices+=len(ring)
        a=np.array(ring,np.float32)
        if len(a)<3 or not np.isfinite(a).all() or cv2.contourArea(a)<=0:issues.append([f['id'],k,'invalid ring'])
        dup=[p for p,n in collections.Counter(map(tuple,ring)).items() if n>1]
        if dup:issues.append([f['id'],k,'duplicate vertex',dup])
        hits=crossings(ring)
        if hits:issues.append([f['id'],k,'proper crossing',hits])
    for ring in f['holes']:
        ds=[cv2.pointPolygonTest(o,tuple(map(float,v)),True) for v in ring];gap=min(gap,*ds)
        if min(ds)<=0:issues.append([f['id'],'hole touches/outside',min(ds)])
report={'buildings':len(d['buildings']),'holes':sum(len(f['holes']) for f in d['buildings']),'vertices':vertices,'minimumHoleVertexDistanceToOuterPx':round(gap,3),'issues':issues,'bboxWithinMap':all(0<=v[0]<=1960 and 0<=v[1]<=1248 for f in d['buildings'] for ring in [f['outer'],*f['holes']] for v in ring)}
(P/'footprint-validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report))
