// 1. 3D 무대(Scene), 카메라, 렌더러(화면에 그리는 도구) 설정
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // 맑은 하늘색 배경

// 안개 효과 (멀리 있는 물체를 흐리게 만들어 자연스럽게 표현)
scene.fog = new THREE.Fog(0x87CEEB, 50, 300);

// 카메라 설정 (시야각 60도, 화면 비율, 가장 가까이/멀리 보이는 거리)
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

// 렌더러 설정 (HTML 캔버스에 3D 그래픽을 실제로 그려주는 역할)
const renderer = new THREE.WebGLRenderer({ antialias: true }); // antialias: 계단 현상 방지
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true; // 그림자 효과 켜기
document.getElementById('canvas-container').appendChild(renderer.domElement);

// 2. 조명(빛) 설정
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // 전체 공간을 은은하게 비추는 빛
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8); // 특정 방향으로 비추는 빛 (태양광 역할)
directionalLight.position.set(100, 200, 50); // 빛이 오는 위치
directionalLight.castShadow = true; // 그림자를 만들도록 설정
scene.add(directionalLight);

// 3. 바닥 만들기 (드론이 날아다닐 땅)
const groundGeometry = new THREE.PlaneGeometry(1000, 1000);
const groundMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x557a2b, // 잔디색 (어두운 녹색)
    roughness: 0.8  // 거칠기 (빛 반사 줄임)
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2; // 바닥을 평평하게 눕힘 (기본은 세워져 있음)
ground.receiveShadow = true; // 바닥에 그림자가 지도록 설정
scene.add(ground);

// 바닥에 격자무늬(그리드) 선 그리기 (움직일 때 속도감을 느끼기 위함)
const gridHelper = new THREE.GridHelper(1000, 100, 0x000000, 0x000000);
gridHelper.material.opacity = 0.2;
gridHelper.material.transparent = true;
scene.add(gridHelper);

// 4. 드론 모델 만들기
const droneGroup = new THREE.Group(); // 드론의 여러 부품을 하나로 묶어줄 그룹

// 드론 몸통
const bodyGeo = new THREE.BoxGeometry(2, 0.5, 2);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x333333 }); // 짙은 회색
const body = new THREE.Mesh(bodyGeo, bodyMat);
body.castShadow = true;
droneGroup.add(body);

// 드론 앞부분 표시 (어디가 앞인지 알기 위해 빨간색 코를 붙임)
const frontGeo = new THREE.BoxGeometry(0.5, 0.6, 2.1);
const frontMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
const front = new THREE.Mesh(frontGeo, frontMat);
droneGroup.add(front);

// 프로펠러를 만들고 장착하는 함수
const propellers = []; // 프로펠러들을 담아둘 배열 (나중에 회전시키기 위함)
function createPropeller(x, z) {
    // 프로펠러 지지대 (팔)
    const armGeo = new THREE.CylinderGeometry(0.1, 0.1, 1.5);
    const armMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
    const arm = new THREE.Mesh(armGeo, armMat);
    arm.position.set(x * 1.5, 0, z * 1.5);
    arm.rotation.x = Math.PI / 2;
    arm.rotation.z = Math.PI / 4 * (x * z); // 대각선 방향으로 팔을 뻗음
    droneGroup.add(arm);

    // 모터 부분
    const motorGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.4);
    const motorMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const motor = new THREE.Mesh(motorGeo, motorMat);
    motor.position.set(x * 2, 0.2, z * 2);
    droneGroup.add(motor);

    // 회전하는 프로펠러 날개
    const propGeo = new THREE.BoxGeometry(1.8, 0.05, 0.2);
    const propMat = new THREE.MeshStandardMaterial({ color: 0xffffff }); // 흰색 날개
    const prop = new THREE.Mesh(propGeo, propMat);
    prop.position.set(x * 2, 0.4, z * 2);
    prop.castShadow = true;
    droneGroup.add(prop);
    propellers.push(prop); // 배열에 저장
}

// 4개의 프로펠러 달기 (대각선 4방향)
createPropeller(1, 1);
createPropeller(1, -1);
createPropeller(-1, 1);
createPropeller(-1, -1);

scene.add(droneGroup);

// 드론의 초기 위치 (땅 위 5m)
droneGroup.position.y = 5; 

// 5. 드론 물리 엔진 (이동, 회전, 속도 관리)
const droneState = {
    velocity: new THREE.Vector3(0, 0, 0), // 이동 속도 (x, y, z)
    rotation: { pitch: 0, roll: 0, yaw: 0 }, // 기울기 (앞뒤, 좌우, 제자리 회전)
    throttle: 0, // 엔진 출력 (위아래)
};

const MAX_PITCH_ROLL = Math.PI / 6; // 최대 기울기 각도 (30도)
const ACCELERATION = 0.05; // 가속도 (얼마나 빨리 기울어지고 빨라지는지)
const FRICTION = 0.96; // 공기 저항 (마찰력, 서서히 멈추게 함)
const GRAVITY = 0.02; // 중력 (아래로 당기는 힘)

// 6. 키보드 입력 감지 (사용자가 무슨 키를 누르고 있는지 저장)
const keys = {};
window.addEventListener('keydown', (e) => { keys[e.code] = true; });
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

// 7. 계기판(대시보드) 요소 가져오기
const altMeter = document.getElementById('altMeter');
const spdMeter = document.getElementById('spdMeter');

