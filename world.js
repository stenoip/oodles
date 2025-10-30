/* ALL CODE IS Copyright to Stenoip Company, 2025.

    YOU MUST GAIN PERMISSION TO USE THIS CODE!
    
    */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.157.0/build/three.module.js';
import { FontLoader } from 'https://cdn.jsdelivr.net/npm/three@0.157.0/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'https://cdn.jsdelivr.net/npm/three@0.157.0/examples/jsm/geometries/TextGeometry.js';

// ====================================================================
// THREE.JS SETUP
// ====================================================================

var scene = new THREE.Scene();
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

// Dynamic Building/Collision Storage
var buildings = []; // Stores meshes and AABBs for collision
var resultMeshes = []; // Stores the actual THREE.Mesh objects
var resultLabels = []; // Stores the 3D Text objects
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
 * Creates and adds a 3D text label for one of the building's walls.
 * 
 */
function createTextLabel(text, x, y, z, w, d, rotationY) {
    if (!font) return;

    // Trim the text to ensure it fits nicely on the wall
    const MAX_TITLE_LENGTH = 15; // Slightly reduced for wall visibility
    const trimmedText = text.length > MAX_TITLE_LENGTH ? text.substring(0, MAX_TITLE_LENGTH) + '...' : text;

    var textMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 }); // Black text for better contrast
    var textGeometry = new TextGeometry(trimmedText, {
        font: font,
        size: 0.8,
        height: 0.05, // Thin text to sit flush
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
    const wallOffset = 0.01; // Prevents z-fighting
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

    // Position the mesh at the building's center + the calculated offset
    // Y position (y) is the center height of the building (h/2)
    textMesh.position.set(x + offsetX, y, z + offsetZ); 
    textMesh.rotation.y = rotationY;
    
    scene.add(textMesh);
    
    resultLabels.push(textMesh);
}

function addBuilding(x, z, w, d, h, color, link, title) {
    const yCenter = h / 2;
    const geometry = new THREE.BoxGeometry(w, h, d);
    
    // Attempt to extract the domain for favicon lookup
    let domain = '';
    try {
        domain = new URL(link).hostname;
    } catch (e) {
        domain = 'default.com'; // Fallback domain
    }
    // Google's S2 service for cross-origin favicon retrieval (works for many sites)
    const faviconUrl = `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=64`;

    // 1. Side Material (Texture + Color Tint)
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

    // 2. Top Material (Favicon) - Initialize with a placeholder color
    const topMaterial = new THREE.MeshStandardMaterial({
        color: 0x444444, // Placeholder dark color for top
        metalness: 0.2,       
        roughness: 0.8        
    });

    // Face order: [Right, Left, Top, Bottom, Front, Back]
    // The top face is index 2.
    const materials = [
        sideMaterial, // Right (0)
        sideMaterial, // Left (1)
        topMaterial,  // TOP (2)
        sideMaterial, // Bottom (3)
        sideMaterial, // Front (4)
        sideMaterial  // Back (5)
    ];

    var mesh = new THREE.Mesh(geometry, materials); 
    mesh.position.set(x, yCenter, z);
    mesh.userData = { isBuilding: true, link: link, title: title }; 
    scene.add(mesh);

    // 3. Load Favicon Texture Asynchronously
    textureLoader.load(faviconUrl, 
        function (faviconMap) {
            faviconMap.colorSpace = THREE.SRGBColorSpace;
            // Apply loaded favicon to the top material
            topMaterial.map = faviconMap;
            topMaterial.color = new THREE.Color(0xffffff); // Use white color to prevent tinting the favicon
            topMaterial.needsUpdate = true;
            mesh.material[2] = topMaterial; // Reassign the material to ensure update
        },
        undefined,
        function (err) {
            // console.warn(`Failed to load favicon for ${domain}`);
        }
    );

    // Create the 3D text labels on all four walls
    const yLabel = yCenter - 1.5; // Place text lower on the wall for better fit
    
    // ... createTextLabel calls ...

    // 1. Front Wall (Facing Z+)
    createTextLabel(title, x, yLabel, z, w, d, 0); 
    
    // 2. Back Wall (Facing Z-)
    createTextLabel(title, x, yLabel, z, w, d, Math.PI); 

    // 3. Right Wall (Facing X+)
    createTextLabel(title, x, yLabel, z, w, d, Math.PI / 2); 
    
    // 4. Left Wall (Facing X-)
    createTextLabel(title, x, yLabel, z, w, d, 3 * Math.PI / 2); 

    // Precompute AABB for collision and store it
    var aabb = new THREE.Box3().setFromObject(mesh);
    buildings.push({ mesh: mesh, aabb: aabb, w: w, d: d, h: h });
    
    resultMeshes.push(mesh);
}

function displaySearchResultsIn3D(items) {
    clearPreviousResults(); // Clear old world before drawing new one

    if (!items || items.length === 0) {
        console.log("No search results to display in 3D.");
        return;
    }
    
    // ... existing grid setup ...

    // Grid Parameters
    const MAX_BUILDINGS = 50; 
    const gridSize = 7; // Max results: 7x7 = 49
    const spacing = 18; // Space between buildings
    
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
        // Using HSL for vibrant, distinct colors
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
// Lanes placed between building rows
const CAR_LANE_Z = [-18, 18, -36, 36]; 
const CAR_MAP_X_BOUND = 100;

var cars = [];

function createCarMesh() {
    const group = new THREE.Group();
    const carColor = Math.random() * 0xffffff;
    
    // 1. Chassis (Body)
    const chassisGeometry = new THREE.BoxGeometry(CAR_WIDTH, CAR_HEIGHT * 0.5, CAR_DEPTH);
    const chassisMaterial = new THREE.MeshLambertMaterial({ color: carColor });
    const chassis = new new THREE.Mesh(chassisGeometry, chassisMaterial);
    chassis.position.y = CAR_HEIGHT * 0.25; 
    group.add(chassis);

    // 2. Cab (Top cabin)
    const cabWidth = CAR_WIDTH * 0.9;
    const cabHeight = CAR_HEIGHT * 0.7;
    const cabDepth = CAR_DEPTH * 0.4;
    const cabGeometry = new THREE.BoxGeometry(cabWidth, cabHeight, cabDepth);
    const cabMaterial = new THREE.MeshLambertMaterial({ color: 0x888888 }); // Grey window tint
    const cab = new new THREE.Mesh(cabGeometry, cabMaterial);
    cab.position.y = CAR_HEIGHT * 0.5 + cabHeight / 2;
    cab.position.z = CAR_DEPTH * 0.1;
    group.add(cab);
    
    // 3. Wheel Cylinders
    const wheelRadius = 0.15;
    const wheelThickness = 0.4;
    const wheelGeometry = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelThickness, 8);
    wheelGeometry.rotateX(Math.PI / 2); // Orient for x-axis rotation
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
        const wheel = new new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.position.set(pos.x * 0.9, wheelRadius, pos.z); // Slightly tuck wheels inside
        group.add(wheel);
    });

    return group; // Return the entire car group
}

