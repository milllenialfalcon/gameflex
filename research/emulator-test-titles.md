# EmulatorJS Test Title Recommendations

## Sega Master System (genesis_plus_gx)
| Title | Region | Why | Format | Known Issues |
|-------|--------|-----|--------|--------------|
| Sonic the Hedgehog 2 | USA/Europe | Simple, iconic, boots quickly | .sms | None reported |
| Phantasy Star | Japan | Larger ROM, saves, tests mapper | .sms | Save functionality may need verification |

## Sega Game Gear (genesis_plus_gx)
| Title | Region | Why | Format | Known Issues |
|-------|--------|-----|--------|--------------|
| Sonic the Hedgehog 2 | USA/Europe | Simple, color demo, quick boot | .gg | None reported |
| Shining Force | Japan | Larger ROM, tests bank switching | .gg | Save functionality may need verification |

## Sega 32X (picodrive)
| Title | Region | Why | Format | Known Issues |
|-------|--------|-----|--------|--------------|
| Knuckles' Chaotix | USA/Europe | Simple 32X title, tests basic 32X boot | .32x | None reported |
| Doom | USA/Europe | Heavy 3D, stresses 32X capabilities | .32x | Performance may vary in WASM |

## Sony PlayStation 1 (pcsx_rearmed - HLE BIOS)
| Title | Region | Why | Format | Known Issues |
|-------|--------|-----|--------|--------------|
| Crash Bandicoot | USA | Simple 2D platformer, tests HLE BIOS | .bin/.cue | Some titles may need real BIOS |
| Metal Gear Solid | USA | Complex 3D, tests CPU/GPU synchronization | .bin/.cue | Known to work with HLE BIOS but verify |

## Nintendo 64 (mupen64plus_next - WebGL2, no threads)
| Title | Region | Why | Format | Known Issues |
|-------|--------|-----|--------|--------------|
| Super Mario 64 | USA/Europe | Simple 3D, tests basic boot and controls | .z64 | Performance limited without threads |
| The Legend of Zelda: Ocarina of Time | USA/Europe | Complex 3D, tests microcode and RSP | .z64 | Known microcode issues; may require specific core options |

## Nintendo DS (desmume2015 or melonDS - no BIOS)
| Title | Region | Why | Format | Known Issues |
|-------|--------|-----|--------|--------------|
| New Super Mario Bros. | USA/Europe | Simple 2D, tests basic DS functionality | .nds | Touchscreen input may need verification |
| Mario Kart DS | USA/Europe | 3D racing, tests GPU and multiplayer | .nds | Wireless features untested; performance may vary |

## NEC PC Engine / TurboGrafx-16 (mednafen_pce - HuCard)
| Title | Region | Why | Format | Known Issues |
|-------|--------|-----|--------|--------------|
| Bonk's Adventure | USA/Europe | Simple platformer, tests HuCard boot | .pce | None reported |
| Ys Book I & II | Japan | Larger RPG, tests save and memory mapper | .pce | CD titles require BIOS (not recommended for testing) |

## Atari 2600 (stella2014)
| Title | Region | Why | Format | Known Issues |
|-------|--------|-----|--------|--------------|
| Pitfall! | USA | Simple, iconic, tests basic TIA | .a26 | None reported |
| Star Raiders | USA | Complex, uses bank switching and RAM | .a26 | Save functionality may need verification |

## Atari 7800 (prosystem)
| Title | Region | Why | Format | Known Issues |
|-------|--------|-----|--------|--------------|
| Ballblazer | USA/Europe | Simple, tests MARIA chip | .a78 | None reported |
| Food Fight | USA/Europe | Larger ROM, tests cartridge RAM | .a78 | Save functionality may need verification |

## Arcade (fbneo)
| Title | Region | Why | Format | Known Issues |
|-------|--------|-----|--------|--------------|
| Pac-Man | Worldwide | Simple, tests basic CPU and sound | ZIP (fbneo romset) | Requires correct FBNeo romset |
| Street Fighter II: The World Warrior | USA/Japan | Complex, tests CPS1 chip and multiplayer | ZIP (fbneo romset) | Neo Geo titles require neogeo.zip BIOS |

## General Cautions
- BIOS requirements: PS1 titles may work with HLE BIOS but some need real BIOS; PC Engine CD titles require BIOS; Neo Geo titles need neogeo.zip.
- Romset version: FBNeo requires matching romset version; use latest FBNeo DAT files for reference.
- Performance expectations: PS1, N64, and NDS cores in WASM without threads may have performance limitations; test with lightweight titles first.
- Save functionality: Verify if save states or in-game saves work for titles that use them.
- Unverified: Where unsure about specific core behavior, note as unverified rather than guessing.
## Claude review (2026-10-12)

Written by OpenCode via the OpenRouter free router. Claude corrected these entries:
- PC Engine: **Ys Book I & II is a CD-ROM² title** and needs a BIOS, so it can't be a HuCard test. Use **Street Fighter II' Champion Edition** (20-Mbit HuCard with a special bank-switching mapper) as the stress title instead.
- Atari 2600: **Star Raiders** is a standard 4K cartridge that needs the keypad controller, so it doesn't test bank switching. Use **Pitfall II: Lost Caverns** (DPC coprocessor chip) as the stress title instead.
- PS1: Crash Bandicoot is a 3D platformer, not 2D; it's still a good boot test. Metal Gear Solid spans two discs, so use disc 1 only (`.cue`/`.bin`, or a single `.chd`).
- Arcade: the neogeo.zip note applies to Neo Geo games generally, not to Street Fighter II (CPS1). Pac-Man and SF2 both need romsets matching the FBNeo version bundled with EmulatorJS 4.2.3.
- Everything else is plausible but not tested against these cores.
