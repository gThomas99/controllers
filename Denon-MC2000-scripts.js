/**
 * Denon MC2000 Mixxx Controller Mapping
 * Author: Graham Thomas
 * Version: 0.1.0-alpha (Initial Implementation)
 * Date: November 2025
 *
 * IMPLEMENTATION STATUS:
 * This is an initial implementation with most features coded but untested.
 * Many functions may be buggy and require refinement.
 *
 * IMPLEMENTED FEATURES:
 * - Transport controls (play, cue, sync, keylock) with Components-based architecture
 * - Hotcue buttons (4 per deck) with shift-to-delete functionality
 * - Loop controls (in/out/reloop/double/halve)
 * - Mixer controls (volume, 3-band EQ, track gain, crossfader)
 * - Master controls (master volume, headphone volume/mix)
 * - PFL/Monitor cue buttons (channel-specific LED codes)
 * - FX units (2 units × 3 effects with toggle, meta pots, wet/dry encoders)
 * - Library navigation (focus forward/backward, vertical scroll encoder)
 * - Load track to deck buttons
 * - Pitch bend/jog wheel scaffolding
 * - LED feedback system using custom MC2000.setLed() protocol
 * - Shift layer support for transport and hotcue buttons
 * - Debug logging system (toggle via MC2000.debugMode flag)
 *
 * KNOWN ISSUES:
 * - MIDI note/CC codes need verification against hardware
 * - LED feedback may not work correctly for all controls
 * - Jog wheel/scratch functionality incomplete
 * - Some encoder sensitivities may need tuning
 * - Shift layer behaviors need testing
 *
 * REFERENCES:
 * - Denon MC3000/MC4000/MC6000MK2 scripts in Mixxx source
 * - Mixxx Components JS library (midi-components-0.0.js)
 * - Custom LED protocol specific to MC2000 hardware
 *
 * USAGE:
 * 1. Ensure MIDI codes in Denon-MC2000.midi.xml match your hardware
 * 2. Enable debug mode (MC2000.debugMode = true) for troubleshooting
 * 3. Reload mapping via Preferences > Controllers after changes
 * 4. Check console output for "[MC2000-DEBUG]" messages
 */

var MC2000 = {};

// MIDI Reception commands (from spec)
MC2000.leds = {
	shiftlock: 		2,
	vinylmode: 		6,
	keylock: 		8,
	sync: 			9,

	cue1: 			17,
	cue2: 			19,
	cue3: 			21,
	cue4: 			23,

	samp1_l: 		25,
	samp2_l: 		27,
	samp3_l: 		29,
	samp4_l: 		32,

	samples_l: 		35,
	samp1_r: 		65,
	samp2_r: 		67,
	samp3_r: 		69,

	samp4_r: 		71,
	samples_r: 		73,
	cue: 			38,
	play: 			39, // was wrong in the spec sheet as decimal value

	loopin: 		0x24, 
	loopout: 		0x40, 
	autoloop: 		0x2b,

	fx1_1: 			0x5c, 
	fx1_2: 			0x5d, 
	fx1_3: 			0x5e,
	
    fx2_1: 			0x60, 
	fx2_2: 			0x61,
	fx2_3: 			0x62,
    // "ALL SLIDER/VOLUME/FADER REQUEST": 57,
	monitorcue_l: 	69,
	monitorcue_r: 	81,
	
	// Sampler LEDs (Bank 1 - left deck)
	sampler1: 		0x19,
	sampler2: 		0x1b,
	sampler3: 		0x1d,
	sampler4: 		0x20,
	// Sampler LEDs (Bank 2 - right deck)
	sampler5: 		0x41,
	sampler6: 		0x43,
	sampler7: 		0x45,
	sampler8: 		0x47,
	// Sample mode indicator
	samplemode: 	0x1A
};

// ------------------------------------------------------------
// LED State & Manager (Incremental Skeleton Refactor Stage 1)
// ------------------------------------------------------------
// Purpose: Provide a unified, cache-aware API for LED control while
// leaving existing legacy helpers (setLed/setLed2/allLed2Default) intact.
// Subsequent stages can migrate individual calls to LedManager.set()/reflect().
// ------------------------------------------------------------

MC2000.LED_STATE = { OFF: 0x4B, ON: 0x4A, BLINK: 0x4C };

MC2000.LedManager = (function() {
    var cache = {}; // key: deck|code -> status byte

    // Build a table mapping LED symbolic names to their code and deck affinity.
    var LED_MAP = {};
    Object.keys(MC2000.leds).forEach(function(name) {
        var code = MC2000.leds[name];
        var decks;
        // Heuristics for deck-specific LEDs (sampler banks, monitor cues, suffixed keys)
        if (/(_l|monitorcue_l)$/i.test(name)) {
            decks = [1];
        } else if (/(_r|monitorcue_r)$/i.test(name)) {
            decks = [2];
        } else if (/^sampler[1-4]$/.test(name)) {
            decks = [1];
        } else if (/^sampler[5-8]$/.test(name)) {
            decks = [2];
        } else {
            // Shared indicator across both decks (e.g. sync, keylock, vinylmode)
            decks = [1, 2];
        }
        LED_MAP[name] = { code: code, decks: decks };
    });

    function normalize(status) {
        if (status === 0 || status === false || status === 'off') return MC2000.LED_STATE.OFF;
        if (status === 2 || status === 'blink') return MC2000.LED_STATE.BLINK;
        return MC2000.LED_STATE.ON; // default for truthy / 1 / true / 'on'
    }
    function key(deck, code) { return deck + '|' + code; }
    function send(deck, code, statusByte) {
        var k = key(deck, code);
        if (cache[k] === statusByte) return; // suppress redundant MIDI traffic
        cache[k] = statusByte;
        midi.sendShortMsg(0xB0 + (deck - 1), statusByte, code);
    }

    return {
        set: function(name, status, opts) {
            var def = LED_MAP[name];
            if (!def) return;
            var decks = (opts && opts.deck) ? [opts.deck] : def.decks;
            var statusByte = normalize(status);
            decks.forEach(function(d) { send(d, def.code, statusByte); });
        },
        
        /**
         * Set multiple LEDs at once using a name->status map.
         * More efficient than individual set() calls when updating many LEDs.
         * 
         * Available LED names (from MC2000.leds):
         *   Transport: 'play', 'cue', 'sync', 'keylock'
         *   Hotcues: 'cue1', 'cue2', 'cue3', 'cue4'
         *   Loops: 'loopin', 'loopout', 'autoloop'
         *   FX: 'fx1_1', 'fx1_2', 'fx1_3', 'fx2_1', 'fx2_2', 'fx2_3'
         *   Samplers: 'sampler1' through 'sampler8', 'samp1_l' through 'samp4_r', 'samples_l', 'samples_r'
         *   Modes: 'vinylmode', 'shiftlock', 'samplemode'
         *   Monitor: 'monitorcue_l', 'monitorcue_r'
         * 
         * Status values: 'on', 'off', 'blink', or numeric 0/1/2, or boolean true/false
         * 
         * @param {Object} map - Object mapping LED names to status values
         * @example
         *   MC2000.LedManager.bulk({play: 'on', cue: 'off', sync: 'blink'});
         */
        bulk: function(map) {
            var self = this;
            Object.keys(map).forEach(function(n) { self.set(n, map[n]); });
        },
        
        /**
         * Reflect a Mixxx engine control value to an LED (boolean on/off).
         * Converts truthy/falsy values to LED on/off states. This is the primary
         * method for output() handlers in Components that need to sync LED state
         * with Mixxx engine controls.
         * 
         * Typically used in engine.makeConnection() callbacks to automatically
         * update LEDs when Mixxx control values change (e.g., play_indicator,
         * cue_indicator, sync_enabled, pfl, etc.).
         * 
         * @param {string} name - LED name from MC2000.leds
         * @param {*} value - Truthy (LED on) or falsy (LED off) value from Mixxx engine
         * @param {Object} [opts] - Optional {deck: 1|2} to target specific deck
         * @example
         *   // In a component output handler:
         *   this.output = function(value) {
         *       MC2000.LedManager.reflect("play", value, {deck: this.deckNumber});
         *   };
         *   this.connect = function() {
         *       engine.makeConnection(this.group, "play_indicator", this.output.bind(this));
         *   };
         */
        reflect: function(name, value, opts) {
            this.set(name, value ? 'on' : 'off', opts);
        },
        blink: function(name, period, cycles, opts) {
            period = period || 500;
            cycles = cycles || 6; // total state flips
            var on = true;
            var fired = 0;
            var self = this;
            var timerId = engine.beginTimer(period, function() {
                self.set(name, on ? 'on' : 'off', opts);
                on = !on;
                fired++;
                if (fired >= cycles) {
                    engine.stopTimer(timerId);
                }
            });
        },
        resetDefaults: function() {
            // Turn all LEDs OFF then enable vinylmode (matching legacy default intent)
            var offMap = {};
            Object.keys(LED_MAP).forEach(function(n) { offMap[n] = 'off'; });
            this.bulk(offMap);
            this.set('vinylmode', 'on');
        },
        raw: function(deck, code, status) { // bridge for legacy helpers
            send(deck, code, normalize(status));
        },
        setRaw: function(name, statusByte, opts) {
            // Direct status byte control (for PFL/monitorcue alternate protocol)
            var def = LED_MAP[name];
            if (!def) return;
            var decks = (opts && opts.deck) ? [opts.deck] : def.decks;
            decks.forEach(function(d) { send(d, def.code, statusByte); });
        },
        reflectAlt: function(name, value, opts) {
            // Alternate protocol for PFL buttons (0x50=ON, 0x51=OFF)
            this.setRaw(name, value ? 0x50 : 0x51, opts);
        },
        _dumpCache: function() { return JSON.parse(JSON.stringify(cache)); },
        _LED_MAP: LED_MAP
    };
})();




