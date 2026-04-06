"use client";

import React from "react";

export default function MacBookHero() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,700&family=Sora:wght@300;400;500&display=swap');

        *, *::before, *::after {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        .hero-page {
          width: 100%;
          height: 100vh;
          background: #FAFAF8;
          overflow: hidden;
        }

        /* NAV BAR */
        .nav-bar {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 48px;
          background: #FAFAF8;
          border-bottom: 1px solid #E8E8E4;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 40px;
          z-index: 100;
        }

        .nav-bar::after {
          content: '';
          position: absolute;
          bottom: -2px;
          left: 0;
          right: 0;
          height: 1px;
          background: #C9A96E;
          opacity: 0.4;
        }

        .nav-logo {
          font-family: 'Sora', sans-serif;
          font-size: 18px;
          font-weight: 500;
          color: #0A0A0A;
          letter-spacing: -0.02em;
        }

        .nav-links {
          display: flex;
          gap: 40px;
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
        }

        .nav-link {
          font-family: 'Sora', sans-serif;
          font-size: 11px;
          font-weight: 300;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #6B6B6B;
          text-decoration: none;
          position: relative;
          transition: color 250ms ease;
        }

        .nav-link::after {
          content: '';
          position: absolute;
          bottom: -4px;
          left: 0;
          width: 100%;
          height: 2px;
          background: #C9A96E;
          transform: scaleX(0);
          transform-origin: left;
          transition: transform 250ms ease;
        }

        .nav-link:hover {
          color: #0A0A0A;
        }

        .nav-link:hover::after {
          transform: scaleX(1);
        }

        .nav-icons {
          display: flex;
          gap: 24px;
          align-items: center;
        }

        .nav-icon {
          color: #6B6B6B;
          cursor: pointer;
          transition: color 200ms ease;
        }

        .nav-icon:hover {
          color: #0A0A0A;
        }

        /* HERO GRID */
        .hero-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          height: calc(100vh - 48px);
          margin-top: 48px;
        }

        /* LEFT COLUMN */
        .content-panel {
          background: #FAFAF8;
          padding: 80px 64px 80px 80px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          position: relative;
        }

        .eyebrow-tag {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: 1px solid #E8E8E4;
          border-radius: 999px;
          padding: 4px 12px;
          width: fit-content;
        }

        .eyebrow-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #C9A96E;
          animation: pulse 2s infinite ease-in-out;
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.3); }
        }

        .eyebrow-text {
          font-family: 'Sora', sans-serif;
          font-size: 10px;
          font-weight: 400;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #6B6B6B;
        }

        .hero-headline {
          font-family: 'Playfair Display', serif;
          font-weight: 700;
          font-style: italic;
          font-size: clamp(64px, 8vw, 120px);
          line-height: 0.95;
          letter-spacing: -0.02em;
          color: #0A0A0A;
          margin-top: 24px;
        }

        .hero-word {
          display: inline-block;
          opacity: 0;
          animation: fadeUp 600ms ease-out forwards;
        }

        .hero-word:nth-child(1) { animation-delay: 0ms; }
        .hero-word:nth-child(2) { animation-delay: 120ms; }

        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .gold-line {
          width: 48px;
          height: 1px;
          background: #C9A96E;
          margin: 20px 0;
        }

        .tagline {
          font-family: 'Sora', sans-serif;
          font-weight: 300;
          font-size: 15px;
          line-height: 1.8;
          color: #6B6B6B;
        }

        .stat-row {
          display: flex;
          gap: 8px;
          margin-top: 32px;
        }

        .stat-chip {
          display: flex;
          align-items: center;
          gap: 8px;
          border: 1px solid #E8E8E4;
          border-radius: 6px;
          padding: 8px 14px;
          transition: border-color 200ms ease;
        }

        .stat-chip:hover {
          border-color: #C9A96E;
        }

        .stat-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #C9A96E;
        }

        .stat-label {
          font-family: 'Sora', sans-serif;
          font-size: 10px;
          font-weight: 400;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #6B6B6B;
        }

        .cta-row {
          display: flex;
          gap: 12px;
          margin-top: 40px;
        }

        .btn-primary {
          background: #0A0A0A;
          color: #FAFAF8;
          border: none;
          border-radius: 999px;
          padding: 13px 32px;
          font-family: 'Sora', sans-serif;
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 300ms ease;
        }

        .btn-primary:hover {
          background: #C9A96E;
          color: #0A0A0A;
          transform: translateY(-1px);
          box-shadow: 0 4px 20px rgba(0,0,0,0.08);
        }

        .btn-secondary {
          background: transparent;
          color: #0A0A0A;
          border: 1px solid #0A0A0A;
          border-radius: 999px;
          padding: 13px 32px;
          font-family: 'Sora', sans-serif;
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 300ms ease;
        }

        .btn-secondary:hover {
          border-color: #C9A96E;
          color: #C9A96E;
          transform: translateY(-1px);
          box-shadow: 0 4px 20px rgba(0,0,0,0.08);
        }

        .metadata-row {
          position: absolute;
          bottom: 40px;
          left: 80px;
          display: flex;
          gap: 8px;
          font-family: 'Sora', sans-serif;
          font-size: 10px;
          color: #9B9B9B;
        }

        .metadata-item {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .metadata-separator {
          color: #9B9B9B;
        }

        /* RIGHT COLUMN */
        .image-panel {
          background: #F0EFE9;
          position: relative;
          overflow: hidden;
        }

        .hero-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
        }

        .image-overlay {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at center, transparent 0%, rgba(240,239,233,0.3) 100%);
          pointer-events: none;
        }

        .product-label {
          position: absolute;
          bottom: 24px;
          right: 24px;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 2px;
        }

        .product-name {
          font-family: 'Sora', sans-serif;
          font-size: 10px;
          font-weight: 400;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #0A0A0A;
        }

        .product-specs {
          font-family: 'Sora', sans-serif;
          font-size: 10px;
          font-weight: 300;
          color: #9B9B9B;
        }

        /* RESPONSIVE */
        @media (max-width: 1024px) {
          .hero-grid {
            grid-template-columns: 1fr;
            grid-template-rows: 1fr 1fr;
          }

          .content-panel {
            padding: 60px 40px;
            order: 1;
          }

          .image-panel {
            order: 0;
          }

          .metadata-row {
            position: relative;
            bottom: auto;
            left: auto;
            margin-top: 40px;
          }
        }

        @media (max-width: 640px) {
          .nav-links {
            display: none;
          }

          .content-panel {
            padding: 40px 24px;
          }

          .stat-row {
            flex-wrap: wrap;
          }

          .cta-row {
            flex-direction: column;
          }

          .btn-primary,
          .btn-secondary {
            width: 100%;
            text-align: center;
          }
        }
      `}</style>

      <div className="hero-page">
        {/* NAV BAR */}
        <nav className="nav-bar">
          <div className="nav-logo">M</div>
          <div className="nav-links">
            <a href="#" className="nav-link">Mac</a>
            <a href="#" className="nav-link">iPad</a>
            <a href="#" className="nav-link">iPhone</a>
            <a href="#" className="nav-link">Watch</a>
            <a href="#" className="nav-link">Support</a>
          </div>
          <div className="nav-icons">
            <svg className="nav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <svg className="nav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
              <path d="M3 6h18" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
          </div>
        </nav>

        {/* HERO GRID */}
        <div className="hero-grid">
          {/* LEFT COLUMN */}
          <div className="content-panel">
            <div className="eyebrow-tag">
              <span className="eyebrow-dot" />
              <span className="eyebrow-text">New — M4 Chip</span>
            </div>

            <h1 className="hero-headline">
              <span className="hero-word">MacBook</span>
              <br />
              <span className="hero-word">Air</span>
            </h1>

            <div className="gold-line" />

            <p className="tagline">Lean. Mean. Powerfully thin.</p>

            <div className="stat-row">
              <div className="stat-chip">
                <span className="stat-dot" />
                <span className="stat-label">M4 Chip</span>
              </div>
              <div className="stat-chip">
                <span className="stat-dot" />
                <span className="stat-label">Up to 32GB</span>
              </div>
              <div className="stat-chip">
                <span className="stat-dot" />
                <span className="stat-label">18hr Battery</span>
              </div>
            </div>

            <div className="cta-row">
              <button className="btn-primary">Explore</button>
              <button className="btn-secondary">Buy Now</button>
            </div>

            <div className="metadata-row">
              <span className="metadata-item">Starting at $1,099</span>
              <span className="metadata-separator">·</span>
              <span className="metadata-item">Free shipping</span>
              <span className="metadata-separator">·</span>
              <span className="metadata-item">14-day returns</span>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="image-panel">
            <img
              src="https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=1200&h=1600&fit=crop&q=90"
              alt="MacBook Air laptop on minimal desk"
              className="hero-image"
            />
            <div className="image-overlay" />
            <div className="product-label">
              <span className="product-name">MacBook Air</span>
              <span className="product-specs">15-inch · M4</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
