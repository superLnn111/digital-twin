"""One-off correction preserving all existing geometry and IDs byte-for-byte."""
import sys,json,hashlib
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
P=Path(__file__).resolve().parent
sys.path.insert(0,str(P/'deps'))
from shapely.geometry import Polygon
d=json.loads((P/'building-footprints.json').read_text(encoding='utf-8'))
original={f['id']:json.dumps(f,ensure_ascii=False,sort_keys=True) for f in d['buildings']}
if not any(f.get('special_landmark')=='library' for f in d['buildings']):
    f=next(f for f in d['excluded'] if f['bbox']==[1237.5,470.5,58.5,58.5])
    p=Polygon(f['outer'],f['holes'])
    d['buildings'].append({'id':'B100','category':'planned_construction','label':'图书馆（规划）',
      'name':'图书馆（规划）','special_landmark':'library','outer':f['outer'],'holes':f['holes'],
      'bbox':f['bbox'],'centroid':[round(p.centroid.x,2),round(p.centroid.y,2)],
      'areaPx2':round(p.area,2),'source':'map-color-contour','status':'planned','heightMeters':None})
    d['excluded'].remove(f)
    d['counts']['planned_construction']+=1
for f in d['buildings']:
    if f['id'] in original:assert json.dumps(f,ensure_ascii=False,sort_keys=True)==original[f['id']]
(P/'building-footprints.json').write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8')
colors={'dormitory':'#eadb69','teaching_research_office':'#ff9993','public_support':'#efa2f6','planned_construction':'#66c9e5'}
preview=Image.open(d['sourceImage']).convert('RGB').resize((1960,1248),Image.Resampling.LANCZOS).convert('RGBA')
layer=Image.new('RGBA',preview.size);draw=ImageDraw.Draw(layer)
font=ImageFont.truetype(r'C:\Windows\Fonts\arial.ttf',11)
for f in d['buildings']:
    draw.polygon([tuple(p) for p in f['outer']],fill=colors[f['category']]+'80',outline='#111111')
    for ring in f['holes']:draw.polygon([tuple(p) for p in ring],fill=(255,255,255,0),outline='#00f0ff')
    x,y=f['centroid'];draw.text((x+2,y-5),f['id'],font=font,fill='#000000',stroke_width=1,stroke_fill='#ffffff')
for f in d['lakes']:draw.line([tuple(p) for p in f['outer']]+[tuple(f['outer'][0])],fill='#00a9ff',width=2)
combined=Image.alpha_composite(preview,layer).convert('RGB')
combined.save(P/'building-footprints-overlay.png');layer.save(P/'building-footprints-overlay-transparent.png')
combined.crop((560,300,1200,700)).resize((1280,800)).save(P/'qa-dorms-courtyards.png')
combined.crop((1320,520,1660,1135)).resize((680,1230)).save(P/'qa-east-buildings.png')
print(json.dumps({'buildings':len(d['buildings']),'planned':d['counts']['planned_construction'],'otherFeaturesUnchanged':len(original),'excluded':len(d['excluded']),'library':next(f for f in d['buildings'] if f['id']=='B100')},ensure_ascii=False))
