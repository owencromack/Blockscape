import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const $ = s => document.querySelector(s);
const game = $("#game");
const scene = new THREE.Scene();
scene.background = new THREE.Color("#8bc9fa");
scene.fog = new THREE.Fog("#8bc9fa", 18, 58);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, .1, 140);
const renderer = new THREE.WebGLRenderer({ antialias:false, powerPreference:"high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.25));
renderer.setSize(innerWidth, innerHeight);
renderer.domElement.style.touchAction = "none";
renderer.domElement.style.userSelect = "none";
renderer.outputColorSpace = THREE.SRGBColorSpace;
game.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xd9efff, 0x566342, 1.8));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(15, 30, 10); scene.add(sun);

const TYPES = {
  grass:{color:0x65ad45,label:"Grass",kind:"block"}, dirt:{color:0x87532f,label:"Dirt",kind:"block"},
  stone:{color:0x858b91,label:"Stone",kind:"block"}, wood:{color:0x96602e,label:"Wood",kind:"block"},
  leaves:{color:0x358344,label:"Leaves",kind:"block"}, sand:{color:0xe5d08a,label:"Sand",kind:"block"},
  brick:{color:0xb85b48,label:"Brick",kind:"block"}, glass:{color:0xa5e9ed,label:"Glass",kind:"block"},
  coal:{color:0x34383b,label:"Coal Ore",kind:"ore"}, iron:{color:0xd1a88a,label:"Iron Ore",kind:"ore"},
  gold:{color:0xf0c738,label:"Gold Ore",kind:"ore"}, plank:{color:0xb9834c,label:"Planks",kind:"block"},
  stick:{color:0xd4b079,label:"Stick",kind:"item"}, apple:{color:0xe84b3c,label:"Apple",kind:"food"},
  berry:{color:0x803cbd,label:"Berries",kind:"food"}, raw_meat:{color:0xd47b75,label:"Raw Meat",kind:"food"},
  cooked_meat:{color:0x8f4c2f,label:"Cooked Meat",kind:"food"},
  wooden_pickaxe:{color:0xb68a54,label:"Wood Pickaxe",kind:"tool"},
  stone_pickaxe:{color:0x9aa0a5,label:"Stone Pickaxe",kind:"tool"},
  sword:{color:0xb9c5d2,label:"Sword",kind:"tool"}
};
const blockTypes = ["grass","dirt","stone","wood","leaves","sand","brick","glass","coal","iron","gold","plank"];
const hotbarTypes = ["grass","dirt","stone","wood","plank","sand","brick","apple"];
const mats = {};
for (const [id,t] of Object.entries(TYPES)) {
  mats[id] = new THREE.MeshLambertMaterial({color:t.color, transparent:id==="glass", opacity:id==="glass"?.5:1});
}
const cube = new THREE.BoxGeometry(1,1,1);
const blocks = new Map(), meshes = new Map();
const mobs = [];
const mobGeo = new THREE.BoxGeometry(.75,.85,.75);
const mobMats = {
  sheep:new THREE.MeshLambertMaterial({color:0xf0eee5}),
  pig:new THREE.MeshLambertMaterial({color:0xe79aa5}),
  slime:new THREE.MeshLambertMaterial({color:0x62d34e})
};
const ray = new THREE.Raycaster();
const center = new THREE.Vector2(0,0);
const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.015,1.015,1.015)),new THREE.LineBasicMaterial({color:0xffef9a}));
outline.visible=false; scene.add(outline);

