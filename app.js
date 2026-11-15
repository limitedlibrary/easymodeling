import * as THREE from "three";
import { OrbitControls } from "./vendor/three/OrbitControls.js";
import { GLTFExporter } from "./vendor/three/GLTFExporter.js";
import {
  buildCharacter,
  disposeCharacter,
  PARAM_RANGES,
  DEFAULT_COLORS,
} from "./character.js";

const PARAM_KEYS = Object.keys(PARAM_RANGES);
const COLOR_KEYS = Object.keys(DEFAULT_COLORS);
const SETTINGS_VERSION = 1;
const SETTINGS_SCHEMA = "easymodeling-chibi";

function cloneDefaultState() {
  const parameters = {};
  for (const key of PARAM_KEYS) parameters[key] = PARAM_RANGES[key].default;
  return { parameters, colors: { ...DEFAULT_COLORS } };
}

const state = cloneDefaultState();

// --- three.js のセットアップ ---
const viewportEl = document.getElementById("viewport");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x121317);

const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 100);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewportEl.appendChild(renderer.domElement);

// 確認用のライトと床は、書き出し用のcharacterRootには含めない
const viewerExtras = new THREE.Group();
viewerExtras.name = "ViewerExtras_NotExported";
viewerExtras.add(new THREE.HemisphereLight(0xffffff, 0x3a3a3a, 1.1));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
keyLight.position.set(2.2, 4, 3);
viewerExtras.add(keyLight);
const grid = new THREE.GridHelper(6, 24, 0x3a3d45, 0x26282e);
viewerExtras.add(grid);
scene.add(viewerExtras);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.6;
controls.maxDistance = 18;
controls.maxPolarAngle = Math.PI - 0.1;
controls.minPolarAngle = 0.1;

let characterRoot = null;
let currentTotalHeight = 1;

function setDefaultCameraView(totalHeight) {
  const targetY = totalHeight * 0.52;
  const distance = Math.max(totalHeight * 2.2, 1.2);
  camera.position.set(0, targetY, distance);
  controls.target.set(0, targetY, 0);
  controls.update();
}

function updateCameraFraming(totalHeight) {
  // カメラの相対位置・距離は保ったまま、注視点の高さだけキャラクターに追従させる
  controls.target.y = totalHeight * 0.52;
  controls.update();
}

function rebuildCharacter({ recenterCamera = false } = {}) {
  if (characterRoot) {
    scene.remove(characterRoot);
    disposeCharacter(characterRoot);
  }
  const built = buildCharacter(state.parameters, state.colors);
  characterRoot = built.root;
  currentTotalHeight = built.totalHeight;
  scene.add(characterRoot);

  if (recenterCamera) {
    setDefaultCameraView(currentTotalHeight);
  } else {
    updateCameraFraming(currentTotalHeight);
  }
}

function resizeRendererToDisplaySize() {
  const width = viewportEl.clientWidth;
  const height = viewportEl.clientHeight;
  if (width === 0 || height === 0) return;
  const needResize = renderer.domElement.width !== width || renderer.domElement.height !== height;
  if (needResize) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}

function animate() {
  resizeRendererToDisplaySize();
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

// --- UIバインド ---
const sliderEls = {};
const valueEls = {};
for (const key of PARAM_KEYS) {
  sliderEls[key] = document.getElementById(`slider-${key}`);
  valueEls[key] = document.getElementById(`value-${key}`);
}
const colorEls = {};
for (const key of COLOR_KEYS) {
  colorEls[key] = document.getElementById(`color-${key}`);
}

function syncUiFromState() {
  for (const key of PARAM_KEYS) {
    const range = PARAM_RANGES[key];
    sliderEls[key].min = range.min;
    sliderEls[key].max = range.max;
    sliderEls[key].value = state.parameters[key];
    valueEls[key].textContent = state.parameters[key].toFixed(2);
  }
  for (const key of COLOR_KEYS) {
    colorEls[key].value = state.colors[key];
  }
}

for (const key of PARAM_KEYS) {
  sliderEls[key].addEventListener("input", (event) => {
    const value = parseFloat(event.target.value);
    state.parameters[key] = value;
    valueEls[key].textContent = value.toFixed(2);
    rebuildCharacter();
  });
}

for (const key of COLOR_KEYS) {
  colorEls[key].addEventListener("input", (event) => {
    state.colors[key] = event.target.value;
    rebuildCharacter();
  });
}

const statusEl = document.getElementById("status-area");
let statusTimer = null;
function showStatus(message) {
  statusEl.textContent = message;
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    statusEl.textContent = "";
  }, 3000);
}

