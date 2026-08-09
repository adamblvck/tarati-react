import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSpring, animated } from 'react-spring';
import MiniBoard from '../components/MiniBoard';
import { AI_DIFFICULTY_PROFILES } from '../config/aiConfig';
import useScrollFadeIn from '../hooks/useScrollFadeIn';
import './AIPage.css';

const EXAMPLE_POSITION = {
  C2: { color: 'WHITE', isUpgraded: false },
  B2: { color: 'WHITE', isUpgraded: true },
  C7: { color: 'BLACK', isUpgraded: false },
  B4: { color: 'BLACK', isUpgraded: true },
  D3: { color: 'BLACK', isUpgraded: false },
  C11: { color: 'WHITE', isUpgraded: false }
};

const complexityBars = [
  { label: 'Easy', value: 20 },
  { label: 'Medium', value: 45 },
  { label: 'Hard', value: 72 },
  { label: 'Champion', value: 100 }
];

const budgetBars = [
  { label: 'Easy', value: 12 },
  { label: 'Medium', value: 30 },
  { label: 'Hard', value: 60 },
  { label: 'Champion', value: 90 }
];

const signalRows = [
  { metric: 'Material + upgrade balance', weight: 'High', notes: 'Core static board value at leaf nodes.' },
  { metric: 'Move ordering quick score', weight: 'High', notes: 'Sorts likely good lines first for alpha-beta cuts.' },
  { metric: 'Transposition cache hits', weight: 'Medium', notes: 'Reuses already solved subtrees within a search.' },
  { metric: 'Root stochastic top-k', weight: 'Medium', notes: 'Adds variety while staying near best lines.' }
];

const SPRING_CONFIG = { tension: 120, friction: 14 };

