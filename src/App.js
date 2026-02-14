import React, { useRef, useMemo, useEffect, useState, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Points, PointMaterial, useGLTF } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { motion, AnimatePresence } from 'framer-motion';

gsap.registerPlugin(ScrollTrigger);

const MODEL_CONFIG = {
  scale: 0.5,
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  autoRotateSpeed: 0.001
};

const CURSOR_CONFIG = {
  outerRingSpeed: 0.05,
  innerDotSpeed: 0.08,
  rotationSpeed: 0.01,
  outerRingSize: 0.08,
  innerDotSize: 0.01
};

const ROTATION_CONFIG = {
  friction: 0.98,
  clickForce: 0.05,
  maxVelocity: 0.15
};

// --- ZONE COUNTER COMPONENT ---
function ZoneCounter({ activeZone }) {
  const zoneIndex = 
    activeZone === 'cloud' ? '01' : 
    activeZone === 'model' ? '02' : 
    activeZone === 'cube' ? '03' : 
    '04';
  
  // Now showing counter on all pages including blank
  
  return (
    <motion.div
      className="zone-counter"
      key={zoneIndex}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.5 }}
    >
      <span className="zone-number">{zoneIndex}</span>
      <div className="zone-divider" />
      <span className="zone-total">04</span>
    </motion.div>
  );
}

// --- SCROLL INDICATOR COMPONENT ---
function ScrollIndicator({ visible }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="scroll-indicator"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
        >
          <motion.div
            className="scroll-line"
            animate={{ y: [0, 12, 0] }}
            transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
          />
          <span className="scroll-text">SCROLL</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// --- 1. DYNAMIC PARTICLES ---
function BackgroundParticles({ setZone, activeZone, rotationVelocity }) {
  const pointsRef = useRef();
  const count = 10000;
  const scrollProgress = useRef(0);
  const { scene } = useGLTF('/cartoon_car_v02.glb');

  const [initialCloud, modelShape, cubeShape] = useMemo(() => {
    const c = new Float32Array(count * 3);
    const m = new Float32Array(count * 3);
    const cb = new Float32Array(count * 3);
    const tempPoints = [];

    scene.traverse((child) => {
      if (child.isMesh) {
        const positions = child.geometry.attributes.position.array;
        const matrix = child.matrixWorld;
        for (let i = 0; i < positions.length; i += 3) {
          const vertex = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
          vertex.applyMatrix4(matrix);
          tempPoints.push(vertex);
        }
      }
    });

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      c[i3] = (Math.random() - 0.5) * 15;
      c[i3 + 1] = (Math.random() - 0.5) * 10;
      c[i3 + 2] = (Math.random() - 0.5) * 10;

      if (tempPoints.length > 0) {
        const randomPoint = tempPoints[Math.floor(Math.random() * tempPoints.length)];
        const scaledPoint = randomPoint.clone().multiplyScalar(MODEL_CONFIG.scale);
        m[i3] = scaledPoint.x;
        m[i3 + 1] = scaledPoint.y;
        m[i3 + 2] = scaledPoint.z;
      }

      cb[i3] = (Math.random() - 0.5) * 4;
      cb[i3 + 1] = (Math.random() - 0.5) * 4;
      cb[i3 + 2] = (Math.random() - 0.5) * 4;
    }
    return [c, m, cb];
  }, [scene, count]);

  useEffect(() => {
    const st = ScrollTrigger.create({
      trigger: "body",
      start: "top top",
      end: "bottom bottom",
      scrub: 1,
      onUpdate: (self) => { scrollProgress.current = self.progress; }
    });
    return () => st.kill();
  }, []);

  useFrame(() => {
    if (!pointsRef.current) return;
    const pos = pointsRef.current.geometry.attributes.position.array;
    const p = scrollProgress.current;

    let newZone = 'cloud';
    if (p > 0.55) newZone = 'blank';
    else if (p > 0.30) newZone = 'cube';
    else if (p > 0.15) newZone = 'model';
    if (activeZone !== newZone) setZone(newZone);

    for (let i = 0; i < count * 3; i++) {
      let target;
      if (p <= 0) {
        target = THREE.MathUtils.lerp(initialCloud[i], modelShape[i], p * 4);
      }
      else if (p <= 0.35) {
        target = THREE.MathUtils.lerp(modelShape[i], cubeShape[i], (p - 0.25) * 5);
      }
      else if (p <= 0.85) {
        target = cubeShape[i];
      }
      else {
        target = cubeShape[i] + (THREE.MathUtils.clamp((p - 0.85) * 6.67, 0, 1) * 20);
      }
      pos[i] += (target - pos[i]) * 0.1;
    }
    
    pointsRef.current.geometry.attributes.position.needsUpdate = true;
    pointsRef.current.rotation.y += MODEL_CONFIG.autoRotateSpeed + rotationVelocity.current.y;
    pointsRef.current.rotation.x += rotationVelocity.current.x;
    rotationVelocity.current.x *= ROTATION_CONFIG.friction;
    rotationVelocity.current.y *= ROTATION_CONFIG.friction;
  });

  return (
    <Points ref={pointsRef} stride={3} positions={initialCloud}>
      <PointMaterial transparent color="#000000" size={0.025} sizeAttenuation depthWrite={false} opacity={1.0} />
    </Points>
  );
}

