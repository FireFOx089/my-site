import React, { useRef, useMemo, useEffect, useState, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
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
  scale: 0.5,            // Adjust this to scale the car model globally
  rotationX: 0,          // Rotation around X-axis (in radians)
  rotationY: 0,          // Rotation around Y-axis (in radians)
  rotationZ: 0,          // Rotation around Z-axis (in radians)
  autoRotateSpeed: 0.001 // Speed of continuous Y-axis rotation
};

const CURSOR_CONFIG = {
  outerRingSpeed: 0.05,  // How fast outer ring follows (0.01 = slow, 0.2 = fast)
  innerDotSpeed: 0.08,   // How fast inner dot follows (should be faster than ring)
  rotationSpeed: 0.01,   // Speed of outer ring rotation
  outerRingSize: 0.08,   // Size of outer ring (increased for visibility)
  innerDotSize: 0.01     // Size of inner dot (increased for visibility)
};

// ===========================
// 🆕 ROTATION PHYSICS CONFIG
// ===========================
const ROTATION_CONFIG = {
  friction: 0.98,        // How quickly rotation slows down (0.95 = high friction, 0.99 = low friction)
  clickForce: 0.05,      // How much force is applied per click
  maxVelocity: 0.15      // Maximum rotation velocity
};

// --- 1. DYNAMIC PARTICLES (With Click-Based Rotation) ---
function BackgroundParticles({ setZone, activeZone, rotationVelocity }) {
  const pointsRef = useRef();
  const count = 10000;
  const scrollProgress = useRef(0);

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
    if (p < 0.2) {
      newZone = 'cloud';
    } else if (p >= 0.2 && p <= 0.6) {
      newZone = 'model';
    } else {
      newZone = 'cube';
    }
    
    if (activeZone !== newZone) setZone(newZone);

    // Smooth interpolation between states - works both directions
    for (let i = 0; i < count * 3; i++) {
      let targetPos;
      
      if (p <= 0.33) {
        // First third: Cloud → Model
        const localP = THREE.MathUtils.clamp(p * 3, 0, 1);
        targetPos = THREE.MathUtils.lerp(cloud[i], modelShape[i], localP);
      } else if (p <= 0.66) {
        // Middle third: Model → Cube
        const localP = THREE.MathUtils.clamp((p - 0.33) * 3, 0, 1);
        targetPos = THREE.MathUtils.lerp(modelShape[i], cube[i], localP);
      } else {
        // Final third: Stay at Cube
        targetPos = cube[i];
      }
      
      // Smooth interpolation to target position (helps with reverse scroll)
      pos[i] += (targetPos - pos[i]) * 0.1;
    }
    
    pointsRef.current.geometry.attributes.position.needsUpdate = true;
    
    // ===========================
    // 🆕 APPLY ROTATION WITH PHYSICS
    // ===========================
    // Constant rotation + momentum-based rotation
    pointsRef.current.rotation.y += MODEL_CONFIG.autoRotateSpeed + rotationVelocity.current.y;
    pointsRef.current.rotation.x += rotationVelocity.current.x;
    
    // Apply friction to slow down rotation over time
    rotationVelocity.current.x *= ROTATION_CONFIG.friction;
    rotationVelocity.current.y *= ROTATION_CONFIG.friction;
  });

  return (
    <Points ref={pointsRef} stride={3} positions={cloud}>
      <PointMaterial 
        transparent 
        color="#000000" 
        size={0.025} 
        sizeAttenuation 
        depthWrite={false} 
        opacity={1.0}
      />
    </Points>
  );
}

// --- 2. CLICK HANDLER ---
function ClickHandler({ rotationVelocity }) {
  const { size } = useThree();
  const mouseDownPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseDown = (e) => {
      mouseDownPos.current.x = e.clientX;
      mouseDownPos.current.y = e.clientY;
    };

    const handleMouseUp = (e) => {
      // Calculate drag direction and distance
      const deltaX = e.clientX - mouseDownPos.current.x;
      const deltaY = e.clientY - mouseDownPos.current.y;
      
      // Normalize based on screen size
      const normalizedDeltaX = deltaX / size.width;
      const normalizedDeltaY = deltaY / size.height;
      
      // Apply force in the direction of the drag
      // Horizontal drag = Y rotation, Vertical drag = X rotation
      const forceY = normalizedDeltaX * ROTATION_CONFIG.clickForce;
      const forceX = normalizedDeltaY * ROTATION_CONFIG.clickForce; // Removed the minus sign
      
      // Add force to current velocity
      rotationVelocity.current.y += forceY;
      rotationVelocity.current.x += forceX;
      
      // Clamp to max velocity
      rotationVelocity.current.y = THREE.MathUtils.clamp(
        rotationVelocity.current.y, 
        -ROTATION_CONFIG.maxVelocity, 
        ROTATION_CONFIG.maxVelocity
      );
      rotationVelocity.current.x = THREE.MathUtils.clamp(
        rotationVelocity.current.x, 
        -ROTATION_CONFIG.maxVelocity, 
        ROTATION_CONFIG.maxVelocity
      );
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [size, rotationVelocity]);

  return null;
}

