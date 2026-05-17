const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');

const scoreElement = document.getElementById('score');
const levelElement = document.getElementById('level');
const linesElement = document.getElementById('lines');
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const gameOverScreen = document.getElementById('game-over-screen');
const restartBtn = document.getElementById('restart-btn');

// 보드의 크기 설정
const ROWS = 20;
const COLS = 10;
const BLOCK_SIZE = 30; // 캔버스의 블록 1개 크기 (픽셀)
const NEXT_BLOCK_SIZE = 25; // 다음/홀드 블록 미리보기 캔버스의 블록 크기

// 블록 색상 (오리지널 테트리스 가이드라인 색상 적용)
const COLORS = [
    null,
    '#00ffff', // I - Cyan (하늘색)
    '#0000ff', // J - Blue (파란색)
    '#ffa500', // L - Orange (주황색)
    '#ffff00', // O - Yellow (노란색)
    '#00ff00', // S - Green (초록색)
    '#800080', // T - Purple (보라색)
    '#ff0000'  // Z - Red (빨간색)
];

// 테트로미노 모양(행렬) 정의
const SHAPES = [
    [],
    [[0,0,0,0], [1,1,1,1], [0,0,0,0], [0,0,0,0]], // I 모양
    [[2,0,0], [2,2,2], [0,0,0]], // J 모양
    [[0,0,3], [3,3,3], [0,0,0]], // L 모양
    [[4,4], [4,4]], // O 모양 (네모)
    [[0,5,5], [5,5,0], [0,0,0]], // S 모양
    [[0,6,0], [6,6,6], [0,0,0]], // T 모양
    [[7,7,0], [0,7,7], [0,0,0]]  // Z 모양
];

// 게임 상태 변수
let board = [];
let piece = null; // 현재 조종 중인 블록
let nextPieces = []; // 다음에 나올 블록들
let holdPiece = null; // 보관된 블록
let canHold = true; // 홀드 가능 여부 (연속 홀드 방지)

let score = 0;
let lines = 0;
let level = 1;

let dropCounter = 0; // 떨어지는 타이머
let dropInterval = 1000; // 블록이 한 칸 떨어지는 시간 (ms)
let lastTime = 0;
let isPaused = false;
let isGameOver = false;
let animationId; // 애니메이션 루프 ID

// 게임 초기화 함수
function initGame() {
    // 2차원 배열로 보드 생성 (0으로 채움)
    board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    score = 0;
    lines = 0;
    level = 1;
    dropInterval = 1000; // 초기 속도
    
    // 다음 나올 블록 3개 미리 생성
    nextPieces = [generatePiece(), generatePiece(), generatePiece()];
    holdPiece = null;
    canHold = true;
    
    updateScore();
    spawnPiece();
    
    isGameOver = false;
    isPaused = false;
    gameOverScreen.classList.add('hidden'); // 게임 오버 화면 숨김
    startBtn.textContent = '다시 시작';
    pauseBtn.disabled = false;
    pauseBtn.textContent = '일시정지';
}

// 무작위로 새로운 블록 생성하는 함수
function generatePiece() {
    const typeId = Math.floor(Math.random() * 7) + 1; // 1~7 사이의 랜덤 숫자
    return {
        type: typeId,
        matrix: SHAPES[typeId],
        // 보드 가운데 상단에 배치되도록 x, y 좌표 설정
        x: Math.floor(COLS / 2) - Math.floor(SHAPES[typeId][0].length / 2),
        y: 0
    };
}

// 다음 블록을 현재 블록으로 가져오기
function spawnPiece() {
    piece = nextPieces.shift(); // 큐에서 꺼내기
    nextPieces.push(generatePiece()); // 새 블록 큐에 추가
    
    piece.x = Math.floor(COLS / 2) - Math.floor(piece.matrix[0].length / 2);
    piece.y = 0;
    
    // 블록이 생성되자마자 다른 블록과 겹치면(충돌) 게임 오버
    if (collide(board, piece)) {
        gameOver();
    }
    
    drawNextPieces(); // 다음 블록 화면 갱신
    canHold = true; // 새 블록이 나오면 홀드 기능 활성화
}