// --- 2. CLICK & CURSOR ---
function ClickHandler({ rotationVelocity }) {
  const { size } = useThree();
  const mouseDownPos = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const down = (e) => { mouseDownPos.current = { x: e.clientX, y: e.clientY }; };
    const up = (e) => {
      rotationVelocity.current.y += ((e.clientX - mouseDownPos.current.x) / size.width) * ROTATION_CONFIG.clickForce;
      rotationVelocity.current.x += ((e.clientY - mouseDownPos.current.y) / size.height) * ROTATION_CONFIG.clickForce;
    };
    window.addEventListener('mousedown', down); window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousedown', down); window.removeEventListener('mouseup', up); };
  }, [size, rotationVelocity]);
  return null;
}

function CustomCursor({ activeZone }) {
  const outer = useRef(); 
  const inner = useRef();
  const mouse = useRef({ x: 0, y: 0 });
  
  useEffect(() => {
    const move = (e) => { 
      mouse.current.x = (e.clientX/window.innerWidth)*2-1; 
      mouse.current.y = -(e.clientY/window.innerHeight)*2+1; 
    };
    window.addEventListener('mousemove', move); 
    return () => window.removeEventListener('mousemove', move);
  }, []);
  
  useFrame((state) => {
    if (!outer.current || !inner.current) return;
    const dist = state.camera.position.z - 4.5;
    const vFov = (state.camera.fov * Math.PI) / 180;
    const viewportHeight = 2 * Math.tan(vFov / 2) * dist;
    const viewportWidth = viewportHeight * state.camera.aspect;
    const tX = mouse.current.x * (viewportWidth / 2);
    const tY = mouse.current.y * (viewportHeight / 2);
    outer.current.position.set(THREE.MathUtils.lerp(outer.current.position.x, tX, 0.05), THREE.MathUtils.lerp(outer.current.position.y, tY, 0.05), 4.5);
    inner.current.position.set(THREE.MathUtils.lerp(inner.current.position.x, tX, 0.1), THREE.MathUtils.lerp(inner.current.position.y, tY, 0.1), 4.5);
  });
  
  if (activeZone === 'blank') return null;
  
  return (
    <group>
      <mesh ref={outer} position={[0, 0, 4.5]}>
        <ringGeometry args={[0.06, 0.08, 32]} />
        <meshBasicMaterial color="#000" transparent opacity={0.8} />
      </mesh>
      <mesh ref={inner} position={[0, 0, 4.5]}>
        <circleGeometry args={[0.01, 32]} />
        <meshBasicMaterial color="#000" />
      </mesh>
    </group>
  );
}

// --- 3. MAIN APP ---
export default function App() {
  const [activeZone, setActiveZone] = useState('cloud');
  const rotationVelocity = useRef({ x: 0, y: 0 });

  return (
    <>
      <div style={{ height: '400vh', width: '100%' }} />
      
      <div className={`final-content-page ${activeZone === 'blank' ? 'visible' : ''}`}>
        <motion.div 
          className="final-content-wrapper"
          initial={{ opacity: 0, y: 50 }} 
          animate={activeZone === 'blank' ? { opacity: 1, y: 0 } : { opacity: 0 }}
          transition={{ duration: 1, delay: 0.2 }}
        >
          <div className="text-header">
            <h2>The New Era</h2>
            <p>Form meets void. Explore the gallery below.</p>
          </div>

          <div className="photo-grid">
            {[
              { id: 1, position: 'center', rotation: 0, zIndex: 5 },
              { id: 2, position: 'left-1', rotation: -8, zIndex: 4 },
              { id: 3, position: 'right-1', rotation: 8, zIndex: 4 },
              { id: 4, position: 'left-2', rotation: -15, zIndex: 3 },
              { id: 5, position: 'right-2', rotation: 15, zIndex: 3 }
            ].map((item) => (
              <motion.div
                key={item.id}
                className={`grid-item ${item.position}`}
                data-rotation={item.rotation}
                style={{ 
                  '--rotation': `${item.rotation}deg`,
                  '--base-z-index': item.zIndex
                }}
                initial={{ opacity: 0, y: 40 }}
                animate={activeZone === 'blank' ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
                transition={{ duration: 0.8, delay: 0.3 + item.id * 0.12 }}
              >
                <div className="image-wrapper">
                  <img src={`https://picsum.photos/400/600?random=${item.id}`} alt={`Gallery Item ${item.id}`} loading="lazy" />
                  <div className="image-overlay">
                    <span className="image-number">0{item.id}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      <div className="ui-overlay">
        <AnimatePresence mode="wait">
          {activeZone !== 'blank' && (
            <motion.div 
              key={activeZone}
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
              className="center-content"
            >
              <h1>
                {activeZone === 'cloud' ? 'The Nebula' : 
                 activeZone === 'model' ? 'The Blueprint' : 
                 'The Structure'}
              </h1>
              <div className="decorative-line" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Zone Counter - positioned bottom right */}
      <ZoneCounter activeZone={activeZone} />

      {/* Scroll Indicator - shows only on first zone */}
      <ScrollIndicator visible={activeZone === 'cloud'} />

      <div className="canvas-container">
        <Canvas camera={{ position: [0, 0, 5], fov: 90 }}>
          <color attach="background" args={['#ffffff']} />
          <Suspense fallback={null}>
            <BackgroundParticles setZone={setActiveZone} activeZone={activeZone} rotationVelocity={rotationVelocity} />
          </Suspense>
          <ClickHandler rotationVelocity={rotationVelocity} />
          <CustomCursor activeZone={activeZone} />
          <EffectComposer>
            <Bloom intensity={0.4} luminanceThreshold={0.9} mipmapBlur />
            <Vignette darkness={0.4} offset={0.3} />
          </EffectComposer>
        </Canvas>
      </div>
    </>
  );
}