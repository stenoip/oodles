/* ALL CODE IS Copyright to Stenoip Company, 2025.

    YOU MUST GAIN PERMISSION TO USE THIS CODE!
    
    */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.157.0/build/three.module.js';
import { FontLoader } from 'https://cdn.jsdelivr.net/npm/three@0.157.0/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'https://cdn.jsdelivr.net/npm/three@0.157.0/examples/jsm/geometries/TextGeometry.js';

// --- EXPORTED FUNCTIONS & VARIABLES ---
// These are used by search.js to interact with the 3D world.
export var scene;
export var buildings = [];
export var resultMeshes = [];
export var resultLabels = [];
export function displaySearchResultsIn3D(items) {
    _displaySearchResultsIn3D(items);
}
// --------------------------------------

// ====================================================================
// THREE.JS SETUP
// ====================================================================

scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // sky
var camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
var renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// --- TEXTURE LOADING ---
const textureLoader = new THREE.TextureLoader();

// User-specified Texture URLs
const BUILDING_TEXTURE_URL = 'textures/buildling_texture.jpg';
const ROAD_TEXTURE_URL = 'textures/ground_texture.jpg';

let buildingTexture = null; 
let roadTexture = null; 

// Load the textures
textureLoader.load(BUILDING_TEXTURE_URL, function (texture) {
    buildingTexture = texture;
    buildingTexture.wrapS = THREE.RepeatWrapping;
    buildingTexture.wrapT = THREE.RepeatWrapping;
    buildingTexture.colorSpace = THREE.SRGBColorSpace;
    console.log("Building texture loaded.");
});

textureLoader.load(ROAD_TEXTURE_URL, function (texture) {
    roadTexture = texture;
    roadTexture.wrapS = THREE.RepeatWrapping;
    roadTexture.wrapT = THREE.RepeatWrapping;
    roadTexture.repeat.set(10, 10); // Repeat across the large ground plane
    roadTexture.colorSpace = THREE.SRGBColorSpace;
    console.log("Road texture loaded.");
    // Update ground material when texture is loaded
    ground.material = new THREE.MeshStandardMaterial({ map: roadTexture, roughness: 0.8 });
    ground.material.needsUpdate = true;
});
// --- END TEXTURE LOADING ---


// Ground plane (Road/City Floor)
var ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshLambertMaterial({ color: 0x333333 }) // Placeholder before texture loads
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// Lights
var hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
scene.add(hemi);
var dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(20, 40, 20);
scene.add(dirLight);

// Camera start position
camera.position.set(0, 1.7, 10); // eye height
camera.rotation.order = 'YXZ';   // yaw-pitch order

var font = null; // Stores the loaded font

// ====================================================================
// DYNAMIC 3D OBJECT CREATION
// ====================================================================

function clearPreviousResults() {
    // Remove all meshes and labels from the scene
    resultMeshes.forEach(mesh => scene.remove(mesh));
    resultLabels.forEach(label => scene.remove(label));

    // Clear the tracking arrays
    resultMeshes = [];
    resultLabels = [];
    buildings = [];
}

/**
 * Creates and adds multiple lines of 3D text for one of the building's walls.
 */
