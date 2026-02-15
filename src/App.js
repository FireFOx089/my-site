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
    activeZone === 'about' ? '04' :
    '05';
  
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
      <span className="zone-total">05</span>
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

// --- ANIMATED HTML CURSOR WITH SMOOTH FOLLOW ---
function HTMLCursor({ activeZone }) {
  const cursorOuterRef = useRef();
  const cursorInnerRef = useRef();
  const mousePos = useRef({ x: 0, y: 0 });
  const outerPos = useRef({ x: 0, y: 0 });
  const innerPos = useRef({ x: 0, y: 0 });
  const rafId = useRef(null);

  useEffect(() => {
    const moveCursor = (e) => {
      mousePos.current = { x: e.clientX, y: e.clientY };
    };

    window.addEventListener('mousemove', moveCursor);

    // Smooth animation loop
    const animate = () => {
      // Inner dot follows mouse instantly (with slight smoothing)
      innerPos.current.x += (mousePos.current.x - innerPos.current.x) * 0.25;
      innerPos.current.y += (mousePos.current.y - innerPos.current.y) * 0.25;

      // Outer ring follows inner dot with delay (slower lerp = more delay)
      outerPos.current.x += (innerPos.current.x - outerPos.current.x) * 0.12;
      outerPos.current.y += (innerPos.current.y - outerPos.current.y) * 0.12;

      if (cursorInnerRef.current) {
        cursorInnerRef.current.style.left = `${innerPos.current.x}px`;
        cursorInnerRef.current.style.top = `${innerPos.current.y}px`;
      }

      if (cursorOuterRef.current) {
        cursorOuterRef.current.style.left = `${outerPos.current.x}px`;
        cursorOuterRef.current.style.top = `${outerPos.current.y}px`;
      }

      rafId.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('mousemove', moveCursor);
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, []);

  //if (activeZone === 'blank') return null;

  return (
    <>
      <div ref={cursorOuterRef} className="html-cursor-outer" />
      <div ref={cursorInnerRef} className="html-cursor-inner" />
    </>
  );
}

// --- 1. DYNAMIC PARTICLES ---
function BackgroundParticles({ setZone, activeZone, rotationVelocity }) {
  const pointsRef = useRef();
  const count = 10000;
  const scrollProgress = useRef(0);
  const { scene } = useGLTF('/cartoon_car_v02.glb');

  const [initialCloud, modelShape, cubeShape, sphereShape] = useMemo(() => {
    const c = new Float32Array(count * 3);
    const m = new Float32Array(count * 3);
    const cb = new Float32Array(count * 3);
    const sp = new Float32Array(count * 3);
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
      
      // Initial cloud
      c[i3] = (Math.random() - 0.5) * 15;
      c[i3 + 1] = (Math.random() - 0.5) * 10;
      c[i3 + 2] = (Math.random() - 0.5) * 10;

      // Model shape
      if (tempPoints.length > 0) {
        const randomPoint = tempPoints[Math.floor(Math.random() * tempPoints.length)];
        const scaledPoint = randomPoint.clone().multiplyScalar(MODEL_CONFIG.scale);
        m[i3] = scaledPoint.x;
        m[i3 + 1] = scaledPoint.y;
        m[i3 + 2] = scaledPoint.z;
      }

      // Cube shape
      cb[i3] = (Math.random() - 0.5) * 4;
      cb[i3 + 1] = (Math.random() - 0.5) * 4;
      cb[i3 + 2] = (Math.random() - 0.5) * 4;

      // Sphere shape for About section
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() * 2) - 1);
      const radius = 2.5 + Math.random() * 0.5;
      sp[i3] = radius * Math.sin(phi) * Math.cos(theta);
      sp[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      sp[i3 + 2] = radius * Math.cos(phi);
    }
    return [c, m, cb, sp];
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
    if (p > 0.70) newZone = 'blank';
    else if (p > 0.45) newZone = 'about';
    else if (p > 0.30) newZone = 'cube';
    else if (p > 0.15) newZone = 'model';
    if (activeZone !== newZone) setZone(newZone);

    for (let i = 0; i < count * 3; i++) {
      let target;
      if (p <= 0) {
        // Cloud to Model
        target = THREE.MathUtils.lerp(initialCloud[i], modelShape[i], p * 6.67);
      }
      else if (p <= 0.30) {
        // Model to Cube
        target = THREE.MathUtils.lerp(modelShape[i], cubeShape[i], (p - 0.15) * 6.67);
      }
      else if (p <= 0.45) {
        // Cube to Sphere (About)
        target = THREE.MathUtils.lerp(cubeShape[i], sphereShape[i], (p - 0.30) * 6.67);
      }
      else if (p <= 0.70) {
        // Hold Sphere
        target = sphereShape[i];
      }
      else {
        // Disperse for Gallery
        target = sphereShape[i] + (THREE.MathUtils.clamp((p - 0.70) * 3.33, 0, 1) * 20);
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

// --- 2. CLICK HANDLER ---
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

// --- 3. MAIN APP ---
export default function App() {
  const [activeZone, setActiveZone] = useState('cloud');
  const rotationVelocity = useRef({ x: 0, y: 0 });

  return (
    <>
      <div style={{ height: '500vh', width: '100%' }} />
      
      {/* ANIMATED HTML CURSOR - SITS ABOVE EVERYTHING */}
      <HTMLCursor activeZone={activeZone} />

      {/* ABOUT PAGE */}
      <div className={`about-page ${activeZone === 'about' ? 'visible' : ''}`}>
        <motion.div 
          className="glass-container"
          initial={{ opacity: 0, scale: 0.95 }} 
          animate={activeZone === 'about' ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.8 }}
        >
          <div className="about-wrapper">
            <motion.div 
              className="about-left"
              initial={{ opacity: 0, x: -50 }}
              animate={activeZone === 'about' ? { opacity: 1, x: 0 } : { opacity: 0, x: -50 }}
              transition={{ duration: 0.8, delay: 0.3 }}
            >
              <h2 className="about-title">ABOUT</h2>
              <p className="about-description">
                We are a creative studio pushing the boundaries of digital experiences. 
                Our work sits at the intersection of art, technology, and human connection.
                Every project is crafted with meticulous attention to detail and a passion 
                for innovation that transforms the ordinary into the extraordinary.
              </p>
            </motion.div>

            <div className="about-divider" />

            <motion.div 
              className="about-right"
              initial={{ opacity: 0, x: 50 }}
              animate={activeZone === 'about' ? { opacity: 1, x: 0 } : { opacity: 0, x: 50 }}
              transition={{ duration: 0.8, delay: 0.4 }}
            >
              <div className="about-image-container">
                <img 
                  src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&h=1000&fit=crop" 
                  alt="About visual" 
                  className="about-image"
                />
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>

      {/* GALLERY PAGE */}
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
          {activeZone !== 'blank' && activeZone !== 'about' && (
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
          <EffectComposer>
            <Bloom intensity={0.4} luminanceThreshold={0.9} mipmapBlur />
            <Vignette darkness={0.4} offset={0.3} />
          </EffectComposer>
        </Canvas>
      </div>
    </>
  );
}