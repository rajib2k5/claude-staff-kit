# Phase 4 — Resource lifecycle

**Triggers:** SPA route change, unloading a model, swapping one asset for another in the same view,
memory growth over time, "how do I dispose of a three.js scene", tab/panel that loads a new model
each time it opens.

## Accept the premise: three.js cannot auto-free WebGL resources

Nothing here happens for free. Removing an object from the scene graph does not release its GPU
memory — `[CLEANUP]` dispose has to be called explicitly, for every resource, every time.

## The four dispose kinds

- `texture.dispose()`
- `geometry.dispose()`
- `material.dispose()`
- `renderTarget.dispose()`

`[CLEANUP]` These are the full set named by the manual. There is no fifth "just dispose the mesh"
shortcut — a `Mesh` bundles a geometry and a material, and disposing the mesh object itself does not
dispose either of them.

## Wrap every load in a per-file ResourceTracker

```js
class ResourceTracker {
  constructor() {
    this.resources = new Set();
  }

  track(resource) {
    if (!resource) return resource;

    if (Array.isArray(resource)) {
      resource.forEach((r) => this.track(r));
      return resource;
    }

    if (resource.dispose || resource instanceof THREE.Object3D) {
      this.resources.add(resource);
    }

    if (resource instanceof THREE.Object3D) {
      this.track(resource.geometry);
      this.track(resource.material);
      this.track(resource.children);
    } else if (resource instanceof THREE.Material) {
      // Walk every property value looking for textures.
      for (const value of Object.values(resource)) {
        if (value instanceof THREE.Texture) this.track(value);
      }
      // Walk custom-shader uniforms too.
      if (resource.uniforms) {
        for (const uniform of Object.values(resource.uniforms)) {
          if (uniform && uniform.value instanceof THREE.Texture) {
            this.track(uniform.value);
          }
        }
      }
    }

    return resource;
  }

  untrack(resource) {
    this.resources.delete(resource);
  }

  dispose() {
    for (const resource of this.resources) {
      if (resource instanceof THREE.Object3D) {
        resource.parent?.remove(resource);
      }
      if (resource.dispose) resource.dispose();
    }
    this.resources.clear();
  }
}
```

`[CLEANUP]` This is the manual's full `ResourceTracker` shape: `track()` recurses `Object3D` into
`geometry`/`material`/`children`, walks a material's own property values for `Texture` instances,
and separately walks `material.uniforms[*].value` for textures used by custom shaders. `dispose()`
removes every tracked `Object3D` from its parent, then calls `.dispose()` on anything that has one.

Use it per load:

```js
const tracker = new ResourceTracker();
const track = tracker.track.bind(tracker);

const gltf = await loader.loadAsync(url);
track(gltf.scene);
scene.add(gltf.scene);

// ...later, on route change or component unmount:
tracker.dispose();
```

`[CLEANUP]` One tracker per loaded file is the documented pattern specifically so that concurrent
loads can be unloaded independently of each other.

## Call dispose from the route-change / unmount hook

> Missing disposal on SPA route change is named as the top cause of three.js memory leaks. `[CLEANUP]`

Whatever your routing/component framework calls "the view is going away" — that is where
`tracker.dispose()` belongs. It is not optional cleanup; it is the single most-cited leak source in
the sourced material.

## Objects attached after load need deliberate tracking

If something is attached to the loaded hierarchy *after* the initial load — a prop placed in a
character's hand, a decal added post-hoc — it is not automatically covered by the tracker that
tracked the original load. `[CLEANUP]` Track it explicitly (`track(theNewObject)`) or it survives
`dispose()` and becomes its own small leak.

## Unknown: shared resources, and what "special handling" means for image bitmaps

Two things the sourced material names but does not resolve:

1. **Shared-resource ownership.** If a geometry or material is shared across two `ResourceTracker`s
   (e.g., an instanced prop reused by two loaded characters), disposing one tracker disposes that
   resource out from under the other. The manual flags this risk explicitly but gives no ownership
   or reference-counting pattern to avoid it. `[CLEANUP]` If your scene shares resources across
   loads, you need to design that ownership yourself — don't assume the tracker pattern handles it.
2. **Image bitmap disposal.** The `GLTFLoader` docs state that image bitmaps are not automatically
   garbage-collected and "need special disposal handling," without saying what that handling is.
   `[GLTFDOC]` Treat this as an open gap: the `ResourceTracker`'s `texture.dispose()` call is the
   documented general mechanism, but no source confirms it is sufficient for every image-bitmap case
   glTF can produce.

Both are carried forward, not silently dropped — see `references/gotchas.md` section D.