// --- 初期化・JSON保存/復元 ---
document.getElementById("btn-reset").addEventListener("click", () => {
  Object.assign(state, cloneDefaultState());
  syncUiFromState();
  document.getElementById("json-error").textContent = "";
  rebuildCharacter({ recenterCamera: true });
  showStatus("設定を初期化しました。");
});

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.getElementById("btn-save-json").addEventListener("click", () => {
  const payload = {
    version: SETTINGS_VERSION,
    schema: SETTINGS_SCHEMA,
    generatedAt: new Date().toISOString(),
    parameters: { ...state.parameters },
    colors: { ...state.colors },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  downloadBlob(blob, "easymodeling-chibi-settings.json");
  showStatus("JSONを保存しました。");
});

function validateSettings(obj) {
  const errors = [];
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return { valid: false, errors: ["JSONの形式が不正です（オブジェクトではありません）。"] };
  }
  if (obj.version !== SETTINGS_VERSION) {
    errors.push(`対応していないバージョンです（version: ${SETTINGS_VERSION} が必要）。`);
  }
  if (typeof obj.parameters !== "object" || obj.parameters === null) {
    errors.push("parameters が見つかりません。");
  } else {
    for (const key of PARAM_KEYS) {
      const v = obj.parameters[key];
      const range = PARAM_RANGES[key];
      if (typeof v !== "number" || !Number.isFinite(v)) {
        errors.push(`parameters.${key} が数値ではありません。`);
      } else if (v < range.min || v > range.max) {
        errors.push(`parameters.${key} が範囲外です（${range.min}〜${range.max}）。`);
      }
    }
  }
  if (typeof obj.colors !== "object" || obj.colors === null) {
    errors.push("colors が見つかりません。");
  } else {
    for (const key of COLOR_KEYS) {
      const v = obj.colors[key];
      if (typeof v !== "string" || !/^#[0-9a-fA-F]{6}$/.test(v)) {
        errors.push(`colors.${key} が正しい色コード（例: #aabbcc）ではありません。`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

const fileInput = document.getElementById("file-load-json");
const jsonErrorEl = document.getElementById("json-error");

document.getElementById("btn-load-json").addEventListener("click", () => {
  fileInput.value = "";
  fileInput.click();
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(reader.result);
    } catch (err) {
      jsonErrorEl.textContent = "JSONの解析に失敗しました。ファイルの内容を確認してください。";
      return;
    }
    const { valid, errors } = validateSettings(parsed);
    if (!valid) {
      jsonErrorEl.textContent = "読み込みエラー: " + errors.join(" / ");
      return;
    }
    state.parameters = { ...parsed.parameters };
    state.colors = { ...parsed.colors };
    syncUiFromState();
    jsonErrorEl.textContent = "";
    rebuildCharacter();
    showStatus("JSONを読み込みました。");
  };
  reader.onerror = () => {
    jsonErrorEl.textContent = "ファイルの読み込みに失敗しました。";
  };
  reader.readAsText(file);
});

// --- GLB書き出し（キャラクターのみ。床・背景・確認用ライトは含めない） ---
document.getElementById("btn-export-glb").addEventListener("click", async () => {
  const exporter = new GLTFExporter();
  try {
    const result = await exporter.parseAsync(characterRoot, {
      binary: true,
      onlyVisible: true,
      embedImages: false,
    });
    const blob = new Blob([result], { type: "model/gltf-binary" });
    downloadBlob(blob, "easymodeling-chibi.glb");
    showStatus("GLBを書き出しました。");
  } catch (err) {
    console.error(err);
    showStatus("GLBの書き出しに失敗しました。");
  }
});

// --- 視点操作ボタン ---
function orbitBy(deltaTheta, deltaPhi) {
  const offset = new THREE.Vector3().copy(camera.position).sub(controls.target);
  const spherical = new THREE.Spherical().setFromVector3(offset);
  spherical.theta += deltaTheta;
  spherical.phi = THREE.MathUtils.clamp(
    spherical.phi + deltaPhi,
    controls.minPolarAngle,
    controls.maxPolarAngle
  );
  offset.setFromSpherical(spherical);
  camera.position.copy(controls.target).add(offset);
  controls.update();
}

function zoomBy(factor) {
  const offset = new THREE.Vector3().copy(camera.position).sub(controls.target);
  const newLength = THREE.MathUtils.clamp(
    offset.length() * factor,
    controls.minDistance,
    controls.maxDistance
  );
  offset.setLength(newLength);
  camera.position.copy(controls.target).add(offset);
  controls.update();
}

document.getElementById("rotate-left").addEventListener("click", () => orbitBy(-0.35, 0));
document.getElementById("rotate-right").addEventListener("click", () => orbitBy(0.35, 0));
document.getElementById("rotate-up").addEventListener("click", () => orbitBy(0, -0.25));
document.getElementById("rotate-down").addEventListener("click", () => orbitBy(0, 0.25));
document.getElementById("zoom-in").addEventListener("click", () => zoomBy(0.85));
document.getElementById("zoom-out").addEventListener("click", () => zoomBy(1.18));
document.getElementById("reset-camera").addEventListener("click", () => {
  setDefaultCameraView(currentTotalHeight);
  showStatus("正面に戻しました。");
});

// --- 起動 ---
syncUiFromState();
rebuildCharacter({ recenterCamera: true });
animate();
