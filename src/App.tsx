import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { Camera, Image as ImageIcon, RotateCcw, Download, Eye, Plus, Trash2, Check, X, Compass, Target, Home, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---
interface CapturedPhoto {
  id: string;
  blob: string;
  pitch: number; // Vertical angle (-90 to 90)
  yaw: number;   // Horizontal angle (0 to 360)
}

interface CaptureTarget {
  pitch: number;
  yaw: number;
  captured: boolean;
}

type AppScreen = 'home' | 'capture' | 'view';

// --- Constants ---
const TARGET_PITCHES = [-45, 0, 45]; // Three rows
const TARGET_YAWS = [0, 45, 90, 135, 180, 225, 270, 315]; // 8 photos per row
const TOTAL_TARGETS = TARGET_PITCHES.length * TARGET_YAWS.length;

// --- Components ---

const PanoramaViewer = ({ imageUrl, onBack }: { imageUrl: string, onBack: () => void }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const isUserInteracting = useRef(false);
  const onPointerDownMouseX = useRef(0);
  const onPointerDownMouseY = useRef(0);
  const onPointerDownLon = useRef(0);
  const onPointerDownLat = useRef(0);
  const lon = useRef(0);
  const lat = useRef(0);
  const phi = useRef(0);
  const theta = useRef(0);

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 1100);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const geometry = new THREE.SphereGeometry(500, 60, 40);
    geometry.scale(-1, 1, 1);

    const texture = new THREE.TextureLoader().load(imageUrl);
    const material = new THREE.MeshBasicMaterial({ map: texture });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const onPointerDown = (event: PointerEvent) => {
      if (event.isPrimary === false) return;
      isUserInteracting.current = true;
      onPointerDownMouseX.current = event.clientX;
      onPointerDownMouseY.current = event.clientY;
      onPointerDownLon.current = lon.current;
      onPointerDownLat.current = lat.current;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.isPrimary === false) return;
      if (isUserInteracting.current === true) {
        lon.current = (onPointerDownMouseX.current - event.clientX) * 0.1 + onPointerDownLon.current;
        lat.current = (event.clientY - onPointerDownMouseY.current) * 0.1 + onPointerDownLat.current;
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.isPrimary === false) return;
      isUserInteracting.current = false;
    };

    const onWheel = (event: WheelEvent) => {
      const fov = camera.fov + event.deltaY * 0.05;
      camera.fov = THREE.MathUtils.clamp(fov, 10, 75);
      camera.updateProjectionMatrix();
    };

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', onResize);
    containerRef.current.addEventListener('pointerdown', onPointerDown);
    containerRef.current.addEventListener('pointermove', onPointerMove);
    containerRef.current.addEventListener('pointerup', onPointerUp);
    containerRef.current.addEventListener('wheel', onWheel);

    const cameraTarget = new THREE.Vector3(0, 0, 0);

    const animate = () => {
      requestAnimationFrame(animate);
      lat.current = Math.max(-85, Math.min(85, lat.current));
      phi.current = THREE.MathUtils.degToRad(90 - lat.current);
      theta.current = THREE.MathUtils.degToRad(lon.current);
      cameraTarget.set(
        500 * Math.sin(phi.current) * Math.cos(theta.current),
        500 * Math.cos(phi.current),
        500 * Math.sin(phi.current) * Math.sin(theta.current)
      );
      camera.lookAt(cameraTarget);
      renderer.render(scene, camera);
    };

    animate();

    return () => {
      window.removeEventListener('resize', onResize);
      if (containerRef.current) {
        containerRef.current.removeEventListener('pointerdown', onPointerDown);
        containerRef.current.removeEventListener('pointermove', onPointerMove);
        containerRef.current.removeEventListener('pointerup', onPointerUp);
        containerRef.current.removeEventListener('wheel', onWheel);
        if (rendererRef.current) {
          containerRef.current.removeChild(rendererRef.current.domElement);
        }
      }
    };
  }, [imageUrl]);

  return (
    <div className="relative w-full h-full bg-black">
      <div ref={containerRef} className="w-full h-full cursor-move" />
      <button 
        onClick={onBack}
        className="absolute top-6 left-6 p-3 bg-black/50 backdrop-blur-md border border-white/10 text-white rounded-xl flex items-center gap-2 hover:bg-black/70 transition-all z-50"
      >
        <Home className="w-5 h-5" />
        <span>Home</span>
      </button>
    </div>
  );
};

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('home');
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [stitchedImage, setStitchedImage] = useState<string | null>(null);
  const [isStitching, setIsStitching] = useState(false);
  const [orientation, setOrientation] = useState({ alpha: 0, beta: 0, gamma: 0 });
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Orientation Logic ---
  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      setOrientation({
        alpha: event.alpha || 0,
        beta: event.beta || 0,
        gamma: event.gamma || 0
      });
    };

    if (screen === 'capture') {
      if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        (DeviceOrientationEvent as any).requestPermission()
          .then((response: string) => {
            if (response === 'granted') {
              window.addEventListener('deviceorientation', handleOrientation);
            }
          })
          .catch(console.error);
      } else {
        window.addEventListener('deviceorientation', handleOrientation);
      }
    }

    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, [screen]);

  // --- Camera Logic ---
  const startCamera = async () => {
    setCameraError(null);
    try {
      const constraints = {
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsCameraActive(true);
      }
    } catch (err: any) {
      console.error("Error accessing camera:", err);
      setCameraError(err.message || "Could not access camera. Please ensure you have granted permissions.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (context) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const blob = canvas.toDataURL('image/jpeg', 0.8);
        
        setPhotos(prev => [...prev, {
          id: Math.random().toString(36).substr(2, 9),
          blob,
          pitch: orientation.beta,
          yaw: orientation.alpha
        }]);
      }
    }
  };

  const deletePhoto = (id: string) => {
    setPhotos(prev => prev.filter(p => p.id !== id));
  };

  // --- Stitching Logic ---
  const buildPanorama = async () => {
    if (photos.length === 0) return;
    setIsStitching(true);

    try {
      const panoWidth = 4096;
      const panoHeight = 2048;
      const panoCanvas = document.createElement('canvas');
      panoCanvas.width = panoWidth;
      panoCanvas.height = panoHeight;
      const ctx = panoCanvas.getContext('2d');

      if (!ctx) throw new Error("Could not get canvas context");

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, panoWidth, panoHeight);

      const loadImg = (src: string): Promise<HTMLImageElement> => {
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.src = src;
        });
      };

      const sortedPhotos = [...photos].sort((a, b) => a.pitch - b.pitch || a.yaw - b.yaw);

      for (const photo of sortedPhotos) {
        const img = await loadImg(photo.blob);
        const x = ((photo.yaw % 360) / 360) * panoWidth;
        const y = ((photo.pitch + 90) / 180) * panoHeight;
        const drawWidth = panoWidth / 4;
        const drawHeight = panoHeight / 3;
        
        ctx.drawImage(img, x - drawWidth/2, y - drawHeight/2, drawWidth, drawHeight);
        
        if (x + drawWidth/2 > panoWidth) {
          ctx.drawImage(img, x - drawWidth/2 - panoWidth, y - drawHeight/2, drawWidth, drawHeight);
        }
        if (x - drawWidth/2 < 0) {
          ctx.drawImage(img, x - drawWidth/2 + panoWidth, y - drawHeight/2, drawWidth, drawHeight);
        }
      }

      const result = panoCanvas.toDataURL('image/jpeg', 0.9);
      setStitchedImage(result);
      setScreen('view');
      
      // Download automatically
      const link = document.createElement('a');
      link.download = `panorama-${Date.now()}.jpg`;
      link.href = result;
      link.click();
    } catch (err) {
      console.error("Stitching error:", err);
      alert("Failed to stitch panorama.");
    } finally {
      setIsStitching(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setStitchedImage(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // --- Guidance UI ---
  const targets: CaptureTarget[] = [];
  TARGET_PITCHES.forEach(p => {
    TARGET_YAWS.forEach(y => {
      const isCaptured = photos.some(photo => 
        Math.abs(photo.pitch - p) < 15 && Math.abs(((photo.yaw - y + 540) % 360) - 180) < 15
      );
      targets.push({ pitch: p, yaw: y, captured: isCaptured });
    });
  });

  const nextTarget = targets.find(t => !t.captured);
  
  const getTargetStyle = (target: CaptureTarget) => {
    const dy = target.pitch - orientation.beta;
    const dx = ((target.yaw - orientation.alpha + 540) % 360) - 180;
    const scale = 10;
    return {
      transform: `translate(${dx * scale}px, ${dy * scale}px)`,
      opacity: Math.max(0, 1 - (Math.sqrt(dx*dx + dy*dy) / 40))
    };
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-indigo-500/30 overflow-hidden">
      <AnimatePresence mode="wait">
        {screen === 'home' && (
          <motion.div 
            key="home"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-screen flex flex-col items-center justify-center p-6 gap-8 bg-radial-gradient from-zinc-900 to-zinc-950"
          >
            <div className="text-center space-y-2">
              <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center mx-auto shadow-2xl shadow-indigo-600/20 mb-6">
                <Camera className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-4xl font-black tracking-tighter text-white">PanoStudio</h1>
              <p className="text-zinc-500 font-medium">Capture your world in 360°</p>
            </div>

            <div className="w-full max-w-xs space-y-4">
              <button 
                onClick={() => { setScreen('capture'); startCamera(); }}
                className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold text-lg flex items-center justify-center gap-3 shadow-xl shadow-indigo-600/20 transition-all active:scale-95"
              >
                <Camera className="w-6 h-6" />
                Capture 360
              </button>
              <button 
                onClick={() => setScreen('view')}
                className="w-full py-5 bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-800 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all active:scale-95"
              >
                <Eye className="w-6 h-6" />
                View 360 Photo
              </button>
            </div>
          </motion.div>
        )}

        {screen === 'capture' && (
          <motion.div 
            key="capture"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-screen flex flex-col bg-black"
          >
            {/* Camera Viewport */}
            <div className="relative flex-1 overflow-hidden">
              {isCameraActive ? (
                <>
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted
                    className="w-full h-full object-cover"
                  />
                  
                  {/* Guidance */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-8 h-8 border-2 border-white/50 rounded-full flex items-center justify-center">
                      <div className="w-1 h-1 bg-white rounded-full" />
                    </div>
                    {nextTarget && (
                      <motion.div 
                        style={getTargetStyle(nextTarget)}
                        className="absolute w-14 h-14 border-4 border-indigo-500 rounded-full flex items-center justify-center bg-indigo-500/20 shadow-[0_0_20px_rgba(99,102,241,0.5)]"
                      >
                        <Target className="w-8 h-8 text-indigo-400" />
                      </motion.div>
                    )}
                  </div>

                  <div className="absolute top-6 left-6 flex items-center gap-3">
                    <button 
                      onClick={() => { stopCamera(); setScreen('home'); }}
                      className="p-3 bg-black/50 backdrop-blur-md border border-white/10 text-white rounded-xl"
                    >
                      <X className="w-5 h-5" />
                    </button>
                    <div className="bg-black/50 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 flex items-center gap-2">
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                      <span className="text-xs font-bold tracking-widest uppercase">{photos.length} / {TOTAL_TARGETS}</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center p-8 text-center gap-4">
                  {cameraError ? (
                    <p className="text-red-400 text-sm max-w-xs">{cameraError}</p>
                  ) : (
                    <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  )}
                  <button onClick={startCamera} className="px-6 py-2 bg-zinc-800 rounded-full text-sm font-bold">Retry Camera</button>
                </div>
              )}
            </div>

            {/* Controls Bar */}
            <div className="bg-zinc-950 border-t border-zinc-800 p-6 space-y-6">
              {/* Thumbnails */}
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide h-16 items-center">
                {photos.length === 0 ? (
                  <p className="text-zinc-600 text-xs font-medium w-full text-center italic">No photos captured yet</p>
                ) : (
                  photos.map((p, i) => (
                    <div key={p.id} className="relative flex-shrink-0 group">
                      <img src={p.blob} className="w-12 h-12 rounded-lg object-cover border border-zinc-800" />
                      <button 
                        onClick={() => deletePhoto(p.id)}
                        className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center justify-between gap-6">
                <button 
                  onClick={() => { if(confirm("Reset all?")) setPhotos([]); }}
                  className="p-4 bg-zinc-900 text-zinc-500 rounded-2xl hover:text-white transition-colors"
                >
                  <RotateCcw className="w-6 h-6" />
                </button>

                <button 
                  onClick={capturePhoto}
                  className="w-20 h-20 bg-white rounded-full border-4 border-zinc-300 active:scale-90 transition-all flex items-center justify-center shadow-2xl"
                >
                  <div className="w-14 h-14 bg-red-500 rounded-full border-2 border-white" />
                </button>

                <button 
                  disabled={photos.length < 4 || isStitching}
                  onClick={buildPanorama}
                  className="p-4 bg-indigo-600 disabled:bg-zinc-900 disabled:text-zinc-700 text-white rounded-2xl shadow-xl shadow-indigo-600/20 transition-all active:scale-95"
                >
                  {isStitching ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="w-6 h-6" />}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {screen === 'view' && (
          <motion.div 
            key="view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-screen bg-black flex flex-col"
          >
            {stitchedImage ? (
              <PanoramaViewer imageUrl={stitchedImage} onBack={() => setScreen('home')} />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6">
                <div className="w-20 h-20 bg-zinc-900 rounded-3xl flex items-center justify-center border border-zinc-800">
                  <ImageIcon className="w-10 h-10 text-zinc-700" />
                </div>
                <div className="text-center space-y-2">
                  <h3 className="text-xl font-bold">No Panorama Loaded</h3>
                  <p className="text-zinc-500 text-sm max-w-xs">Load a 360 panorama image from your device to view it interactively.</p>
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileSelect} 
                  accept="image/*" 
                  className="hidden" 
                />
                <div className="flex gap-4">
                  <button 
                    onClick={() => setScreen('home')}
                    className="px-6 py-3 bg-zinc-900 text-white rounded-xl font-bold border border-zinc-800"
                  >
                    Back
                  </button>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold flex items-center gap-2 shadow-xl shadow-indigo-600/20"
                  >
                    <Upload className="w-5 h-5" />
                    Load Image
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