function createTextLabel(textLines, x, y, z, w, d, rotationY) {
    if (!font) return;

    const LINE_HEIGHT = 1.0; // Vertical spacing between lines
    const textMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 }); // Black text for better contrast

    textLines.forEach((text, index) => {
        // Line 0 is the title, size 0.8. Line 1 is the URL, size 0.6.
        const textSize = index === 0 ? 0.8 : 0.6;
        const yOffset = index * -LINE_HEIGHT; // Move subsequent lines down

        var textGeometry = new TextGeometry(text, {
            font: font,
            size: textSize,
            height: 0.05, 
            curveSegments: 4
        });

        // Center the text horizontally
        textGeometry.computeBoundingBox();
        const textWidth = textGeometry.boundingBox.max.x - textGeometry.boundingBox.min.x;
        textGeometry.translate(
            -0.5 * textWidth,
            0,
            0
        );

        var textMesh = new THREE.Mesh(textGeometry, textMaterial);
        
        // Calculate the offset distance to place the text just off the wall
        const wallOffset = 0.01; 
        let offsetX = 0;
        let offsetZ = 0;

        // Determine position based on the rotation (which wall face)
        if (rotationY === 0 || rotationY === 2 * Math.PI) { // Front wall (Z+)
            offsetZ = d / 2 + wallOffset;
        } else if (rotationY === Math.PI) { // Back wall (Z-)
            offsetZ = -(d / 2 + wallOffset);
        } else if (rotationY === Math.PI / 2) { // Right wall (X+)
            offsetX = w / 2 + wallOffset;
        } else if (rotationY === 3 * Math.PI / 2) { // Left wall (X-)
            offsetX = -(w / 2 + wallOffset);
        }

        // Position the mesh at the building's center + the calculated offset + vertical adjustment
        textMesh.position.set(x + offsetX, y + yOffset, z + offsetZ); 
        textMesh.rotation.y = rotationY;
        
        scene.add(textMesh);
        resultLabels.push(textMesh);
    });
}

function addBuilding(x, z, w, d, h, color, link, title) {
    const yCenter = h / 2;
    const geometry = new THREE.BoxGeometry(w, h, d);
    
    // 1. Prepare Text Lines with Character Limits
    const MAX_TITLE_LENGTH = 15;
    const MAX_URL_LENGTH = 25;
    
    const trimmedTitle = title.length > MAX_TITLE_LENGTH ? title.substring(0, MAX_TITLE_LENGTH) + '...' : title;
    // Remove protocol for cleaner URL display
    const cleanedUrl = link.replace(/^(https?:\/\/)/, '').replace(/\/$/, '');
    const trimmedUrl = cleanedUrl.length > MAX_URL_LENGTH ? cleanedUrl.substring(0, MAX_URL_LENGTH) + '...' : cleanedUrl;

    const textLines = [trimmedTitle, trimmedUrl];
    
    // 2. Prepare Favicon URL
    let domain = '';
    try {
        domain = new URL(link).hostname;
    } catch (e) {
        domain = 'default.com'; 
    }
    const faviconUrl = `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=64`;

    // 3. Setup Materials
    const sideTexture = buildingTexture ? buildingTexture.clone() : new THREE.Texture();
    sideTexture.needsUpdate = true;
    sideTexture.repeat.set(w / 4, h / 8); 
    sideTexture.offset.set(Math.random(), Math.random());
    const sideMaterial = new THREE.MeshStandardMaterial({
        map: buildingTexture ? sideTexture : null,
        color: color, 
        metalness: 0.2,       
        roughness: 0.8        
    });

    const topMaterial = new THREE.MeshStandardMaterial({
        color: 0x444444, // Placeholder for top
        metalness: 0.2,       
        roughness: 0.8        
    });

    // Face order: [Right, Left, Top, Bottom, Front, Back]
    const materials = [
        sideMaterial, sideMaterial, topMaterial, sideMaterial, sideMaterial, sideMaterial
    ];

    var mesh = new THREE.Mesh(geometry, materials); 
    mesh.position.set(x, yCenter, z);
    mesh.userData = { isBuilding: true, link: link, title: title }; 
    scene.add(mesh);

    // 4. Load Favicon Texture Asynchronously
    textureLoader.load(faviconUrl, 
        function (faviconMap) {
            faviconMap.colorSpace = THREE.SRGBColorSpace;
            topMaterial.map = faviconMap;
            topMaterial.color = new THREE.Color(0xffffff);
            topMaterial.needsUpdate = true;
            mesh.material[2] = topMaterial; 
        },
        undefined,
        function (err) { /* Error handling for favicon */ }
    );

    // 5. Create the 3D text labels on all four walls
    const yLabel = yCenter - 0.7; // Start point for text (Title)

    // 1. Front Wall (Facing Z+)
    createTextLabel(textLines, x, yLabel, z, w, d, 0); 
    
    // 2. Back Wall (Facing Z-)
    createTextLabel(textLines, x, yLabel, z, w, d, Math.PI); 

    // 3. Right Wall (Facing X+)
    createTextLabel(textLines, x, yLabel, z, w, d, Math.PI / 2); 
    
    // 4. Left Wall (Facing X-)
    createTextLabel(textLines, x, yLabel, z, w, d, 3 * Math.PI / 2); 

    // 6. Precompute AABB for collision and store it
    var aabb = new THREE.Box3().setFromObject(mesh);
    buildings.push({ mesh: mesh, aabb: aabb, w: w, d: d, h: h });
    
    resultMeshes.push(mesh);
}

