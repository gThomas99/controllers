MIXXX DJ controller for Denon MC2000. The hardware is no longer producced but in my  opinion the build quality was very good for an entry level model and is worth maintaining.
Documentation for midi code mappings can be found on Denon's web site: https://cdn.inmusicbrands.com/denondj/legacy/mc2000/MC2000EM_ENG_CD-ROM_IM_v00.pdf

The controller is developed from https://github.com/RohanM/mixxx-denon-mc2000 and is not supported official by MIXXX

The code is mainly AI generated and helped with maining the large xml mapping file and understanding MIXXX documentation. 
I have used components.js for most mappings but the AI agent has produced verbose code:

The Shim section produces a simplified copy of the components library to stop the program crashing if the library is not found,
Mappings call a wrapper function in case component is not defined (these are about half way down in js file) which then call the real component functions,
The jog wheel are handled directly by js controller functions i.e. do not use a component
A debug console function has been added

It is likely I will simplify this but need to get the functions working first.

The AI agent has produced more detailed documentation on the controllers inner workings
