import React, {
  useRef, useMemo, useEffect, useState, useCallback, Suspense
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Points, PointMaterial, useGLTF } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { gsap } from 'gsap';
import { motion, AnimatePresence } from 'framer-motion';

gsap.registerPlugin(ScrollTrigger);

// ─────────────────────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────────────────────
const MODEL_CONFIG = {
  scale: 1.15,
  autoRotateSpeed: 0.001,
};

const ROTATION_CONFIG = {
  friction: 0.97,
  clickForce: 0.05,
  maxVelocity: 0.15,
};

const ZONES = [
  { id: 'cube',   index: '01', label: 'WELCOME',      title: 'WELCOME TO' },
  { id: 'model',  index: '02', label: 'INTRODUCTION', title: null         },
  { id: 'about',  index: '03', label: 'ABOUT',        title: null         },
  { id: 'skills', index: '04', label: 'SKILLS',       title: null         },
  { id: 'blank',  index: '05', label: 'PORTFOLIO',    title: null         },
];

const ZONE_TOTAL = ZONES.length;

// ─────────────────────────────────────────────────────────────
//  LOADING SCREEN
// ─────────────────────────────────────────────────────────────
function LoadingScreen({ progress }) {
  return (
    <motion.div
      className="loading-screen"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.8, ease: [0.76, 0, 0.24, 1] } }}
    >
      <div className="loading-content">
        <div className="loading-logo">
          <span className="loading-logo-text">STUDIO</span>
          <span className="loading-logo-dot" />
        </div>
        <div className="loading-bar-track">
          <motion.div
            className="loading-bar-fill"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        </div>
        <div className="loading-percentage">{Math.round(progress)}%</div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