/**
 * Blink the shift lock LED for the specified duration using LED Manager API.
 * Used for transient feedback (e.g. indicating a mode toggle).
 * @param {number} [durationMs=2000] How long to blink in milliseconds.
 */
MC2000.blinkShiftLock = function(durationMs) {
    durationMs = (typeof durationMs === 'number' && durationMs > 0) ? durationMs : 2000;
    if (typeof engine === 'undefined' || !engine.beginTimer) {
        if (MC2000.debugMode) MC2000.debugLog("blinkShiftLock: timer API missing, cannot blink");
        return;
    }
    
    // Calculate cycles: duration / interval / 2 (on+off = 1 blink cycle)
    var blinkInterval = 500;
    var cycles = Math.floor(durationMs / blinkInterval);
    
    // Use LedManager.blink for clean implementation
    MC2000.LedManager.blink("shiftlock", blinkInterval, cycles);
    
    if (MC2000.debugMode) {
        MC2000.debugLog("blinkShiftLock: blinking for " + durationMs + "ms (" + (cycles/2) + " cycles)");
    }
};

//////////////////////////////
// Tunable constants        //
//////////////////////////////
// JogWheel Scratch Parameters (adapted from JogWheelScratch.js)
// TICKS_PER_REV: Higher = less sensitive scratching
MC2000.jogResolution   = 96;         // ticks per revolution
// Heavier vinyl with more damping to reduce drift
MC2000.jogRpm          = 33 + 1/3;   // vinyl RPM
MC2000.jogScratchAlpha = 1.0/16;     // bigger inertia (less easy to keep spinning)
MC2000.jogScratchBeta  = (1.0/16)/64; // more damping (stops creeping)
// Velocity scaling: MAX_SCALING=1 for no boost, >1 for speed ramp
MC2000.jogMaxScaling   = 1.25;       // slight boost at quick spins
// Fine scrubbing when paused: smaller = finer control
MC2000.jogScrubScaling = 0.0001;     // extremely fine scrubbing
// Pitch bend scaling for CDJ mode (outer wheel when not scratching)
MC2000.jogPitchScale   = 1.0/4;      // scale for non-scratch jog (pitch bend)
// MIDI center value for relative encoder
MC2000.jogCenter       = 0x40;       // relative center value
MC2000.numHotcues      = 8;

//////////////////////////////
// Internal state           //
//////////////////////////////
// Shift state: true if shift is currently held (button down)
MC2000.shiftHeld = false;
// Shift lock: true if shift lock is enabled (sticky shift)
MC2000.shiftLock = false;
MC2000.scratchEnabled = {"[Channel1]": false, "[Channel2]": false};
MC2000.sampleMode = {"[Channel1]": false, "[Channel2]": false};
MC2000.vinylMode = {"[Channel1]": true, "[Channel2]": true}; // Track vinyl/CDJ mode state
MC2000.deck = {
    "[Channel1]": {scratchMode: false},
    "[Channel2]": {scratchMode: false}
};
// JogWheel state tracking (index 0 unused, 1=deck1, 2=deck2)
MC2000.jogScratchActive = [false, false, false];
MC2000.jogReleaseTimer  = [null, null, null];
MC2000.jogLastTickTime  = [0, 0, 0];
MC2000.jogTickCount     = [0, 0, 0];

//////////////////////////////
// Utility helpers          //
//////////////////////////////
// Check if MIDI button value indicates "pressed" state
// NOTE: MC2000 may use 0x7F or 0x40 for button press - verify with MIDI capture
MC2000.isButtonOn = function(value) {
    return value === 0x7F || value === 0x40;
};

//////////////////////////////
// Debug logging            //
//////////////////////////////
// Set to true for development debugging, false for production
MC2000.debugMode = true;

MC2000.log = function(msg) { print("[MC2000] " + msg); };

MC2000.debugLog = function(msg) {
    if (MC2000.debugMode) {
        print("[MC2000-DEBUG] " + msg);
    }
};



//////////////////////////////
// Helper: Set mixer controls to safe default values
//////////////////////////////
MC2000.setDefaultMixerLevels = function() {
    if (MC2000.debugMode) MC2000.debugLog("Setting default mixer levels...");
    
    // For each deck
    ["[Channel1]", "[Channel2]"].forEach(function(group) {
        // Set volume to 50% (0.5) - safer default
        engine.setValue(group, "volume", 0.5);
        
        // Set pregain/track gain to unity (1.0)
        engine.setValue(group, "pregain", 1.0);
        
        // Set EQ to center/neutral (1.0 for Mixxx EQ)
        var eqGroup = "[EqualizerRack1_" + group + "_Effect1]";
        engine.setValue(eqGroup, "parameter1", 1.0); // Low
        engine.setValue(eqGroup, "parameter2", 1.0); // Mid
        engine.setValue(eqGroup, "parameter3", 1.0); // High
        
        // Set pitch/rate to center (0.0)
        engine.setValue(group, "rate", 0.0);
        
        // Set pitch range to 8% (common default)
        engine.setValue(group, "rateRange", 0.08);
    });
    
    // Set master volume to 50% (0.5) - safer default
    engine.setValue("[Master]", "volume", 0.5);
    
    // Set headphone mix to 50/50 (0.5)
    engine.setValue("[Master]", "headMix", 0.5);
    
    // Set headphone volume to 25% (0.25) - safer default
    engine.setValue("[Master]", "headVolume", 0.25);
    
    // Set FX units wet/dry to dry (0.0)
    engine.setValue("[EffectRack1_EffectUnit1]", "mix", 0.0);
    engine.setValue("[EffectRack1_EffectUnit2]", "mix", 0.0);
    
    if (MC2000.debugMode) MC2000.debugLog("Default mixer levels set");
};

//////////////////////////////
// Initialization           //
//////////////////////////////
MC2000.init = function(id) {
    MC2000.id = id;
    MC2000.log("Init controller " + id);
    
    // Check if required libraries are loaded - abort if missing
    var missingLibraries = [];
    if (typeof _ === "undefined") {
        missingLibraries.push("lodash");
    }
    if (typeof components === "undefined") {
        missingLibraries.push("components");
    }
    
    if (missingLibraries.length > 0) {
        MC2000.log("FATAL ERROR: Missing required libraries: " + missingLibraries.join(", "));
        // Blink vinylmode LED 5 times to indicate error, then turn off
        MC2000.LedManager.blink('vinylmode', 500, 10); // 10 flips = 5 blinks
        
        // Turn off vinylmode LED after blinking completes (5 seconds)
        engine.beginTimer(5100, function() {
            MC2000.LedManager.set('vinylmode', 'off');
        }, true);
     
        return; // Exit init - controller will not function
    }
    
    // Brief LED flash to confirm init started - turn all LEDs on
    var allLedsMap = {};
    Object.keys(MC2000.leds).forEach(function(name) {
        allLedsMap[name] = 'on';
    });

    MC2000.LedManager.bulk(allLedsMap);
     
    
    // Build Components-based structure with LED connections
    MC2000.buildComponents();

    // Build master controls
    MC2000.buildMasterControls();

    // Build FX units
    MC2000.buildFxUnits();

    // Build library controls
    MC2000.buildLibraryControls();

    // Build sampler decks
    MC2000.buildSamplerDecks();


    // Set default mixer levels (safe startup values)
    MC2000.setDefaultMixerLevels();
    
    // After 1 second delay, reset all LEDs to defaults and enable PFL on deck 1
   
    engine.beginTimer(1000, function() {
        MC2000.LedManager.resetDefaults();
        
        // Enable PFL/headphone cue on deck 1 after LED reset
        engine.setValue("[Channel1]", "pfl", 1);
        
        MC2000.log("Controller initialized successfully");
    }, true); // one-shot timer
};

