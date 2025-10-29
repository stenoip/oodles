  // Import necessary components
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

        // Ground plane
        var ground = new THREE.Mesh(
            new THREE.PlaneGeometry(200, 200),
            new THREE.MeshLambertMaterial({ color: 0x3aaf3a })
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

        function createTextLabel(text, x, y, z) {
            if (!font) return;

            // Trim the text to ensure it fits nicely above the building
            const MAX_TITLE_LENGTH = 20;
            const trimmedText = text.length > MAX_TITLE_LENGTH ? text.substring(0, MAX_TITLE_LENGTH) + '...' : text;

            var textMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff }); 
            var textGeometry = new TextGeometry(trimmedText, {
                font: font,
                size: 0.8,
                height: 0.1,
                curveSegments: 4 // Reduced for performance
            });

            // Center the text horizontally
            textGeometry.computeBoundingBox();
            textGeometry.translate(
                -0.5 * (textGeometry.boundingBox.max.x - textGeometry.boundingBox.min.x),
                0,
                0
            );

            var textMesh = new THREE.Mesh(textGeometry, textMaterial);
            textMesh.position.set(x, y + 0.3, z);
            textMesh.rotation.y = Math.PI; // Face the camera
            scene.add(textMesh);
            
            resultLabels.push(textMesh);
        }

        function addBuilding(x, z, w, d, h, color, link, title) {
            // Use a random color based on the result index for visual distinction
            var mat = new THREE.MeshLambertMaterial({ color: color });
            
            var mesh = new new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
            mesh.position.set(x, h / 2, z);

            // Store link data on the mesh for the raycaster
            mesh.userData = { isBuilding: true, link: link, title: title }; 

            scene.add(mesh);

            // Create the 3D text label above the building
            createTextLabel(title, x, h, z);

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
                const w = 4 + Math.random() * 3; // Width (4 to 7)
                const d = 4 + Math.random() * 3; // Depth (4 to 7)
                const h = 5 + Math.random() * 15; // Height (5 to 20)
                
                // Calculate a consistent color based on the index
                const color = new THREE.Color().setHSL(index / MAX_BUILDINGS, 0.7, 0.6).getHex();

                addBuilding(x, z, w, d, h, color, data.url, data.title);
            });

            console.log(`Successfully created ${resultsToDraw.length} 3D buildings.`);
        }

        // ====================================================================
        // INPUT & INTERACTIVITY (Collision, Movement, Clicking)
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

        // Movement and look controls (Kept from original code)
        var move = { forward: false, back: false, left: false, right: false, turnLeft: false, turnRight: false };
        var speed = 0.12;
        var turnSpeed = 0.02; // radians per frame
        var playerRadius = 0.35; // collision radius
        var upVector = new THREE.Vector3(0, 1, 0);

        function bindButton(id, key) {
            var btn = document.getElementById(id);
            if (!btn) return; // Guard for missing buttons
            
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
                // Check collision only with dynamic buildings
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
            // Immediately execute search initialization after font is ready
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
                document.getElementById('linkResults').innerHTML = '<p class="small">Enter a query to search.</p>';
                displaySearchResultsIn3D([]); // Clear buildings
                return;
            }

            currentQuery = query;
            currentPage = page;
            document.getElementById('currentQuery').value = query; // Update the input field

            document.getElementById('linkResults').innerHTML = '<p class="small">Searching web links...</p>';
            try {
                // For simplicity, we only execute 'web' search for 3D results
                var url = BACKEND_BASE + '/metasearch?q=' + encodeURIComponent(query) + '&page=' + page + '&pageSize=' + MAX_PAGE_SIZE;
                var resp = await fetch(url);
                var data = await resp.json();
                renderLinkResults(data.items, data.total);
            } catch (error) {
                console.error('Web search error:', error);
                document.getElementById('linkResults').innerHTML = '<p class="small">Error loading web links.</p>';
                displaySearchResultsIn3D([]);
            }
        }

        function renderLinkResults(items, total) {
            var resultsEl = document.getElementById('linkResults');
            if (!items || items.length === 0) {
                resultsEl.innerHTML = '<p class="small">No web links found.</p>';
                displaySearchResultsIn3D([]);
                return;
            }

            // --- 3D Integration: Draw the Buildings ---
            displaySearchResultsIn3D(items);
            
            // HTML Rendering (Optional, for debugging or UI feedback)
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
        
        // Simplified initialization for this combined file
        function initializeFromInput() {
            // Check for initial query in the URL (if this file is search.html?q=test)
            const urlParams = new URLSearchParams(window.location.search);
            let query = urlParams.get('q') || '';
            
            if (query) {
                document.getElementById('currentQuery').value = query;
                executeSearch(query, 1);
            }
        }

        // Event listener for new search submission
        document.getElementById('currentQuery').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault(); 
                var query = this.value.trim();
                // When a new search is executed, force reload with URL parameter 
                // to maintain state if the user shares or reloads the page.
                window.location.href = window.location.pathname + '?q=' + encodeURIComponent(query);
            }
        });
