import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { Camera, Image as ImageIcon, RotateCcw, Download, Eye, Plus, Trash2, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---
interface CapturedPhoto {
  id: string;
  blob: string;
  timestamp: number;
}

type AppMode = 'capture' | 'view';

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

    // Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 1100);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Sphere setup
    const geometry = new THREE.SphereGeometry(500, 60, 40);
    geometry.scale(-1, 1, 1); // Invert the sphere so we are inside

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
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // --- Camera Logic ---
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' }, 
        audio: false 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsCameraActive(true);
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("Could not access camera. Please check permissions.");
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
          timestamp: Date.now()
        }]);
      }
    }
  };

  const deletePhoto = (id: string) => {
    setPhotos(prev => prev.filter(p => p.id !== id));
  };

  // --- Stitching Logic ---
  // A simplified "stitcher" that maps photos into a grid.
  // In a real scenario, this would use feature matching, but for a vanilla JS app,
  // we'll assume the user takes photos in a sequence that we can map to a panorama.
  const buildPanorama = async () => {
    if (photos.length === 0) return;
    setIsStitching(true);

    try {
      // We'll create an equirectangular canvas (2:1 ratio)
      const panoWidth = 4096;
      const panoHeight = 2048;
      const panoCanvas = document.createElement('canvas');
      panoCanvas.width = panoWidth;
      panoCanvas.height = panoHeight;
      const ctx = panoCanvas.getContext('2d');

      if (!ctx) throw new Error("Could not get canvas context");

      // Fill with black
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, panoWidth, panoHeight);

      // Simple grid mapping:
      // We'll divide the panorama into a grid based on the number of photos.
      // This is a naive approach but fits the "single file / vanilla" constraint.
      // Ideally, the user takes photos in a specific order.
      const cols = Math.ceil(Math.sqrt(photos.length * 2));
      const rows = Math.ceil(photos.length / cols);
      const cellWidth = panoWidth / cols;
      const cellHeight = panoHeight / rows;

      const loadImg = (src: string): Promise<HTMLImageElement> => {
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.src = src;
        });
      };

      for (let i = 0; i < photos.length; i++) {
        const img = await loadImg(photos[i].blob);
        const col = i % cols;
        const row = Math.floor(i / cols);
        
        // Draw with some overlap/blending if we wanted to be fancy,
        // but let's stick to a clean grid for now.
        ctx.drawImage(img, col * cellWidth, row * cellHeight, cellWidth, cellHeight);
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

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-indigo-500/30">
      {/* Header */}
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
              {/* Camera Preview / Placeholder */}
              <div className="relative aspect-video bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl group">
                {isCameraActive ? (
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-zinc-500">
                    <Camera className="w-12 h-12 opacity-20" />
                    <button 
                      onClick={startCamera}
                      className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full font-medium transition-colors shadow-lg shadow-indigo-600/20"
                    >
                      Open Camera
                    </button>
                  </div>
                )}
                
                {isCameraActive && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-4">
                    <button 
                      onClick={capturePhoto}
                      className="w-16 h-16 bg-white rounded-full border-4 border-zinc-300 active:scale-95 transition-transform flex items-center justify-center shadow-xl"
                    >
                      <div className="w-12 h-12 bg-white rounded-full border-2 border-zinc-800" />
                    </button>
                    <button 
                      onClick={stopCamera}
                      className="absolute -right-12 top-1/2 -translate-y-1/2 w-10 h-10 bg-zinc-900/80 backdrop-blur-md rounded-full flex items-center justify-center text-zinc-400 hover:text-white"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Photo List */}
              <div className="flex-1 flex flex-col gap-3 overflow-hidden">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                    <ImageIcon className="w-4 h-4" />
                    Captured Photos ({photos.length})
                  </h2>
                  {photos.length > 0 && (
                    <button 
                      onClick={resetCapture}
                      className="text-xs text-zinc-500 hover:text-red-400 flex items-center gap-1 transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Clear All
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                  {photos.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-600 border-2 border-dashed border-zinc-800 rounded-2xl">
                      <Plus className="w-8 h-8 mb-2 opacity-20" />
                      <p className="text-sm">Take photos to start building your 360 view</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                      {photos.map((photo, idx) => (
                        <motion.div 
                          layout
                          key={photo.id}
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className="relative aspect-square rounded-xl overflow-hidden border border-zinc-800 group"
                        >
                          <img src={photo.blob} alt={`Capture ${idx}`} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button 
                              onClick={() => deletePhoto(photo.id)}
                              className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="absolute top-1 left-1 bg-black/60 backdrop-blur-md text-[10px] px-1.5 py-0.5 rounded-md font-mono">
                            #{idx + 1}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Bar */}
              <div className="mt-auto pt-4 border-t border-zinc-800 flex gap-3">
                <button 
                  disabled={photos.length < 2 || isStitching}
                  onClick={buildPanorama}
                  className="flex-1 py-4 bg-indigo-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-2xl font-bold text-lg flex items-center justify-center gap-2 shadow-xl shadow-indigo-600/20 active:scale-[0.98] transition-all"
                >
                  {isStitching ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Stitching...
                    </>
                  ) : (
                    <>
                      <Check className="w-6 h-6" />
                      Build 360 Panorama
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
                  
                  {/* Overlay Controls */}
                  <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-4 z-10">
                    <button 
                      onClick={downloadPanorama}
                      className="px-6 py-3 bg-white/10 backdrop-blur-xl border border-white/20 text-white rounded-full font-medium flex items-center gap-2 hover:bg-white/20 transition-all shadow-2xl"
                    >
                      <Download className="w-5 h-5" />
                      Save to Phone
                    </button>
                    <button 
                      onClick={() => setMode('capture')}
                      className="px-6 py-3 bg-indigo-600 text-white rounded-full font-medium flex items-center gap-2 hover:bg-indigo-500 transition-all shadow-2xl shadow-indigo-600/30"
                    >
                      <Plus className="w-5 h-5" />
                      New Capture
                    </button>
                  </div>

                  <div className="absolute top-4 left-4 z-10 pointer-events-none">
                    <div className="bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-2">
                      <Eye className="w-4 h-4 text-indigo-400" />
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

      {/* Hidden Canvas for Processing */}
      <canvas ref={canvasRef} className="hidden" />

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #3f3f46;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #52525b;
        }
      `}</style>
    </div>
  );
}
