import React, {
  useRef, useMemo, useEffect, useState, useCallback, Suspense, useLayoutEffect
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Points, PointMaterial } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { gsap } from 'gsap';
import { motion, AnimatePresence } from 'framer-motion';
import DomeGallery from './DomeGallery';
import Shuffle from './Shuffle';

gsap.registerPlugin(ScrollTrigger);

const MODEL_CONFIG = { autoRotateSpeed: 0.001 };
const ROTATION_CONFIG = { friction: 0.97, clickForce: 0.05, maxVelocity: 0.15 };
const AMBIENT_INTENSITY = 0.05;
const isMobile = typeof window !== 'undefined' &&
  window.matchMedia('(hover: none) and (pointer: coarse)').matches;

// Mobile gets fewer particles for performance
const PARTICLE_COUNT = isMobile ? 1000 : 1500;

// ─── ZONES: cube + model merged into hero ───────────────────
// `target` = scroll progress (0-1) used to jump straight into that zone
// via nav dots / menu clicks / keyboard nav. Values are chosen to land
// safely inside each zone's threshold band (see BackgroundParticles).
const ZONES = [
  { id: 'hero', index: '01', label: 'WELCOME', title: null, target: 0 },
  { id: 'about', index: '02', label: 'ABOUT', title: null, target: 0.36 },
  { id: 'skills', index: '03', label: 'SKILLS', title: null, target: 0.60 },
  { id: 'portfolio', index: '04', label: 'PORTFOLIO', title: null, target: 0.75 },
  { id: 'blank', index: '05', label: 'CONTACT', title: null, target: 0.93 },
];
const ZONE_TOTAL = ZONES.length;

