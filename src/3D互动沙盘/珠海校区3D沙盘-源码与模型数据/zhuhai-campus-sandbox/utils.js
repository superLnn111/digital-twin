const DATA=JSON.parse(document.getElementById('campus-data').textContent);
const T=THREE, CX=1000, CZ=640, MAP_W=1960, MAP_H=1248;
const BOARD_RING=DATA.revisions.boardRing;
const CATEGORIES={dormitory:{label:'宿舍公寓',color:0xdec776,wall:0xe1cbb0,roof:0x748c79},teaching_research_office:{label:'教学科研',color:0xc8907e,wall:0xc9957d,roof:0x517e70},public_support:{label:'公共配套',color:0xc7a7c0,wall:0xe1d1b8,roof:0x7b8b85},planned_construction:{label:'规划/在建',color:0x78bcc2,wall:0xc4ddd3,roof:0x70b1b8}};
const ICONS={search:'<circle cx="10" cy="10" r="6"/><path d="m14.5 14.5 5 5"/>',map:'<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',orbit:'<ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-30 12 12)"/><circle cx="12" cy="12" r="3"/><path d="m19 3 1 4-4-.7"/>',top:'<path d="M4 4h16v16H4zM4 12h16M12 4v16"/>',sea:'<path d="M2 9c3-4 6 4 9 0s6 4 11 0M2 15c3-4 6 4 9 0s6 4 11 0M2 21c3-4 6 4 9 0s6 4 11 0"/>',axis:'<path d="M12 3v18M3 12h18M9 6l3-3 3 3M18 9l3 3-3 3M9 18l3 3 3-3M6 9l-3 3 3 3"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 1v2M12 21v2M1 12h2M21 12h2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',moon:'<path d="M21 13.5A9 9 0 0 1 10.5 3 9 9 0 1 0 21 13.5Z"/>',play:'<path d="m8 4 12 8-12 8z"/>',pause:'<path d="M8 4v16M16 4v16"/>',plus:'<path d="M12 4v16M4 12h16"/>',minus:'<path d="M4 12h16"/>',focus:'<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/><circle cx="12" cy="12" r="4"/>'};
function icon(name){return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]||ICONS.info}</svg>`}
document.querySelectorAll('[data-icon]').forEach(el=>{el.outerHTML=icon(el.dataset.icon)});
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function rng(seed=83571){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const random=rng();
function pointInRing(x,y,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){let a=ring[i],b=ring[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside}return inside}
function pointInFootprint(px,py,b){if(!pointInRing(px,py,b.outer))return false;return !(b.holes||[]).some(r=>pointInRing(px,py,r))}
function forestAt(px,py){let f=DATA.forest;if(!f)return 0;let u=clamp(px/MAP_W*(f.width-1),0,f.width-1),v=clamp(py/MAP_H*(f.height-1),0,f.height-1),x=Math.floor(u),y=Math.floor(v),xx=Math.min(x+1,f.width-1),yy=Math.min(y+1,f.height-1),a=u-x,b=v-y;let at=(j,i)=>Array.isArray(f.data[j])?f.data[j][i]:f.data[j*f.width+i];return at(y,x)*(1-a)*(1-b)+at(y,xx)*a*(1-b)+at(yy,x)*(1-a)*b+at(yy,xx)*a*b}
const smoothUnit=t=>{t=clamp(t,0,1);return t*t*(3-2*t)};
function naturalTerrainHeight(px,py){
 let f=forestAt(px,py);if(f<.04)return 2;
 let gauss=(x,z,amp,sx,sz)=>amp*Math.exp(-((px-x)**2/(2*sx*sx)+(py-z)**2/(2*sz*sz)));
 let h=gauss(340,490,108,240,180)+gauss(605,245,111,220,170)+gauss(970,280,93,150,175)+gauss(1160,360,50,150,120)+gauss(880,730,72,180,130);
 let texture=Math.sin(px*.014+py*.019)*4+Math.sin(px*.033-py*.011)*2,result=2+Math.pow(f,.9)*Math.max(0,h+texture),peak=DATA.revisions.southPeak;
 if(peak){
  let dx=px-peak.cx,dy=py-peak.cy,d=(dx/peak.rx)**2+(dy/peak.ry)**2;
  // Blend into a broad, gently rolling ridge; no hard max-envelope or cone rim.
  let weight=Math.exp(-2*d)*smoothUnit((f-.04)/.35);
  let ripple=1.4*Math.sin(dx*.026)*Math.cos(dy*.019)*smoothUnit(d/.12);
  let ridge=2+peak.height*Math.exp(-.7*d)+ripple;
  result=result*(1-weight)+ridge*weight;
 }
 return result;
}
function distanceToSegment(px,py,a,b){let dx=b[0]-a[0],dy=b[1]-a[1],t=clamp(((px-a[0])*dx+(py-a[1])*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(px-a[0]-t*dx,py-a[1]-t*dy)}
function roadLinkDistance(px,py){let pts=DATA.revisions.passageRoad,d=Infinity;for(let i=1;i<pts.length;i++)d=Math.min(d,distanceToSegment(px,py,pts[i-1],pts[i]));return d}
const valleyPoints=DATA.roadDesign.routes.find(r=>r.id==='rongyuan-boya-valley').points;
function valleyDistance(px,py){let d=Infinity;for(let i=1;i<valleyPoints.length;i++)d=Math.min(d,distanceToSegment(px,py,valleyPoints[i-1],valleyPoints[i]));return d}
function terrainHeight(px,py){
 let h=naturalTerrainHeight(px,py),r=DATA.revisions;
 h=2+(h-2)*(1-roadFlattenWeight(px,py));
 for(let hill of r.hills){let d=((px-hill.cx)/hill.rx)**2+((py-hill.cy)/hill.ry)**2;if(d<1)h+=hill.height*Math.pow(1-d,1.25)*smoothUnit((roadDistanceAt(px,py)-8)/10)}
 // Sculpt a broad valley floor, so the northern connection stays visible and
 // does not sit at the bottom of a narrow artificial cliff cut.
 h=2+(h-2)*smoothUnit((valleyDistance(px,py)-16)/70);
 // The two compounds and the cross-campus passage share the level road datum.
 for(let site of [r.parking,r.testSite]){let [x0,y0,x1,y1]=site.bbox,d=Math.hypot(Math.max(x0-4-px,0,px-x1-4),Math.max(y0-4-py,0,py-y1-4));h=2+(h-2)*smoothUnit(d/10)}
 h=2+(h-2)*smoothUnit((roadLinkDistance(px,py)-10)/10);
 for(let b of DATA.footprints.buildings){let[x,y,w,d]=b.bbox;if(px>x-5&&px<x+w+5&&py>y-5&&py<y+d+5)return 2}
 for(let lake of DATA.footprints.lakes){let[x,y,w,d]=lake.bbox;if(px>=x&&px<=x+w&&py>=y&&py<=y+d&&pointInFootprint(px,py,lake))return 2;}
 let o=r.observatory,round=o.cornerRadius||9,dx=Math.abs(px-o.plateauCx)-(o.halfWidth-round),dy=Math.abs(py-o.plateauCy)-(o.halfDepth-round);
 let d=Math.max(0,Math.hypot(Math.max(0,dx),Math.max(0,dy))+Math.min(Math.max(dx,dy),0)-round);
 if(d<o.blend){let top=naturalTerrainHeight(o.plateauCx,o.plateauCy);h=top+(h-top)*smoothUnit(d/o.blend)}
 return h;
}
function siteBlocksTree(px,py){
 if(((px-1339)/33)**2+((py-568)/57)**2<1)return true;
 let r=DATA.revisions,o=r.observatory;
 if(Math.abs(px-o.plateauCx)<o.halfWidth+6&&Math.abs(py-o.plateauCy)<o.halfDepth+6)return true;
 for(let site of [r.parking,r.testSite]){let [x0,y0,x1,y1]=site.bbox;if(px>x0-5&&px<x1+5&&py>y0-5&&py<y1+5)return true}
 if(distanceToSegment(px,py,r.stairs.start,r.stairs.end)<r.stairs.width/2+5)return true;
 return designedRoadDistance(px,py)<5||valleyDistance(px,py)<9;
}
function shapeFromRings(outer,holes=[],origin=[0,0]){const points=ring=>ring.map(p=>new T.Vector2(p[0]-origin[0],-(p[1]-origin[1])));let p=points(outer);if(!T.ShapeUtils.isClockWise(p))p.reverse();let shape=new T.Shape(p);for(let ring of holes){let h=points(ring);if(T.ShapeUtils.isClockWise(h))h.reverse();shape.holes.push(new T.Path(h))}return shape}
function extrudeMap(b,height,materials,y=2){let origin=b.centroid||[b.bbox[0]+b.bbox[2]/2,b.bbox[1]+b.bbox[3]/2],shape=shapeFromRings(b.outer,b.holes,origin),geo=new T.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,steps:1,curveSegments:16});geo.rotateX(-Math.PI/2);let mesh=new T.Mesh(geo,materials);mesh.position.set(origin[0]-CX,y,origin[1]-CZ);mesh.castShadow=true;mesh.receiveShadow=true;return mesh}
function mapPlane(b,material,y=2.1){let shape=shapeFromRings(b.outer,b.holes,[CX,CZ]),geo=new T.ShapeGeometry(shape,24);geo.rotateX(-Math.PI/2);let mesh=new T.Mesh(geo,material);mesh.position.y=y;mesh.receiveShadow=true;return mesh}
function nearLandmark(b){let best=null,bestScore=Infinity;for(let l of DATA.landmarks){if(!l.roughFloors?.suggested||!l.bbox)continue;let[x0,y0,x1,y1]=l.bbox;let px=b.centroid[0],py=b.centroid[1];if(px<x0-3||px>x1+3||py<y0-3||py>y1+3)continue;let score=((px-l.cx)/Math.max(10,(x1-x0)))**2+((py-l.cy)/Math.max(10,(y1-y0)))**2;if(score<bestScore){best=l;bestScore=score}}return best}
function planned(l){if(!l||/landscape_improvement/.test(l.sourceMapStatus))return false;return /planned|construction/.test(l.sourceMapStatus)||/规划|在建/.test(l.name)}
function niceStatus(l){if(l.sourceMapStatus==='existing_user_confirmed')return '按您提供的现状修正';if(/landscape_improvement/.test(l.sourceMapStatus))return '水面保留 · 景观提升规划（参考图）';return planned(l)?(/construction/.test(l.sourceMapStatus)||l.name.includes('在建')?'在建（按参考图）':'规划（按参考图）'):'按所给参考图重建'}
function worldPoint(l,height=0){return new T.Vector3(l.cx-CX,terrainHeight(l.cx,l.cy)+height,l.cy-CZ)}
function loadImage(src){return new Promise((resolve,reject)=>{let im=new Image;im.onload=()=>resolve(im);im.onerror=reject;im.src=src})}
