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
  let spine=features.find(f=>f.id==='B075'),dorm=features.find(f=>f.id==='B060');
  const rayAt=y=>new T.Raycaster(new T.Vector3(1240-CX,y,658-CZ),new T.Vector3(1,0,0),0,80).intersectObjects([spine.mesh],true).filter(x=>x.object.isMesh).length;
  let roadHeights=[];for(let p of DATA.roadSurfaces.polygons)for(let i=0;i<p.outer.length;i+=15){let xy=p.outer[i];roadHeights.push(terrainHeight(...xy))}
  return {
   ready:true,footprints:DATA.footprints.buildings.length,removed:!features.some(f=>['B100','B088','B074','B074-2'].includes(f.id)),
   renamed:DATA.landmarks.find(l=>l.id==='library').cx===1286&&!DATA.landmarks.some(l=>l.name==='博物馆'||l.name.includes('行政楼')),
   libraryWhite:features.filter(f=>f.landmark?.id==='library').map(f=>f.mesh.material.map(m=>m.color.getHexString())),
   spineWhite:spine.mesh.children.find(m=>m.isMesh).material.map(m=>m.color.getHexString()),
   passage:{clearHeight:spine.passage.clearHeight,lowRayHits:rayAt(5),upperRayHits:rayAt(11)},
   middleBuilding:{floors:dorm.floors,height:dorm.height},
   hills:DATA.revisions.hills.map(h=>({id:h.id,top:terrainHeight(h.cx,h.cy)})),
   treesInTrack:__treePositions.filter(([x,y])=>((x-1339)/32)**2+((y-568)/56)**2<1).length,
   roads:{samples:roadHeights.length,min:Math.min(...roadHeights),max:Math.max(...roadHeights)},
   addedSites:['observatory','west-parking','test-site'].every(id=>features.some(f=>f.id===id&&!f.planned)),
   stairs:(()=>{let s=world.getObjectByName('campus-library-hill-stairs');let hits=0;for(let t of s.userData.treadSamples)for(let a of [-1,0,1])for(let b of [-1,0,1]){let x=t.x+a*t.nx*t.width/2+b*t.ux*t.span/2,z=t.z+a*t.nz*t.width/2+b*t.uz*t.span/2;if(DATA.footprints.buildings.some(f=>['B090','B091'].includes(f.id)&&pointInFootprint(x,z,f)))hits++}return {exists:!!s,entranceWidth:s.userData.entranceWidth,wallIntersections:hits}})(),
   observatory:{base:landmarkObjects.get('observatory').base,anchor:DATA.revisions.observatory},stats:__campus.stats,
   overflow:document.documentElement.scrollWidth===innerWidth
  };
 });
 async function shot(name,settings){await page.evaluate(s=>{stopMotion();deselect();Object.assign(cam,{theta:s.theta,phi:s.phi,size:s.size});cam.target.set(s.x-CX,s.y||8,s.z-CZ);setCamera();updateLabels();renderer.render(scene,camera)},settings);await page.screenshot({path:path.join(__dirname,'qa/'+name+'.png')})}
 await shot('revised-overview',{x:80+1000,z:50+640,theta:.58,phi:.78,size:1160});
 const obs=checks.observatory;await shot('revised-observatory',{x:obs.anchor.plateauCx,z:obs.anchor.cy,y:obs.base+6,theta:.6,phi:.92,size:245});
 await shot('revised-passage',{x:1276,z:658,y:7,theta:1.45,phi:1.16,size:180});
 await shot('revised-library-stairs',{x:1283,z:900,y:10,theta:.55,phi:.95,size:235});
 await shot('revised-parking-test',{x:1140,z:744,y:3,theta:.5,phi:.65,size:330});
 await shot('revised-track-dorm',{x:1400,z:566,y:6,theta:.3,phi:.55,size:270});
 await page.locator('#search').fill('天文台');await page.locator('[data-place="observatory"]').click();checks.observatorySearch=await page.locator('#selected-name').textContent();
 await page.locator('#about-button').click();checks.about=await page.locator('#about').evaluate(x=>x.classList.contains('open'));await page.locator('#about [data-close]').click();
 await page.locator('#reference-button').click();checks.referenceImages=await page.locator('#references img').evaluateAll(imgs=>imgs.length===3&&imgs.every(x=>x.complete&&x.naturalWidth>1000));await page.locator('#references [data-close]').click();
 await page.locator('#night-button').click();checks.night=await page.evaluate(()=>isNight);await page.locator('#day-button').click();
 await page.locator('#tour-button').click();checks.tour=await page.evaluate(()=>touring&&tours.every(t=>DATA.landmarks.some(l=>l.id===t[0])));await page.locator('#tour-stop').click();
 const result={errors,externalRequests:requests,checks};fs.writeFileSync(path.join(__dirname,'qa/revisions-report.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));await browser.close();
 if(errors.length||requests.length||!checks.removed||!checks.renamed||checks.passage.lowRayHits||!checks.passage.upperRayHits||checks.treesInTrack||checks.middleBuilding.floors!==3||checks.roads.max>2.02||checks.stairs.wallIntersections)process.exit(1);
})().catch(e=>{console.error(e);process.exit(1)});
