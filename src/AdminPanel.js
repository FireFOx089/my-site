import React, { useState, useEffect, useMemo } from 'react';
import './AdminPanel.css';
import {
  loadPortfolioItems,
  savePortfolioItems,
  loadFilters,
  saveFilters,
  resetPortfolioData,
  DEFAULT_CREDITS,
} from './portfolioData';

const COMMON_ROLES = [
  'Creative Direction',
  '3D Visualisation',
  'LookDev',
  'Animation',
  'Simulation',
  'Compositing',
  'Software',
  'Project of',
  'Art Direction',
  'Environment Art',
  '3D Modeling',
  'Texturing & LookDev',
  'Lighting & LookDev',
];

const ASPECT_RATIOS = ['16/9', '4/3', '1/1', '4/5', '9/16', '3/2'];

export default function AdminPanel({ onExit }) {
  const [items, setItems] = useState(() => loadPortfolioItems());
  const [categories, setCategories] = useState(() => loadFilters());
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [editingItem, setEditingItem] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [toastIsError, setToastIsError] = useState(false);

  // ── Fix: restore native cursor & scroll while admin is mounted ─────────────
  useEffect(() => {
    // Save previous body styles
    const prevCursor = document.body.style.cursor;
    const prevOverflow = document.body.style.overflow;

    // Force normal cursor and scrolling on body for admin panel
    document.body.style.setProperty('cursor', 'auto', 'important');
    document.body.style.overflow = 'auto';

    // Inject a style tag to override the global cursor:none rules
    const styleEl = document.createElement('style');
    styleEl.id = 'admin-cursor-override';
    styleEl.textContent = `
      body, body * { cursor: auto !important; }
      .html-cursor-outer, .html-cursor-inner { display: none !important; }
    `;
    document.head.appendChild(styleEl);

    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.overflow = prevOverflow;
      const el = document.getElementById('admin-cursor-override');
      if (el) el.remove();
    };
  }, []);

  // New category input
  const [newCatName, setNewCatName] = useState('');

  // Show toast helper
  const showToast = (msg, isError = false) => {
    setToastMessage(msg);
    setToastIsError(isError);
    setTimeout(() => {
      setToastMessage(null);
      setToastIsError(false);
    }, 3500);
  };

  // ── Save to Source File ─────────────────────────────────────────────────────
  const handleSaveToFile = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/save-to-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, filters: categories }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast('✓ Saved to portfolioData.js — your changes are now permanent!');
      } else {
        showToast(`Save failed: ${data.error}`, true);
      }
    } catch (err) {
      showToast(`Save failed: ${err.message}`, true);
    } finally {
      setIsSaving(false);
    }
  };

  // Sync state if external change happens
  useEffect(() => {
    const handleDataUpdate = (e) => {
      if (e.detail?.type === 'items' && e.detail.items) {
        setItems(e.detail.items);
      } else if (e.detail?.type === 'filters' && e.detail.filters) {
        setCategories(e.detail.filters);
      } else {
        setItems(loadPortfolioItems());
        setCategories(loadFilters());
      }
    };
    window.addEventListener('artsnfar_data_updated', handleDataUpdate);
    return () => window.removeEventListener('artsnfar_data_updated', handleDataUpdate);
  }, []);

  // Lock body scroll when any modal is open so the backdrop is the
  // only scrollable surface — prevents page jumping behind the overlay.
  const isAnyModalOpen = !!(editingItem || showCategoryModal);
  useEffect(() => {
    if (isAnyModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => { document.body.style.overflow = 'auto'; };
  }, [isAnyModalOpen]);

  // Filtered list
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchCat = activeCategory === 'All' || item.cat === activeCategory;
      const matchSearch =
        !searchQuery.trim() ||
        item.label?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.cat?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [items, activeCategory, searchQuery]);

  // Stats
  const stats = useMemo(() => {
    const videoCount = items.filter((i) => i.type === 'video').length;
    const imageCount = items.filter((i) => i.type === 'image').length;
    return {
      total: items.length,
      categories: categories.filter((c) => c !== 'All').length,
      videos: videoCount,
      images: imageCount,
    };
  }, [items, categories]);

  // ── Project Actions ────────────────────────────────────────────────────────
  const handleCreateNew = () => {
    const defaultCat = categories.find((c) => c !== 'All') || 'Visualization';
    const nextId = items.length > 0 ? Math.max(...items.map((i) => i.id || 0)) + 1 : 1;
    setEditingItem({
      id: nextId,
      type: 'image',
      cat: defaultCat,
      aspect: '16/9',
      bg: '#0e0e12',
      label: '',
      img: '',
      video: '',
      images: [],
      subVideos: [],
      credits: DEFAULT_CREDITS.map((c) => ({ ...c })),
    });
    setIsNew(true);
  };

  const handleEdit = (item) => {
    setEditingItem({
      ...item,
      images: item.images ? [...item.images] : (item.img ? [item.img] : []),
      subVideos: item.subVideos ? [...item.subVideos] : [],
      credits: item.credits ? item.credits.map((c) => ({ ...c })) : DEFAULT_CREDITS.map((c) => ({ ...c })),
    });
    setIsNew(false);
  };

  const handleDuplicate = (item) => {
    const nextId = Math.max(...items.map((i) => i.id || 0)) + 1;
    const duplicated = {
      ...item,
      id: nextId,
      label: `${item.label} (Copy)`,
      images: item.images ? [...item.images] : [],
      subVideos: item.subVideos ? [...item.subVideos] : [],
      credits: item.credits ? item.credits.map((c) => ({ ...c })) : [],
    };
    const updated = [duplicated, ...items];
    setItems(updated);
    savePortfolioItems(updated);
    showToast(`Duplicated "${item.label}"`);
  };

  const handleDelete = (item) => {
    if (window.confirm(`Are you sure you want to delete "${item.label}"?`)) {
      const updated = items.filter((i) => i.id !== item.id);
      setItems(updated);
      savePortfolioItems(updated);
      showToast(`Deleted "${item.label}"`);
    }
  };

  const handleSaveItem = (e) => {
    e.preventDefault();
    if (!editingItem.label.trim()) {
      alert('Please enter a project title / label.');
      return;
    }
    if (!editingItem.img?.trim()) {
      alert('Please provide a thumbnail or image URL.');
      return;
    }

    // Clean up images list (make sure main image is first if gallery has items)
    let finalImages = (editingItem.images || []).filter((url) => url && url.trim().length > 0);
    if (finalImages.length === 0 && editingItem.img) {
      finalImages = [editingItem.img.trim()];
    }

    const payload = {
      ...editingItem,
      label: editingItem.label.trim(),
      img: editingItem.img.trim(),
      video: editingItem.type === 'video' ? (editingItem.video || '').trim() : undefined,
      images: finalImages,
      subVideos: (editingItem.subVideos || []).filter((v) => v && v.trim().length > 0),
      credits: (editingItem.credits || []).filter((c) => c.name?.trim() || c.role?.trim()),
    };

    let updated;
    if (isNew) {
      updated = [payload, ...items];
      showToast(`Added "${payload.label}"`);
    } else {
      updated = items.map((i) => (i.id === payload.id ? payload : i));
      showToast(`Saved "${payload.label}"`);
    }

    setItems(updated);
    savePortfolioItems(updated);
    setEditingItem(null);
  };

  // ── Category Actions ───────────────────────────────────────────────────────
  const handleAddCategory = (e) => {
    e.preventDefault();
    const name = newCatName.trim();
    if (!name) return;
    if (categories.includes(name)) {
      alert('Category already exists!');
      return;
    }
    const updated = [...categories, name];
    setCategories(updated);
    saveFilters(updated);
    setNewCatName('');
    showToast(`Category "${name}" created`);
  };

  const handleDeleteCategory = (catToDelete) => {
    if (catToDelete === 'All') {
      alert('The "All" filter cannot be deleted.');
      return;
    }
    const itemsInCat = items.filter((i) => i.cat === catToDelete).length;
    if (itemsInCat > 0) {
      if (!window.confirm(`There are ${itemsInCat} projects under "${catToDelete}". Deleting this category will move them to "Visualization". Continue?`)) {
        return;
      }
      // Reassign to another category
      const targetCat = categories.find((c) => c !== 'All' && c !== catToDelete) || 'Uncategorized';
      const updatedItems = items.map((i) => (i.cat === catToDelete ? { ...i, cat: targetCat } : i));
      setItems(updatedItems);
      savePortfolioItems(updatedItems);
    }
    const updatedFilters = categories.filter((c) => c !== catToDelete);
    setCategories(updatedFilters);
    saveFilters(updatedFilters);
    if (activeCategory === catToDelete) setActiveCategory('All');
    showToast(`Category "${catToDelete}" deleted`);
  };

  const handleResetData = () => {
    if (window.confirm('Reset all portfolio projects and categories to factory defaults? Any custom items will be replaced.')) {
      resetPortfolioData();
      setItems(loadPortfolioItems());
      setCategories(loadFilters());
      showToast('Reset to default portfolio items.');
    }
  };

  return (
    <div className="ap-root">
      {/* ── Top Header ── */}
      <header className="ap-header">
        <div className="ap-header-brand">
          <h1 className="ap-title">
            ArtsnFar <span>Studio Admin</span>
          </h1>
          <div className="ap-status-badge">
            <span className="ap-status-dot" />
            Live Sync Active
          </div>
        </div>

        <div className="ap-header-actions">
          <button className="ap-btn ap-btn-primary" onClick={handleCreateNew}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add New Project
          </button>

          <button className="ap-btn ap-btn-secondary" onClick={() => setShowCategoryModal(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h7" />
            </svg>
            Categories ({categories.length - 1})
          </button>

          <button
            className="ap-btn ap-btn-save"
            onClick={handleSaveToFile}
            disabled={isSaving}
            title="Write current items & categories permanently into portfolioData.js"
          >
            {isSaving ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 1s linear infinite' }}>
                  <circle cx="12" cy="12" r="10" strokeDasharray="31.4" strokeDashoffset="10" />
                </svg>
                Saving...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
                Save to File
              </>
            )}
          </button>

          <button className="ap-btn ap-btn-secondary" onClick={handleResetData} title="Restore default hardcoded items">
            Reset
          </button>

          <button className="ap-btn ap-btn-exit" onClick={onExit}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
            </svg>
            View Live Site
          </button>
        </div>
      </header>

      <div className="ap-container">
        {/* ── Stats Row ── */}
        <div className="ap-stats-bar">
          <div className="ap-stat-card">
            <span className="ap-stat-label">Total Projects</span>
            <span className="ap-stat-val">{stats.total}</span>
          </div>
          <div className="ap-stat-card">
            <span className="ap-stat-label">Active Categories</span>
            <span className="ap-stat-val">{stats.categories}</span>
          </div>
          <div className="ap-stat-card">
            <span className="ap-stat-label">Video Projects</span>
            <span className="ap-stat-val">{stats.videos}</span>
          </div>
          <div className="ap-stat-card">
            <span className="ap-stat-label">Still / Render Projects</span>
            <span className="ap-stat-val">{stats.images}</span>
          </div>
        </div>

        {/* ── Toolbar: Category filter pills + Search ── */}
        <div className="ap-toolbar">
          <div className="ap-categories">
            {categories.map((cat) => {
              const count = cat === 'All' ? items.length : items.filter((i) => i.cat === cat).length;
              return (
                <button
                  key={cat}
                  className={`ap-cat-btn ${activeCategory === cat ? 'active' : ''}`}
                  onClick={() => setActiveCategory(cat)}
                >
                  <span>{cat}</span>
                  <span className="ap-cat-count">{count}</span>
                </button>
              );
            })}
          </div>

          <div className="ap-search-wrap">
            <svg className="ap-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="search"
              className="ap-search-input"
              placeholder="Search by title or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* ── Projects Grid ── */}
        <div className="ap-grid">
          {filteredItems.map((item) => (
            <div className="ap-card" key={item.id}>
              <div className="ap-card-thumb-wrap" style={{ background: item.bg || '#111' }}>
                {item.img ? (
                  <img src={item.img} alt={item.label} className="ap-card-thumb" loading="lazy" />
                ) : (
                  <div style={{ padding: '2rem', textAlign: 'center', color: '#666', fontSize: '0.8rem' }}>No image</div>
                )}

                <div className="ap-card-badges">
                  <span className="ap-badge ap-badge-type">{item.type}</span>
                  {item.aspect && <span className="ap-badge ap-badge-aspect">{item.aspect}</span>}
                </div>

                {item.images && item.images.length > 1 && (
                  <div className="ap-badge-gallery">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <path d="M21 15l-5-5L5 21" />
                    </svg>
                    <span>{item.images.length}</span>
                  </div>
                )}
              </div>

              <div className="ap-card-body">
                <div className="ap-card-meta">
                  <span className="ap-card-cat">{item.cat}</span>
                  <span className="ap-card-id">#{item.id}</span>
                </div>

                <h3 className="ap-card-title">{item.label}</h3>

                <div className="ap-card-credits-preview">
                  {item.credits && item.credits.length > 0 ? (
                    <div>
                      {item.credits.slice(0, 3).map((c, i) => (
                        <span key={i} style={{ marginRight: '0.4rem' }}>
                          <strong style={{ color: '#ccc' }}>{c.role}:</strong> {c.name}
                          {i < Math.min(item.credits.length, 3) - 1 ? ' • ' : ''}
                        </span>
                      ))}
                      {item.credits.length > 3 && <span style={{ color: '#6366f1' }}> +{item.credits.length - 3} more</span>}
                    </div>
                  ) : (
                    <span style={{ color: '#666' }}>Default credits</span>
                  )}
                </div>

                <div className="ap-card-actions">
                  <button className="ap-btn ap-btn-secondary ap-btn-sm" onClick={() => handleEdit(item)}>
                    Edit
                  </button>
                  <button className="ap-btn ap-btn-secondary ap-btn-sm" onClick={() => handleDuplicate(item)}>
                    Duplicate
                  </button>
                  <button className="ap-btn ap-btn-danger ap-btn-sm" onClick={() => handleDelete(item)}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}

          {filteredItems.length === 0 && (
            <div style={{ gridColumn: '1 / -1', padding: '4rem 2rem', textAlign: 'center', color: '#888' }}>
              <p style={{ fontSize: '1.1rem', margin: '0 0 1rem' }}>No projects found matching your criteria.</p>
              <button className="ap-btn ap-btn-primary" onClick={handleCreateNew}>
                Create New Project
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── PROJECT EDIT / CREATE MODAL ───────────────────────────────────────── */}
      {editingItem && (
        <div className="ap-modal-backdrop" onClick={() => setEditingItem(null)}>
          <div className="ap-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ap-modal-head">
              <h2 className="ap-modal-title">{isNew ? 'Create New Project' : `Edit Project: ${editingItem.label || 'Untitled'}`}</h2>
              <button className="ap-btn ap-btn-secondary ap-btn-sm" onClick={() => setEditingItem(null)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveItem}>
              <div className="ap-modal-body">
                <div className="ap-form-grid">
                  {/* Title */}
                  <div className="ap-form-group">
                    <label className="ap-label">Project Title *</label>
                    <input
                      type="text"
                      className="ap-input"
                      placeholder="e.g. Luxury Skyscraper"
                      value={editingItem.label}
                      onChange={(e) => setEditingItem({ ...editingItem, label: e.target.value })}
                      required
                    />
                  </div>

                  {/* Category */}
                  <div className="ap-form-group">
                    <label className="ap-label">Category *</label>
                    <select
                      className="ap-select"
                      value={editingItem.cat}
                      onChange={(e) => setEditingItem({ ...editingItem, cat: e.target.value })}
                    >
                      {categories
                        .filter((c) => c !== 'All')
                        .map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Media Type Toggle */}
                  <div className="ap-form-group">
                    <label className="ap-label">Media Type</label>
                    <div className="ap-type-toggle">
                      <div
                        className={`ap-type-option ${editingItem.type === 'image' ? 'active' : ''}`}
                        onClick={() => setEditingItem({ ...editingItem, type: 'image' })}
                      >
                        Image / Still
                      </div>
                      <div
                        className={`ap-type-option ${editingItem.type === 'video' ? 'active' : ''}`}
                        onClick={() => setEditingItem({ ...editingItem, type: 'video' })}
                      >
                        Video (MP4)
                      </div>
                    </div>
                  </div>

                  {/* Aspect Ratio */}
                  <div className="ap-form-group">
                    <label className="ap-label">Aspect Ratio</label>
                    <select
                      className="ap-select"
                      value={editingItem.aspect || '16/9'}
                      onChange={(e) => setEditingItem({ ...editingItem, aspect: e.target.value })}
                    >
                      {ASPECT_RATIOS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Main Image / Poster Cloudinary URL */}
                  <div className="ap-form-group full-width">
                    <label className="ap-label">Main Image / Poster Cloudinary Link *</label>
                    <input
                      type="url"
                      className="ap-input"
                      placeholder="https://res.cloudinary.com/.../image.png"
                      value={editingItem.img || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, img: e.target.value })}
                      required
                    />
                    <span className="ap-input-hint">Used as the portfolio card thumbnail and video poster.</span>
                  </div>

                  {/* Video URL (if type is video) */}
                  {editingItem.type === 'video' && (
                    <div className="ap-form-group full-width">
                      <label className="ap-label">Video Cloudinary Link (MP4) *</label>
                      <input
                        type="url"
                        className="ap-input"
                        placeholder="https://res.cloudinary.com/.../video.mp4"
                        value={editingItem.video || ''}
                        onChange={(e) => setEditingItem({ ...editingItem, video: e.target.value })}
                        required={editingItem.type === 'video'}
                      />
                      <span className="ap-input-hint">Plays automatically in the lightbox drawer.</span>
                    </div>
                  )}

                  {/* Background Color */}
                  <div className="ap-form-group">
                    <label className="ap-label">Background Color (Hex)</label>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input
                        type="color"
                        value={editingItem.bg || '#0e0e12'}
                        onChange={(e) => setEditingItem({ ...editingItem, bg: e.target.value })}
                        style={{ width: '40px', height: '36px', border: 'none', background: 'none', cursor: 'pointer' }}
                      />
                      <input
                        type="text"
                        className="ap-input"
                        value={editingItem.bg || '#0e0e12'}
                        onChange={(e) => setEditingItem({ ...editingItem, bg: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* ── Sub-links / Gallery Images ── */}
                <div className="ap-form-group full-width">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="ap-label">Gallery Sub-Links (Additional High-Res Images / Renders)</label>
                    <button
                      type="button"
                      className="ap-btn ap-btn-secondary ap-btn-sm"
                      onClick={() =>
                        setEditingItem({
                          ...editingItem,
                          images: [...(editingItem.images || []), ''],
                        })
                      }
                    >
                      + Add Gallery Image Link
                    </button>
                  </div>

                  <div className="ap-dynamic-list">
                    {(editingItem.images || []).map((imgUrl, idx) => (
                      <div className="ap-dynamic-row" key={idx}>
                        {imgUrl ? (
                          <img src={imgUrl} alt={`Preview ${idx}`} className="ap-thumb-mini" onError={(e) => (e.target.style.display = 'none')} />
                        ) : (
                          <div className="ap-thumb-mini" />
                        )}
                        <input
                          type="url"
                          className="ap-input"
                          placeholder={`Sub-link #${idx + 1} Cloudinary URL`}
                          value={imgUrl}
                          onChange={(e) => {
                            const copy = [...editingItem.images];
                            copy[idx] = e.target.value;
                            setEditingItem({ ...editingItem, images: copy });
                          }}
                        />
                        <button
                          type="button"
                          className="ap-btn ap-btn-danger ap-btn-sm"
                          onClick={() => {
                            const copy = editingItem.images.filter((_, i) => i !== idx);
                            setEditingItem({ ...editingItem, images: copy });
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {(!editingItem.images || editingItem.images.length === 0) && (
                      <span className="ap-input-hint">No extra sub-links. The main image will be used.</span>
                    )}
                  </div>
                </div>

                {/* ── Credits Manager Table ── */}
                <div className="ap-form-group full-width">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="ap-label">Project Credits</label>
                    <button
                      type="button"
                      className="ap-btn ap-btn-secondary ap-btn-sm"
                      onClick={() =>
                        setEditingItem({
                          ...editingItem,
                          credits: [...(editingItem.credits || []), { role: '3D Visualisation', name: 'Ali Ahmed' }],
                        })
                      }
                    >
                      + Add Credit Row
                    </button>
                  </div>

                  <div className="ap-credits-table">
                    {(editingItem.credits || []).map((credit, idx) => (
                      <div className="ap-credit-row" key={idx}>
                        {/* Role selector or write-in */}
                        <input
                          type="text"
                          className="ap-input"
                          placeholder="Role (e.g. Creative Direction)"
                          list="roles-list"
                          value={credit.role}
                          onChange={(e) => {
                            const copy = [...editingItem.credits];
                            copy[idx] = { ...copy[idx], role: e.target.value };
                            setEditingItem({ ...editingItem, credits: copy });
                          }}
                          style={{ maxWidth: '240px' }}
                        />
                        {/* Name */}
                        <input
                          type="text"
                          className="ap-input"
                          placeholder="Name (e.g. Ali Ahmed, Blender)"
                          value={credit.name}
                          onChange={(e) => {
                            const copy = [...editingItem.credits];
                            copy[idx] = { ...copy[idx], name: e.target.value };
                            setEditingItem({ ...editingItem, credits: copy });
                          }}
                        />
                        <button
                          type="button"
                          className="ap-btn ap-btn-danger ap-btn-sm"
                          onClick={() => {
                            const copy = editingItem.credits.filter((_, i) => i !== idx);
                            setEditingItem({ ...editingItem, credits: copy });
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <datalist id="roles-list">
                      {COMMON_ROLES.map((r) => (
                        <option key={r} value={r} />
                      ))}
                    </datalist>
                  </div>
                </div>

                {/* ── Live Preview Card ── */}
                <div className="ap-preview-box full-width">
                  <span className="ap-preview-label">Live Preview</span>
                  <div className="ap-preview-card-wrap">
                    <div className="ap-card">
                      <div className="ap-card-thumb-wrap" style={{ background: editingItem.bg || '#111' }}>
                        {editingItem.img ? (
                          <img src={editingItem.img} alt={editingItem.label} className="ap-card-thumb" />
                        ) : (
                          <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>Enter image URL</div>
                        )}
                        <div className="ap-card-badges">
                          <span className="ap-badge ap-badge-type">{editingItem.type}</span>
                          <span className="ap-badge ap-badge-aspect">{editingItem.aspect}</span>
                        </div>
                      </div>
                      <div className="ap-card-body">
                        <span className="ap-card-cat">{editingItem.cat}</span>
                        <h4 className="ap-card-title">{editingItem.label || 'Project Title'}</h4>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="ap-modal-foot">
                <button type="button" className="ap-btn ap-btn-secondary" onClick={() => setEditingItem(null)}>
                  Cancel
                </button>
                <button type="submit" className="ap-btn ap-btn-primary">
                  {isNew ? 'Create Project' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── CATEGORY MANAGER MODAL ────────────────────────────────────────────── */}
      {showCategoryModal && (
        <div className="ap-modal-backdrop" onClick={() => setShowCategoryModal(false)}>
          <div className="ap-modal" style={{ maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>
            <div className="ap-modal-head">
              <h2 className="ap-modal-title">Manage Categories</h2>
              <button className="ap-btn ap-btn-secondary ap-btn-sm" onClick={() => setShowCategoryModal(false)}>
                ✕
              </button>
            </div>

            <div className="ap-modal-body">
              {/* Add category form */}
              <form onSubmit={handleAddCategory} style={{ display: 'flex', gap: '0.6rem' }}>
                <input
                  type="text"
                  className="ap-input"
                  placeholder="New category name..."
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                />
                <button type="submit" className="ap-btn ap-btn-primary">
                  Add
                </button>
              </form>

              {/* Categories list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.5rem' }}>
                {categories.map((cat) => {
                  const count = cat === 'All' ? items.length : items.filter((i) => i.cat === cat).length;
                  return (
                    <div
                      key={cat}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.65rem 1rem',
                        background: '#17171e',
                        borderRadius: '8px',
                        border: '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      <div>
                        <strong style={{ color: '#fff', fontSize: '0.9rem' }}>{cat}</strong>
                        <span style={{ marginLeft: '0.6rem', color: '#888', fontSize: '0.78rem' }}>({count} projects)</span>
                      </div>
                      {cat !== 'All' && (
                        <button
                          type="button"
                          className="ap-btn ap-btn-danger ap-btn-sm"
                          onClick={() => handleDeleteCategory(cat)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="ap-modal-foot">
              <button className="ap-btn ap-btn-secondary" onClick={() => setShowCategoryModal(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast Message ── */}
      {toastMessage && (
        <div className={`ap-toast${toastIsError ? ' ap-toast-error' : ''}`}>
          {toastIsError ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
