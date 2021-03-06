/* global AFRAME, THREE */

'use strict';

var bind = AFRAME.utils.bind;
var isMobile = AFRAME.utils.device.isMobile();
var isNullVector;

// To avoid recalculation at every mouse movement tick
var PI_2 = Math.PI / 2;
var radToDeg = THREE.Math.radToDeg;

/**
 * Modified look-controls for photospheres in AFRAME. 
 *
 * Taken from:
 * https://github.com/aframevr/aframe/blob/master/src/components/look-controls.js
 *
 * Limits panning up / down directions, based on values set in html
 *
 * For example:
 * <a-entity camera constrained-look-controls="limit-down: -26; limit-up: 28;"></a-entity>
 */

AFRAME.registerComponent('constrained-look-controls', {
  dependencies: ['position', 'rotation'],

  schema: {
    enabled: {default: true},
    hmdEnabled: {default: true},
    limitDown: {type: 'number', default: -90},
    limitUp: {type: 'number', default: 90},
    reverseMouseDrag: {default: false},
    standing: {default: true}
  },

  init: function () {
    var sceneEl = this.el.sceneEl;

    // Aux variables
    this.previousHMDPosition = new THREE.Vector3();
    this.hmdQuaternion = new THREE.Quaternion();
    this.hmdEuler = new THREE.Euler();

    this.setupMouseControls();
    this.setupHMDControls();
    this.bindMethods();

    this.setEnabled(this.data.enabled);

    // Reset previous HMD position when we exit VR.
    sceneEl.addEventListener('exit-vr', this.onExitVR);
  },

  update: function (oldData) {
    var data = this.data;
    var hmdEnabled = data.hmdEnabled;
    if (oldData && data.enabled !== oldData.enabled) {
      this.setEnabled(data.enabled);
    }
    if (!data.enabled) { return; }
    if (!hmdEnabled && oldData && hmdEnabled !== oldData.hmdEnabled) {
      this.pitchObject.rotation.set(0, 0, 0);
      this.yawObject.rotation.set(0, 0, 0);
    }
    this.controls.standing = data.standing;
    this.controls.update();
    this.updateOrientation();
    this.updatePosition();
  },

  setEnabled: function (enabled) {
    var sceneEl = this.el.sceneEl;

    function enableGrabCursor () {
      sceneEl.canvas.classList.add('a-grab-cursor');
    }
    function disableGrabCursor () {
      sceneEl.canvas.classList.remove('a-grab-cursor');
    }

    if (!sceneEl.canvas) {
      if (enabled) {
        sceneEl.addEventListener('render-target-loaded', enableGrabCursor);
      } else {
        sceneEl.addEventListener('render-target-loaded', disableGrabCursor);
      }
    } else {
      if (enabled) {
        enableGrabCursor();
      } else {
        disableGrabCursor();
      }
    }
  },

  play: function () {
    this.addEventListeners();
  },

  pause: function () {
    this.removeEventListeners();
  },

  tick: function (/*t*/) {
    this.update();
  },

  remove: function () {
    this.pause();
  },

  bindMethods: function () {
    this.onMouseDown = bind(this.onMouseDown, this);
    this.onMouseMove = bind(this.onMouseMove, this);
    this.releaseMouse = bind(this.releaseMouse, this);
    this.onTouchStart = bind(this.onTouchStart, this);
    this.onTouchMove = bind(this.onTouchMove, this);
    this.onTouchEnd = bind(this.onTouchEnd, this);
    this.onExitVR = bind(this.onExitVR, this);
  },

  setupMouseControls: function () {
    // The canvas where the scene is painted
    this.mouseDown = false;
    this.pitchObject = new THREE.Object3D();
    this.yawObject = new THREE.Object3D();
    this.yawObject.position.y = 10;
    this.yawObject.add(this.pitchObject);
  },

  setupHMDControls: function () {
    this.dolly = new THREE.Object3D();
    this.euler = new THREE.Euler();
    this.controls = new THREE.VRControls(this.dolly);
    this.controls.userHeight = 0.0;
  },

  addEventListeners: function () {
    var sceneEl = this.el.sceneEl;
    var canvasEl = sceneEl.canvas;

    // listen for canvas to load.
    if (!canvasEl) {
      sceneEl.addEventListener('render-target-loaded', bind(this.addEventListeners, this));
      return;
    }

    // Mouse Events
    canvasEl.addEventListener('mousedown', this.onMouseDown, false);
    window.addEventListener('mousemove', this.onMouseMove, false);
    window.addEventListener('mouseup', this.releaseMouse, false);

    // Touch events
    canvasEl.addEventListener('touchstart', this.onTouchStart);
    window.addEventListener('touchmove', this.onTouchMove);
    window.addEventListener('touchend', this.onTouchEnd);
  },

  removeEventListeners: function () {
    var sceneEl = this.el.sceneEl;
    var canvasEl = sceneEl && sceneEl.canvas;
    if (!canvasEl) { return; }

    // Mouse Events
    canvasEl.removeEventListener('mousedown', this.onMouseDown);
    canvasEl.removeEventListener('mousemove', this.onMouseMove);
    canvasEl.removeEventListener('mouseup', this.releaseMouse);
    canvasEl.removeEventListener('mouseout', this.releaseMouse);

    // Touch events
    canvasEl.removeEventListener('touchstart', this.onTouchStart);
    canvasEl.removeEventListener('touchmove', this.onTouchMove);
    canvasEl.removeEventListener('touchend', this.onTouchEnd);
  },

  updateOrientation: function () {
    var currentRotation;
    var deltaRotation;
    var hmdEuler = this.hmdEuler;
    var pitchObject = this.pitchObject;
    var yawObject = this.yawObject;
    var hmdQuaternion = this.calculateHMDQuaternion();
    var sceneEl = this.el.sceneEl;
    var rotation;
    hmdEuler.setFromQuaternion(hmdQuaternion, 'YXZ');
    if (isMobile) {
      // In mobile we allow camera rotation with touch events and sensors
      rotation = {
        x: this.constrainPanning(radToDeg(hmdEuler.x) + radToDeg(pitchObject.rotation.x)),
        y: radToDeg(hmdEuler.y) + radToDeg(yawObject.rotation.y),
        z: radToDeg(hmdEuler.z)
      };
    } else if (!sceneEl.is('vr-mode') || isNullVector(hmdEuler) || !this.data.hmdEnabled) {
      currentRotation = this.el.getAttribute('rotation');
      deltaRotation = this.calculateDeltaRotation();
      // Mouse look only if HMD disabled or no info coming from the sensors
      if (this.data.reverseMouseDrag) {
        rotation = {
          x: this.constrainPanning(currentRotation.x - deltaRotation.x),
          y: currentRotation.y - deltaRotation.y,
          z: currentRotation.z
        };
      } else {
        rotation = {
          x: this.constrainPanning(currentRotation.x + deltaRotation.x),
          y: currentRotation.y + deltaRotation.y,
          z: currentRotation.z
        };
      }
    } else {
      // Mouse rotation ignored with an active headset.
      // The user head rotation takes priority
      rotation = {
        x: radToDeg(this.constrainPanning(hmdEuler.x)),
        y: radToDeg(hmdEuler.y),
        z: radToDeg(hmdEuler.z)
      };
    }
    this.el.setAttribute('rotation', rotation);
  },

  calculateDeltaRotation: function () {
    var currentRotationX = radToDeg(this.pitchObject.rotation.x);
    var currentRotationY = radToDeg(this.yawObject.rotation.y);
    var deltaRotation;
    this.previousRotationX = this.previousRotationX || currentRotationX;
    this.previousRotationY = this.previousRotationY || currentRotationY;
    deltaRotation = {
      x: currentRotationX - this.previousRotationX,
      y: currentRotationY - this.previousRotationY
    };
    this.previousRotationX = currentRotationX;
    this.previousRotationY = currentRotationY;
    return deltaRotation;
  },

  calculateHMDQuaternion: function () {
    var hmdQuaternion = this.hmdQuaternion;
    hmdQuaternion.copy(this.dolly.quaternion);
    return hmdQuaternion;
  },

  updatePosition: (function () {
    var deltaHMDPosition = new THREE.Vector3();
    return function () {
      var el = this.el;
      var currentPosition = el.getAttribute('position');
      var currentHMDPosition;
      var previousHMDPosition = this.previousHMDPosition;
      var sceneEl = this.el.sceneEl;
      currentHMDPosition = this.calculateHMDPosition();
      deltaHMDPosition.copy(currentHMDPosition).sub(previousHMDPosition);
      if (!sceneEl.is('vr-mode') || isNullVector(deltaHMDPosition)) { return; }
      previousHMDPosition.copy(currentHMDPosition);
      // Do nothing if we have not moved.
      if (!sceneEl.is('vr-mode')) { return; }
      el.setAttribute('position', {
        x: currentPosition.x + deltaHMDPosition.x,
        y: currentPosition.y + deltaHMDPosition.y,
        z: currentPosition.z + deltaHMDPosition.z
      });
    };
  })(),

  calculateHMDPosition: function () {
    var dolly = this.dolly;
    var position = new THREE.Vector3();
    dolly.updateMatrix();
    position.setFromMatrixPosition(dolly.matrix);
    return position;
  },

  onMouseMove: function (event) {
    var pitchObject = this.pitchObject;
    var yawObject = this.yawObject;
    var previousMouseEvent = this.previousMouseEvent;

    if (!this.mouseDown || !this.data.enabled) { return; }

    var movementX = event.movementX || event.mozMovementX;
    var movementY = event.movementY || event.mozMovementY;

    if (movementX === undefined || movementY === undefined) {
      movementX = event.screenX - previousMouseEvent.screenX;
      movementY = event.screenY - previousMouseEvent.screenY;
    }
    this.previousMouseEvent = event;

    yawObject.rotation.y -= movementX * 0.002;
    pitchObject.rotation.x -= movementY * 0.002;
    pitchObject.rotation.x = Math.max(-PI_2, Math.min(PI_2, pitchObject.rotation.x));
  },

  onMouseDown: function (event) {
    if (!this.data.enabled) { return; }
    // Handle only primary button.
    if (event.button !== 0) { return; }
    this.mouseDown = true;
    this.previousMouseEvent = event;
    document.body.classList.add('a-grabbing');
  },

  releaseMouse: function () {
    this.mouseDown = false;
    document.body.classList.remove('a-grabbing');
  },

  onTouchStart: function (e) {
    if (e.touches.length !== 1) { return; }
    this.touchStart = {
      x: e.touches[0].pageX,
      y: e.touches[0].pageY
    };
    this.touchStarted = true;
  },

  onTouchMove: function (e) {
    var deltaY;
    var yawObject = this.yawObject;
    if (!this.touchStarted) { return; }
    deltaY = 2 * Math.PI * (e.touches[0].pageX - this.touchStart.x) /
            this.el.sceneEl.canvas.clientWidth;
    // Limits touch orientaion to to yaw (y axis)
    yawObject.rotation.y -= deltaY * 0.5;
    this.touchStart = {
      x: e.touches[0].pageX,
      y: e.touches[0].pageY
    };
  },

  onTouchEnd: function () {
    this.touchStarted = false;
  },

  onExitVR: function () {
    this.previousHMDPosition.set(0, 0, 0);
  },

  // Constrain panning in up / down directions if limits are set in html
  constrainPanning: function (x) {
    var limit = 0;

    if (x > 0) {
      limit = this.data.limitUp;
    } else if (x < 0) {
      limit = this.data.limitDown;
    }
    if (Math.abs(x) > Math.abs(limit)) {
      return limit;
    }

    return x;
  }
});

function isNullVector (vector) {
  return vector.x === 0 && vector.y === 0 && vector.z === 0;
}
