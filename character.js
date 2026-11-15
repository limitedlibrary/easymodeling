import * as THREE from "three";

// 標準ちびキャラの基準寸法（スケール1.0のときの値）
export const BASE_DIMENSIONS = {
  headRadius: 0.42,
  torsoLength: 0.55,
  torsoWidth: 0.46,
  torsoDepthRatio: 0.62,
  armLength: 0.5,
  legLength: 0.58,
  hairLength: 0.28,
  limbRadius: 0.085,
};

export const PARAM_RANGES = {
  headSize: { min: 0.6, max: 1.6, default: 1 },
  torsoLength: { min: 0.6, max: 1.6, default: 1 },
  torsoWidth: { min: 0.6, max: 1.6, default: 1 },
  armLength: { min: 0.6, max: 1.6, default: 1 },
  legLength: { min: 0.6, max: 1.6, default: 1 },
  hairLength: { min: 0.2, max: 1.8, default: 1 },
};

export const DEFAULT_COLORS = {
  skin: "#f2c9a0",
  hair: "#4a3222",
  clothes: "#3b6ea5",
};

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

/**
 * 標準ちびキャラを足元(y=0)から上に積み上げて構築する。
 * 下から順に座標を決めるため、どのスライダーを動かしても
 * 足は常に床(y=0)に接し、各パーツの接続位置も自動的に追従する。
 */
