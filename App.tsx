
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { audioService } from './services/audioService';
import { handTrackingService } from './services/handTrackingService';
import { GameObject, GameObjectType, GameState, Particle, FloatingText, HandData, Cloud } from './types';

// 核心常數
const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;
const OBJECT_RADIUS = 40;

// 穩定追蹤 7.0 參數 (Refined for maximum stability)
const PERSISTENCE_FRAMES = 20; 
const MAX_MATCH_DIST = 350; 
const GRACE_PERIOD = 5;

// Adaptive Smoothing Parameters
const MIN_SMOOTHING = 0.15; // 靜止時非常平滑 (抗抖動)
const MAX_SMOOTHING = 0.8;  // 移動時反應靈敏 (低延遲)
const STABILITY_THRESHOLD = 3; // 需要連續偵測多少幀才算穩定出現

const BIRD_EMOJIS = ['🦅', '🕊️', '🐦', '🦉', '🦜']; 

interface TrackedHand extends HandData {
  id: number;
  alpha: number;
  framesMissing: number;
  framesDetected: number; // 新增：用於計算穩定度，防止閃爍
  vx: number;
  vy: number;
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const frameCountRef = useRef(0);
  
  const objectsRef = useRef<GameObject[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const cloudsRef = useRef<Cloud[]>([]); 
  const scoreRef = useRef(0);
  const livesRef = useRef(5);
  const trackedHandsRef = useRef<TrackedHand[]>([]);
  
  const isGameOverRef = useRef(false);
  const isPlayingRef = useRef(false);
  const isPausedRef = useRef(false);
  
  const [speedFactor, setSpeedFactor] = useState(0.4); 
  const [spawnFreq, setSpawnFreq] = useState(1.0);
  const [highScore, setHighScore] = useState(0);
  const [initialLives, setInitialLives] = useState(5);

  const [gameState, setGameState] = useState<GameState & { isPaused: boolean }>({
    score: 0, isPlaying: false, gameOver: false, lives: 5, highScore: 0, isPaused: false
  });
  const [trackerReady, setTrackerReady] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  useEffect(() => {
    const savedScore = localStorage.getItem('SKY_CATCH_HIGHSCORE');
    if (savedScore) setHighScore(parseInt(savedScore));
    
    initClouds();

    async function setup() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: 1280, height: 720, facingMode: "user" },
          audio: false 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => videoRef.current?.play();
        }
        const success = await handTrackingService.initialize();
        setTrackerReady(success);
      } catch (err) {
        console.error("啟動失敗:", err);
      }
    }
    setup();
  }, []);

  const initClouds = () => {
    const clouds: Cloud[] = [];
    for (let i = 0; i < 8; i++) {
        clouds.push({
            x: Math.random() * CANVAS_WIDTH,
            y: Math.random() * (CANVAS_HEIGHT / 2),
            speed: 0.2 + Math.random() * 0.4,
            scale: 0.5 + Math.random() * 1.0,
            opacity: 0.4 + Math.random() * 0.4
        });
    }
    cloudsRef.current = clouds;
  };

  const triggerShake = () => {
    setIsShaking(false);
    setTimeout(() => setIsShaking(true), 10);
    setTimeout(() => setIsShaking(false), 510);
  };

  const createExplosion = (x: number, y: number, color: string) => {
    for (let i = 0; i < 15; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 5 + 3;
      particlesRef.current.push({
        id: Math.random().toString(36), x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 1.0, color, size: Math.random() * 5 + 2
      });
    }
  };

  const createFloatingText = (x: number, y: number, text: string, color: string) => {
    floatingTextsRef.current.push({ id: Math.random().toString(36), x, y, text, life: 1.0, color });
  };

  const endGame = useCallback(() => {
    isGameOverRef.current = true;
    isPlayingRef.current = false;
    isPausedRef.current = false;
    audioService.stopMusic();
    if (scoreRef.current > highScore) {
      setHighScore(scoreRef.current);
      localStorage.setItem('SKY_CATCH_HIGHSCORE', scoreRef.current.toString());
    }
    setGameState(prev => ({ 
      ...prev, score: scoreRef.current, gameOver: true, isPlaying: false, isPaused: false,
      highScore: Math.max(highScore, scoreRef.current) 
    }));
  }, [highScore]);

  const startGame = () => {
    scoreRef.current = 0; livesRef.current = initialLives;
    objectsRef.current = []; particlesRef.current = []; floatingTextsRef.current = [];
    isGameOverRef.current = false; isPlayingRef.current = true; isPausedRef.current = false;
    setGameState({ score: 0, lives: initialLives, isPlaying: true, gameOver: false, highScore, isPaused: false });
    audioService.startMusic();
    initClouds(); 
  };

  const togglePause = () => {
    if (!isPlayingRef.current || isGameOverRef.current) return;
    isPausedRef.current = !isPausedRef.current;
    setGameState(prev => ({ ...prev, isPaused: isPausedRef.current }));
    if (isPausedRef.current) audioService.stopMusic();
    else audioService.startMusic();
  };

  const exitGame = () => {
    isPlayingRef.current = false; isPausedRef.current = false; isGameOverRef.current = false;
    audioService.stopMusic();
    setGameState(prev => ({ ...prev, isPlaying: false, gameOver: false, isPaused: false }));
  };

  const updateGameLogic = useCallback(() => {
    if (!isPlayingRef.current || isGameOverRef.current || isPausedRef.current) return;
    frameCountRef.current++;
    
    const spawnRate = Math.max(15, Math.floor((80 / spawnFreq) - (scoreRef.current / 50)));
    
    if (frameCountRef.current % spawnRate === 0) {
      const isBomb = Math.random() < 0.18;
      const radius = OBJECT_RADIUS;
      const diff = speedFactor * (1 + (scoreRef.current / 1500)); 
      let x, y, speedX, speedY;

      if (isBomb) {
        x = Math.random() * (CANVAS_WIDTH - radius * 2) + radius; y = -radius;
        speedX = (Math.random() - 0.5) * 2 * diff; speedY = -(2 + Math.random() * 2) * diff; 
      } else {
        const side = Math.random(); 
        if (side < 0.3) {
            x = Math.random() * (CANVAS_WIDTH - radius * 2) + radius; y = CANVAS_HEIGHT + radius;
            speedX = (Math.random() - 0.5) * 3 * diff; speedY = (1.5 + Math.random() * 2) * diff;
        } else {
            const isLeft = Math.random() < 0.5;
            x = isLeft ? -radius : CANVAS_WIDTH + radius;
            y = Math.random() * (CANVAS_HEIGHT * 0.7);
            speedX = (isLeft ? 1 : -1) * (1.5 + Math.random() * 3) * diff; speedY = (Math.random() - 0.5) * 1.5 * diff;
        }
      }

      objectsRef.current.push({
        id: Math.random().toString(36), type: isBomb ? GameObjectType.BOMB : GameObjectType.BIRD,
        x, y, radius, speedY, speedX, color: '', caught: false, 
        emoji: isBomb ? '💣' : BIRD_EMOJIS[Math.floor(Math.random() * BIRD_EMOJIS.length)],
        flapPhase: Math.random() * Math.PI * 2
      });
    }

    // 更新雲朵位置
    cloudsRef.current.forEach(cloud => {
        cloud.x += cloud.speed;
        if (cloud.x > CANVAS_WIDTH + 100) {
            cloud.x = -100;
            cloud.y = Math.random() * (CANVAS_HEIGHT / 2);
        }
    });

    objectsRef.current.forEach(obj => {
      obj.y -= obj.speedY; obj.x += obj.speedX;
      if (!obj.caught) {
        for (const hand of trackedHandsRef.current) {
            // Stability Check: 只有當手部穩定偵測超過閾值時才允許互動
            if (hand.framesDetected < STABILITY_THRESHOLD) continue;
            
            // 判定範圍調整
            const dx = hand.x - obj.x; const dy = hand.y - obj.y;
            if (Math.sqrt(dx * dx + dy * dy) < obj.radius + 60) {
                obj.caught = true;
                if (obj.type === GameObjectType.BIRD) {
                    scoreRef.current += 10; audioService.playBirdSound();
                    createExplosion(obj.x, obj.y, '#FFEB3B'); createFloatingText(obj.x, obj.y, "+10", "#FFD700");
                } else {
                    livesRef.current -= 1; audioService.playBombSound();
                    createExplosion(obj.x, obj.y, '#FF5252'); triggerShake();
                }
                break;
            }
        }
      }
    });

    objectsRef.current = objectsRef.current.filter(obj => !obj.caught && obj.y > -500 && obj.y < CANVAS_HEIGHT + 500 && obj.x > -500 && obj.x < CANVAS_WIDTH + 500);
    particlesRef.current.forEach(p => { p.x += p.vx; p.y += p.vy; p.life -= 0.025; p.vy += 0.12; });
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);
    floatingTextsRef.current.forEach(t => { t.y -= 1.0; t.life -= 0.015; });
    floatingTextsRef.current = floatingTextsRef.current.filter(t => t.life > 0);
    
    if (livesRef.current <= 0) endGame();
    else setGameState(prev => ({ ...prev, score: scoreRef.current, lives: livesRef.current }));
  }, [speedFactor, spawnFreq, endGame]);

  const draw = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1.0;

    // 1. 背景天空
    const skyGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    skyGrad.addColorStop(0, "#03A9F4"); skyGrad.addColorStop(1, "#81D4FA");
    ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 2. 繪製白雲
    cloudsRef.current.forEach(cloud => {
        ctx.save();
        ctx.translate(cloud.x, cloud.y);
        ctx.scale(cloud.scale, cloud.scale);
        ctx.globalAlpha = cloud.opacity;
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.arc(0, 0, 30, 0, Math.PI * 2);
        ctx.arc(25, -10, 35, 0, Math.PI * 2);
        ctx.arc(50, 0, 30, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });

    // 3. 多層次山景
    ctx.save();
    // 遠山
    ctx.fillStyle = "#C8E6C9"; 
    ctx.beginPath(); ctx.moveTo(0, CANVAS_HEIGHT); ctx.lineTo(0, CANVAS_HEIGHT - 150);
    ctx.bezierCurveTo(200, CANVAS_HEIGHT - 250, 500, CANVAS_HEIGHT - 50, 700, CANVAS_HEIGHT - 200);
    ctx.bezierCurveTo(900, CANVAS_HEIGHT - 350, 1200, CANVAS_HEIGHT - 100, 1280, CANVAS_HEIGHT - 180);
    ctx.lineTo(1280, CANVAS_HEIGHT); ctx.fill();
    // 中山
    ctx.fillStyle = "#81C784";
    ctx.beginPath(); ctx.moveTo(0, CANVAS_HEIGHT); ctx.lineTo(0, CANVAS_HEIGHT - 100);
    ctx.bezierCurveTo(300, CANVAS_HEIGHT - 200, 600, CANVAS_HEIGHT - 150, 900, CANVAS_HEIGHT - 250);
    ctx.bezierCurveTo(1100, CANVAS_HEIGHT - 300, 1280, CANVAS_HEIGHT - 150, 1280, CANVAS_HEIGHT);
    ctx.fill();
    // 近山
    ctx.fillStyle = "#43A047"; 
    ctx.beginPath(); ctx.moveTo(0, CANVAS_HEIGHT); ctx.lineTo(0, CANVAS_HEIGHT - 220);
    ctx.bezierCurveTo(300, CANVAS_HEIGHT - 380, 600, CANVAS_HEIGHT - 200, 900, CANVAS_HEIGHT - 350);
    ctx.bezierCurveTo(1100, CANVAS_HEIGHT - 420, 1280, CANVAS_HEIGHT - 300, 1280, CANVAS_HEIGHT - 250);
    ctx.lineTo(1280, CANVAS_HEIGHT); ctx.fill();
    ctx.restore();

    // 4. 物件
    objectsRef.current.forEach(obj => {
      ctx.save();
      let scaleX = 1, scaleY = 1, rotation = 0;
      if (obj.type === GameObjectType.BIRD) {
          const flap = Math.sin(Date.now() * 0.02 + obj.flapPhase);
          scaleY = 1 + flap * 0.3; scaleX = 1 - Math.abs(flap) * 0.15;
          rotation = flap * 0.1; if (obj.speedX > 0) scaleX *= -1;
      } else {
          const pulse = Math.sin(Date.now() / 200) * 0.12;
          scaleX = 1 + pulse; scaleY = 1 + pulse;
      }
      ctx.translate(obj.x, obj.y); ctx.rotate(rotation); ctx.scale(scaleX, scaleY);
      ctx.font = '80px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(obj.emoji, 0, 0);
      ctx.restore();
    });

    // 5. 特效
    particlesRef.current.forEach(p => {
      ctx.save(); ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    });
    floatingTextsRef.current.forEach(t => {
      ctx.save(); ctx.globalAlpha = t.life; ctx.fillStyle = t.color; ctx.font = "bold 55px Arial"; ctx.textAlign = "center";
      ctx.fillText(t.text, t.x, t.y); ctx.restore();
    });

    // 6. 手掌 (縮小一倍)
    trackedHandsRef.current.forEach(h => {
      // 根據穩定度 (framesDetected) 慢慢顯示手掌，避免閃爍
      const entryOpacity = Math.min(1, h.framesDetected / 4);
      const finalOpacity = h.alpha * entryOpacity;

      if (finalOpacity <= 0.05) return;
      ctx.save();
      ctx.globalAlpha = finalOpacity;
      
      const glowSize = h.framesMissing > 0 ? 50 : 70;
      const g = ctx.createRadialGradient(h.x, h.y, 5, h.x, h.y, glowSize);
      g.addColorStop(0, h.framesMissing > 0 ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.9)"); 
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(h.x, h.y, glowSize, 0, Math.PI * 2); ctx.fill();
      ctx.translate(h.x, h.y); 
      if (h.side === 'Left') ctx.scale(-1, 1);
      ctx.font = `${h.framesMissing > 0 ? 60 : 80}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('✋', 0, 0); 
      ctx.restore();
    });

    if (isPausedRef.current) {
        ctx.save(); ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.fillStyle = "white"; ctx.font = "bold 120px Arial"; ctx.textAlign = "center";
        ctx.fillText("已暫停", CANVAS_WIDTH/2, CANVAS_HEIGHT/2); ctx.restore();
    }
  }, []);

  const processTracking = useCallback(() => {
    if (!videoRef.current || !trackerReady) return;
    const res = handTrackingService.detect(videoRef.current);
    const detections: { x: number, y: number, side: 'Left' | 'Right' }[] = [];
    if (res && res.landmarks) {
      res.landmarks.forEach((landmarkSet, i) => {
          const landmark = landmarkSet[9]; 
          detections.push({
            x: (1 - landmark.x) * CANVAS_WIDTH, y: landmark.y * CANVAS_HEIGHT,
            side: (res.handedness[i]?.[0].categoryName === 'Left' ? 'Right' : 'Left') as 'Left' | 'Right'
          });
      });
    }

    // --- 穩定追蹤核心邏輯 ---
    const nextHands: TrackedHand[] = [];
    const usedDetections = new Set<number>();

    // 1. 更新現有手掌
    trackedHandsRef.current.forEach(hand => {
      // 預測位置 (加上阻尼，避免過度預測)
      const predX = hand.x + hand.vx * 0.8;
      const predY = hand.y + hand.vy * 0.8;

      let bestIdx = -1; 
      let bestDist = MAX_MATCH_DIST;

      // 尋找最佳匹配
      detections.forEach((det, idx) => {
        if (usedDetections.has(idx)) return;
        const d = Math.sqrt(Math.pow(det.x - predX, 2) + Math.pow(det.y - predY, 2));
        
        // 優先匹配同側手 (Distance penalty if sides don't match)
        const sideBonus = (hand.side === det.side) ? 0.6 : 1.0; 
        const weightedDist = d * sideBonus;

        if (weightedDist < bestDist) { 
          bestDist = weightedDist; 
          bestIdx = idx; 
        }
      });

      if (bestIdx !== -1) {
        // 成功匹配
        const det = detections[bestIdx]; 
        usedDetections.add(bestIdx);
        
        // 自適應平滑 (Adaptive Smoothing)
        // 計算移動距離
        const moveDist = Math.sqrt(Math.pow(det.x - hand.x, 2) + Math.pow(det.y - hand.y, 2));
        
        // 動態 Alpha 計算:
        // 距離小 (靜止/慢動) -> Alpha 小 (強平滑) -> 消除抖動
        // 距離大 (快動) -> Alpha 大 (弱平滑) -> 減少延遲
        const adaptiveAlpha = MIN_SMOOTHING + (Math.min(moveDist, 150) / 150) * (MAX_SMOOTHING - MIN_SMOOTHING);

        const smoothX = hand.x + (det.x - hand.x) * adaptiveAlpha;
        const smoothY = hand.y + (det.y - hand.y) * adaptiveAlpha;
        
        nextHands.push({
          ...hand, 
          x: smoothX, 
          y: smoothY,
          vx: smoothX - hand.x, // 計算瞬時速度
          vy: smoothY - hand.y,
          framesMissing: 0, 
          alpha: 1.0, 
          framesDetected: hand.framesDetected + 1, // 增加穩定度計數
          side: det.side
        });
      } else if (hand.framesMissing < PERSISTENCE_FRAMES) {
        // 遺失追蹤：使用慣性預測，但會慢慢停下來 (Damping)
        const damping = 0.9;
        const nextVx = hand.vx * damping;
        const nextVy = hand.vy * damping;
        
        const nextFramesMissing = hand.framesMissing + 1;
        
        // Grace Period: 剛遺失時不馬上變透明
        let newAlpha = hand.alpha;
        if (nextFramesMissing > GRACE_PERIOD) {
           newAlpha = Math.max(0, hand.alpha - 0.1); // 慢慢淡出
        }

        nextHands.push({
          ...hand, 
          x: hand.x + nextVx, 
          y: hand.y + nextVy, 
          vx: nextVx, 
          vy: nextVy,
          framesMissing: nextFramesMissing, 
          framesDetected: hand.framesDetected, // 保持穩定度計數
          alpha: newAlpha
        });
      }
    });

    // 2. 新增手掌
    detections.forEach((det, idx) => {
      if (!usedDetections.has(idx)) {
        nextHands.push({ 
          id: Date.now() + idx, 
          x: det.x, 
          y: det.y, 
          vx: 0, 
          vy: 0, 
          side: det.side, 
          alpha: 1.0, 
          framesMissing: 0,
          framesDetected: 1 // 初始穩定度為 1
        });
      }
    });

    trackedHandsRef.current = nextHands;
  }, [trackerReady]);

  const loop = useCallback(() => {
    if (!canvasRef.current || !videoRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    processTracking();
    updateGameLogic();
    draw(ctx);
    requestRef.current = requestAnimationFrame(loop);
  }, [processTracking, updateGameLogic, draw]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(loop);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); audioService.stopMusic(); };
  }, [loop]);

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-black">
      <video ref={videoRef} className="absolute opacity-0" playsInline muted autoPlay />
      <div className={`relative w-full h-full flex items-center justify-center ${isShaking ? 'shake-active' : ''}`}>
        <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />
      </div>

      {gameState.isPlaying && (
        <>
          <div className="absolute top-4 left-4 flex flex-col gap-2 pointer-events-none select-none">
            <div className="bg-white/30 backdrop-blur-md p-4 rounded-3xl text-white border border-white/20 shadow-lg scale-90 origin-top-left">
              <div className="text-3xl font-black text-yellow-300 drop-shadow-md">得分: {gameState.score}</div>
              <div className="text-xl mt-1">生命: {'❤️'.repeat(gameState.lives)}</div>
            </div>
          </div>
          <div className="absolute top-4 right-4 flex gap-3">
            <button onClick={togglePause} className="bg-white/40 backdrop-blur-md p-3 px-6 rounded-2xl text-white text-2xl hover:bg-white/60 active:scale-90 transition-all shadow-lg font-bold">
                {gameState.isPaused ? '▶️ 繼續' : '⏸️ 暫停'}
            </button>
            <button onClick={exitGame} className="bg-white/40 backdrop-blur-md p-3 px-6 rounded-2xl text-white text-2xl hover:bg-white/60 active:scale-90 transition-all shadow-lg font-bold">🚪 退出</button>
          </div>
        </>
      )}

      {(!gameState.isPlaying || gameState.gameOver) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50 p-4">
          <div className="bg-white/95 p-8 rounded-[40px] text-center shadow-2xl border-b-[8px] border-sky-300 max-w-lg w-full">
            <h2 className="text-5xl font-black text-sky-600 mb-4">{gameState.gameOver ? '遊戲結束!' : '空中捉雀鳥 🦅'}</h2>
            <div className="bg-sky-50 p-6 rounded-[30px] mb-8 flex justify-between items-center border-2 border-sky-100">
              <div className="text-left"><p className="text-gray-400 text-xs font-bold uppercase tracking-widest">歷史最高</p><p className="text-4xl font-black text-sky-900">{highScore}</p></div>
              {gameState.gameOver && (<div className="text-right"><p className="text-gray-400 text-xs font-bold uppercase tracking-widest">本次得分</p><p className="text-4xl font-black text-sky-500">{gameState.score}</p></div>)}
            </div>
            <div className="space-y-6 mb-10 text-left px-2">
              <label className="block">
                <div className="flex justify-between mb-1"><span className="text-gray-600 text-lg font-bold">飛行速度</span><span className="text-sky-500 text-xl font-black">{speedFactor.toFixed(1)}x</span></div>
                <input type="range" min="0.1" max="1.5" step="0.1" value={speedFactor} onChange={(e) => setSpeedFactor(parseFloat(e.target.value))} className="w-full accent-sky-500 h-3" />
              </label>
              <label className="block">
                <div className="flex justify-between mb-1"><span className="text-gray-600 text-lg font-bold">雀鳥密度</span><span className="text-sky-500 text-xl font-black">{spawnFreq.toFixed(1)}x</span></div>
                <input type="range" min="0.5" max="3.0" step="0.1" value={spawnFreq} onChange={(e) => setSpawnFreq(parseFloat(e.target.value))} className="w-full accent-sky-500 h-3" />
              </label>
              <label className="block">
                <div className="flex justify-between mb-1"><span className="text-gray-600 text-lg font-bold">起始心心</span><span className="text-red-500 text-xl font-black">{initialLives} 個</span></div>
                <input type="range" min="1" max="10" step="1" value={initialLives} onChange={(e) => setInitialLives(parseInt(e.target.value))} className="w-full accent-red-500 h-3" />
              </label>
            </div>
            <button onClick={startGame} className="w-full bg-sky-500 hover:bg-sky-600 text-white py-6 rounded-[30px] text-4xl font-black shadow-xl active:scale-95 transition-all mb-4">
                {gameState.gameOver ? '再試一次' : '開始飛行'}
            </button>
            {!trackerReady && <p className="mt-6 text-sky-400 font-bold animate-pulse text-xl">⚡ 系統準備中...</p>}
          </div>
        </div>
      )}
    </div>
  );
}
