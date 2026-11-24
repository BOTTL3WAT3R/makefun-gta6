// input.js — keyboard and mouse state for the whole game.
//
// Poll-based: systems read `keys` and the mouse each frame, while one-shot
// actions (interact, fire, pause, radio) consume edge-triggered queues so a
// single press is never seen twice.

export const input = {
  keys: new Set(),
  mouseX: 0,
  mouseY: 0,
  mouseDown: false,
  clicked: false, // left button pressed this frame
  interactPressed: false, // E pressed this frame
  radioPressed: false, // R pressed this frame
  pausePressed: false, // Esc pressed this frame
  mapPressed: false, // M pressed this frame (full-screen map)
  debugPressed: false, // F3 pressed this frame (debug overlay)
  anyGesture: false, // first key/click, used to unlock WebAudio
  lastMouseMoveAt: 0, // when the aim last moved (performance.now clock)
};

const INTERACT_CODES = ['KeyE'];
const RADIO_CODES = ['KeyR'];

export function initInput(canvas) {
  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    input.keys.add(event.code);
    input.anyGesture = true;
    if (INTERACT_CODES.includes(event.code)) input.interactPressed = true;
    if (RADIO_CODES.includes(event.code)) input.radioPressed = true;
    if (event.code === 'Escape') input.pausePressed = true;
    if (event.code === 'KeyM') input.mapPressed = true;
    if (event.code === 'F3') {
      input.debugPressed = true;
      event.preventDefault(); // keep the browser's find-again off the game
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    input.keys.delete(event.code);
  });
  // Losing focus or hiding the tab must never leave a key held down: a
  // stuck W after alt-tab would drive the car on its own forever.
  const releaseAll = () => {
    input.keys.clear();
    input.mouseDown = false;
  };
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseAll();
  });
  canvas.addEventListener('mousemove', (event) => {
    input.mouseX = event.clientX;
    input.mouseY = event.clientY;
    input.lastMouseMoveAt = performance.now();
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      input.mouseDown = true;
      input.clicked = true;
      input.anyGesture = true;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) input.mouseDown = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
}

// Called at the end of each frame: one-shot flags last exactly one frame.
export function flushInput() {
  input.clicked = false;
  input.interactPressed = false;
  input.radioPressed = false;
  input.pausePressed = false;
  input.mapPressed = false;
  input.debugPressed = false;
}

export function moveAxes() {
  // Returns {x, z} in camera-free terms: z -1 is "forward" (W), x is strafe.
  let x = 0;
  let z = 0;
  if (input.keys.has('KeyW') || input.keys.has('ArrowUp')) z -= 1;
  if (input.keys.has('KeyS') || input.keys.has('ArrowDown')) z += 1;
  if (input.keys.has('KeyA') || input.keys.has('ArrowLeft')) x -= 1;
  if (input.keys.has('KeyD') || input.keys.has('ArrowRight')) x += 1;
  return { x, z };
}

export function sprintHeld() {
  return input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
}
