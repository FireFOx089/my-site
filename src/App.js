import React, {
  useRef, useMemo, useEffect, useState, useCallback, Suspense
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Points, PointMaterial } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { gsap } from 'gsap';
import { motion, AnimatePresence } from 'framer-motion';

gsap.registerPlugin(ScrollTrigger);

const MODEL_CONFIG = { autoRotateSpeed: 0.001 };
const ROTATION_CONFIG = { friction: 0.97, clickForce: 0.05, maxVelocity: 0.15 };
const AMBIENT_INTENSITY = 0.05;
const isMobile = typeof window !== 'undefined' &&
  window.matchMedia('(hover: none) and (pointer: coarse)').matches;

// Mobile gets fewer particles for performance
const PARTICLE_COUNT = isMobile ? 1000 : 1500;

// ─── ZONES: cube + model merged into hero ───────────────────
const ZONES = [
  { id: 'hero', index: '01', label: 'WELCOME', title: null },
  { id: 'about', index: '02', label: 'ABOUT', title: null },
  { id: 'skills', index: '03', label: 'SKILLS', title: null },
  { id: 'blank', index: '04', label: 'PORTFOLIO', title: null },
];
const ZONE_TOTAL = ZONES.length;

// Mobile sections: hero has two sub-sections (title + logo)
const MOBILE_SECTIONS = ['hero-a', 'hero-b', 'about', 'skills', 'blank'];

const CONFIG_S01 = {
  particleCount: isMobile ? 2000 : 5000,
  particleSize: 2, logoSample: 4,
  restoreSpeed: 0.06, friction: 0.88,
  mouseRadius: 90, mouseForce: 18, clickForce: 60,
  color: '#0a0a0a',
};

function sampleLogo(imgSrc, targetW, targetH, sampleStep) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (targetW === 0 || targetH === 0) { resolve([]); return; }
      const offscreen = document.createElement('canvas');
      offscreen.width = targetW; offscreen.height = targetH;
      const ctx = offscreen.getContext('2d');
      const scale = Math.min(targetW / img.width, targetH / img.height) * 0.7;
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (targetW - w) / 2, (targetH - h) / 2, w, h);
      const data = ctx.getImageData(0, 0, targetW, targetH).data;
      const points = [];
      for (let py = 0; py < targetH; py += sampleStep)
        for (let px = 0; px < targetW; px += sampleStep) {
          const idx = (py * targetW + px) * 4;
          const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          if (data[idx + 3] > 128 && brightness < 160) points.push({ x: px, y: py });
        }
      resolve(points);
    };
    img.onerror = () => resolve([]);
    img.src = imgSrc;
  });
}