function initializeCars() {
    for (let i = 0; i < CAR_COUNT; i++) {
        const mesh = createCarMesh();
        
        // Randomly select a lane and initial position
        const laneZ = CAR_LANE_Z[i % CAR_LANE_Z.length];
        const direction = (i % 2 === 0) ? 1 : -1; // Alternate lane direction
        const startX = (direction > 0) ? -CAR_MAP_X_BOUND : CAR_MAP_X_BOUND;
        
        mesh.userData = {
            direction: direction,
            speed: CAR_SPEED_MAX * (0.5 + Math.random() * 0.5) // Vary the speed
        };
        
        mesh.position.set(startX + Math.random() * CAR_MAP_X_BOUND * 2 * direction, 0, laneZ);
        mesh.rotation.y = (direction > 0) ? -Math.PI / 2 : Math.PI / 2; // Point in direction of travel (cars move on X axis)

        scene.add(mesh);
        cars.push(mesh);
    }
}

function updateCars() {
    const boundary = CAR_MAP_X_BOUND + 10; // Extra buffer
    
    cars.forEach(car => {
        // Move the car
        car.position.x += car.userData.direction * car.userData.speed;
        
        // Check if the car is out of bounds (off the edge of the map)
        if (car.userData.direction > 0 && car.position.x > boundary) {
            // Car moving right (positive X)
            // Teleport it to the far left, keeping its Z lane
            car.position.x = -boundary; 
        } else if (car.userData.direction < 0 && car.position.x < -boundary) {
            // Car moving left (negative X)
            // Teleport it to the far right, keeping its Z lane
            car.position.x = boundary;
        }
    });
}
// Initialize the cars at startup
initializeCars();

// ====================================================================
// INPUT & INTERACTIVITY (Collision, Movement, Clicking, KEYBOARD)
// ====================================================================

// Raycaster setup for clicking
var raycaster = new THREE.Raycaster();
var mouse = new THREE.Vector2();

