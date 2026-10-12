
import * as THREE from
  "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

// --------------------------------------------------
// BLOCKSCAPE - 3D BLOCK SANDBOX
// --------------------------------------------------

const game = document.querySelector("#game");
const statusText = document.querySelector("#status");
const toastElement = document.querySelector("#toast");

const scene = new THREE.Scene();
scene.background = new THREE.Color("#8bc9fa");
scene.fog = new THREE.Fog("#8bc9fa", 22, 65);

const camera = new THREE.PerspectiveCamera(
  72, window.innerWidth / window.innerHeight, 0.1, 150
);

const renderer = new THREE.WebGLRenderer({
  antialias: false,
  powerPreference: "high-performance"
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
game.appendChild(renderer.domElement);

// Lighting
scene.add(new THREE.HemisphereLight(0xd9efff, 0x566342, 2));

const sunlight = new THREE.DirectionalLight(0xffffff, 2);
sunlight.position.set(15, 30, 10);
scene.add(sunlight);

// Block types
const TYPES = {
  grass:  { color: 0x65ad45, label: "Grass" },
  dirt:   { color: 0x87532f, label: "Dirt" },
  stone:  { color: 0x858b91, label: "Stone" },
  wood:   { color: 0x96602e, label: "Wood" },
  leaves: { color: 0x358344, label: "Leaves" },
  sand:   { color: 0xe5d08a, label: "Sand" },
  brick:  { color: 0xb85b48, label: "Brick" },
  glass:  { color: 0xa5e9ed, label: "Glass" }
};

const hotbarTypes = [
  "grass", "dirt", "stone", "wood",
  "leaves", "sand", "brick", "glass"
];

const materials = {};

for (const [type, info] of Object.entries(TYPES)) {
  materials[type] = new THREE.MeshLambertMaterial({
    color: info.color,
    transparent: type === "glass",
    opacity: type === "glass" ? 0.48 : 1
  });
}

const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
const blocks = new Map();
const blockMeshes = new Map();

let selectedType = "grass";
let worldSeed = 1;
let worldOpen = false;
let yaw = 0;
let pitch = 0;
let verticalVelocity = 0;
let grounded = true;
let jumpQueued = false;
let actionLocked = false;
let lastTime = 0;
let worldChanged = false;

const player = {
  x: 0,
  y: 5,
  z: 0,
  speed: 4.8
};

const keys = new Set();
const raycaster = new THREE.Raycaster();
const screenCenter = new THREE.Vector2(0, 0);
const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.015, 1.015, 1.015)),
  new THREE.LineBasicMaterial({ color: 0xffef9a })
);
highlight.visible = false;
scene.add(highlight);

// Block coordinates are integer grid positions.
function keyOf(x, y, z) {
  return `${x},${y},${z}`;
}

function readKey(key) {
  return key.split(",").map(Number);
}

function getBlock(x, y, z) {
  return blocks.get(keyOf(x, y, z));
}

function putBlock(x, y, z, type, mark = true) {
  x = Math.round(x);
  y = Math.round(y);
  z = Math.round(z);

  const key = keyOf(x, y, z);
  if (blocks.has(key) || !materials[type]) return false;

  const mesh = new THREE.Mesh(cubeGeometry, materials[type]);
  mesh.position.set(x, y, z);
  mesh.userData.blockKey = key;
  scene.add(mesh);

  blocks.set(key, type);
  blockMeshes.set(key, mesh);

  if (mark) worldChanged = true;
  return true;
}

function removeBlock(x, y, z) {
  const key = keyOf(x, y, z);
  const mesh = blockMeshes.get(key);
  if (!mesh) return false;

  scene.remove(mesh);
  blocks.delete(key);
  blockMeshes.delete(key);
  worldChanged = true;
  return true;
}

function clearWorld() {
  for (const mesh of blockMeshes.values()) scene.remove(mesh);
  blocks.clear();
  blockMeshes.clear();
  highlight.visible = false;
}

// Deterministic random generator for terrain.
function randomAt(x, z, seed = worldSeed) {
  let n = Math.imul(x + 374761, 668265263)
        ^ Math.imul(z + 127412, 2246822519)
        ^ Math.imul(seed, 3266489917);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967295;
}

function terrainHeight(x, z) {
  const rolling =
    Math.sin(x * 0.23) * 1.5 +
    Math.cos(z * 0.19) * 1.3 +
    Math.sin((x + z) * 0.12) * 1.1;

  const hills = randomAt(
    Math.floor(x / 4),
    Math.floor(z / 4)
  ) * 1.8;

  return Math.max(1, Math.floor(rolling + hills + 3));
}

