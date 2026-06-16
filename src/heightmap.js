// heightmap.js — a Leaflet GridLayer that recolours the terrain-elevation tiles
// into a classic hypsometric (atlas-style) height map: blue (below sea) -> green
// -> yellow/tan -> brown -> white peaks. Reuses the decoded terrain tiles.
import { getDecodedTile } from './terrain.js';

// elevation (m) -> RGB stops, interpolated linearly
const STOPS = [
  [-430, [38, 78, 120]],   // Dead Sea depression — deep blue
  [-50, [54, 110, 150]],   // below sea — blue
  [0, [46, 139, 87]],      // sea level — sea green
  [150, [116, 195, 101]],  // lowland — green
  [400, [214, 211, 90]],   // hills — yellow-green
  [700, [201, 160, 86]],   // highland — tan
  [1000, [156, 110, 64]],  // mountains — orange-brown
  [1400, [110, 78, 60]],   // high mountains — dark brown
  [2000, [245, 245, 245]], // peaks — white
];

export function colorForElevation(e) {
  if (e <= STOPS[0][0]) return STOPS[0][1];
  const last = STOPS[STOPS.length - 1];
  if (e >= last[0]) return last[1];
  for (let i = 1; i < STOPS.length; i++) {
    if (e <= STOPS[i][0]) {
      const [e0, c0] = STOPS[i - 1];
      const [e1, c1] = STOPS[i];
      const t = (e - e0) / (e1 - e0);
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
    }
  }
  return last[1];
}

export function createHeightLayer() {
  const HeightLayer = L.GridLayer.extend({
    createTile(coords, done) {
      const tile = L.DomUtil.create('canvas');
      const size = this.getTileSize();
      tile.width = size.x;
      tile.height = size.y;
      const ctx = tile.getContext('2d');
      getDecodedTile(coords.z, coords.x, coords.y)
        .then((elev) => {
          if (!elev || elev === 'nodata') { done(null, tile); return; }
          const img = ctx.createImageData(size.x, size.y);
          for (let i = 0; i < elev.length; i++) {
            const c = colorForElevation(elev[i]);
            const o = i * 4;
            img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
          }
          ctx.putImageData(img, 0, 0);
          done(null, tile);
        })
        .catch((err) => done(err, tile));
      return tile;
    },
  });
  return new HeightLayer({ opacity: 0.72, tileSize: 256, maxNativeZoom: 13, minZoom: 6, attribution: 'Elevation: AWS Terrain Tiles' });
}
