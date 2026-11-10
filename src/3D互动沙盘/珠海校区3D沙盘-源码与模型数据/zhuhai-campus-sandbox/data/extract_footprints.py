"""Extract traced, non-random building footprints from the supplied campus map.
Coordinates are pixels on the 1960 x 1248 map, origin at upper left.
The input's flat legend colors are segmented at 2x that resolution.  Small dark
letter holes are filled; green/light courtyard holes are retained.
"""
import sys, json, math, copy
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE/'deps'))
import cv2
from shapely.geometry import Polygon

SOURCE=Path(r'E:\Sun Yat-Sen University\Teaching\Undergraduate innovation project\2026\Zhuhai Campus Map.jpg')
W,H=1960,1248
S=2
im=Image.open(SOURCE).convert('RGB')
rgb=np.asarray(im.resize((W*S,H*S),Image.Resampling.LANCZOS))
r,g,b=[rgb[:,:,i].astype(np.int16) for i in range(3)]
hsv=cv2.cvtColor(rgb,cv2.COLOR_RGB2HSV)
h,s,v=[hsv[:,:,i] for i in range(3)]

# Traced campus perimeter, extended around the dormitory cluster at the north.
# It clips annotation/legend and off-campus streets, not generated buildings.
roi_points=[(930,5),(1039,5),(1104,71),(1103,133),(1070,178),(1042,209),
 (1087,207),(1083,240),(1119,282),(1205,285),(1368,448),(1356,477),
 (1365,500),(1497,551),(1761,710),(1691,803),(1629,920),(1600,1060),
 (1580,1143),(1497,1147),(1350,1120),(1238,1077),(1145,909),(1143,815),
 (1020,691),(950,824),(817,775),(767,870),(725,878),(631,822),(532,815),
 (277,865),(53,577),(99,523),(226,473),(344,349),(344,215),(510,90),
 (676,101),(788,153),(868,128),(917,128),(887,80)]
roi=np.zeros((H*S,W*S),np.uint8)
cv2.fillPoly(roi,[np.rint(np.array(roi_points)*S).astype(np.int32)],255)

masks={
 'dormitory': (r>165)&(r>g+3)&(g>b+40)&(r>b+55)&(h>=19)&(h<=34)&(s>68),
 'teaching_research_office':(r>195)&(g>80)&(g<203)&(b>75)&(b<211)&(r-g>43)&(r-b>38)&(np.abs(g-b)<48),
 'public_support':(r>185)&(b>185)&(g<225)&(r-g>32)&(b-g>32)&(np.abs(r-b)<65),
 'planned_construction':(r>45)&(r<175)&(g>145)&(b>175)&(g-r>35)&(b-r>50)&(h>=86)&(h<=103)&(s>65),
}
colors={'dormitory':'#eadb69','teaching_research_office':'#ff9993','public_support':'#efa2f6','planned_construction':'#66c9e5'}
labels={'dormitory':'宿舍公寓','teaching_research_office':'教学科研办公','public_support':'公共配套设施','planned_construction':'规划在建'}
kernel=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(3,3))

def xy_ring(contour,epsilon=.30):
    a=cv2.approxPolyDP(contour,epsilon*S,True)[:,0,:].astype(float)/S
    return [[round(float(x),2),round(float(y),2)] for x,y in a]

def point_inside(x,y,contour):
    return cv2.pointPolygonTest(contour,(x*S,y*S),False)>=0

def hole_is_courtyard(contour):
    area=cv2.contourArea(contour)/S**2
    if area<5:return False
    x,y,w,hh=cv2.boundingRect(contour)
    local=np.zeros((hh,w),np.uint8)
    c=contour.copy();c[:,:,0]-=x;c[:,:,1]-=y
    cv2.drawContours(local,[c],-1,255,-1)
    pixels=rgb[y:y+hh,x:x+w][local>0].astype(float)
    if len(pixels)==0:return False
    # Courtyards contain vegetation or a pale open surface, unlike black labels.
    green=(pixels[:,1]>pixels[:,0]+5)&(pixels[:,1]>pixels[:,2]+18)&(pixels[:,1]>65)
    pale=(pixels.min(axis=1)>150)
    return (green.mean()>.24) or (area>16 and pale.mean()>.42)