MC2000.shutdown = function() {
    MC2000.log("Shutdown controller");
    // Turn off all LEDs
    MC2000.LedManager.resetDefaults();
};
//////////////////////////////
// Shift button handler: push-to-hold logic

MC2000.toggleShift = function(_channel, _control, value) {
    MC2000.shiftHeld = MC2000.isButtonOn(value);
    MC2000.updateShiftState();
};

// Update effective shift state and apply to all decks, and update shift lock LED
MC2000.updateShiftState = function() {
    var effectiveShift = MC2000.shiftHeld || MC2000.shiftLock;
    if (MC2000.decks) {
        Object.keys(MC2000.decks).forEach(function(g){
            var d = MC2000.decks[g];
            if (!d) return;
            if (d.applyShiftState) d.applyShiftState(effectiveShift);
        });
    }
    // Update shift lock LED: ON if locked, OFF if not
    MC2000.LedManager.reflect("shiftlock", MC2000.shiftLock);
};

// Helper: get current effective shift state (held or locked)
MC2000.isShiftActive = function() {
    return MC2000.shiftHeld || MC2000.shiftLock;
};
//////////////////////////////
// Master Controls          //
//////////////////////////////
MC2000.buildMasterControls = function() {
    // Main output volume
    MC2000.masterVolumePot = new components.Pot({
        group: "[Master]",
        inKey: "gain"
    });
    
    // Crossfader
    MC2000.crossfaderPot = new components.Pot({
        group: "[Master]",
        inKey: "crossfader"
    });
    
    // Headphone volume
    MC2000.headphoneVolumePot = new components.Pot({
        group: "[Master]",
        inKey: "headVolume"
    });
    
    // Headphone mix (master/PFL balance)
    MC2000.headphoneMixPot = new components.Pot({
        group: "[Master]",
        inKey: "headMix"
    });
};

//////////////////////////////
// FX Units                 //
//////////////////////////////
MC2000.FxUnit = function(unitNumber) {
    this.group = "[EffectRack1_EffectUnit" + unitNumber + "]";
    this.unitNumber = unitNumber;
    this.effects = [];
    var self = this;
    
    // Build 3 effects per unit using array
    for (var i = 1; i <= 3; i++) {
        var effectGroup = "[EffectRack1_EffectUnit" + unitNumber + "_Effect" + i + "]";
        var ledName = "fx" + unitNumber + "_" + i;
        
        this.effects[i] = {
            toggle: new components.Button({
                group: effectGroup,
                inKey: "enabled",
                type: components.Button.prototype.types.toggle,
            }),
            meta: new components.Pot({
                group: effectGroup,
                inKey: "meta"
            })
        };
        
        // Add LED output handler and connection for each toggle button
        (function(effectIndex, ledKey) {
            self.effects[effectIndex].toggle.output = function(value) {
                if (MC2000.leds[ledKey] !== undefined) {
                    // FX buttons on both units use deck 1 (status 0xB0)
                    MC2000.LedManager.reflect(ledKey, value, {deck: 1});
                }
                if (MC2000.debugMode) {
                    MC2000.debugLog("FX" + self.unitNumber + " Effect" + effectIndex + " LED: " + value);
                }
            };
            
            self.effects[effectIndex].toggle.connect = function() {
                engine.makeConnection(this.group, "enabled", this.output.bind(this));
            };
        })(i, ledName);
    }
    
    // Wet/Dry encoder (relative encoder for mix control)
    this.wetDryEncoder = new components.Encoder({
        group: this.group,
        inKey: "mix"
    });
    // Custom input handler for relative encoder acting as pseudo pot
    // reverse direction: CC 1 = decrease, CC 127 = increase
    this.wetDryEncoder.input = function(channel, control, value, status, group) {
        if (value === 1) {
            // Counterclockwise: decrease wet/dry mix
            this.inSetParameter(this.inGetParameter() + 0.05);
        } else if (value === 127) {
            // Clockwise: increase wet/dry mix
            this.inSetParameter(this.inGetParameter() - 0.05);
        }
    };
};

MC2000.buildFxUnits = function() {
    MC2000.fxUnits = {
        1: new MC2000.FxUnit(1),
        2: new MC2000.FxUnit(2)
    };
    
    // Connect all FX toggle button LEDs
    for (var unitNum = 1; unitNum <= 2; unitNum++) {
        for (var effectNum = 1; effectNum <= 3; effectNum++) {
            var toggle = MC2000.fxUnits[unitNum].effects[effectNum].toggle;
            if (toggle && toggle.connect) {
                toggle.connect();
            }
        }
    }
    
    if (MC2000.debugMode) MC2000.debugLog("FX units built with LED connections");
};

//////////////////////////////
// Library Controls         //
//////////////////////////////
MC2000.buildLibraryControls = function() {
    // Note: MoveFocusForward/Backward use direct <Button/> mapping in XML
    // Only need encoder component for vertical scrolling
    
    // Vertical scroll encoder (browse up/down in library)
    MC2000.scrollVerticalEncoder = new components.Encoder({
        group: "[Library]",
        inKey: "MoveVertical"
    });
    
    // Custom input for relative encoder
    MC2000.scrollVerticalEncoder.input = function(channel, control, value, status, group) {
        if (value === 1) {
            // Counterclockwise: move up
            engine.setValue("[Library]", "MoveUp", 1);
        } else if (value === 127) {
            // Clockwise: move down
            engine.setValue("[Library]", "MoveDown", 1);
        }
    };
    
    // Library focus forward button component
    MC2000.libraryFocusForwardComp = new components.Button({
        group: "[Library]",
        type: components.Button.prototype.types.push,
    });
    MC2000.libraryFocusForwardComp.input = function(channel, control, value, status, group) {
        if (!MC2000.isButtonOn(value)) return;
        engine.setValue("[Library]", "MoveFocusForward", 1);
        if (MC2000.debugMode) MC2000.debugLog("Library: MoveFocusForward triggered");
    };
    
    // Library focus backward button component
    MC2000.libraryFocusBackwardComp = new components.Button({
        group: "[Library]",
        type: components.Button.prototype.types.push,
    });
    MC2000.libraryFocusBackwardComp.input = function(channel, control, value, status, group) {
        if (!MC2000.isButtonOn(value)) return;
        engine.setValue("[Library]", "MoveFocusBackward", 1);
        if (MC2000.debugMode) MC2000.debugLog("Library: MoveFocusBackward triggered");
    };
    
    // Library GoToItem button component
    MC2000.libraryGoToItemComp = new components.Button({
        group: "[Library]",
        type: components.Button.prototype.types.push,
    });
    MC2000.libraryGoToItemComp.input = function(channel, control, value, status, group) {
        if (!MC2000.isButtonOn(value)) return;
        engine.setValue("[Library]", "GoToItem", 1);
        if (MC2000.debugMode) MC2000.debugLog("Library: GoToItem triggered");
    };
};

//////////////////////////////
// Sampler Decks            //
//////////////////////////////
MC2000.SamplerDeck = function(samplerNumber) {
    this.group = "[Sampler" + samplerNumber + "]";
    this.samplerNumber = samplerNumber;
    this.deckNumber = samplerNumber <= 4 ? 1 : 2; // Deck 1 for samplers 1-4, Deck 2 for 5-8
    var self = this;
    
    // Play button - use push type for proper sampler behavior
    this.playButton = new components.Button({
        group: this.group,
        type: components.Button.prototype.types.push,
    });
    
    // Custom input: play from start if stopped, stop if playing
    this.playButton.input = function(channel, control, value, status, group) {
        if (!MC2000.isButtonOn(value)) return; // Only act on press
        
        var isPlaying = engine.getValue(group, "play");
        if (isPlaying) {
            // If playing, stop it
            engine.setValue(group, "play", 0);
        } else {
            // If stopped, play from cue point (start)
            engine.setValue(group, "cue_gotoandplay", 1);
        }
    };
    
    this.playButton.output = function(value) {
        var ledName = "sampler" + self.samplerNumber;
        if (MC2000.leds[ledName] !== undefined) {
            MC2000.LedManager.reflect(ledName, value, {deck: self.deckNumber});
        }
        if (MC2000.debugMode) MC2000.debugLog("Sampler" + self.samplerNumber + " play LED: " + value);
    };
    this.playButton.connect = function() {
        engine.makeConnection(this.group, "play", this.output.bind(this));
    };
};

