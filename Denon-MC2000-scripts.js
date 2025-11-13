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

// If the Components library is not loaded, provide a tiny shim so the script doesn't crash.
// For full functionality, ensure midi-components-0.0.js (or 1.0) is loaded from XML.
if (typeof components === "undefined") {
    var components = {
        Component: function(opts) { Object.assign(this, opts || {}); },
        ComponentContainer: function() {
            this.forEachComponent = function(cb) {
                Object.keys(this).forEach(function(k){
                    if (this[k] && typeof this[k] === "object" && this[k].input) cb(this[k], k);
                }, this);
            };
        },
        Button: function(opts) {
            this.type = (components.Button && components.Button.prototype && components.Button.prototype.types && components.Button.prototype.types.toggle) || 1;
            Object.assign(this, opts || {});
            this.isPress = function(_ch,_ctrl,value,_status){ return value !== 0; };
            this.input = function(_ch,_ctrl,value,_status,group){
                if (!this.inKey || !group) return;
                if (this.isPress(0,0,value,0)) {
                    if (this.onShortPress) { this.onShortPress(); return; }
                    script.toggleControl(group, this.inKey);
                }
            };
            this.output = function(){ if (this.outKey && this.group) engine.trigger(this.group, this.outKey); };
            this.connect = function(){};
            this.trigger = function(){ this.output(); };
            this.disconnect = function(){};
        },
        Pot: function(opts){
            Object.assign(this, opts || {});
            this.input = function(_ch,_ctrl,value,_status,group){
                if (!this.inKey || !group) return;
                var v = value / 127.0; // naive scaling
                engine.setParameter(group, this.inKey, v);
            };
            this.connect = function(){};
        }
    };
    components.Button.prototype = { types: { toggle: 1, push: 2 } };
}
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

	loopin: 		36, 
	loopout: 		64, 
	autoloop: 		43,
	fx1_1: 			92, 
	
	fx1_2: 			93, 
	fx1_3: 			94,
	fx2_1: 			96, 
	fx2_2: 			97,

	fx2_3: 			98,
	// "ALL SLIDER/VOLUME/FADER REQUEST": 57,
	monitorcue_l: 	69,
	monitorcue_r: 	81
};

MC2000.setLed = function(deck,led,status) {
	var ledStatus = 0x4B; // Default OFF
	switch (status) {
		case 0: 	ledStatus = 0x4B; break; // OFF
		case false: ledStatus = 0x4B; break; // OFF 
    	case 1: 	ledStatus = 0x4A; break; // ON
		case true: 	ledStatus = 0x4A; break; // ON
    	case 2: 	ledStatus = 0x4C; break; // BLINK
    	default: 	break;
	}
	midi.sendShortMsg(0xB0+(deck-1), ledStatus, led);
};

MC2000.setLed2 = function(deck,led,status) {
	midi.sendShortMsg(0xB0+(deck-1), status==1 ? 0x50 : 0x51, led);
};

MC2000.allLed2Default = function () {
	// All leds OFF for deck 1 and 2
	for (var led in MC2000.leds) {
		MC2000.setLed(1,MC2000.leds[led],0);
		MC2000.setLed(2,MC2000.leds[led],0);	
	}

	// Monitor cue leds OFF for deck 1 and 2 (use function setLed2)
	MC2000.setLed2(1,MC2000.leds["monitorcue_l"],0);
	MC2000.setLed2(2,MC2000.leds["monitorcue_r"],0);

	// Vinylmode ON
	MC2000.setLed(1,MC2000.leds["vinylmode"],1);
	MC2000.setLed(2,MC2000.leds["vinylmode"],1);
};

//////////////////////////////
// Tunable constants        //
//////////////////////////////
MC2000.jogScratchAlpha = 1.0/8;      // same pattern as other Denon decks
MC2000.jogScratchBeta  = (1.0/8)/32; // friction
MC2000.jogResolution   = 2048;       // samples per rev (guess; adjust experimentally)
MC2000.jogRpm          = 45; //33 + 1/3;   // virtual platter speed
MC2000.jogCenter       = 0x40;       // relative center value
MC2000.jogScale        = 1.0/4;      // scale for non-scratch jog (pitch bend)
MC2000.numHotcues      = 8;

//////////////////////////////
// Internal state           //
//////////////////////////////
MC2000.shift = false;
MC2000.scratchEnabled = {"[Channel1]": false, "[Channel2]": false};
MC2000.deck = {
    "[Channel1]": {scratchMode: false},
    "[Channel2]": {scratchMode: false}
};

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