features=[];excluded=[];special_features=[];mask_debug=np.zeros_like(rgb)
for category, raw in masks.items():
    mask=(raw.astype(np.uint8)*255)&roi
    # A 2.5-map-pixel closing repairs thin black name labels across dorm wings.
    # Other classes need only 1.5 pixels, preserving smaller academic courtyards.
    close_kernel=np.ones((5,5),np.uint8) if category=='dormitory' else kernel
    mask=cv2.morphologyEx(mask,cv2.MORPH_CLOSE,close_kernel)
    contours,hierarchy=cv2.findContours(mask,cv2.RETR_CCOMP,cv2.CHAIN_APPROX_SIMPLE)
    if hierarchy is None:continue
    hierarchy=hierarchy[0]
    for idx,c in enumerate(contours):
        if hierarchy[idx][3]!=-1:continue
        area=cv2.contourArea(c)/S**2
        x,y,ww,hh=cv2.boundingRect(c)
        if area<4.5 or ww/S<1.4 or hh/S<1.4:continue
        # Thin shoreline/letter antialiasing can share the legend's colors.
        # Filled building components occupy a substantial part of their bbox.
        if area/(ww*hh/S**2)<.24:continue
        cx=x/S+ww/S/2;cy=y/S+hh/S/2
        if category=='dormitory' and cx<550:continue
        holes=[];child=int(hierarchy[idx][2])
        while child!=-1:
            if hole_is_courtyard(contours[child]):holes.append(xy_ring(contours[child],.25))
            child=int(hierarchy[child][0])
        outer=xy_ring(c)
        if len(outer)<3:continue
        # Map label verified: this circular cyan footprint is the planned library.
        # Append it after the stable ordinary IDs, for custom landmark rendering.
        if category=='planned_construction' and 1235<cx<1298 and 465<cy<535:
            p=Polygon(outer,holes)
            special_features.append({'id':'B100','category':category,'label':'图书馆（规划）',
                'name':'图书馆（规划）','special_landmark':'library','outer':outer,'holes':holes,
                'bbox':[round(x/S,2),round(y/S,2),round(ww/S,2),round(hh/S,2)],
                'centroid':[round(p.centroid.x,2),round(p.centroid.y,2)],'areaPx2':round(p.area,2),
                'source':'map-color-contour','status':'planned','heightMeters':None})
            continue
        m=cv2.moments(c)
        centroid=[m['m10']/m['m00']/S,m['m01']/m['m00']/S] if m['m00'] else [cx,cy]
        net_area=area-sum(abs(cv2.contourArea(np.array(ring,dtype=np.float32))) for ring in holes)
        features.append({'id':'','category':category,'label':labels[category],
            'outer':outer,'holes':holes,'centroid':[round(z,2) for z in centroid],
            'bbox':[round(x/S,2),round(y/S,2),round(ww/S,2),round(hh/S,2)],
            'areaPx2':round(net_area,2),'source':'map-color-contour',
            'status':'planned' if category=='planned_construction' else 'mapped',
            'heightMeters':None})

features.sort(key=lambda z:(round(z['centroid'][1]/15),z['centroid'][0]))
for i,f in enumerate(features):f['id']='B%03d'%(i+1)

