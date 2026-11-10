const {chromium}=require('C:/Users/PS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path'),{pathToFileURL}=require('url');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url())});
 await page.goto(pathToFileURL(path.join(__dirname,'outputs/中山大学珠海校区-3D互动沙盘.html')).href);
 await page.waitForFunction(()=>window.__campusReady||window.__campusError,null,{timeout:120000});
 if(await page.evaluate(()=>window.__campusError))throw Error(await page.evaluate(()=>window.__campusError));
 await page.waitForFunction(()=>+getComputedStyle(document.getElementById('loading')).opacity<.01);
 let checks=await page.evaluate(()=>{
  let spine=features.find(f=>f.id==='B075');
  const ray=(z,y)=>new T.Raycaster(new T.Vector3(1240-CX,y,z-CZ),new T.Vector3(1,0,0),0,80).intersectObjects([spine.mesh],true).filter(x=>x.object.isMesh).length;
  let roadHeights=[];for(let p of DATA.roadDesign.corePolygons)for(let i=0;i<p.outer.length;i+=3)roadHeights.push(terrainHeight(...p.outer[i]));
  let highestOther=0,highestAll=0,r=DATA.revisions,sp=r.southPeak;
  for(let [x,y]of DATA.terrainMesh.vertices){let h=terrainHeight(x,y);highestAll=Math.max(highestAll,h);if(((x-sp.cx)/sp.rx)**2+((y-sp.cy)/sp.ry)**2>1.1)highestOther=Math.max(highestOther,h)}
  let valley=DATA.roadDesign.routes.find(r=>r.id==='rongyuan-boya-valley'),stair=world.getObjectByName('campus-library-hill-stairs'),stairsHits=0;
  for(let t of stair.userData.treadSamples)for(let a of[-1,0,1])for(let b of[-1,0,1]){let x=t.x+a*t.nx*t.width/2+b*t.ux*t.span/2,z=t.z+a*t.nz*t.width/2+b*t.uz*t.span/2;if(DATA.footprints.buildings.some(f=>['B090','B091'].includes(f.id)&&pointInFootprint(x,z,f)))stairsHits++}
  return {
   ready:true,version:DATA.version,footprints:DATA.footprints.buildings.length,landmarks:DATA.landmarks.length,
   restoredWest:['B074','B074-2'].every(id=>features.some(f=>f.id===id))&&DATA.landmarks.some(l=>l.id==='hanlin-1'),
   removedEast:['B078','B079','B080','B081','B082','B083'].every(id=>!features.some(f=>f.id===id)),
   parking:{id:features.find(f=>f.id==='east-parking')?.id,center:DATA.revisions.parking,bogusWest:!!world.getObjectByName('campus-west-parking')},
   crossing:{band:spine.passage,lowRay:ray(739,5),upperRay:ray(739,11),formerGapClosed:ray(657,5)>0,artificialRoadRemoved:!world.getObjectByName('campus-teaching-spine-passage-road'),onlyAllowedBand:DATA.roadDesign.validation.spineRoadOutsideSingleAllowedBandAreaPx2===0},
   roads:{count:DATA.roadDesign.routes.length,samples:roadHeights.length,maxGround:Math.max(...roadHeights),validation:DATA.roadDesign.validation},
   valley:{exists:!!valley,points:valley.points.length,label:valley.label,first:valley.points[0],last:valley.points.at(-1),westSideAtRows:[350,400,450].map(y=>{let xs=[];for(let i=1;i<valley.points.length;i++){let a=valley.points[i-1],b=valley.points[i];if((a[1]<=y&&b[1]>=y)||(a[1]>=y&&b[1]<=y)){let t=(y-a[1])/(b[1]-a[1]);xs.push(a[0]+(b[0]-a[0])*t)}}let dorms=features.filter(f=>f.landmark?.id==='rongyuan-housing'&&f.building&&f.category==='dormitory');dorms.sort((a,b)=>Math.abs(a.center[1]-y)-Math.abs(b.center[1]-y));let x=xs[0],left=dorms[0].building.bbox[0];return {y,roadX:x,dormWestEdge:left,west:x<left}}),oldEastRemoved:[[943.7,395],[947.2,355]].every(p=>designedRoadDistance(...p)>12),allCenterlineOnRoad:valley.sampledPoints.every(p=>designedRoadDistance(...p)<=.01),maxGround:Math.max(...valley.sampledPoints.map(p=>terrainHeight(...p)))},
   southernSummit:{center:[sp.cx,sp.cy],height:terrainHeight(sp.cx,sp.cy),highestOther,highestAll,observatory:DATA.revisions.observatory},
   turbines:{count:windTurbineRotors.length,angles:windTurbineRotors.map(r=>r.rotation.z),independent:!autoRotate&&!touring},
   retained:{middleFloors:features.find(f=>f.id==='B060').floors,treesInTrack:__treePositions.filter(([x,y])=>((x-1339)/32)**2+((y-568)/56)**2<1).length,stairsWallIntersections:stairsHits},stats:__campus.stats
  };
 });
 let angles=checks.turbines.angles;await page.waitForFunction(a=>windTurbineRotors.every((r,i)=>Math.abs(r.rotation.z-a[i])>.12),angles,{timeout:20000});checks.turbines.allOperating=true;
 async function shot(name,s){await page.evaluate(s=>{stopMotion();deselect();Object.assign(cam,{theta:s.theta,phi:s.phi,size:s.size});cam.target.set(s.x-CX,s.y||8,s.z-CZ);setCamera();updateLabels();renderer.render(scene,camera)},s);await page.screenshot({path:path.join(__dirname,'qa/'+name+'.png')})}
 await shot('r4-overview',{x:1080,z:690,theta:.58,phi:.78,size:1160});
 await shot('r4-crossing-parking',{x:1309,z:758,y:8,theta:1.42,phi:1.10,size:210});
 await shot('r4-west-restored',{x:1141,z:693,y:6,theta:.4,phi:.75,size:230});
 await shot('r4-wind-turbines',{x:1105,z:817,y:15,theta:.6,phi:.93,size:150});
 let o=checks.southernSummit.observatory;await shot('r4-south-observatory',{x:o.plateauCx,z:o.cy,y:checks.southernSummit.height+8,theta:.6,phi:.95,size:310});
 await shot('r4-valley-road',{x:918,z:320,y:12,theta:.25,phi:.45,size:620});
 await page.locator('#search').fill('风机');checks.windSearch=await page.locator('[data-place="test-site"]').count();
 await page.locator('[data-place="test-site"]').click();checks.windSelected=await page.evaluate(()=>__campus.selected==='test-site');
 await page.locator('#night-button').click();checks.night=await page.evaluate(()=>isNight);await page.locator('#day-button').click();
 await page.locator('#tour-button').click();checks.tour=await page.evaluate(()=>touring&&tours.every(t=>DATA.landmarks.some(l=>l.id===t[0])));await page.locator('#tour-stop').click();
 const result={version:'4.0',errors,externalRequests:requests,checks};fs.writeFileSync(path.join(__dirname,'qa/r4-report.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));await browser.close();
 const ok=checks.restoredWest&&checks.removedEast&&!checks.parking.bogusWest&&checks.parking.id&&checks.crossing.lowRay===0&&checks.crossing.upperRay>0&&checks.crossing.formerGapClosed&&checks.crossing.artificialRoadRemoved&&checks.crossing.onlyAllowedBand&&checks.roads.maxGround<2.02&&checks.valley.allCenterlineOnRoad&&checks.valley.oldEastRemoved&&checks.valley.westSideAtRows.every(x=>x.west)&&checks.valley.label.includes('西侧')&&checks.valley.maxGround<2.02&&checks.turbines.count===4&&checks.turbines.allOperating&&checks.southernSummit.height>checks.southernSummit.highestOther*1.02&&checks.southernSummit.height<checks.southernSummit.highestOther*1.18&&checks.southernSummit.height>=checks.southernSummit.highestAll-.1&&checks.retained.treesInTrack===0&&checks.retained.stairsWallIntersections===0;
 if(errors.length||requests.length||!ok)process.exit(1);
})().catch(e=>{console.error(e);process.exit(1)});
