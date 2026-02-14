# 3D Box Generator

A web-based parametric 3D box generator for 3D printing. Create custom boxes with adjustable dimensions, internal compartments, optional lids with text engraving/embossing, and more. Export directly to STL format for Bambu Studio or any 3D printing slicer.

## Features

- **Real-time 3D Preview** - See your box update live as you adjust parameters
- **Parametric Design** - Full control over dimensions, wall thickness, dividers, and border radius
- **Internal Dividers** - Add X and Z divisions to create compartments inside the box
- **Optional Lid** - Generate a matching lid with configurable lip height and printer tolerance
- **Text on Lid** - Engrave or emboss text and emoji onto the lid surface
- **Smart Generators** - Volume calculator, compartment calculator, printer bed optimizer, and division designer
- **STL Export** - Download ready-to-print STL files for box and lid separately
- **Save/Load** - Persist your designs in the browser across sessions
- **Fast** - All processing happens entirely in the browser

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open your browser to the URL shown in the terminal (usually `http://localhost:5173`)

### Build for Production

```bash
npm run build
npm run preview
```

## Usage

### Box Parameters

Use the control panel tabs to configure your box:

- **Width, Depth, Height** (10-200mm)
- **Wall Thickness** (1-10mm)
- **X Divisions** - Up to 10 dividers along the width
- **Z Divisions** - Up to 10 dividers along the depth

### Lid Options

- **Lip Height** (2-20mm) - How far the lip extends into the box
- **Tolerance** (0.1-1mm) - Gap for printer fit compensation
- **Text** - Add text or emoji to the lid surface
  - Size: 8-40mm
  - Depth: 0.3-2mm
  - Style: Engraved (cut in) or Embossed (raised)

### Generators

- **Volume Calculator** - Input a target volume (100-10,000 cm³) and get proportional dimensions
- **Compartment Calculator** - Define item dimensions and count, auto-generate a grid layout
- **Printer Bed Optimizer** - Select from 11 built-in printer presets (Bambu Lab, Prusa, Creality, Voron, etc.) or enter a custom bed size
- **Division Designer** - Specify exact compartment depths with configurable wall thickness

### 3D Preview

- Left click + drag to rotate
- Right click + drag to pan
- Scroll to zoom

### Export

Click the download buttons to export STL files. The box and lid are exported as separate files, auto-named with dimensions (e.g. `box_80x60x40.stl`, `lid_80x60x40.stl`).

## Tech Stack

- **React** + **TypeScript** - UI framework
- **Vite** - Build tool
- **Three.js** + **React Three Fiber** - 3D rendering
- **@jscad/modeling** - Parametric CAD operations
- **Tailwind CSS** + **shadcn/ui** - Styling

## License

This project is licensed under the [Mozilla Public License 2.0](LICENSE).