// 블록이 벽이나 다른 블록에 부딪혔는지(충돌) 검사
function collide(board, piece) {
    const matrix = piece.matrix;
    for (let y = 0; y < matrix.length; ++y) {
        for (let x = 0; x < matrix[y].length; ++x) {
            // 블록의 일부가 존재하고(0이 아님), 보드의 해당 위치에 이미 무언가 있거나 바닥을 벗어났다면
            if (matrix[y][x] !== 0 &&
               (board[y + piece.y] && board[y + piece.y][x + piece.x]) !== 0) {
                return true; // 충돌 발생
            }
        }
    }
    return false; // 충돌 안함
}

// 블록이 바닥에 닿았을 때 보드에 고정(병합)하는 함수
function merge(board, piece) {
    piece.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                board[y + piece.y][x + piece.x] = value;
            }
        });
    });
}

// 행렬을 90도 회전시키는 함수
function rotate(matrix, dir) {
    // 행과 열을 바꿈 (전치 행렬)
    const rotated = matrix.map((_, index) => matrix.map(col => col[index]));
    // 방향에 따라 행을 뒤집음
    if (dir > 0) return rotated.map(row => row.reverse());
    return rotated.reverse();
}

// 플레이어가 블록을 회전시킬 때
function playerRotate(dir) {
    const pos = piece.x;
    let offset = 1;
    piece.matrix = rotate(piece.matrix, dir);
    
    // 벽 근처에서 회전할 때 벽 바깥으로 나가는 것을 방지 (간단한 Wall Kick)
    while (collide(board, piece)) {
        piece.x += offset;
        offset = -(offset + (offset > 0 ? 1 : -1));
        if (offset > piece.matrix[0].length) { // 해결 불가시 회전 취소
            piece.matrix = rotate(piece.matrix, -dir);
            piece.x = pos;
            return;
        }
    }
}

// 플레이어가 좌우로 움직일 때
function playerMove(dir) {
    piece.x += dir;
    if (collide(board, piece)) {
        piece.x -= dir; // 충돌하면 이동 취소
    }
}

// 블록 한 칸 아래로 떨어뜨리기 (소프트 드롭)
function playerDrop() {
    piece.y++;
    if (collide(board, piece)) {
        piece.y--; // 충돌하면 다시 위로 올림
        merge(board, piece); // 바닥에 고정
        clearLines(); // 줄 완성됐는지 먼저 확인하고 지움
        spawnPiece(); // 새 블록 생성
    }
    dropCounter = 0; // 타이머 초기화
}

// 블록을 바닥으로 단숨에 떨어뜨리기 (하드 드롭)
function playerHardDrop() {
    while (!collide(board, piece)) {
        piece.y++;
    }
    piece.y--;
    merge(board, piece);
    clearLines();
    spawnPiece();
    dropCounter = 0;
}

// 블록 보관하기 (홀드) 기능
function playerHold() {
    if (!canHold) return;
    
    if (holdPiece === null) {
        // 보관된 블록이 없으면 현재 블록 보관 후 새 블록 소환
        holdPiece = {
            type: piece.type,
            matrix: SHAPES[piece.type]
        };
        spawnPiece();
    } else {
        // 이미 보관된 블록이 있으면 현재 블록과 교체
        const temp = {
            type: piece.type,
            matrix: SHAPES[piece.type]
        };
        piece = {
            type: holdPiece.type,
            matrix: holdPiece.matrix,
            x: Math.floor(COLS / 2) - Math.floor(holdPiece.matrix[0].length / 2),
            y: 0
        };
        holdPiece = temp;
    }
    
    canHold = false; // 이번 턴에는 다시 홀드 불가
    drawHoldPiece();
    dropCounter = 0;
}