MC2000.buildSamplerDecks = function() {
    MC2000.samplers = {};
    
    // Build 8 samplers (2 banks of 4)
    for (var i = 1; i <= 8; i++) {
        MC2000.samplers[i] = new MC2000.SamplerDeck(i);
        if (MC2000.samplers[i].playButton && MC2000.samplers[i].playButton.connect) {
            MC2000.samplers[i].playButton.connect();
        }
    }
    
    if (MC2000.debugMode) MC2000.debugLog("Sampler decks built (8 samplers)");
};

//////////////////////////////
// Components wiring   Deck Controls      //
//////////////////////////////
MC2000.Deck = function(group) {
    this.group = group;
    var self = this;
    
    // Get deck number (1 or 2)
    this.deckNumber = (group === "[Channel1]") ? 1 : 2;

    // Play: toggle play/pause on button press only
    this.play = new components.Button({
        group: group,
        inKey: "play",
        type: components.Button.prototype.types.toggle,
    });
    this.play.output = function(value) {
        MC2000.LedManager.reflect("play", value, {deck: self.deckNumber});
    };
    this.play.connect = function() {
        engine.makeConnection(this.group, "play_indicator", this.output.bind(this));
    };

    // Cue: cue type button; Shift: gotoandplay
    this.cue = new components.Button({
        group: group,
        inKey: "cue_default",
        type: components.Button.prototype.types.cue,
    });
    this.cue.output = function(value) {
        MC2000.LedManager.reflect("cue", value, {deck: self.deckNumber});
    };
    this.cue.connect = function() {
        engine.makeConnection(this.group, "cue_indicator", this.output.bind(this));
    };
    
    // Store the original input method from the cue type
    this.cue.originalInput = this.cue.input;
    
    this.cue.unshift = function() {
        // Restore original cue behavior
        this.inKey = "cue_default";
        this.input = this.originalInput;
    };
    this.cue.shift = function() {
        // Override with gotoandplay behavior
        this.input = function(_ch,_ctrl,value,_status,group){
            if (!MC2000.isButtonOn(value)) return;
            engine.setValue(group, "cue_gotoandplay", 1);
        };
    };

    // Sync: unshift one-shot beatsync (or sync lock if held), shift toggles sync lock
    this.sync = new components.Button({
        group: group,
    });
    this.sync.longPressTimer = 0;
    this.sync.longPressThreshold = 1000; // 1 second in milliseconds
    this.sync.input = function(channel, control, value, status, group) {
        if (MC2000.isButtonOn(value)) {
            // Button pressed
            if (MC2000.isShiftActive()) {
                // Shift: toggle sync lock immediately
                script.toggleControl(group, "sync_enabled");
            } else {
                // Check if sync lock is already enabled
                var syncEnabled = engine.getValue(group, "sync_enabled");
                if (syncEnabled) {
                    // Sync lock is on: turn it off immediately
                    engine.setValue(group, "sync_enabled", 0);
                } else {
                    // Sync lock is off: start timer for long press detection
                    var self = this;
                    this.longPressTimer = engine.beginTimer(this.longPressThreshold, function() {
                        // Long press: enable sync lock
                        engine.setValue(group, "sync_enabled", 1);
                        self.longPressTimer = 0;
                    }, true); // one-shot timer
                }
            }
        } else {
            // Button released
            if (this.longPressTimer !== 0) {
                // Short press: one-shot beatsync
                engine.stopTimer(this.longPressTimer);
                this.longPressTimer = 0;
                engine.setValue(group, "beatsync", 1);
            }
        }
    };
    this.sync.output = function(value) {
        MC2000.LedManager.reflect("sync", value, {deck: self.deckNumber});
        //MC2000.setLed(self.deckNumber, MC2000.leds.sync, value ? 1 : 0);
    };
    this.sync.connect = function() {
        engine.makeConnection(this.group, "sync_enabled", this.output.bind(this));
    };

    // Keylock: toggle keylock (master tempo)
    this.keylock = new components.Button({
        group: group,
        type: components.Button.prototype.types.push,
    });
    this.keylock.normalInput = function(channel, control, value, status, group) {
        if (!MC2000.isButtonOn(value)) return;
        // Normal: toggle keylock on/off
        engine.setValue(group, "keylock", !engine.getValue(group, "keylock"));
    };
    this.keylock.shiftedInput = function(channel, control, value, status, group) {
        if (!MC2000.isButtonOn(value)) return;
        // Shift: cycle pitch range (6% -> 10% -> 24% -> 50% -> 6%)
        var ranges = [0.06, 0.10, 0.24, 0.50];
        var currentRange = engine.getValue(group, "rateRange");
        var currentIndex = ranges.indexOf(currentRange);
        var nextIndex = (currentIndex + 1) % ranges.length;
        engine.setValue(group, "rateRange", ranges[nextIndex]);
        if (MC2000.debugMode) {
            MC2000.debugLog(group + " pitch range: " + (ranges[nextIndex] * 100) + "%");
        }
    };
    this.keylock.unshift = function() {
        this.input = this.normalInput;
    };
    this.keylock.shift = function() {
        this.input = this.shiftedInput;
    };
    this.keylock.unshift();
    this.keylock.output = function(value) {
        MC2000.LedManager.reflect("keylock", value, {deck: self.deckNumber});
    };
    this.keylock.connect = function() {
        engine.makeConnection(this.group, "keylock", this.output.bind(this));
    };

    // Monitor Cue (PFL): toggle headphone cue
    this.pfl = new components.Button({
        group: group,
        inKey: "pfl",
        type: components.Button.prototype.types.toggle,
    });
    this.pfl.output = function(value) {
        // Use reflectAlt for monitor cue as it has alternate LED protocol (0x50/0x51)
        var ledName = (self.deckNumber === 1) ? "monitorcue_l" : "monitorcue_r";
        MC2000.LedManager.reflectAlt(ledName, value, {deck: self.deckNumber});
    };
    this.pfl.connect = function() {
        engine.makeConnection(this.group, "pfl", this.output.bind(this));
    };

    // Vinyl/CDJ mode button
    this.vinylMode = new components.Button({
        group: group,
    });
    this.vinylMode.input = function(channel, control, value, status, group) {
        // Only act on button press, not release
        if (!MC2000.isButtonOn(value)) return;
        
        // Toggle vinyl mode state
        MC2000.vinylMode[group] = !MC2000.vinylMode[group];
        MC2000.debugLog("Vinyl/CDJ mode toggled for " + group + ": " + 
                       (MC2000.vinylMode[group] ? "VINYL" : "CDJ"));
    };
    // No LED output or connection needed as hardware handles this

    // Sample Mode Toggle button
    this.sampleModeToggle = new components.Button({
        group: group,
        type: components.Button.prototype.types.push,
    });
    this.sampleModeToggle.input = function(channel, control, value, status, group) {
        if (!MC2000.isButtonOn(value)) return;
        
        // Toggle sample mode state for this deck
        MC2000.sampleMode[group] = !MC2000.sampleMode[group];
        
        // Update LED
        MC2000.LedManager.reflect("samplemode", MC2000.sampleMode[group], {deck: self.deckNumber});
        
        if (MC2000.debugMode) {
            MC2000.debugLog(group + " sample mode: " + (MC2000.sampleMode[group] ? "ON" : "OFF"));
        }
    };
    this.sampleModeToggle.output = function(value) {
        MC2000.LedManager.reflect("samplemode", value, {deck: self.deckNumber});
    };
    this.sampleModeToggle.connect = function() {
        // Initialize LED state
        this.output(MC2000.sampleMode[group]);
    };

    // Load Track button
    this.loadTrackBtn = new components.Button({
        group: group,
        type: components.Button.prototype.types.push,
    });
    this.loadTrackBtn.normalInput = function(channel, control, value, status, group) {
        if (!MC2000.isButtonOn(value)) return;
        // Normal: Load selected track
        engine.setValue(group, "LoadSelectedTrack", 1);
        if (MC2000.debugMode) MC2000.debugLog("Load track to " + group);
    };
    this.loadTrackBtn.shiftedInput = function(channel, control, value, status, group) {
        if (!MC2000.isButtonOn(value)) return;
        // Shift: Eject/unload track
        engine.setValue(group, "eject", 1);
        if (MC2000.debugMode) MC2000.debugLog("Eject track from " + group);
    };
    this.loadTrackBtn.unshift = function() {
        this.input = this.normalInput;
    };
    this.loadTrackBtn.shift = function() {
        this.input = this.shiftedInput;
    };
    this.loadTrackBtn.unshift();

    // Track Gain: pregain/track gain knob
    this.trackGain = new components.Pot({ group: group, inKey: "pregain" });

    // Volume: channel volume fader
    this.volume = new components.Pot({ group: group, inKey: "volume" });

    // EQ: high, mid, low knobs
    this.eqHigh = new components.Pot({ group: "[EqualizerRack1_" + group + "_Effect1]", inKey: "parameter3" });
    this.eqMid = new components.Pot({ group: "[EqualizerRack1_" + group + "_Effect1]", inKey: "parameter2" });
    this.eqLow = new components.Pot({ group: "[EqualizerRack1_" + group + "_Effect1]", inKey: "parameter1" });

    // Pitch: simple pot to rate parameter (expects 0..1); wrappers convert CC value
    this.rate = new components.Pot({ group: group, inKey: "rate" });

    // Pitch Bend buttons: temporary pitch up/down
    this.pitchBendUpBtn = new components.Button({
        group: group,
        type: components.Button.prototype.types.push,
    });
    this.pitchBendUpBtn.normalInput = function(_ch,_ctrl,value,_status,group){
        // Normal: temporary pitch bend up
        engine.setValue(group, "rate_temp_up", MC2000.isButtonOn(value) ? 1 : 0);
    };
    this.pitchBendUpBtn.shiftedInput = function(_ch,_ctrl,value,_status,group){
        // Shift: fast forward
        engine.setValue(group, "fwd", MC2000.isButtonOn(value) ? 1 : 0);
    };
    this.pitchBendUpBtn.unshift = function() {
        this.input = this.normalInput;
    };
    this.pitchBendUpBtn.shift = function() {
        this.input = this.shiftedInput;
    };
    this.pitchBendUpBtn.unshift();

    this.pitchBendDownBtn = new components.Button({
        group: group,
        type: components.Button.prototype.types.push,
    });
    this.pitchBendDownBtn.normalInput = function(_ch,_ctrl,value,_status,group){
        // Normal: temporary pitch bend down
        engine.setValue(group, "rate_temp_down", MC2000.isButtonOn(value) ? 1 : 0);
    };
    this.pitchBendDownBtn.shiftedInput = function(_ch,_ctrl,value,_status,group){
        // Shift: fast rewind (back)
        engine.setValue(group, "back", MC2000.isButtonOn(value) ? 1 : 0);
    };
    this.pitchBendDownBtn.unshift = function() {
        this.input = this.normalInput;
    };
    this.pitchBendDownBtn.shift = function() {
        this.input = this.shiftedInput;
    };
    this.pitchBendDownBtn.unshift();

    this.applyShiftState = function(shifted) {
        // List of all shift-capable components
        var shiftComponents = [
            this.cue,
            this.sync,
            this.keylock,
            this.loadTrackBtn,
            this.pitchBendUpBtn,
            this.pitchBendDownBtn,
            this.loopInBtn,
            this.loopOutBtn,
            this.loopHalveBtn,
            this.loopDoubleBtn,
            this.reloopExitBtn,
            this.beatTapBtn
        ];
        
        // Apply shift/unshift to individual components
        shiftComponents.forEach(function(comp) {
            if (comp) {
                if (shifted && comp.shift) {
                    comp.shift();
                } else if (comp.unshift) {
                    comp.unshift();
                }
            }
        });
        
        // Apply shift/unshift to hotcue buttons
        if (this.hotcueButtons) {
            this.hotcueButtons.forEach(function(btn) {
                if (btn) {
                    if (shifted && btn.shift) {
                        btn.shift();
                    } else if (btn.unshift) {
                        btn.unshift();
                    }
                }
            });
        }
    };

    // --- Loops ---
    // Loop In: Sets loop in point, or activates 4-beat loop if no loop exists
    // Shift: Jump to loop in point
    this.loopInBtn = new components.Button({
        group: group,
        type: components.Button.prototype.types.push,
    });
    this.loopInBtn.normalInput = function(_ch,_ctrl,value,_status,group){
        if (!MC2000.isButtonOn(value)) return;
        // Normal: Set loop in point, or activate beatloop if no loop
        var loopEnabled = engine.getValue(group, "loop_enabled");
        var loopStart = engine.getValue(group, "loop_start_position");
        
        if (loopStart === -1 && !loopEnabled) {
            // No loop exists: create 4-beat loop
            engine.setValue(group, "beatloop_4_activate", 1);
        } else {
            // Set loop in point
            engine.setValue(group, "loop_in", 1);
        }
    };
    this.loopInBtn.shiftedInput = function(_ch,_ctrl,value,_status,group){
        if (!MC2000.isButtonOn(value)) return;
        // Shift: Jump to loop in point (if loop exists)
        var loopStart = engine.getValue(group, "loop_start_position");
        if (loopStart !== -1) {
            engine.setValue(group, "loop_in_goto", 1);
        }
    };
    this.loopInBtn.unshift = function() {
        this.input = this.normalInput;
    };
    this.loopInBtn.shift = function() {
        this.input = this.shiftedInput;
    };
    this.loopInBtn.unshift();
    this.loopInBtn.output = function(value) {
        MC2000.LedManager.reflect("loopin", value, {deck: self.deckNumber});
    };
    this.loopInBtn.connect = function() {
        engine.makeConnection(this.group, "loop_enabled", this.output.bind(this));
    };

    // Loop Out: Sets loop out point and activates loop
    // Shift: Jump to loop out point
    this.loopOutBtn = new components.Button({
        group: group,
        type: components.Button.prototype.types.push,
    });
    this.loopOutBtn.normalInput = function(_ch,_ctrl,value,_status,group){
        if (!MC2000.isButtonOn(value)) return;
        // Normal: Set loop out point
        engine.setValue(group, "loop_out", 1);
    };
    this.loopOutBtn.shiftedInput = function(_ch,_ctrl,value,_status,group){
        if (!MC2000.isButtonOn(value)) return;
        // Shift: Jump to loop out point (if loop exists)
        var loopEnd = engine.getValue(group, "loop_end_position");
        if (loopEnd !== -1) {
            engine.setValue(group, "loop_out_goto", 1);
        }
    };
    this.loopOutBtn.unshift = function() {
        this.input = this.normalInput;
    };
    this.loopOutBtn.shift = function() {
        this.input = this.shiftedInput;
    };
    this.loopOutBtn.unshift();
    this.loopOutBtn.output = function(value) {
        MC2000.LedManager.reflect("loopout", value, {deck: self.deckNumber});
    };
    this.loopOutBtn.connect = function() {
        engine.makeConnection(this.group, "loop_enabled", this.output.bind(this));
    };

    // Loop Halve: Halves the current loop size
    // Shift: Beatjump backward by 1 beat
    this.loopHalveBtn = new components.Button({
        group: group,
        type: components.Button.prototype.types.push,
    });
    this.loopHalveBtn.normalInput = function(_ch,_ctrl,value,_status,group){
        if (!MC2000.isButtonOn(value)) return;
        engine.setValue(group, "loop_halve", 1);
    };
    this.loopHalveBtn.shiftedInput = function(_ch,_ctrl,value,_status,group){
        if (!MC2000.isButtonOn(value)) return;
        engine.setValue(group, "beatjump_1_backward", 1);
    };
    this.loopHalveBtn.unshift = function() {
        this.input = this.normalInput;
    };
    this.loopHalveBtn.shift = function() {
        this.input = this.shiftedInput;
    };
    this.loopHalveBtn.unshift();

    // Loop Double: Doubles the current loop size
    // Shift: Beatjump forward by 1 beat
    this.loopDoubleBtn = new components.Button({
        group: group,
        type: components.Button.prototype.types.push,
    });
    this.loopDoubleBtn.normalInput = function(_ch,_ctrl,value,_status,group){
        if (!MC2000.isButtonOn(value)) return;
        engine.setValue(group, "loop_double", 1);
    };
    this.loopDoubleBtn.shiftedInput = function(_ch,_ctrl,value,_status,group){
        if (!MC2000.isButtonOn(value)) return;
        engine.setValue(group, "beatjump_1_forward", 1);
    };
    this.loopDoubleBtn.unshift = function() {
        this.input = this.normalInput;
    };
    this.loopDoubleBtn.shift = function() {
        this.input = this.shiftedInput;
    };
    this.loopDoubleBtn.unshift();

    // Reloop/Exit: Toggles loop on/off if loop exists, or creates beatloop if no loop
    // Shift: Creates 8-beat loop instead of 4-beat
    this.reloopExitBtn = new components.Button({
        group: group,
        type: components.Button.prototype.types.push,
    });
    this.reloopExitBtn.normalInput = function(_ch,_ctrl,value,_status,group){
        if (!MC2000.isButtonOn(value)) return;
        var loopStart = engine.getValue(group, "loop_start_position");
        
        if (loopStart !== -1) {
            // Loop exists: toggle it (reloop/exit)
            engine.setValue(group, "reloop_toggle", 1);
        } else {
            // No loop: create 4-beat loop
            engine.setValue(group, "beatloop_4_activate", 1);
        }
    };
    this.reloopExitBtn.shiftedInput = function(_ch,_ctrl,value,_status,group){
        if (!MC2000.isButtonOn(value)) return;
        var loopStart = engine.getValue(group, "loop_start_position");
        
        if (loopStart !== -1) {
            // Loop exists: toggle it (reloop/exit)
            engine.setValue(group, "reloop_toggle", 1);
        } else {
            // No loop: create 8-beat loop
            engine.setValue(group, "beatloop_8_activate", 1);
        }
    };
    this.reloopExitBtn.unshift = function() {
        this.input = this.normalInput;
    };
    this.reloopExitBtn.shift = function() {
        this.input = this.shiftedInput;
    };
    this.reloopExitBtn.unshift();
    this.reloopExitBtn.output = function(value) {
        MC2000.LedManager.reflect("autoloop", value, {deck: self.deckNumber});
    };
    this.reloopExitBtn.connect = function() {
        engine.makeConnection(this.group, "loop_enabled", this.output.bind(this));
    };

    // Hotcues: using HotcueButton components
    this.hotcueButtons = [];
    var ledNames = ["cue1", "cue2", "cue3", "cue4"];
    
    for (var i = 0; i < 4; i++) {
        // Create HotcueButton component
        this.hotcueButtons[i] = new components.HotcueButton({
            group: group,
            number: i + 1,
        });
        
        // Custom output for LED feedback
        (function(index, deckNum, ledName, hotcue) {
            hotcue.output = function(value) {
                MC2000.LedManager.reflect(ledName, value, {deck: deckNum});
            };
            
            hotcue.connect = function() {
                engine.makeConnection(this.group, "hotcue_" + this.number + "_enabled", this.output.bind(this));
            };
            
            // Store original input for shift layers
            hotcue.normalInput = hotcue.input;
            
            // Shifted input: clear hotcue
            hotcue.shiftedInput = function(channel, control, value, status, group) {
                if (MC2000.isButtonOn(value)) {
                    var pos = engine.getValue(group, "hotcue_" + this.number + "_position");
                    if (pos !== -1) {
                        engine.setValue(group, "hotcue_" + this.number + "_clear", 1);
                    }
                }
                // No action on release in shift mode
            };
            
            hotcue.unshift = function() {
                this.input = this.normalInput;
            };
            
            hotcue.shift = function() {
                this.input = this.shiftedInput;
            };
            
            hotcue.unshift(); // Initialize
        }).call(this, i, self.deckNumber, ledNames[i], this.hotcueButtons[i]);
    }
    
    // Hotcue input handler
    this.hotcueInput = function(control, value, _status) {
        var n = MC2000.mapHotcue(control);
        if (n < 1 || n > 4 || !this.hotcueButtons[n - 1]) return;
        // Delegate to the hotcue button component (shift layers handled by component)
        this.hotcueButtons[n - 1].input(0, control, value, 0, group);
    };

    // Beat Tap (tempo tap) button
    this.beatTapBtn = new components.Button({
        group: group,
        inKey: "bpm_tap",
        type: components.Button.prototype.types.push,
    });
};

