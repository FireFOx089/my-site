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

  // Don't render custom cursor on touch devices
  const isTouchDevice = typeof window !== 'undefined' &&
    window.matchMedia('(hover: none) and (pointer: coarse)').matches;

  useEffect(() => {
    if (isTouchDevice) return;
    const moveCursor = (e) => {
      mousePos.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', moveCursor);

    const animate = () => {
      innerPos.current.x += (mousePos.current.x - innerPos.current.x) * 0.25;
      innerPos.current.y += (mousePos.current.y - innerPos.current.y) * 0.25;
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
    else if (p > 0.20) newZone = 'cube';
    else if (p > 0.1) newZone = 'model';
    if (activeZone !== newZone) setZone(newZone);

    for (let i = 0; i < count * 3; i++) {
      let target;
      if (p <= 0) {
        target = THREE.MathUtils.lerp(initialCloud[i], modelShape[i], p * 6.67);
      } else if (p <= 0.30) {
        target = THREE.MathUtils.lerp(modelShape[i], cubeShape[i], (p - 0.15) * 6.67);
      } else if (p <= 0.45) {
        target = THREE.MathUtils.lerp(cubeShape[i], sphereShape[i], (p - 0.30) * 6.67);
      } else if (p <= 0.70) {
        target = sphereShape[i];
      } else {
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

// --- 2. CLICK / TOUCH HANDLER ---
function ClickHandler({ rotationVelocity }) {
  const { size } = useThree();
  const startPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    // Mouse
    const onMouseDown = (e) => { startPos.current = { x: e.clientX, y: e.clientY }; };
    const onMouseUp   = (e) => {
      rotationVelocity.current.y += ((e.clientX - startPos.current.x) / size.width)  * ROTATION_CONFIG.clickForce;
      rotationVelocity.current.x += ((e.clientY - startPos.current.y) / size.height) * ROTATION_CONFIG.clickForce;
    };

    // Touch — swipe to spin particles on zones 1-3
    const onTouchStart = (e) => {
      const t = e.touches[0];
      startPos.current = { x: t.clientX, y: t.clientY };
    };
    const onTouchEnd = (e) => {
      const t = e.changedTouches[0];
      rotationVelocity.current.y += ((t.clientX - startPos.current.x) / size.width)  * ROTATION_CONFIG.clickForce * 2;
      rotationVelocity.current.x += ((t.clientY - startPos.current.y) / size.height) * ROTATION_CONFIG.clickForce * 2;
    };

    window.addEventListener('mousedown',  onMouseDown);
    window.addEventListener('mouseup',    onMouseUp);
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend',   onTouchEnd,   { passive: true });

    return () => {
      window.removeEventListener('mousedown',  onMouseDown);
      window.removeEventListener('mouseup',    onMouseUp);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend',   onTouchEnd);
    };
  }, [size, rotationVelocity]);
  return null;
}

// --- FLUID BLOB REVEAL IMAGE ---
// baseImage  = your photo WITHOUT the helmet (shown by default)
// revealImage = your photo WITH the helmet (revealed on hover under the blob mask)
function FluidRevealImage({ baseImage, revealImage }) {
  const containerRef = useRef();
  const blobRef      = useRef();
  const mouse        = useRef({ x: 0, y: 0 });   // raw cursor pos inside container
  const blob         = useRef({ x: 0, y: 0 });   // lagging blob centre
  const vel          = useRef({ x: 0, y: 0 });   // blob velocity (px/frame)
  const rafRef       = useRef();
  const isHovered    = useRef(false);
  const blobOpacity  = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

    // Mouse events (desktop)
    const onMove = (e) => {
      const rect = el.getBoundingClientRect();
      mouse.current.x = e.clientX - rect.left;
      mouse.current.y = e.clientY - rect.top;
    };
    const onEnter = () => { isHovered.current = true; };
    const onLeave = () => { isHovered.current = false; };

    // Touch events (mobile) — single finger drag reveals the blob
    const onTouchMove = (e) => {
      e.preventDefault(); // stop page scroll while touching image
      const rect = el.getBoundingClientRect();
      const touch = e.touches[0];
      mouse.current.x = touch.clientX - rect.left;
      mouse.current.y = touch.clientY - rect.top;
      isHovered.current = true;
    };
    const onTouchEnd = () => {
      isHovered.current = false;
    };

    if (isTouch) {
      el.addEventListener('touchmove',  onTouchMove, { passive: false });
      el.addEventListener('touchstart', onTouchMove, { passive: false });
      el.addEventListener('touchend',   onTouchEnd);
    } else {
      el.addEventListener('mousemove',  onMove);
      el.addEventListener('mouseenter', onEnter);
      el.addEventListener('mouseleave', onLeave);
    }

    const R = 42; // blob radius in px

    const animate = () => {
      // Spring-lerp blob toward cursor
      blob.current.x += (mouse.current.x - blob.current.x) * 0.08;
      blob.current.y += (mouse.current.y - blob.current.y) * 0.08;

      // Opacity fade
      const targetOpacity = isHovered.current ? 1 : 0;
      blobOpacity.current += (targetOpacity - blobOpacity.current) * 0.06;

      if (blobRef.current) {
        const b  = blobRef.current;
        const x  = blob.current.x;
        const y  = blob.current.y;

        b.style.opacity        = blobOpacity.current;
        b.style.transform      = 'none';
        b.style.clipPath       = `circle(${R}px at ${x}px ${y}px)`;
        b.style.webkitClipPath = `circle(${R}px at ${x}px ${y}px)`;
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (isTouch) {
        el.removeEventListener('touchmove',  onTouchMove);
        el.removeEventListener('touchstart', onTouchMove);
        el.removeEventListener('touchend',   onTouchEnd);
      } else {
        el.removeEventListener('mousemove',  onMove);
        el.removeEventListener('mouseenter', onEnter);
        el.removeEventListener('mouseleave', onLeave);
      }
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div ref={containerRef} className="about-image-container fluid-reveal-container">

      {/* LAYER 1 — Base image (no helmet), always visible */}
      <img
        src={baseImage}
        alt="Portrait"
        className="about-image fluid-base"
      />

      {/* LAYER 2 — Reveal image (with helmet), clipped by the blob mask */}
      <img
        ref={blobRef}
        src={revealImage}
        alt="Portrait with helmet"
        className="about-image fluid-reveal"
      />

      {/* Gradient overlay on top of both layers */}
      <div className="image-gradient-overlay" />
    </div>
  );
}

// --- WAVE DOT GRID CANVAS (About Zone BG) ---
function WaveDotGrid({ visible }) {
  const canvasRef = useRef();
  const rafRef = useRef();
  const activeRef = useRef(visible);

  useEffect(() => { activeRef.current = visible; }, [visible]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const SPACING = 28;   // grid spacing in px
    const AMPLITUDE = 10; // max wave displacement
    const FREQ = 0.045;   // spatial frequency
    const SPEED = 0.022;  // animation speed
    const DOT_R = 1.4;    // base dot radius

    let W, H, cols, rows, t = 0;
    let opacity = 0;      // fade tracker

    const resize = () => {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
      cols = Math.ceil(W / SPACING) + 2;
      rows = Math.ceil(H / SPACING) + 2;
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      // Smoothly fade in/out based on visible prop
      const target = activeRef.current ? 1 : 0;
      opacity += (target - opacity) * 0.04;

      ctx.clearRect(0, 0, W, H);

      if (opacity < 0.01) { rafRef.current = requestAnimationFrame(draw); return; }

      t += SPEED;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const baseX = c * SPACING;
          const baseY = r * SPACING;

          // Two overlapping sine waves for organic feel
          const wave1 = Math.sin(baseX * FREQ + t) * AMPLITUDE;
          const wave2 = Math.cos(baseY * FREQ * 0.8 + t * 0.7) * AMPLITUDE * 0.6;
          const diag  = Math.sin((baseX + baseY) * FREQ * 0.5 + t * 1.2) * AMPLITUDE * 0.4;

          const x = baseX + wave1 + diag;
          const y = baseY + wave2 + diag;

          // Dot size pulses subtly with wave phase
          const phase = Math.sin(baseX * FREQ * 1.5 + baseY * FREQ + t * 1.1);
          const r2 = DOT_R * (0.6 + 0.4 * ((phase + 1) / 2));

          // Opacity varies across the grid for depth
          const dotOpacity = 0.18 + 0.22 * ((Math.sin(baseX * FREQ * 0.7 + t * 0.5) + 1) / 2);

          ctx.beginPath();
          ctx.arc(x, y, r2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(0, 0, 0, ${dotOpacity * opacity})`;
          ctx.fill();
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="wave-dot-canvas"
      aria-hidden="true"
    />
  );
}

// --- 3. MAIN APP ---
export default function App() {
  const [activeZone, setActiveZone] = useState('cloud');
  const rotationVelocity = useRef({ x: 0, y: 0 });

  return (
    <>
      <div style={{ height: '500vh', width: '100%' }} />

      <HTMLCursor activeZone={activeZone} />

      {/* ABOUT PAGE */}
      <div className={`about-page ${activeZone === 'about' ? 'visible' : ''}`}>

        {/* Wave-distorted dot grid — fades in/out with the About zone */}
        <WaveDotGrid visible={activeZone === 'about'} />

        <motion.div
          className="glass-container"
          initial={{ opacity: 0, y: 30 }}
          animate={activeZone === 'about' ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="about-wrapper">

            {/* LEFT — refined typography layout */}
            <motion.div
              className="about-left"
              initial={{ opacity: 0 }}
              animate={activeZone === 'about' ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: 1, delay: 0.35 }}
            >
              {/* Eyebrow label */}
              <div className="about-eyebrow">
                <span className="eyebrow-line" />
                <span className="eyebrow-text">Est. 2024</span>
              </div>

              {/* Main title — split for luxury stagger */}
              <div className="about-title-block">
                <motion.span
                  className="about-title-line"
                  initial={{ opacity: 0, y: 20 }}
                  animate={activeZone === 'about' ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                  transition={{ duration: 0.9, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
                >
                  We craft
                </motion.span>
                <motion.span
                  className="about-title-line about-title-italic"
                  initial={{ opacity: 0, y: 20 }}
                  animate={activeZone === 'about' ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                  transition={{ duration: 0.9, delay: 0.65, ease: [0.16, 1, 0.3, 1] }}
                >
                  experiences.
                </motion.span>
              </div>

              {/* Body copy */}
              <motion.p
                className="about-description"
                initial={{ opacity: 0, y: 12 }}
                animate={activeZone === 'about' ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
                transition={{ duration: 0.9, delay: 0.8, ease: [0.16, 1, 0.3, 1] }}
              >
                A creative studio at the intersection of art, technology, and human
                connection — transforming the ordinary into the extraordinary through
                meticulous craft and a relentless pursuit of beauty.
              </motion.p>

              {/* Stats row */}
              <motion.div
                className="about-stats"
                initial={{ opacity: 0 }}
                animate={activeZone === 'about' ? { opacity: 1 } : { opacity: 0 }}
                transition={{ duration: 0.9, delay: 1.0 }}
              >
                <div className="stat-item">
                  <span className="stat-number">120+</span>
                  <span className="stat-label">Projects</span>
                </div>
                <div className="stat-divider" />
                <div className="stat-item">
                  <span className="stat-number">40+</span>
                  <span className="stat-label">Clients</span>
                </div>
                <div className="stat-divider" />
                <div className="stat-item">
                  <span className="stat-number">8</span>
                  <span className="stat-label">Awards</span>
                </div>
              </motion.div>
            </motion.div>

            <div className="about-divider" />

            {/* RIGHT — luxury image treatment */}
            <motion.div
              className="about-right"
              initial={{ opacity: 0 }}
              animate={activeZone === 'about' ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: 1.1, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="about-image-frame">
                {/* Offset decorative border */}
                <div className="image-border-offset" />

                {/* Fluid blob reveal — base image + helmet image revealed on hover */}
                <FluidRevealImage
                  baseImage="/WITHOUT.png"
                  revealImage="/WITH.png"
                />

                {/* Floating caption tag */}
                <div className="image-caption-tag">
                  <span>Studio / 2024</span>
                </div>
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

      <ZoneCounter activeZone={activeZone} />
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