MC2000.toggleShift = function(_channel, _control, value) {
    MC2000.shift = MC2000.isButtonOn(value);
    // Update component layers if created
    if (MC2000.decks) {
        Object.keys(MC2000.decks).forEach(function(g){
            var d = MC2000.decks[g];
            if (!d) return;
            if (d.applyShiftState) d.applyShiftState(MC2000.shift);
        });
    }
};

//////////////////////////////
// Initialization           //
//////////////////////////////
MC2000.init = function(id) {
    MC2000.id = id;
    MC2000.log("Init controller " + id);
    
    // Initialize all LEDs to default state
    MC2000.allLed2Default();
    
    // Build Components-based structure with LED connections
    MC2000.buildComponents();
    
    // Build master controls
    MC2000.buildMasterControls();
    
    // Build FX units
    MC2000.buildFxUnits();
    
    // Build library controls
    MC2000.buildLibraryControls();
};

MC2000.shutdown = function() {
    MC2000.log("Shutdown controller");
    // Turn off all LEDs
    MC2000.allLed2Default();
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
    
    // Effect 1
    this.effect1Toggle = new components.Button({
        group: "[EffectRack1_EffectUnit" + unitNumber + "_Effect1]",
        inKey: "enabled",
        type: components.Button.prototype.types.toggle,
    });
    
    this.effect1Meta = new components.Pot({
        group: "[EffectRack1_EffectUnit" + unitNumber + "_Effect1]",
        inKey: "meta"
    });
    
    // Effect 2
    this.effect2Toggle = new components.Button({
        group: "[EffectRack1_EffectUnit" + unitNumber + "_Effect2]",
        inKey: "enabled",
        type: components.Button.prototype.types.toggle,
    });
    
    this.effect2Meta = new components.Pot({
        group: "[EffectRack1_EffectUnit" + unitNumber + "_Effect2]",
        inKey: "meta"
    });
    
    // Effect 3
    this.effect3Toggle = new components.Button({
        group: "[EffectRack1_EffectUnit" + unitNumber + "_Effect3]",
        inKey: "enabled",
        type: components.Button.prototype.types.toggle,
    });
    
    this.effect3Meta = new components.Pot({
        group: "[EffectRack1_EffectUnit" + unitNumber + "_Effect3]",
        inKey: "meta"
    });
    
    // Wet/Dry encoder (relative encoder for mix control)
    this.wetDryEncoder = new components.Encoder({
        group: this.group,
        inKey: "mix"
    });
    
    // Custom input handler for relative encoder acting as pseudo pot
    this.wetDryEncoder.input = function(channel, control, value, status, group) {
        if (value === 1) {
            // Counterclockwise: decrease wet/dry mix
            this.inSetParameter(this.inGetParameter() - 0.05);
        } else if (value === 127) {
            // Clockwise: increase wet/dry mix
            this.inSetParameter(this.inGetParameter() + 0.05);
        }
    };
};

MC2000.buildFxUnits = function() {
    MC2000.fxUnits = {
        1: new MC2000.FxUnit(1),
        2: new MC2000.FxUnit(2)
    };
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
};