MC2000.buildComponents = function() {
    MC2000.debugLog("Building components...");
    MC2000.decks = {
        "[Channel1]": new MC2000.Deck("[Channel1]"),
        "[Channel2]": new MC2000.Deck("[Channel2]")
    };
    MC2000.debugLog("Decks created");
    
    // Apply current shift state and connect LEDs
    Object.keys(MC2000.decks).forEach(function(g) {
        var d = MC2000.decks[g];
        d.applyShiftState(MC2000.isShiftActive());
        
        // Connect component LEDs
        if (d.play && d.play.connect) d.play.connect();
        if (d.cue && d.cue.connect) d.cue.connect();
        if (d.sync && d.sync.connect) d.sync.connect();
        if (d.keylock && d.keylock.connect) d.keylock.connect();
        if (d.pfl && d.pfl.connect) d.pfl.connect();
        if (d.sampleModeToggle && d.sampleModeToggle.connect) d.sampleModeToggle.connect();
        if (d.loopInBtn && d.loopInBtn.connect) d.loopInBtn.connect();
        if (d.loopOutBtn && d.loopOutBtn.connect) d.loopOutBtn.connect();
        if (d.reloopExitBtn && d.reloopExitBtn.connect) d.reloopExitBtn.connect();
        
        // Connect hotcue button LEDs
        if (d.hotcueButtons) {
            for (var i = 0; i < d.hotcueButtons.length; i++) {
                if (d.hotcueButtons[i] && d.hotcueButtons[i].connect) {
                    d.hotcueButtons[i].connect();
                }
            }
        }
        MC2000.debugLog(g + " components connected");
    });
    MC2000.debugLog("buildComponents complete");
};