//  ZONE COUNTER
// ─────────────────────────────────────────────────────────────
function ZoneCounter({ activeZone, isLight }) {
  const zone       = ZONES.find(z => z.id === activeZone) || ZONES[0];
  const color      = isLight ? '#ffffff' : 'var(--ink)';
  const colorFaint = isLight ? 'rgba(255,255,255,0.4)' : 'var(--ink)';

  return (
    <div className="zone-counter" style={{ color }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={zone.index}
          className="zone-counter-inner"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.4 }}
        >
          <span className="zone-number" style={{ color }}>{zone.index}</span>
          <div className="zone-meta">
            <div className="zone-divider" style={{ background: colorFaint }} />
            <span className="zone-label" style={{ color: colorFaint }}>{zone.label}</span>
          </div>
          <span className="zone-total" style={{ color: colorFaint }}>/ {String(ZONE_TOTAL).padStart(2, '0')}</span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  NAVIGATION DOTS
// ─────────────────────────────────────────────────────────────
function NavDots({ activeZone, onNavigate, isLight, onDotHover }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  const borderColor       = isLight ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)';
  const activeBorderColor = isLight ? '#ffffff' : 'var(--ink)';
  const fillColor         = isLight ? '#ffffff' : 'var(--ink)';

  return (
    <nav className="nav-dots" aria-label="Section navigation">
      {ZONES.map((zone, i) => {
        const isHovered   = hoveredIndex === i;
        const isNeighbour = hoveredIndex !== null && Math.abs(hoveredIndex - i) === 1;

        return (
          <motion.button
            key={zone.id}
            className={`nav-dot ${activeZone === zone.id ? 'active' : ''}`}
            onClick={() => onNavigate(i / (ZONES.length - 1))}
            onMouseEnter={() => { setHoveredIndex(i); onDotHover(zone.label); }}
            onMouseLeave={() => { setHoveredIndex(null); onDotHover(null); }}
            aria-label={`Go to ${zone.label}`}
            animate={{
              scale: isHovered ? 2 : isNeighbour ? 1.4 : 1,
              borderColor: activeZone === zone.id ? activeBorderColor : borderColor,
            }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            style={{ originX: '50%', originY: '50%' }}
          >
            <span className="nav-dot-fill" style={{ background: fillColor }} />
          </motion.button>
        );
      })}
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────
//  SCROLL INDICATOR
// ─────────────────────────────────────────────────────────────
function ScrollIndicator({ visible }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="scroll-indicator"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.8, delay: 1 }}
        >
          <motion.div
            className="scroll-mouse"
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
          >
            <motion.div
              className="scroll-wheel"
              animate={{ y: [0, 6, 0] }}
              transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
            />
          </motion.div>
          <span className="scroll-text">SCROLL</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────
//  CUSTOM CURSOR
// ─────────────────────────────────────────────────────────────
function HTMLCursor({ isLight, hoveredDotLabel }) {
  const cursorOuterRef = useRef();
  const cursorInnerRef = useRef();
  const labelRef       = useRef();
  const mousePos  = useRef({ x: -200, y: -200 });
  const outerPos  = useRef({ x: -200, y: -200 });
  const innerPos  = useRef({ x: -200, y: -200 });
  const rafId     = useRef(null);
  const isVisible = useRef(false);

  const isTouchDevice = typeof window !== 'undefined' &&
    window.matchMedia('(hover: none) and (pointer: coarse)').matches;

  const color       = isLight ? '#ffffff' : 'var(--ink)';
  const borderColor = isLight ? 'rgba(255,255,255,0.8)' : 'var(--ink)';

  useEffect(() => {
    if (isTouchDevice) return;

    const onMove = (e) => {
      mousePos.current = { x: e.clientX, y: e.clientY };
      if (!isVisible.current) {
        isVisible.current = true;
        outerPos.current = innerPos.current = { ...mousePos.current };
      }
    };
    const onLeave = () => { isVisible.current = false; };
    const onEnter = () => { isVisible.current = true; };

    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
    document.addEventListener('mouseenter', onEnter);

    const animate = () => {
      innerPos.current.x += (mousePos.current.x - innerPos.current.x) * 0.3;
      innerPos.current.y += (mousePos.current.y - innerPos.current.y) * 0.3;
      outerPos.current.x += (innerPos.current.x - outerPos.current.x) * 0.1;
      outerPos.current.y += (innerPos.current.y - outerPos.current.y) * 0.1;

      const o = isVisible.current ? 1 : 0;

      if (cursorInnerRef.current) {
        cursorInnerRef.current.style.left    = `${innerPos.current.x}px`;
        cursorInnerRef.current.style.top     = `${innerPos.current.y}px`;
        cursorInnerRef.current.style.opacity = o;
      }
      if (cursorOuterRef.current) {
        cursorOuterRef.current.style.left    = `${outerPos.current.x}px`;
        cursorOuterRef.current.style.top     = `${outerPos.current.y}px`;
        cursorOuterRef.current.style.opacity = o;
      }
      if (labelRef.current) {
        labelRef.current.style.left = `${outerPos.current.x + 28}px`;
        labelRef.current.style.top  = `${outerPos.current.y}px`;
      }

      rafId.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('mouseenter', onEnter);
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [isTouchDevice]);

  if (isTouchDevice) return null;

  return (
    <>
      <div
        ref={cursorOuterRef}
        className="html-cursor-outer"
        style={{ borderColor, width: 42, height: 42, borderRadius: '50%' }}
      />
      <div
        ref={cursorInnerRef}
        className="html-cursor-inner"
        style={{ background: color }}
      />
      <div
        ref={labelRef}
        style={{
          position: 'fixed',
          transform: 'translateY(-50%)',
          zIndex: 10000,
          pointerEvents: 'none',
        }}
      >
        <AnimatePresence mode="wait">
          {hoveredDotLabel && (
            <motion.span
              key={hoveredDotLabel}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0  }}
              exit={{    opacity: 0, x: -8 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              style={{
                color,
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                fontSize: '0.58rem',
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                fontWeight: 400,
                whiteSpace: 'nowrap',
                display: 'block',
              }}
            >
              {hoveredDotLabel}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
//  PARTICLES
// ─────────────────────────────────────────────────────────────
function BackgroundParticles({ setZone, activeZone, rotationVelocity, particleColor }) {
  const pointsRef      = useRef();
  const count          = 12000;
  const scrollProgress = useRef(0);
  const prevZone       = useRef(activeZone);
  const isBlank        = useRef(false);
  const { scene }      = useGLTF('/logo1.glb');

  // seedBuffer: sphere spread so every particle starts at a valid non-zero position
  // modelShape: sampled from GLB mesh surface
  // cubeShape:  wide cloud spread for zone 1
  const [seedBuffer, modelShape, cubeShape] = useMemo(() => {
    const seed = new Float32Array(count * 3);
    const m    = new Float32Array(count * 3);
    const cb   = new Float32Array(count * 3);

    const tempPoints = [];
    scene.traverse((child) => {
      if (child.isMesh) {
        const positions = child.geometry.attributes.position.array;
        const matrix    = child.matrixWorld;
        for (let i = 0; i < positions.length; i += 3) {
          const v = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
          v.applyMatrix4(matrix);
          tempPoints.push(v);
        }
      }
    });

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      // Seed — uniform sphere, guarantees no (0,0,0) entries
      const st  = Math.random() * Math.PI * 2;
      const sp  = Math.acos((Math.random() * 2) - 1);
      const sr  = 2.5 + Math.random() * 0.5;
      seed[i3]     = sr * Math.sin(sp) * Math.cos(st);
      seed[i3 + 1] = sr * Math.sin(sp) * Math.sin(st);
      seed[i3 + 2] = sr * Math.cos(sp);

      // Model — sample GLB mesh surface
      if (tempPoints.length > 0) {
        const rp = tempPoints[Math.floor(Math.random() * tempPoints.length)];
        const ms = rp.clone().multiplyScalar(MODEL_CONFIG.scale);
        m[i3] = ms.x; m[i3 + 1] = ms.y; m[i3 + 2] = ms.z;
      } else {
        m[i3] = seed[i3]; m[i3 + 1] = seed[i3 + 1]; m[i3 + 2] = seed[i3 + 2];
      }

      // Cloud spread for zone 1
      cb[i3]     = (Math.random() - 0.5) * 18;
      cb[i3 + 1] = (Math.random() - 0.5) * 12;
      cb[i3 + 2] = (Math.random() - 0.5) * 12;
    }

    return [seed, m, cb];
  }, [scene, count]);

  useEffect(() => {
    const st = ScrollTrigger.create({
      trigger: 'body',
      start: 'top top',
      end: 'bottom bottom',
      scrub: 1.2,
      onUpdate: (self) => { scrollProgress.current = self.progress; },
    });
    return () => st.kill();
  }, []);

  useFrame(() => {
    if (!pointsRef.current) return;
    const p = scrollProgress.current;

    let newZone = 'cube';
    if      (p > 0.80) newZone = 'blank';
    else if (p > 0.60) newZone = 'skills';
    else if (p > 0.40) newZone = 'about';
    else if (p > 0.20) newZone = 'model';

    if (prevZone.current !== newZone) {
      prevZone.current = newZone;
      isBlank.current  = newZone === 'blank';
      setZone(newZone);
    }

    if (!isBlank.current) {
      const pos = pointsRef.current.geometry.attributes.position.array;

      for (let i = 0; i < count * 3; i++) {
        let target;
        if (p <= 0.20) {
          // Zone 1: cloud
          target = cubeShape[i];
        } else if (p <= 0.40) {
          // Zone 2: model
          target = modelShape[i];
        } else {
          // Zones 3+: lerp model → seed sphere (about/skills hold sphere)
          target = THREE.MathUtils.lerp(
            modelShape[i], seedBuffer[i],
            THREE.MathUtils.clamp((p - 0.40) / 0.20, 0, 1)
          );
        }

        pos[i] += (target - pos[i]) * 0.045;
      }
      pointsRef.current.geometry.attributes.position.needsUpdate = true;
    }

    pointsRef.current.rotation.y += MODEL_CONFIG.autoRotateSpeed + rotationVelocity.current.y;
    pointsRef.current.rotation.x += rotationVelocity.current.x;
    rotationVelocity.current.x = Math.abs(rotationVelocity.current.x) > 0.0001
      ? rotationVelocity.current.x * ROTATION_CONFIG.friction : 0;
    rotationVelocity.current.y = Math.abs(rotationVelocity.current.y) > 0.0001
      ? rotationVelocity.current.y * ROTATION_CONFIG.friction : 0;
  });

  return (
    <Points ref={pointsRef} stride={3} positions={seedBuffer}>
      <PointMaterial
        transparent
        color={particleColor}
        size={0.022}
        sizeAttenuation
        depthWrite={false}
        opacity={0.95}
      />
    </Points>
  );
}

// ─────────────────────────────────────────────────────────────
//  CLICK / DRAG HANDLER
// ─────────────────────────────────────────────────────────────
function ClickHandler({ rotationVelocity }) {
  const { size } = useThree();
  const startPos   = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);

  useEffect(() => {
    const onDown = (x, y) => { startPos.current = { x, y }; isDragging.current = true; };
    const onUp = (x, y) => {
      if (!isDragging.current) return;
      isDragging.current = false;
      const dx = (x - startPos.current.x) / size.width;
      const dy = (y - startPos.current.y) / size.height;
      if (Math.abs(x - startPos.current.x) > 2 || Math.abs(y - startPos.current.y) > 2) {
        rotationVelocity.current.y = THREE.MathUtils.clamp(
          dx * ROTATION_CONFIG.clickForce * 6, -ROTATION_CONFIG.maxVelocity, ROTATION_CONFIG.maxVelocity);
        rotationVelocity.current.x = THREE.MathUtils.clamp(
          dy * ROTATION_CONFIG.clickForce * 6, -ROTATION_CONFIG.maxVelocity, ROTATION_CONFIG.maxVelocity);
      }
    };

    const mDown  = (e) => onDown(e.clientX, e.clientY);
    const mUp    = (e) => onUp(e.clientX, e.clientY);
    const tStart = (e) => onDown(e.touches[0].clientX, e.touches[0].clientY);
    const tEnd   = (e) => onUp(e.changedTouches[0].clientX, e.changedTouches[0].clientY);

    window.addEventListener('mousedown',  mDown);
    window.addEventListener('mouseup',    mUp);
    window.addEventListener('touchstart', tStart, { passive: true });
    window.addEventListener('touchend',   tEnd,   { passive: true });
    return () => {
      window.removeEventListener('mousedown',  mDown);
      window.removeEventListener('mouseup',    mUp);
      window.removeEventListener('touchstart', tStart);
      window.removeEventListener('touchend',   tEnd);
    };
  }, [size, rotationVelocity]);

  return null;
}

// ─────────────────────────────────────────────────────────────
//  FLUID BLOB REVEAL IMAGE
// ─────────────────────────────────────────────────────────────
function FluidRevealImage({ baseImage, revealImage }) {
  const containerRef = useRef();
  const blobRef      = useRef();
  const mouse        = useRef({ x: 0, y: 0 });
  const blob         = useRef({ x: 0, y: 0 });
  const rafRef       = useRef();
  const isHovered    = useRef(false);
  const blobOpacity  = useRef(0);
  const blobRadius   = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

    const onMove  = (e) => {
      const rect = el.getBoundingClientRect();
      mouse.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onEnter = () => { isHovered.current = true; };
    const onLeave = () => { isHovered.current = false; };
    const onTouchMove = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const t = e.touches[0];
      mouse.current = { x: t.clientX - rect.left, y: t.clientY - rect.top };
      isHovered.current = true;
    };
    const onTouchEnd = () => { isHovered.current = false; };

    if (isTouch) {
      el.addEventListener('touchmove',  onTouchMove, { passive: false });
      el.addEventListener('touchstart', onTouchMove, { passive: false });
      el.addEventListener('touchend',   onTouchEnd);
    } else {
      el.addEventListener('mousemove',  onMove);
      el.addEventListener('mouseenter', onEnter);
      el.addEventListener('mouseleave', onLeave);
    }

    const animate = () => {
      blob.current.x += (mouse.current.x - blob.current.x) * 0.1;
      blob.current.y += (mouse.current.y - blob.current.y) * 0.1;
      const tOpacity = isHovered.current ? 1 : 0;
      const tRadius  = isHovered.current ? 52 : 0;
      blobOpacity.current += (tOpacity - blobOpacity.current) * 0.07;
      blobRadius.current  += (tRadius  - blobRadius.current)  * 0.1;
      if (blobRef.current) {
        const { x, y } = blob.current;
        const r = blobRadius.current;
        blobRef.current.style.opacity        = blobOpacity.current;
        blobRef.current.style.clipPath       = `circle(${r}px at ${x}px ${y}px)`;
        blobRef.current.style.webkitClipPath = `circle(${r}px at ${x}px ${y}px)`;
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
      <img src={baseImage}   alt="Portrait"              className="about-image fluid-base"   />
      <img ref={blobRef} src={revealImage} alt="Portrait alternate" className="about-image fluid-reveal" />
      <div className="image-gradient-overlay" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  WAVE DOT GRID
// ─────────────────────────────────────────────────────────────
function WaveDotGrid({ visible }) {
  const canvasRef = useRef();
  const rafRef    = useRef();
  const activeRef = useRef(visible);

  useEffect(() => { activeRef.current = visible; }, [visible]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const SPACING = 26, AMPLITUDE = 9, FREQ = 0.048, SPEED = 0.018, DOT_R = 1.3;
    let W, H, cols, rows, t = 0, opacity = 0;

    const resize = () => {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
      cols = Math.ceil(W / SPACING) + 2;
      rows = Math.ceil(H / SPACING) + 2;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(document.documentElement);

    const draw = () => {
      opacity += ((activeRef.current ? 1 : 0) - opacity) * 0.04;
      ctx.clearRect(0, 0, W, H);
      if (opacity > 0.005) {
        t += SPEED;
        ctx.beginPath();
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const bx = c * SPACING, by = r * SPACING;
            const w1 = Math.sin(bx * FREQ + t) * AMPLITUDE;
            const w2 = Math.cos(by * FREQ * 0.8 + t * 0.7) * AMPLITUDE * 0.6;
            const d  = Math.sin((bx + by) * FREQ * 0.5 + t * 1.2) * AMPLITUDE * 0.4;
            const x  = bx + w1 + d, y = by + w2 + d;
            const phase = Math.sin(bx * FREQ * 1.5 + by * FREQ + t * 1.1);
            const r2 = DOT_R * (0.55 + 0.45 * ((phase + 1) / 2));
            ctx.moveTo(x + r2, y);
            ctx.arc(x, y, r2, 0, Math.PI * 2);
          }
        }
        ctx.fillStyle = `rgba(0,0,0,${0.22 * opacity})`;
        ctx.fill();
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className="wave-dot-canvas" aria-hidden="true" />;
}

// ─────────────────────────────────────────────────────────────
//  SKILLS GRID
// ─────────────────────────────────────────────────────────────
const SKILL_ITEMS = [
  { category: 'Design',   items: ['Figma', 'After Effects', 'Cinema 4D', 'Blender'] },
  { category: 'Frontend', items: ['React', 'Three.js', 'GSAP', 'WebGL'] },
  { category: 'Backend',  items: ['Node.js', 'GraphQL', 'PostgreSQL', 'Redis'] },
  { category: 'Creative', items: ['Direction', 'Branding', 'Motion', 'Strategy'] },
];

function SkillsGrid({ active }) {
  return (
    <div className="skills-grid">
      {SKILL_ITEMS.map((group, gi) => (
        <motion.div
          key={group.category}
          className="skill-group"
          initial={{ opacity: 0, y: 20 }}
          animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6, delay: active ? 0.5 + gi * 0.1 : 0 }}
        >
          <div className="skill-category">{group.category}</div>
          <div className="skill-tags">
            {group.items.map((skill, si) => (
              <motion.span
                key={skill}
                className="skill-tag"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={active ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.4, delay: active ? 0.6 + gi * 0.1 + si * 0.05 : 0 }}
              >
                {skill}
              </motion.span>
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  FINALE PARTICLES
// ─────────────────────────────────────────────────────────────
const FINALE_COUNT = 110;
const LINK_DIST    = 100;
const CELL_SIZE    = LINK_DIST;

function FinaleParticles({ active }) {
  const canvasRef = useRef();
  const rafRef    = useRef();
  const activeRef = useRef(active);
  const stateRef  = useRef({ particles: [], W: 0, H: 0, opacity: 0 });

  useEffect(() => { activeRef.current = active; }, [active]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const spawn = (W, H) => Array.from({ length: FINALE_COUNT }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: 0.9 + Math.random() * 1.4,
      vx: (Math.random() - 0.5) * 0.15, vy: (Math.random() - 0.5) * 0.10,
      alpha: 0.15 + Math.random() * 0.4,
      pulse: Math.random() * Math.PI * 2, pulseSpeed: 0.007 + Math.random() * 0.01,
    }));

    const resize = () => {
      const W = canvas.width  = window.innerWidth;
      const H = canvas.height = window.innerHeight;
      stateRef.current.W = W; stateRef.current.H = H;
      stateRef.current.particles = spawn(W, H);
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      const s = stateRef.current;
      s.opacity += ((activeRef.current ? 1 : 0) - s.opacity) * 0.04;
      if (s.opacity < 0.005) { rafRef.current = requestAnimationFrame(draw); return; }

      ctx.clearRect(0, 0, s.W, s.H);
      const { particles: pts, W, H, opacity } = s;
      const cols = Math.ceil(W / CELL_SIZE) + 1;
      const rows = Math.ceil(H / CELL_SIZE) + 1;
      const grid = new Array(cols * rows);

      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        p.x += p.vx; p.y += p.vy; p.pulse += p.pulseSpeed;
        if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10;
        if (p.y < -10) p.y = H + 10; if (p.y > H + 10) p.y = -10;
        const cx = Math.floor(p.x / CELL_SIZE), cy = Math.floor(p.y / CELL_SIZE);
        const key = cy * cols + cx;
        if (!grid[key]) grid[key] = [];
        grid[key].push(i);
      }

      ctx.lineWidth = 0.5;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const cx = Math.floor(a.x / CELL_SIZE), cy = Math.floor(a.y / CELL_SIZE);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
            const cell = grid[ny * cols + nx];
            if (!cell) continue;
            for (let k = 0; k < cell.length; k++) {
              const j = cell[k];
              if (j <= i) continue;
              const b = pts[j];
              const dist = Math.hypot(a.x - b.x, a.y - b.y);
              if (dist < LINK_DIST) {
                ctx.beginPath();
                ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
                ctx.strokeStyle = `rgba(255,255,255,${(1 - dist / LINK_DIST) * 0.07 * opacity})`;
                ctx.stroke();
              }
            }
          }
        }
      }

      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const breathe = 0.5 + 0.5 * Math.sin(p.pulse);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${p.alpha * breathe * opacity})`;
        ctx.fill();
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener('resize', resize); };
  }, []);

  return <canvas ref={canvasRef} className="finale-particles-canvas" aria-hidden="true" />;
}

// ─────────────────────────────────────────────────────────────
//  MAIN APP
// ─────────────────────────────────────────────────────────────
export default function App() {
  const [activeZone,      setActiveZone]      = useState('cube');
  const [isLoaded,        setIsLoaded]        = useState(false);
  const [loadProgress,    setLoadProgress]    = useState(0);
  const [hoveredDotLabel, setHoveredDotLabel] = useState(null);
  const rotationVelocity = useRef({ x: 0, y: 0 });

  useEffect(() => {
    let start = null;
    const duration = 2200;
    const raf = (ts) => {
      if (!start) start = ts;
      const prog = Math.min(((ts - start) / duration) * 100, 100);
      setLoadProgress(prog);
      if (prog < 100) requestAnimationFrame(raf);
      else setTimeout(() => setIsLoaded(true), 300);
    };
    requestAnimationFrame(raf);
  }, []);

  const handleNavigate = useCallback((progress) => {
    const totalHeight = document.body.scrollHeight - window.innerHeight;
    window.scrollTo({ top: totalHeight * progress, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      const currentIdx = ZONES.findIndex(z => z.id === activeZone);
      if (e.key === 'ArrowDown' && currentIdx < ZONES.length - 1)
        handleNavigate(currentIdx / (ZONES.length - 1) + 1 / (ZONES.length - 1));
      if (e.key === 'ArrowUp' && currentIdx > 0)
        handleNavigate((currentIdx - 1) / (ZONES.length - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeZone, handleNavigate]);

  const particleColor    = activeZone === 'blank' ? '#ffffff' : '#111111';
  const isCardZone       = activeZone === 'about' || activeZone === 'skills';
  const currentZoneTitle = ZONES.find(z => z.id === activeZone)?.title;
  const isLight          = activeZone === 'blank';

  return (
    <>
      <AnimatePresence>
        {!isLoaded && <LoadingScreen progress={loadProgress} />}
      </AnimatePresence>

      <div style={{ height: '600vh', width: '100%' }} aria-hidden="true" />

      <HTMLCursor isLight={isLight} hoveredDotLabel={hoveredDotLabel} />
      <NavDots
        activeZone={activeZone}
        onNavigate={handleNavigate}
        isLight={isLight}
        onDotHover={setHoveredDotLabel}
      />

      {/* ── CARD DECK ─────────────────────────────────────────── */}
      <div
        className="card-deck-stage"
        style={{
          pointerEvents: isCardZone ? 'all' : 'none',
          opacity:       isCardZone ? 1 : 0,
          transition: 'opacity 0.8s ease',
        }}
      >
        <WaveDotGrid visible={isCardZone} />

        {/* ABOUT CARD */}
        <motion.div
          className="glass-container card-deck-card"
          style={{ zIndex: 2 }}
          animate={
            activeZone === 'about'
              ? { y: '0%',    scale: 1,    opacity: 1 }
              : activeZone === 'skills'
              ? { y: '-112%', scale: 1,    opacity: 0 }
              : { y: '0%',    scale: 1,    opacity: 0 }
          }
          transition={{ duration: 0.7, ease: [0.32, 0, 0.67, 0] }}
        >
          <div className="about-wrapper">
            <motion.div
              className="about-left"
              animate={activeZone === 'about' ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: 1, delay: 0.35 }}
            >
              <div className="about-eyebrow">
                <span className="eyebrow-line" />
                <span className="eyebrow-text">Est. 2024</span>
              </div>
              <div className="about-title-block">
                {['We craft', 'experiences.'].map((line, i) => (
                  <motion.span
                    key={line}
                    className={`about-title-line${i === 1 ? ' about-title-italic' : ''}`}
                    initial={{ opacity: 0, y: 24 }}
                    animate={activeZone === 'about' ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
                    transition={{ duration: 0.9, delay: 0.5 + i * 0.15, ease: [0.16, 1, 0.3, 1] }}
                  >
                    {line}
                  </motion.span>
                ))}
              </div>
              <motion.p
                className="about-description"
                initial={{ opacity: 0, y: 14 }}
                animate={activeZone === 'about' ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
                transition={{ duration: 0.9, delay: 0.82, ease: [0.16, 1, 0.3, 1] }}
              >
                A creative studio at the intersection of art, technology, and human
                connection — transforming the ordinary into the extraordinary through
                meticulous craft and a relentless pursuit of beauty.
              </motion.p>
              <motion.div
                className="about-stats"
                animate={activeZone === 'about' ? { opacity: 1 } : { opacity: 0 }}
                transition={{ duration: 0.9, delay: 1.05 }}
              >
                {[['120+', 'Projects'], ['40+', 'Clients'], ['8', 'Awards']].map(([n, l], i) => (
                  <React.Fragment key={l}>
                    {i > 0 && <div className="stat-divider" />}
                    <div className="stat-item">
                      <span className="stat-number">{n}</span>
                      <span className="stat-label">{l}</span>
                    </div>
                  </React.Fragment>
                ))}
              </motion.div>
            </motion.div>

            <div className="about-divider" />

            <motion.div
              className="about-right"
              animate={activeZone === 'about' ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: 1.1, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="about-image-frame">
                <div className="image-border-offset" />
                <FluidRevealImage baseImage="/WITHOUT.png" revealImage="/WITH.png" />
                <div className="image-caption-tag"><span>Studio / 2024</span></div>
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* SKILLS CARD */}
        <motion.div
          className="glass-container card-deck-card"
          style={{ zIndex: 1 }}
          animate={
            activeZone === 'about'
              ? { y: '5%',   scale: 0.94, opacity: 1 }
              : activeZone === 'skills'
              ? { y: '0%',   scale: 1,    opacity: 1 }
              : { y: '5%',   scale: 0.94, opacity: 0 }
          }
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="about-wrapper">
            <motion.div
              className="about-left"
              animate={activeZone === 'skills' ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: 0.6, delay: activeZone === 'skills' ? 0.35 : 0 }}
            >
              <div className="about-eyebrow">
                <span className="eyebrow-line" />
                <span className="eyebrow-text">Capabilities</span>
              </div>
              <div className="about-title-block">
                {['Skills &', 'expertise.'].map((line, i) => (
                  <motion.span
                    key={line}
                    className={`about-title-line${i === 1 ? ' about-title-italic' : ''}`}
                    animate={activeZone === 'skills' ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                    transition={{ duration: 0.9, delay: activeZone === 'skills' ? 0.5 + i * 0.15 : 0, ease: [0.16, 1, 0.3, 1] }}
                  >
                    {line}
                  </motion.span>
                ))}
              </div>
              <motion.p
                className="about-description"
                animate={activeZone === 'skills' ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
                transition={{ duration: 0.9, delay: activeZone === 'skills' ? 0.82 : 0, ease: [0.16, 1, 0.3, 1] }}
              >
                Where technical precision meets creative instinct — a curated set of
                tools and disciplines refined across three years of multidisciplinary
                practice.
              </motion.p>
              <motion.div
                className="about-stats"
                animate={activeZone === 'skills' ? { opacity: 1 } : { opacity: 0 }}
                transition={{ duration: 0.9, delay: activeZone === 'skills' ? 1.0 : 0 }}
              >
                {[['3+', 'Years'], ['12+', 'Tools'], ['5', 'Domains']].map(([n, l], i) => (
                  <React.Fragment key={l}>
                    {i > 0 && <div className="stat-divider" />}
                    <div className="stat-item">
                      <span className="stat-number">{n}</span>
                      <span className="stat-label">{l}</span>
                    </div>
                  </React.Fragment>
                ))}
              </motion.div>
            </motion.div>

            <div className="about-divider" />

            <motion.div
              className="about-right"
              animate={activeZone === 'skills' ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: 1.1, delay: activeZone === 'skills' ? 0.45 : 0, ease: [0.16, 1, 0.3, 1] }}
            >
              <SkillsGrid active={activeZone === 'skills'} />
            </motion.div>
          </div>
        </motion.div>
      </div>

      {/* ── FINALE ───────────────────────────────────────────── */}
      <div className={`final-content-page ${activeZone === 'blank' ? 'visible' : ''}`}>
        <FinaleParticles active={activeZone === 'blank'} />
        <motion.div
          className="finale-wrapper"
          initial={{ opacity: 0 }}
          animate={activeZone === 'blank' ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 1.2, delay: 0.4 }}
        >
          <motion.div
            className="finale-bg-number"
            initial={{ opacity: 0, scale: 1.15 }}
            animate={activeZone === 'blank' ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 1.15 }}
            transition={{ duration: 1.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >05</motion.div>

          <div className="finale-center">
            <motion.div
              className="finale-eyebrow"
              initial={{ opacity: 0, y: 12 }}
              animate={activeZone === 'blank' ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
              transition={{ duration: 0.8, delay: 0.6 }}
            >
              <span className="finale-eyebrow-line" />
              <span>The Continuum</span>
              <span className="finale-eyebrow-line" />
            </motion.div>

            <motion.h2
              className="finale-title"
              initial={{ opacity: 0, y: 30 }}
              animate={activeZone === 'blank' ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
              transition={{ duration: 1, delay: 0.75, ease: [0.16, 1, 0.3, 1] }}
            >
              From structure<br />
              <span className="finale-title-italic">to blueprint.</span>
            </motion.h2>

            <motion.p
              className="finale-description"
              initial={{ opacity: 0, y: 16 }}
              animate={activeZone === 'blank' ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
              transition={{ duration: 0.9, delay: 1.0, ease: [0.16, 1, 0.3, 1] }}
            >
              Every form begins as chaos. Every idea as noise.<br />
              What you witnessed was the process — raw to refined.
            </motion.p>

            <motion.div
              className="finale-cta-row"
              initial={{ opacity: 0, y: 14 }}
              animate={activeZone === 'blank' ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
              transition={{ duration: 0.8, delay: 1.25 }}
            >
              <button className="finale-btn-primary">Start a Project</button>
              <button className="finale-btn-ghost">View Work</button>
            </motion.div>
          </div>

          <motion.div
            className="finale-timeline"
            initial={{ opacity: 0 }}
            animate={activeZone === 'blank' ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 1, delay: 1.5 }}
          >
            {ZONES.slice(0, 4).map((zone, i) => (
              <React.Fragment key={zone.id}>
                <div className="finale-timeline-item">
                  <span className="finale-timeline-num">{zone.index}</span>
                  <span className="finale-timeline-label">{zone.label}</span>
                </div>
                {i < 3 && <div className="finale-timeline-connector" />}
              </React.Fragment>
            ))}
          </motion.div>
        </motion.div>
      </div>

      {/* ── CENTER TITLE OVERLAY ─────────────────────────────── */}
      <div className="ui-overlay">
        <AnimatePresence mode="wait">
          {!isCardZone && activeZone !== 'blank' && currentZoneTitle && (
            <motion.div
              key={activeZone}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.04 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="center-content"
            >
              <motion.div
                className="center-eyebrow"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.6 }}
              >
                {ZONES.find(z => z.id === activeZone)?.index}
              </motion.div>
              <h1>{currentZoneTitle}</h1>
              <motion.div
                className="decorative-line"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.3, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ZoneCounter activeZone={activeZone} isLight={isLight} />
      <ScrollIndicator visible={activeZone === 'cube'} />

      {/* ── THREE.JS CANVAS ─────────────────────────────────── */}
      <div className="canvas-container" style={{ visibility: activeZone === 'blank' ? 'hidden' : 'visible' }}>
        <Canvas camera={{ position: [0, 0, 5], fov: 85 }} frameloop="always">
          <color attach="background" args={['#ffffff']} />
          <Suspense fallback={null}>
            <BackgroundParticles
              setZone={setActiveZone}
              activeZone={activeZone}
              rotationVelocity={rotationVelocity}
              particleColor={particleColor}
            />
          </Suspense>
          <ClickHandler rotationVelocity={rotationVelocity} />
          {activeZone !== 'blank' && (
            <EffectComposer>
              <Bloom intensity={0.35} luminanceThreshold={0.88} mipmapBlur />
              <Vignette darkness={0.45} offset={0.28} />
            </EffectComposer>
          )}
        </Canvas>
      </div>
    </>
  );
}