// --- 3. CUSTOM CURSOR ---
function CustomCursor() {
  const outerRingRef = useRef();
  const innerDotRef = useRef();
  const mouse = useRef({ x: 0, y: 0 });
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    // Detect if device supports touch
    const checkTouch = () => {
      setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
    };
    checkTouch();

    const onMouseMove = (e) => {
      mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    
    window.addEventListener('mousemove', onMouseMove);
    return () => window.removeEventListener('mousemove', onMouseMove);
  }, []);

  useFrame((state) => {
    if (!outerRingRef.current || !innerDotRef.current) return;
    
    // Get viewport dimensions at camera's position
    const distance = state.camera.position.z - 4.5; // Distance from camera to cursor plane
    const vFov = (state.camera.fov * Math.PI) / 180; // Convert to radians
    const viewportHeight = 2 * Math.tan(vFov / 2) * distance;
    const viewportWidth = viewportHeight * state.camera.aspect;
    
    // Calculate target position
    const targetX = mouse.current.x * (viewportWidth / 2);
    const targetY = mouse.current.y * (viewportHeight / 2);
    
    // Outer ring - slower, smooth follow
    outerRingRef.current.position.x = THREE.MathUtils.lerp(
      outerRingRef.current.position.x, 
      targetX, 
      CURSOR_CONFIG.outerRingSpeed
    );
    outerRingRef.current.position.y = THREE.MathUtils.lerp(
      outerRingRef.current.position.y, 
      targetY, 
      CURSOR_CONFIG.outerRingSpeed
    );
    
    // Inner dot - faster, snappier
    innerDotRef.current.position.x = THREE.MathUtils.lerp(
      innerDotRef.current.position.x, 
      targetX, 
      CURSOR_CONFIG.innerDotSpeed
    );
    innerDotRef.current.position.y = THREE.MathUtils.lerp(
      innerDotRef.current.position.y, 
      targetY, 
      CURSOR_CONFIG.innerDotSpeed
    );
    
    // Rotate outer ring
    outerRingRef.current.rotation.z += CURSOR_CONFIG.rotationSpeed;
  });

  // Don't render cursor on touch devices
  if (isTouchDevice) return null;

  return (
    <group>
      {/* Outer Ring */}
      <mesh ref={outerRingRef} position={[0, 0, 4.5]}>
        <ringGeometry args={[CURSOR_CONFIG.outerRingSize - 0.02, CURSOR_CONFIG.outerRingSize, 32]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.9} />
      </mesh>
      
      {/* Inner Dot */}
      <mesh ref={innerDotRef} position={[0, 0, 4.5]}>
        <circleGeometry args={[CURSOR_CONFIG.innerDotSize, 32]} />
        <meshBasicMaterial color="#000000" transparent opacity={1.0} />
      </mesh>
    </group>
  );
}

// --- 4. SCROLL INDICATOR ---
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

// --- 5. MAIN APP ---
export default function App() {
  const [activeZone, setActiveZone] = useState('cloud');
  const rotationVelocity = useRef({ x: 0, y: 0 }); // Shared rotation velocity

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
          <color attach="background" args={['#ffffff']} />
          
          <Suspense fallback={null}>
            <BackgroundParticles 
              setZone={setActiveZone} 
              activeZone={activeZone}
              rotationVelocity={rotationVelocity}
            />
          </Suspense>

          <ClickHandler rotationVelocity={rotationVelocity} />
          <CustomCursor />
          
          <EffectComposer>
            <Bloom intensity={0.4} luminanceThreshold={0.9} mipmapBlur />
            <Vignette darkness={0.7} offset={0.3} />
          </EffectComposer>
        </Canvas>
      </div>
    </>
  );
}