function _displaySearchResultsIn3D(items) {
    clearPreviousResults(); // Clear old world before drawing new one

    if (!items || items.length === 0) {
        console.log("No search results to display in 3D.");
        return;
    }
    
    // Grid Parameters
    const MAX_BUILDINGS = 50; 
    const gridSize = 7; 
    const spacing = 18; 
    
    // Calculate starting coordinates for centering the grid on (0, 0)
    const startX = -((gridSize - 1) * spacing) / 2;
    const startZ = -((gridSize - 1) * spacing) / 2;
    
    const resultsToDraw = items.slice(0, MAX_BUILDINGS);

    resultsToDraw.forEach((data, index) => {
        // Calculate grid position
        const i = index % gridSize;
        const j = Math.floor(index / gridSize);

        const x = startX + i * spacing;
        const z = startZ + j * spacing;

        // Randomize size for variety
        const w = 4 + Math.random() * 3;
        const d = 4 + Math.random() * 3;
        const h = 5 + Math.random() * 15;
        
        // Calculate a consistent color based on the index
        const color = new THREE.Color().setHSL(index / MAX_BUILDINGS, 0.7, 0.6).getHex();

        addBuilding(x, z, w, d, h, color, data.url, data.title);
    });

    console.log(`Successfully created ${resultsToDraw.length} 3D buildings.`);
}


// ====================================================================
// CAR SYSTEM LOGIC (DETAILED CARS)
// ====================================================================

const CAR_COUNT = 20;
const CAR_WIDTH = 1.0;
const CAR_HEIGHT = 0.5;
const CAR_DEPTH = 2.0;
const CAR_SPEED_MAX = 0.15;
const CAR_LANE_Z = [-18, 18, -36, 36]; 
const CAR_MAP_X_BOUND = 100;

var cars = [];

