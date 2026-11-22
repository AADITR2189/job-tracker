# Job Tracker — Logo Guidelines

## 1. The logo
- **Idea:** four planning bars, shortest at the bottom, that also form the side view of a ship. Your planning board is the hull.
- **Versions:**
  - **Horizontal:** symbol + name side by side. Use this one by default.
  - **Stacked:** name under the symbol, for square spaces.
  - **Symbol only:** for app icons, favicons and small spaces.
  - **Small-size symbol:** three heavier bars, used only at 32 px and below.
- **Files** (all in this `brand/` folder):
  - `logo/`: the master drawings (SVG)
  - `exports/`: ready-to-use files. Black, white and green versions as SVG and PNG, plus the favicon and app-icon sets.
  - `presentation/slides/`: the logo shown on mockups

## 2. Clear space
Keep empty space around the logo on every side at least as tall as **one bar of the symbol** (1/8 of the symbol's height). The space grows and shrinks with the logo.

## 3. Minimum size
| Version | Screen | Print |
|---|---|---|
| Horizontal | 96 px wide | 25 mm wide |
| Stacked | 64 px wide | 18 mm wide |
| Symbol | 40 px; below that use the small-size symbol, down to 16 px | 8 mm (small-size symbol down to 5 mm) |

## 4. Colour
| Name | Use | HEX | RGB | CMYK (approx.) |
|---|---|---|---|---|
| **Deep Olive** | Logo, app icon background | `#2E3D28` | 46 61 40 | 25 0 34 76 |
| **Ink** | The name "Job Tracker" on light backgrounds | `#1F2A1C` | 31 42 28 | 26 0 33 84 |
| Sage | Accent colour in the app, never in the logo itself | `#A9B887` | 169 184 135 | 8 0 27 28 |
| Mist | Light backgrounds, splash screen | `#E8E9DF` | 232 233 223 | 0 0 4 9 |

There is no official Pantone colour. For printed items, ask the printer to match Deep Olive from a printed sample.

**Approved logo and background pairs:**
- green logo on white or Mist
- white logo on Deep Olive
- black logo on white, when only one colour is allowed
- white logo on dark photos, placed on a calm area

## 5. Typography
- **Name in the logo:** Inter Bold, already turned into shapes in the files. Never retype it.
- **Inside the app:** the system font, as it is now.
- **Licence:** Inter is free under the SIL Open Font License.

## 6. Don'ts
- Don't stretch, squash or rotate the logo.
- Don't change the colours outside the palette above.
- Don't add shadows, outlines, gradients or glows.
- Don't change the number of bars, their order or their spacing.
- Don't move or resize the parts of a lockup separately.
- Don't put the logo on busy backgrounds unless it sits in its green rounded square.

## 7. Notes
- This is a new, original drawing. Before using it publicly (beyond your team), it's worth paying for a professional trademark search.
- In the app, the logo is the source for every icon: `assets/logo.svg` (app icon) and `icons/favicon.svg` (small-size version). Running `node tools/generate-icons.js` rebuilds all PNG icons and splash screens from them.