//////////////////////////////
// Transport handlers       //
// All handlers below are wrapper functions that delegate to deck components
// for proper encapsulation and component-based architecture
//////////////////////////////
MC2000.playButton = function(channel, control, value, status, group) {
    MC2000.decks[group].play.input(channel, control, value, status, group);
};

MC2000.cueButton = function(channel, control, value, status, group) {
    MC2000.decks[group].applyShiftState(MC2000.isShiftActive());
    if (MC2000.debugMode) {
        MC2000.debugLog(
            "cueButton: value=" + value +
            " pressed=" + MC2000.isButtonOn(value) +
            " shiftActive=" + MC2000.isShiftActive() +
            " play_indicator=" + engine.getValue(group, "play_indicator")
        );
    }
    MC2000.decks[group].cue.input(channel, control, value, status, group);
};

MC2000.syncButton = function(channel, control, value, status, group) {
    MC2000.decks[group].applyShiftState(MC2000.isShiftActive());
    MC2000.decks[group].sync.input(channel, control, value, status, group);
};

MC2000.keylockButton = function(channel, control, value, status, group) {
    MC2000.decks[group].keylock.input(channel, control, value, status, group);
};

MC2000.vinylModeButton = function(channel, control, value, status, group) {
    MC2000.decks[group].vinylMode.input(channel, control, value, status, group);
};

MC2000.pflButton = function(channel, control, value, status, group) {
    var wasPressed = MC2000.isButtonOn(value);
    // If shift is held and PFL is pressed, toggle shift lock
    if (wasPressed && MC2000.shiftHeld) {
        MC2000.shiftLock = !MC2000.shiftLock;
        MC2000.updateShiftState();
        //MC2000.blinkShiftLock(); // Blink for feedback
        if (MC2000.debugMode) MC2000.debugLog("Shift lock " + (MC2000.shiftLock ? "ENABLED" : "DISABLED"));
        return;
    }
    // Otherwise, normal PFL logic
    MC2000.decks[group].pfl.input(channel, control, value, status, group);
};

//////////////////////////////
// Sample Mode Toggle       //
//////////////////////////////
MC2000.sampleModeToggle = function(channel, control, value, status, group) {
    MC2000.decks[group].sampleModeToggle.input(channel, control, value, status, group);
};

//////////////////////////////
// Load Track               //
//////////////////////////////
MC2000.loadTrack = function(channel, control, value, status, group) {
    MC2000.decks[group].loadTrackBtn.input(channel, control, value, status, group);
};

//////////////////////////////
// Track Gain knob          //
//////////////////////////////
MC2000.trackGain = function(channel, control, value, status, group) {
    MC2000.decks[group].trackGain.input(channel, control, value, status, group);
};

//////////////////////////////
// Volume fader             //
//////////////////////////////
MC2000.volumeFader = function(channel, control, value, status, group) {
    MC2000.decks[group].volume.input(channel, control, value, status, group);
};

//////////////////////////////
// EQ controls              //
//////////////////////////////
MC2000.eqHigh = function(channel, control, value, status, group) {
    MC2000.decks[group].eqHigh.input(channel, control, value, status, group);
};

MC2000.eqMid = function(channel, control, value, status, group) {
    MC2000.decks[group].eqMid.input(channel, control, value, status, group);
};

MC2000.eqLow = function(channel, control, value, status, group) {
    MC2000.decks[group].eqLow.input(channel, control, value, status, group);
};

//////////////////////////////
// Master Controls          //
//////////////////////////////
MC2000.masterVolume = function(channel, control, value, status, group) {
    MC2000.masterVolumePot.input(channel, control, value, status, group);
};