function createCarMesh() {
    const group = new THREE.Group();
    const carColor = Math.random() * 0xffffff;
    
    // 1. Chassis (Body)
    const chassisGeometry = new THREE.BoxGeometry(CAR_WIDTH, CAR_HEIGHT * 0.5, CAR_DEPTH);
    const chassisMaterial = new THREE.MeshLambertMaterial({ color: carColor });
    const chassis = new THREE.Mesh(chassisGeometry, chassisMaterial); 
    chassis.position.y = CAR_HEIGHT * 0.25; 
    group.add(chassis);

    // 2. Cab (Top cabin)
    const cabWidth = CAR_WIDTH * 0.9;
    const cabHeight = CAR_HEIGHT * 0.7;
    const cabDepth = CAR_DEPTH * 0.4;
    const cabGeometry = new THREE.BoxGeometry(cabWidth, cabHeight, cabDepth);
    const cabMaterial = new THREE.MeshLambertMaterial({ color: 0x888888 }); // Grey window tint
    const cab = new THREE.Mesh(cabGeometry, cabMaterial); 
    cab.position.y = CAR_HEIGHT * 0.5 + cabHeight / 2;
    cab.position.z = CAR_DEPTH * 0.1;
    group.add(cab);
    
    // 3. Wheel Cylinders
    const wheelRadius = 0.15;
    const wheelThickness = 0.4;
    const wheelGeometry = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelThickness, 8);
    wheelGeometry.rotateX(Math.PI / 2); 
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.5 });
    
    // Positions relative to the car center
    const wheelOffsetZ = CAR_DEPTH / 2 * 0.7;
    const wheelOffsetX = CAR_WIDTH / 2 + wheelThickness / 2;
    
    const wheelPositions = [
        {x: wheelOffsetX, z: wheelOffsetZ},    // Front Right
        {x: -wheelOffsetX, z: wheelOffsetZ},   // Front Left
        {x: wheelOffsetX, z: -wheelOffsetZ},   // Back Right
        {x: -wheelOffsetX, z: -wheelOffsetZ},  // Back Left
    ];

    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial); 
        wheel.position.set(pos.x * 0.9, wheelRadius, pos.z); 
        group.add(wheel);
    });

    return group; 
}
function initializeCars() {
    for (let i = 0; i < CAR_COUNT; i++) {
        const mesh = createCarMesh();
        
        // Randomly select a lane and initial position
        const laneZ = CAR_LANE_Z[i % CAR_LANE_Z.length];
        const direction = (i % 2 === 0) ? 1 : -1; 
        const startX = (direction > 0) ? -CAR_MAP_X_BOUND : CAR_MAP_X_BOUND;
        
        mesh.userData = {
            direction: direction,
            speed: CAR_SPEED_MAX * (0.5 + Math.random() * 0.5) 
        };
        
        mesh.position.set(startX + Math.random() * CAR_MAP_X_BOUND * 2 * direction, 0, laneZ);
        mesh.rotation.y = (direction > 0) ? -Math.PI / 2 : Math.PI / 2; 

        scene.add(mesh);
        cars.push(mesh);
    }
}

function updateCars() {
    const boundary = CAR_MAP_X_BOUND + 10; 
    
    cars.forEach(car => {
        car.position.x += car.userData.direction * car.userData.speed;
        
        if (car.userData.direction > 0 && car.position.x > boundary) {
            car.position.x = -boundary; 
        } else if (car.userData.direction < 0 && car.position.x < -boundary) {
            car.position.x = boundary;
        }
    });
}
initializeCars();

// ====================================================================
// INPUT & INTERACTIVITY (Collision, Movement, Clicking, KEYBOARD)
// ====================================================================

var raycaster = new THREE.Raycaster();
var mouse = new THREE.Vector2();

function onCanvasClick(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    var intersects = raycaster.intersectObjects(resultMeshes);

    if (intersects.length > 0) {
        var mesh = intersects[0].object; 
        if (mesh.userData.isBuilding && mesh.userData.link) {
            console.log(`Opening link: ${mesh.userData.link}`);
            window.open(mesh.userData.link, '_blank');
        }
    }
}
renderer.domElement.addEventListener('click', onCanvasClick, false);

// Movement and look controls
var move = { forward: false, back: false, left: false, right: false, turnLeft: false, turnRight: false };
var speed = 0.12;
var turnSpeed = 0.02; 
var playerRadius = 0.35; 
var upVector = new THREE.Vector3(0, 1, 0);

function bindButton(id, key) {
    var btn = document.getElementById(id);
    if (!btn) return;
    
    // Touch
    btn.ontouchstart = function(e) { e.preventDefault(); move[key] = true; };
    btn.ontouchend   = function(e) { e.preventDefault(); move[key] = false; };
    // Mouse
    btn.onmousedown  = function() { move[key] = true; };
    btn.onmouseup    = function() { move[key] = false; };
    btn.onmouseleave = function() { move[key] = false; };
}
bindButton('forward', 'forward');
bindButton('back', 'back');
bindButton('left', 'left');
bindButton('right', 'right');
bindButton('turnLeft', 'turnLeft');
bindButton('turnRight', 'turnRight');