//////////////////////////////
// Components wiring         //
//////////////////////////////
MC2000.Deck = function(group) {
    this.group = group;
    var self = this;
    
    // Get deck number (1 or 2)
    this.deckNumber = (group === "[Channel1]") ? 1 : 2;

    // Play: play type button; LED follows play_indicator
    this.play = new components.Button({
        group: group,
        inKey: "play",
        type: components.Button.prototype.types.play,
    });
    this.play.output = function(value) {
        MC2000.setLed(self.deckNumber, MC2000.leds.play, value ? 1 : 0);
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
        MC2000.setLed(self.deckNumber, MC2000.leds.cue, value ? 1 : 0);
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

    // Sync: unshift one-shot, shift toggles sync lock
    this.sync = new components.Button({
        group: group,
        type: components.Button.prototype.types.sync,
    });
    this.sync.output = function(value) {
        MC2000.setLed(self.deckNumber, MC2000.leds.sync, value ? 1 : 0);
    };
    this.sync.connect = function() {
        engine.makeConnection(this.group, "sync_enabled", this.output.bind(this));
    };
    this.sync.unshift = function() {
        this.inKey = null;
        this.onShortPress = function(){ engine.setValue(group, "beatsync", 1); };
    };
    this.sync.shift = function() {
        this.inKey = "sync_enabled";
        this.onShortPress = function(){ script.toggleControl(group, "sync_enabled"); };
    };

    // Keylock: toggle keylock (master tempo)
    this.keylock = new components.Button({
        group: group,
        inKey: "keylock",
        type: components.Button.prototype.types.toggle,
    });
    this.keylock.output = function(value) {
        MC2000.setLed(self.deckNumber, MC2000.leds.keylock, value ? 1 : 0);
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
        // Use setLed2 for monitor cue as it has different LED codes per channel
        var ledName = (self.deckNumber === 1) ? "monitorcue_l" : "monitorcue_r";
        MC2000.setLed2(self.deckNumber, MC2000.leds[ledName], value ? 1 : 0);
    };
    this.pfl.connect = function() {
        engine.makeConnection(this.group, "pfl", this.output.bind(this));
    };

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
    this.pitchBendUpBtn.input = function(_ch,_ctrl,value,_status,group){
        engine.setValue(group, "rate_temp_up", MC2000.isButtonOn(value) ? 1 : 0);
    };

    this.pitchBendDownBtn = new components.Button({
        group: group,
        type: components.Button.prototype.types.push,
    });
    this.pitchBendDownBtn.input = function(_ch,_ctrl,value,_status,group){
        engine.setValue(group, "rate_temp_down", MC2000.isButtonOn(value) ? 1 : 0);
    };

    this.applyShiftState = function(shifted) {
        // Apply shift to cue and sync buttons
        if (this.cue) {
            if (shifted && this.cue.shift) { this.cue.shift(); }
            else if (this.cue.unshift) { this.cue.unshift(); }
        }
        if (this.sync) {
            if (shifted && this.sync.shift) { this.sync.shift(); }
            else if (this.sync.unshift) { this.sync.unshift(); }
        }
    };

    // --- Loops ---
    this.loopInBtn = new components.Button({
        group: group,
        type: components.Button.prototype.types.push,
    });
    this.loopInBtn.input = function(_ch,_ctrl,value,_status,group){
        if (!MC2000.isButtonOn(value)) return;
        if (MC2000.shift) {
            engine.setValue(group, "reloop_toggle", 1);
        } else {
            engine.setValue(group, "loop_in", 1);
        }
    };
    this.loopInBtn.output = function(value) {
        MC2000.setLed(self.deckNumber, MC2000.leds.loopin, value ? 1 : 0);
    };
    this.loopInBtn.connect = function() {
        engine.makeConnection(this.group, "loop_enabled", this.output.bind(this));
    };

    this.loopOutBtn = new components.Button({
        group: group,
        type: components.Button.prototype.types.push,
    });
    this.loopOutBtn.input = function(_ch,_ctrl,value,_status,group){
        if (!MC2000.isButtonOn(value)) return;
        if (MC2000.shift) {
            engine.setValue(group, "loop_exit", 1);
        } else {
            engine.setValue(group, "loop_out", 1);
        }
    };
    this.loopOutBtn.output = function(value) {
        MC2000.setLed(self.deckNumber, MC2000.leds.loopout, value ? 1 : 0);
    };
    this.loopOutBtn.connect = function() {
        engine.makeConnection(this.group, "loop_enabled", this.output.bind(this));
    };

    this.loopHalveBtn = new components.Button({
        group: group,
        type: components.Button.prototype.types.push,
    });
    this.loopHalveBtn.input = function(_ch,_ctrl,value,_status,group){
        if (!MC2000.isButtonOn(value)) return;
        engine.setValue(group, "loop_halve", 1);
    };

    this.loopDoubleBtn = new components.Button({
        group: group,
        type: components.Button.prototype.types.push,
    });
    this.loopDoubleBtn.input = function(_ch,_ctrl,value,_status,group){
        if (!MC2000.isButtonOn(value)) return;
        engine.setValue(group, "loop_double", 1);
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
                MC2000.setLed(deckNum, MC2000.leds[ledName], value ? 1 : 0);
            };
            
            hotcue.connect = function() {
                engine.makeConnection(this.group, "hotcue_" + this.number + "_enabled", this.output.bind(this));
            };
        }).call(this, i, self.deckNumber, ledNames[i], this.hotcueButtons[i]);
    }
    
    // Hotcue input handler
    this.hotcueInput = function(control, value, _status) {
        var n = MC2000.mapHotcue(control);
        if (n >= 1 && n <= 4 && this.hotcueButtons[n - 1]) {
            this.hotcueButtons[n - 1].input(0, 0, value, 0, this.hotcueButtons[n - 1].group);
        }
    };
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
        d.applyShiftState(MC2000.shift);
        
        // Connect component LEDs
        if (d.play && d.play.connect) d.play.connect();
        if (d.cue && d.cue.connect) d.cue.connect();
        if (d.sync && d.sync.connect) d.sync.connect();
        if (d.keylock && d.keylock.connect) d.keylock.connect();
        if (d.pfl && d.pfl.connect) d.pfl.connect();
        if (d.loopInBtn && d.loopInBtn.connect) d.loopInBtn.connect();
        if (d.loopOutBtn && d.loopOutBtn.connect) d.loopOutBtn.connect();
        
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
//////////////////////////////
MC2000.playButton = function(channel, control, value, status, group) {
    var d = MC2000.decks && MC2000.decks[group];
    if (d && d.play && d.play.input) {
        MC2000.debugLog("playButton: Using component");
        d.play.input(channel, control, value, status, group);
    } else {
        MC2000.debugLog("playButton: Using fallback");
        if (!MC2000.isButtonOn(value)) return;
        script.toggleControl(group, "play");
    }
};