# Avoid touching hole/outer vertices after simplification: Three.js/Earcut needs
# strictly separate rings. One-pixel image-space erosion only where necessary.
for f in features:
    outer=np.array(f['outer'],np.float32);fixed=[]
    for ring in f['holes']:
        if min(cv2.pointPolygonTest(outer,tuple(map(float,p)),True) for p in ring)>.05:
            fixed.append(ring);continue
        q=np.rint(np.array(ring)*S).astype(np.int32)
        x,y,ww,hh=cv2.boundingRect(q);x-=2;y-=2;ww+=4;hh+=4
        local=np.zeros((hh,ww),np.uint8);q-=np.array([x,y])
        cv2.fillPoly(local,[q],255)
        local=cv2.erode(local,np.ones((3,3),np.uint8))
        cs,_=cv2.findContours(local,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
        if cs:
            c=max(cs,key=cv2.contourArea);c[:,:,0]+=x;c[:,:,1]+=y
            repaired=xy_ring(c,.1)
            if len(repaired)>=3:fixed.append(repaired)
    f['holes']=fixed
    f['areaPx2']=round(cv2.contourArea(outer)-sum(cv2.contourArea(np.array(ring,np.float32)) for ring in fixed),2)

# Image contours can touch themselves at a one-pixel neck. Repair their planar
# topology before extrusion, retaining substantial disconnected colored parts.
# These are traced pieces, not newly invented/placed objects.
clean=[]
for f in features:
    p=Polygon(f['outer'],f['holes'])
    if p.is_valid:
        clean.append(f);continue
    repaired=p.buffer(0)
    parts=list(repaired.geoms) if repaired.geom_type=='MultiPolygon' else [repaired]
    parts.sort(key=lambda q:q.area,reverse=True)
    meaningful=[q for q in parts if q.area>=4.5]
    removed=sum(q.area for q in parts if q.area<4.5)
    for i,q in enumerate(meaningful):
        z=copy.deepcopy(f)
        z['id']=f['id'] if i==0 else f['id']+'-'+str(i+1)
        z['parentContourId']=f['id']
        z['outer']=[[round(float(x),5),round(float(y),5)] for x,y in list(q.exterior.coords)[:-1]]
        z['holes']=[[[round(float(x),5),round(float(y),5)] for x,y in list(r.coords)[:-1]] for r in q.interiors]
        z['centroid']=[round(q.centroid.x,2),round(q.centroid.y,2)]
        x0,y0,x1,y1=q.bounds;z['bbox']=[round(v,2) for v in [x0,y0,x1-x0,y1-y0]]
        z['areaPx2']=round(q.area,2)
        z['topologyRepair']={'method':'zero-distance planar repair','disjointPart':i+1,'discardedSliverAreaPx2':round(removed,4)}
        clean.append(z)
features=clean

# Lakes use a separate pale-blue mask, with positional verification against the map.
water=((h>=103)&(h<=126)&(v>150)&(s>8)&(s<115)&(b-r>10)&(b-g>5)&(r>105))
wmask=cv2.morphologyEx((water.astype(np.uint8)*255)&roi,cv2.MORPH_CLOSE,np.ones((5,5),np.uint8))
wc,wh=cv2.findContours(wmask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
lake_seeds=[(636,475),(711,531),(624,591),(1205,735),(1418,772),(1380,965),(1249,1022)]
lakes=[]
for c in wc:
    area=cv2.contourArea(c)/S**2
    if area<35 or not any(point_inside(x,y,c) for x,y in lake_seeds):continue
    x,y,ww,hh=cv2.boundingRect(c)
    lakes.append({'id':'L%02d'%(len(lakes)+1),'category':'lake','outer':xy_ring(c,.45),'holes':[],'bbox':[x/S,y/S,ww/S,hh/S],'areaPx2':round(area,2),'source':'pale-blue contour; map-position verified'})

# Flat gray pavement is kept as a separate traced surface, not as inferred road
# centerlines.  Color-equivalent walls inside building footprints are removed.
gray=(r>158)&(r<231)&(np.abs(r-g)<7)&(np.abs(g-b)<7)
road_mask=(gray.astype(np.uint8)*255)&roi
filled_buildings=np.zeros_like(roi)
for f in features:
    c=np.rint(np.array(f['outer'])*S).astype(np.int32)
    cv2.fillPoly(filled_buildings,[c],255)
    for ring in f['holes']:cv2.fillPoly(filled_buildings,[np.rint(np.array(ring)*S).astype(np.int32)],0)
road_mask[filled_buildings>0]=0
road_mask=cv2.morphologyEx(road_mask,cv2.MORPH_CLOSE,np.ones((5,5),np.uint8))
rc,rh=cv2.findContours(road_mask,cv2.RETR_CCOMP,cv2.CHAIN_APPROX_SIMPLE)
roads=[]
if rh is not None:
    rh=rh[0]
    for i,c in enumerate(rc):
        # Keep only the two substantial connected pavement networks. Small gray
        # map labels and isolated outlined objects are deliberately discarded.
        if rh[i][3]!=-1 or cv2.contourArea(c)/S**2<500:continue
        x,y,ww,hh=cv2.boundingRect(c)
        if max(ww,hh)/S<16:continue
        holes=[];child=int(rh[i][2])
        while child!=-1:
            if cv2.contourArea(rc[child])/S**2>10:holes.append(xy_ring(rc[child],.35))
            child=int(rh[child][0])
        roads.append({'id':'R%02d'%(len(roads)+1),'category':'gray_pavement','outer':xy_ring(c,.40),'holes':holes,'bbox':[x/S,y/S,ww/S,hh/S],'areaPx2':round(cv2.contourArea(c)/S**2,2),'source':'neutral gray map surface; not a surveyed centerline'})

features.extend(special_features)

meta={'schemaVersion':1,'sourceImage':str(SOURCE),'sourceImageSize':[im.width,im.height],
 'coordinateSystem':{'width':W,'height':H,'origin':'top-left','xAxis':'right','yAxis':'down','unit':'map-pixel','sourceToMapScale':[W/im.width,H/im.height]},
 'ringFormat':'outer and holes are open [x,y] rings; close them when creating paths; no arbitrary/random geometry',
 'method':{'segmentationResolution':[W*S,H*S],'colorKeys':labels,'contourSimplificationPx':.30,'minimumFootprintAreaPx2':4.5,'holes':'green/light courtyard holes retained; dark text holes removed','topology':'zero-distance repair of self-touching rings; meaningful disjoint parts retained, subpixel slivers discarded','roi':roi_points},
 'limitations':['Colored fills are traced; stroke/shadow edges may differ by about 1 map pixel.','Map colors indicate use/status, not height. heightMeters is null; any rendering height is an explicit illustrative assumption.','The connected teaching-building wings remain connected polygons; enclosed courtyards are holes.','White/unkeyed objects are not inferred as buildings.','North-side adjacent yellow dormitories retained; bottom title/legend and off-campus buildings clipped.'],
 'counts':{c:sum(f['category']==c for f in features) for c in masks},
 'buildings':features,'lakes':lakes,'roads':roads,'excluded':excluded}
(HERE/'building-footprints.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')

preview=im.resize((W,H),Image.Resampling.LANCZOS).convert('RGBA')
layer=Image.new('RGBA',(W,H));draw=ImageDraw.Draw(layer)
try:font=ImageFont.truetype(r'C:\Windows\Fonts\arial.ttf',11)
except OSError:font=ImageFont.load_default()
for f in features:
    color=colors[f['category']]
    draw.polygon([tuple(p) for p in f['outer']],fill=color+'80',outline='#111111')
    for ring in f['holes']:
        draw.polygon([tuple(p) for p in ring],fill=(255,255,255,0),outline='#00f0ff')
    cx,cy=f['centroid'];draw.text((cx+2,cy-5),f['id'],font=font,fill='#000000',stroke_width=1,stroke_fill='#ffffff')
for f in lakes:draw.line([tuple(p) for p in f['outer']]+[tuple(f['outer'][0])],fill='#00a9ff',width=2)
for f in excluded:draw.line([tuple(p) for p in f['outer']]+[tuple(f['outer'][0])],fill='#ff0000',width=3)
Image.alpha_composite(preview,layer).convert('RGB').save(HERE/'building-footprints-overlay.png')
layer.save(HERE/'building-footprints-overlay-transparent.png')
# Inspection crops expose dormitories and academic courtyards at a readable size.
combined=Image.alpha_composite(preview,layer).convert('RGB')
combined.crop((560,300,1200,700)).resize((1280,800)).save(HERE/'qa-dorms-courtyards.png')
combined.crop((1320,520,1660,1135)).resize((680,1230)).save(HERE/'qa-east-buildings.png')
road_overlay=im.resize((W,H),Image.Resampling.LANCZOS).convert('RGBA')
road_layer=Image.new('RGBA',(W,H));rd=ImageDraw.Draw(road_layer)
for f in roads:
    rd.polygon([tuple(p) for p in f['outer']],fill='#ff850080',outline='#ce4b00')
    for ring in f['holes']:rd.polygon([tuple(p) for p in ring],fill=(0,0,0,0),outline='#ce4b00')
Image.alpha_composite(road_overlay,road_layer).convert('RGB').save(HERE/'roads-overlay.png')
road_alpha=Image.new('L',(W*S,H*S));ra=ImageDraw.Draw(road_alpha)
for f in roads:
    ra.polygon([tuple(np.array(p)*S) for p in f['outer']],fill=255)
    for ring in f['holes']:ra.polygon([tuple(np.array(p)*S) for p in ring],fill=0)
road_alpha.resize((W,H),Image.Resampling.LANCZOS).save(HERE/'roads-mask.png')
print(json.dumps({'counts':meta['counts'],'buildings':len(features),'courtyardHoles':sum(len(f['holes']) for f in features),'lakes':len(lakes),'roads':len(roads),'excluded':len(excluded)},ensure_ascii=False))
