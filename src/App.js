import React, { useRef, useMemo, useEffect, useState, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Points, PointMaterial, useGLTF } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { motion, AnimatePresence } from 'framer-motion';

gsap.registerPlugin(ScrollTrigger);

// ===========================
// 🎛️ GLOBAL CONFIGURATION
// ===========================
const MODEL_CONFIG = {
  scale: 0.6,           // Adjust this to scale the car model globally
  rotationX: 0,          // Rotation around X-axis (in radians)
  rotationY: 0,          // Rotation around Y-axis (in radians)
  rotationZ: 0,          // Rotation around Z-axis (in radians)
  autoRotateSpeed: 0.001 // Speed of continuous Y-axis rotation
};

// --- 1. DYNAMIC PARTICLES (With Fixed Scrolling) ---
function BackgroundParticles({ setZone, activeZone }) {
  const pointsRef = useRef();
  const count = 10000;
  const scrollProgress = useRef(0); // Changed to direct value instead of object

  // Load the model to extract its points
  const { scene } = useGLTF('/cartoon_car_v02.glb');

  const [cloud, modelShape, cube] = useMemo(() => {
    const cl = new Float32Array(count * 3);
    const ms = new Float32Array(count * 3);
    const cb = new Float32Array(count * 3);

    // Extract vertices from the GLB
    const tempPoints = [];
    scene.traverse((child) => {
      if (child.isMesh) {
        const positions = child.geometry.attributes.position.array;
        const matrix = child.matrixWorld;
        
        for (let i = 0; i < positions.length; i += 3) {
          const vertex = new THREE.Vector3(
            positions[i], 
            positions[i + 1], 
            positions[i + 2]
          );
          vertex.applyMatrix4(matrix);
          tempPoints.push(vertex);
        }
      }
    });

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      // 1. Cloud (Random Start)
      cl[i3] = (Math.random() - 0.5) * 15;
      cl[i3 + 1] = (Math.random() - 0.5) * 10;
      cl[i3 + 2] = (Math.random() - 0.5) * 10;

      // 2. Model Shape (The Car) - with global scale applied
      if (tempPoints.length > 0) {
        const randomPoint = tempPoints[Math.floor(Math.random() * tempPoints.length)];
        
        // Apply global scale and rotation
        const scaledPoint = randomPoint.clone().multiplyScalar(MODEL_CONFIG.scale);
        scaledPoint.applyEuler(new THREE.Euler(
          MODEL_CONFIG.rotationX,
          MODEL_CONFIG.rotationY,
          MODEL_CONFIG.rotationZ
        ));
        
        ms[i3] = scaledPoint.x;
        ms[i3 + 1] = scaledPoint.y;
        ms[i3 + 2] = scaledPoint.z;
      } else {
        ms[i3] = Math.random();
        ms[i3 + 1] = Math.random();
        ms[i3 + 2] = Math.random();
      }

      // 3. Cube (End State)
      cb[i3] = (Math.random() - 0.5) * 4;
      cb[i3 + 1] = (Math.random() - 0.5) * 4;
      cb[i3 + 2] = (Math.random() - 0.5) * 4;
    }
    return [cl, ms, cb];
  }, [count, scene]);

  useEffect(() => {
    const st = ScrollTrigger.create({
      trigger: "body",
      start: "top top",
      end: "bottom bottom",
      scrub: 1,
      onUpdate: (self) => { 
        scrollProgress.current = self.progress; 
      }
    });
    return () => st.kill();
  }, []);

  useFrame(() => {
    if (!pointsRef.current) return;
    const pos = pointsRef.current.geometry.attributes.position.array;
    const p = scrollProgress.current;

    // Update zone based on scroll position with better thresholds
    let newZone = null;
    if (p < 0.1) {
      newZone = 'cloud';
    } else if (p >= 0.1 && p <= 0.55) {
      newZone = 'model';
    } else {
      newZone = 'cube';
    }
    
    if (activeZone !== newZone) setZone(newZone);

    // Smooth interpolation between states - works both directions
    for (let i = 0; i < count * 3; i++) {
      let targetPos;
      
      if (p <= 0.5) {
        // First half: Cloud → Model
        const localP = THREE.MathUtils.clamp(p * 2, 0, 1);
        targetPos = THREE.MathUtils.lerp(cloud[i], modelShape[i], localP);
      } else {
        // Second half: Model → Cube
        const localP = THREE.MathUtils.clamp((p - 0.5) * 2, 0, 1);
        targetPos = THREE.MathUtils.lerp(modelShape[i], cube[i], localP);
      }
      
      // Smooth interpolation to target position (helps with reverse scroll)
      pos[i] += (targetPos - pos[i]) * 0.1;
    }
    
    pointsRef.current.geometry.attributes.position.needsUpdate = true;
    pointsRef.current.rotation.y += MODEL_CONFIG.autoRotateSpeed;
  });

  return (
    <Points ref={pointsRef} stride={3} positions={cloud}>
      <PointMaterial 
        transparent 
        color="#ffffff" 
        size={0.012} 
        sizeAttenuation 
        depthWrite={false} 
        blending={THREE.AdditiveBlending} 
      />
    </Points>
  );
}

