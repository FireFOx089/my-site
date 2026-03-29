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

const AMBIENT_INTENSITY = 0.05;

const isMobile = typeof window !== 'undefined' &&
  window.matchMedia('(hover: none) and (pointer: coarse)').matches;
const PARTICLE_COUNT = isMobile ? 3000 : 5000;

const ZONES = [
  { id: 'cube',   index: '01', label: 'WELCOME',      title: 'WELCOME TO' },
  { id: 'model',  index: '02', label: 'INTRODUCTION', title: null         },
  { id: 'about',  index: '03', label: 'ABOUT',        title: null         },
  { id: 'skills', index: '04', label: 'SKILLS',       title: null         },
  { id: 'blank',  index: '05', label: 'PORTFOLIO',    title: null         },
];

const ZONE_TOTAL = ZONES.length;

// ─────────────────────────────────────────────────────────────
//  SYSTEM01 — Magnetic Particle Logo
//  Particles are always formed in logo shape.
//  Mouse hover repels them. Click explodes them outward.
//  They snap back to logo formation.
// ─────────────────────────────────────────────────────────────
const CONFIG_S01 = {
  particleCount: isMobile ? 3000 : 5000,
  particleSize:  2,
  logoSample:    4,
  restoreSpeed:  0.06,
  friction:      0.88,
  mouseRadius:   90,
  mouseForce:    18,
  clickForce:    60,
  color:         '#0a0a0a',
};

function sampleLogo(imgSrc, targetW, targetH, sampleStep) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const offscreen = document.createElement('canvas');
      offscreen.width  = targetW;
      offscreen.height = targetH;
      const ctx = offscreen.getContext('2d');
      const scale = Math.min(targetW / img.width, targetH / img.height) * 0.7;
      const w = img.width  * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (targetW - w) / 2, (targetH - h) / 2, w, h);
      const data   = ctx.getImageData(0, 0, targetW, targetH).data;
      const points = [];
      for (let py = 0; py < targetH; py += sampleStep) {
        for (let px = 0; px < targetW; px += sampleStep) {
          const idx        = (py * targetW + px) * 4;
          const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          if (data[idx + 3] > 128 && brightness < 160) points.push({ x: px, y: py });
        }
      }
      resolve(points);
    };
    img.onerror = () => resolve([]);
    img.src = imgSrc;
  });
}