// 꽉 찬 줄 지우기 및 점수 계산
function clearLines() {
    let linesCleared = 0;
    
    outer: for (let y = ROWS - 1; y >= 0; y--) {
        for (let x = 0; x < COLS; x++) {
            if (board[y][x] === 0) { // 빈 칸이 하나라도 있으면 다음 줄로
                continue outer;
            }
        }
        
        // 꽉 찬 줄을 보드 배열에서 제거하고 맨 위에 빈 줄 추가
        const row = board.splice(y, 1)[0].fill(0);
        board.unshift(row);
        y++; // 인덱스 보정
        linesCleared++;
    }
    
    // 점수 계산 (지운 줄 수가 많을수록 점수가 큼)
    if (linesCleared > 0) {
        lines += linesCleared;
        
        if (linesCleared === 1) score += 100 * level;
        else if (linesCleared === 2) score += 300 * level;
        else if (linesCleared === 3) score += 500 * level;
        else if (linesCleared === 4) score += 800 * level; // 테트리스(4줄) 보너스
        
        level = Math.floor(lines / 10) + 1; // 10줄마다 레벨업
        // 레벨이 오를수록 블록 떨어지는 속도 증가
        dropInterval = Math.max(100, 1000 - (level - 1) * 100);
        
        updateScore();
    }
}

// 화면의 점수 텍스트 업데이트
function updateScore() {
    scoreElement.textContent = score;
    levelElement.textContent = level;
    linesElement.textContent = lines;
}

// 블록 1개(네모)를 예쁘게 그리는 함수 (3D 효과 추가)
function drawBlock(ctx, x, y, size, colorIndex) {
    const color = COLORS[colorIndex];
    
    ctx.fillStyle = color;
    ctx.fillRect(x * size, y * size, size, size); // 기본 색 채우기
    
    // 블록에 빛이 반사된 것 같은 입체 효과 (Highlight & Shadow)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillRect(x * size, y * size, size, size * 0.1); // 위쪽 밝게
    ctx.fillRect(x * size, y * size, size * 0.1, size); // 왼쪽 밝게
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(x * size, y * size + size * 0.9, size, size * 0.1); // 아래쪽 어둡게
    ctx.fillRect(x * size + size * 0.9, y * size, size * 0.1, size); // 오른쪽 어둡게
    
    // 블록 테두리
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.strokeRect(x * size, y * size, size, size);
}

// 보드 전체 화면 그리기
function draw() {
    // 배경을 어두운 색으로 지우기
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 그리드 선 그리기 (연하게)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    for(let x = 0; x < COLS; x++) {
        for(let y = 0; y < ROWS; y++) {
            ctx.strokeRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
        }
    }
    
    // 바닥에 쌓인 블록들 그리기
    drawMatrix(board, {x: 0, y: 0}, ctx, BLOCK_SIZE);
    
    if (piece) {
        // 떨어질 위치 미리보기(고스트 블록) 계산
        const ghost = { ...piece, y: piece.y };
        while (!collide(board, ghost)) {
            ghost.y++;
        }
        ghost.y--;
        
        // 고스트 블록 반투명하게 그리기
        ctx.globalAlpha = 0.2;
        drawMatrix(ghost.matrix, ghost, ctx, BLOCK_SIZE);
        ctx.globalAlpha = 1.0; // 원래 투명도로 원상복구
        
        // 현재 조종 중인 블록 그리기
        drawMatrix(piece.matrix, piece, ctx, BLOCK_SIZE);
    }
}

// 모양(행렬)을 화면에 그리는 역할 (x,y 좌표를 고려)
function drawMatrix(matrix, offset, context, size) {
    matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                drawBlock(context, x + offset.x, y + offset.y, size, value);
            }
        });
    });
}

