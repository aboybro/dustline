// Dustline look plan: a sun-baked desert solar farm. Six named colours plus the
// accent; the lighting does the rest. The same names are the CSS custom properties
// in index.html, so the page chrome and the 3D world agree.
export const PALETTE = {
  canvas: '#a8c8dd', // pale desert sky
  surface: '#d9a05b', // sunlit sand
  hairline: '#8a6f4d', // dry scrub / shadowed sand
  ink: '#2b1d12', // dark umber, text and gunmetal
  muted: '#b98a55', // dusty tan
  accent: '#ff7a1a', // blazing orange, the sun's colour
  panel: '#1e3a5f', // solar panel glass
  rust: '#b4552d', // rusted steel
  leaf: '#7a8a3a', // sparse desert scrub
};

export function shade(name) {
  return PALETTE[name];
}
