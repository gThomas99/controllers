# Denon MC2000 Mixxx Controller Mapping

**Version:** 0.1.0-alpha (Initial Implementation)  
**Author:** Graham Thomas  
**Date:** November 2025  
**Status:** ⚠️ ALPHA - Most features implemented but untested and potentially buggy

---

## Overview

This is a custom controller mapping for the **Denon MC2000** DJ controller for use with Mixxx DJ software. The mapping utilizes the Mixxx Components JS framework for a modern, maintainable architecture with comprehensive LED feedback support.

### Implementation Status

✅ **Implemented** (may have bugs)  
⚠️ **Partially Implemented**  
❌ **Not Implemented**

| Feature Category | Status | Notes |
|-----------------|--------|-------|
| Transport Controls | ✅ | Play, cue, sync, keylock with proper button types |
| Hotcues | ✅ | 4 hotcues per deck, shift-to-delete |
| Loop Controls | ✅ | In/out/reloop/double/halve |
| Mixer (Per-Channel) | ✅ | Volume, 3-band EQ, track gain |
| Master Section | ✅ | Crossfader, master volume, headphone controls |
| PFL/Monitor Cue | ✅ | Channel-specific LED codes |
| FX Units | ✅ | 2 units × 3 effects (toggle, meta, wet/dry) |
| Library Navigation | ✅ | Focus switching, vertical scroll encoder |
| Load Track | ✅ | Direct load to deck buttons |
| Pitch Bend | ⚠️ | Scaffolded, needs testing |
| Jog Wheels | ⚠️ | Basic structure, scratch mode incomplete |
| LED Feedback | ⚠️ | Custom protocol implemented, needs verification |
| Shift Layers | ⚠️ | Implemented for some controls, needs expansion |
| Samplers | ❌ | Removed in favor of hotcues |

---

## Files

- **`Denon-MC2000.midi.xml`** - MIDI mapping definitions (controls, MIDI codes)
- **`Denon-MC2000-scripts.js`** - JavaScript controller logic
- **`Denon-MC2000-README.md`** - This documentation file

---

## Installation

1. Copy all three files to your Mixxx controllers directory:
   - **Windows:** `%LOCALAPPDATA%\Mixxx\controllers\`
   - **macOS:** `~/Library/Application Support/Mixxx/controllers/`
   - **Linux:** `~/.mixxx/controllers/`

2. Ensure you have the Mixxx Components library:
   - `lodash.mixxx.js`
   - `midi-components-0.0.js`
   
   These should be in the same directory or already installed with Mixxx.

3. Restart Mixxx or reload controllers via **Preferences > Controllers**

4. Select **Denon MC2000** from the controller list and enable it

---

## Architecture

### Components-Based Design

This mapping uses the **Mixxx Components JS framework** for:
- Consistent button behavior (play, cue, toggle, push types)
- Automatic LED feedback via `engine.makeConnection()`
- Clean separation between component logic and MIDI handlers
- Easier maintenance and debugging

### LED Protocol

The MC2000 uses a custom LED protocol instead of standard MIDI output:

```javascript
MC2000.setLed(deckNumber, ledCode, status)
// status: 0/false = OFF (0x4B)
//         1/true  = ON  (0x4A)  
//         2       = BLINK (0x4C)