MC2000.cueButton = function(channel, control, value, status, group) {
    var d = MC2000.decks && MC2000.decks[group];
    if (d && d.cue && d.cue.input) {
        MC2000.debugLog("cueButton: Using component");
        // Ensure shift state is applied
        d.applyShiftState(MC2000.shift);
        d.cue.input(channel, control, value, status, group);
    } else {
        MC2000.debugLog("cueButton: Using fallback");
        if (!MC2000.isButtonOn(value)) return;
        if (MC2000.shift) {
            engine.setValue(group, "cue_gotoandplay", 1);
        } else {
            engine.setValue(group, "cue_default", 1);
        }
    }
};

MC2000.syncButton = function(channel, control, value, status, group) {
    var d = MC2000.decks && MC2000.decks[group];
    if (d && d.sync && d.sync.input) {
        MC2000.debugLog("syncButton: Using component");
        d.applyShiftState(MC2000.shift);
        d.sync.input(channel, control, value, status, group);
    } else {
        MC2000.debugLog("syncButton: Using fallback");
        if (!MC2000.isButtonOn(value)) return;
        if (MC2000.shift) {
            script.toggleControl(group, "sync_enabled");
        } else {
            engine.setValue(group, "beatsync", 1);
        }
    }
};

MC2000.keylockButton = function(channel, control, value, status, group) {
    var d = MC2000.decks && MC2000.decks[group];
    if (d && d.keylock && d.keylock.input) {
        MC2000.debugLog("keylockButton: Using component");
        d.keylock.input(channel, control, value, status, group);
    } else {
        MC2000.debugLog("keylockButton: Using fallback");
        if (!MC2000.isButtonOn(value)) return;
        script.toggleControl(group, "keylock");
    }
};

MC2000.pflButton = function(channel, control, value, status, group) {
    var d = MC2000.decks && MC2000.decks[group];
    if (d && d.pfl && d.pfl.input) {
        d.pfl.input(channel, control, value, status, group);
    } else {
        if (!MC2000.isButtonOn(value)) return;
        script.toggleControl(group, "pfl");
    }
};

//////////////////////////////
// Track Gain knob          //
//////////////////////////////
MC2000.trackGain = function(channel, control, value, status, group) {
    var d = MC2000.decks && MC2000.decks[group];
    if (d && d.trackGain && d.trackGain.input) {
        d.trackGain.input(channel, control, value, status, group);
    } else {
        // Fallback: convert CC value 0-127 to 0-1
        engine.setParameter(group, "pregain", value / 127.0);
    }
};

//////////////////////////////
// Volume fader             //
//////////////////////////////
MC2000.volumeFader = function(channel, control, value, status, group) {
    var d = MC2000.decks && MC2000.decks[group];
    if (d && d.volume && d.volume.input) {
        d.volume.input(channel, control, value, status, group);
    } else {
        // Fallback: convert CC value 0-127 to 0-1
        engine.setParameter(group, "volume", value / 127.0);
    }
};

