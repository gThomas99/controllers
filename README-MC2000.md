Denon MC2000 for Mixxx — custom mapping (starter)

This is a minimal, working skeleton to get your Denon MC2000 mapped with Mixxx. You will need to capture the real MIDI note/CC numbers from your hardware and replace the placeholder values in Denon-MC2000.midi.xml.

Files
- Denon-MC2000.midi.xml — the preset file that binds MIDI messages to script functions and LED outputs
- Denon-MC2000-scripts.js — Mixxx controller script implementing logic for those bindings

Install / Load
1) Put both files into your User Mapping folder (this folder):
   Windows: %LOCALAPPDATA%\Mixxx\controllers
2) Start Mixxx, open Preferences > Controllers
3) Select your Denon MC2000 on the left, choose "Denon MC2000 (Custom)" in the Load Mapping dropdown
4) Tick Enabled, then Apply

Capture the real MIDI codes
Use one of these methods to find each control's status (note/CC on channel) and midino (the note/CC number):
- Preferences > Controllers > your device > click "Open MIDI Wizard" and press/move a control
- Preferences > Controllers > enable your device > check "Show MIDI Bindings" and watch the log (View > Developer > Log)
- Use the built-in MIDI learning: map to a temporary control and note its code

Update placeholders
In Denon-MC2000.midi.xml, replace each TODO midino and, if needed, the status:
- Buttons usually send NOTE ON/OFF: status 0x9N (N is channel 0..F)
- Encoders/faders (absolute) send CC: status 0xB N
- Relative jog sends CC with deltas around 0x40
Examples:
- <status>0x90</status> and <midino>0x0B</midino> for a Deck 1 Play button on Note 0x0B
- <status>0xB1</status> and <midino>0x10</midino> for a Deck 2 pitch fader on CC 0x10

Script function mapping
Each <control> has <key>MC2000.someFunction</key>. Implemented handlers:
- playButton, cueButton, syncButton
- pitchFader (absolute CC)
- jogTouch (note on/off), jogWheel (relative CC)
- hotcuePad (uses a lookup inside scripts.js — expand mapHotcue)
- loopIn, loopOut
- shiftButton (toggleShift)

LEDs
The <outputs> section maps Mixxx control states to LEDs; fill real <midino>. You may add more outputs for hotcues, loops, sync, etc. Example keys:
- play_indicator, cue_indicator, sync_enabled, hotcue_X_enabled, loop_enabled

Common MC2000 specifics to verify
- Jog wheel: does it send touch as note or CC? Does rotation send 2’s complement deltas around 0x40?
- Button on values: 0x7F or 0x40? Adjust MC2000.isButtonOn in scripts.js accordingly
- Pitch fader range: set from Mixxx UI; pitchFader handler maps 0..127 linearly to rate

Quick test list
- Play toggles, play LED updates
- Cue sets/returns; with Shift: cue_gotoandplay
- Sync: one-shot; with Shift: toggle sync lock
- Pitch fader moves track rate
- Jog touch enables scratch; jog movement scratches; without touch, jog bends

Troubleshooting
- If nothing reacts: ensure the device is Enabled in Preferences and the mapping is loaded
- If wrong channel: update <status> 0x9N/0xBN to match your device’s channel for that side
- Use View > Developer > Log to print debug (MC2000.log)

Next steps
- Fill out hotcue pads (8 per deck) and LED outputs
- Add FX controls and sampler pads
- Add PFL, EQ, filter knob mappings
- Contribute back to the community when stable!