MC2000.setLed2(deckNumber, ledCode, status)  
// Special protocol for monitor cue (PFL) buttons
// status: 0x50 = ON, 0x51 = OFF
```

### Debug Mode

Enable verbose logging for troubleshooting:

```javascript
// In Denon-MC2000-scripts.js, line ~162
MC2000.debugMode = true;  // Set to false for production
```

When enabled, you'll see debug output like:
```
[MC2000] Init controller ...
[MC2000-DEBUG] Building components...
[MC2000-DEBUG] Decks created
[MC2000-DEBUG] playButton: Using component
```

---

## Control Mapping

### Transport (Per Deck)

| Control | Function | Shift Function | LED |
|---------|----------|----------------|-----|
| Play | Play/Pause | - | Play indicator |
| Cue | Cue (preview when held) | Go to cue & play | Cue indicator |
| Sync | Beat sync | Sync lock toggle | Sync enabled |
| Keylock | Master tempo lock | - | Keylock enabled |

### Hotcues (Per Deck)

| Pad | Normal | Shift |
|-----|--------|-------|
| 1-4 | Set/trigger hotcue | Delete hotcue |

**Note:** Sampler functionality was removed in favor of hotcue-only operation.

### Loop Controls (Per Deck)

| Control | Function | Shift Function |
|---------|----------|----------------|
| Loop In | Set loop in point | Reloop/Exit |
| Loop Out | Set loop out point | Exit loop |
| Loop Halve | Halve loop size | - |
| Loop Double | Double loop size | - |

### Mixer (Per Channel)

- **Volume Fader** - Channel volume
- **EQ High** - High frequency (3-band EQ)
- **EQ Mid** - Mid frequency
- **EQ Low** - Low frequency  
- **Track Gain** - Pregain/trim
- **PFL Button** - Headphone monitor cue (toggle)

### Master Section

- **Crossfader** - Deck crossfade
- **Master Volume** - Main output level
- **Headphone Volume** - Headphone output level
- **Headphone Mix** - Balance between master and PFL (cue)

### FX Units (2 Units)

Each unit has:
- **3 Effect Toggles** - Enable/disable effects (non-sequential MIDI codes!)
- **3 Effect Meta Pots** - Effect parameter control
- **Wet/Dry Encoder** - Effect mix (relative encoder, 0.05 step)

### Library Navigation

- **Focus Forward** (0x29) - Move between sidebar/tracklist
- **Focus Backward** (0x30) - Move between tracklist/sidebar
- **Scroll Vertical** (0x54) - Browse up/down (encoder)

### Load Track

- **Load Deck 1** (0x64 on channel 0x90)
- **Load Deck 2** (0x64 on channel 0x91)

---

## Known Issues & Bugs

### Critical

1. **MIDI Codes Unverified**
   - All MIDI note/CC codes need verification against actual hardware
   - Some codes marked as "TODO" or placeholders in XML
   - Test each control and update `Denon-MC2000.midi.xml` accordingly

2. **LED Feedback**
   - Custom LED protocol implemented but not tested
   - Some LEDs may not respond correctly
   - Monitor cue uses different protocol (setLed2) - verify behavior

3. **Jog Wheels**
   - Basic structure exists but scratch mode incomplete
   - Sensitivity and touch detection need tuning
   - Vinyl mode toggle not implemented

### Medium Priority

4. **Encoder Sensitivities**
   - FX wet/dry uses 0.05 step - may be too coarse/fine
   - Library scroll encoder may need adjustment
   - Pitch bend sensitivity not tuned

5. **Shift Layers**
   - Implemented for cue (gotoandplay), sync (lock toggle)
   - Loop In shift (reloop) and Loop Out shift (exit) implemented
   - Hotcue shift (delete) implemented
   - Other controls don't have shift functions yet

6. **Component Fallbacks**
   - All handlers have fallback code if components fail to initialize
   - Fallback code less tested than component code
   - Monitor which code path is active via debug logging

### Low Priority

7. **Performance Optimizations**
   - LED update rate not optimized
   - Connection callbacks could be more efficient
   - Consider throttling some operations

---

## Development Workflow

### Testing Changes

1. **Enable Debug Mode:**
   ```javascript
   MC2000.debugMode = true;
   ```

2. **Run Mixxx in Debug Mode:**
   ```powershell
   # Windows (from controllers directory)
   .\mixx-debug.bat
   ```

3. **Watch Console Output:**
   - Look for `[MC2000-DEBUG]` messages
   - Verify "Using component" vs "Using fallback" paths
   - Check for initialization messages

4. **Test Control:**
   - Press button/turn encoder on hardware
   - Verify console shows expected handler being called
   - Check Mixxx UI for expected behavior

5. **Update MIDI Codes:**
   - If control doesn't work, update `midino` in XML
   - Save and reload controller mapping
   - Test again

### Disabling Debug Mode

After development, disable verbose logging:

```javascript
MC2000.debugMode = false;  // Line ~162 in scripts.js
```

All `MC2000.debugLog()` calls will be silent, but `MC2000.log()` messages remain.

---

## Architecture Details

### File Organization

```javascript
Denon-MC2000-scripts.js structure:

1. Header & Component Shims (lines 1-50)
2. LED Constants & Mapping (lines 51-100)
3. LED Control Functions (setLed, setLed2)
4. Utility Helpers (isButtonOn)
5. Debug Logging (debugMode, log, debugLog)
6. Shift Management (toggleShift)
7. Initialization (init, shutdown)
8. Master Controls (buildMasterControls)
9. FX Units (FxUnit class, buildFxUnits)
10. Library Controls (buildLibraryControls)
11. Deck Components (Deck class constructor)
    - Transport buttons
    - Hotcues
    - Loop controls
    - Mixer controls
    - PFL button