//////////////////////////////
// EQ controls              //
//////////////////////////////
MC2000.eqHigh = function(channel, control, value, status, group) {
    var d = MC2000.decks && MC2000.decks[group];
    if (d && d.eqHigh && d.eqHigh.input) {
        d.eqHigh.input(channel, control, value, status, group);
    } else {
        // Fallback: convert CC value 0-127 to 0-1
        var eqGroup = "[EqualizerRack1_" + group + "_Effect1]";
        engine.setParameter(eqGroup, "parameter3", value / 127.0);
    }
};

MC2000.eqMid = function(channel, control, value, status, group) {
    var d = MC2000.decks && MC2000.decks[group];
    if (d && d.eqMid && d.eqMid.input) {
        d.eqMid.input(channel, control, value, status, group);
    } else {
        // Fallback: convert CC value 0-127 to 0-1
        var eqGroup = "[EqualizerRack1_" + group + "_Effect1]";
        engine.setParameter(eqGroup, "parameter2", value / 127.0);
    }
};

MC2000.eqLow = function(channel, control, value, status, group) {
    var d = MC2000.decks && MC2000.decks[group];
    if (d && d.eqLow && d.eqLow.input) {
        d.eqLow.input(channel, control, value, status, group);
    } else {
        // Fallback: convert CC value 0-127 to 0-1
        var eqGroup = "[EqualizerRack1_" + group + "_Effect1]";
        engine.setParameter(eqGroup, "parameter1", value / 127.0);
    }
};

//////////////////////////////
// Master Controls          //
//////////////////////////////
MC2000.masterVolume = function(channel, control, value, status, group) {
    if (MC2000.masterVolumePot && MC2000.masterVolumePot.input) {
        MC2000.masterVolumePot.input(channel, control, value, status, group);
    } else {
        // Fallback: convert CC value 0-127 to 0-1
        engine.setParameter("[Master]", "gain", value / 127.0);
    }
};

MC2000.crossfader = function(channel, control, value, status, group) {
    if (MC2000.crossfaderPot && MC2000.crossfaderPot.input) {
        MC2000.crossfaderPot.input(channel, control, value, status, group);
    } else {
        // Fallback: convert CC value 0-127 to -1 to 1
        var normalized = (value / 127.0) * 2 - 1; // -1 (left) to 1 (right)
        engine.setValue("[Master]", "crossfader", normalized);
    }
};

MC2000.headphoneVolume = function(channel, control, value, status, group) {
    if (MC2000.headphoneVolumePot && MC2000.headphoneVolumePot.input) {
        MC2000.headphoneVolumePot.input(channel, control, value, status, group);
    } else {
        // Fallback: convert CC value 0-127 to 0-1
        engine.setParameter("[Master]", "headVolume", value / 127.0);
    }
};

MC2000.headphoneMix = function(channel, control, value, status, group) {
    if (MC2000.headphoneMixPot && MC2000.headphoneMixPot.input) {
        MC2000.headphoneMixPot.input(channel, control, value, status, group);
    } else {
        // Fallback: convert CC value 0-127 to 0-1
        engine.setParameter("[Master]", "headMix", value / 127.0);
    }
};

//////////////////////////////
// Pitch fader (absolute)   //
//////////////////////////////
MC2000.pitchFader = function(channel, control, value, status, group) {
    var d = MC2000.decks && MC2000.decks[group];
    if (d && d.rate && d.rate.input) {
        // Convert to parameter range 0..1; Mixxx maps to +/- rateRange
        d.rate.input(channel, control, value, status, group);
    } else {
        // value 0..127 -> rate control (-range..+range)
        var rateRange = engine.getValue(group, "rateRange");
        var norm = value / 127.0; // 0..1
        var scaled = (norm * 2.0 - 1.0) * rateRange; // -rateRange..+rateRange
        engine.setValue(group, "rate", scaled);
    }
};

//////////////////////////////
// Pitch Bend buttons       //
//////////////////////////////
MC2000.pitchBendUp = function(channel, control, value, status, group) {
    var d = MC2000.decks && MC2000.decks[group];
    if (d && d.pitchBendUpBtn && d.pitchBendUpBtn.input) {
        d.pitchBendUpBtn.input(channel, control, value, status, group);
    } else {
        engine.setValue(group, "rate_temp_up", MC2000.isButtonOn(value) ? 1 : 0);
    }
};

