# Phase 3 — Custom passes

**Triggers:** writing your own fullscreen shader effect, `ShaderPass`, `tDiffuse`, "my custom pass
does nothing" / the chain silently breaks, passthrough vertex shader, sampling the previous pass's
output.

## The mandatory contract

Every custom post-processing pass is a plain object with a `uniforms` map, a vertex shader, and a
fragment shader, wrapped in `ShaderPass`: [MAN-post-processing]

```js
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const MyCustomShader = {
  uniforms: {
    tDiffuse: { value: null }, // mandatory — ShaderPass fills this with the previous pass's output
    // ... any other uniforms this effect needs, e.g. amount: { value: 0.5 }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      // ... transform color here
      gl_FragColor = color;
    }
  `,
};

const myPass = new ShaderPass(MyCustomShader);
composer.addPass(myPass); // before OutputPass, not after
```

Three parts of this are non-negotiable, per the manual: [MAN-post-processing]

1. **`uniforms.tDiffuse: { value: null }` must exist**, spelled exactly `tDiffuse`. `ShaderPass`
   looks for a uniform with this exact name and overwrites its `value` with the previous pass's
   render target texture every frame. Omit it, misspell it, or nest it wrong, and the pass has
   nothing to sample — the chain "silently breaks": no thrown error, just a pass that does nothing
   useful (or renders black/undefined) because it never received the upstream image.
2. **A passthrough vertex shader.** Unless the effect genuinely needs vertex-level displacement
   (rare for a fullscreen post pass), the vertex shader's only job is to pass `uv` through as `vUv`
   and project the fullscreen quad's position — exactly the boilerplate shown above.
3. **A fragment shader that samples `texture2D(tDiffuse, vUv)`.** This is how the pass reads what
   came before it in the chain. Any transformation (grain, colour grading, a custom vignette) happens
   after that sample, on the `vec4 color` it returns.

## Where the pass goes in the chain

`ShaderPass(MyCustomShader)` is added like any other effect pass — after `RenderPass`, and strictly
**before** `OutputPass`: [MAN-post-processing]

```js
composer.addPass(new RenderPass(scene, camera));
composer.addPass(myPass);          // custom pass: operates on linear-space / pre-output data
composer.addPass(new OutputPass()); // sRGB conversion + tone mapping happen here, last
```

Placing a custom pass after `OutputPass` means it operates on already sRGB-converted, tone-mapped
output — which is the same "double conversion" failure class the composer-ordering rule exists to
prevent (phase 2), just triggered by a custom pass instead of a bundled one.

## Multiple custom passes

Nothing in the sources states a special interaction when chaining more than one custom `ShaderPass`
together beyond the general composer contract: each pass's `tDiffuse` receives whatever the
immediately preceding pass wrote, in order. The same three-part contract (uniform, passthrough vertex
shader, fragment shader sampling `tDiffuse`) applies to each one independently.
