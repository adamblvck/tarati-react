import React from 'react';
import { Link } from 'react-router-dom';
import MiniBoard from '../components/MiniBoard';
import './LandingPage.css';

// Initial board state for the hero illustration
const INITIAL_CHECKERS = {
  'C1': { color: 'WHITE', isUpgraded: false },
  'C2': { color: 'WHITE', isUpgraded: false },
  'D1': { color: 'WHITE', isUpgraded: false },
  'D2': { color: 'WHITE', isUpgraded: false },
  'C7': { color: 'BLACK', isUpgraded: false },
  'C8': { color: 'BLACK', isUpgraded: false },
  'D3': { color: 'BLACK', isUpgraded: false },
  'D4': { color: 'BLACK', isUpgraded: false },
};

const LandingPage = () => {
  return (
    <div className="landing">
      {/* ───── Hero ───── */}
      <section className="hero">
        <div className="hero-text">
          <p className="hero-subtitle">A board game by</p>
          <h1 className="hero-title">
            George Spencer Brown's
          </h1>
          <h2 className="hero-game-name">Tarati</h2>
          <p className="hero-description">
            An ancient-modern game of distinction.<br />
            Two players. Four pawns each. One board of elegant geometry.
          </p>
          <div className="hero-actions">
            <Link to="/play" className="btn-primary">
              Play Now
            </Link>
            <Link to="/rules" className="btn-secondary">
              Learn the Rules
            </Link>
          </div>
        </div>
        <div className="hero-board">
          <MiniBoard checkers={INITIAL_CHECKERS} size={340} />
        </div>
      </section>

      {/* ───── About ───── */}
      <section className="about-section">
        <div className="about-content">
          <h2 className="section-heading">The Game</h2>
          <p>
            Tarati has a little bit of checkers and chess to its feel.
            Two players with four pawns each start at opposite ends of the board,
            at their domestic positions. Pawns advance forward, flipping adjacent
            opponents upon landing. Reach the far side to upgrade your pawn, granting
            it a single omni-directional move.
          </p>
          <p>
            Simple rules, deep strategy. Every move creates cascading consequences
            across the board's concentric geometry.
          </p>
        </div>
      </section>

      {/* ───── Symbolic Correspondences ───── */}
      <section className="symbols-section">
        <h2 className="section-heading">Symbolic Structure</h2>
        <p className="symbols-intro">
          Tarati's board encodes a rich symbolic architecture&mdash;a microcosm
          of celestial and alchemical correspondences.
        </p>
        <div className="symbols-grid">
          <div className="symbol-card">
            <div className="symbol-number">4</div>
            <div className="symbol-label">Pawns per Player</div>
            <div className="symbol-desc">The four elements</div>
          </div>
          <div className="symbol-card">
            <div className="symbol-number">12</div>
            <div className="symbol-label">Circumference</div>
            <div className="symbol-desc">Zodiac &middot; Months of the year</div>
          </div>
          <div className="symbol-card">
            <div className="symbol-number">6</div>
            <div className="symbol-label">Boundary</div>
            <div className="symbol-desc">Hermetic planetary concepts</div>
          </div>
          <div className="symbol-card">
            <div className="symbol-number">1</div>
            <div className="symbol-label">Absolute Middle</div>
            <div className="symbol-desc">The Sun &middot; Tiphareth</div>
          </div>
        </div>
      </section>

      {/* ───── Laws of Form ───── */}
      <section className="lof-section">
        <div className="lof-content">
          <h2 className="section-heading">Laws of Form</h2>
          <p>
            Tarati was designed by <strong>George Spencer Brown</strong>, the author
            of <em>Laws of Form</em>&mdash;a foundational work introducing
            the Calculus of Distinction, a mathematically complete corpus for
            notation and calculation with distinctions.
          </p>
          <div className="lof-links">
            <a href="https://youtu.be/UqMl_Wb04nU?si=QWULIQchBawuJr3o" target="_blank" rel="noreferrer">
              Video by Louis Kauffman
            </a>
            <a href="https://www.youtube.com/watch?v=OnHrvFfeQ3g&list=PLl8xLayCI7YcFU3huTvSPC11xBFioxtpo" target="_blank" rel="noreferrer">
              2019 LoF Conference
            </a>
            <a href="https://www.youtube.com/watch?v=VvHYDjkp9Qc&list=PLoK3NtWr5NbqEOdjQrWaq1sDweF7NJ5NB" target="_blank" rel="noreferrer">
              LoF Mini Course
            </a>
          </div>
        </div>
      </section>

      {/* ───── CTA ───── */}
      <section className="cta-section">
        <h2 className="cta-heading">Ready to Play?</h2>
        <p>Challenge the AI or study the rules first.</p>
        <div className="hero-actions">
          <Link to="/play" className="btn-primary">
            Start a Game
          </Link>
          <Link to="/rules" className="btn-secondary">
            Read the Rules
          </Link>
        </div>
      </section>

      {/* ───── Footer ───── */}
      <footer className="landing-footer">
        <p>
          By Adam Blvck &middot;{' '}
          <a href="https://adamblvck.com" target="_blank" rel="noreferrer">
            adamblvck.com
          </a>
        </p>
      </footer>
    </div>
  );
};

export default LandingPage;
