import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { Camera, Image as ImageIcon, RotateCcw, Download, Eye, Plus, Trash2, Check, X, Compass, Target } from 'lucide-react';
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

type AppMode = 'capture' | 'view';

// --- Constants ---
const TARGET_PITCHES = [-45, 0, 45]; // Three rows
const TARGET_YAWS = [0, 45, 90, 135, 180, 225, 270, 315]; // 8 photos per row
const TOTAL_TARGETS = TARGET_PITCHES.length * TARGET_YAWS.length;

// --- Components ---

const PanoramaViewer = ({ imageUrl }: { imageUrl: string }) => {
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

  return <div ref={containerRef} className="w-full h-full bg-black cursor-move" />;
};

export default function App() {
  const [mode, setMode] = useState<AppMode>('capture');
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [stitchedImage, setStitchedImage] = useState<string | null>(null);
  const [isStitching, setIsStitching] = useState(false);
  const [orientation, setOrientation] = useState({ alpha: 0, beta: 0, gamma: 0 });
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // --- Orientation Logic ---
  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      setOrientation({
        alpha: event.alpha || 0, // Yaw (0-360)
        beta: event.beta || 0,   // Pitch (-180 to 180)
        gamma: event.gamma || 0  // Roll (-90 to 90)
      });
    };

    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      // iOS 13+ requires permission
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

    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, []);

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
        
        // Use current orientation for mapping
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

      // Sort photos by pitch then yaw for better layering
      const sortedPhotos = [...photos].sort((a, b) => a.pitch - b.pitch || a.yaw - b.yaw);

      for (const photo of sortedPhotos) {
        const img = await loadImg(photo.blob);
        
        // Map pitch/yaw to x/y
        // Pitch: -90 to 90 -> 0 to panoHeight
        // Yaw: 0 to 360 -> 0 to panoWidth
        const x = ((photo.yaw % 360) / 360) * panoWidth;
        const y = ((photo.pitch + 90) / 180) * panoHeight;
        
        const drawWidth = panoWidth / 4; // Assume 4 photos cover the width roughly
        const drawHeight = panoHeight / 3; // Assume 3 rows cover height
        
        ctx.drawImage(img, x - drawWidth/2, y - drawHeight/2, drawWidth, drawHeight);
        
        // Handle wrap-around for yaw
        if (x + drawWidth/2 > panoWidth) {
          ctx.drawImage(img, x - drawWidth/2 - panoWidth, y - drawHeight/2, drawWidth, drawHeight);
        }
        if (x - drawWidth/2 < 0) {
          ctx.drawImage(img, x - drawWidth/2 + panoWidth, y - drawHeight/2, drawWidth, drawHeight);
        }
      }

      const result = panoCanvas.toDataURL('image/jpeg', 0.9);
      setStitchedImage(result);
      setMode('view');
    } catch (err) {
      console.error("Stitching error:", err);
      alert("Failed to stitch panorama.");
    } finally {
      setIsStitching(false);
    }
  };

  const downloadPanorama = () => {
    if (!stitchedImage) return;
    const link = document.createElement('a');
    link.download = `panorama-${Date.now()}.jpg`;
    link.href = stitchedImage;
    link.click();
  };

  const resetCapture = () => {
    if (confirm("Are you sure you want to clear all photos?")) {
      setPhotos([]);
      setStitchedImage(null);
    }
  };

  // --- Guidance UI ---
  // Find the nearest target that hasn't been captured
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
  
  // Calculate relative position for the blue circle
  // We'll map the next target's pitch/yaw relative to current orientation
  const getTargetStyle = (target: CaptureTarget) => {
    const dy = target.pitch - orientation.beta;
    const dx = ((target.yaw - orientation.alpha + 540) % 360) - 180;
    
    // Simple projection for UI
    const scale = 10;
    return {
      transform: `translate(${dx * scale}px, ${dy * scale}px)`,
      opacity: Math.max(0, 1 - (Math.sqrt(dx*dx + dy*dy) / 40))
    };
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-indigo-500/30">
      <header className="fixed top-0 left-0 right-0 z-50 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Camera className="w-5 h-5 text-white" />
          </div>
          <h1 className="font-bold text-lg tracking-tight">PanoCapture</h1>
        </div>
        
        <nav className="flex bg-zinc-900 rounded-full p-1 border border-zinc-800">
          <button 
            onClick={() => setMode('capture')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${mode === 'capture' ? 'bg-indigo-600 text-white shadow-lg' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            Capture
          </button>
          <button 
            onClick={() => setMode('view')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${mode === 'view' ? 'bg-indigo-600 text-white shadow-lg' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            View
          </button>
        </nav>
      </header>

      <main className="pt-16 pb-24 h-screen overflow-hidden flex flex-col">
        <AnimatePresence mode="wait">
          {mode === 'capture' ? (
            <motion.div 
              key="capture"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex-1 flex flex-col p-4 gap-4 overflow-hidden"
            >
              {/* Camera Preview with Guidance */}
              <div className="relative aspect-[3/4] sm:aspect-video bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl">
                {isCameraActive ? (
                  <>
                    <video 
                      ref={videoRef} 
                      autoPlay 
                      playsInline 
                      className="w-full h-full object-cover"
                    />
                    
                    {/* Guidance Overlay */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      {/* Center Pinpoint */}
                      <div className="w-8 h-8 border-2 border-white/50 rounded-full flex items-center justify-center">
                        <div className="w-1 h-1 bg-white rounded-full" />
                      </div>

                      {/* Target Circle */}
                      {nextTarget && (
                        <motion.div 
                          style={getTargetStyle(nextTarget)}
                          className="absolute w-12 h-12 border-4 border-indigo-500 rounded-full flex items-center justify-center bg-indigo-500/20"
                        >
                          <Target className="w-6 h-6 text-indigo-400" />
                        </motion.div>
                      )}
                    </div>

                    {/* Orientation Debug/Info */}
                    <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg text-[10px] font-mono flex flex-col gap-1">
                      <div className="flex justify-between gap-4">
                        <span className="text-zinc-400">PITCH</span>
                        <span>{Math.round(orientation.beta)}°</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-zinc-400">YAW</span>
                        <span>{Math.round(orientation.alpha)}°</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-zinc-500 p-6 text-center">
                    {cameraError ? (
                      <div className="flex flex-col items-center gap-3">
                        <X className="w-12 h-12 text-red-500 opacity-50" />
                        <p className="text-sm text-red-400">{cameraError}</p>
                        <button 
                          onClick={startCamera}
                          className="px-6 py-2 bg-zinc-800 text-white rounded-full font-medium"
                        >
                          Try Again
                        </button>
                      </div>
                    ) : (
                      <>
                        <Camera className="w-12 h-12 opacity-20" />
                        <p className="text-sm">Allow camera access to start capturing your 360 world</p>
                        <button 
                          onClick={startCamera}
                          className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full font-medium transition-colors shadow-lg shadow-indigo-600/20"
                        >
                          Open Camera
                        </button>
                      </>
                    )}
                  </div>
                )}
                
                {isCameraActive && (
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-6">
                    <button 
                      onClick={capturePhoto}
                      className="w-20 h-20 bg-white rounded-full border-4 border-zinc-300 active:scale-95 transition-transform flex items-center justify-center shadow-2xl"
                    >
                      <div className="w-14 h-14 bg-white rounded-full border-2 border-zinc-800 flex items-center justify-center">
                        <Plus className="w-8 h-8 text-zinc-800" />
                      </div>
                    </button>
                    <button 
                      onClick={stopCamera}
                      className="w-12 h-12 bg-zinc-900/80 backdrop-blur-md rounded-full flex items-center justify-center text-zinc-400 hover:text-white border border-zinc-700"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                )}
              </div>

              {/* Progress & Stats */}
              <div className="flex items-center justify-between px-2">
                <div className="flex flex-col">
                  <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Progress</span>
                  <span className="text-lg font-bold text-indigo-400">{photos.length} / {TOTAL_TARGETS} <span className="text-xs text-zinc-600 font-normal">photos</span></span>
                </div>
                <div className="h-2 flex-1 mx-6 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(photos.length / TOTAL_TARGETS) * 100}%` }}
                    className="h-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                  />
                </div>
                <Compass className="w-5 h-5 text-zinc-700" />
              </div>

              {/* Action Bar */}
              <div className="mt-auto pt-4 border-t border-zinc-800">
                <button 
                  disabled={photos.length < 4 || isStitching}
                  onClick={buildPanorama}
                  className="w-full py-4 bg-indigo-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-2xl font-bold text-lg flex flex-col items-center justify-center shadow-xl shadow-indigo-600/20 active:scale-[0.98] transition-all"
                >
                  {isStitching ? (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Stitching Panorama...
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <Check className="w-6 h-6" />
                        Build 360 Panorama
                      </div>
                      <span className="text-[10px] opacity-60 font-normal mt-1">Minimum 4 photos required</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 relative bg-black"
            >
              {stitchedImage ? (
                <>
                  <PanoramaViewer imageUrl={stitchedImage} />
                  
                  <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-4 z-10 w-full px-4 max-w-md">
                    <button 
                      onClick={downloadPanorama}
                      className="flex-1 py-4 bg-white/10 backdrop-blur-xl border border-white/20 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-white/20 transition-all shadow-2xl"
                    >
                      <Download className="w-5 h-5" />
                      Save
                    </button>
                    <button 
                      onClick={() => setMode('capture')}
                      className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-500 transition-all shadow-2xl shadow-indigo-600/30"
                    >
                      <Plus className="w-5 h-5" />
                      New
                    </button>
                  </div>

                  <div className="absolute top-4 left-4 z-10 pointer-events-none">
                    <div className="bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-2">
                      <Compass className="w-4 h-4 text-indigo-400 animate-pulse" />
                      <span className="text-xs font-medium text-white/80">Interactive 360 View</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-zinc-500 gap-4 p-8 text-center">
                  <div className="w-20 h-20 bg-zinc-900 rounded-3xl flex items-center justify-center border border-zinc-800">
                    <Eye className="w-10 h-10 opacity-20" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-xl mb-2">No Panorama Loaded</h3>
                    <p className="text-sm max-w-xs mx-auto">Go to Capture mode to take photos and build your first 360 panorama.</p>
                  </div>
                  <button 
                    onClick={() => setMode('capture')}
                    className="mt-4 px-8 py-3 bg-indigo-600 text-white rounded-full font-bold shadow-lg shadow-indigo-600/20"
                  >
                    Go to Capture
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