let mode="survival", seed=1, playing=false, yaw=0, pitch=0, verticalVelocity=0, grounded=false;
let health=20, dayClock=0, dayNumber=1, actionLock=false, lastTime=0, lookPointer=null, lastX=0,lastY=0;
const keys = new Set();
const player = {x:0, feetY:4, z:0, speed:4.6};
let selected="grass";
const inventory = {};
for (const id of Object.keys(TYPES)) inventory[id]=0;
function setCount(id,n){inventory[id]=Math.max(0,n|0);}
function addItem(id,n=1){ if(!(id in inventory))return; inventory[id]+=n; updateHUD(); }
function hasItem(id,n=1){return (inventory[id]||0)>=n;}
function takeItem(id,n=1){if(!hasItem(id,n))return false;inventory[id]-=n;updateHUD();return true;}
function keyOf(x,y,z){return `${x},${y},${z}`;}
function coords(key){return key.split(",").map(Number);}
function getBlock(x,y,z){return blocks.get(keyOf(x,y,z));}
function addBlock(x,y,z,type,mark=true){
  x=Math.round(x);y=Math.round(y);z=Math.round(z);
  if(!mats[type] || blocks.has(keyOf(x,y,z)))return false;
  const k=keyOf(x,y,z), mesh=new THREE.Mesh(cube,mats[type]);
  mesh.position.set(x,y,z); mesh.userData.blockKey=k; scene.add(mesh);
  blocks.set(k,type);meshes.set(k,mesh); if(mark)dirty=true; return true;
}
function removeBlock(x,y,z,collect=true){
  const k=keyOf(x,y,z), mesh=meshes.get(k), type=blocks.get(k);
  if(!mesh)return false;
  scene.remove(mesh);blocks.delete(k);meshes.delete(k);dirty=true;
  if(collect && mode==="survival"){
    const drop=type==="coal"?"coal":type==="iron"?"iron":type==="gold"?"gold":type;
    addItem(drop,1);
  }
  return true;
}
let dirty=false;
function randomAt(x,z){
  let n=Math.imul(x+374761,668265263)^Math.imul(z+127412,2246822519)^Math.imul(seed,3266489917);
  n=Math.imul(n^(n>>>13),1274126177);n^=n>>>16;return (n>>>0)/4294967295;
}
function terrainHeight(x,z){
  return Math.max(1,Math.floor(3+Math.sin(x*.23)*1.4+Math.cos(z*.19)*1.2+Math.sin((x+z)*.12)*.8+randomAt(Math.floor(x/4),Math.floor(z/4))*1.4));
}
function tree(x,y,z){
  for(let j=1;j<=3;j++)addBlock(x,y+j,z,"wood",false);
  for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let dy=2;dy<=4;dy++){
    if(Math.abs(dx)+Math.abs(dz)+Math.abs(dy-3)<=4&&!getBlock(x+dx,y+dy,z+dz))addBlock(x+dx,y+dy,z+dz,"leaves",false);
  }
}
function clearWorld(){
  for(const m of meshes.values())scene.remove(m);
  blocks.clear();meshes.clear();
  for(const mob of mobs)scene.remove(mob.mesh);
  mobs.length=0;outline.visible=false;
}
function generateWorld(){
  clearWorld();
  for(let x=-14;x<=14;x++)for(let z=-14;z<=14;z++){
    const h=terrainHeight(x,z);
    for(let y=Math.max(-3,h-4);y<=h;y++){
      let type=y===h?"grass":y>=h-2?"dirt":"stone";
      if(y<h-2){
        const r=randomAt(x*13+y*3,z*11-y*5);
        if(r>.986)type="gold"; else if(r>.958)type="iron"; else if(r>.925)type="coal";
      }
      addBlock(x,y,z,type,false);
    }
    if(!(Math.abs(x)<4&&Math.abs(z)<4)&&randomAt(x*7,z*7)>.975)tree(x,h,z);
    if(randomAt(x*5+11,z*9-2)>.988&&Math.abs(x)>2)addBlock(x,h+1,z,"apple",false);
  }
  player.x=0;player.z=0;player.feetY=terrainHeight(0,0)+.56;
  yaw=Math.PI;pitch=0;verticalVelocity=0;health=20;dayClock=0;dayNumber=1;
  // Keep the spawn area open so the player cannot start inside nearby tree leaves.
  for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++){
    const surface=terrainHeight(x,z);
    for(let y=surface+1;y<=surface+4;y++){
      const existing=getBlock(x,y,z);
      if(existing)removeBlock(x,y,z,false);
    }
  }
  // Recalculate spawn height after terrain has been cleared.
  player.feetY=terrainHeight(0,0)+.56;
  for(const k of Object.keys(inventory))inventory[k]=0;
  if(mode==="survival"){inventory.apple=3;inventory.wood=2;inventory.dirt=8;}
  dirty=false;updateCamera();renderHotbar();updateHUD();showToast("New "+mode+" world created!");
}
function updateCamera(){
  camera.position.set(player.x,player.feetY+1.55,player.z);
  camera.rotation.order="YXZ";camera.rotation.y=yaw;camera.rotation.x=pitch;
}
function collides(px,feetY,pz){
  const r=.28, minBlockY=Math.floor(feetY+.5), maxBlockY=Math.floor(feetY+1.72+.5);
  for(let x=Math.floor(px-r);x<=Math.floor(px+r);x++)
    for(let z=Math.floor(pz-r);z<=Math.floor(pz+r);z++)
      for(let y=minBlockY;y<=maxBlockY;y++)
        if(getBlock(x,y,z))return true;
  return false;
}
function groundBelow(px,feetY,pz){
  const r=.24, y=Math.floor(feetY-.08);
  for(let x=Math.floor(px-r);x<=Math.floor(px+r);x++)
    for(let z=Math.floor(pz-r);z<=Math.floor(pz+r);z++)
      if(getBlock(x,y,z))return true;
  return false;
}
function movePlayer(dx,dz,dt){
  // Try normal movement first. If a one-block-high ledge blocks the way,
  // step up onto it when there is room for the player's body.
  const tryAxis=(axis,delta)=>{
    if(!delta)return;
    const nx=axis==="x"?player.x+delta:player.x;
    const nz=axis==="z"?player.z+delta:player.z;
    if(!collides(nx,player.feetY,nz)){
      if(axis==="x")player.x=nx;else player.z=nz;
      return;
    }
    if(grounded || groundBelow(player.x,player.feetY,player.z)){
      const raisedY=player.feetY+1;
      if(!collides(nx,raisedY,nz) && groundBelow(nx,raisedY,nz)){
        if(axis==="x")player.x=nx;else player.z=nz;
        player.feetY=raisedY;verticalVelocity=0;grounded=true;
      }
    }
  };
  tryAxis("x",dx*dt);
  tryAxis("z",dz*dt);
}
function updatePlayer(dt){
  const f=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
  const r=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
  const d=new THREE.Vector3();
  if(keys.has("forward"))d.add(f);if(keys.has("back"))d.sub(f);
  if(keys.has("right"))d.add(r);if(keys.has("left"))d.sub(r);
  if(d.lengthSq()>0){d.normalize();movePlayer(d.x*player.speed,d.z*player.speed,dt);}
  if(mode==="creative" && keys.has("flyup")) player.feetY+=5*dt;
  if(mode==="creative" && keys.has("flydown")) player.feetY-=5*dt;
  if(mode==="creative" && jumpQueued){verticalVelocity=5;grounded=false;}
  else if(jumpQueued&&grounded){verticalVelocity=7;grounded=false;}
  jumpQueued=false;
  if(mode==="creative"&&verticalVelocity===0&&!grounded){verticalVelocity=0;}
  else verticalVelocity-=18*dt;
  const ny=player.feetY+verticalVelocity*dt;
  if(verticalVelocity<=0 && groundBelow(player.x,ny,player.z)){
    player.feetY=Math.floor(ny-.08)+.5;verticalVelocity=0;grounded=true;
  }else if(!collides(player.x,ny,player.z)){player.feetY=ny;grounded=false;}
  else {verticalVelocity=0;grounded=true;}
  if(mode==="creative"&&player.feetY< -6)player.feetY=terrainHeight(Math.round(player.x),Math.round(player.z))+1;
  if(mode==="survival"&&player.feetY< -12)hurt(4,"You fell deep underground!");
  updateCamera();
}
function targetHit(){
  ray.setFromCamera(center,camera);
  const hits=ray.intersectObjects(Array.from(meshes.values()).concat(mobs.map(m=>m.mesh)),false);
  return hits.length&&hits[0].distance<7?hits[0]:null;
}
function updateOutline(){
  if(!playing){outline.visible=false;return;}
  const h=targetHit();
  if(!h||h.object.userData.isMob){outline.visible=false;return;}
  outline.position.copy(h.object.position);outline.visible=true;
}
function breakOrPunch(){
  const hit=targetHit();
  if(!hit){showToast("Aim at a block or creature.");return;}
  if(hit.object.userData.isMob){
    const mob=mobs.find(m=>m.mesh===hit.object);
    if(mob){mob.hp-=mode==="creative"?20:1;showToast("Punch!");if(mob.hp<=0)killMob(mob,true);}
    return;
  }
  const p=hit.object.position, type=blocks.get(keyOf(p.x,p.y,p.z));
  if(p.y<=-7){showToast("The deepest stone cannot be broken.");return;}
  if(mode==="survival"&&["iron","gold"].includes(type)&&!hasItem("stone_pickaxe")&&!hasItem("wooden_pickaxe")){
    showToast("You need a pickaxe for this ore.");return;
  }
  removeBlock(p.x,p.y,p.z,true);
  if(mode==="survival"&&type==="leaves"&&Math.random()<.2)addItem("apple");
  if(mode==="survival"&&type==="grass"&&Math.random()<.12)addItem("berry");
  showToast("Broke "+(TYPES[type]?.label||type));
}
function placeBlock(){
  const h=targetHit();
  if(!h||h.object.userData.isMob||!h.face){showToast("Aim at a block face.");return;}
  const n=h.face.normal.clone().transformDirection(h.object.matrixWorld);
  const p=h.object.position.clone().add(n);
  const x=Math.round(p.x),y=Math.round(p.y),z=Math.round(p.z);
  if(y< -7||y>30){showToast("Can't build there.");return;}
  if(Math.abs(x-player.x)<.7&&Math.abs(z-player.z)<.7&&y>=Math.floor(player.feetY)&&y<=Math.floor(player.feetY+1.7)){showToast("Move away first.");return;}
  if(mode==="survival"&&!hasItem(selected)){showToast("You don't have that block.");return;}
  if(addBlock(x,y,z,selected)){
    if(mode==="survival")takeItem(selected);
    showToast("Placed "+TYPES[selected].label);
  }
}
function eatFood(){
  if(mode==="creative"){health=20;updateHUD();showToast("Creative health restored.");return;}
  const foods=["apple","berry","cooked_meat","raw_meat"];
  const id=foods.find(f=>hasItem(f));
  if(!id){showToast("No food in your inventory.");return;}
  takeItem(id);
  health=Math.min(20,health+(id==="cooked_meat"?8:id==="apple"?5:id==="berry"?3:2));
  updateHUD();showToast("Ate "+TYPES[id].label+" and restored health.");
}
function hurt(amount,msg){
  if(mode==="creative")return;
  health=Math.max(0,health-amount);updateHUD();
  if(msg)showToast(msg);
  if(health<=0){
    health=20;player.x=0;player.z=0;player.feetY=terrainHeight(0,0)+1;
    verticalVelocity=0;
    for(const k of Object.keys(inventory))inventory[k]=Math.floor(inventory[k]*.5);
    updateHUD();showToast("You respawned. Some items were lost.");
  }
}
function spawnMob(type,x,z){
  const y=terrainHeight(x,z)+.45;
  const mesh=new THREE.Mesh(mobGeo,mobMats[type]);
  mesh.position.set(x,y,z);mesh.userData.isMob=true;mesh.userData.mobType=type;scene.add(mesh);
  mobs.push({type,mesh,hp:type==="slime"?3:2,x,z,attackCooldown:0,walk:Math.random()*5});
}
function spawnMobs(){
  if(mobs.length>9)return;
  for(let i=0;i<3;i++){
    const x=Math.round(player.x+(Math.random()-.5)*24),z=Math.round(player.z+(Math.random()-.5)*24);
    if(Math.abs(x-player.x)<5&&Math.abs(z-player.z)<5)continue;
    if(Math.abs(x)>14||Math.abs(z)>14)continue;
    const type=dayClock>0.5?"slime":(Math.random()>.5?"sheep":"pig");
    spawnMob(type,x,z);
  }
}
function killMob(mob,drop){
  scene.remove(mob.mesh);const i=mobs.indexOf(mob);if(i>=0)mobs.splice(i,1);
  if(drop&&mode==="survival"){
    if(mob.type==="slime")addItem("berry",1);
    else addItem("raw_meat",1);
  }
  showToast(mob.type==="slime"?"Slime defeated!":"Animal collected food!");
}
function updateMobs(dt){
  for(const m of [...mobs]){
    m.walk+=dt;m.attackCooldown-=dt;
    const dx=player.x-m.x,dz=player.z-m.z,dist=Math.hypot(dx,dz);
    if(m.type==="slime"&&dayClock>.5&&dist<11&&dist>.8){
      const nx=m.x+dx/dist*dt*1.1,nz=m.z+dz/dist*dt*1.1;
      if(!getBlock(Math.round(nx),Math.floor(m.mesh.position.y),Math.round(nz))){m.x=nx;m.z=nz;}
      if(dist<1.25&&m.attackCooldown<=0){hurt(2,"A slime hit you!");m.attackCooldown=1.4;}
    }else{
      m.x+=Math.sin(m.walk)*dt*.22;m.z+=Math.cos(m.walk*.8)*dt*.22;
    }
    m.mesh.position.set(m.x,terrainHeight(Math.round(m.x),Math.round(m.z))+.48+Math.sin(m.walk*3)*.05,m.z);
    m.mesh.rotation.y=Math.atan2(dx,dz);
  }
}
function updateTime(dt){
  dayClock+=dt/180;
  if(dayClock>=1){dayClock=0;dayNumber++;spawnMobs();}
  const angle=dayClock*Math.PI*2-Math.PI/2;
  const daylight=Math.max(.12,(Math.sin(angle)+1)/2);
  sun.position.set(Math.cos(angle)*25,Math.sin(angle)*35,10);
  sun.intensity=.15+daylight*1.9;
  scene.background.setRGB(.035+daylight*.48,.055+daylight*.68,.13+daylight*.85);
  scene.fog.color.copy(scene.background);
  $("#dayLabel").textContent=`Day ${dayNumber} Â· ${daylight<.3?"Night":daylight<.65?"Morning / Evening":"Day"}`;
  if(Math.random()<dt*.07)spawnMobs();
}
function updateHUD(){
  $("#modeLabel").textContent=mode.toUpperCase();
  $("#health").textContent=mode==="creative"?"â¥ CREATIVE":("â¤ï¸".repeat(Math.ceil(health/4))+"ð¤".repeat(5-Math.ceil(health/4)));
  $("#health").setAttribute("aria-label",`Health ${health}/20`);
  renderHotbar();
}
function showToast(text){
  const t=$("#toast");t.textContent=text;t.classList.add("show");
  clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>t.classList.remove("show"),1700);
}
function renderHotbar(){
  const bar=$("#hotbar");bar.innerHTML="";
  hotbarTypes.forEach((id,i)=>{
    const b=document.createElement("button");b.className="slot"+(selected===id?" selected":"");
    const sw=document.createElement("span");sw.className="swatch";sw.style.background="#"+TYPES[id].color.toString(16).padStart(6,"0");
    const name=document.createElement("span");name.textContent=mode==="survival"?`${TYPES[id].label} ${inventory[id]||0}`:TYPES[id].label;
    b.append(sw,name);b.addEventListener("click",()=>{selected=id;renderHotbar();});bar.append(b);
  });
}
const recipes=[
  {name:"Wood Planks Ã4",needs:{wood:1},gives:{plank:4}},
  {name:"Sticks Ã4",needs:{plank:2},gives:{stick:4}},
  {name:"Wood Pickaxe",needs:{plank:3,stick:2},gives:{wooden_pickaxe:1}},
  {name:"Stone Pickaxe",needs:{stone:3,stick:2},gives:{stone_pickaxe:1}},
  {name:"Sword",needs:{plank:2,stick:1},gives:{sword:1}},
  {name:"Cooked Meat Ã1",needs:{raw_meat:1,wood:1},gives:{cooked_meat:1}}
];
function openInventory(){
  renderInventory();$("#inventoryPanel").classList.remove("hidden");playing=false;keys.clear();
}
function renderInventory(){
  const list=$("#inventoryList");list.innerHTML="";
  for(const [id,count] of Object.entries(inventory)){
    if(count>0||mode==="creative"){
      const el=document.createElement("div");el.className="inv-item";
      el.textContent=`${TYPES[id].label}: ${mode==="creative"&&TYPES[id].kind==="block"?"â":count}`;
      list.append(el);
    }
  }
  const recipesEl=$("#recipes");recipesEl.innerHTML="";
  recipes.forEach(recipe=>{
    const row=document.createElement("div");row.className="recipe";
    const needs=Object.entries(recipe.needs).map(([id,n])=>`${TYPES[id].label} Ã${n}`).join(", ");
    const gives=Object.entries(recipe.gives).map(([id,n])=>`${TYPES[id].label} Ã${n}`).join(", ");
    const label=document.createElement("div");label.textContent=`${recipe.name}\nNeeds: ${needs}`;
    const btn=document.createElement("button");btn.textContent="Craft";
    const can=mode==="creative"||Object.entries(recipe.needs).every(([id,n])=>hasItem(id,n));
    btn.disabled=!can;btn.style.opacity=can?"1":".45";
    btn.addEventListener("click",()=>{
      if(mode!=="creative"){
        for(const [id,n] of Object.entries(recipe.needs))takeItem(id,n);
      }
      for(const [id,n] of Object.entries(recipe.gives))addItem(id,n);
      showToast("Crafted "+gives);renderInventory();
    });
    row.append(label,btn);recipesEl.append(row);
  });
}
function saveWorld(){
  try{
    const data={version:2,mode,seed,player:{x:player.x,feetY:player.feetY,z:player.z,yaw,pitch},blocks:[...blocks.entries()],inventory,health,dayClock,dayNumber,selected};
    localStorage.setItem("blockscape-world-v2",JSON.stringify(data));
    dirty=false;$("#status").textContent="Saved";showToast("World saved on this device!");
  }catch(e){console.error(e);showToast("Save failed. Storage may be full.");}
}
function loadWorld(){
  try{
    const raw=localStorage.getItem("blockscape-world-v2");if(!raw)return false;
    const d=JSON.parse(raw);if(!Array.isArray(d.blocks))return false;
    clearWorld();mode=d.mode==="creative"?"creative":"survival";seed=Number(d.seed)||1;
    for(const [k,type] of d.blocks){if(!mats[type]||typeof k!=="string")continue;const [x,y,z]=coords(k);if([x,y,z].every(Number.isFinite))addBlock(x,y,z,type,false);}
    Object.assign(inventory,d.inventory||{});
    Object.assign(player,d.player||{});yaw=Number(d.player?.yaw)||0;pitch=Number(d.player?.pitch)||0;
    health=Number(d.health)||20;dayClock=Number(d.dayClock)||0;dayNumber=Number(d.dayNumber)||1;
    selected=TYPES[d.selected]?d.selected:"grass";dirty=false;updateCamera();updateHUD();return true;
  }catch(e){console.error(e);return false;}
}
function newGame(){
  mode=$("#worldMode").value;seed=Math.floor(Math.random()*1000000)+1;
  generateWorld();
  // Add a few nearby passive animals.
  spawnMob("sheep",3,2);spawnMob("pig",-4,3);
  $("#welcome").classList.add("hidden");$("#pauseMenu").classList.add("hidden");
  playing=true;actionLock=false;updateHUD();
}
function resume(){playing=true;$("#pauseMenu").classList.add("hidden");$("#inventoryPanel").classList.add("hidden");$("#helpMenu").classList.add("hidden");}
function pause(){playing=false;keys.clear();$("#pauseMenu").classList.remove("hidden");}
$("#playBtn").addEventListener("click",()=>{
  mode=$("#worldMode").value;
  if(loadWorld()){mode=$("#worldMode").value; if(mode!== "creative"&&mode!=="survival")mode="survival";updateHUD();showToast("Loaded saved world.");$("#welcome").classList.add("hidden");playing=true;}
  else newGame();
});
$("#newBtn").addEventListener("click",newGame);
$("#menuBtn").addEventListener("click",()=>playing?pause():$("#welcome").classList.remove("hidden"));
$("#resumeBtn").addEventListener("click",resume);
$("#menuSaveBtn").addEventListener("click",saveWorld);
$("#saveBtn").addEventListener("click",saveWorld);
$("#closeMenuBtn").addEventListener("click",()=>{$("#pauseMenu").classList.add("hidden");$("#welcome").classList.remove("hidden");playing=false;});
$("#helpBtn").addEventListener("click",()=>{$("#pauseMenu").classList.add("hidden");$("#helpMenu").classList.remove("hidden");});
$("#helpBackBtn").addEventListener("click",()=>{$("#helpMenu").classList.add("hidden");$("#pauseMenu").classList.remove("hidden");});
$("#inventoryBtn").addEventListener("click",openInventory);
$("#closeInventoryBtn").addEventListener("click",()=>{$("#inventoryPanel").classList.add("hidden");playing=true;});
$("#jumpBtn").addEventListener("click",()=>{if(playing)jumpQueued=true;});
$("#breakBtn").addEventListener("click",breakOrPunch);
$("#placeBtn").addEventListener("click",placeBlock);
$("#eatBtn").addEventListener("click",eatFood);