function makeTree(x, groundY, z) {
  const trunkHeight = 3 + Math.floor(randomAt(x, z) * 2);

  for (let y = 1; y <= trunkHeight; y++) {
    putBlock(x, groundY + y, z, "wood", false);
  }

  const top = groundY + trunkHeight;

  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dy = -1; dy <= 2; dy++) {
        if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy) > 5) {
          continue;
        }

        const bx = x + dx;
        const by = top + dy;
        const bz = z + dz;

        if (!getBlock(bx, by, bz)) {
          putBlock(bx, by, bz, "leaves", false);
        }
      }
    }
  }
}

function generateWorld() {
  clearWorld();

  for (let x = -14; x <= 14; x++) {
    for (let z = -14; z <= 14; z++) {
      const height = terrainHeight(x, z);

      for (let y = 0; y <= height; y++) {
        let type = "stone";

        if (y === height) type = "grass";
        else if (y >= height - 2) type = "dirt";

        putBlock(x, y, z, type, false);
      }

      const nearSpawn = Math.abs(x) < 3 && Math.abs(z) < 3;
      const treeChance = randomAt(x * 7, z * 7);

      if (!nearSpawn && treeChance > 0.965) {
        makeTree(x, height, z);
      }
    }
  }

  // Decorative sandy patch.
  for (let x = 7; x <= 10; x++) {
    for (let z = -4; z <= -1; z++) {
      const y = terrainHeight(x, z);
      removeBlock(x, y, z);
      putBlock(x, y, z, "sand", false);
    }
  }

  player.x = 0;
  player.z = 0;
  player.y = terrainHeight(0, 0) + 2.5;
  yaw = 0;
  pitch = 0;
  verticalVelocity = 0;
  grounded = true;
  worldChanged = false;
  updateCamera();
  showToast("A new world has been created!");
  statusText.textContent = "New world";
}

function updateCamera() {
  camera.position.set(player.x, player.y, player.z);
  camera.rotation.order = "YXZ";
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;
}

function blockCollides(px, py, pz) {
  const radius = 0.28;
  const height = 1.65;

  for (let x = Math.floor(px - radius); x <= Math.floor(px + radius); x++) {
    for (let z = Math.floor(pz - radius); z <= Math.floor(pz + radius); z++) {
      for (let y = Math.floor(py - height); y <= Math.floor(py + 0.15); y++) {
        if (getBlock(x, y, z)) return true;
      }
    }
  }

  return false;
}

function movePlayer(dx, dz, dt) {
  // Resolve movement on each axis for simple block collision.
  const nx = player.x + dx * dt;
  if (!blockCollides(nx, player.y, player.z)) {
    player.x = nx;
  }

  const nz = player.z + dz * dt;
  if (!blockCollides(player.x, player.y, nz)) {
    player.z = nz;
  }
}

function updatePlayer(dt) {
  const forward = new THREE.Vector3(
    -Math.sin(yaw), 0, -Math.cos(yaw)
  );
  const right = new THREE.Vector3(
    Math.cos(yaw), 0, -Math.sin(yaw)
  );

  const direction = new THREE.Vector3();

  if (keys.has("forward")) direction.add(forward);
  if (keys.has("back")) direction.sub(forward);
  if (keys.has("right")) direction.add(right);
  if (keys.has("left")) direction.sub(right);

  if (direction.lengthSq() > 0) {
    direction.normalize();
    movePlayer(
      direction.x * player.speed,
      direction.z * player.speed,
      dt
    );
  }

  if (jumpQueued && grounded) {
    verticalVelocity = 7;
    grounded = false;
  }

  jumpQueued = false;

  verticalVelocity -= 18 * dt;
  const nextY = player.y + verticalVelocity * dt;

  if (blockCollides(player.x, nextY, player.z)) {
    if (verticalVelocity < 0) {
      grounded = true;
    }
    verticalVelocity = 0;
  } else {
    player.y = nextY;
    grounded = false;
  }

  // Prevent falling endlessly if the player leaves the map.
  if (player.y < -10) {
    player.x = 0;
    player.z = 0;
    player.y = terrainHeight(0, 0) + 3;
    verticalVelocity = 0;
    showToast("Back to the starting area!");
  }

  updateCamera();
}

// Find the block under the center crosshair.
function getTargetBlock() {
  raycaster.setFromCamera(screenCenter, camera);

  const meshes = Array.from(blockMeshes.values());
  const hits = raycaster.intersectObjects(meshes, false);

  if (!hits.length || hits[0].distance > 7) return null;
  return hits[0];
}

function updateHighlight() {
  if (!worldOpen) {
    highlight.visible = false;
    return;
  }

  const hit = getTargetBlock();

  if (!hit) {
    highlight.visible = false;
    return;
  }

  highlight.position.copy(hit.object.position);
  highlight.visible = true;
}

