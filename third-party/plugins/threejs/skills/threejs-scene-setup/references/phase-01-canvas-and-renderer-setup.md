# Phase 1 — Canvas and renderer setup

**Triggers:** first canvas, empty page, `file://` CORS errors, "nothing loads", npm vs importmap,
`new THREE.WebGLRenderer`, canvas stuck at 300x150, "the canvas is tiny", `#c`, CDN version
mismatch, `three/addons/` import errors.

## Serve over a local HTTP server

Opening the HTML file directly (`file://…`) breaks texture and model loading because the browser
enforces CORS against the `file://` origin. The manual's `setup` page states a local server is
required from the very first example, before any asset loading is even introduced — this is not
just an asset-pipeline concern, it applies to the minimal scene too. Use any static server (the
manual mentions `servez`) or your framework's dev server. [MAN-setup]

## Install: npm or importmap, but pin both consistently

Two supported paths, per `installation`: [MAN-install]

**npm**

```bash
npm install --save three
```

```js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
```

**importmap** (no bundler)

```html
<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.185.1/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.185.1/examples/jsm/"
  }
}
</script>
<script type="module">
  import * as THREE from 'three';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
</script>
```

The load-bearing detail: `"three"` and `"three/addons/"` **must** point at the same version and the
same CDN. Addons (`examples/jsm/*`) are version-coupled to core internals; mixing a pinned `three`
with an unpinned or differently-versioned `three/addons/` is a documented way to get subtle breakage
at the module boundary. TypeScript types for three.js are community-maintained, not shipped by the
project itself. [MAN-install]

## Construct the renderer against a queried canvas

```js
function main() {
  const canvas = document.querySelector('#c');
  const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
  // ...
}
```

Passing an existing `<canvas>` (rather than letting `WebGLRenderer` create one and appending it) is
the pattern used throughout the manual — it puts the CSS contract in your hands. `antialias: true`
is the manual's standard constructor option for the getting-started examples. [MAN-creating-scene]

## The CSS contract

The default `<canvas>` element, with no CSS applied, is 300×150 pixels. Everything downstream
(aspect ratio, resize logic, DPI handling) depends on the canvas actually being sized by its
container instead of sitting at that default. The manual's baseline CSS: [MAN-fundamentals]

```css
html, body {
  margin: 0;
  height: 100%;
}
#c {
  width: 100%;
  height: 100%;
  display: block;
}
```

`display: block` matters — an inline-default canvas picks up baseline whitespace from its parent
that throws off pixel-perfect sizing.

## Minimal end-to-end skeleton

Putting phase 1 together (resize wiring and the render loop are phase 2, colour management is
phase 3):

```js
import * as THREE from 'three';

function main() {
  const canvas = document.querySelector('#c');
  const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });

  const fov = 75, aspect = 2, near = 0.1, far = 5;
  const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
  camera.position.z = 2;

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1)); // placeholder — see materials-lighting-shadows

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial({ color: 0x44aa88 });
  scene.add(new THREE.Mesh(geometry, material));

  function render(time) {
    renderer.render(scene, camera);
  }
  renderer.setAnimationLoop(render);
}

main();
```

This intentionally omits resize handling and DPI correction — see phase 2 — so treat it as the
starting skeleton, not a finished setup. [MAN-creating-scene]
