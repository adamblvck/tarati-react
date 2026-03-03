import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSpring, animated } from 'react-spring';
import MiniBoard from '../components/MiniBoard';
import useScrollFadeIn from '../hooks/useScrollFadeIn';
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

// Symbolic data — extracted for cleanliness
const SYMBOLS = [
  { number: '4', label: 'Pawns per Player', desc: 'The four elements' },
  { number: '12', label: 'Circumference', desc: 'Zodiac · Months of the year' },
  { number: '6', label: 'Boundary', desc: 'Hermetic planetary concepts' },
  { number: '1', label: 'Absolute Middle', desc: 'The Sun · Tiphareth' },
];

const SPRING_CONFIG = { tension: 120, friction: 14 };

const LandingPage = () => {
  // ── Hero entrance (triggers once on mount) ──
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const heroSubtitle = useSpring({
    opacity: mounted ? 1 : 0,
    transform: mounted ? 'translateY(0px)' : 'translateY(20px)',
    delay: 100,
    config: SPRING_CONFIG,
  });

  const heroTitle = useSpring({
    opacity: mounted ? 1 : 0,
    transform: mounted ? 'translateY(0px)' : 'translateY(20px)',
    delay: 200,
    config: SPRING_CONFIG,
  });

  const heroGameName = useSpring({
    opacity: mounted ? 1 : 0,
    transform: mounted ? 'translateY(0px)' : 'translateY(20px)',
    delay: 300,
    config: SPRING_CONFIG,
  });

  const heroDesc = useSpring({
    opacity: mounted ? 1 : 0,
    transform: mounted ? 'translateY(0px)' : 'translateY(20px)',
    delay: 450,
    config: SPRING_CONFIG,
  });

  const heroActions = useSpring({
    opacity: mounted ? 1 : 0,
    transform: mounted ? 'translateY(0px)' : 'translateY(16px)',
    delay: 600,
    config: SPRING_CONFIG,
  });

  const heroBoardSpring = useSpring({
    opacity: mounted ? 1 : 0,
    transform: mounted ? 'scale(1)' : 'scale(0.92)',
    delay: 350,
    config: { tension: 80, friction: 18 },
  });

  // ── Scroll-triggered fade-ins for sections below the hero ──
  const aboutFade = useScrollFadeIn({ threshold: 0.2 });
  const symbolsHeadFade = useScrollFadeIn({ threshold: 0.15 });
  // Staggered card entrances — each hook call is static/unconditional
  const card0Fade = useScrollFadeIn({ threshold: 0.1, delay: 0 });
  const card1Fade = useScrollFadeIn({ threshold: 0.1, delay: 100 });
  const card2Fade = useScrollFadeIn({ threshold: 0.1, delay: 200 });
  const card3Fade = useScrollFadeIn({ threshold: 0.1, delay: 300 });
  const cardFades = [card0Fade, card1Fade, card2Fade, card3Fade];
  const lofFade = useScrollFadeIn({ threshold: 0.2 });
  const ctaFade = useScrollFadeIn({ threshold: 0.2 });

  return (
    <div className="landing">
      {/* ───── Hero ───── */}
      <section className="hero">
        <div className="hero-text">
          <animated.p style={heroSubtitle} className="hero-subtitle">
            A board game by
          </animated.p>
          <animated.h1 style={heroTitle} className="hero-title">
            George Spencer Brown's
          </animated.h1>
          <animated.h2 style={heroGameName} className="hero-game-name">
            Tarati
          </animated.h2>
          <animated.p style={heroDesc} className="hero-description">
            An ancient-modern game of distinction.<br />
            Two players. Four pawns each. One board of elegant geometry.
          </animated.p>
          <animated.div style={heroActions} className="hero-actions">
            <Link to="/play" className="btn-primary">
              Play Now
            </Link>
            <Link to="/rules" className="btn-secondary">
              Learn the Rules
            </Link>
          </animated.div>
          {/* Proof bar — authority signal below the fold line */}
          <animated.p style={heroActions} className="hero-proof">
            From the author of <em>Laws of Form</em>
          </animated.p>
        </div>
        <animated.div style={heroBoardSpring} className="hero-board">
          <div className="hero-board-glow" />
          <MiniBoard checkers={INITIAL_CHECKERS} size={340} />
        </animated.div>
      </section>

      {/* ───── About ───── */}
      <animated.section ref={aboutFade.ref} style={aboutFade.style} className="about-section">
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
      </animated.section>

      {/* ───── Symbolic Correspondences ───── */}
      <section className="symbols-section">
        <animated.div ref={symbolsHeadFade.ref} style={symbolsHeadFade.style}>
          <h2 className="section-heading">Symbolic Structure</h2>
          <p className="symbols-intro">
            Tarati's board encodes a rich symbolic architecture&mdash;a microcosm
            of celestial and alchemical correspondences.
          </p>
        </animated.div>
        <div className="symbols-grid">
          {SYMBOLS.map((sym, i) => (
            <animated.div
              key={sym.number}
              ref={cardFades[i].ref}
              style={cardFades[i].style}
              className="symbol-card"
            >
              <div className="symbol-number">{sym.number}</div>
              <div className="symbol-label">{sym.label}</div>
              <div className="symbol-desc">{sym.desc}</div>
            </animated.div>
          ))}
        </div>
      </section>

      {/* ───── Laws of Form ───── */}
      <animated.section ref={lofFade.ref} style={lofFade.style} className="lof-section">
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
      </animated.section>

      {/* ───── CTA ───── */}
      <animated.section ref={ctaFade.ref} style={ctaFade.style} className="cta-section">
        <h2 className="cta-heading">Your move.</h2>
        <p>Challenge the AI or explore the rules.</p>
        <div className="hero-actions">
          <Link to="/play" className="btn-primary">
            Start a Game
          </Link>
          <Link to="/rules" className="btn-secondary">
            Read the Rules
          </Link>
        </div>
      </animated.section>

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