export function buildCharacter(params, colors) {
  const root = new THREE.Group();
  root.name = "Character";

  const materials = {
    skin: new THREE.MeshStandardMaterial({ color: colors.skin, roughness: 0.75 }),
    hair: new THREE.MeshStandardMaterial({ color: colors.hair, roughness: 0.55 }),
    clothes: new THREE.MeshStandardMaterial({ color: colors.clothes, roughness: 0.8 }),
    face: new THREE.MeshStandardMaterial({ color: 0x241f1b, roughness: 0.4 }),
  };
  materials.skin.name = "Skin";
  materials.hair.name = "Hair";
  materials.clothes.name = "Clothes";
  materials.face.name = "FaceDetail";

  const torsoWidth = BASE_DIMENSIONS.torsoWidth * params.torsoWidth;
  const torsoDepth = torsoWidth * BASE_DIMENSIONS.torsoDepthRatio;
  const torsoLength = BASE_DIMENSIONS.torsoLength * params.torsoLength;
  const legLength = BASE_DIMENSIONS.legLength * params.legLength;
  const armLength = BASE_DIMENSIONS.armLength * params.armLength;
  const headRadius = BASE_DIMENSIONS.headRadius * params.headSize;
  const hairLength = BASE_DIMENSIONS.hairLength * params.hairLength;

  const widthFactor = 0.85 + 0.3 * (params.torsoWidth - 1);
  const legRadius = clamp(BASE_DIMENSIONS.limbRadius * widthFactor, 0.045, 0.18);
  const armRadius = clamp(BASE_DIMENSIONS.limbRadius * 0.8 * widthFactor, 0.035, 0.15);

  // --- 脚（足が常にy=0に接地する） ---
  const legs = new THREE.Group();
  legs.name = "Legs_Group";
  const legSpacing = torsoWidth * 0.32;
  for (const side of ["L", "R"]) {
    const sign = side === "L" ? -1 : 1;
    const legGroup = new THREE.Group();
    legGroup.name = `Leg_${side}_Group`;
    legGroup.position.set(sign * legSpacing, 0, 0);

    const cylLen = Math.max(legLength - 2 * legRadius, 0.04);
    const legMesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(legRadius, cylLen, 4, 10),
      materials.skin
    );
    legMesh.name = `Leg_${side}`;
    legMesh.position.y = legLength / 2;
    legGroup.add(legMesh);

    const footMesh = new THREE.Mesh(
      new THREE.BoxGeometry(legRadius * 2.1, legRadius * 0.9, legRadius * 2.6),
      materials.skin
    );
    footMesh.name = `Foot_${side}`;
    footMesh.position.set(0, legRadius * 0.45, legRadius * 0.65);
    legGroup.add(footMesh);

    legs.add(legGroup);
  }
  root.add(legs);

  const hipY = legLength;

  // --- 胴体（脚の上に接続） ---
  const torsoGroup = new THREE.Group();
  torsoGroup.name = "Torso_Group";
  torsoGroup.position.set(0, hipY, 0);
  const torsoMesh = new THREE.Mesh(
    new THREE.BoxGeometry(torsoWidth, torsoLength, torsoDepth),
    materials.clothes
  );
  torsoMesh.name = "Torso";
  torsoMesh.position.y = torsoLength / 2;
  torsoGroup.add(torsoMesh);
  root.add(torsoGroup);

  const shoulderY = hipY + torsoLength;

  // --- 腕（肩の高さに接続） ---
  const arms = new THREE.Group();
  arms.name = "Arms_Group";
  const armAttachY = hipY + torsoLength * 0.86;
  const armSpacing = torsoWidth / 2 + armRadius * 0.9;
  const handRadius = armRadius * 1.05;
  // 体格（脚・胴体の長さ）に対して腕が長すぎる場合、手が床を突き抜けないように上限を設ける
  const minArmLength = 2 * armRadius + 0.04;
  const maxArmLengthByFloor = armAttachY - handRadius;
  const effectiveArmLength = clamp(
    armLength,
    minArmLength,
    Math.max(maxArmLengthByFloor, minArmLength)
  );
  for (const side of ["L", "R"]) {
    const sign = side === "L" ? -1 : 1;
    const armGroup = new THREE.Group();
    armGroup.name = `Arm_${side}_Group`;
    armGroup.position.set(sign * armSpacing, armAttachY, 0);

    const cylLen = Math.max(effectiveArmLength - 2 * armRadius, 0.04);
    const armMesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(armRadius, cylLen, 4, 10),
      materials.skin
    );
    armMesh.name = `Arm_${side}`;
    armMesh.position.y = -effectiveArmLength / 2;
    armGroup.add(armMesh);

    const handMesh = new THREE.Mesh(
      new THREE.SphereGeometry(handRadius, 10, 8),
      materials.skin
    );
    handMesh.name = `Hand_${side}`;
    handMesh.position.y = -effectiveArmLength;
    armGroup.add(handMesh);

    arms.add(armGroup);
  }
  root.add(arms);

  // --- 頭・顔・髪（胴体の上に接続） ---
  const headGroup = new THREE.Group();
  headGroup.name = "Head_Group";
  headGroup.position.set(0, shoulderY, 0);

  const headMesh = new THREE.Mesh(
    new THREE.SphereGeometry(headRadius, 28, 20),
    materials.skin
  );
  headMesh.name = "Head";
  headMesh.position.y = headRadius * 0.92;
  headGroup.add(headMesh);

  const headCenterY = headMesh.position.y;

  const faceGroup = new THREE.Group();
  faceGroup.name = "Face_Group";
  faceGroup.position.y = headCenterY;
  const eyeGeo = new THREE.SphereGeometry(headRadius * 0.085, 10, 8);
  for (const sign of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, materials.face);
    eye.name = sign < 0 ? "Eye_L" : "Eye_R";
    eye.position.set(sign * headRadius * 0.38, headRadius * 0.08, headRadius * 0.92);
    faceGroup.add(eye);
  }
  const mouth = new THREE.Mesh(
    new THREE.BoxGeometry(headRadius * 0.22, headRadius * 0.05, headRadius * 0.05),
    materials.face
  );
  mouth.name = "Mouth";
  mouth.position.set(0, -headRadius * 0.32, headRadius * 0.95);
  faceGroup.add(mouth);
  headGroup.add(faceGroup);

  const hairGroup = new THREE.Group();
  hairGroup.name = "Hair_Group";
  hairGroup.position.y = headCenterY;
  // 目・口より上で止め、顔の正面が髪で隠れないようにする
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(headRadius * 1.04, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.42),
    materials.hair
  );
  cap.name = "Hair_Cap";
  hairGroup.add(cap);

  const tailLen = Math.max(hairLength, 0.03);
  const tail = new THREE.Mesh(
    new THREE.CylinderGeometry(headRadius * 0.22, headRadius * 0.05, tailLen, 10),
    materials.hair
  );
  tail.name = "Hair_Tail";
  tail.position.set(0, headRadius * 0.3 - tailLen / 2, -headRadius * 0.8);
  tail.rotation.x = -0.18;
  hairGroup.add(tail);

  headGroup.add(hairGroup);
  root.add(headGroup);

  const totalHeight = shoulderY + headRadius * 2.1;

  return { root, materials, totalHeight };
}

export function disposeCharacter(root) {
  root.traverse((obj) => {
    if (obj.isMesh) {
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m.dispose());
      } else if (obj.material) {
        obj.material.dispose();
      }
    }
  });
}
