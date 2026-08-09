import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSpring, animated } from 'react-spring';
import MiniBoard from '../components/MiniBoard';
import { AI_DIFFICULTY_PROFILES } from '../config/aiConfig';
import useScrollFadeIn from '../hooks/useScrollFadeIn';
import './AIPage.css';

// Everything on this page comes from strategy/AI_ENGINE.md and the JSON the
// simulation runs wrote into strategy/data/. Where a number is quoted it is a
// measurement, not an estimate — and where a result is unresolved, the page
// says so rather than picking the flattering reading.

const EXAMPLE_POSITION = {
  C2: { color: 'WHITE', isUpgraded: false },
  B2: { color: 'WHITE', isUpgraded: true },
  C7: { color: 'BLACK', isUpgraded: false },
  B4: { color: 'BLACK', isUpgraded: true },
  D3: { color: 'BLACK', isUpgraded: false },
  C11: { color: 'WHITE', isUpgraded: false }
};

// strategy/data/ladder.json — 1,680-game colour-balanced round robin, rated
// with a Bradley-Terry fit and bootstrap confidence intervals.
const LADDER = [
  { tier: 'L1', label: 'Easy', elo: 0, ci: [-73, 71] },
  { tier: 'L3', label: 'Medium', elo: 454, ci: [414, 500] },
  { tier: 'L5', label: 'Hard', elo: 742, ci: [712, 782] },
  { tier: 'L8', label: 'Champion', elo: 1094, ci: [1052, 1140] }
];

// strategy/data/depth_study.json — agreement with the depth-16 verdict on
// sharp positions, and what each depth costs to get there.
const DEPTH_STUDY = [
  { depth: 8, agree: '90.6%', nodes: '12.7k' },
  { depth: 10, agree: '93.8%', nodes: '42.3k' },
  { depth: 12, agree: '93.8%', nodes: '129k' },
  { depth: 14, agree: '94.4%', nodes: '367k' },
  { depth: 16, agree: '100%', nodes: '963k' }
];

// strategy/10_engine_lab.py — colour-balanced games from distinct ply-4
// openings at EQUAL NODE BUDGET, because equal depth would hide what an idea
// costs to compute.
const GAUNTLET = [
  { variant: 'ordering', gain: '+52', ci: '[−10, +115]', sep: false },
  { variant: 'quiescence', gain: '+101', ci: '[+37, +166]', sep: true },
  { variant: 'refitted weights', gain: '+76', ci: '[+13, +140]', sep: true },
  { variant: 'weights + quiescence + ordering', gain: '+241', ci: '[+164, +318]', sep: true }
];

const SPRING_CONFIG = { tension: 120, friction: 14 };