// 8. 매 프레임마다 실행되는 3D 게임 루프 (애니메이션)
function animate() {
    requestAnimationFrame(animate); // 다음 프레임 요청 (초당 60프레임)

    // 프로펠러 항상 회전시키기
    propellers.forEach(prop => {
        prop.rotation.y += 0.5; // 빙글빙글 돔
    });

    // --- 물리 및 조종 로직 ---
    
    // 1) 고도 제어 (Shift키: 엔진 출력 증가, Space키: 엔진 출력 감소)
    if (keys['ShiftLeft'] || keys['ShiftRight']) {
        droneState.throttle += 0.005; // 엔진 파워업
    } else if (keys['Space']) {
        droneState.throttle -= 0.005; // 엔진 파워다운
    } else {
        droneState.throttle *= 0.9; // 안 누르면 엔진 출력이 원래대로 돌아감
    }

    // 중력과 추력 적용 (Y축 속도 변경)
    droneState.velocity.y += droneState.throttle - GRAVITY;

    // 2) 피치 (앞뒤 기울기 - W/S)
    if (keys['KeyW']) {
        // 목표 각도(MAX)를 향해 서서히 기울어지게 함 (lerp 함수 사용)
        droneState.rotation.pitch = THREE.MathUtils.lerp(droneState.rotation.pitch, MAX_PITCH_ROLL, 0.1);
    } else if (keys['KeyS']) {
        droneState.rotation.pitch = THREE.MathUtils.lerp(droneState.rotation.pitch, -MAX_PITCH_ROLL, 0.1);
    } else {
        droneState.rotation.pitch = THREE.MathUtils.lerp(droneState.rotation.pitch, 0, 0.1); // 서서히 평형 복귀
    }

    // 3) 롤 (좌우 기울기 - A/D)
    if (keys['KeyA']) {
        droneState.rotation.roll = THREE.MathUtils.lerp(droneState.rotation.roll, MAX_PITCH_ROLL, 0.1);
    } else if (keys['KeyD']) {
        droneState.rotation.roll = THREE.MathUtils.lerp(droneState.rotation.roll, -MAX_PITCH_ROLL, 0.1);
    } else {
        droneState.rotation.roll = THREE.MathUtils.lerp(droneState.rotation.roll, 0, 0.1);
    }

    // 4) 요 (좌우 회전 - Q/E)
    if (keys['KeyQ']) droneState.rotation.yaw += 0.03;
    if (keys['KeyE']) droneState.rotation.yaw -= 0.03;

    // 드론 모델에 기울기(회전) 적용
    // Three.js의 회전 순서 YXZ 지정 (요 -> 피치 -> 롤 순서로 적용해야 자연스럽게 돔)
    droneGroup.rotation.set(droneState.rotation.pitch, droneState.rotation.yaw, -droneState.rotation.roll, 'YXZ');

    // 5) 기울기에 따른 이동 속도 계산 (드론이 기울어진 방향으로 미끄러지듯 날아감)
    // 수학의 사인(sin), 코사인(cos)을 써서 현재 기체가 바라보는 방향(yaw)을 기준으로 힘을 분배합니다.
    const moveX = Math.sin(droneState.rotation.yaw) * droneState.rotation.pitch - Math.cos(droneState.rotation.yaw) * droneState.rotation.roll;
    const moveZ = Math.cos(droneState.rotation.yaw) * droneState.rotation.pitch + Math.sin(droneState.rotation.yaw) * droneState.rotation.roll;

    droneState.velocity.x -= moveX * ACCELERATION;
    droneState.velocity.z -= moveZ * ACCELERATION;

    // 6) 마찰력 적용 (속도가 무한히 빨라지지 않고 공기 저항을 받게)
    droneState.velocity.x *= FRICTION;
    droneState.velocity.z *= FRICTION;
    droneState.velocity.y *= 0.98; // 상하 공기 저항

    // 7) 최종 위치 업데이트 (현재 위치 + 속도)
    droneGroup.position.add(droneState.velocity);

    // 바닥 충돌 처리 (땅 밑으로 꺼지지 않게 막음)
    if (droneGroup.position.y < 0.5) {
        droneGroup.position.y = 0.5;
        droneState.velocity.y = 0;
        // 땅에 닿았을 때 마찰을 크게 줘서 미끄러지지 않게 브레이크를 잡음
        droneState.velocity.x *= 0.8;
        droneState.velocity.z *= 0.8;
    }

    // --- 카메라 추적 로직 (3인칭 시점 뷰) ---
    // 드론 뒤쪽 약간 위에 카메라를 띄웁니다.
    const cameraOffset = new THREE.Vector3(0, 5, 15); 
    // 드론이 회전하면 카메라도 드론의 뒤꽁무니를 따라가도록 각도를 회전시킵니다.
    cameraOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), droneState.rotation.yaw);
    
    // 목표 카메라 위치 계산 후 부드럽게 따라가기 (lerp)
    const targetCameraPos = droneGroup.position.clone().add(cameraOffset);
    camera.position.lerp(targetCameraPos, 0.1);
    
    // 카메라는 항상 드론을 바라봄
    camera.lookAt(droneGroup.position);

    // --- 계기판(UI) 업데이트 ---
    // 고도 계산 (바닥 기준 0)
    altMeter.innerText = Math.max(0, (droneGroup.position.y - 0.5)).toFixed(1); 
    
    // 속도 계산 (x, z 이동 속도를 피타고라스 정리로 구함)
    const speed = Math.sqrt(droneState.velocity.x ** 2 + droneState.velocity.z ** 2) * 50; 
    spdMeter.innerText = speed.toFixed(0);

    // 3D 공간을 카메라 시점으로 렌더링(그리기)
    renderer.render(scene, camera);
}

// 화면 크기가 바뀔 때 3D 캔버스 비율도 깨지지 않게 맞춰주는 이벤트
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// 게임 루프 시작!
animate();