function LogoParticles({ visible }) {
  const canvasRef = useRef();
  const stateRef  = useRef({
    particles: [], targets: [],
    mouse: { x: -9999, y: -9999 },
    isReady: false, raf: null,
    opacity: 0, _visible: false,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const s   = stateRef.current;

    const resize = async () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      const pts = await sampleLogo('/logo.png', canvas.width, canvas.height, CONFIG_S01.logoSample);
      if (!pts.length) return;
      const count    = Math.min(CONFIG_S01.particleCount, pts.length);
      const shuffled = pts.sort(() => Math.random() - 0.5).slice(0, count);
      s.targets      = shuffled;
      if (!s.particles.length) {
        s.particles = Array.from({ length: count }, (_, i) => ({
          x:    Math.random() * canvas.width,
          y:    Math.random() * canvas.height,
          vx:   (Math.random() - 0.5) * 4,
          vy:   (Math.random() - 0.5) * 4,
          tx:   shuffled[i].x,
          ty:   shuffled[i].y,
          size: CONFIG_S01.particleSize * (0.5 + Math.random() * 0.8),
          alpha: 0.4 + Math.random() * 0.6,
        }));
      } else {
        s.particles.forEach((p, i) => {
          if (i < shuffled.length) { p.tx = shuffled[i].x; p.ty = shuffled[i].y; }
        });
        s.particles = s.particles.slice(0, count);
      }
      s.isReady = true;
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      s.raf = requestAnimationFrame(draw);
      s.opacity += ((s._visible ? 1 : 0) - s.opacity) * 0.05;
      if (!s.isReady || s.opacity < 0.01) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const mx  = s.mouse.x, my = s.mouse.y;
      const mr2 = CONFIG_S01.mouseRadius * CONFIG_S01.mouseRadius;

      for (let i = 0; i < s.particles.length; i++) {
        const p = s.particles[i];

        // Restore toward target
        p.vx += (p.tx - p.x) * CONFIG_S01.restoreSpeed;
        p.vy += (p.ty - p.y) * CONFIG_S01.restoreSpeed;

        // Mouse repulsion
        const mdx = p.x - mx, mdy = p.y - my;
        const md2 = mdx * mdx + mdy * mdy;
        if (md2 < mr2 && md2 > 0) {
          const dist  = Math.sqrt(md2);
          const force = (CONFIG_S01.mouseRadius - dist) / CONFIG_S01.mouseRadius;
          const angle = Math.atan2(mdy, mdx);
          p.vx += Math.cos(angle) * force * CONFIG_S01.mouseForce;
          p.vy += Math.sin(angle) * force * CONFIG_S01.mouseForce;
        }

        p.vx *= CONFIG_S01.friction;
        p.vy *= CONFIG_S01.friction;
        p.x  += p.vx;
        p.y  += p.vy;

        ctx.globalAlpha = p.alpha * s.opacity;
        ctx.fillStyle   = CONFIG_S01.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    draw();
    return () => { cancelAnimationFrame(s.raf); ro.disconnect(); };
  }, []);

  useEffect(() => {
    stateRef.current._visible = visible;
  }, [visible]);

  const onMouseMove = useCallback((e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    stateRef.current.mouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const onMouseLeave = useCallback(() => {
    stateRef.current.mouse = { x: -9999, y: -9999 };
  }, []);

  const onClick = useCallback((e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    stateRef.current.particles.forEach((p) => {
      const dx = p.x - cx, dy = p.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      p.vx += (dx / dist) * (CONFIG_S01.clickForce / dist);
      p.vy += (dy / dist) * (CONFIG_S01.clickForce / dist);
    });
  }, []);

  const onTouchMove = useCallback((e) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const t = e.touches[0];
    stateRef.current.mouse = { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }, []);

  const onTouchEnd = useCallback(() => {
    stateRef.current.mouse = { x: -9999, y: -9999 };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed', inset: 0,
        width: '100%', height: '100%',
        zIndex: 5,
        pointerEvents: visible ? 'all' : 'none',
      }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    />
  );
}

// ─────────────────────────────────────────────────────────────
//  SITE LOGO — fixed top-left, swaps color on page 5
// ─────────────────────────────────────────────────────────────
function SiteLogo({ isLight }) {
  return (
    <img
      src={isLight ? '/logowhite.png' : '/logo.png'}
      alt="Studio Logo"
      style={{
        position: 'fixed',
        top: '1.4rem',
        left: '1.6rem',
        height: '30px',
        width: 'auto',
        zIndex: 200,
        pointerEvents: 'none',
        display: 'block',
      }}
    />
  );
}


// ─────────────────────────────────────────────────────────────
//  LOADING SCREEN
// ─────────────────────────────────────────────────────────────
function LoadingScreen({ progress, isReady }) {
  return (
    <motion.div
      className="loading-screen"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 1.0, ease: [0.76, 0, 0.24, 1] } }}
      style={{ pointerEvents: isReady ? 'none' : 'all' }}
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
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>
        <div className="loading-percentage">
          {progress < 100 ? `${Math.round(progress)}%` : 'READY'}
        </div>
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

    const tick = () => {
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
      rafId.current = requestAnimationFrame(tick);
    };
    tick();

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
      <div ref={cursorOuterRef} className="html-cursor-outer"
        style={{ borderColor, width: 42, height: 42, borderRadius: '50%' }} />
      <div ref={cursorInnerRef} className="html-cursor-inner"
        style={{ background: color }} />
      <div ref={labelRef} style={{ position: 'fixed', transform: 'translateY(-50%)', zIndex: 10000, pointerEvents: 'none' }}>
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
                fontSize: '0.58rem', letterSpacing: '0.22em',
                textTransform: 'uppercase', fontWeight: 400,
                whiteSpace: 'nowrap', display: 'block',
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
//  WIREFRAME MODEL — kept for rotation sync, invisible when LogoParticles shown
// ─────────────────────────────────────────────────────────────
function WireframeModel({ visible, rotationRef }) {
  const { scene } = useGLTF('/logo2.glb');
  const groupRef   = useRef();
  const opacityRef = useRef(0);

  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if (child.isMesh) {
        child.material = new THREE.MeshBasicMaterial({
          color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
        });
        child.scale.setScalar(MODEL_CONFIG.scale);

        const edges     = new THREE.EdgesGeometry(child.geometry, 15);
        const lineMat   = new THREE.LineBasicMaterial({
          color: 0x0a0a0a, transparent: true, opacity: 0, linewidth: 1,
        });
        const wireframe = new THREE.LineSegments(edges, lineMat);
        wireframe.scale.setScalar(MODEL_CONFIG.scale);
        wireframe.userData.isWireframe = true;
        child.add(wireframe);
      }
    });
    return clone;
  }, [scene]);

  useFrame(() => {
    if (!groupRef.current) return;
    const target = visible ? 1 : 0;
    opacityRef.current += (target - opacityRef.current) * 0.05;

    groupRef.current.traverse((child) => {
      if (child.isMesh && child.material) child.material.opacity = 0;
      if (child.isLineSegments && child.userData.isWireframe && child.material) {
        child.material.opacity = opacityRef.current;
      }
    });

    if (rotationRef?.current) {
      groupRef.current.rotation.y += MODEL_CONFIG.autoRotateSpeed + rotationRef.current.y;
      groupRef.current.rotation.x += rotationRef.current.x;
    }
  });

  return <primitive ref={groupRef} object={clonedScene} />;
}