function breakTarget() {
  const hit = getTargetBlock();

  if (!hit) {
    showToast("Aim at a block first!");
    return;
  }

  const pos = hit.object.position;

  // Keep a ground layer so the world doesn't become empty.
  if (pos.y === 0) {
    showToast("The bottom layer cannot be broken.");
    return;
  }

  removeBlock(pos.x, pos.y, pos.z);
  showToast("Broke " + (TYPES[blocks.get(keyOf(pos.x, pos.y, pos.z))]?.label || "block"));
  statusText.textContent = "World edited";
}

function placeTarget() {
  const hit = getTargetBlock();

  if (!hit || !hit.face) {
    showToast("Aim at a block to place next to it!");
    return;
  }

  const normal = hit.face.normal.clone();
  normal.transformDirection(hit.object.matrixWorld);

  const pos = hit.object.position.clone().add(normal);
  const x = Math.round(pos.x);
  const y = Math.round(pos.y);
  const z = Math.round(pos.z);

  // Don't place a block inside the player's space.
  const dx = Math.abs(x - player.x);
  const dz = Math.abs(z - player.z);
  const overlapsPlayer = dx < 0.8 && dz < 0.8 &&
    y >= Math.floor(player.y - 1.6) &&
    y <= Math.floor(player.y + 0.2);

  if (overlapsPlayer) {
    showToast("Move away to place a block!");
    return;
  }

  if (putBlock(x, y, z, selectedType)) {
    showToast("Placed " + TYPES[selectedType].label);
    statusText.textContent = "World edited";
  }
}

// Hotbar
const hotbar = document.querySelector("#hotbar");

function renderHotbar() {
  hotbar.innerHTML = "";

  hotbarTypes.forEach((type, index) => {
    const button = document.createElement("button");
    button.className = "slot" + (selectedType === type ? " selected" : "");
    button.setAttribute("aria-label", TYPES[type].label);

    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = "#" + TYPES[type].color.toString(16).padStart(6, "0");

    const name = document.createElement("span");
    name.textContent = TYPES[type].label;

    button.append(swatch, name);
    button.addEventListener("click", () => {
      selectedType = type;
      renderHotbar();
    });

    hotbar.appendChild(button);
  });
}

renderHotbar();

// Toast notifications
let toastTimeout;

function showToast(message) {
  toastElement.textContent = message;
  toastElement.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toastElement.classList.remove("show");
  }, 1600);
}

// Save all blocks to this browser's local storage.
function saveWorld() {
  try {
    const data = {
      version: 1,
      seed: worldSeed,
      player: {
        x: player.x, y: player.y, z: player.z,
        yaw, pitch
      },
      blocks: Array.from(blocks.entries()),
      selectedType
    };

    localStorage.setItem("blockscape-world", JSON.stringify(data));
    worldChanged = false;
    statusText.textContent = "Saved!";
    showToast("World saved on this device!");
  } catch (error) {
    console.error(error);
    showToast("Save failed. Storage may be full.");
  }
}

function loadWorld() {
  try {
    const raw = localStorage.getItem("blockscape-world");
    if (!raw) return false;

    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.blocks)) return false;

    clearWorld();

    for (const entry of data.blocks) {
      if (!Array.isArray(entry) || entry.length !== 2) continue;

      const [key, type] = entry;
      if (typeof key !== "string" || !materials[type]) continue;

      const [x, y, z] = readKey(key);
      if ([x, y, z].every(Number.isFinite)) {
        putBlock(x, y, z, type, false);
      }
    }

    worldSeed = Number(data.seed) || 1;

    if (data.player) {
      player.x = Number(data.player.x) || 0;
      player.y = Number(data.player.y) || 5;
      player.z = Number(data.player.z) || 0;
      yaw = Number(data.player.yaw) || 0;
      pitch = Number(data.player.pitch) || 0;
    }

    if (materials[data.selectedType]) {
      selectedType = data.selectedType;
      renderHotbar();
    }

    updateCamera();
    worldChanged = false;
    statusText.textContent = "Loaded";
    return true;
  } catch (error) {
    console.error(error);
    showToast("Could not load saved world.");
    return false;
  }
}

// Touch and mouse look controls
let lookPointer = null;
let lastX = 0;
let lastY = 0;
let lookMoved = false;

renderer.domElement.addEventListener("pointerdown", event => {
  if (!worldOpen || actionLocked) return;

  // Mouse users can click to break a block.
  if (event.pointerType === "mouse") {
    if (event.button === 0) breakTarget();
    return;
  }

  // Use the right half of the screen for looking around.
  if (event.clientX > window.innerWidth * 0.38) {
    lookPointer = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    lookMoved = false;
    renderer.domElement.setPointerCapture(event.pointerId);
  }
});

