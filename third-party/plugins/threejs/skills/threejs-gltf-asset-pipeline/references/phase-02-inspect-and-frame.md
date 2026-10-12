# Phase 2 — Inspect and frame

**Triggers:** an unfamiliar asset just loaded, "where is the mesh named X", writing camera position
or near/far by hand, "the model is clipped" / "camera is inside the model", any transform code
written before the hierarchy has been looked at.

## Dump the hierarchy before touching anything

Do not assume the tree shape. Recurse `obj.children` and print `position`/`rotation`/`scale` at each
node:

```js
function dumpObject(obj, lines = [], isLast = true, prefix = '') {
  const localPrefix = isLast ? '└─' : '├─';
  lines.push(
    `${prefix}${prefix ? localPrefix : ''}${obj.name || '*no-name*'} ` +
    `[${obj.type}] pos:${obj.position.toArray().map(n => n.toFixed(2))} ` +
    `rot:${obj.rotation.toArray().map(n => n.toFixed(2))} ` +
    `scale:${obj.scale.toArray().map(n => n.toFixed(2))}`
  );
  const newPrefix = prefix + (isLast ? '  ' : '│ ');
  const lastIndex = obj.children.length - 1;
  obj.children.forEach((child, i) => {
    dumpObject(child, lines, i === lastIndex, newPrefix);
  });
  return lines;
}

console.log(dumpObject(gltf.scene).join('\n'));
```

`load-gltf.html` gives exactly this `dumpObject` pattern as the way to see what actually came out of
an export before writing any code that assumes a shape. `[GLTF]` This matters because exporters
routinely inject wrapper nodes — see phase 3 — and because a "single mesh" asset is often several
nested `Group`s deep.

## Frame the camera off the box, not off a guess

```js
const box = new THREE.Box3().setFromObject(root);
const size = box.getSize(new THREE.Vector3());
const center = box.getCenter(new THREE.Vector3());

const maxDim = Math.max(size.x, size.y, size.z);
const distance = maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360));

camera.position.set(center.x, center.y, center.z + distance * 1.5);
camera.near = distance / 100;
camera.far = distance * 100;
camera.updateProjectionMatrix();

camera.lookAt(center);
```

`load-gltf.html` documents computing `Box3.setFromObject(root)` and deriving `getSize()`/
`getCenter()` from it, then using those to position the camera and set near/far, specifically as an
alternative to guessing. `[GLTF]` Guessed near/far values are the common cause of a camera that
starts inside the model or clips it at a distance that "worked" for a different asset.

## Order matters: inspect and frame before phase 3

Everything in phase 3 (scale/orientation/material fixes) depends on knowing the real hierarchy and
bounds first. Attempting a scale or rotation correction against an un-dumped tree risks fixing the
wrong node, or fixing a node that is itself a wrapper the exporter added (phase 3 covers exactly
that case).

### Unknown: none flagged for this phase

The mined material does not raise an open question specific to hierarchy-dumping or box-framing
themselves — the genuine unknowns (decoder encoding, shared-resource disposal, image-bitmap
disposal) live in phases 1 and 4 and are collected in `references/gotchas.md` section D. Nothing
here is asserted beyond what `load-gltf.html` states.
