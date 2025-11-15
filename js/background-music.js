import { Component, Property } from '@wonderlandengine/api';

/**
 * Background Music Component
 * Plays background music when activated by the same button as fruit spawner
 */
export class BackgroundMusic extends Component {
    static TypeName = 'background-music';
    
    static Properties = {
        /** Audio file path (relative to project root or full URL) */
        audioFile: Property.string('audio/background-music.mp3'),
        /** Volume level (0.0 to 1.0) */
        volume: Property.float(0.5),
        /** Loop the music */
        loop: Property.bool(true),
        /** Button to toggle music (e.g., 'squeeze', 'trigger') */
        activationButton: Property.string('trigger'),
        /** Hand to use ('left' or 'right') */
        handedness: Property.enum(['left', 'right'], 'right'),
    };

    start() {
        this.isPlaying = false;
        this.buttonPressed = false;
        this.spacePressed = false;
        this.audioContext = null;
        this.audioBuffer = null;
        this.sourceNode = null;
        this.gainNode = null;
        
        // Initialize Web Audio API
        this.initAudio();
        
        // TEMPORARY: Keyboard support for browser testing
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !this.spacePressed) {
                this.spacePressed = true;
                this.toggleMusic();
            }
        });
        
        window.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                this.spacePressed = false;
            }
        });
        
        // Get XR session when available
        this.engine.onXRSessionStart.add(this.onXRSessionStart.bind(this));
        this.engine.onXRSessionEnd.add(this.onXRSessionEnd.bind(this));
        
        console.log('BackgroundMusic component initialized');
    }

    async initAudio() {
        try {
            // Create audio context (use webkitAudioContext for Safari compatibility)
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Create gain node for volume control
            this.gainNode = this.audioContext.createGain();
            this.gainNode.gain.value = this.volume;
            this.gainNode.connect(this.audioContext.destination);
            
            // Load audio file
            await this.loadAudioFile(this.audioFile);
            
            console.log('Audio initialized successfully');
        } catch (error) {
            console.error('Error initializing audio:', error);
        }
    }

    async loadAudioFile(url) {
        try {
            console.log('Loading audio file:', url);
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`Failed to load audio: ${response.status} ${response.statusText}`);
            }
            
            const arrayBuffer = await response.arrayBuffer();
            this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            console.log('Audio file loaded and decoded successfully');
        } catch (error) {
            console.error('Error loading audio file:', error);
            console.warn('Make sure the audio file exists at:', url);
        }
    }

    toggleMusic() {
        if (this.isPlaying) {
            this.stopMusic();
        } else {
            this.playMusic();
        }
    }

    playMusic() {
        if (!this.audioContext || !this.audioBuffer) {
            console.warn('Audio not ready yet');
            return;
        }
        
        // Resume audio context if suspended (required by browser autoplay policies)
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        // Stop any currently playing music
        if (this.sourceNode) {
            this.sourceNode.stop();
        }
        
        // Create a new buffer source
        this.sourceNode = this.audioContext.createBufferSource();
        this.sourceNode.buffer = this.audioBuffer;
        this.sourceNode.loop = this.loop;
        this.sourceNode.connect(this.gainNode);
        
        // Start playing
        this.sourceNode.start(0);
        this.isPlaying = true;
        
        console.log('Background music started');
    }

    stopMusic() {
        if (this.sourceNode) {
            try {
                this.sourceNode.stop();
            } catch (e) {
                // Already stopped
            }
            this.sourceNode = null;
        }
        
        this.isPlaying = false;
        console.log('Background music stopped');
    }

    onXRSessionStart(session, mode) {
        console.log('XR Session started, mode:', mode);
        this.xrSession = session;
    }

    onXRSessionEnd() {
        console.log('XR Session ended');
        this.xrSession = null;
        this.stopMusic();
    }

    update(dt) {
        // Check for button press from XR controller
        if (this.xrSession) {
            this.checkButtonPress();
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

            // Toggle music on button press (not hold)
            if (buttonPressed && !this.buttonPressed) {
                this.toggleMusic();
            }
            
            this.buttonPressed = buttonPressed;
        }
    }

    setVolume(newVolume) {
        this.volume = Math.max(0, Math.min(1, newVolume));
        if (this.gainNode) {
            this.gainNode.gain.value = this.volume;
        }
    }

    onDestroy() {
        this.stopMusic();
        if (this.audioContext) {
            this.audioContext.close();
        }
    }
}