const AIPage = () => {
  // ── Hero entrance (triggers once on mount) ──
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const heroTitle = useSpring({
    opacity: mounted ? 1 : 0,
    transform: mounted ? 'translateY(0px)' : 'translateY(20px)',
    delay: 100,
    config: SPRING_CONFIG,
  });

  const heroSubtitle = useSpring({
    opacity: mounted ? 1 : 0,
    transform: mounted ? 'translateY(0px)' : 'translateY(16px)',
    delay: 250,
    config: SPRING_CONFIG,
  });

  const heroActions = useSpring({
    opacity: mounted ? 1 : 0,
    transform: mounted ? 'translateY(0px)' : 'translateY(12px)',
    delay: 400,
    config: SPRING_CONFIG,
  });

  const heroBoardSpring = useSpring({
    opacity: mounted ? 1 : 0,
    transform: mounted ? 'scale(1)' : 'scale(0.94)',
    delay: 300,
    config: { tension: 80, friction: 18 },
  });

  // ── Scroll-triggered fade-ins for grid cards (staggered) ──
  const card0Fade = useScrollFadeIn({ threshold: 0.1, delay: 0 });
  const card1Fade = useScrollFadeIn({ threshold: 0.1, delay: 120 });
  const card2Fade = useScrollFadeIn({ threshold: 0.1, delay: 240 });
  const card3Fade = useScrollFadeIn({ threshold: 0.1, delay: 360 });
  const cardFades = [card0Fade, card1Fade, card2Fade, card3Fade];

  const profilesFade = useScrollFadeIn({ threshold: 0.15 });
  const footerFade = useScrollFadeIn({ threshold: 0.2 });

  // Card content — keeps JSX clean
  const gridCards = [
    {
      title: 'How Search Works',
      content: (
        <ol>
          <li>Generate legal moves for the current side.</li>
          <li>Sort candidates using a fast heuristic.</li>
          <li>Run minimax with alpha-beta pruning.</li>
          <li>Cache solved states in a transposition table.</li>
          <li>At root, round-robin probe each move when budgets are active.</li>
          <li>Return best move, or weighted top-k when randomization is enabled.</li>
        </ol>
      ),
    },
    {
      title: 'Complexity Pressure',
      content: (
        <>
          <p>
            Higher difficulty has deeper horizons and larger branch pressure.
            Without budgets, the tree can explode. With budgets, the engine remains responsive.
          </p>
          <div className="bar-chart">
            {complexityBars.map((bar) => (
              <div key={bar.label} className="bar-row">
                <span>{bar.label}</span>
                <div className="bar-track">
                  <div className="bar-fill red" style={{ width: `${bar.value}%` }} />
                </div>
                <strong>{bar.value}%</strong>
              </div>
            ))}
          </div>
        </>
      ),
    },
    {
      title: 'Budget Utilization',
      content: (
        <>
          <p>
            Each difficulty profile controls search effort using `max_ms`, `max_nodes`,
            and `root_probe_nodes`, preventing long turn stalls.
          </p>
          <div className="bar-chart">
            {budgetBars.map((bar) => (
              <div key={bar.label} className="bar-row">
                <span>{bar.label}</span>
                <div className="bar-track">
                  <div className="bar-fill blue" style={{ width: `${bar.value}%` }} />
                </div>
                <strong>{bar.value}%</strong>
              </div>
            ))}
          </div>
        </>
      ),
    },
    {
      title: 'Scoring Signals',
      content: (
        <table className="ai-table">
          <thead>
            <tr>
              <th>Signal</th>
              <th>Influence</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            {signalRows.map((row) => (
              <tr key={row.metric}>
                <td>{row.metric}</td>
                <td>{row.weight}</td>
                <td>{row.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ),
    },
  ];

  return (
    <div className="ai-page">
      <section className="ai-hero">
        <div>
          <animated.h1 style={heroTitle} className="ai-title">Tarati AI Engine</animated.h1>
          <animated.p style={heroSubtitle} className="ai-subtitle">
            A depth-first strategist with modern safeguards:
            alpha-beta pruning, transposition reuse, and strict move-time budgets.
          </animated.p>
          <animated.div style={heroActions} className="ai-hero-actions">
            <Link to="/play" className="btn-primary">Test It In Game</Link>
            <Link to="/rules" className="btn-secondary">Review Rules</Link>
          </animated.div>
        </div>
        <animated.div style={heroBoardSpring} className="ai-hero-board">
          <MiniBoard
            checkers={EXAMPLE_POSITION}
            arrows={[['B2', 'A1'], ['B4', 'C7']]}
            highlightVertices={['B2', 'B4', 'A1', 'C7']}
            size={330}
            label="The AI scores and compares many continuations from this structure."
          />
        </animated.div>
      </section>

      <section className="ai-grid">
        {gridCards.map((card, i) => (
          <animated.article
            key={card.title}
            ref={cardFades[i].ref}
            style={cardFades[i].style}
            className="ai-card"
          >
            <h2>{card.title}</h2>
            {card.content}
          </animated.article>
        ))}
      </section>

      <animated.section ref={profilesFade.ref} style={profilesFade.style} className="ai-profiles">
        <h2>Default Difficulty Profiles</h2>
        <p>
          These are loaded from app config and can be changed in the Play UI.
          Empty `max_ms` or `max_nodes` means unrestricted for that limit.
        </p>
        <div className="profile-grid">
          {Object.entries(AI_DIFFICULTY_PROFILES).map(([name, profile]) => (
            <div key={name} className="profile-card">
              <h3>{name}</h3>
              <ul>
                <li>Depth: {profile.depth}</li>
                <li>Max ms: {profile.maxMs ?? 'none'}</li>
                <li>Max nodes: {profile.maxNodes ?? 'none'}</li>
                <li>Temperature: {profile.temperature}</li>
                <li>Top-k: {profile.stochasticTopK}</li>
              </ul>
            </div>
          ))}
        </div>
      </animated.section>

      <animated.section ref={footerFade.ref} style={footerFade.style} className="ai-footer">
        <h2>Why this design?</h2>
        <p>
          It keeps the strategic flavor of deep minimax while behaving like a modern interactive system:
          graceful under pressure, configurable for experimentation, and deterministic enough to study.
        </p>
      </animated.section>
    </div>
  );
};

export default AIPage;
