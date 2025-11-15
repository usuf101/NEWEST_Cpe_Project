import { Component, Property } from '@wonderlandengine/api';

/**
 * Fruit Spawner Component
 * Spawns fruit objects at regular intervals when activated by controller button press
 */
export class FruitSpawner extends Component {
    static TypeName = 'fruit-spawner';
    
    static Properties = {
        /** Array of fruit prefabs to spawn randomly */
        fruitPrefabs: Property.string(''),  // Comma-separated object names
        /** Spawn interval in seconds */
        spawnInterval: Property.float(3.0),
        /** Spawn position offset from this object */
        spawnOffset: Property.vector3(),
        /** Random spawn area size (X, Y, Z range) */
        randomSpawnArea: Property.vector3(),
        /** Button to activate spawning (e.g., 'squeeze', 'trigger') */
        activationButton: Property.string('trigger'),
        /** Hand to use ('left' or 'right') */
        handedness: Property.enum(['left', 'right'], 'right'),
    };

    start() {
        this.isSpawning = false;
        this.timeSinceLastSpawn = 0;
        this.buttonPressed = false;
        this.spacePressed = false;
        this.lastSpawnTime = 0;
        this.minSpawnInterval = 1.0; // Minimum 1 second between spawns
        
        // TEMPORARY: Keyboard support for browser testing
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !this.spacePressed) {
                this.spacePressed = true;
                this.isSpawning = !this.isSpawning;
                console.log('Spawning toggled (spacebar):', this.isSpawning);
                if (this.isSpawning) {
                    this.spawnFruit();
                    this.timeSinceLastSpawn = 0;
                }
            }
        });
        window.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                this.spacePressed = false;
            }
        });
        
        // Parse fruit prefab names
        this.fruitObjects = [];
        if (this.fruitPrefabs) {
            console.log('Raw fruitPrefabs string:', this.fruitPrefabs);
            const names = this.fruitPrefabs.split(',').map(s => s.trim());
            console.log('Parsed prefab names:', names);
            
            // Get all objects in the scene
            const allObjects = [];
            const processObject = (obj) => {
                allObjects.push(obj);
                for (let i = 0; i < obj.children.length; i++) {
                    processObject(obj.children[i]);
                }
            };
            processObject(this.engine.scene);
            
            console.log('All objects in scene:', allObjects.map(o => ({
                name: o.name,
                type: o.type,
                id: o.objectId
            })));
            
            // Try to find objects by name
            for (let name of names) {
                // Try exact match first
                let found = allObjects.find(obj => obj.name === name);
                
                // If not found, try partial match
                if (!found) {
                    found = allObjects.find(obj => 
                        obj.name && 
                        (obj.name.includes(name) || name.includes(obj.name.split('_')[0]))
                    );
                }
                
                if (found) {
                    this.fruitObjects.push(found);
                    console.log('✓ Found fruit prefab:', name, 'as object:', found);
                } else {
                    console.warn('✗ Fruit prefab not found in scene:', name);
                }
            }
        }
        
        if (this.fruitObjects.length === 0) {
            console.error('No fruit prefabs found! Add comma-separated object names to fruitPrefabs property.');
        }
        
        // Get XR session when available
        this.engine.onXRSessionStart.add(this.onXRSessionStart.bind(this));
        this.engine.onXRSessionEnd.add(this.onXRSessionEnd.bind(this));
        
        console.log('FruitSpawner initialized with', this.fruitObjects.length, 'fruit types');
    }

    onXRSessionStart(session, mode) {
        console.log('XR Session started, mode:', mode);
        this.xrSession = session;
    }

    onXRSessionEnd() {
        console.log('XR Session ended');
        this.xrSession = null;
        this.isSpawning = false;
    }

    update(dt) {
        // Check for button press from XR controller
        if (this.xrSession) {
            this.checkButtonPress();
        }

        // Handle spawning if active
        if (this.isSpawning) {
            this.timeSinceLastSpawn += dt;
            
            // Only spawn if enough time has passed since last spawn
            const currentTime = performance.now() / 1000; // Convert to seconds
            if (currentTime - this.lastSpawnTime >= this.spawnInterval) {
                this.spawnFruit();
                this.lastSpawnTime = currentTime;
                this.timeSinceLastSpawn = 0;
            }
        }
    }

    checkButtonPress() {
        if (!this.xrSession) return;

        const inputSources = this.xrSession.inputSources;
        
        for (let i = 0; i < inputSources.length; i++) {
            const inputSource = inputSources[i];
            
            // Check if this is the correct hand
            if (inputSource.handedness !== this.handedness) continue;
            
            const gamepad = inputSource.gamepad;
            if (!gamepad) continue;

            // Check for button press
            let buttonPressed = false;
            
            // For Meta Quest 2: trigger = index 0, squeeze = index 1
            if (this.activationButton === 'trigger' && gamepad.buttons[0]) {
                buttonPressed = gamepad.buttons[0].pressed;
            } else if (this.activationButton === 'squeeze' && gamepad.buttons[1]) {
                buttonPressed = gamepad.buttons[1].pressed;
            }

            // Toggle spawning on button press (not hold)
            if (buttonPressed && !this.buttonPressed) {
                this.isSpawning = !this.isSpawning;
                console.log('Spawning toggled:', this.isSpawning);
                
                if (this.isSpawning) {
                    // Spawn first fruit immediately
                    this.spawnFruit();
                    this.timeSinceLastSpawn = 0;
                }
            }
            
            this.buttonPressed = buttonPressed;
        }
    }

    spawnFruit() {
        if (!this.fruitObjects || this.fruitObjects.length === 0) {
            console.warn('No fruit prefabs available to spawn');
            return;
        }

        try {
            // Pick a random fruit from the array
            const randomIndex = Math.floor(Math.random() * this.fruitObjects.length);
            const fruitPrefab = this.fruitObjects[randomIndex];

            // Clone the fruit prefab
            const fruit = this.engine.scene.addObject(this.object.parent);
            
            // Get the spawner's position FIRST (which is already in the sky)
            const spawnPos = new Float32Array(3);
            this.object.getPositionWorld(spawnPos);
            
            // Add some randomness for variety (horizontal spread)
            const spread = 2.0; // Spread in meters
            spawnPos[0] += (Math.random() - 0.5) * spread;
            spawnPos[2] += (Math.random() - 0.5) * spread;
            // Keep the Y position from the spawner (already at correct height)
            
            // Set the position BEFORE copying components
            fruit.setPositionWorld(spawnPos);
            
            // Random rotation for variety
            const rotation = new Float32Array(4);
            const randomAngle = Math.random() * Math.PI * 2;
            rotation[0] = 0;
            rotation[1] = Math.sin(randomAngle / 2);
            rotation[2] = 0;
            rotation[3] = Math.cos(randomAngle / 2);
            fruit.setRotationWorld(rotation);
            
            // Copy components and children from prefab (this should preserve our position)
            this.cloneObject(fruitPrefab, fruit);
            
            // Re-apply position after cloning to ensure it sticks
            fruit.setPositionWorld(spawnPos);
            console.log('Spawning at position:', spawnPos);
            
            // Activate physics LAST
            const physxComp = fruit.getComponent('physx');
            if (physxComp) {
                try {
                    physxComp.active = true;
                } catch (e) {
                    console.warn('Error activating physics:', e);
                }
            }
            
            // Log only in development
            if (process.env.NODE_ENV === 'development') {
                console.log('Fruit spawned at:', spawnPos);
            }
        } catch (error) {
            console.error('Error spawning fruit:', error);
        }
    }

    cloneObject(source, target) {
        // Copy mesh component
        const meshComp = source.getComponent('mesh');
        if (meshComp) {
            const newMesh = target.addComponent('mesh');
            newMesh.mesh = meshComp.mesh;
            newMesh.material = meshComp.material;
        }
        
        // Copy physics component (but keep it inactive initially)
        const physxComp = source.getComponent('physx');
        if (physxComp) {
            const newPhysx = target.addComponent('physx');
            newPhysx.shape = physxComp.shape;
            newPhysx.mass = physxComp.mass;
            newPhysx.kinematic = physxComp.kinematic;
            newPhysx.active = false; // Start inactive
        }
        
        // Copy collision component if present
        const collisionComp = source.getComponent('collision');
        if (collisionComp) {
            const newCollision = target.addComponent('collision');
            newCollision.collider = collisionComp.collider;
            newCollision.group = collisionComp.group;
        }
        
        // Recursively clone children
        for (let child of source.children) {
            const newChild = this.engine.scene.addObject(target);
            this.cloneObject(child, newChild);
        }
    }

    onDestroy() {
        this.isSpawning = false;
    }
}