// ─── LOGO PARTICLES (2D canvas, interactive) ────────────────
function LogoParticles({ visible }) {
  const canvasRef = useRef();
  const stateRef = useRef({
    particles: [], targets: [],
    mouse: { x: -9999, y: -9999 },
    isReady: false, raf: null, opacity: 0, _visible: false
  });

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); const s = stateRef.current;
    const resize = async () => {
      canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight;
      const pts = await sampleLogo('/logo.png', canvas.width, canvas.height, CONFIG_S01.logoSample);
      if (!pts.length) return;
      const count = Math.min(CONFIG_S01.particleCount, pts.length);
      const shuffled = pts.sort(() => Math.random() - 0.5).slice(0, count);
      s.targets = shuffled;
      if (!s.particles.length) {
        s.particles = Array.from({ length: count }, (_, i) => ({
          x: Math.random() * canvas.width, y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4,
          tx: shuffled[i].x, ty: shuffled[i].y,
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
    const ro = new ResizeObserver(resize); ro.observe(canvas);
    const draw = () => {
      s.raf = requestAnimationFrame(draw);
      s.opacity += ((s._visible ? 1 : 0) - s.opacity) * 0.05;
      if (!s.isReady || s.opacity < 0.01) {
        ctx.clearRect(0, 0, canvas.width, canvas.height); return;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const mx = s.mouse.x, my = s.mouse.y, mr2 = CONFIG_S01.mouseRadius * CONFIG_S01.mouseRadius;
      for (let i = 0; i < s.particles.length; i++) {
        const p = s.particles[i];
        p.vx += (p.tx - p.x) * CONFIG_S01.restoreSpeed;
        p.vy += (p.ty - p.y) * CONFIG_S01.restoreSpeed;
        const mdx = p.x - mx, mdy = p.y - my, md2 = mdx * mdx + mdy * mdy;
        if (md2 < mr2 && md2 > 0) {
          const dist = Math.sqrt(md2), force = (CONFIG_S01.mouseRadius - dist) / CONFIG_S01.mouseRadius;
          const angle = Math.atan2(mdy, mdx);
          p.vx += Math.cos(angle) * force * CONFIG_S01.mouseForce;
          p.vy += Math.sin(angle) * force * CONFIG_S01.mouseForce;
        }
        p.vx *= CONFIG_S01.friction; p.vy *= CONFIG_S01.friction;
        p.x += p.vx; p.y += p.vy;
        ctx.globalAlpha = p.alpha * s.opacity;
        ctx.fillStyle = CONFIG_S01.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    draw();
    return () => { cancelAnimationFrame(s.raf); ro.disconnect(); };
  }, []);

  useEffect(() => { stateRef.current._visible = visible; }, [visible]);

  const onMouseMove = useCallback((e) => {
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return;
    stateRef.current.mouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);
  const onMouseLeave = useCallback(() => {
    stateRef.current.mouse = { x: -9999, y: -9999 };
  }, []);
  const onClick = useCallback((e) => {
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return;
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    stateRef.current.particles.forEach((p) => {
      const dx = p.x - cx, dy = p.y - cy, dist = Math.sqrt(dx * dx + dy * dy) || 1;
      p.vx += (dx / dist) * (CONFIG_S01.clickForce / dist);
      p.vy += (dy / dist) * (CONFIG_S01.clickForce / dist);
    });
  }, []);
  const onTouchMove = useCallback((e) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return;
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
        position: 'fixed', inset: 0, width: '100%', height: '100%',
        zIndex: 5, pointerEvents: visible ? 'all' : 'none'
      }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    />
  );
}

// ─── SITE LOGO ───────────────────────────────────────────────
function SiteLogo({ isLight }) {
  return (
    <img
      src={isLight ? '/logowhite.png' : '/logo.png'}
      alt="Studio Logo"
      style={{
        position: 'fixed', top: '1.4rem', left: '1.6rem',
        height: '30px', width: 'auto', zIndex: 200,
        pointerEvents: 'none', display: 'block'
      }}
    />
  );
}

// ─── LOADING SCREEN ──────────────────────────────────────────
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

// ─── ZONE COUNTER ────────────────────────────────────────────
function ZoneCounter({ activeZone, isLight }) {
  const zone = ZONES.find(z => z.id === activeZone) || ZONES[0];
  const color = isLight ? '#ffffff' : 'var(--ink)';
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
          <span className="zone-total" style={{ color: colorFaint }}>
            / {String(ZONE_TOTAL).padStart(2, '0')}
          </span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ─── NAV DOTS ────────────────────────────────────────────────
function NavDots({ activeZone, onNavigate, isLight, onDotHover }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const borderColor = isLight ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)';
  const activeBorderColor = isLight ? '#ffffff' : 'var(--ink)';
  const fillColor = isLight ? '#ffffff' : 'var(--ink)';
  return (
    <nav className="nav-dots" aria-label="Section navigation">
      {ZONES.map((zone, i) => {
        const isHovered = hoveredIndex === i;
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
              borderColor: activeZone === zone.id ? activeBorderColor : borderColor
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

// ─── SCROLL / TAP INDICATOR ──────────────────────────────────
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
          {isMobile ? (
            <>
              <motion.div
                className="tap-icon"
                animate={{ scale: [1, 0.88, 1], opacity: [1, 0.45, 1] }}
                transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
              >
                <svg width="20" height="28" viewBox="0 0 20 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M10 2C10 2 10 8 10 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <circle cx="10" cy="16" r="5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M10 21v4M6 25h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </motion.div>
              <span className="scroll-text">TAP</span>
            </>
          ) : (
            <>
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
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── MOBILE LOGO DISPLAY (static PNG, no particles) ─────────
function MobileLogoDisplay({ visible }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="mobile-logo-display"
          initial={{ opacity: 0, scale: 0.88 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
          <img src="/logo.png" alt="Studio Logo" className="mobile-logo-img" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── HTML CURSOR ─────────────────────────────────────────────
function HTMLCursor({ isLight, hoveredDotLabel }) {
  const cursorOuterRef = useRef(); const cursorInnerRef = useRef(); const labelRef = useRef();
  const mousePos = useRef({ x: -200, y: -200 });
  const outerPos = useRef({ x: -200, y: -200 });
  const innerPos = useRef({ x: -200, y: -200 });
  const rafId = useRef(null); const isVisible = useRef(false);
  const isTouchDevice = typeof window !== 'undefined' &&
    window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  const color = isLight ? '#ffffff' : 'var(--ink)';
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
        cursorInnerRef.current.style.left = `${innerPos.current.x}px`;
        cursorInnerRef.current.style.top = `${innerPos.current.y}px`;
        cursorInnerRef.current.style.opacity = o;
      }
      if (cursorOuterRef.current) {
        cursorOuterRef.current.style.left = `${outerPos.current.x}px`;
        cursorOuterRef.current.style.top = `${outerPos.current.y}px`;
        cursorOuterRef.current.style.opacity = o;
      }
      if (labelRef.current) {
        labelRef.current.style.left = `${outerPos.current.x + 28}px`;
        labelRef.current.style.top = `${outerPos.current.y}px`;
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
      <div
        ref={cursorOuterRef}
        className="html-cursor-outer"
        style={{ borderColor, width: 42, height: 42, borderRadius: '50%' }}
      />
      <div ref={cursorInnerRef} className="html-cursor-inner" style={{ background: color }} />
      <div
        ref={labelRef}
        style={{
          position: 'fixed', transform: 'translateY(-50%)',
          zIndex: 10000, pointerEvents: 'none'
        }}
      >
        <AnimatePresence mode="wait">
          {hoveredDotLabel && (
            <motion.span
              key={hoveredDotLabel}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              style={{
                color,
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                fontSize: '0.58rem', letterSpacing: '0.22em',
                textTransform: 'uppercase', fontWeight: 400,
                whiteSpace: 'nowrap', display: 'block'
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

// ─── CINEMATIC HERO TITLE ────────────────────────────────────
// Replaces the old center title overlay for the hero zone.
// Shows during hero phase 1 (scroll 0–0.10), fades as logo emerges.
function CinematicHeroTitle({ visible, logoProgress }) {
  // Stay fully visible until logo starts forming (~0.55), then fade sharply
  const fadeStart = 0.50;
  const fadeEnd = 0.62;
  const t = Math.max(0, Math.min(1, (logoProgress - fadeStart) / (fadeEnd - fadeStart)));
  const titleOpacity = 1 - t;
  const titleY = t * -24;

  const lines = ['WELCOME', 'TO'];

  return (
    <div
      className="ui-overlay"
      style={{ pointerEvents: 'none', zIndex: 10 }}
    >
      <AnimatePresence>
        {visible && (
          <motion.div
            key="hero-title"
            className="center-content"
            style={{ opacity: titleOpacity, transform: `translateY(${titleY}px)` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Eyebrow */}
            <motion.div
              className="center-eyebrow"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.0, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              {ZONES[0].index}
            </motion.div>

            {/* Main title — letter-by-letter stagger */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.1em' }}>
              {lines.map((line, li) => (
                <div key={line} style={{ display: 'flex', overflow: 'hidden' }}>
                  {line.split('').map((char, ci) => (
                    <motion.span
                      key={`${li}-${ci}`}
                      style={{
                        display: 'inline-block',
                        fontSize: 'clamp(3rem, 13vw, 9rem)',
                        fontFamily: "'Bungee', sans-serif",
                        textTransform: 'uppercase',
                        lineHeight: 1.0,
                        letterSpacing: '0.05em',
                        color: 'var(--ink)',
                      }}
                      initial={{ y: '110%', opacity: 0 }}
                      animate={{ y: '0%', opacity: 1 }}
                      transition={{
                        duration: 0.9,
                        delay: 0.5 + li * 0.18 + ci * 0.055,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                    >
                      {char}
                    </motion.span>
                  ))}
                </div>
              ))}
            </div>

            {/* Decorative line */}
            <motion.div
              className="decorative-line"
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={{ delay: 1.4, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            />

            {/* Sub-label that fades in last */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.7, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              style={{
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                fontSize: '0.65rem',
                letterSpacing: '0.28em',
                textTransform: 'uppercase',
                color: 'var(--ink)',
                opacity: 0.35,
                fontWeight: 300,
              }}
            >
              Studio · Creative Direction
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Sample logo PNG into 3D point cloud ─────────────────────
function sampleLogoPNG(imgSrc, count) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const W = 256, H = 256;
      const offscreen = document.createElement('canvas');
      offscreen.width = W; offscreen.height = H;
      const ctx = offscreen.getContext('2d');
      const scale = Math.min(W / img.width, H / img.height) * 0.85;
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      const data = ctx.getImageData(0, 0, W, H).data;
      const pts = [];
      for (let py = 0; py < H; py += 2)
        for (let px = 0; px < W; px += 2) {
          const idx = (py * W + px) * 4;
          const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          if (data[idx + 3] > 128 && brightness < 160) {
            // Map 2D pixel coords to 3D space centered at origin
            const x = ((px / W) - 0.5) * 4;
            const y = -((py / H) - 0.5) * 4;
            const z = (Math.random() - 0.5) * 0.4;
            pts.push({ x, y, z });
          }
        }
      // Shuffle and limit to count
      const shuffled = pts.sort(() => Math.random() - 0.5).slice(0, count);
      resolve(shuffled);
    };
    img.onerror = () => resolve([]);
    img.src = imgSrc;
  });
}

// ─── BACKGROUND PARTICLES (Three.js) ────────────────────────
// Hero zone: early scroll = cube shape, later scroll = logo shape (from PNG).
// about/skills/blank = sphere scatter.
function BackgroundParticles({
  setZone, activeZone, rotationVelocity,
  particleColor, onReady, heroLogoProgress, setHeroLogoProgress
}) {
  const pointsRef = useRef();
  const count = PARTICLE_COUNT;
  const scrollProgress = useRef(0);
  const prevZone = useRef(activeZone);
  const readyFired = useRef(false);
  const modelShapeRef = useRef(null);

  // Build initial buffers (sphere seed + cube) synchronously
  const [seedBuffer, cubeShape] = useMemo(() => {
    const seed = new Float32Array(count * 3);
    const cb = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const st = Math.random() * Math.PI * 2;
      const sp = Math.acos((Math.random() * 2) - 1);
      const sr = 2.5 + Math.random() * 0.5;
      seed[i3] = sr * Math.sin(sp) * Math.cos(st);
      seed[i3 + 1] = sr * Math.sin(sp) * Math.sin(st);
      seed[i3 + 2] = sr * Math.cos(sp);
      cb[i3] = (Math.random() - 0.5) * 18;
      cb[i3 + 1] = (Math.random() - 0.5) * 12;
      cb[i3 + 2] = (Math.random() - 0.5) * 12;
    }
    return [seed, cb];
  }, [count]);

  // Load PNG logo and build model shape asynchronously
  useEffect(() => {
    sampleLogoPNG('/logo.png', count).then((pts) => {
      const m = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        if (i < pts.length) {
          m[i3] = pts[i].x;
          m[i3 + 1] = pts[i].y;
          m[i3 + 2] = pts[i].z;
        } else {
          // Fallback to sphere seed for any extra particles
          m[i3] = seedBuffer[i3];
          m[i3 + 1] = seedBuffer[i3 + 1];
          m[i3 + 2] = seedBuffer[i3 + 2];
        }
      }
      modelShapeRef.current = m;
    });
  }, [count, seedBuffer]);

  const onReadyRef = useRef(onReady);
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!readyFired.current) {
      readyFired.current = true;
      const t = setTimeout(() => onReadyRef.current(), 800);
      return () => clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    const st = ScrollTrigger.create({
      trigger: 'body', start: 'top top', end: 'bottom bottom',
      scrub: 1.2,
      onUpdate: (self) => { scrollProgress.current = self.progress; }
    });
    return () => st.kill();
  }, []);

  useFrame(() => {
    if (!pointsRef.current) return;
    const p = scrollProgress.current;
    const modelShape = modelShapeRef.current || seedBuffer;

    // ── Zone detection (4 zones, each ~25% of scroll) ──
    let newZone = 'hero';
    if (p > 0.78) newZone = 'blank';
    else if (p > 0.55) newZone = 'skills';
    else if (p > 0.33) newZone = 'about';

    if (prevZone.current !== newZone) {
      prevZone.current = newZone;
      setZone(newZone);
    }

    // Within hero zone: first half = cube, second half morphs to logo
    const logoT = THREE.MathUtils.clamp((p - 0.15) / 0.18, 0, 1);
    setHeroLogoProgress(logoT);

    const pos = pointsRef.current.geometry.attributes.position.array;
    if (newZone !== 'blank') {
      for (let i = 0; i < count * 3; i++) {
        let target;
        if (p <= 0.15) {
          target = cubeShape[i];
        } else if (p <= 0.33) {
          target = THREE.MathUtils.lerp(cubeShape[i], modelShape[i], logoT);
        } else {
          const scatterT = THREE.MathUtils.clamp((p - 0.33) / 0.22, 0, 1);
          target = THREE.MathUtils.lerp(modelShape[i], seedBuffer[i], scatterT);
        }
        pos[i] += (target - pos[i]) * 0.045;
      }
      pointsRef.current.geometry.attributes.position.needsUpdate = true;
    }

    const mat = pointsRef.current.material;
    if (mat) {
      const targetOpacity = newZone === 'blank' ? 0 : p > 0.28 ? 0 : 0.95;
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
        size={isMobile ? 0.035 : 0.022}
        sizeAttenuation
        depthWrite={false}
        opacity={0.95}
      />
    </Points>
  );
}

// ─── CLICK HANDLER ───────────────────────────────────────────
function ClickHandler({ rotationVelocity }) {
  const { size } = useThree();
  const startPos = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);

  useEffect(() => {
    const onDown = (x, y) => { startPos.current = { x, y }; isDragging.current = true; };
    const onUp = (x, y) => {
      if (!isDragging.current) return; isDragging.current = false;
      const dx = (x - startPos.current.x) / size.width;
      const dy = (y - startPos.current.y) / size.height;
      if (Math.abs(x - startPos.current.x) > 2 || Math.abs(y - startPos.current.y) > 2) {
        rotationVelocity.current.y = THREE.MathUtils.clamp(
          dx * ROTATION_CONFIG.clickForce * 6, -ROTATION_CONFIG.maxVelocity, ROTATION_CONFIG.maxVelocity
        );
        rotationVelocity.current.x = THREE.MathUtils.clamp(
          dy * ROTATION_CONFIG.clickForce * 6, -ROTATION_CONFIG.maxVelocity, ROTATION_CONFIG.maxVelocity
        );
      }
    };
    const mDown = (e) => onDown(e.clientX, e.clientY);
    const mUp = (e) => onUp(e.clientX, e.clientY);
    const tStart = (e) => onDown(e.touches[0].clientX, e.touches[0].clientY);
    const tEnd = (e) => onUp(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    window.addEventListener('mousedown', mDown);
    window.addEventListener('mouseup', mUp);
    window.addEventListener('touchstart', tStart, { passive: true });
    window.addEventListener('touchend', tEnd, { passive: true });
    return () => {
      window.removeEventListener('mousedown', mDown);
      window.removeEventListener('mouseup', mUp);
      window.removeEventListener('touchstart', tStart);
      window.removeEventListener('touchend', tEnd);
    };
  }, [size, rotationVelocity]);

  return null;
}

// ─── FLUID REVEAL IMAGE ──────────────────────────────────────
function FluidRevealImage({ baseImage, revealImage }) {
  const containerRef = useRef(); const blobRef = useRef();
  const mouse = useRef({ x: 0, y: 0 }); const blob = useRef({ x: 0, y: 0 });
  const rafRef = useRef(); const isHovered = useRef(false);
  const blobOpacity = useRef(0); const blobRadius = useRef(0);

  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    const onMove = (e) => {
      const rect = el.getBoundingClientRect();
      mouse.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onEnter = () => { isHovered.current = true; };
    const onLeave = () => { isHovered.current = false; };
    const onTouchMove = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect(); const t = e.touches[0];
      mouse.current = { x: t.clientX - rect.left, y: t.clientY - rect.top };
      isHovered.current = true;
    };
    const onTouchEnd = () => { isHovered.current = false; };
    if (isTouch) {
      el.addEventListener('touchmove', onTouchMove, { passive: false });
      el.addEventListener('touchstart', onTouchMove, { passive: false });
      el.addEventListener('touchend', onTouchEnd);
    } else {
      el.addEventListener('mousemove', onMove);
      el.addEventListener('mouseenter', onEnter);
      el.addEventListener('mouseleave', onLeave);
    }
    const animate = () => {
      blob.current.x += (mouse.current.x - blob.current.x) * 0.1;
      blob.current.y += (mouse.current.y - blob.current.y) * 0.1;
      blobOpacity.current += ((isHovered.current ? 1 : 0) - blobOpacity.current) * 0.07;
      blobRadius.current += ((isHovered.current ? 52 : 0) - blobRadius.current) * 0.1;
      if (blobRef.current) {
        const { x, y } = blob.current; const r = blobRadius.current;
        blobRef.current.style.opacity = blobOpacity.current;
        blobRef.current.style.clipPath = `circle(${r}px at ${x}px ${y}px)`;
        blobRef.current.style.webkitClipPath = `circle(${r}px at ${x}px ${y}px)`;
      }
      rafRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      if (isTouch) {
        el.removeEventListener('touchmove', onTouchMove);
        el.removeEventListener('touchstart', onTouchMove);
        el.removeEventListener('touchend', onTouchEnd);
      } else {
        el.removeEventListener('mousemove', onMove);
        el.removeEventListener('mouseenter', onEnter);
        el.removeEventListener('mouseleave', onLeave);
      }
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div ref={containerRef} className="about-image-container fluid-reveal-container">
      <img src={baseImage} alt="Portrait" className="about-image fluid-base" />
      <img ref={blobRef} src={revealImage} alt="Portrait alternate" className="about-image fluid-reveal" />
      <div className="image-gradient-overlay" />
    </div>
  );
}

// ─── WAVE DOT GRID ───────────────────────────────────────────
function WaveDotGrid({ visible }) {
  const canvasRef = useRef(); const rafRef = useRef();
  const activeRef = useRef(visible);
  useEffect(() => { activeRef.current = visible; }, [visible]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const SPACING = 26, AMPLITUDE = 9, FREQ = 0.048, SPEED = 0.018, DOT_R = 1.3;
    let W, H, cols, rows, t = 0, opacity = 0;
    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
      cols = Math.ceil(W / SPACING) + 2;
      rows = Math.ceil(H / SPACING) + 2;
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(document.documentElement);
    const draw = () => {
      opacity += ((activeRef.current ? 1 : 0) - opacity) * 0.04;
      ctx.clearRect(0, 0, W, H);
      if (opacity > 0.005) {
        t += SPEED; ctx.beginPath();
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          const bx = c * SPACING, by = r * SPACING;
          const w1 = Math.sin(bx * FREQ + t) * AMPLITUDE;
          const w2 = Math.cos(by * FREQ * 0.8 + t * 0.7) * AMPLITUDE * 0.6;
          const d = Math.sin((bx + by) * FREQ * 0.5 + t * 1.2) * AMPLITUDE * 0.4;
          const x = bx + w1 + d, y = by + w2 + d;
          const phase = Math.sin(bx * FREQ * 1.5 + by * FREQ + t * 1.1);
          const r2 = DOT_R * (0.55 + 0.45 * ((phase + 1) / 2));
          ctx.moveTo(x + r2, y); ctx.arc(x, y, r2, 0, Math.PI * 2);
        }
        ctx.fillStyle = `rgba(0,0,0,${0.22 * opacity})`; ctx.fill();
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className="wave-dot-canvas" aria-hidden="true" />;
}

// ─── SKILLS GRID ─────────────────────────────────────────────
const SKILL_ITEMS = [
  { category: 'Design', items: ['Figma', 'After Effects', 'Cinema 4D', 'Blender'] },
  { category: 'Frontend', items: ['React', 'Three.js', 'GSAP', 'WebGL'] },
  { category: 'Backend', items: ['Node.js', 'GraphQL', 'PostgreSQL', 'Redis'] },
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

// ─── FINALE PARTICLES ────────────────────────────────────────
const FINALE_COUNT = 80, LINK_DIST = 100, CELL_SIZE = LINK_DIST;

function FinaleParticles({ active }) {
  const canvasRef = useRef(); const rafRef = useRef();
  const activeRef = useRef(active);
  const stateRef = useRef({ particles: [], W: 0, H: 0, opacity: 0 });
  useEffect(() => { activeRef.current = active; }, [active]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const spawn = (W, H) => Array.from({ length: FINALE_COUNT }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: 0.9 + Math.random() * 1.4,
      vx: (Math.random() - 0.5) * 0.15, vy: (Math.random() - 0.5) * 0.10,
      alpha: 0.15 + Math.random() * 0.4,
      pulse: Math.random() * Math.PI * 2, pulseSpeed: 0.007 + Math.random() * 0.01
    }));
    const resize = () => {
      const W = canvas.width = window.innerWidth, H = canvas.height = window.innerHeight;
      stateRef.current.W = W; stateRef.current.H = H;
      stateRef.current.particles = spawn(W, H);
    };
    resize(); window.addEventListener('resize', resize);
    const draw = () => {
      const s = stateRef.current;
      s.opacity += ((activeRef.current ? 1 : 0) - s.opacity) * 0.04;
      if (s.opacity < 0.005) { rafRef.current = requestAnimationFrame(draw); return; }
      ctx.clearRect(0, 0, s.W, s.H);
      const { particles: pts, W, H, opacity } = s;
      const cols = Math.ceil(W / CELL_SIZE) + 1, rows = Math.ceil(H / CELL_SIZE) + 1;
      const grid = new Array(cols * rows);
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]; p.x += p.vx; p.y += p.vy; p.pulse += p.pulseSpeed;
        if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10;
        if (p.y < -10) p.y = H + 10; if (p.y > H + 10) p.y = -10;
        const cx = Math.floor(p.x / CELL_SIZE), cy = Math.floor(p.y / CELL_SIZE), key = cy * cols + cx;
        if (!grid[key]) grid[key] = []; grid[key].push(i);
      }
      ctx.lineWidth = 0.5;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const cx = Math.floor(a.x / CELL_SIZE), cy = Math.floor(a.y / CELL_SIZE);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const cell = grid[ny * cols + nx]; if (!cell) continue;
          for (let k = 0; k < cell.length; k++) {
            const j = cell[k]; if (j <= i) continue;
            const b = pts[j], dist = Math.hypot(a.x - b.x, a.y - b.y);
            if (dist < LINK_DIST) {
              ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
              ctx.strokeStyle = `rgba(255,255,255,${(1 - dist / LINK_DIST) * 0.07 * opacity})`;
              ctx.stroke();
            }
          }
        }
      }
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], breathe = 0.5 + 0.5 * Math.sin(p.pulse);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${p.alpha * breathe * opacity})`; ctx.fill();
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener('resize', resize); };
  }, []);

  return <canvas ref={canvasRef} className="finale-particles-canvas" aria-hidden="true" />;
}

// ─── CONTACT PAGE ────────────────────────────────────────────
function ContactPage({ onClose }) {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [sent, setSent] = useState(false);
  const handleSubmit = (e) => { e.preventDefault(); setSent(true); };

  return (
    <motion.div
      className="overlay-page contact-page"
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      <button className="overlay-close" onClick={onClose} aria-label="Close">
        <span /><span />
      </button>
      <div className="contact-inner">
        {!sent ? (
          <>
            <div className="contact-header">
              <p className="contact-eyebrow">Get in touch</p>
              <h2 className="contact-title">Let's build<br /><em>something.</em></h2>
              <p className="contact-subtitle">We respond within 24 hours.</p>
            </div>
            <form className="contact-form" onSubmit={handleSubmit}>
              <div className="contact-field">
                <label className="contact-label">Name</label>
                <input className="contact-input" type="text" placeholder="Your name" required
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="contact-field">
                <label className="contact-label">Email</label>
                <input className="contact-input" type="email" placeholder="your@email.com" required
                  value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="contact-field">
                <label className="contact-label">Message</label>
                <textarea className="contact-textarea" placeholder="Tell us about your project…" required rows={5}
                  value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} />
              </div>
              <button className="contact-submit" type="submit">Send message</button>
            </form>
            <div className="contact-links">
              <a href="mailto:hello@studio.com" className="contact-link">hello@studio.com</a>
              <span className="contact-link-sep" />
              <a href="https://twitter.com" target="_blank" rel="noreferrer" className="contact-link">Twitter</a>
              <span className="contact-link-sep" />
              <a href="https://instagram.com" target="_blank" rel="noreferrer" className="contact-link">Instagram</a>
            </div>
          </>
        ) : (
          <motion.div
            className="contact-sent"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            <div className="contact-sent-mark">✓</div>
            <h2 className="contact-sent-title">Message sent.</h2>
            <p className="contact-sent-sub">We'll be in touch soon.</p>
            <button className="contact-submit" style={{ marginTop: '2rem' }} onClick={onClose}>Back to site</button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// ─── PORTFOLIO PAGE ──────────────────────────────────────────
const PORTFOLIO_ITEMS = [
  { id: 1, type: 'image', cat: 'Product Visuals', aspect: '4/5', bg: '#1a1a1a', label: 'Brand Identity — Noir' },
  { id: 2, type: 'video', cat: 'Visualization', aspect: '16/9', bg: '#0d0d0d', label: 'Motion Reel 2024' },
  {
    id: 3,
    type: 'image',
    cat: 'Architecture',
    aspect: '3/2',
    bg: '#111827',
    label: 'Container Shop — Architecture Render',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782058391/54682_1_dmxunl.png',
    images: [
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782058391/54682_1_dmxunl.png',
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782058341/Container_shop_clayrender_fnlpyk.png',
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782058339/Container_shop_03_ae20ma.png',
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782058338/Container_shop_m99asc.png',
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782058348/Container_shop_02_efpb0d.png',
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782058341/Container_shop_01_b3ixlf.png',
    ],
  },
  { id: 4, type: 'image', cat: 'Product Visuals', aspect: '1/1', bg: '#18181b', label: 'Packaging — Minimal' },
  {
    id: 5,
    type: 'image',
    cat: 'Architecture',
    aspect: '3/2',
    bg: '#0f172a',
    label: 'Container Shop II — Architecture Render',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782058394/Y3_rlaxbq.png',
    images: [
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782058394/Y3_rlaxbq.png',
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782058341/Container_shop2_fkwxq2.png',
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782058340/Container_shop2_clayrender_aqqmch.png',
    ],
  },
  { id: 6, type: 'video', cat: 'Visualization', aspect: '4/5', bg: '#09090b', label: 'Campaign Film' },
  { id: 7, type: 'image', cat: 'Product Visuals', aspect: '16/9', bg: '#1c1917', label: 'Visual Identity System' },
  {
    id: 8,
    type: 'image',
    cat: 'Architecture',
    aspect: '4/3',
    bg: '#14532d',
    label: '3D Floorplan — 03',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782058343/3d_Floorplan_03_owg2r4.png',
  },
  { id: 9, type: 'image', cat: 'Product Visuals', aspect: '4/5', bg: '#1e1b4b', label: 'Editorial — Type' },
  { id: 10, type: 'video', cat: 'Visualization', aspect: '16/9', bg: '#0c0a09', label: 'Brand Film — Luxury' },
  {
    id: 11,
    type: 'image',
    cat: 'Architecture',
    aspect: '4/3',
    bg: '#172554',
    label: '3D Floorplan — 02',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782058338/3d_Floorplan_02_s2tcny.png',
  },
  { id: 12, type: 'image', cat: 'Product Visuals', aspect: '1/1', bg: '#1a0000', label: 'Poster Series' },
];
const FILTERS = ['All', 'Product Visuals', 'Architecture', 'Visualization'];

function PortfolioPage({ onClose }) {
  const [activeFilter, setActiveFilter] = useState('All');
  const [selected, setSelected] = useState(null);
  const [slideIndex, setSlideIndex] = useState(0);
  const touchStartX = useRef(null);
  const filtered = activeFilter === 'All'
    ? PORTFOLIO_ITEMS
    : PORTFOLIO_ITEMS.filter(p => p.cat === activeFilter);

  const gallery = selected?.images && selected.images.length > 1 ? selected.images : null;

  const openItem = (item) => {
    setSelected(item);
    setSlideIndex(0);
  };

  const goToSlide = useCallback((next) => {
    if (!gallery) return;
    setSlideIndex(i => (i + next + gallery.length) % gallery.length);
  }, [gallery]);

  // Keyboard nav for the lightbox: ← / → to switch images, Esc to close
  useEffect(() => {
    if (!selected) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setSelected(null);
      else if (e.key === 'ArrowRight') goToSlide(1);
      else if (e.key === 'ArrowLeft') goToSlide(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, goToSlide]);

  const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > 40) goToSlide(delta < 0 ? 1 : -1);
    touchStartX.current = null;
  };

  return (
    <motion.div
      className="overlay-page portfolio-page"
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      <button className="overlay-close overlay-close--dark" onClick={onClose} aria-label="Close">
        <span /><span />
      </button>
      <div className="portfolio-header">
        <p className="portfolio-eyebrow">Selected work</p>
        <h2 className="portfolio-title">Portfolio</h2>
        <div className="portfolio-filters">
          {FILTERS.map(f => (
            <button
              key={f}
              className={`portfolio-filter ${activeFilter === f ? 'active' : ''}`}
              onClick={() => setActiveFilter(f)}
            >{f}</button>
          ))}
        </div>
      </div>
      <div className="portfolio-grid">
        {filtered.map((item, i) => (
          <motion.div
            key={item.id}
            className="portfolio-item"
            style={{ aspectRatio: item.aspect }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: i * 0.04 }}
            onClick={() => openItem(item)}
          >
            <div className="portfolio-item-bg" style={{ background: item.bg }} />
            {item.img && (
              <img
                className="portfolio-item-img"
                src={item.img}
                alt={item.label}
                loading="lazy"
              />
            )}
            {item.type === 'video' && (
              <div className="portfolio-play">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M6 4l8 5-8 5V4z" fill="white" />
                </svg>
              </div>
            )}
            {item.images && item.images.length > 1 && (
              <div className="portfolio-gallery-badge">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="3" width="14" height="14" rx="2" stroke="white" strokeWidth="1.6" />
                  <rect x="7" y="7" width="14" height="14" rx="2" fill="#111" stroke="white" strokeWidth="1.6" />
                </svg>
                <span>{item.images.length}</span>
              </div>
            )}
            <div className="portfolio-item-info">
              <span className="portfolio-item-cat">{item.cat}</span>
              <span className="portfolio-item-label">{item.label}</span>
            </div>
          </motion.div>
        ))}
      </div>
      <AnimatePresence>
        {selected && (
          <motion.div
            className="portfolio-lightbox"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={() => setSelected(null)}
          >
            <motion.div
              className="portfolio-lightbox-inner"
              style={{ background: selected.bg, aspectRatio: selected.aspect }}
              initial={{ scale: 0.92 }} animate={{ scale: 1 }} exit={{ scale: 0.92 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              onClick={e => e.stopPropagation()}
              onTouchStart={gallery ? onTouchStart : undefined}
              onTouchEnd={gallery ? onTouchEnd : undefined}
            >
              {gallery ? (
                <>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.img
                      key={slideIndex}
                      className="portfolio-lightbox-img"
                      src={gallery[slideIndex]}
                      alt={`${selected.label} — variation ${slideIndex + 1}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </AnimatePresence>
                  <div className="portfolio-lightbox-gradient" />
                  <button
                    className="lightbox-nav lightbox-nav--prev"
                    onClick={(e) => { e.stopPropagation(); goToSlide(-1); }}
                    aria-label="Previous variation"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M10 2L4 8l6 6" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    className="lightbox-nav lightbox-nav--next"
                    onClick={(e) => { e.stopPropagation(); goToSlide(1); }}
                    aria-label="Next variation"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M6 2l6 6-6 6" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <div className="lightbox-counter">{slideIndex + 1} / {gallery.length}</div>
                  <div className="lightbox-dots" onClick={e => e.stopPropagation()}>
                    {gallery.map((_, i) => (
                      <button
                        key={i}
                        className={`lightbox-dot ${i === slideIndex ? 'active' : ''}`}
                        onClick={() => setSlideIndex(i)}
                        aria-label={`Go to variation ${i + 1}`}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <>
                  {selected.img && (
                    <img
                      className="portfolio-lightbox-img"
                      src={selected.img}
                      alt={selected.label}
                    />
                  )}
                  <div className="portfolio-lightbox-gradient" />
                </>
              )}
              {selected.type === 'video' && !gallery && (
                <div className="portfolio-lightbox-play">
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                    <path d="M9 6l16 8-16 8V6z" fill="white" />
                  </svg>
                </div>
              )}
              <div className="portfolio-lightbox-meta">
                <span className="portfolio-item-cat">{selected.cat}</span>
                <span className="portfolio-lightbox-title">{selected.label}</span>
              </div>
              <button className="portfolio-lightbox-close" onClick={() => setSelected(null)}>✕</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────
export default function App() {
  const [activeZone, setActiveZone] = useState('hero');
  const [loadProgress, setLoadProgress] = useState(0);
  const [particlesReady, setParticlesReady] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hoveredDotLabel, setHoveredDotLabel] = useState(null);
  const [activePage, setActivePage] = useState(null);
  // heroLogoProgress: 0 = title visible, 1 = logo fully formed
  const [heroLogoProgress, setHeroLogoProgress] = useState(0);

  // Mobile: section-based navigation (tap to advance)
  const [mobileSection, setMobileSection] = useState(0);

  // ── Phone-width detection (page 2 / About card image only) ──
  // This is intentionally a real viewport-width check (matches the
  // 768px breakpoint used throughout index.css for the card layout)
  // rather than the touch/pointer-based `isMobile` flag above. That
  // keeps the About card's "remove the image, center the text" rule
  // guaranteed-correct on every phone (iPhone 11/13, Android, etc.)
  // regardless of how pointer-type detection resolves on a given
  // browser/device. It's reactive so it also updates on rotation.
  const [isPhoneWidth, setIsPhoneWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  );
  useEffect(() => {
    const checkWidth = () => setIsPhoneWidth(window.innerWidth <= 768);
    checkWidth();
    window.addEventListener('resize', checkWidth);
    window.addEventListener('orientationchange', checkWidth);
    return () => {
      window.removeEventListener('resize', checkWidth);
      window.removeEventListener('orientationchange', checkWidth);
    };
  }, []);

  const rotationVelocity = useRef({ x: 0, y: 0 });

  // 2D logo canvas: show on desktop only when logo is mostly formed
  const logoParticlesVisible = !isMobile && activeZone === 'hero' && heroLogoProgress > 0.6;

  // Mobile: show static PNG logo for hero-b section
  const showMobileLogo = isMobile && activeZone === 'hero' && mobileSection === 1;

  // ─── MOBILE: lock body scroll, manage sections via tap ─────
  useEffect(() => {
    if (!isMobile) return;
    document.body.style.overflow = 'hidden';
    document.body.style.height = '100vh';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    return () => {
      document.body.style.overflow = '';
      document.body.style.height = '';
      document.body.style.position = '';
      document.body.style.width = '';
    };
  }, []);

  // Mobile: sync mobileSection → activeZone + heroLogoProgress
  useEffect(() => {
    if (!isMobile) return;
    const section = MOBILE_SECTIONS[mobileSection];
    switch (section) {
      case 'hero-a':
        setActiveZone('hero');
        setHeroLogoProgress(0);
        break;
      case 'hero-b':
        setActiveZone('hero');
        setHeroLogoProgress(1);
        break;
      case 'about':
        setActiveZone('about');
        setHeroLogoProgress(1);
        break;
      case 'skills':
        setActiveZone('skills');
        setHeroLogoProgress(1);
        break;
      case 'blank':
        setActiveZone('blank');
        setHeroLogoProgress(1);
        break;
      default:
        break;
    }
  }, [mobileSection]);

  // Mobile: tap to advance section
  useEffect(() => {
    if (!isMobile) return;
    const handleTap = (e) => {
      // Skip if tapping interactive elements, overlays, or buttons
      if (e.target.closest('.nav-dots, .overlay-page, .overlay-close, button, a, input, textarea, .finale-btn-primary, .finale-btn-ghost')) return;
      // Skip if an overlay page is open
      if (document.querySelector('.overlay-page')) return;
      setMobileSection(prev => Math.min(prev + 1, MOBILE_SECTIONS.length - 1));
    };
    document.addEventListener('click', handleTap);
    return () => document.removeEventListener('click', handleTap);
  }, []);

  // Mobile: force particles ready immediately (no 3D canvas)
  useEffect(() => {
    if (isMobile) setParticlesReady(true);
  }, []);

  // Loading progress animation
  useEffect(() => {
    let frame, current = 0;
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

  const handleParticlesReady = useCallback(() => setParticlesReady(true), []);

  // Fallback: force ready after 6s
  useEffect(() => {
    const t = setTimeout(() => setParticlesReady(true), 6000);
    return () => clearTimeout(t);
  }, []);

  // Navigation handler: mobile = set section, desktop = scroll
  const handleNavigate = useCallback((progress) => {
    if (isMobile) {
      const zoneIndex = Math.round(progress * (ZONES.length - 1));
      // Map zone index → mobile section index
      const sectionMap = [0, 2, 3, 4]; // hero-a, about, skills, blank
      setMobileSection(sectionMap[zoneIndex] ?? 0);
    } else {
      const totalHeight = document.body.scrollHeight - window.innerHeight;
      window.scrollTo({ top: totalHeight * progress, behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (activePage) { if (e.key === 'Escape') setActivePage(null); return; }
      if (isMobile) {
        if (e.key === 'ArrowDown') setMobileSection(prev => Math.min(prev + 1, MOBILE_SECTIONS.length - 1));
        if (e.key === 'ArrowUp') setMobileSection(prev => Math.max(prev - 1, 0));
      } else {
        const currentIdx = ZONES.findIndex(z => z.id === activeZone);
        if (e.key === 'ArrowDown' && currentIdx < ZONES.length - 1)
          handleNavigate(currentIdx / (ZONES.length - 1) + 1 / (ZONES.length - 1));
        if (e.key === 'ArrowUp' && currentIdx > 0)
          handleNavigate((currentIdx - 1) / (ZONES.length - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeZone, handleNavigate, activePage]);

  const particleColor = activeZone === 'blank' ? '#ffffff' : '#111111';
  const isCardZone = activeZone === 'about' || activeZone === 'skills';
  const isLight = activeZone === 'blank';

  // Hero title: visible in hero zone part A
  const showHeroTitle = isMobile
    ? (activeZone === 'hero' && mobileSection === 0)
    : (activeZone === 'hero' && !logoParticlesVisible);

  // Mobile: show tap indicator on hero-a, show scroll indicator on desktop hero
  const showIndicator = isMobile
    ? (mobileSection === 0 && isLoaded)
    : (activeZone === 'hero' && heroLogoProgress < 0.1);

  return (
    <>
      <AnimatePresence>
        {!isLoaded && <LoadingScreen progress={loadProgress} isReady={particlesReady} />}
      </AnimatePresence>

      {/* Overlay pages */}
      <AnimatePresence>
        {activePage === 'contact' && <ContactPage key="contact" onClose={() => setActivePage(null)} />}
        {activePage === 'portfolio' && <PortfolioPage key="portfolio" onClose={() => setActivePage(null)} />}
      </AnimatePresence>

      {/* Scroll spacer — desktop only, 640vh for smoother transitions */}
      {!isMobile && <div style={{ height: '640vh', width: '100%' }} aria-hidden="true" />}

      <SiteLogo isLight={isLight} />
      <HTMLCursor isLight={isLight} hoveredDotLabel={hoveredDotLabel} />
      <NavDots
        activeZone={activeZone}
        onNavigate={handleNavigate}
        isLight={isLight}
        onDotHover={setHoveredDotLabel}
      />

      {/* 2D interactive logo particles — desktop only */}
      {!isMobile && <LogoParticles visible={logoParticlesVisible} />}

      {/* Mobile: static PNG logo for hero part B */}
      {isMobile && <MobileLogoDisplay visible={showMobileLogo} />}

      {/* Cinematic hero title */}
      <CinematicHeroTitle
        visible={showHeroTitle}
        logoProgress={heroLogoProgress}
      />

      {/* CARD DECK (about + skills) */}
      <div
        className="card-deck-stage"
        style={{
          pointerEvents: isCardZone ? 'all' : 'none',
          opacity: isCardZone ? 1 : 0,
          transition: 'opacity 0.8s ease'
        }}
      >
        <WaveDotGrid visible={isCardZone} />

        {/* ABOUT CARD */}
        <motion.div
          className="glass-container card-deck-card about-card"
          style={{ zIndex: 2 }}
          animate={
            activeZone === 'about' ? { y: '0%', scale: 1, opacity: 1 } :
              activeZone === 'skills' ? { y: '-112%', scale: 1, opacity: 0 } :
                { y: '0%', scale: 1, opacity: 0 }
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
                  >{line}</motion.span>
                ))}
              </div>
              <motion.p
                className="about-description"
                initial={{ opacity: 0, y: 14 }}
                animate={activeZone === 'about' ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
                transition={{ duration: 0.9, delay: 0.82, ease: [0.16, 1, 0.3, 1] }}
              >
                A creative studio at the intersection of art, technology, and human connection
                — transforming the ordinary into the extraordinary through meticulous craft
                and a relentless pursuit of beauty.
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
            {!isPhoneWidth && (
              <>
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
              </>
            )}

            {/* Phone widths only (page 2): image removed entirely, text centered, bottom tag shown */}
            {isPhoneWidth && (
              <motion.div
                className="about-mobile-tag"
                animate={activeZone === 'about' ? { opacity: 1 } : { opacity: 0 }}
                transition={{ duration: 0.9, delay: 1.15 }}
              >
                <span>Studio</span>
                <span>/ 2024</span>
              </motion.div>
            )}
          </div>
        </motion.div>

        {/* SKILLS CARD */}
        <motion.div
          className="glass-container card-deck-card skills-card"
          style={{ zIndex: 1 }}
          animate={
            activeZone === 'about' ? { y: '5%', scale: 0.94, opacity: 1 } :
              activeZone === 'skills' ? { y: '0%', scale: 1, opacity: 1 } :
                { y: '5%', scale: 0.94, opacity: 0 }
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
                  >{line}</motion.span>
                ))}
              </div>
              <motion.p
                className="about-description"
                animate={activeZone === 'skills' ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
                transition={{ duration: 0.9, delay: activeZone === 'skills' ? 0.82 : 0, ease: [0.16, 1, 0.3, 1] }}
              >
                Where technical precision meets creative instinct — a curated set of tools
                and disciplines refined across three years of multidisciplinary practice.
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

      {/* FINALE */}
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
          >04</motion.div>
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
              From structure<br /><span className="finale-title-italic">to blueprint.</span>
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
              <button className="finale-btn-primary" onClick={() => setActivePage('contact')}>
                Contact Us
              </button>
              <button className="finale-btn-ghost" onClick={() => setActivePage('portfolio')}>
                Portfolio
              </button>
            </motion.div>
          </div>
          <motion.div
            className="finale-timeline"
            initial={{ opacity: 0 }}
            animate={activeZone === 'blank' ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 1, delay: 1.5 }}
          >
            {ZONES.slice(0, 3).map((zone, i) => (
              <React.Fragment key={zone.id}>
                <div className="finale-timeline-item">
                  <span className="finale-timeline-num">{zone.index}</span>
                  <span className="finale-timeline-label">{zone.label}</span>
                </div>
                {i < 2 && <div className="finale-timeline-connector" />}
              </React.Fragment>
            ))}
          </motion.div>
        </motion.div>
      </div>

      <ZoneCounter activeZone={activeZone} isLight={isLight} />
      <ScrollIndicator visible={showIndicator} />

      {/* THREE.JS CANVAS — desktop only */}
      {!isMobile && (
        <div
          className="canvas-container"
          style={{ visibility: activeZone === 'blank' ? 'hidden' : 'visible' }}
        >
          <Canvas
            camera={{ position: [0, 0, 5], fov: 85 }}
            frameloop="always"
            gl={{ antialias: true, powerPreference: 'high-performance' }}
            dpr={Math.min(window.devicePixelRatio, 2)}
          >
            <color attach="background" args={['#ffffff']} />
            <ambientLight intensity={AMBIENT_INTENSITY} />
            <directionalLight position={[8, 10, 5]} intensity={3.5} color="#ffffff" />
            <directionalLight position={[-6, -4, -4]} intensity={1.2} color="#c8d8ff" />
            <pointLight position={[0, 6, 4]} intensity={2.0} color="#ffffff" />
            <Suspense fallback={null}>
              <BackgroundParticles
                setZone={setActiveZone}
                activeZone={activeZone}
                rotationVelocity={rotationVelocity}
                particleColor={particleColor}
                onReady={handleParticlesReady}
                heroLogoProgress={heroLogoProgress}
                setHeroLogoProgress={setHeroLogoProgress}
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
      )}
    </>
  );
}