12. Component Wiring (buildComponents)
13. Front-End Handlers (playButton, cueButton, etc.)
14. Mixer Handlers (volumeFader, eqHigh, etc.)
15. Loop Handlers (loopIn, loopOut, etc.)
16. Hotcue Handler (hotcuePad)
17. FX Handlers (fx1/2_effect1/2/3_toggle/meta)
18. Library Handlers (ScrollVertical)
19. Debug Utilities (debugDump)
20. TODO List
```

### Component Types Used

- **`components.Button`**
  - `types.play` - Play button (start when stopped, pause when playing)
  - `types.cue` - Cue button (preview, set point, return to cue)
  - `types.toggle` - Toggle on/off (PFL, keylock)
  - `types.push` - Momentary action (loop controls)

- **`components.Pot`** - Continuous knobs/faders (volume, EQ, gain)

- **`components.Encoder`** - Relative encoders (FX wet/dry, library scroll)

- **`components.HotcueButton`** - Hotcue pads (set, trigger, delete with shift)

---

## MIDI Code Reference

### Status Bytes

- `0x90` - Note On, Channel 1 (Deck 1)
- `0x91` - Note On, Channel 2 (Deck 2)
- `0xB0` - Control Change, Channel 1
- `0xB1` - Control Change, Channel 2
- `0xE0` - Pitch Bend, Channel 1
- `0xE1` - Pitch Bend, Channel 2

### Key MIDI Codes (Examples)

**Transport Deck 1/2:**
- Play: 0x43 (status 0x90/0x91)
- Cue: 0x42
- Sync: 0x6B
- Keylock: 0x06

**Load Track:**
- Both decks: 0x64 (different status bytes)

**FX Toggle (Non-Sequential!):**
- Effect 1: 0x15
- Effect 2: 0x12
- Effect 3: 0x13

**FX Meta Pots:**
- Unit 1: 0x55, 0x56, 0x50
- Unit 2: 0x59, 0x5A, 0x5B

**Library:**
- Focus Forward: 0x29
- Focus Backward: 0x30
- Scroll Vertical: 0x54

---

## LED Codes (Decimal)

```javascript
MC2000.leds = {
    play: 39,
    cue: 38,
    sync: 9,
    keylock: 8,
    cue1: 17,
    cue2: 19,
    cue3: 21,
    cue4: 23,
    loopin: 36,
    loopout: 64,
    monitorcue_l: 69,  // Deck 1 PFL
    monitorcue_r: 81,  // Deck 2 PFL
    fx1_1: 92,  // FX Unit 1, Effect 1
    fx1_2: 93,
    fx1_3: 94,
    fx2_1: 96,  // FX Unit 2, Effect 1
    fx2_2: 97,
    fx2_3: 98,
    samples_l: 35,  // (Not currently used)
    samples_r: 73   // (Not currently used)
};
```

---

## Troubleshooting

### Control Not Working

1. Check MIDI code in XML matches hardware MIDI output
2. Enable debug mode and check console for handler messages
3. Verify component is created in `buildComponents()`
4. Check that handler name in XML matches JS function name

### LED Not Lighting

1. Verify LED code in `MC2000.leds` object
2. Check `connect()` method is called for component
3. Verify `engine.makeConnection()` targets correct control
4. For PFL, ensure using `setLed2()` not `setLed()`

### Shift Not Working

1. Check shift button sends proper MIDI message
2. Verify `MC2000.toggleShift` is mapped in XML
3. Check component has `shift()` and `unshift()` methods
4. Verify `applyShiftState()` is called

### Component vs Fallback Code

Check debug output:
- "Using component" = Component framework working ✅
- "Using fallback" = Component failed, using basic logic ⚠️

If always using fallback:
1. Check component is created in constructor
2. Verify `buildComponents()` is called in `init()`
3. Check for JS errors in console

---

## Contributing

This is an initial alpha implementation. Contributions welcome:

1. **Test on actual hardware** - Verify MIDI codes and update XML
2. **Fix bugs** - Issues with LEDs, encoders, shift layers
3. **Improve jog wheels** - Scratch mode, sensitivity tuning
4. **Add features** - Beat jump, loop roll, etc.
5. **Optimize performance** - LED updates, connection efficiency

---

## License

This mapping is provided as-is for the Mixxx community. Feel free to modify and redistribute.

---

## Changelog

### v0.1.0-alpha (November 2025)

**Initial implementation:**
- ✅ Complete transport control architecture
- ✅ Hotcues with shift-to-delete (samplers removed)
- ✅ Loop controls with shift functions
- ✅ Full mixer section (volume, EQ, gain, crossfader)
- ✅ Master and headphone controls
- ✅ PFL buttons with custom LED protocol
- ✅ 2 FX units with toggles, meta pots, wet/dry encoders
- ✅ Library navigation (focus, scroll)
- ✅ Load track buttons
- ✅ Debug logging system
- ✅ Components-based architecture with LED feedback
- ⚠️ Jog wheel scaffolding (incomplete)
- ⚠️ MIDI codes unverified
- ⚠️ Many bugs expected

**Known Issues:**
- All features untested on hardware
- MIDI codes need verification
- LED feedback needs testing
- Jog wheels incomplete
- Shift layers need expansion

---

## Contact

**Author:** Graham Thomas  
**Version:** 0.1.0-alpha  
**Date:** November 2025

For Mixxx-related questions, see: https://mixxx.org/
