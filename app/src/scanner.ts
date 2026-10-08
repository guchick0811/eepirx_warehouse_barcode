// 相機條碼掃描：優先用瀏覽器原生 BarcodeDetector（Android Chrome），
// 否則用 zxing-wasm ponyfill（iOS Safari）。wasm 由本機打包提供，不連 CDN。
import { BarcodeDetector as ZXingDetector, prepareZXingModule } from "barcode-detector/ponyfill";
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"] as const;
type Format = (typeof FORMATS)[number];

interface DetectorLike {
  detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string; format: string }>>;
}
interface DetectorCtor {
  new (opts: { formats: Format[] }): DetectorLike;
  getSupportedFormats(): Promise<readonly string[]>;
}

let detectorPromise: Promise<DetectorLike> | null = null;

async function getDetector(): Promise<DetectorLike> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const native = (globalThis as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
      if (native) {
        try {
          const supported = await native.getSupportedFormats();
          if (supported.includes("ean_13")) {
            return new native({ formats: FORMATS.filter((f) => supported.includes(f)) });
          }
        } catch {
          /* 原生不可用就改用 ponyfill */
        }
      }
      prepareZXingModule({
        overrides: {
          locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path),
        },
        fireImmediately: true,
      });
      return new ZXingDetector({ formats: [...FORMATS] }) as unknown as DetectorLike;
    })();
  }
  return detectorPromise;
}

/** 對單張影像（相片、canvas）辨識條碼；也供測試用 */
export async function detectImage(source: ImageBitmapSource): Promise<Array<{ value: string; format: string }>> {
  const detector = await getDetector();
  const results = await detector.detect(source);
  return results.map((r) => ({ value: r.rawValue, format: r.format }));
}

export type ScanCallback = (value: string, format: string) => void;

export class ScannerError extends Error {}

export class Scanner {
  private stream: MediaStream | null = null;
  private timer: number | null = null;
  private busy = false;
  private paused = false;
  private lastValue = "";
  private lastAt = 0;

  constructor(private video: HTMLVideoElement) {}

  async start(onDetect: ScanCallback): Promise<void> {
    if (!window.isSecureContext) throw new ScannerError("相機功能需要 HTTPS 連線");
    if (!navigator.mediaDevices?.getUserMedia) throw new ScannerError("此瀏覽器不支援相機");
    const detector = await getDetector();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
    } catch (e) {
      const name = (e as { name?: string }).name ?? "";
      if (name === "NotAllowedError") throw new ScannerError("相機權限被拒絕，請到系統設定允許此 APP 使用相機");
      if (name === "NotFoundError") throw new ScannerError("找不到可用的相機");
      throw new ScannerError("無法開啟相機：" + name);
    }
    this.video.srcObject = this.stream;
    this.video.setAttribute("playsinline", "true");
    this.video.muted = true;
    await this.video.play();
    this.paused = false;
    this.timer = window.setInterval(() => void this.tick(detector, onDetect), 120);
  }

  private async tick(detector: DetectorLike, onDetect: ScanCallback): Promise<void> {
    if (this.busy || this.paused || this.video.readyState < 2) return;
    this.busy = true;
    try {
      const results = await detector.detect(this.video);
      const hit = results.find((r) => r.rawValue && r.rawValue.trim());
      if (hit) {
        const value = hit.rawValue.trim();
        const now = Date.now();
        if (value !== this.lastValue || now - this.lastAt > 1500) {
          this.lastValue = value;
          this.lastAt = now;
          this.paused = true;
          onDetect(value, hit.format);
        }
      }
    } catch {
      /* 單格偵測失敗就等下一格 */
    } finally {
      this.busy = false;
    }
  }

  resume(): void {
    this.paused = false;
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }
}

/** 掃到條碼時的回饋：震動＋短提示音 */
export function feedback(): void {
  try {
    navigator.vibrate?.(80);
  } catch {
    /* 不支援就略過 */
  }
  try {
    const AC = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 1760;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    osc.onended = () => void ctx.close();
  } catch {
    /* 無法發聲就略過 */
  }
}