// Mobile sections: hero has two sub-sections (title + logo)
const MOBILE_SECTIONS = ['hero-a', 'hero-b', 'about', 'skills', 'portfolio', 'blank'];

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
// ─── STAGGERED MENU ──────────────────────────────────────────
function StaggeredMenu({ isLight, onNavigate, onPortfolio, onContact, hideToggle }) {
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const panelRef = useRef(null);
  const preLayersRef = useRef(null);
  const preLayerElsRef = useRef([]);
  const plusHRef = useRef(null);
  const plusVRef = useRef(null);
  const iconRef = useRef(null);
  const textInnerRef = useRef(null);
  const openTlRef = useRef(null);
  const closeTweenRef = useRef(null);
  const spinTweenRef = useRef(null);
  const textCycleAnimRef = useRef(null);
  const toggleBtnRef = useRef(null);
  const busyRef = useRef(false);
  const [textLines, setTextLines] = useState(['Menu', 'Close']);

  const MENU_ITEMS = [
    { label: 'Welcome', progress: ZONES[0].target, action: 'nav' },
    { label: 'About', progress: ZONES[1].target, action: 'nav' },
    { label: 'Skills', progress: ZONES[2].target, action: 'nav' },
    { label: 'Portfolio', progress: ZONES[3].target, action: 'nav' },
    { label: 'Contact', progress: null, action: 'contact' },
  ];

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const panel = panelRef.current;
      const preContainer = preLayersRef.current;
      if (!panel) return;
      const preLayers = preContainer
        ? Array.from(preContainer.querySelectorAll('.sm-prelayer'))
        : [];
      preLayerElsRef.current = preLayers;
      gsap.set([panel, ...preLayers], { xPercent: 100, opacity: 1 });
      if (preContainer) gsap.set(preContainer, { xPercent: 0, opacity: 1 });
      if (plusHRef.current) gsap.set(plusHRef.current, { transformOrigin: '50% 50%', rotate: 0 });
      if (plusVRef.current) gsap.set(plusVRef.current, { transformOrigin: '50% 50%', rotate: 90 });
      if (iconRef.current) gsap.set(iconRef.current, { rotate: 0, transformOrigin: '50% 50%' });
      if (textInnerRef.current) gsap.set(textInnerRef.current, { yPercent: 0 });
    });
    return () => ctx.revert();
  }, []);

  const buildOpenTimeline = useCallback(() => {
    const panel = panelRef.current;
    const layers = preLayerElsRef.current;
    if (!panel) return null;
    openTlRef.current?.kill();
    closeTweenRef.current?.kill();
    closeTweenRef.current = null;

    const itemEls = Array.from(panel.querySelectorAll('.sm-panel-itemLabel'));
    if (itemEls.length) gsap.set(itemEls, { yPercent: 140, rotate: 10 });

    const tl = gsap.timeline({ paused: true });
    layers.forEach((el, i) => {
      tl.fromTo(el, { xPercent: 100 }, { xPercent: 0, duration: 0.5, ease: 'power4.out' }, i * 0.07);
    });
    const lastTime = layers.length ? (layers.length - 1) * 0.07 : 0;
    const panelStart = lastTime + (layers.length ? 0.08 : 0);
    tl.fromTo(panel, { xPercent: 100 }, { xPercent: 0, duration: 0.65, ease: 'power4.out' }, panelStart);
    if (itemEls.length) {
      tl.to(itemEls, {
        yPercent: 0, rotate: 0, duration: 1,
        ease: 'power4.out', stagger: { each: 0.1, from: 'start' }
      }, panelStart + 0.1);
    }
    openTlRef.current = tl;
    return tl;
  }, []);

  const playOpen = useCallback(() => {
    if (busyRef.current) return;
    busyRef.current = true;
    const tl = buildOpenTimeline();
    if (tl) {
      tl.eventCallback('onComplete', () => { busyRef.current = false; });
      tl.play(0);
    } else { busyRef.current = false; }
  }, [buildOpenTimeline]);

  const playClose = useCallback(() => {
    openTlRef.current?.kill();
    openTlRef.current = null;
    const panel = panelRef.current;
    const layers = preLayerElsRef.current;
    if (!panel) return;
    closeTweenRef.current?.kill();
    closeTweenRef.current = gsap.to([...layers, panel], {
      xPercent: 100, duration: 0.32, ease: 'power3.in', overwrite: 'auto',
      onComplete: () => {
        const itemEls = Array.from(panel.querySelectorAll('.sm-panel-itemLabel'));
        if (itemEls.length) gsap.set(itemEls, { yPercent: 140, rotate: 10 });
        busyRef.current = false;
      }
    });
  }, []);

  const animateIcon = useCallback(opening => {
    if (!iconRef.current) return;
    spinTweenRef.current?.kill();
    spinTweenRef.current = gsap.to(iconRef.current, {
      rotate: opening ? 225 : 0,
      duration: opening ? 0.8 : 0.35,
      ease: opening ? 'power4.out' : 'power3.inOut',
      overwrite: 'auto'
    });
  }, []);

  const animateText = useCallback(opening => {
    const inner = textInnerRef.current;
    if (!inner) return;
    textCycleAnimRef.current?.kill();
    const seq = opening
      ? ['Menu', 'Close', 'Menu', 'Close']
      : ['Close', 'Menu', 'Close', 'Menu'];
    setTextLines(seq);
    gsap.set(inner, { yPercent: 0 });
    const finalShift = ((seq.length - 1) / seq.length) * 100;
    textCycleAnimRef.current = gsap.to(inner, {
      yPercent: -finalShift,
      duration: 0.5 + seq.length * 0.07,
      ease: 'power4.out'
    });
  }, []);

  const closeMenu = useCallback(() => {
    if (!openRef.current) return;
    openRef.current = false;
    setOpen(false);
    playClose();
    animateIcon(false);
    animateText(false);
  }, [playClose, animateIcon, animateText]);

  const toggleMenu = useCallback(() => {
    const target = !openRef.current;
    openRef.current = target;
    setOpen(target);
    if (target) playOpen(); else playClose();
    animateIcon(target);
    animateText(target);
  }, [playOpen, playClose, animateIcon, animateText]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current?.contains(e.target)) return;
      if (toggleBtnRef.current?.contains(e.target)) return;
      closeMenu();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, closeMenu]);

  const handleItemClick = (item) => {
    closeMenu();
    setTimeout(() => {
      if (item.action === 'nav') onNavigate(item.progress);
      else if (item.action === 'portfolio') onPortfolio();
      else if (item.action === 'contact') onContact();
    }, 340);
  };

  return (
    <div className="sm-wrapper" data-position="right" data-open={open || undefined}>
      <div ref={preLayersRef} className="sm-prelayers" aria-hidden="true">
        {['#111111', '#1a1a1a'].map((c, i) => (
          <div key={i} className="sm-prelayer" style={{ background: c }} />
        ))}
      </div>
      <button
        ref={toggleBtnRef}
        className={`sm-toggle-btn ${hideToggle ? 'sm-toggle-btn--hidden' : ''}`}
        onClick={toggleMenu}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-hidden={hideToggle || undefined}
        tabIndex={hideToggle ? -1 : 0}
        style={{ color: isLight ? '#ffffff' : '#0d0d0d' }}
      >
        <span className="sm-toggle-textwrap" aria-hidden="true">
          <span ref={textInnerRef} className="sm-toggle-textinner">
            {textLines.map((l, i) => (
              <span className="sm-toggle-textline" key={i}>{l}</span>
            ))}
          </span>
        </span>
        <span ref={iconRef} className="sm-icon" aria-hidden="true">
          <span ref={plusHRef} className="sm-icon-line" />
          <span ref={plusVRef} className="sm-icon-line sm-icon-line-v" />
        </span>
      </button>
      <aside ref={panelRef} className="sm-panel" aria-hidden={!open}>
        <div className="sm-panel-inner">
          <div className="sm-panel-logo">
            <img src="/logo.png" alt="ARTSNFAR STUDIO" className="sm-panel-logo-img" />
          </div>
          <nav className="sm-panel-nav">
            <ul className="sm-panel-list">
              {MENU_ITEMS.map((item, idx) => (
                <li key={item.label} className="sm-panel-item-wrap">
                  <button
                    className="sm-panel-item"
                    onClick={() => handleItemClick(item)}
                  >
                    <span className="sm-panel-num">{String(idx + 1).padStart(2, '0')}</span>
                    <span className="sm-panel-itemLabel">{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <div className="sm-panel-footer">
            <span className="sm-panel-footer-text">ARTSNFAR STUDIO · 2024</span>
          </div>
        </div>
      </aside>
    </div>
  );
}

// ─── SITE LOGO ────────────────────────────────────────────────
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
            onClick={() => onNavigate(zone.target)}
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
          initial={{ opacity: 0, y: 10, scale: 1.02 }}
          animate={{ opacity: 1, y: 0, scale: 1.02 }}
          exit={{ opacity: 0, y: 10, scale: 1.02 }}
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
function HTMLCursor({ isLight, hoveredDotLabel, activePage }) {
  const cursorOuterRef = useRef(); const cursorInnerRef = useRef(); const labelRef = useRef();
  const mousePos = useRef({ x: -200, y: -200 });
  const outerPos = useRef({ x: -200, y: -200 });
  const innerPos = useRef({ x: -200, y: -200 });
  const rafId = useRef(null); const isVisible = useRef(false);
  const isTouchDevice = typeof window !== 'undefined' &&
    window.matchMedia('(hover: none) and (pointer: coarse)').matches;

  // Portfolio overlay is dark (#080808) — force white cursor inside it
  const isPortfolio = activePage === 'portfolio';
  const color = (isLight || isPortfolio) ? '#ffffff' : 'var(--ink)';
  const borderColor = (isLight || isPortfolio) ? 'rgba(255,255,255,0.8)' : 'var(--ink)';

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
function CinematicHeroTitle({ visible, logoProgress, onPortfolio, showScrollIndicator }) {
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

            {/* Portfolio CTA — fades in after the sub-label */}
            <motion.button
              className="hero-portfolio-btn"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 2.1, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              onClick={onPortfolio}
              style={{ pointerEvents: 'auto' }}
            >
              <span className="hero-portfolio-btn-text">View Portfolio</span>
              <span className="hero-portfolio-btn-arrow">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M1 7h12M8 2l5 5-5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </motion.button>
            <ScrollIndicator visible={showScrollIndicator} />
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

    // ── Zone detection (5 zones) ──
    let newZone = 'hero';
    if (p > 0.85) newZone = 'blank';
    else if (p > 0.70) newZone = 'portfolio';
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
    if (newZone !== 'blank' && newZone !== 'portfolio') {
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
  { category: 'CGI Tools', items: ['Blender', 'Houdini', 'Roblox', 'Substance Painter'] },
  { category: 'Graphic Design', items: ['Illustrator', 'Photoshop', 'Figma'] },
  { category: 'Workflow', items: ['Modeling', 'Look Dev', 'Animation', 'Rendering', 'Lighting', 'VFX', 'Simulation'] },
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
// Encodes a plain object as x-www-form-urlencoded, required by Netlify's
// form-handling endpoint when submitting via fetch instead of a native
// full-page form POST.
function encodeFormData(data) {
  return Object.keys(data)
    .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(data[key]))
    .join('&');
}

function ContactPage({ onClose }) {
  const [form, setForm] = useState({ name: '', email: '', message: '', company: '' });
  const [status, setStatus] = useState('idle'); // idle | submitting | sent | error

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Honeypot: real visitors never fill this in (it's visually hidden).
    // A bot that fills every field will trip this, so we just quietly
    // pretend it worked instead of telling it what went wrong.
    if (form.company) {
      setStatus('sent');
      return;
    }

    setStatus('submitting');
    try {
      await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: encodeFormData({
          'form-name': 'contact',
          name: form.name,
          email: form.email,
          message: form.message
        })
      });
      setStatus('sent');
    } catch (err) {
      setStatus('error');
    }
  };

  const sent = status === 'sent';
  const submitting = status === 'submitting';

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
            {/* name="contact" must match the hidden form registered in
                public/index.html so Netlify's build-time crawler picks it up. */}
            <form
              className="contact-form"
              name="contact"
              method="POST"
              data-netlify="true"
              data-netlify-honeypot="company"
              onSubmit={handleSubmit}
            >
              <input type="hidden" name="form-name" value="contact" />
              {/* Honeypot field — real users never see or fill this in */}
              <p className="contact-hp-field" aria-hidden="true">
                <label>
                  Company
                  <input
                    tabIndex={-1}
                    autoComplete="off"
                    name="company"
                    value={form.company}
                    onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                  />
                </label>
              </p>

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
              {status === 'error' && (
                <p className="contact-error">
                  Something went wrong — please try again, or email us directly at{' '}
                  <a href="mailto:hello@studio.com">hello@studio.com</a>.
                </p>
              )}
              <button className="contact-submit" type="submit" disabled={submitting}>
                {submitting ? 'Sending…' : 'Send message'}
              </button>
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
  // ── Architecture ──────────────────────────────────────────────────────────
  {
    id: 1, type: 'image', cat: 'Architecture', aspect: '3/2', bg: '#111827',
    label: 'Container Shop I',
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
  {
    id: 2, type: 'image', cat: 'Architecture', aspect: '3/2', bg: '#0f172a',
    label: 'Container Shop II',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782058394/Y3_rlaxbq.png',
    images: [
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782058394/Y3_rlaxbq.png',
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782058341/Container_shop2_fkwxq2.png',
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782058340/Container_shop2_clayrender_aqqmch.png',
    ],
  },
  {
    id: 3, type: 'image', cat: 'Architecture', aspect: '4/3', bg: '#14532d',
    label: '3D Floorplan — 03',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782058343/3d_Floorplan_03_owg2r4.png',
  },
  {
    id: 4, type: 'image', cat: 'Architecture', aspect: '4/3', bg: '#172554',
    label: '3D Floorplan — 02',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782058338/3d_Floorplan_02_s2tcny.png',
  },
  {
    id: 5, type: 'image', cat: 'Architecture', aspect: '16/9', bg: '#1c1400',
    label: 'Lavish Interior — 06',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782405444/Lavish_interior_06_yhr7gs.png',
    images: [
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782405444/Lavish_interior_06_yhr7gs.png',
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782405451/Lavish_interior_06_02_fpfsts.png',
    ],
  },
  {
    id: 6, type: 'image', cat: 'Architecture', aspect: '16/9', bg: '#1a0f00',
    label: 'Lavish Interior — 05',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782405446/Lavish_interior_05_02_umdjfh.png',
    images: [
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782405446/Lavish_interior_05_02_umdjfh.png',
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782405435/Lavish_interior_05_wwyyjl.png',
    ],
  },
  {
    id: 7, type: 'image', cat: 'Architecture', aspect: '16/9', bg: '#180e05',
    label: 'Lavish Interior — 01',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782405443/Lavish_interior_01_q6yq3t.png',
  },
  {
    id: 8, type: 'image', cat: 'Architecture', aspect: '16/9', bg: '#0d0b08',
    label: 'Lavish Interior — 04',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782405436/Lavish_interior_04_yoiuzu.png',
  },
  {
    id: 9, type: 'image', cat: 'Architecture', aspect: '16/9', bg: '#10080a',
    label: 'Lavish Interior — 02',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782405427/Lavish_interior_02_v6mcgj.png',
  },
  {
    id: 10, type: 'image', cat: 'Architecture', aspect: '16/9', bg: '#0c0c10',
    label: 'Lavish Interior — 03',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782405423/Lavish_interior_03_mcde1q.png',
  },
  {
    id: 11, type: 'image', cat: 'Architecture', aspect: '16/9', bg: '#130c06',
    label: 'Lavish Interior — 07',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782405438/Lavish_interior_07_md4yju.png',
  },
  {
    id: 12, type: 'image', cat: 'Architecture', aspect: '16/9', bg: '#0e0e12',
    label: 'Interior — 03',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782405433/interior_03_n4tg8l.png',
  },
  {
    id: 13, type: 'image', cat: 'Architecture', aspect: '16/9', bg: '#0a0a10',
    label: 'Interior — 01',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782405417/interior_01_mrw15x.png',
  },
  {
    id: 14, type: 'image', cat: 'Architecture', aspect: '16/9', bg: '#0f0b0d',
    label: 'Interior — 02',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782405416/interior_02_lfdbed.png',
  },
  {
    id: 15, type: 'image', cat: 'Architecture', aspect: '16/9', bg: '#0a1020',
    label: 'Tennis Court',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782405442/Tennis_Court_tgcpbq.png',
    images: [
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782405442/Tennis_Court_tgcpbq.png',
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782405442/Tennis_Court01_m1lqvx.png',
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782405440/Tennis_Court_02_idipo5.png',
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782405444/Tennis_Court01_02_dsgyww.png',
    ],
  },
  {
    id: 16, type: 'image', cat: 'Architecture', aspect: '16/9', bg: '#0e0a14',
    label: 'Interior — 04',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782407809/interior_04_fqsry1.png',
    images: [
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782407809/interior_04_fqsry1.png',
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782407808/interior_05_qwqjei.png',
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782407817/interior_06_xnrzhz.png',
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782407816/interior_07_amy3pt.png',
    ],
  },
  {
    id: 17, type: 'image', cat: 'Architecture', aspect: '16/9', bg: '#0c0e10',
    label: 'Interior — 08',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782408971/interior_08_t3eijs.png',
    images: [
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782408971/interior_08_t3eijs.png',
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782408967/interior_10_b47qde.png',
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782409277/interior_09_e4sno8.png',
    ],
  },
  // ── Simulation FX ──────────────────────────────────────────────────────────
  {
    id: 102, type: 'video', cat: 'Simulation FX', aspect: '16/9', bg: '#111114',
    label: 'Cap Animation',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782502857/Cap_Anim_gif01_-_frame_at_0m1s_vgsm6n.jpg',
    video: 'https://res.cloudinary.com/dmbgk0uha/video/upload/f_auto,q_auto,w_1600/v1782477928/Cap_Anim_V02_260505_un7i8e.mp4',
    images: [
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782479337/Cap_Anim_gif02_oafhua.gif',
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782479336/Cap_Anim_gif01_uq2auu.gif',
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782479337/Cap_Anim_gif02_oafhua.gif',
    ],
  },
  {
    id: 127, type: 'video', cat: 'Simulation FX', aspect: '16/9', bg: '#0d0c0a',
    label: 'Ahmed Foods Jam & Spread',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782671577/Jam_Spread_Edit_Main_Eng_VO_260413_-_frame_at_0m14s_zypxvi.jpg',
    video: 'https://res.cloudinary.com/dmbgk0uha/video/upload/f_auto,q_auto,w_1600/v1782671218/Jam_Spread_Edit_Main_Eng_Vo_260413_low_res_Credits_etektj.mp4',
  },

  {
    id: 128, type: 'video', cat: 'Simulation FX', aspect: '16/9', bg: '#0d0c0a',
    label: 'Jam Flip Simulation',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782672262/Jam_Flip_Simulation_-_frame_at_0m0s_kjkfu3.jpg',
    video: 'https://res.cloudinary.com/dmbgk0uha/video/upload/f_auto,q_auto,w_1600/v1782672167/Jam_Flip_Simulation_hjnl0e.mp4',
    images: [
      'https://res.cloudinary.com/dmbgk0uha/image/upload/v1782672176/Jam_PB_fblddf.gif',
      'https://res.cloudinary.com/dmbgk0uha/image/upload/v1782672176/Jam_PB_fblddf.gif',
    ],
  },

  {
    id: 129, type: 'video', cat: 'Simulation FX', aspect: '16/9', bg: '#0d0c0a',
    label: 'Raspberry Animation and VDB Simulation',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782672766/Raspberry_Animation_and_VDB_Simulation_-_frame_at_0m1s_zapklq.jpg',
    video: 'https://res.cloudinary.com/dmbgk0uha/video/upload/f_auto,q_auto,w_1600/v1782672566/Raspberry_Animation_and_VDB_Simulation_suiq97.mp4',
    images: [
      'https://res.cloudinary.com/dmbgk0uha/image/upload/v1782672740/VDB_nz3e0i.gif',
      'https://res.cloudinary.com/dmbgk0uha/image/upload/v1782672740/VDB_nz3e0i.gif',
    ],
  },

  {
    id: 130, type: 'video', cat: 'Simulation FX', aspect: '16/9', bg: '#0d0c0a',
    label: 'Strawberry RBD Simulation',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782673861/Strawberry_RBD_Simulation_-_frame_at_0m1s_qosi9n.jpg',
    video: 'https://res.cloudinary.com/dmbgk0uha/video/upload/f_auto,q_auto,w_1600/v1782673006/Strawberry_RBD_Simulation_judu1e.mp4',
    images: [
      'https://res.cloudinary.com/dmbgk0uha/image/upload/v1782673954/Strawberry_xwgvdr.gif',
      'https://res.cloudinary.com/dmbgk0uha/image/upload/v1782673954/Strawberry_xwgvdr.gif',
    ],
  },
  // ── Product Visuals ──────────────────────────────────────────────────────────

  {
    id: 101, type: 'video', cat: 'Product Visuals', aspect: '16/9', bg: '#0d0d0d',
    label: 'Car Animation',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782476197/Car_Anim02_ggoazs.png',
    video: 'https://res.cloudinary.com/dmbgk0uha/video/upload/f_auto,q_auto,w_1600/v1782476132/Car_Anim_gw5ewi.mp4',
    images: [
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782476197/Car_Anim02_ggoazs.png',
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782476188/Car_Anim03_p4ojot.png',
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782476188/Car_Anim04_jfu7zs.png',
    ],
  },
  {
    id: 126, type: 'video', cat: 'Simulation FX', aspect: '16/9', bg: '#111114',
    label: 'Tiger VFX',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782667956/SH13_-_frame_at_0m5s_mjovfe.jpg',
    video: 'https://res.cloudinary.com/dmbgk0uha/video/upload/v1782667937/Tiger_VFX_ivllsy.mp4',
    images: [
      'https://res.cloudinary.com/dmbgk0uha/image/upload/v1782668831/Tiger_vfx_PB_sizo1g.gif',
      'https://res.cloudinary.com/dmbgk0uha/image/upload/v1782668831/Tiger_vfx_PB_sizo1g.gif',
      'https://res.cloudinary.com/dmbgk0uha/image/upload/v1782668833/Tiger_vfx_PB02_mceqiw.gif',
    ]
  },
  {
    id: 103, type: 'video', cat: 'Product Visuals', aspect: '16/9', bg: '#0a0a0e',
    label: 'Final Render',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782477863/0074_gxxg8n.png',
    video: 'https://res.cloudinary.com/dmbgk0uha/video/upload/f_auto,q_auto,w_1600/v1782477574/Final_render_o26lng.mp4',
    images: [
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782477863/0074_gxxg8n.png',
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782477860/0148_fvkfyj.png',
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782477863/0074_gxxg8n.png',
    ],
  },
  {
    id: 104, type: 'image', cat: 'Product Visuals', aspect: '1/1', bg: '#141414',
    label: 'Product — 39',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782477896/39_ngy8il.png',
  },
  {
    id: 105, type: 'image', cat: 'Product Visuals', aspect: '1/1', bg: '#161616',
    label: 'Product — 41',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782477902/41_cn8azp.png',
  },
  {
    id: 106, type: 'image', cat: 'Product Visuals', aspect: '1/1', bg: '#131313',
    label: 'Product — 40',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782477897/40_mnvk3j.png',
  },
  {
    id: 107, type: 'video', cat: 'Product Visuals', aspect: '16/9', bg: '#080808',
    label: 'Composition',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782476642/Q3_fmee4a.png',
    video: 'https://res.cloudinary.com/dmbgk0uha/video/upload/f_auto,q_auto,w_1600/v1782476230/Comp_dztwai.mp4',
    images: [
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782476642/Q3_fmee4a.png',
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782476642/Q3_fmee4a.png',
    ],
    subVideos: [
      'https://res.cloudinary.com/dmbgk0uha/video/upload/f_auto,q_auto,w_1600/v1782476567/0001-0240_f5js4k.mp4',

    ],
  },
  {
    id: 108, type: 'video', cat: 'Product Visuals', aspect: '16/9', bg: '#0a0a10',
    label: 'Headphones',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782502858/headphones0001-0683_-_frame_at_0m2s_ezxryr.jpg',
    video: 'https://res.cloudinary.com/dmbgk0uha/video/upload/f_auto,q_auto,w_1600/v1782479465/headphones0001-0683_jwmijv.mp4',
    images: [
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782479757/A17_z6qbbf.png',
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782479753/A16_a3b6cq.png',
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782479752/A20_fvufj8.png',
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782479757/A17_z6qbbf.png',
    ],
  },
  {
    id: 109, type: 'video', cat: 'Product Visuals', aspect: '16/9', bg: '#0d1014',
    label: 'SmartMed Arm',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782502856/SMARTMED_ARM_Animation_-_frame_at_0m10s_rcfvfm.jpg',
    video: 'https://res.cloudinary.com/dmbgk0uha/video/upload/f_auto,q_auto,w_1600/v1782479429/SMARTMED_ARM_Animation_s2q0iv.mp4',
  },
  {
    id: 110, type: 'image', cat: 'Product Visuals', aspect: '16/9', bg: '#0a0f18',
    label: 'Tennis',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782479477/Tennis_cjbhzy.png',
    images: [
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782479477/Tennis_cjbhzy.png',
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782479475/Tennis02_k4atlv.png',
    ],
  },
  {
    id: 111, type: 'image', cat: 'Product Visuals', aspect: '1/1', bg: '#0e0e0e',
    label: 'Earbuds',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782495227/earbuds_fv0cbr.png',
  },
  {
    id: 112, type: 'image', cat: 'Product Visuals', aspect: '4/5', bg: '#100c08',
    label: 'Ittar',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782495269/Ittar_ukavja.png',
    images: [
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782495269/Ittar_ukavja.png',
      'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782495274/Ittar02_rdukkc.png',
    ],
  },
  {
    id: 113, type: 'image', cat: 'Product Visuals', aspect: '4/5', bg: '#0c0c0e',
    label: 'Shilajeet',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782495267/shilajet_eyxfn4.png',
  },
  {
    id: 114, type: 'image', cat: 'Product Visuals', aspect: '4/5', bg: '#10100e',
    label: 'Creatine',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782495262/Creatine_msouxm.png',
  },
  {
    id: 115, type: 'image', cat: 'Product Visuals', aspect: '4/5', bg: '#0e0e0a',
    label: 'Bag',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782495591/bag_02_vit6uj.png',
  },
  {
    id: 116, type: 'image', cat: 'Product Visuals', aspect: '4/5', bg: '#0c1010',
    label: 'Inverter',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782495598/inverter_02_ktzraw.png',
  },
  {
    id: 117, type: 'video', cat: 'Product Visuals', aspect: '9/16', bg: '#0a0a0a',
    label: 'Product Reel',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782502860/IMG_1139_-_frame_at_0m8s_d1foip.jpg',
    video: 'https://res.cloudinary.com/dmbgk0uha/video/upload/f_auto,q_auto,w_1600/v1782495701/IMG_1139_lzmpgz.mp4',
  },
  {
    id: 118, type: 'image', cat: 'Product Visuals', aspect: '16/9', bg: '#0e0a14',
    label: 'Tech Throne',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782495280/Tech_Throne_kwygxh.png',
  },
  {
    id: 119, type: 'image', cat: 'Product Visuals', aspect: '4/5', bg: '#0c0a10',
    label: 'Chair',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782495639/chair_p1byp5.png',
  },
  {
    id: 120, type: 'image', cat: 'Product Visuals', aspect: '1/1', bg: '#101010',
    label: 'Wheel',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782495724/wheel_rurszb.png',
  },
  {
    id: 121, type: 'image', cat: 'Product Visuals', aspect: '4/5', bg: '#0c0c10',
    label: 'Shoes',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782495262/Shoes_k6bfbn.png',
  },
  {
    id: 122, type: 'image', cat: 'Product Visuals', aspect: '16/9', bg: '#0a0e18',
    label: 'PS4',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782495257/PS4_tq1vr1.png',
  },
  {
    id: 123, type: 'video', cat: 'Product Visuals', aspect: '1/1', bg: '#0e0e0e',
    label: 'Taser Machine',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782661558/Taser_jthiqw.jpg',
    video: 'https://res.cloudinary.com/dmbgk0uha/video/upload/f_auto,q_auto,w_1600/v1782661503/Taser_machine_gy6muy.mp4',
  },
  {
    id: 124, type: 'video', cat: 'Product Visuals', aspect: '1/1', bg: '#0e0e0e',
    label: 'Taser Machine BreakDown',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782661798/Break_down_-_frame_at_0m8s_qvbafo.jpg',
    video: 'https://res.cloudinary.com/dmbgk0uha/video/upload/f_auto,q_auto,w_1600/v1782661788/Break_down_yekkj4.mp4',
  },
  {
    id: 125, type: 'video', cat: 'Product Visuals', aspect: '1/1', bg: '#0e0e0e',
    label: 'Fendi Bag CGI',
    img: 'https://res.cloudinary.com/dmbgk0uha/image/upload/f_auto,q_auto,w_1600/v1782662201/Fendi_BagV02_-_frame_at_0m2s_bwalxm.jpg',
    video: 'https://res.cloudinary.com/dmbgk0uha/video/upload/v1782661932/Fendi_BagV02_andqh9.mp4',
  },
  // ── Visualization (placeholders — will be replaced when links arrive) ──────
  { id: 201, type: 'video', cat: 'Visualization', aspect: '16/9', bg: '#0d0d0d', label: 'Visualization — coming soon' },
  { id: 202, type: 'video', cat: 'Visualization', aspect: '4/5', bg: '#09090b', label: 'Visualization — coming soon' },
  { id: 203, type: 'video', cat: 'Visualization', aspect: '16/9', bg: '#0c0a09', label: 'Visualization — coming soon' },
];
const FILTERS = ['All', 'Simulation FX', 'Product Visuals', 'Architecture', 'Visualization'];

// Images for the page-4 DomeGallery — reuses the same source images as the
// full portfolio overlay so both stay in sync automatically.
const DOME_IMAGES = PORTFOLIO_ITEMS
  .filter(p => p.img)
  .map(p => ({ src: p.img, alt: p.label }));

function PortfolioPage({ onClose }) {
  const [activeFilter, setActiveFilter] = useState('All');
  const [selected, setSelected] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  // Randomise order in 'All' view; preserve category order in filtered views
  const shuffledAll = useMemo(() => {
    const arr = [...PORTFOLIO_ITEMS];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, []); // runs once per mount — stable random layout

  const filtered = activeFilter === 'All'
    ? shuffledAll
    : PORTFOLIO_ITEMS.filter(p => p.cat === activeFilter);

  const gallery = selected?.images && selected.images.length > 1 ? selected.images : null;

  const openItem = (item) => { setSelected(item); };

  useEffect(() => {
    if (!selected) return;
    const onKey = (e) => { if (e.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  return (
    <motion.div
      className="overlay-page portfolio-page pf-dark"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Grain texture overlay */}
      <div className="pf-grain" aria-hidden="true" />

      {/* Close */}
      <button className="overlay-close" onClick={onClose} aria-label="Close">
        <span /><span />
      </button>

      {/* Sticky top bar */}
      <div className="pf-topbar">
        <div className="pf-topbar-left">
          <span className="pf-topbar-label">PORTFOLIO — ALL WORKS</span>
          <span className="pf-topbar-count">{filtered.length} works</span>
        </div>
        <div className="pf-filters">
          {FILTERS.map(f => (
            <button
              key={f}
              className={`pf-filter-btn ${activeFilter === f ? 'active' : ''}`}
              onClick={() => setActiveFilter(f)}
            >{f}</button>
          ))}
        </div>
      </div>

      {/* Hero heading */}
      <div className="pf-hero-heading">
        <motion.p
          className="pf-eyebrow"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.7 }}
        >Selected work</motion.p>
        <motion.h2
          className="pf-big-title"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
          Port<em>folio</em>
        </motion.h2>
      </div>

      {/* CONTENT — single masonry grid for all views */}
      <div className="pf-flat-grid">
        {filtered.map((item, i) => (
          <motion.div
            key={item.id}
            className="pf-card"
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: i * 0.045 }}
            onMouseEnter={() => setHoveredId(item.id)}
            onMouseLeave={() => setHoveredId(null)}
            onClick={() => openItem(item)}
          >
            <PfCardInner item={item} hovered={hoveredId === item.id} />
          </motion.div>
        ))}
      </div>

      {/* ── PROJECT DRAWER ─────────────────────────────── */}
      <AnimatePresence>
        {selected && (
          <motion.div
            className="lb-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={() => setSelected(null)}
          >
            <motion.div
              className="lb-drawer"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              onClick={e => e.stopPropagation()}
            >

              {/* ── LEFT: images column ── */}
              <div className="lb-images-col">
                <LbHeroImage
                  src={gallery ? gallery[0] : selected.img}
                  alt={selected.label}
                  bg={selected.bg}
                  videoSrc={selected.video || null}
                />

                {/* Filmstrip — extra images + subVideos stacked below */}
                {((gallery && gallery.length > 1) || selected.subVideos?.length) && (
                  <div className="lb-filmstrip">
                    {gallery && gallery.slice(1).map((src, i) => (
                      <LbFilmImage key={`img-${i}`} src={src} alt={`${selected.label} — ${i + 2}`} />
                    ))}
                    {selected.subVideos && selected.subVideos.map((src, i) => (
                      <LbFilmImage key={`vid-${i}`} src={src} alt={`${selected.label} — video ${i + 1}`} isVideo />
                    ))}
                  </div>
                )}
              </div>

              {/* ── RIGHT: info panel ── */}
              <div className="lb-info-panel">
                <div className="lb-info-sticky">
                  {/* Close */}
                  <button className="lb-close" onClick={() => setSelected(null)} aria-label="Close">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  </button>

                  {/* Project meta */}
                  <div className="lb-meta">
                    <span className="lb-cat">{selected.cat}</span>
                    <h2 className="lb-title">{selected.label}</h2>
                    {gallery && (
                      <span className="lb-img-count">{gallery.length} images</span>
                    )}
                  </div>

                  <div className="lb-divider" />

                  {/* Credits section — placeholder rows, fill content later */}
                  <div className="lb-credits">
                    <p className="lb-credits-heading">Project Credits</p>
                    <div className="lb-credit-row">
                      <span className="lb-credit-name">— —</span>
                      <span className="lb-credit-role">Creative Director</span>
                    </div>
                    <div className="lb-credit-row">
                      <span className="lb-credit-name">— —</span>
                      <span className="lb-credit-role">Lead Architect</span>
                    </div>
                    <div className="lb-credit-row">
                      <span className="lb-credit-name">— —</span>
                      <span className="lb-credit-role">3D Visualisation</span>
                    </div>
                    <div className="lb-credit-row">
                      <span className="lb-credit-name">— —</span>
                      <span className="lb-credit-role">Photography</span>
                    </div>
                  </div>

                  <div className="lb-divider" />

                  {/* Scroll hint */}
                  <p className="lb-scroll-hint">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M6 1v10M3 8l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Scroll to see all images
                  </p>
                </div>
              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── LIGHTBOX HERO IMAGE ──────────────────────────────────────
// Renders a <video> when videoSrc is provided, otherwise an <img>.
// Images are constrained to fit the drawer without overflowing.
function LbHeroImage({ src, alt, bg, videoSrc }) {
  const [ratio, setRatio] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const handleLoad = useCallback((e) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (naturalWidth && naturalHeight) setRatio(naturalWidth / naturalHeight);
    setLoaded(true);
  }, []);

  if (videoSrc) {
    return (
      <div className="lb-hero-img-wrap lb-video-wrap">
        <video
          className="lb-hero-video"
          src={videoSrc}
          controls
          autoPlay
          loop
          muted
          playsInline
          poster={src}
        />
      </div>
    );
  }

  return (
    <div
      className="lb-hero-img-wrap"
      style={ratio ? { aspectRatio: `${ratio}` } : { minHeight: '40vh', background: bg }}
    >
      {src && (
        <>
          <div
            className={`img-skeleton ${loaded ? 'img-skeleton--hidden' : ''}`}
            style={bg ? {
              background: `linear-gradient(100deg, ${bg}18, ${bg}45, ${bg}18)`,
              backgroundSize: '200% 100%'
            } : undefined}
          />
          <img
            className={`lb-hero-img lb-hero-img--fit ${loaded ? 'is-loaded' : ''}`}
            src={src}
            alt={alt}
            onLoad={handleLoad}
          />
        </>
      )}
    </div>
  );
}

// ─── LIGHTBOX FILM IMAGE ──────────────────────────────────────
// Renders video or image in the filmstrip depending on src type.
function LbFilmImage({ src, alt, isVideo }) {
  const [loaded, setLoaded] = useState(false);

  if (isVideo) {
    return (
      <div className="lb-film-img-wrap">
        <video
          className="lb-film-img lb-film-img--fit"
          src={src}
          controls
          loop
          muted
          playsInline
        />
      </div>
    );
  }

  return (
    <div className="lb-film-img-wrap">
      {src && (
        <>
          <div className={`img-skeleton ${loaded ? 'img-skeleton--hidden' : ''}`} />
          <img
            className={`lb-film-img lb-film-img--fit ${loaded ? 'is-loaded' : ''}`}
            src={src}
            alt={alt}
            loading="lazy"
            onLoad={() => setLoaded(true)}
          />
        </>
      )}
    </div>
  );
}
// Reads each image's natural pixel dimensions on load and locks
// the card to that exact aspect ratio — zero cropping guaranteed.
function PfCardInner({ item, hovered, index }) {
  const [naturalRatio, setNaturalRatio] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const handleLoad = useCallback((e) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (naturalWidth && naturalHeight) {
      setNaturalRatio(naturalWidth / naturalHeight);
    }
    setLoaded(true);
  }, []);

  // Card wrapper style — reserve a sensible box before we know the real
  // ratio (prevents masonry jump / blank flash), then lock to the exact
  // ratio once the image has loaded.
  const cardStyle = naturalRatio
    ? { aspectRatio: `${naturalRatio}`, overflow: 'hidden' }
    : { aspectRatio: '4 / 3', overflow: 'hidden' };

  return (
    <div className="pf-card-inner-wrap" style={cardStyle}>
      {item.img ? (
        <>
          <div
            className={`img-skeleton ${loaded ? 'img-skeleton--hidden' : ''}`}
            style={item.bg ? {
              background: `linear-gradient(100deg, ${item.bg}18, ${item.bg}45, ${item.bg}18)`,
              backgroundSize: '200% 100%'
            } : undefined}
          />
          <img
            className={`pf-card-img-natural ${hovered ? 'hovered' : ''} ${loaded ? 'is-loaded' : ''}`}
            src={item.img}
            alt={item.label}
            loading="lazy"
            onLoad={handleLoad}
          />
        </>
      ) : (
        <div className="pf-card-placeholder" style={{ background: item.bg }} />
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
      <div className={`pf-card-info ${hovered ? 'visible' : ''}`}>
        <span className="pf-card-cat">{item.cat}</span>
        <span className="pf-card-label">{item.label}</span>
      </div>
      {index !== undefined && (
        <span className="pf-card-index-num">{String(index + 1).padStart(2, '0')}</span>
      )}
    </div>
  );
}

// ─── ABOUT CARD FACE ─────────────────────────────────────────
// Renders one face (front = Company, back = Personal) of the
// About card. Parametrized so the flip toggle can swap content
// without duplicating the entrance-animation logic.
function AboutCardFace({ active, isPhoneWidth, eyebrow, titleLines, description, stats, mobileTagLines, rightNode, extraLeft }) {
  return (
    <div className="about-wrapper">
      <motion.div
        className="about-left"
        animate={active ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 1, delay: 0.35 }}
      >
        <div className="about-eyebrow">
          <span className="eyebrow-line" />
          <span className="eyebrow-text">{eyebrow}</span>
        </div>
        <div className="about-title-block">
          {titleLines.map((line, i) => (
            <motion.span
              key={line}
              className={`about-title-line${i === 1 ? ' about-title-italic' : ''}`}
              initial={{ opacity: 0, y: 24 }}
              animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
              transition={{ duration: 0.9, delay: 0.5 + i * 0.15, ease: [0.16, 1, 0.3, 1] }}
            >{line}</motion.span>
          ))}
        </div>
        <motion.p
          className="about-description"
          initial={{ opacity: 0, y: 14 }}
          animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
          transition={{ duration: 0.9, delay: 0.82, ease: [0.16, 1, 0.3, 1] }}
        >
          {description}
        </motion.p>
        <motion.div
          className="about-stats"
          animate={active ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.9, delay: 1.05 }}
        >
          {stats.map(([n, l], i) => (
            <React.Fragment key={l}>
              {i > 0 && <div className="stat-divider" />}
              <div className="stat-item">
                <span className="stat-number">{n}</span>
                <span className="stat-label">{l}</span>
              </div>
            </React.Fragment>
          ))}
        </motion.div>
        {extraLeft && (
          <motion.div
            animate={active ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.9, delay: 1.2 }}
          >
            {extraLeft}
          </motion.div>
        )}
      </motion.div>
      {!isPhoneWidth && (
        <>
          <div className="about-divider" />
          <motion.div
            className="about-right"
            animate={active ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 1.1, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            {rightNode}
          </motion.div>
        </>
      )}
      {isPhoneWidth && (
        <motion.div
          className="about-mobile-tag"
          animate={active ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.9, delay: 1.15 }}
        >
          {mobileTagLines.map((t) => <span key={t}>{t}</span>)}
        </motion.div>
      )}
    </div>
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

  // About card (page 2): flips between Company Profile (front) and
  // Personal Profile (back) via the toggle pill at the top of the card.
  const [isAboutFlipped, setIsAboutFlipped] = useState(false);

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
      case 'portfolio':
        setActiveZone('portfolio');
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
      if (e.target.closest('.nav-dots, .overlay-page, .overlay-close, button, a, input, textarea, .finale-btn-primary, .finale-btn-ghost, .sphere-root')) return;
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
      const sectionMap = [0, 2, 3, 4, 5]; // hero-a, about, skills, portfolio, blank
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
          handleNavigate(ZONES[currentIdx + 1].target);
        if (e.key === 'ArrowUp' && currentIdx > 0)
          handleNavigate(ZONES[currentIdx - 1].target);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeZone, handleNavigate, activePage]);

  const particleColor = activeZone === 'blank' ? '#ffffff' : '#111111';
  const isCardZone = activeZone === 'about' || activeZone === 'skills';
  const isLight = activeZone === 'blank' || activeZone === 'portfolio';

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
      <StaggeredMenu
        isLight={isLight}
        onNavigate={handleNavigate}
        onPortfolio={() => setActivePage('portfolio')}
        onContact={() => setActivePage('contact')}
        hideToggle={!!activePage}
      />
      <HTMLCursor isLight={isLight} hoveredDotLabel={hoveredDotLabel} activePage={activePage} />
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
        onPortfolio={() => setActivePage('portfolio')}
        showScrollIndicator={showIndicator}
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

        {/* ABOUT CARD — flips between Company Profile (front) and Personal Profile (back) */}
        <motion.div
          className="card-deck-card about-card"
          style={{ zIndex: 2 }}
          animate={
            activeZone === 'about' ? { y: '0%', scale: 1, opacity: 1 } :
              activeZone === 'skills' ? { y: '-112%', scale: 1, opacity: 0 } :
                { y: '0%', scale: 1, opacity: 0 }
          }
          transition={{ duration: 0.7, ease: [0.32, 0, 0.67, 0] }}
        >
          {/* Toggle pill — top centre of the card */}
          <button
            type="button"
            className={`about-flip-toggle${isAboutFlipped ? ' is-flipped' : ''}`}
            onClick={() => setIsAboutFlipped((f) => !f)}
            aria-pressed={isAboutFlipped}
            aria-label="Toggle between personal profile and company profile"
          >
            <span className="aft-track">
              <span className="aft-thumb" />
              <span className="aft-label aft-label-personal">Personal Profile</span>
              <span className="aft-label aft-label-company">Company Profile</span>
            </span>
          </button>

          <div className="about-flip-outer">
            <div className={`about-flip-inner${isAboutFlipped ? ' is-flipped' : ''}`}>
              {/* FRONT — Personal */}
              <div className="glass-container about-flip-face about-flip-front">
                <AboutCardFace
                  active={activeZone === 'about'}
                  isPhoneWidth={isPhoneWidth}
                  eyebrow="Say Hello"
                  titleLines={["Hi, I'm", 'Ali.']}
                  description="The person behind ArtsnFar — an Electronic Engineer turned FX Artist, currently at Elipse Studio. I build 3D worlds and love meeting new people."
                  stats={[['4+', 'Years'], ['50+', 'Projects'], ['1', 'Studio']]}
                  mobileTagLines={['Ali', '/ Creator']}
                  rightNode={
                    <div className="personal-right-wrap">
                      <div className="about-image-frame">
                        <div className="image-border-offset" />
                        <FluidRevealImage baseImage="/WITHOUT.png" revealImage="/WITH.png" />
                        {/* Caption block below portrait */}
                        <div className="portrait-meta">
                          <span className="portrait-meta-name">Ali Ahmed</span>
                          <span className="portrait-meta-role">FX Artist · Elipse Studio</span>
                          <span className="portrait-meta-edu">Electronic Eng. · Dawood UET</span>
                          <div className="portrait-meta-skills">
                            <span>Houdini</span>
                            <span>Blender</span>
                            <span>Substance Painter</span>
                          </div>
                        </div>
                      </div>
                      <div className="personal-socials">
                        <div className="personal-socials-line" />
                        <a href="https://www.instagram.com/a.liahmed000/"
                          target="_blank" rel="noopener noreferrer"
                          className="personal-social-link" aria-label="Instagram">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                            <circle cx="12" cy="12" r="4" />
                            <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
                          </svg>
                        </a>
                      </div>
                    </div>
                  }
                />
              </div>

              {/* BACK — Company */}
              <div className="glass-container about-flip-face about-flip-back">
                <AboutCardFace
                  active={activeZone === 'about'}
                  isPhoneWidth={isPhoneWidth}
                  eyebrow="Est. 2024"
                  titleLines={['We craft', 'experiences.']}
                  description="From the first sketch to the final render, we create 3D visuals and animations designed to make ideas stand out. Every detail matters, and every project is built with care."
                  stats={[['50+', 'Projects'], ['20+', 'Clients'], ['3', 'Certifications']]}
                  mobileTagLines={['Studio', '/ 2024']}
                  rightNode={
                    <div className="personal-right-wrap">
                      <div className="about-image-frame about-logo-frame">
                        <div className="image-border-offset" />
                        <div className="about-logo-display">
                          <img src="/logo.png" alt="ArtsnFar Studio logo" className="about-logo-img" />
                        </div>
                        <div className="image-caption-tag"><span>ArtsnFar / Studio</span></div>
                      </div>
                      <div className="personal-socials">
                        <div className="personal-socials-line" />
                        {/* Instagram */}
                        <a href="https://www.instagram.com/artsnfar_studio?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw=="
                          target="_blank" rel="noopener noreferrer"
                          className="personal-social-link" aria-label="Instagram">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                            <circle cx="12" cy="12" r="4" />
                            <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
                          </svg>
                        </a>
                        {/* YouTube */}
                        <a href="https://www.youtube.com/@ArtsnFar/shorts"
                          target="_blank" rel="noopener noreferrer"
                          className="personal-social-link" aria-label="YouTube">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-1.96C18.88 4 12 4 12 4s-6.88 0-8.6.46A2.78 2.78 0 0 0 1.46 6.42 29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.4 19.54C5.12 20 12 20 12 20s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-1.96A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z" />
                            <polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="currentColor" stroke="none" />
                          </svg>
                        </a>
                        {/* ArtStation */}
                        <a href="https://www.artstation.com/artsnfar_studio"
                          target="_blank" rel="noopener noreferrer"
                          className="personal-social-link" aria-label="ArtStation">
                          <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
                            <path d="M0 17.723l2.027 3.505h.001a2.424 2.424 0 0 0 2.164 1.333h13.457l-2.792-4.838H0zm24 .025c0-.484-.143-.935-.388-1.314L15.728 2.728a2.424 2.424 0 0 0-2.164-1.333H9.419L21.598 22.54l1.92-3.325c.378-.58.482-.65.482-1.467zm-11.129-3.462L7.428 4.858l-5.444 9.428h10.887z" />
                          </svg>
                        </a>
                      </div>
                    </div>
                  }
                />
              </div>
            </div>
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
                At ArtsnFar, we've built hands-on experience across industry-standard tools and creative techniques
                over the year, allowing us to create professional 3D visuals, Simulations, CGI, and animations that bring ideas to life.
              </motion.p>
              <motion.div
                className="about-stats"
                animate={activeZone === 'skills' ? { opacity: 1 } : { opacity: 0 }}
                transition={{ duration: 0.9, delay: activeZone === 'skills' ? 1.0 : 0 }}
              >
                {[['4+', 'Years'], ['5+', 'Tools'], ['6', 'Domains']].map(([n, l], i) => (
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

      {/* PORTFOLIO ZONE — page 4 */}
      <div className={`portfolio-content-page ${activeZone === 'portfolio' ? 'visible' : ''}`}>
        <div className="pfz-wrapper">
          <div className="pfz-bg-number">04</div>

          <motion.div
            className="pfz-dome-wrap"
            initial={{ opacity: 0, scale: 1.2 }}
            animate={activeZone === 'portfolio' ? { opacity: 1, scale: 1.2 } : { opacity: 0, scale: 1.2 }}
            transition={{ duration: 1.1, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <DomeGallery
              images={DOME_IMAGES}
              fit={isMobile ? 0.85 : 1.2}
              minRadius={isMobile ? 500 : 1200}
              maxRadius={2000}
              segments={26}
              grayscale={false}
              overlayBlurColor="#0c0c0c"
              imageBorderRadius="10px"
              maxVerticalRotationDeg={8}
              dragSensitivity={22}
              padFactor={0.22}
            />
          </motion.div>

          <div className="pfz-viewmore-center">
            <motion.button
              className="pfz-viewmore-btn"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={activeZone === 'portfolio' ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
              whileHover={{ scale: 1.06 }}
              transition={{ duration: 0.7, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
              onClick={() => setActivePage('portfolio')}
              aria-label="View full portfolio"
            >
              {activeZone === 'portfolio' && (
                <Shuffle
                  key={`view-more-${activeZone === 'portfolio'}`}
                  text="View More"
                  tag="span"
                  className="pfz-viewmore-shuffle"
                  duration={0.4}
                  shuffleDirection="right"
                  animationMode="evenodd"
                  shuffleTimes={2}
                  ease="power3.out"
                  stagger={0.04}
                  threshold={0}
                  triggerOnce={false}
                  triggerOnHover={true}
                  respectReducedMotion={true}
                />
              )}
            </motion.button>
          </div>
        </div>
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
            </motion.div>
          </div>
          <motion.div
            className="finale-timeline"
            initial={{ opacity: 0 }}
            animate={activeZone === 'blank' ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 1, delay: 1.5 }}
          >
            {ZONES.slice(0, 4).map((zone, i, arr) => (
              <React.Fragment key={zone.id}>
                <div className="finale-timeline-item">
                  <span className="finale-timeline-num">{zone.index}</span>
                  <span className="finale-timeline-label">{zone.label}</span>
                </div>
                {i < arr.length - 1 && <div className="finale-timeline-connector" />}
              </React.Fragment>
            ))}
          </motion.div>
        </motion.div>
      </div>

      <ZoneCounter activeZone={activeZone} isLight={isLight} />


      {/* THREE.JS CANVAS — desktop only */}
      {!isMobile && (
        <div
          className="canvas-container"
          style={{ visibility: (activeZone === 'blank' || activeZone === 'portfolio') ? 'hidden' : 'visible' }}
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
            {(activeZone !== 'blank' && activeZone !== 'portfolio') && (
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