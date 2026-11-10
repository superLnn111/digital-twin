module.exports=function applyRevisions(lm,fp,r){
 const confirmed='existing_user_confirmed';
 const patch=(id,p)=>{let l=lm.landmarks.find(x=>x.id===id);if(!l)throw Error('Missing landmark '+id);Object.assign(l,p,{sourceMapStatus:confirmed,currentBuiltStatus:'user_confirmed_2026_11_02'});return l};
 patch('library',{id:'north-hill',name:'北侧小山丘',use:'山体绿地',shape:'按现状修正：原规划圆形图书馆位置为一座植被小山丘。',roughFloors:null,bbox:[1228,458,1305,542]});
 patch('museum',{id:'library-hill',name:'图书馆后山',cx:1278,cy:868,use:'山体绿地',shape:'原规划博物馆位置改为小山丘；长台阶从南侧白色图书馆中缝上山。',roughFloors:null,bbox:[1232,819,1325,917]});
 patch('administration',{id:'library',name:'图书馆',use:'图书与学习',shape:'白色双翼建筑，原图标为行政楼；中间留缝，后侧台阶通往小山丘。'});
 patch('teaching-spine',{name:'教学楼长轴',shape:'白色连续教学长轴；中段留两层高的架空过街通道，连接两侧道路。'});
 patch('jinyuan-canteen',{name:'槿园中间楼（3层）',shape:'两组槿园宿舍之间的中间楼，按您提供的现状设为三层。',roughFloors:{suggested:3,range:[3,3],basis:'user confirmed'}});
 lm.landmarks.push({id:'east-parking',name:'教学楼东侧停车场',cx:r.parking.cx,cy:r.parking.cy,use:'校园停车',shape:'教学长轴东侧原六条红墙建筑已移除，改为带车位和出入口的停车场；西侧原建筑恢复。',roughFloors:null,bbox:r.parking.bbox,sourceMapStatus:confirmed,currentBuiltStatus:'user_confirmed_2026_11_02'});
 lm.landmarks.push({id:'observatory',name:'山顶天文台',cx:r.observatory.cx,cy:r.observatory.cy,use:'天琴计划激光测距台站',shape:'依据您提供的实拍重建：白色两层主楼、偏置圆顶及狭长围合体。位于天琴楼西南后山的南峰，南峰略高于其余山峰，山体起伏为平缓的连续山脊，图面锚点为近似位置。',roughFloors:{suggested:2,range:[2,2],basis:'user photograph'},bbox:[r.observatory.plateauCx-57,r.observatory.cy-41,r.observatory.plateauCx+57,r.observatory.cy+41],sourceMapStatus:confirmed,currentBuiltStatus:'user_confirmed_2026_11_02'});
 lm.landmarks.push({id:'test-site',name:'科研试验场',cx:r.testSite.cx,cy:r.testSite.cy,use:'室外科研 / 风机试验',shape:'音乐厅西侧、主路对面的试验用地；含四台持续旋转的风力发电机、围栏、测试台与设备，位置按您确认的相对关系设置。',roughFloors:null,bbox:r.testSite.bbox,sourceMapStatus:confirmed,currentBuiltStatus:'user_confirmed_2026_11_02'});
 fp.buildings=fp.buildings.filter(b=>!r.removeFootprints.includes(b.id));
 for(let b of fp.buildings)if(r.buildingOverrides[b.id])b.userOverride=r.buildingOverrides[b.id];
 fp.revisionNotice=r.basis;lm.revisionDate=r.date;
 return {lm,fp};
};