// --- KEYBOARD CONTROLS ADDED HERE ---
document.addEventListener('keydown', function(event) {
    switch (event.key.toLowerCase()) {
        case 'w': move.forward = true; break;
        case 's': move.back = true; break;
        case 'a': move.left = true; break;
        case 'd': move.right = true; break;
        case 'q': move.turnLeft = true; break;
        case 'e': move.turnRight = true; break;
    }
});

document.addEventListener('keyup', function(event) {
    switch (event.key.toLowerCase()) {
        case 'w': move.forward = false; break;
        case 's': move.back = false; break;
        case 'a': move.left = false; break;
        case 'd': move.right = false; break;
        case 'q': move.turnLeft = false; break;
        case 'e': move.turnRight = false; break;
    }
});
// --- END KEYBOARD CONTROLS ---

// Collision helpers
function expandedAABB(aabb, radius) {
    var min = aabb.min.clone();
    var max = aabb.max.clone();
    min.x -= radius; min.z -= radius;
    max.x += radius; max.z += radius;
    return new THREE.Box3(min, max);
}

function collidesAtPosition(nextPos) {
    for (var i = 0; i < buildings.length; i++) {
        var b = buildings[i];
        var a = expandedAABB(b.aabb, playerRadius);
        if (
            nextPos.x >= a.min.x && nextPos.x <= a.max.x &&
            nextPos.z >= a.min.z && nextPos.z <= a.max.z
        ) {
            return true;
        }
    }
    return false;
}

function tryMove(delta) {
    var next = camera.position.clone().add(delta);
    if (!collidesAtPosition(next)) {
        camera.position.copy(next);
    } else {
        var slideX = camera.position.clone().add(new THREE.Vector3(delta.x, 0, 0));
        if (!collidesAtPosition(slideX)) camera.position.copy(slideX);
        else {
            var slideZ = camera.position.clone().add(new THREE.Vector3(0, 0, delta.z));
            if (!collidesAtPosition(slideZ)) camera.position.copy(slideZ);
        }
    }
}

// Animate Loop
var dir = new THREE.Vector3();
var right = new THREE.Vector3();

function animate() {
    requestAnimationFrame(animate);

    // --- Car Update ---
    updateCars();
    // --- End Car Update ---

    // Turn (yaw)
    if (move.turnLeft) camera.rotation.y += turnSpeed;
    if (move.turnRight) camera.rotation.y -= turnSpeed;

    // Movement relative to view
    camera.getWorldDirection(dir).normalize();
    right.copy(dir).cross(upVector).normalize();

    var step = new THREE.Vector3(0, 0, 0);
    if (move.forward) step.addScaledVector(dir, speed);
    if (move.back) step.addScaledVector(dir, -speed);
    if (move.left) step.addScaledVector(right, -speed);
    if (move.right) step.addScaledVector(right, speed);

    step.y = 0; 

    if (step.lengthSq() > 0) tryMove(step);

    renderer.render(scene, camera);
}

animate();

// Resize handling
window.addEventListener('resize', function() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Load the font and then initialize the search.
// search.js depends on the font being loaded before calling executeSearch.
const fontLoader = new FontLoader();
fontLoader.load('https://cdn.jsdelivr.net/npm/three@0.157.0/examples/fonts/helvetiker_regular.typeface.json', function (loadedFont) {
    font = loadedFont;
    console.log("3D font loaded. Ready for search initialization in search.js.");
    
    // Since search.js is the entry point, we don't call initializeFromInput here.
    // Instead, the promise that font is loaded must be handled by search.js.
    // For simplicity in this split, we rely on search.js being loaded after world.js
    // and using an exported function (if needed), but the input logic is in search.js.
    const event = new CustomEvent('fontLoaded');
    document.dispatchEvent(event);
});
