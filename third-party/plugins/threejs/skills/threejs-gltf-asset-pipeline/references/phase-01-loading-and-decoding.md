# Phase 1 — Loading and decoding

**Triggers:** first `.glb` load, "model won't load", a console error naming an extension
(`KHR_draco_mesh_compression`, `KHR_texture_basisu`, `EXT_meshopt_compression`), choosing between
glTF and OBJ, "how do I load a 3D model in three.js".

## Prefer glTF 2.0, and know why

The manual states glTF 2.0 is the recommended format, and gives the .glb (binary) form as the
recommended transport. `[LOAD3D]` OBJ is a legitimate fallback only when the asset genuinely has
none of: hierarchy, skeleton, or animation — the manual states OBJ has none of the three. `[GLTF]`
If any of those matter for the asset you're loading, that decision is effectively made for you.

## Wire decoders before the first load, not after

`GLTFLoader` lives in `three/addons`, not core:

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const loader = new GLTFLoader();

// Wire every decoder the asset might need BEFORE calling load/loadAsync.
loader.setDRACOLoader(new DRACOLoader());
loader.setKTX2Loader(new KTX2Loader().setTranscoderPath('/path/to/basis/').detectSupport(renderer));
loader.setMeshoptDecoder(MeshoptDecoder);
```

`docs/pages/GLTFLoader.html` documents `setDRACOLoader`, `setKTX2Loader`, and `setMeshoptDecoder` as
the three extension-decoder hooks; wiring them after the first `load` call is not a documented,
supported order. `[GLTFDOC]` Only wire the decoders a given asset actually uses — an unused
`DRACOLoader` instance is harmless but is one more thing to dispose of later.

## Load and read the full result shape

```js
const gltf = await loader.loadAsync(url);
scene.add(gltf.scene);
```

`gltf.scene` is what you almost always want, but it is not the only thing on the result. The docs
name the full shape: `scene`, `scenes`, `animations`, `cameras`, `asset`, `parser`, `userData`.
`[GLTFDOC]` `animations` matters even if this skill doesn't cover playback (see
`threejs-animation-system`) — its presence or absence tells you whether the source file exported
animation data at all, which is worth checking before assuming a rig will move.

If you need load progress across multiple assets, route them through a shared `LoadingManager` and
its `onProgress(url, itemsLoaded, itemsTotal)` callback:

```js
const manager = new THREE.LoadingManager();
manager.onProgress = (url, itemsLoaded, itemsTotal) => {
  console.log(`${url}: ${itemsLoaded} / ${itemsTotal}`);
};
const loader = new GLTFLoader(manager);
```

`[TEX]` `textures.html` documents `LoadingManager` and `onProgress` for exactly this purpose — it is
not glTF-specific, but it is the mechanism this skill relies on for multi-asset progress.

## Unknown: encoding the extensions this phase decodes

This phase only covers *runtime* decoder wiring — reading a Draco/KTX2/Meshopt-compressed file that
someone else produced. How to *produce* one (choosing compression settings, running
`gltf-transform` or `gltfpack`) is not documented anywhere in the sourced material; those are a
different toolchain and a different skill's concern. Don't infer encoding guidance from this phase.
