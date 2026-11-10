const {chromium}=require('C:/Users/PS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path'),{pathToFileURL}=require('url');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const errors=[],requests=[];const url=pathToFileURL(path.join(__dirname,'outputs/中山大学珠海校区-3D互动沙盘.html')).href;
 let page=await browser.newPage({viewport:{width:1600,height:1000}});page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url())});
 await page.goto(url);await page.waitForFunction(()=>window.__campusReady,null,{timeout:60000});
 let desktop=await page.locator('.interaction-hint').textContent();
 let context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),mobile=await context.newPage();mobile.on('pageerror',e=>errors.push(String(e)));
 await mobile.goto(url);await mobile.waitForFunction(()=>window.__campusReady,null,{timeout:60000});await mobile.waitForFunction(()=>+getComputedStyle(document.getElementById('loading')).opacity<.01);
 let hint=await mobile.locator('.interaction-hint').textContent();await mobile.screenshot({path:path.join(__dirname,'qa/final-mobile.png')});
 await mobile.locator('#mobile-explore').click();await mobile.locator('#search').fill('天文台');await mobile.locator('[data-place="observatory"]').click();let mobileSelection=await mobile.evaluate(()=>__campus.selected==='observatory');
 let before=await mobile.evaluate(()=>__campus.cam.size),client=await context.newCDPSession(mobile);await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:110,y:350,id:1},{x:230,y:350,id:2}]});await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:80,y:350,id:1},{x:270,y:350,id:2}]});await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});let pinch=await mobile.evaluate(n=>__campus.cam.size<n,before);
 const result={version:await page.evaluate(()=>DATA.version),errors,externalRequests:requests,desktopHint:desktop,mobileHint:hint,mobileSelection,pinch,licenseEmbedded:fs.readFileSync(path.join(__dirname,'dist/index.html'),'utf8').includes('Permission is hereby granted, free of charge')};
 fs.writeFileSync(path.join(__dirname,'qa/final-smoke.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));await browser.close();
 if(errors.length||requests.length||!hint.includes('双指')||!result.licenseEmbedded||!pinch||!mobileSelection)process.exit(1);
})().catch(e=>{console.error(e);process.exit(1)});