MC2000.crossfader = function(channel, control, value, status, group) {
    MC2000.crossfaderPot.input(channel, control, value, status, group);
};

MC2000.headphoneVolume = function(channel, control, value, status, group) {
    MC2000.headphoneVolumePot.input(channel, control, value, status, group);
};

MC2000.headphoneMix = function(channel, control, value, status, group) {
    MC2000.headphoneMixPot.input(channel, control, value, status, group);
};

//////////////////////////////
// Pitch fader (absolute)   //
//////////////////////////////
MC2000.pitchFader = function(channel, control, value, status, group) {
    MC2000.decks[group].rate.input(channel, control, value, status, group);
};

//////////////////////////////
// Pitch Bend buttons       //
//////////////////////////////
MC2000.pitchBendUp = function(channel, control, value, status, group) {
    MC2000.decks[group].pitchBendUpBtn.input(channel, control, value, status, group);
};

MC2000.pitchBendDown = function(channel, control, value, status, group) {
    MC2000.decks[group].pitchBendDownBtn.input(channel, control, value, status, group);
};

//////////////////////////////
// Beat Tap (tempo tap)     //
//////////////////////////////
MC2000.beatTap1 = function(channel, control, value, status, group) {
    MC2000.decks["[Channel1]"].beatTapBtn.input(channel, control, value, status, "[Channel1]");
};
MC2000.beatTap2 = function(channel, control, value, status, group) {
    MC2000.decks["[Channel2]"].beatTapBtn.input(channel, control, value, status, "[Channel2]");
};

//////////////////////////////
// Jog Wheel (scratch mode) //
//////////////////////////////
/**
 * Integrated JogWheel handler (adapted from JogWheelScratch.js)
 * Handles touch sensor (0x51) rotation for scratch/scrub mode.
 * 
 * Features:
 * - When playing: Scratch mode with velocity scaling
 * - When paused: Fine scrubbing of playposition
 * - Timer-based release detection (50ms idle = stop scratching)
 * - Reduced drift with heavier vinyl settings
 */
MC2000.jogTouch = function(channel, control, value, status, group) {
    var deckNum = MC2000.deckIndex(group);
    
    // Convert relative encoder value to signed movement
    // MC2000 uses 0x40 as center, values wrap around 0x00-0x7F
    var movement = value - MC2000.jogCenter;
    
    // Normalize to signed delta: handle wrap-around
    if (movement > 64) movement -= 128;
    if (movement < -64) movement += 128;
    
    if (movement === 0) return; // No movement, ignore
    
    // Time-based spin detection for velocity scaling
    var now = Date.now();
    var timeDiff = now - MC2000.jogLastTickTime[deckNum];
    if (timeDiff > 150) {
        // Reset tick count if more than 150ms since last movement
        MC2000.jogTickCount[deckNum] = 0;
    }
    MC2000.jogTickCount[deckNum]++;
    MC2000.jogLastTickTime[deckNum] = now;
    
    // Speed factor ramps up with rapid ticks (capped at MAX_SCALING)
    var speedFactor = Math.min(1 + MC2000.jogTickCount[deckNum] / 10, MC2000.jogMaxScaling);
    
    var isPlaying = engine.getValue(group, "play") === 1;
    
    if (isPlaying) {
        // -------------------------------------------------
        // SCRATCH MODE (when playing)
        // -------------------------------------------------
        if (!MC2000.jogScratchActive[deckNum]) {
            // Enable slip mode when starting scratch - track continues in background
            var slipEnabled = engine.getValue(group, "slip_enabled");
            if (!slipEnabled) {
                engine.setValue(group, "slip_enabled", 1);
                if (MC2000.debugMode) MC2000.debugLog("Slip mode enabled: " + group);
            }
            
            engine.scratchEnable(deckNum,
                               MC2000.jogResolution,
                               MC2000.jogRpm,
                               MC2000.jogScratchAlpha,
                               MC2000.jogScratchBeta);
            MC2000.jogScratchActive[deckNum] = true;
            MC2000.deck[group].scratchMode = true;
            if (MC2000.debugMode) MC2000.debugLog("Scratch enabled: " + group);
        }
        
        // Apply movement with velocity scaling
        engine.scratchTick(deckNum, movement * speedFactor);
        
        // Reset release timer - disable scratch after 50ms idle
        if (MC2000.jogReleaseTimer[deckNum] !== null) {
            engine.stopTimer(MC2000.jogReleaseTimer[deckNum]);
            MC2000.jogReleaseTimer[deckNum] = null;
        }
        MC2000.jogReleaseTimer[deckNum] = engine.beginTimer(50, function() {
            engine.scratchDisable(deckNum);
            MC2000.jogScratchActive[deckNum] = false;
            MC2000.deck[group].scratchMode = false;
            // Disable slip mode when releasing - track catches up
            engine.setValue(group, "slip_enabled", 0);
            MC2000.jogReleaseTimer[deckNum] = null;
            if (MC2000.debugMode) MC2000.debugLog("Scratch disabled, slip off: " + group);
        }, true); // one-shot timer
        
    } else {
        // -------------------------------------------------
        // SCRUB MODE (when paused)
        // -------------------------------------------------
        // Fine scrubbing: slow movements = super fine, fast spins = slight boost
        var effectiveScaling = (MC2000.jogTickCount[deckNum] > 3) ? speedFactor : 1;
        
        var pos = engine.getValue(group, "playposition");
        pos += (movement * effectiveScaling * MC2000.jogScrubScaling);
        
        // Clamp to valid range 0..1
        if (pos < 0) pos = 0;
        if (pos > 1) pos = 1;
        
        engine.setValue(group, "playposition", pos);
        
        if (MC2000.debugMode) {
            MC2000.debugLog("Scrub: " + group + " movement=" + movement + " pos=" + pos.toFixed(4));
        }
    }
};

// Outer wheel (0x52) uses pitch bend when not scratching (CDJ mode)
MC2000.jogWheel = function(channel, control, value, status, group) {
    var deckNum = MC2000.deckIndex(group);
    
    // Convert relative encoder value to signed movement
    var movement = value - MC2000.jogCenter;
    
    // Normalize to signed delta: handle wrap-around
    if (movement > 64) movement -= 128;
    if (movement < -64) movement += 128;
    
    if (movement === 0) return; // No movement, ignore
    
    // Check if currently scratching (touch sensor active)
    if (MC2000.jogScratchActive[deckNum]) {
        // Touch sensor is active, use scratch mode
        MC2000.jogTouch(channel, control, value, status, group);
    } else {
        // No touch - use pitch bend for CDJ-style nudging
        if (MC2000.debugMode) {
            MC2000.debugLog("jogWheel: pitch bend mode, movement=" + movement);
        }
        engine.setValue(group, "jog", movement * MC2000.jogPitchScale);
    }
};

MC2000.deckIndex = function(group) {
    if (group === "[Channel1]") return 1;
    if (group === "[Channel2]") return 2;
    return 1;
};

//////////////////////////////
// Hotcues (single pad demo)//
//////////////////////////////
MC2000.hotcuePad = function(channel, control, value, status, group) {
    var d = MC2000.decks[group];
    if (d && d.hotcueInput) {
        d.hotcueInput(control, value, status);
    }
};

MC2000.mapHotcue = function(midino) {
    // Map MIDI note numbers to hotcue indices (1-4 per deck)
    var table = {
        0x17: 1,
        0x18: 2,
        0x19: 3,
        0x20: 4
    };
    return table[midino] || -1;
};

//////////////////////////////
// Loop handlers            //
//////////////////////////////
MC2000.loopIn = function(channel, control, value, status, group) {
    MC2000.decks[group].loopInBtn.input(channel, control, value, status, group);
};

MC2000.loopOut = function(channel, control, value, status, group) {
    MC2000.decks[group].loopOutBtn.input(channel, control, value, status, group);
};

MC2000.reloopExit = function(channel, control, value, status, group) {
    MC2000.decks[group].reloopExitBtn.input(channel, control, value, status, group);
};

MC2000.loopHalve = function(channel, control, value, status, group) {
    MC2000.decks[group].loopHalveBtn.input(channel, control, value, status, group);
};

MC2000.loopDouble = function(channel, control, value, status, group) {
    MC2000.decks[group].loopDoubleBtn.input(channel, control, value, status, group);
};

//////////////////////////////
// FX Unit Handlers         //
//////////////////////////////
// Generic FX effect toggle handler
MC2000.fxEffectToggle = function(unitNum, effectNum, channel, control, value, status, group) {
    MC2000.fxUnits[unitNum].effects[effectNum].toggle.input(channel, control, value, status, group);
};