renderer.domElement.addEventListener("pointermove", event => {
  if (event.pointerId !== lookPointer) return;

  const dx = event.clientX - lastX;
  const dy = event.clientY - lastY;
  lastX = event.clientX;
  lastY = event.clientY;

  if (Math.abs(dx) + Math.abs(dy) > 1) lookMoved = true;

  yaw -= dx * 0.005;
  pitch -= dy * 0.005;
  pitch = THREE.MathUtils.clamp(pitch, -1.45, 1.45);
  updateCamera();
});

function endLook(event) {
  if (event.pointerId === lookPointer) {
    lookPointer = null;
  }
}

renderer.domElement.addEventListener("pointerup", endLook);
renderer.domElement.addEventListener("pointercancel", endLook);

// Direction pad supports holding buttons.
document.querySelectorAll(".move").forEach(button => {
  const direction = button.dataset.move;

  button.addEventListener("pointerdown", event => {
    event.preventDefault();
    if (!worldOpen) return;
    keys.add(direction);
    button.setPointerCapture(event.pointerId);
  });

  const release = () => keys.delete(direction);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
});

// Keyboard controls for computers
window.addEventListener("keydown", event => {
  if (event.repeat && event.code === "Space") return;

  const map = {
    KeyW: "forward", ArrowUp: "forward",
    KeyS: "back", ArrowDown: "back",
    KeyA: "left", ArrowLeft: "left",
    KeyD: "right", ArrowRight: "right"
  };

  if (map[event.code]) {
    keys.add(map[event.code]);
    event.preventDefault();
  }

  if (event.code === "Space") {
    jumpQueued = true;
    event.preventDefault();
  }

  if (/^Digit[1-8]$/.test(event.code)) {
    selectedType = hotbarTypes[Number(event.code.slice(5)) - 1];
    renderHotbar();
  }

  if (event.code === "KeyE") breakTarget();
  if (event.code === "KeyQ") placeTarget();
});

window.addEventListener("keyup", event => {
  const map = {
    KeyW: "forward", ArrowUp: "forward",
    KeyS: "back", ArrowDown: "back",
    KeyA: "left", ArrowLeft: "left",
    KeyD: "right", ArrowRight: "right"
  };

  if (map[event.code]) keys.delete(map[event.code]);
});

window.addEventListener("blur", () => keys.clear());

document.querySelector("#jumpBtn").addEventListener("click", () => {
  if (worldOpen) jumpQueued = true;
});

document.querySelector("#breakBtn").addEventListener("click", breakTarget);
document.querySelector("#placeBtn").addEventListener("click", placeTarget);
document.querySelector("#saveBtn").addEventListener("click", saveWorld);
document.querySelector("#menuSaveBtn").addEventListener("click", saveWorld);

const welcome = document.querySelector("#welcome");
const pauseMenu = document.querySelector("#pauseMenu");
const helpMenu = document.querySelector("#helpMenu");

function startGame() {
  worldOpen = true;
  welcome.classList.add("hidden");
  pauseMenu.classList.add("hidden");
  helpMenu.classList.add("hidden");
  actionLocked = false;
}

function pauseGame() {
  worldOpen = false;
  keys.clear();
  pauseMenu.classList.remove("hidden");
}

document.querySelector("#playBtn").addEventListener("click", () => {
  if (!loadWorld()) {
    worldSeed = Math.floor(Math.random() * 1000000) + 1;
    generateWorld();
  } else {
    showToast("Welcome back!");
  }
  startGame();
});

document.querySelector("#newBtn").addEventListener("click", () => {
  worldSeed = Math.floor(Math.random() * 1000000) + 1;
  generateWorld();
  startGame();
});

document.querySelector("#menuBtn").addEventListener("click", () => {
  if (worldOpen) pauseGame();
  else if (pauseMenu.classList.contains("hidden")) startGame();
  else pauseMenu.classList.add("hidden");
});

document.querySelector("#resumeBtn").addEventListener("click", startGame);
document.querySelector("#closeMenuBtn").addEventListener("click", () => {
  pauseMenu.classList.add("hidden");
  welcome.classList.remove("hidden");
  worldOpen = false;
});

document.querySelector("#helpBtn").addEventListener("click", () => {
  pauseMenu.classList.add("hidden");
  helpMenu.classList.remove("hidden");
});

document.querySelector("#helpBackBtn").addEventListener("click", () => {
  helpMenu.classList.add("hidden");
  pauseMenu.classList.remove("hidden");
});

// Resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Main loop
function animate(time = 0) {
  requestAnimationFrame(animate);

  const dt = Math.min((time - lastTime) / 1000 || 0, 0.04);
  lastTime = time;

  if (worldOpen) {
    updatePlayer(dt);
    updateHighlight();
  }

  renderer.render(scene, camera);
}

animate();