// ─────────────────────────────────────────────────────────────
//  PARTICLES
// ─────────────────────────────────────────────────────────────
function BackgroundParticles({
  setZone, activeZone, rotationVelocity, particleColor, onReady, solidModelVisible
}) {
  const pointsRef        = useRef();
  const count            = PARTICLE_COUNT;
  const scrollProgress   = useRef(0);
  const prevZone         = useRef(activeZone);
  const isBlank          = useRef(false);
  const readyFired       = useRef(false);
  const { scene }        = useGLTF('/logo2.glb');

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

      const st = Math.random() * Math.PI * 2;
      const sp = Math.acos((Math.random() * 2) - 1);
      const sr = 2.5 + Math.random() * 0.5;
      seed[i3]     = sr * Math.sin(sp) * Math.cos(st);
      seed[i3 + 1] = sr * Math.sin(sp) * Math.sin(st);
      seed[i3 + 2] = sr * Math.cos(sp);

      if (tempPoints.length > 0) {
        const rp = tempPoints[Math.floor(Math.random() * tempPoints.length)];
        const ms = rp.clone().multiplyScalar(MODEL_CONFIG.scale);
        m[i3] = ms.x; m[i3 + 1] = ms.y; m[i3 + 2] = ms.z;
      } else {
        m[i3] = seed[i3]; m[i3 + 1] = seed[i3 + 1]; m[i3 + 2] = seed[i3 + 2];
      }

      cb[i3]     = (Math.random() - 0.5) * 18;
      cb[i3 + 1] = (Math.random() - 0.5) * 12;
      cb[i3 + 2] = (Math.random() - 0.5) * 12;
    }

    return [seed, m, cb];
  }, [scene, count]);

  const onReadyRef = useRef(onReady);
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);

  useEffect(() => {
    if (!readyFired.current) {
      readyFired.current = true;
      const t = setTimeout(() => onReadyRef.current(), 800);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line

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
          target = cubeShape[i];
        } else if (p <= 0.40) {
          target = modelShape[i];
        } else {
          target = THREE.MathUtils.lerp(
            modelShape[i], seedBuffer[i],
            THREE.MathUtils.clamp((p - 0.40) / 0.20, 0, 1)
          );
        }
        pos[i] += (target - pos[i]) * 0.045;
      }
      pointsRef.current.geometry.attributes.position.needsUpdate = true;
    }

    const mat = pointsRef.current.material;
    if (mat) {
      // ── FIX: hide particles on page 2 regardless of solidModelVisible
      // This prevents the broken GLB formation showing when navigating page 3→2
      const targetOpacity = (solidModelVisible || p > 0.20) ? 0 : 0.95;
      mat.opacity += (targetOpacity - mat.opacity) * 0.04;
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
        size={isMobile ? 0.03 : 0.022}
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
const FINALE_COUNT = 80;
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
  const [activeZone,        setActiveZone]        = useState('cube');
  const [loadProgress,      setLoadProgress]      = useState(0);
  const [particlesReady,    setParticlesReady]    = useState(false);
  const [isLoaded,          setIsLoaded]          = useState(false);
  const [hoveredDotLabel,   setHoveredDotLabel]   = useState(null);
  const [solidModelVisible, setSolidModelVisible] = useState(false);
  const solidTimer       = useRef(null);
  const rotationVelocity = useRef({ x: 0, y: 0 });

  // Loading bar
  useEffect(() => {
    let frame;
    let current = 0;
    const target = particlesReady ? 100 : 90;
    const tick = () => {
      const speed = particlesReady ? 3 : 0.6;
      current += (target - current) * (speed / 100);
      setLoadProgress(Math.min(current, 100));
      if (Math.abs(current - target) > 0.1) frame = requestAnimationFrame(tick);
      else setLoadProgress(target);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [particlesReady]);

  useEffect(() => {
    if (particlesReady && loadProgress >= 99) {
      const t = setTimeout(() => setIsLoaded(true), 500);
      return () => clearTimeout(t);
    }
  }, [particlesReady, loadProgress]);

  // Show logo particles after 1.2s on zone 'model', hide when leaving
  useEffect(() => {
    if (activeZone === 'model') {
      solidTimer.current = setTimeout(() => setSolidModelVisible(true), 1200);
    } else {
      clearTimeout(solidTimer.current);
      setSolidModelVisible(false);
    }
    return () => clearTimeout(solidTimer.current);
  }, [activeZone]);

  const handleParticlesReady = useCallback(() => setParticlesReady(true), []);

  // Hard fallback
  useEffect(() => {
    const t = setTimeout(() => setParticlesReady(true), 6000);
    return () => clearTimeout(t);
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
        {!isLoaded && <LoadingScreen progress={loadProgress} isReady={particlesReady} />}
      </AnimatePresence>

      <div style={{ height: '600vh', width: '100%' }} aria-hidden="true" />

      <SiteLogo isLight={isLight} />
      <HTMLCursor isLight={isLight} hoveredDotLabel={hoveredDotLabel} />
      <NavDots
        activeZone={activeZone}
        onNavigate={handleNavigate}
        isLight={isLight}
        onDotHover={setHoveredDotLabel}
      />

      {/* ── SYSTEM01 LOGO PARTICLES OVERLAY — page 2 only ───── */}
      <LogoParticles visible={solidModelVisible} />

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
        <Canvas
          camera={{ position: [0, 0, 5], fov: 85 }}
          frameloop="always"
          gl={{ antialias: !isMobile, powerPreference: 'high-performance' }}
          dpr={isMobile ? 1 : Math.min(window.devicePixelRatio, 2)}
        >
          <color attach="background" args={['#ffffff']} />
          <ambientLight intensity={AMBIENT_INTENSITY} />
          <directionalLight position={[8, 10, 5]}  intensity={3.5} color="#ffffff" />
          <directionalLight position={[-6, -4, -4]} intensity={1.2} color="#c8d8ff" />
          <pointLight        position={[0, 6, 4]}   intensity={2.0} color="#ffffff" />
          <Suspense fallback={null}>
            <BackgroundParticles
              setZone={setActiveZone}
              activeZone={activeZone}
              rotationVelocity={rotationVelocity}
              particleColor={particleColor}
              onReady={handleParticlesReady}
              solidModelVisible={solidModelVisible}
            />
            <WireframeModel
              visible={false}
              rotationRef={rotationVelocity}
            />
          </Suspense>
          <ClickHandler rotationVelocity={rotationVelocity} />
          {activeZone !== 'blank' && !isMobile && (
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