// --- 2. CUSTOM CURSOR ---
function CustomCursor() {
  const outerRingRef = useRef();
  const innerDotRef = useRef();
  const mouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onMouseMove = (e) => {
      mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener('mousemove', onMouseMove);
    return () => window.removeEventListener('mousemove', onMouseMove);
  }, []);

  useFrame((state) => {
    if (!outerRingRef.current || !innerDotRef.current) return;
    
    const { width, height } = state.viewport.getCurrentViewport(state.camera, [0, 0, 0]);
    const targetX = (mouse.current.x * width) / 2;
    const targetY = (mouse.current.y * height) / 2;
    
    // Outer ring - slower, smooth follow
    outerRingRef.current.position.x = THREE.MathUtils.lerp(
      outerRingRef.current.position.x, 
      targetX, 
      0.1
    );
    outerRingRef.current.position.y = THREE.MathUtils.lerp(
      outerRingRef.current.position.y, 
      targetY, 
      0.1
    );
    
    // Inner dot - faster, snappier
    innerDotRef.current.position.x = THREE.MathUtils.lerp(
      innerDotRef.current.position.x, 
      targetX, 
      0.2
    );
    innerDotRef.current.position.y = THREE.MathUtils.lerp(
      innerDotRef.current.position.y, 
      targetY, 
      0.2
    );
    
    // Rotate outer ring
    outerRingRef.current.rotation.z += 0.02;
  });

  return (
    <group>
      {/* Outer Ring */}
      <mesh ref={outerRingRef} position={[0, 0, 4.5]}>
        <ringGeometry args={[0.1, 0.12, 32]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.6} />
      </mesh>
      
      {/* Inner Dot */}
      <mesh ref={innerDotRef} position={[0, 0, 4.5]}>
        <circleGeometry args={[0.02, 32]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
      </mesh>
    </group>
  );
}

// --- 3. SCROLL INDICATOR ---
function ScrollIndicator() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 100) setVisible(false);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <motion.div 
      className="scroll-indicator"
      initial={{ opacity: 0 }}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.5 }}
    >
      <motion.div 
        className="scroll-arrow"
        animate={{ y: [0, 10, 0] }}
        transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
      >
        ↓
      </motion.div>
      <p>Scroll to explore</p>
    </motion.div>
  );
}

// --- 4. MAIN APP ---
export default function App() {
  const [activeZone, setActiveZone] = useState('cloud');

  return (
    <>
      {/* Scroll height */}
      <div style={{ height: '300vh', width: '100%' }} />
      
      {/* UI Overlay */}
      <div className="ui-overlay">
        <AnimatePresence mode="wait">
          {activeZone === 'cloud' && (
            <motion.div 
              key="cloud-text" 
              initial={{ opacity: 0, y: 30, filter: 'blur(10px)' }} 
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} 
              exit={{ opacity: 0, y: -30, filter: 'blur(10px)' }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="center-content"
            >
              <h1>The Nebula</h1>
              <p className="subtitle">Where ancient chaos meets future design</p>
              <div className="decorative-line" />
            </motion.div>
          )}
          
          {activeZone === 'model' && (
            <motion.div 
              key="model-text" 
              initial={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }} 
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }} 
              exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="center-content"
            >
              <h1>The Blueprint</h1>
              <p className="subtitle">Form emerging from formlessness</p>
              <div className="decorative-line" />
            </motion.div>
          )}
          
          {activeZone === 'cube' && (
            <motion.div 
              key="cube-text" 
              initial={{ opacity: 0, rotateX: -20, filter: 'blur(10px)' }} 
              animate={{ opacity: 1, rotateX: 0, filter: 'blur(0px)' }} 
              exit={{ opacity: 0, rotateX: 20, filter: 'blur(10px)' }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="center-content"
            >
              <h1>The Structure</h1>
              <p className="subtitle">Perfect order crystallized</p>
              <div className="decorative-line" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Scroll Indicator */}
      <ScrollIndicator />

      {/* 3D Canvas */}
      <div className="canvas-container">
        <Canvas camera={{ position: [0, 0, 5], fov: 90 }}>
          <color attach="background" args={['#000000']} />
          
          <Suspense fallback={null}>
            <BackgroundParticles setZone={setActiveZone} activeZone={activeZone} />
          </Suspense>

          <CustomCursor />
          
          <EffectComposer>
            <Bloom intensity={1.2} luminanceThreshold={0.1} mipmapBlur />
            <Vignette darkness={0.7} offset={0.3} />
          </EffectComposer>
        </Canvas>
      </div>
    </>
  );
}