document.querySelectorAll(".move").forEach(b=>{
  const dir=b.dataset.move;
  const press=e=>{
    e.preventDefault();
    if(!playing)return;
    keys.add(dir);
    try{b.setPointerCapture(e.pointerId);}catch(_){}
  };
  const release=e=>{if(e)e.preventDefault();keys.delete(dir);};
  b.addEventListener("pointerdown",press,{passive:false});
  b.addEventListener("pointerup",release,{passive:false});
  b.addEventListener("pointercancel",release,{passive:false});
  b.addEventListener("lostpointercapture",release);
  b.addEventListener("contextmenu",e=>e.preventDefault());
});
renderer.domElement.addEventListener("pointerdown",e=>{
  e.preventDefault();
  if(!playing||actionLock)return;
  // Drag with a mouse or finger to look around. Use E / the BREAK button to mine.
  // The left side remains available for movement controls.
  if(e.clientX>innerWidth*.30){
    lookPointer=e.pointerId;lastX=e.clientX;lastY=e.clientY;
    try { renderer.domElement.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  }
},{passive:false});
renderer.domElement.addEventListener("pointermove",e=>{
  if(e.pointerId!==lookPointer)return;
  e.preventDefault();
  yaw-=(e.clientX-lastX)*.005;pitch-=(e.clientY-lastY)*.005;
  lastX=e.clientX;lastY=e.clientY;pitch=THREE.MathUtils.clamp(pitch,-1.45,1.45);updateCamera();
},{passive:false});
function endLook(e){if(e.pointerId===lookPointer)lookPointer=null;}
renderer.domElement.addEventListener("pointerup",endLook);renderer.domElement.addEventListener("pointercancel",endLook);
window.addEventListener("keydown",e=>{
  const map={KeyW:"forward",ArrowUp:"forward",KeyS:"back",ArrowDown:"back",KeyA:"left",ArrowLeft:"left",KeyD:"right",ArrowRight:"right"};
  if(map[e.code]){keys.add(map[e.code]);e.preventDefault();}
  if(e.code==="Space"){jumpQueued=true;e.preventDefault();}
  if(e.code==="KeyE")breakOrPunch();if(e.code==="KeyQ")placeBlock();
  if(e.code==="KeyI")playing?openInventory():resume();
  if(e.code==="KeyF"&&mode==="creative")keys.add("flyup");
  if(e.code==="ShiftLeft"&&mode==="creative")keys.add("flydown");
  if(/^Digit[1-8]$/.test(e.code)){selected=hotbarTypes[Number(e.code.slice(5))-1];renderHotbar();}
});
window.addEventListener("keyup",e=>{
  const map={KeyW:"forward",ArrowUp:"forward",KeyS:"back",ArrowDown:"back",KeyA:"left",ArrowLeft:"left",KeyD:"right",ArrowRight:"right"};
  if(map[e.code])keys.delete(map[e.code]);if(e.code==="KeyF")keys.delete("flyup");if(e.code==="ShiftLeft")keys.delete("flydown");
});
window.addEventListener("blur",()=>{keys.clear();lookPointer=null;});
document.addEventListener("visibilitychange",()=>{if(document.hidden){keys.clear();lookPointer=null;}});
window.addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});

function animate(t=0){
  requestAnimationFrame(animate);
  const dt=Math.min((t-lastTime)/1000||0,.04);lastTime=t;
  if(playing){updatePlayer(dt);updateMobs(dt);updateTime(dt);updateOutline();}
  renderer.render(scene,camera);
}
function initializeDisplay(){
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
  updateCamera();renderHotbar();updateHUD();
  renderer.render(scene,camera);
}
initializeDisplay();
requestAnimationFrame(animate);