MC2000.pitchBendDown = function(channel, control, value, status, group) {
    var d = MC2000.decks && MC2000.decks[group];
    if (d && d.pitchBendDownBtn && d.pitchBendDownBtn.input) {
        d.pitchBendDownBtn.input(channel, control, value, status, group);
    } else {
        engine.setValue(group, "rate_temp_down", MC2000.isButtonOn(value) ? 1 : 0);
    }
};

//////////////////////////////
// Jog Wheel (scratch mode) //
//////////////////////////////
MC2000.jogTouch = function(channel, control, value, status, group) {
    var pressed = MC2000.isButtonOn(value); // NOTE: confirm transmissions (note on/off or 0x7F/0x00)
    if (pressed) {
        engine.scratchEnable(MC2000.deckIndex(group), MC2000.jogResolution, MC2000.jogRpm, MC2000.jogScratchAlpha, MC2000.jogScratchBeta);
        MC2000.deck[group].scratchMode = true;
    } else {
        engine.scratchDisable(MC2000.deckIndex(group));
        MC2000.deck[group].scratchMode = false;
    }
};

MC2000.jogWheel = function(channel, control, value, status, group) {
    // Relative delta around center 0x40
    MC2000.debugLog("jogWheel: value=" + value + " group=" + group);
    var delta = value - MC2000.jogCenter;
    if (MC2000.deck[group].scratchMode) {
        MC2000.debugLog("jogWheel: scratch mode active");
        engine.scratchTick(MC2000.deckIndex(group), delta);
    } else {
        // pitch bend style
        MC2000.debugLog("jogWheel: scratch mode inactive");
        engine.setValue(group, "jog", delta * MC2000.jogScale);
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
    var d = MC2000.decks && MC2000.decks[group];
    if (d && d.hotcueInput) {
        d.hotcueInput(control, value, status);
        return;
    }
    // Fallback legacy behavior
    if (!MC2000.isButtonOn(value)) return;
    var hotcueNumber = MC2000.mapHotcue(control);
    if (hotcueNumber < 1) return;
    var pos = engine.getValue(group, "hotcue_" + hotcueNumber + "_position");
    if (MC2000.shift) {
        if (pos !== -1) engine.setValue(group, "hotcue_" + hotcueNumber + "_clear", 1);
    } else {
        if (pos === -1) engine.setValue(group, "hotcue_" + hotcueNumber + "_activate", 1);
        else engine.setValue(group, "hotcue_" + hotcueNumber + "_gotoandplay", 1);
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
// Loop handlers (add later)//
//////////////////////////////
MC2000.loopIn = function(channel, control, value, status, group) {
    var d = MC2000.decks && MC2000.decks[group];
    if (d && d.loopInBtn && d.loopInBtn.input) {
        d.loopInBtn.input(channel, control, value, status, group);
        return;
    }
    if (!MC2000.isButtonOn(value)) return;
    if (MC2000.shift) engine.setValue(group, "reloop_toggle", 1);
    else engine.setValue(group, "loop_in", 1);
};

MC2000.loopOut = function(channel, control, value, status, group) {
    var d = MC2000.decks && MC2000.decks[group];
    if (d && d.loopOutBtn && d.loopOutBtn.input) {
        d.loopOutBtn.input(channel, control, value, status, group);
        return;
    }
    if (!MC2000.isButtonOn(value)) return;
    if (MC2000.shift) engine.setValue(group, "loop_exit", 1);
    else engine.setValue(group, "loop_out", 1);
};

MC2000.reloopExit = function(channel, control, value, status, group) {
    if (!MC2000.isButtonOn(value)) return;
    var loopEnabled = engine.getValue(group, "loop_enabled");
    if (loopEnabled) {
        engine.setValue(group, "reloop_toggle", 1); // Exit loop
    } else {
        engine.setValue(group, "reloop_toggle", 1); // Re-enable last loop
    }
};

// Optional handlers if you add them in XML later
MC2000.loopHalve = function(channel, control, value, status, group) {
    var d = MC2000.decks && MC2000.decks[group];
    if (d && d.loopHalveBtn) d.loopHalveBtn.input(channel, control, value, status, group);
    else if (MC2000.isButtonOn(value)) engine.setValue(group, "loop_halve", 1);
};

MC2000.loopDouble = function(channel, control, value, status, group) {
    var d = MC2000.decks && MC2000.decks[group];
    if (d && d.loopDoubleBtn) d.loopDoubleBtn.input(channel, control, value, status, group);
    else if (MC2000.isButtonOn(value)) engine.setValue(group, "loop_double", 1);
};

//////////////////////////////
// FX Unit Handlers         //
//////////////////////////////
// FX Unit 1
MC2000.fx1_effect1_toggle = function(channel, control, value, status, group) {
    var fx = MC2000.fxUnits && MC2000.fxUnits[1];
    if (fx && fx.effect1Toggle && fx.effect1Toggle.input) {
        fx.effect1Toggle.input(channel, control, value, status, group);
    } else {
        if (!MC2000.isButtonOn(value)) return;
        script.toggleControl("[EffectRack1_EffectUnit1_Effect1]", "enabled");
    }
};

MC2000.fx1_effect2_toggle = function(channel, control, value, status, group) {
    var fx = MC2000.fxUnits && MC2000.fxUnits[1];
    if (fx && fx.effect2Toggle && fx.effect2Toggle.input) {
        fx.effect2Toggle.input(channel, control, value, status, group);
    } else {
        if (!MC2000.isButtonOn(value)) return;
        script.toggleControl("[EffectRack1_EffectUnit1_Effect2]", "enabled");
    }
};

MC2000.fx1_effect3_toggle = function(channel, control, value, status, group) {
    var fx = MC2000.fxUnits && MC2000.fxUnits[1];
    if (fx && fx.effect3Toggle && fx.effect3Toggle.input) {
        fx.effect3Toggle.input(channel, control, value, status, group);
    } else {
        if (!MC2000.isButtonOn(value)) return;
        script.toggleControl("[EffectRack1_EffectUnit1_Effect3]", "enabled");
    }
};

// FX Unit 1 - Meta pots
MC2000.fx1_effect1_meta = function(channel, control, value, status, group) {
    var fx = MC2000.fxUnits && MC2000.fxUnits[1];
    if (fx && fx.effect1Meta && fx.effect1Meta.input) {
        fx.effect1Meta.input(channel, control, value, status, group);
    } else {
        engine.setParameter("[EffectRack1_EffectUnit1_Effect1]", "meta", value / 127.0);
    }
};

MC2000.fx1_effect2_meta = function(channel, control, value, status, group) {
    var fx = MC2000.fxUnits && MC2000.fxUnits[1];
    if (fx && fx.effect2Meta && fx.effect2Meta.input) {
        fx.effect2Meta.input(channel, control, value, status, group);
    } else {
        engine.setParameter("[EffectRack1_EffectUnit1_Effect2]", "meta", value / 127.0);
    }
};

MC2000.fx1_effect3_meta = function(channel, control, value, status, group) {
    var fx = MC2000.fxUnits && MC2000.fxUnits[1];
    if (fx && fx.effect3Meta && fx.effect3Meta.input) {
        fx.effect3Meta.input(channel, control, value, status, group);
    } else {
        engine.setParameter("[EffectRack1_EffectUnit1_Effect3]", "meta", value / 127.0);
    }
};

// FX Unit 2
MC2000.fx2_effect1_toggle = function(channel, control, value, status, group) {
    var fx = MC2000.fxUnits && MC2000.fxUnits[2];
    if (fx && fx.effect1Toggle && fx.effect1Toggle.input) {
        fx.effect1Toggle.input(channel, control, value, status, group);
    } else {
        if (!MC2000.isButtonOn(value)) return;
        script.toggleControl("[EffectRack1_EffectUnit2_Effect1]", "enabled");
    }
};

MC2000.fx2_effect2_toggle = function(channel, control, value, status, group) {
    var fx = MC2000.fxUnits && MC2000.fxUnits[2];
    if (fx && fx.effect2Toggle && fx.effect2Toggle.input) {
        fx.effect2Toggle.input(channel, control, value, status, group);
    } else {
        if (!MC2000.isButtonOn(value)) return;
        script.toggleControl("[EffectRack1_EffectUnit2_Effect2]", "enabled");
    }
};

MC2000.fx2_effect3_toggle = function(channel, control, value, status, group) {
    var fx = MC2000.fxUnits && MC2000.fxUnits[2];
    if (fx && fx.effect3Toggle && fx.effect3Toggle.input) {
        fx.effect3Toggle.input(channel, control, value, status, group);
    } else {
        if (!MC2000.isButtonOn(value)) return;
        script.toggleControl("[EffectRack1_EffectUnit2_Effect3]", "enabled");
    }
};

// FX Unit 2 - Meta pots
MC2000.fx2_effect1_meta = function(channel, control, value, status, group) {
    var fx = MC2000.fxUnits && MC2000.fxUnits[2];
    if (fx && fx.effect1Meta && fx.effect1Meta.input) {
        fx.effect1Meta.input(channel, control, value, status, group);
    } else {
        engine.setParameter("[EffectRack1_EffectUnit2_Effect1]", "meta", value / 127.0);
    }
};

MC2000.fx2_effect2_meta = function(channel, control, value, status, group) {
    var fx = MC2000.fxUnits && MC2000.fxUnits[2];
    if (fx && fx.effect2Meta && fx.effect2Meta.input) {
        fx.effect2Meta.input(channel, control, value, status, group);
    } else {
        engine.setParameter("[EffectRack1_EffectUnit2_Effect2]", "meta", value / 127.0);
    }
};

MC2000.fx2_effect3_meta = function(channel, control, value, status, group) {
    var fx = MC2000.fxUnits && MC2000.fxUnits[2];
    if (fx && fx.effect3Meta && fx.effect3Meta.input) {
        fx.effect3Meta.input(channel, control, value, status, group);
    } else {
        engine.setParameter("[EffectRack1_EffectUnit2_Effect3]", "meta", value / 127.0);
    }
};

// FX Unit 1 Wet/Dry encoder
MC2000.fx1_wetDry = function(channel, control, value, status, group) {
    var fx = MC2000.fxUnits && MC2000.fxUnits[1];
    if (fx && fx.wetDryEncoder && fx.wetDryEncoder.input) {
        fx.wetDryEncoder.input(channel, control, value, status, group);
    } else {
        // Fallback for relative encoder
        var currentMix = engine.getParameter("[EffectRack1_EffectUnit1]", "mix");
        if (value === 1) {
            engine.setParameter("[EffectRack1_EffectUnit1]", "mix", Math.max(0, currentMix - 0.05));
        } else if (value === 127) {
            engine.setParameter("[EffectRack1_EffectUnit1]", "mix", Math.min(1, currentMix + 0.05));
        }
    }
};

// FX Unit 2 Wet/Dry encoder
MC2000.fx2_wetDry = function(channel, control, value, status, group) {
    var fx = MC2000.fxUnits && MC2000.fxUnits[2];
    if (fx && fx.wetDryEncoder && fx.wetDryEncoder.input) {
        fx.wetDryEncoder.input(channel, control, value, status, group);
    } else {
        // Fallback for relative encoder
        var currentMix = engine.getParameter("[EffectRack1_EffectUnit2]", "mix");
        if (value === 1) {
            engine.setParameter("[EffectRack1_EffectUnit2]", "mix", Math.max(0, currentMix - 0.05));
        } else if (value === 127) {
            engine.setParameter("[EffectRack1_EffectUnit2]", "mix", Math.min(1, currentMix + 0.05));
        }
    }
};

//////////////////////////////
// Library handlers         //
//////////////////////////////
MC2000.ScrollVertical = function(channel, control, value, status, group) {
    // Verify this is being called for Library group
    if (group !== "[Library]") {
        MC2000.debugLog("ScrollVertical: Wrong group " + group);
        return;
    }
    
    if (MC2000.scrollVerticalEncoder && MC2000.scrollVerticalEncoder.input) {
        MC2000.debugLog("ScrollVertical: Using encoder component");
        MC2000.scrollVerticalEncoder.input(channel, control, value, status, group); 
    } else {
        MC2000.debugLog("ScrollVertical: Using fallback");
        // Fallback for relative encoder
        if (value === 1) {
            engine.setValue("[Library]", "MoveUp", 1);
        } else if (value === 127) {
            engine.setValue("[Library]", "MoveDown", 1);
        }
    }
};


//////////////////////////////
// Debug utilities          //
//////////////////////////////
// Dump current controller state for debugging
MC2000.debugDump = function() {
    MC2000.log("=== MC2000 Debug Dump ===");
    MC2000.log("Shift state: " + MC2000.shift);
    MC2000.log("Debug mode: " + MC2000.debugMode);
    MC2000.log("Decks initialized: " + (MC2000.decks ? "Yes" : "No"));
    MC2000.log("FX units initialized: " + (MC2000.fxUnits ? "Yes" : "No"));
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
// - Sampler deck controls (removed in favor of hotcues)
// - Advanced shift layers for alternate pad modes
// - Smart PFL auto-enable logic
// - Rate range cycling
// - Beat jump controls
// - Loop roll controls
// - Performance mode improvements
