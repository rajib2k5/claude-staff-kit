# Phase 2 — Texture budgeting

**Triggers:** texture memory, VRAM budget, loading textures with a progress bar, wrap/repeat/offset,
pixel-art textures look blurry, NPOT warnings, `CanvasTexture`, dynamic/procedural textures.

## Load with TextureLoader under a LoadingManager

```js
const manager = new THREE.LoadingManager();
manager.onProgress = (url, itemsLoaded, itemsTotal) => {
  progressBar.value = itemsLoaded / itemsTotal;
};

const loader = new THREE.TextureLoader(manager);
const colorMap = loader.load('brick-color.jpg');
const normalMap = loader.load('brick-normal.jpg');
```

Batch every texture (and any other manager-aware loader) a single scene needs under one
`LoadingManager` so `onProgress` reflects the whole load, not one file.

## The memory formula — the single most actionable number here

Texture VRAM cost is:

```
bytes = width * height * 4 * 1.33
```

**File compression is irrelevant to this number.** A documented example: a 157 KB JPEG at
3024×3761 pixels costs about 60 MB of VRAM once uploaded to the GPU, regardless of how small the
file on disk is. The lever is always **pixel dimensions**, never file size:

```js
// wrong instinct: "the file is only 200KB, it's fine"
// right check: 3024 * 3761 * 4 * 1.33 ≈ 60,600,000 bytes ≈ 58 MB

function textureVRAMBytes(width, height) {
  return width * height * 4 * 1.33;
}
```

Before shipping a texture set, sum this across every map on every material (color, normal,
roughness, metalness, ao, …) and check the total against a real per-device VRAM budget — not
against the total size of the asset folder.

## Wrap, repeat, offset, rotation

```js
texture.wrapS = THREE.RepeatWrapping;   // or ClampToEdge, MirroredRepeat
texture.wrapT = THREE.RepeatWrapping;
texture.repeat.set(4, 4);
texture.offset.set(0.5, 0);
texture.center.set(0.5, 0.5);
texture.rotation = Math.PI / 4;
```

`RepeatWrapping` tiles, `ClampToEdge` stretches the edge pixel, `MirroredRepeat` tiles with an
alternating flip. `center` + `rotation` rotate around a pivot other than the texture's corner.

## Filter selection

```js
texture.magFilter = THREE.NearestFilter;              // pixel art — no blur when magnified
texture.minFilter = THREE.LinearMipmapLinearFilter;    // best-quality mipmapped minification, also the most expensive
```

- **`magFilter`**: `NearestFilter` for pixel art (preserves hard pixel edges when the texture is
  magnified); `LinearFilter` otherwise.
- **`minFilter`**: choose a mipmapped filter (`LinearMipmapLinearFilter` is the best-quality, most
  expensive option) so minification doesn't shimmer/alias.

## CanvasTexture for dynamic content

For textures generated or updated at runtime (canvas-drawn UI, procedural patterns, video-adjacent
effects), use `CanvasTexture` and flip `needsUpdate` every time the backing canvas changes:

```js
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
const canvasTexture = new THREE.CanvasTexture(canvas);

function updateCanvasTexture() {
  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillText(new Date().toLocaleTimeString(), 10, 50);
  canvasTexture.needsUpdate = true; // required — the GPU copy does not auto-refresh
}
```

Non-power-of-two (NPOT) canvas/texture dimensions affect which filtering/wrapping modes are valid —
keep this in mind when sizing a dynamically-drawn canvas that will also tile or mipmap.

## Cross-origin loads

Cross-origin textures require CORS headers from the host; most hosts do not send them, and a failed
cross-origin load does not raise a loud, obvious error. If a texture silently never appears, check
this before anything else.