function onCanvasClick(event) {
    // Calculate mouse position in normalized device coordinates (-1 to +1)
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // Only intersect objects that are part of the resultMeshes (the buildings)
    var intersects = raycaster.intersectObjects(resultMeshes);

    if (intersects.length > 0) {
        var mesh = intersects[0].object; // Get the closest object
        // Check if the intersected object is one of our buildings
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
var turnSpeed = 0.02; // radians per frame
var playerRadius = 0.35; // collision radius
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
        case 'w':
            move.forward = true;
            break;
        case 's':
            move.back = true;
            break;
        case 'a':
            move.left = true;
            break;
        case 'd':
            move.right = true;
            break;
        case 'q':
            move.turnLeft = true;
            break;
        case 'e':
            move.turnRight = true;
            break;
    }
});

document.addEventListener('keyup', function(event) {
    switch (event.key.toLowerCase()) {
        case 'w':
            move.forward = false;
            break;
        case 's':
            move.back = false;
            break;
        case 'a':
            move.left = false;
            break;
        case 'd':
            move.right = false;
            break;
        case 'q':
            move.turnLeft = false;
            break;
        case 'e':
            move.turnRight = false;
            break;
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
        // Collision sliding attempts (X then Z)
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

    step.y = 0; // Keep y fixed (no flying)

    // Try movement with collision
    if (step.lengthSq() > 0) tryMove(step);

    renderer.render(scene, camera);
}

// Start animation loop
animate();

// Resize handling
window.addEventListener('resize', function() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Load the font and then initialize the search
const fontLoader = new FontLoader();
fontLoader.load('https://cdn.jsdelivr.net/npm/three@0.157.0/examples/fonts/helvetiker_regular.typeface.json', function (loadedFont) {
    font = loadedFont;
    console.log("3D font loaded. Ready for search initialization.");
    initializeFromInput(); 
});

// ====================================================================
// SEARCH ENGINE LOGIC
// ====================================================================

var BACKEND_BASE = 'https://oodles-backend.vercel.app';
var currentQuery = '';
var currentPage = 1;
var MAX_PAGE_SIZE = 50; 

function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function executeSearch(query, page = 1) {
    if (!query) {
        // Note: linkResults element must be in your main HTML structure outside this script block
        const resultsEl = document.getElementById('linkResults');
        if (resultsEl) resultsEl.innerHTML = '<p class="small">Enter a query to search.</p>';
        displaySearchResultsIn3D([]); // Clear buildings
        return;
    }

    currentQuery = query;
    currentPage = page;
    
    const queryInput = document.getElementById('currentQuery');
    if (queryInput) queryInput.value = query;

    const resultsEl = document.getElementById('linkResults');
    if (resultsEl) resultsEl.innerHTML = '<p class="small">Searching web links...</p>';
    
    try {
        var url = BACKEND_BASE + '/metasearch?q=' + encodeURIComponent(query) + '&page=' + page + '&pageSize=' + MAX_PAGE_SIZE;
        var resp = await fetch(url);
        var data = await resp.json();
        renderLinkResults(data.items, data.total);
    } catch (error) {
        console.error('Web search error:', error);
        if (resultsEl) resultsEl.innerHTML = '<p class="small">Error loading web links.</p>';
        displaySearchResultsIn3D([]);
    }
}

function renderLinkResults(items, total) {
    var resultsEl = document.getElementById('linkResults');
    
    if (!items || items.length === 0) {
        if (resultsEl) resultsEl.innerHTML = '<p class="small">No web links found.</p>';
        displaySearchResultsIn3D([]);
        return;
    }

    // --- 3D Integration: Draw the Buildings ---
    displaySearchResultsIn3D(items);
    
    // HTML Rendering (Optional, for debugging or UI feedback)
    if (resultsEl) {
        const maxPages = Math.ceil(total / MAX_PAGE_SIZE);
        resultsEl.innerHTML = `
            <p class="small">Found ${total} links. Showing page ${currentPage} of ${maxPages}. Click a building to visit the link.</p>
            ` + items.map(function(r) {
                return `
                    <div class="result-block">
                        <a href="${r.url}" target="_blank" rel="noopener">${escapeHtml(r.title)}</a>
                        <div class="small">${escapeHtml(r.url)}</div>
                    </div>
                `;
            }).join('');
    }
}

// Simplified initialization for this combined file
function initializeFromInput() {
    const urlParams = new URLSearchParams(window.location.search);
    let query = urlParams.get('q') || '';
    
    const queryInput = document.getElementById('currentQuery');
    if (query) {
        if (queryInput) queryInput.value = query;
        executeSearch(query, 1);
    }
}

// Event listener for new search submission
const queryInput = document.getElementById('currentQuery');
if (queryInput) {
    queryInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault(); 
            var query = this.value.trim();
            // When a new search is executed, force reload with URL parameter 
            window.location.href = window.location.pathname + '?q=' + encodeURIComponent(query);
        }
    });
}