// Generic FX effect meta handler
MC2000.fxEffectMeta = function(unitNum, effectNum, channel, control, value, status, group) {
    MC2000.fxUnits[unitNum].effects[effectNum].meta.input(channel, control, value, status, group);
};

// Generic FX wet/dry handler
MC2000.fxWetDry = function(unitNum, channel, control, value, status, group) {
    MC2000.fxUnits[unitNum].wetDryEncoder.input(channel, control, value, status, group);
};

// Unit 1 - Effect toggles
MC2000.fx1_effect1_toggle = function(channel, control, value, status, group) {
    MC2000.fxEffectToggle(1, 1, channel, control, value, status, group);
};
MC2000.fx1_effect2_toggle = function(channel, control, value, status, group) {
    MC2000.fxEffectToggle(1, 2, channel, control, value, status, group);
};
MC2000.fx1_effect3_toggle = function(channel, control, value, status, group) {
    MC2000.fxEffectToggle(1, 3, channel, control, value, status, group);
};

// Unit 1 - Effect meta pots
MC2000.fx1_effect1_meta = function(channel, control, value, status, group) {
    MC2000.fxEffectMeta(1, 1, channel, control, value, status, group);
};
MC2000.fx1_effect2_meta = function(channel, control, value, status, group) {
    MC2000.fxEffectMeta(1, 2, channel, control, value, status, group);
};
MC2000.fx1_effect3_meta = function(channel, control, value, status, group) {
    MC2000.fxEffectMeta(1, 3, channel, control, value, status, group);
};

// Unit 2 - Effect toggles
MC2000.fx2_effect1_toggle = function(channel, control, value, status, group) {
    MC2000.fxEffectToggle(2, 1, channel, control, value, status, group);
};
MC2000.fx2_effect2_toggle = function(channel, control, value, status, group) {
    MC2000.fxEffectToggle(2, 2, channel, control, value, status, group);
};
MC2000.fx2_effect3_toggle = function(channel, control, value, status, group) {
    MC2000.fxEffectToggle(2, 3, channel, control, value, status, group);
};

// Unit 2 - Effect meta pots
MC2000.fx2_effect1_meta = function(channel, control, value, status, group) {
    MC2000.fxEffectMeta(2, 1, channel, control, value, status, group);
};
MC2000.fx2_effect2_meta = function(channel, control, value, status, group) {
    MC2000.fxEffectMeta(2, 2, channel, control, value, status, group);
};
MC2000.fx2_effect3_meta = function(channel, control, value, status, group) {
    MC2000.fxEffectMeta(2, 3, channel, control, value, status, group);
};

// Unit wet/dry encoders
MC2000.fx1_wetDry = function(channel, control, value, status, group) {
    MC2000.fxWetDry(1, channel, control, value, status, group);
};
MC2000.fx2_wetDry = function(channel, control, value, status, group) {
    MC2000.fxWetDry(2, channel, control, value, status, group);
};

//////////////////////////////
// Library handlers         //
//////////////////////////////
MC2000.ScrollVertical = function(channel, control, value, status, group) {
    MC2000.scrollVerticalEncoder.input(channel, control, value, status, group);
};

MC2000.libraryFocusForwardBtn = function(channel, control, value, status, group) {
    if (MC2000.debugMode) {
        MC2000.debugLog("libraryFocusForwardBtn: ch=" + channel + " ctrl=" + control + 
                       " val=" + value + " status=0x" + status.toString(16) + " group=" + group);
    }
    MC2000.libraryFocusForwardComp.input(channel, control, value, status, group);
};

MC2000.libraryFocusBackwardBtn = function(channel, control, value, status, group) {
    if (MC2000.debugMode) {
        MC2000.debugLog("libraryFocusBackwardBtn: ch=" + channel + " ctrl=" + control + 
                       " val=" + value + " status=0x" + status.toString(16) + " group=" + group);
    }
    MC2000.libraryFocusBackwardComp.input(channel, control, value, status, group);
};

MC2000.libraryGoToItemBtn = function(channel, control, value, status, group) {
    if (MC2000.debugMode) {
        MC2000.debugLog("libraryGoToItemBtn: ch=" + channel + " ctrl=" + control +
                        " val=" + value + " status=0x" + status.toString(16) + " group=" + group);
    }
    MC2000.libraryGoToItemComp.input(channel, control, value, status, group);
};

//////////////////////////////
// Sampler handlers         //
//////////////////////////////
// MIDI note to sampler number mapping
MC2000.samplerMidiMap = {
    // Bank 1 (Deck 1 - channel 0x90)
    0x21: 1,
    0x22: 2,
    0x23: 3,
    0x24: 4,
    // Bank 2 (Deck 2 - channel 0x91)
    0x31: 5,
    0x32: 6,
    0x33: 7,
    0x34: 8
};

// Generic handler using MIDI note lookup
MC2000.samplerPlayButtonGeneric = function(channel, control, value, status) {
    var samplerNum = MC2000.samplerMidiMap[control];
    if (!samplerNum) {
        if (MC2000.debugMode) MC2000.debugLog("Unknown sampler MIDI note: 0x" + control.toString(16));
        return;
    }
    var group = "[Sampler" + samplerNum + "]";
    // Only act on button press (ignore release/off)
    if (!MC2000.isButtonOn(value)) return;

    // Shift: Eject/unload sampler if track is loaded
    if (MC2000.isShiftActive()) {
        var loaded = engine.getValue(group, "track_loaded");
        if (loaded === 1) {
            engine.setValue(group, "eject", 1);
            if (MC2000.debugMode) MC2000.debugLog("Sampler" + samplerNum + ": ejected track");
        }
        return;
    }

    // Normal behavior: If sampler empty, load selected library track (but don't play yet)
    var loaded = engine.getValue(group, "track_loaded");
    if (loaded === 0) {
        engine.setValue(group, "LoadSelectedTrack", 1);
        if (MC2000.debugMode) MC2000.debugLog("Sampler" + samplerNum + ": loaded selected track (not playing yet)");
        return;
    }

    // If track is loaded, delegate to play button for play/stop logic
    MC2000.samplers[samplerNum].playButton.input(channel, control, value, status, group);
};

// Individual handlers for XML bindings (delegate to generic handler)
MC2000.sampler1PlayButton = function(channel, control, value, status, group) {
    MC2000.samplerPlayButtonGeneric(channel, control, value, status);
};
MC2000.sampler2PlayButton = function(channel, control, value, status, group) {
    MC2000.samplerPlayButtonGeneric(channel, control, value, status);
};
MC2000.sampler3PlayButton = function(channel, control, value, status, group) {
    MC2000.samplerPlayButtonGeneric(channel, control, value, status);
};
MC2000.sampler4PlayButton = function(channel, control, value, status, group) {
    MC2000.samplerPlayButtonGeneric(channel, control, value, status);
};
MC2000.sampler5PlayButton = function(channel, control, value, status, group) {
    MC2000.samplerPlayButtonGeneric(channel, control, value, status);
};
MC2000.sampler6PlayButton = function(channel, control, value, status, group) {
    MC2000.samplerPlayButtonGeneric(channel, control, value, status);
};
MC2000.sampler7PlayButton = function(channel, control, value, status, group) {
    MC2000.samplerPlayButtonGeneric(channel, control, value, status);
};
MC2000.sampler8PlayButton = function(channel, control, value, status, group) {
    MC2000.samplerPlayButtonGeneric(channel, control, value, status);
};

//////////////////////////////
// Debug utilities          //
//////////////////////////////
// Dump current controller state for debugging
MC2000.debugDump = function() {
    MC2000.log("=== MC2000 Debug Dump ===");
    MC2000.log("Shift held: " + MC2000.shiftHeld + ", lock: " + MC2000.shiftLock + ", effective: " + MC2000.isShiftActive());
    MC2000.log("Debug mode: " + MC2000.debugMode);
    MC2000.log("Decks initialized: " + (MC2000.decks ? "Yes" : "No"));
    MC2000.log("FX units initialized: " + (MC2000.fxUnits ? "Yes" : "No"));
    MC2000.log("Samplers initialized: " + (MC2000.samplers ? "Yes" : "No"));
};

//////////////////////////////
// TODO / Future Features   //
//////////////////////////////
// PRIORITY:
// - Verify all MIDI codes against hardware
// - Test and fix LED feedback issues
// - Complete jog wheel/scratch implementation
// - Tune encoder sensitivities
//
// ENHANCEMENTS:
// - Sampler deck controls (basic scaffolding added)
// - Advanced shift layers for alternate pad modes
// - Smart PFL auto-enable logic
// - Rate range cycling
// - Beat jump controls
// - Loop roll controls
// - Performance mode improvements