// 우측의 "다음 블록" 패널 그리기
function drawNextPieces() {
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    nextPieces.forEach((p, index) => {
        const w = p.matrix[0].length;
        // 캔버스 중앙에 오도록 x축 오프셋 계산
        const offsetX = (nextCanvas.width / NEXT_BLOCK_SIZE - w) / 2;
        // 여러 블록이 세로로 나열되도록 y축 간격 조절
        const offsetY = 1 + index * 4; 
        
        drawMatrix(p.matrix, {x: offsetX, y: offsetY}, nextCtx, NEXT_BLOCK_SIZE);
    });
}

// 좌측의 "홀드(보관)" 패널 그리기
function drawHoldPiece() {
    holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
    if (holdPiece) {
        const w = holdPiece.matrix[0].length;
        const offsetX = (holdCanvas.width / NEXT_BLOCK_SIZE - w) / 2;
        const offsetY = 1;
        drawMatrix(holdPiece.matrix, {x: offsetX, y: offsetY}, holdCtx, NEXT_BLOCK_SIZE);
    }
}

// 게임 종료 처리
function gameOver() {
    isGameOver = true;
    cancelAnimationFrame(animationId); // 애니메이션 중지
    gameOverScreen.classList.remove('hidden'); // 게임 오버 문구 띄움
    pauseBtn.disabled = true;
}

// 프레임마다 실행되는 메인 게임 루프
function update(time = 0) {
    if (isPaused || isGameOver) return;

    const deltaTime = time - lastTime;
    lastTime = time;

    // 시간이 dropInterval(떨어지는 시간간격)만큼 지났으면 블록을 떨어뜨림
    dropCounter += deltaTime;
    if (dropCounter > dropInterval) {
        playerDrop();
    }

    draw(); // 화면 다시 그리기
    animationId = requestAnimationFrame(update); // 다음 프레임 예약
}

// 키보드 입력(이벤트) 감지
document.addEventListener('keydown', event => {
    if (isGameOver || isPaused) return;

    switch (event.keyCode) {
        case 37: // 키보드 왼쪽 방향키
            playerMove(-1);
            break;
        case 39: // 키보드 오른쪽 방향키
            playerMove(1);
            break;
        case 40: // 키보드 아래 방향키 (소프트 드롭)
            playerDrop();
            break;
        case 38: // 키보드 위 방향키 (회전)
            playerRotate(1);
            break;
        case 32: // 스페이스바 (하드 드롭, 즉시 바닥으로)
            playerHardDrop();
            // 스페이스바를 누를 때 화면이 아래로 스크롤 되는 것을 방지
            event.preventDefault(); 
            break;
        case 67: // 키보드 C (홀드, 블록 보관)
            playerHold();
            break;
    }
});

// 화면의 '시작' 버튼 클릭
startBtn.addEventListener('click', () => {
    cancelAnimationFrame(animationId); // 게임 루프 중복 방지
    initGame();
    lastTime = performance.now();
    update(performance.now());
    // 스페이스바로 버튼이 다시 눌리는 것을 방지하기 위해 포커스 해제
    startBtn.blur();
});

// 화면의 '일시정지' 버튼 클릭
pauseBtn.addEventListener('click', () => {
    if (isGameOver || !piece) return;
    
    isPaused = !isPaused;
    if (isPaused) {
        pauseBtn.textContent = '계속하기';
        cancelAnimationFrame(animationId);
    } else {
        pauseBtn.textContent = '일시정지';
        lastTime = performance.now();
        update(performance.now()); // 게임 루프 재개
    }
    pauseBtn.blur();
});

// 게임 오버 화면의 '다시 시작' 버튼 클릭
restartBtn.addEventListener('click', () => {
    cancelAnimationFrame(animationId);
    initGame();
    lastTime = performance.now();
    update(performance.now());
});

// 처음 웹페이지 켰을 때 검은 보드판 띄워두기
draw();
