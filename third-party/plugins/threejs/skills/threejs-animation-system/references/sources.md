# Sources

Everything in this skill traces to one of these. Nothing here is asserted from general model
knowledge; where a source is silent, the reference files say so explicitly (see `gotchas.md`
section D).

Pinned at **three.js r185** (npm `three@0.185.1`), mined via the scout doc-mining pass saved at
`/home/claude/scout/threejs-research.md` (fetch method: WebFetch, run date 2026-08-06).

| Tag | Source | Type | Access | Confidence | Grounds |
|---|---|---|---|---|---|
| `[MAN-ANIM]` | [Animation System](https://threejs.org/manual/en/animation-system.html) | official-docs | fetched | high | Clip/Track/Mixer/Action model; `AnimationMixer` construction against a root; `AnimationClip.findByName`; `clipAction().play()`; the mandatory per-frame `mixer.update(clock.getDelta())`; `crossFadeTo`, `fadeIn`, `weight`, `timeScale`; `mixer.timeScale = 0` as global pause |
| `[DOC-MIXER]` | [AnimationMixer docs](https://threejs.org/docs/pages/AnimationMixer.html) | official-docs | fetched | high | `clipAction`/`update`/`uncacheClip`/`uncacheRoot`/`uncacheAction` signatures; the stop-actions-first requirement before uncaching |
| `[MAN-MORPH]` | [Optimizing — lots of objects, animated](https://threejs.org/manual/en/optimize-lots-of-objects-animated.html) | official-docs | fetched | high | `morphAttributes.position`/`.color` on merged geometry; `mesh.morphTargetInfluences`; why merging forfeits per-object movement and morph targets are the documented alternative |
| `[DOC-BUFGEO]` | [BufferGeometry docs](https://threejs.org/docs/api/en/core/BufferGeometry.html) | official-docs | fetched | high | the rule that `morphAttributes` cannot change after first render; dispose-and-rebuild as the required workaround |
| `[MAN-GLTF]` | [Loading a .gltf file](https://threejs.org/manual/en/load-gltf.html) | official-docs | fetched | medium | where `gltf.animations` comes from and its relationship to `gltf.scene` as the mixer root |

## Deliberate exclusions

- **Skinning, `Bone`, and `SkinnedMesh` docs pages** were not walked as their own topic during
  scouting. `[MAN-ANIM]` covers the mixer that drives clips, not the rig those clips move — see
  `gotchas.md` section D.
- **GSAP / Tween.js** are third-party animation libraries sometimes used for camera or DOM
  choreography alongside three.js scenes. They are not documented on threejs.org and are explicitly
  out of scope for this skill.
- **IK, ragdoll, procedural-animation, and navmesh-motion libraries** are named only in
  `libraries-and-plugins.html` as third-party ecosystem entries with no usage guidance, and are out
  of scope here for the same reason `react-force-graph-react-integration` excludes upstream
  force-graph READMEs: reaching past the authority for this skill's boundary risks documenting
  behavior this skill doesn't actually own.
- **Physics-driven motion** is explicitly not part of three.js core (`manual/en/physics.html` names
  third-party engines — Rapier, Jolt, PhysX, cannon-es, Ammo — for that job) and is out of scope.

## Provenance note

This skill's capability map, procedural seed, and scope boundaries were carried forward verbatim
from the validated skill-brief (skillsmith `skill-scout` portfolio manifest, tier: plugin,
`threejs-animation-system`, rank 7) and cross-checked against the saved doc-mining research file
rather than re-fetched, per the stage 2-5 substitution this skill was built under.
