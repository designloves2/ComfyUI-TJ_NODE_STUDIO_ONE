// Live 3D viewer for the POSE mode's "Preview & Angle": shows the SAM3D-Body GLB in the Pose Image
// area, lets the user orbit / zoom / pan, and captures the current view as the final pose image.
// three.js is vendored under web/vendor/three (loaded on first use, not at page load).
// Plain look: black background, no grid, the GLB's own material, soft lights.

let three = null;
async function loadThree() {
  if (!three) {
    const base = new URL("../vendor/three/", import.meta.url);
    const [THREE, { GLTFLoader }, { OrbitControls }] = await Promise.all([
      import(new URL("three.mjs", base)),
      import(new URL("examples/jsm/loaders/GLTFLoader.mjs", base)),
      import(new URL("examples/jsm/controls/OrbitControls.mjs", base)),
    ]);
    three = { THREE, GLTFLoader, OrbitControls };
  }
  return three;
}

/**
 * Returns { el, load(url), setAspect(w/h), getCamera(), setCamera(c), resetView(), capture(longEdge), dispose() }.
 * `el` is a block element that keeps the given aspect at the width it is placed in.
 */
export async function createPoseViewer({ aspect = 1, onCameraChange } = {}) {
  const { THREE, GLTFLoader, OrbitControls } = await loadThree();

  const el = document.createElement("div");
  Object.assign(el.style, { position: "relative", width: "100%", background: "#000", borderRadius: "10px", overflow: "hidden", touchAction: "none" });
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  Object.assign(renderer.domElement.style, { display: "block", width: "100%", height: "100%" });
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(2, 3, 4); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.6); fill.position.set(-3, 1, -2); scene.add(fill);

  const camera = new THREE.PerspectiveCamera(30, aspect, 0.01, 1000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.screenSpacePanning = true;
  // The graph canvas under the node must not also zoom / drag while the viewer is used.
  for (const ev of ["wheel", "pointerdown", "mousedown", "dblclick", "contextmenu"]) el.addEventListener(ev, e => e.stopPropagation());
  el.addEventListener("wheel", e => e.preventDefault(), { passive: false });

  let mixer = null, root = null, home = null;
  const render = () => renderer.render(scene, camera);
  controls.addEventListener("change", render);
  controls.addEventListener("end", () => onCameraChange?.(getCamera()));

  function fit() {
    const box = new THREE.Box3().setFromObject(root, true);
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const dist = (Math.max(size.y, size.x / camera.aspect) / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.2 + size.z / 2;
    home = { position: [center.x, center.y, center.z + dist], target: [center.x, center.y, center.z] };
    camera.near = dist / 100; camera.far = dist * 100; camera.updateProjectionMatrix();
  }

  function setCamera(c) {
    camera.position.set(...c.position); controls.target.set(...c.target);
    camera.updateProjectionMatrix(); controls.update(); render();
  }
  function getCamera() {
    return { position: camera.position.toArray(), target: controls.target.toArray() };
  }

  function setAspect(a) {
    aspect = a || 1;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    resize();
  }
  function resize() {
    const w = el.clientWidth;
    if (!w) return;
    const h = Math.round(w / aspect);
    el.style.height = `${h}px`;
    renderer.setSize(w, h, false);
    render();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(el);

  async function load(url) {
    const gltf = await new GLTFLoader().loadAsync(url);
    if (root) scene.remove(root);
    root = gltf.scene;
    scene.add(root);
    if (gltf.animations.length) {            // the pose is the animation's frame 0, not the bind pose
      mixer = new THREE.AnimationMixer(root);
      mixer.clipAction(gltf.animations[0]).play();
      mixer.setTime(0);
    }
    root.updateMatrixWorld(true);
    fit();
    setCamera(home);
  }

  function capture(longEdge = 1536) {
    const w = aspect >= 1 ? longEdge : Math.round(longEdge * aspect), h = aspect >= 1 ? Math.round(longEdge / aspect) : longEdge;
    const pr = renderer.getPixelRatio();
    renderer.setPixelRatio(1); renderer.setSize(w, h, false);
    render();
    const dataUrl = renderer.domElement.toDataURL("image/png");
    renderer.setPixelRatio(pr); resize();
    return dataUrl;
  }

  function dispose() {
    ro.disconnect(); controls.dispose(); renderer.dispose(); el.remove();
  }

  setAspect(aspect);
  return { el, load, setAspect, getCamera, setCamera, resetView: () => home && setCamera(home), capture, dispose };
}
