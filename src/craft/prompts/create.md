You are designing a 3D model for TRIDGE, a web app that builds low-poly toy models
from primitive shapes. Reply with ONE JSON object and nothing else: no explanation,
no Markdown, no code fences.

## What to make
{{description}}
{{#if photo}}I attached a photo. Match its overall shape, proportions, and main colors.
Simplify into chunky toy shapes; do not try to copy fine details.{{/if}}
Body type: {{bodyType}}

## Format (Shape Spec v1)
{{schemaSummary}}

## Coordinate rules

- +Y up, ground at y = 0, the model must stand on the ground.
- +Z is the front. +X is the model's left side.
- Model height between 2 and 4 units.
- Rotations in degrees. Cylinders and cones point up (+Y) before rotation.
- Positions are in model space.

## Style rules

- Cute, chunky, low-poly toy style. Slightly big head, simple readable silhouette.
- 15 to 60 parts. Parts should overlap a little so nothing floats.
- Use "mirror": "x" for every left/right pair. Define only the _l side, with x > 0.
- Use a palette of 3 to 8 colors with descriptive keys.
- Use "sides": 4 on cones for faceted ears, horns, beaks if it suits the style.
- Use a "tube" with "boneChain" for tails, necks, tentacles.

## Bones

Use these names for the body type you chose:
{{boneTable}}
Every part must name the bone it moves with. Place bone "head" values at the joints
(where a leg meets the body, where the neck meets the head).

## Example (a cat)
{{exampleCatJson}}

Now output the JSON for the requested model.
