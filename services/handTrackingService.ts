
import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/+esm";

export class HandTrackingService {
  private handLandmarker: HandLandmarker | null = null;
  private lastVideoTime = -1;

  async initialize() {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm"
      );
      
      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.4, // 降低門檻，依靠 6.0 的緩衝與預測來處理雜訊
        minHandPresenceConfidence: 0.4,  
        minTrackingConfidence: 0.5      
      });
      return true;
    } catch (error) {
      console.error("追蹤系統啟動失敗:", error);
      return false;
    }
  }

  detect(video: HTMLVideoElement) {
    if (!this.handLandmarker) return null;
    if (video.currentTime !== this.lastVideoTime && video.readyState >= 2) {
      this.lastVideoTime = video.currentTime;
      return this.handLandmarker.detectForVideo(video, performance.now());
    }
    return null;
  }
}

export const handTrackingService = new HandTrackingService();