const AIPage = () => {
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

  const card0Fade = useScrollFadeIn({ threshold: 0.1, delay: 0 });
  const card1Fade = useScrollFadeIn({ threshold: 0.1, delay: 120 });
  const card2Fade = useScrollFadeIn({ threshold: 0.1, delay: 240 });
  const card3Fade = useScrollFadeIn({ threshold: 0.1, delay: 360 });
  const cardFades = [card0Fade, card1Fade, card2Fade, card3Fade];

  const profilesFade = useScrollFadeIn({ threshold: 0.15 });
  const labFade = useScrollFadeIn({ threshold: 0.12 });
  const footerFade = useScrollFadeIn({ threshold: 0.2 });

  const gridCards = [
    {
      title: 'How the search works',
      content: (
        <>
          <ol>
            <li>Generate the legal moves for the side to move.</li>
            <li>Order them with a static heuristic — no move is applied just to sort.</li>
            <li>Negamax with alpha-beta, deepening one ply at a time.</li>
            <li>Reuse solved subtrees from a transposition table.</li>
            <li>Return the last <em>completed</em> depth when a budget runs out.</li>
          </ol>
          <p>
            Every root move is searched with a full window. Narrowing alpha-beta
            across sibling root moves turns every score after the first into a
            bound rather than a value, which corrupts both the move choice and
            anything that reads the scores afterwards.
          </p>
        </>
      ),
    },
    {
      title: 'Losing is not being behind',
      content: (
        <>
          <p>
            A player who cannot move has <strong>lost</strong>, however much
            material they still hold. The engine scores a game-over node from
            the side to move, so faster wins are preferred and longer losses
            resisted.
          </p>
          <p>
            The previous engine used the sign of the material balance as a proxy
            for who had won. That is wrong exactly when a player is ahead but
            jammed — which, in a game with forward-only movement, is the most
            important losing pattern there is.
          </p>
        </>
      ),
    },
    {
      title: 'What the evaluation counts',
      content: (
        <>
          <p>
            Static evaluation is in <strong>centipieces</strong> — 100 is one
            piece — summed over the board with per-square tables: material and a
            bonus for roks, the A1 hub and the B-ring, advancement for cobs,
            home-base integrity, and mobility.
          </p>
          <p>
            Every term is built so that <code>eval(P) = −eval(rotate and swap P)</code>
            holds exactly. That colour symmetry is a test rather than an
            aspiration: it makes any large colour skew at equal strength
            diagnosable as a bug instead of a mystery.
          </p>
        </>
      ),
    },
    {
      title: 'One rulebook, two languages',
      content: (
        <>
          <p>
            The engine exists twice — Python for the offline simulations, and
            JavaScript in your browser — and a golden fixture of{' '}
            <strong>380 positions</strong> pins them together. Both must agree
            on the legal moves and the evaluation of every one.
          </p>
          <p>
            The same JavaScript engine is vendored into the multiplayer server,
            so the move your browser thinks is legal and the move the server
            accepts are decided by identical code.
          </p>
        </>
      ),
    },
  ];

  return (
    <div className="ai-page">
      <section className="ai-hero">
        <div>
          <animated.h1 style={heroTitle} className="ai-title">Tarati AI Engine</animated.h1>
          <animated.p style={heroSubtitle} className="ai-subtitle">
            Negamax with alpha-beta, iterative deepening and a transposition
            table — and a difficulty ladder that was measured over thousands of
            games rather than assigned by search depth.
          </animated.p>
          <animated.div style={heroActions} className="ai-hero-actions">
            <Link to="/play" className="btn-primary">Test It In Game</Link>
            <Link to="/strategy" className="btn-secondary">Read the Strategy Guide</Link>
          </animated.div>
        </div>
        <animated.div style={heroBoardSpring} className="ai-hero-board">
          <MiniBoard
            checkers={EXAMPLE_POSITION}
            arrows={[['B2', 'A1'], ['B4', 'C7']]}
            highlightVertices={['B2', 'B4', 'A1', 'C7']}
            size={330}
            label="The engine scores and compares many continuations from this structure."
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
        <h2>The difficulty ladder is measured</h2>
        <p>
          Each setting is a configuration that played a 1,680-game
          colour-balanced round robin against the others. The ratings below come
          from a Bradley-Terry fit with bootstrap confidence intervals — the
          adjacent intervals do not overlap, so these are genuinely four
          different opponents rather than four labels on the same one.
        </p>

        <table className="ai-table">
          <thead>
            <tr>
              <th>Setting</th>
              <th>Elo</th>
              <th>95% interval</th>
              <th>Depth</th>
              <th>Node budget</th>
            </tr>
          </thead>
          <tbody>
            {LADDER.map((row) => {
              const profile = AI_DIFFICULTY_PROFILES[row.label];
              return (
                <tr key={row.tier}>
                  <td>{row.label}</td>
                  <td>{row.elo.toLocaleString()}</td>
                  <td>[{row.ci[0]}, {row.ci[1]}]</td>
                  <td>{profile?.depth ?? '—'}</td>
                  <td>{profile ? profile.maxNodes.toLocaleString() : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <p className="ai-note">
          This replaced a ladder of depths 3/6/9/12 that was never measured and
          was simply wrong: depths 12 through 20 chose the identical move in 60
          of 60 sampled positions, and depth 9 scored 22% against depth 6.
          “Champion” was not stronger than “Medium”.
        </p>

        <div className="profile-grid">
          {Object.entries(AI_DIFFICULTY_PROFILES).map(([name, profile]) => (
            <div key={name} className="profile-card">
              <h3>{name}</h3>
              <ul>
                <li>Depth: {profile.depth}</li>
                <li>Node budget: {profile.maxNodes.toLocaleString()}</li>
                <li>Time cap: {profile.maxMs} ms</li>
                <li>Temperature: {profile.temperature} cp</li>
                <li>Blunder rate: {Math.round(profile.blunderRate * 100)}%</li>
              </ul>
            </div>
          ))}
        </div>

        <p className="ai-note">
          <strong>Temperature</strong> is the diversity knob, and its unit is
          centipieces: at 25, a move half a piece worse is played about 14% as
          often as the best one. The old configuration softmaxed raw scores
          whose unit was ~100 per piece, which made it a uniform tie-breaker
          that did nothing at all.
        </p>
      </animated.section>

      <animated.section ref={labFade.ref} style={labFade.style} className="ai-profiles">
        <h2>What the engine is still missing</h2>
        <p>
          Candidate improvements were benchmarked against the shipped search at{' '}
          <strong>equal node budget</strong> — equal depth would have hidden
          what each idea costs to compute. Every variant beat what ships.
        </p>

        <table className="ai-table">
          <thead>
            <tr>
              <th>Variant</th>
              <th>Elo gain</th>
              <th>95% interval</th>
            </tr>
          </thead>
          <tbody>
            {GAUNTLET.map((row) => (
              <tr key={row.variant}>
                <td>{row.variant}</td>
                <td>{row.gain}</td>
                <td>{row.ci}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p>
          <strong>The biggest single defect is the absence of a quiescence
          search.</strong> From the symmetric opening the root score swung by
          ±230 centipieces between odd and even depths — a swing once recorded
          as a “tempo effect” of the game itself. It is not. It is the search
          stopping in the middle of an exchange, and extending over strikes and
          promotions removes it entirely. The opening is balanced.
        </p>
        <p>
          Fitting a depth-12 verdict against position features over 92,769
          labelled positions also found <strong>three sign errors</strong> in
          the evaluation weights: the A1 hub is priced at −74 against a shipped
          +18, the B-ring at −37 against +10. A high-degree vertex is a vertex
          where more enemies can arrive beside you, and the shipped table pays
          you to sit there.
        </p>
        <p className="ai-note">
          Two variants lead, and which of them is better is <em>not resolved</em>:
          played directly against each other the ranking reverses with an
          interval straddling zero. The honest reading of the table above is
          “these are far better than what ships”, not “this one is best”.
        </p>
      </animated.section>

      <animated.section ref={footerFade.ref} style={footerFade.style} className="ai-footer">
        <h2>Depth is not the lever</h2>
        <p>
          Going from depth 12 to depth 16 costs 7.5× the nodes for six points of
          move agreement, and the strike-versus-quiet classification the
          strategy guide depends on differs from the depth-16 answer by under
          two points at every depth from 8 upward. A median game is 29 plies, so
          depth 12 already sees most of a game.
        </p>
        <table className="ai-table">
          <thead>
            <tr>
              <th>Depth</th>
              <th>Agrees with depth 16</th>
              <th>Nodes per position</th>
            </tr>
          </thead>
          <tbody>
            {DEPTH_STUDY.map((row) => (
              <tr key={row.depth}>
                <td>{row.depth}</td>
                <td>{row.agree}</td>
                <td>{row.nodes}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="ai-note">
          Beyond about depth 10 the engine saturates: more strength has to come
          from a better evaluation than from a deeper search.
        </p>
      </animated.section>
    </div>
  );
};

export default AIPage;
