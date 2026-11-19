# Testing TRIDGE

Two kinds of checks: the automatic ones, and a short list to try by hand.

## Automatic checks

```bash
npm test         # about 450 unit tests, a few seconds
npm run lint     # code checks
npm run build    # type check, production build, and a size check on dist/
```

The unit tests cover, among other things: Shape Spec checking and repair, the Craft builder (part and triangle counts for every template), the low-poly steps (simplifying and colour palette), the prompt parser in English and Indonesian, every animation for every body type, skin weights adding up to one, the exporters, project saving and `.tridge` files, and the first-run tour. One test builds every Craft template, plays every move, exports a GLB and checks it with the official Khronos glTF validator.

## Manual checklist (about 15 minutes)

Use a current Chrome or Edge first. Tick each line. If something fails, note the step and what you saw.

### Start
- [ ] The page opens with a small fox on a pedestal and a short **tour** (three steps). **Skip** closes it and it does not come back after a reload. **Help, then Show the tour again** brings it back.
- [ ] Switch the theme (sun and moon button): light, dark and system all look right.

### 1. Input
- [ ] **From photo:** drop a picture of one object on a plain background. Try **Remove background**; **Undo** and **Show original** work.
- [ ] A file that is not a picture, or a picture over 10 MB, gives a clear message.
- [ ] **From text:** type "a cute orange cat". Pressing the button shows progress, then pictures to choose from. A busy provider says so plainly and offers another.
- [ ] **Craft:** pick **Cat**. A model appears straight away. Change a setting; the model follows. **Edit** lets you pick a part and move it with the handles. Undo and redo work.
- [ ] **Craft, Ask Claude:** **Copy prompt** works. Pasting a broken answer gives an explanation, not a crash.

### 2. Generate
- [ ] With a picture ready, **Generate** shows which free model is online. If TRELLIS is out of allowance or offline, it falls back to Stable Fast 3D, and the screen says that it did.
- [ ] **Make 2.5D relief** works without internet once the depth model has downloaded.
- [ ] When a model arrives it appears in the viewer with a small celebration (none if reduced motion is on).

### 3. Low poly
- [ ] Moving **Detail** changes the triangle count and the shape. **Ultra low / Low / Medium** presets work.
- [ ] Before and after view: drag the divider. Palette swatches can be recoloured.

### 4. Rig and animate
- [ ] Open the **Rig** step. **Place skeleton** puts joints on the model. Drag a joint (on a phone, near it is enough). **Rig it** finishes; **Test pose** moves the model.
- [ ] Open **Animate**. Type "walk slowly then jump high" and press **Play it**. The model walks, then jumps, with a smooth join.
- [ ] Type "kucing jalan pelan terus loncat tinggi": the same result.
- [ ] Type nonsense: you get a friendly reply with moves to tap.
- [ ] Scrub the timeline, change the speed, reorder and remove steps. **Save this frame** keeps a pose.
- [ ] On a model with no skeleton the moves become whole-model motions and a note says so.

### 5. Export
- [ ] **GLB:** download, then open the file in another viewer (for example https://gltf-viewer.donmccurdy.com or Blender). The skeleton is there and the animations play.
- [ ] **STL** opens in a slicer at the height you set; **OBJ** opens with colours.
- [ ] **PNG** with and without transparent background.
- [ ] **WebM** plays your timeline once (keep the tab in front while it records). **GIF** loops.
- [ ] A Craft model also offers **Shape Spec (.json)**; loading it back in Craft rebuilds the model.

### Projects
- [ ] Work on a model, wait two seconds, and look for **Saved** in the top bar.
- [ ] Reload the page. **Projects** lists your project with a picture. **Open** brings back the model, low poly, rig and animation.
- [ ] **Rename**, **Duplicate**, **Save file** (a `.tridge` file), and **Open a .tridge file** all work.
- [ ] **Delete** asks first, on the card itself.
- [ ] The storage bar shows how much is used.

### Phone (or a window 360 pixels wide)
- [ ] Nothing scrolls sideways on any step.
- [ ] **Show tools** opens the bottom sheet; **Hide tools** closes it.
- [ ] Joint markers can be dragged with a finger. Buttons are easy to tap.

### Keyboard and screen reader
- [ ] Tab reaches everything in a sensible order; the **Skip to the main area** link appears on the first Tab.
- [ ] Dialogs trap focus and close with Escape.
- [ ] Long jobs announce their progress to a screen reader.

### Offline
- [ ] Turn off the internet: a message says which parts still work (Craft, rigging, animating, exporting, and anything already downloaded).

### After deploying
- [ ] The deployed address opens, the fox shows, and **Remove background** works (this checks that the model files and the in-browser engine are served correctly).
- [ ] At least one online provider (for example text to picture, or picture to 3D) answers.
