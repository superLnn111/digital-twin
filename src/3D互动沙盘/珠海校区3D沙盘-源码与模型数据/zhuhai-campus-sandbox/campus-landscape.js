function makeRevisedHills(){
 for(let hill of DATA.revisions.hills){
  let l=DATA.landmarks.find(l=>l.id===hill.id),positions=[],indices=[],segments=40,rings=8;
  positions.push(hill.cx-CX,terrainHeight(hill.cx,hill.cy)+.04,hill.cy-CZ);
  for(let j=1;j<=rings;j++)for(let i=0;i<segments;i++){let a=i/segments*Math.PI*2,px=hill.cx+Math.cos(a)*hill.rx*j/rings,py=hill.cy+Math.sin(a)*hill.ry*j/rings;positions.push(px-CX,terrainHeight(px,py)+.04,py-CZ)}
  for(let i=0;i<segments;i++)indices.push(0,1+(i+1)%segments,1+i);
  for(let j=1;j<rings;j++)for(let i=0;i<segments;i++){let a=1+(j-1)*segments+i,b=1+(j-1)*segments+(i+1)%segments,c=a+segments,d=b+segments;indices.push(a,b,c,b,d,c)}
  let geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();
  // Invisible pick surface: the visible hill is part of the continuous terrain.
  let mesh=new T.Mesh(geo,new T.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));mesh.name=hill.id+'-pick-surface';world.add(mesh);mesh.userData.landmark=l;pickables.push(mesh);
  let f={id:hill.id,kind:'hill',landmark:l,name:l.name,height:0,base:2,mesh,center:[hill.cx,hill.cy],planned:false};features.push(f);landmarkObjects.set(hill.id,f);
 }
}
