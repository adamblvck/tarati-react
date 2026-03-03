import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSpring, animated } from 'react-spring';
import MiniBoard from '../components/MiniBoard';
import useScrollFadeIn from '../hooks/useScrollFadeIn';
import './RulesPage.css';

// ────────────────────────────────────────────
// Board snapshots for each rule illustration
// ────────────────────────────────────────────

// 1. Starting position
const SETUP_CHECKERS = {
  'C1': { color: 'WHITE', isUpgraded: false },
  'C2': { color: 'WHITE', isUpgraded: false },
  'D1': { color: 'WHITE', isUpgraded: false },
  'D2': { color: 'WHITE', isUpgraded: false },
  'C7': { color: 'BLACK', isUpgraded: false },
  'C8': { color: 'BLACK', isUpgraded: false },
  'D3': { color: 'BLACK', isUpgraded: false },
  'D4': { color: 'BLACK', isUpgraded: false },
};

// 2. Movement - White at B1, Black at B4: showing all legal forward moves
// White at B1 forward (upward): A1, B2, B6 (C1/C2 are backward)
// Black at B4 forward (downward): A1, B3, B5 (C7/C8 are backward)
const MOVEMENT_CHECKERS = {
  'B1': { color: 'WHITE', isUpgraded: false },
  'D1': { color: 'WHITE', isUpgraded: false },
  'C1': { color: 'WHITE', isUpgraded: false },
  'B4': { color: 'BLACK', isUpgraded: false },
  'D3': { color: 'BLACK', isUpgraded: false },
  'C7': { color: 'BLACK', isUpgraded: false },
};

// 3. Striking - White at C3 moves to B2, adjacent Black at C4 flips
// B2 connects to: B1, B3, A1, C3(empty after move), C4(Black -> flips)
const STRIKE_BEFORE = {
  'C3': { color: 'WHITE', isUpgraded: false },
  'D1': { color: 'WHITE', isUpgraded: false },
  'C1': { color: 'WHITE', isUpgraded: false },
  'C4': { color: 'BLACK', isUpgraded: false },
  'C8': { color: 'BLACK', isUpgraded: false },
  'D3': { color: 'BLACK', isUpgraded: false },
  'D4': { color: 'BLACK', isUpgraded: false },
};

const STRIKE_AFTER = {
  'B2': { color: 'WHITE', isUpgraded: false },
  'D1': { color: 'WHITE', isUpgraded: false },
  'C1': { color: 'WHITE', isUpgraded: false },
  'C4': { color: 'WHITE', isUpgraded: false },
  'C8': { color: 'BLACK', isUpgraded: false },
  'D3': { color: 'BLACK', isUpgraded: false },
  'D4': { color: 'BLACK', isUpgraded: false },
};

// 4. Upgrade - White at B4 moves to C8 (Black's home base, empty) -> upgrades
// C8 connects to: C7(empty), C9(empty), B4(empty after move), D4(empty). No flips.
const UPGRADE_BEFORE = {
  'B4': { color: 'WHITE', isUpgraded: false },
  'C1': { color: 'WHITE', isUpgraded: false },
  'B1': { color: 'WHITE', isUpgraded: false },
  'C6': { color: 'BLACK', isUpgraded: false },
  'B5': { color: 'BLACK', isUpgraded: false },
};

const UPGRADE_AFTER = {
  'C8': { color: 'WHITE', isUpgraded: true },
  'C1': { color: 'WHITE', isUpgraded: false },
  'B1': { color: 'WHITE', isUpgraded: false },
  'C6': { color: 'BLACK', isUpgraded: false },
  'B5': { color: 'BLACK', isUpgraded: false },
};

// 5. Upgraded movement - an upgraded pawn can move in any direction
const UPGRADED_MOVE = {
  'B3': { color: 'WHITE', isUpgraded: true },
  'D1': { color: 'WHITE', isUpgraded: false },
  'C9': { color: 'BLACK', isUpgraded: false },
  'D3': { color: 'BLACK', isUpgraded: false },
  'B5': { color: 'BLACK', isUpgraded: false },
};

// 6. End game - all pieces same color
const ENDGAME_STATE = {
  'C3': { color: 'WHITE', isUpgraded: false },
  'B2': { color: 'WHITE', isUpgraded: false },
  'A1': { color: 'WHITE', isUpgraded: true },
  'B4': { color: 'WHITE', isUpgraded: false },
};

const SPRING_CONFIG = { tension: 120, friction: 14 };

const RulesPage = () => {
  // ── Hero entrance (triggers once on mount) ──
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const heroTitle = useSpring({
    opacity: mounted ? 1 : 0,
    transform: mounted ? 'translateY(0px)' : 'translateY(20px)',
    delay: 100,
    config: SPRING_CONFIG,
  });

  const heroIntro = useSpring({
    opacity: mounted ? 1 : 0,
    transform: mounted ? 'translateY(0px)' : 'translateY(16px)',
    delay: 250,
    config: SPRING_CONFIG,
  });

  const tocSpring = useSpring({
    opacity: mounted ? 1 : 0,
    transform: mounted ? 'translateY(0px)' : 'translateY(12px)',
    delay: 400,
    config: SPRING_CONFIG,
  });

  // ── Scroll-triggered fade-ins for each rule section ──
  const setupFade = useScrollFadeIn({ threshold: 0.15 });
  const movementFade = useScrollFadeIn({ threshold: 0.15 });
  const strikingFade = useScrollFadeIn({ threshold: 0.15 });
  const upgradingFade = useScrollFadeIn({ threshold: 0.15 });
  const upgradedMoveFade = useScrollFadeIn({ threshold: 0.15 });
  const endgameFade = useScrollFadeIn({ threshold: 0.15 });
  const ctaFade = useScrollFadeIn({ threshold: 0.2 });

  return (
    <div className="rules-page">
      {/* ── Header ── */}
      <section className="rules-hero">
        <animated.h1 style={heroTitle} className="rules-title">Rules of Tarati</animated.h1>
        <animated.p style={heroIntro} className="rules-intro">
          A complete guide to the board game by George Spencer Brown.
          Each rule is illustrated with a miniature board.
        </animated.p>
      </section>

      {/* ── Table of Contents ── */}
      <animated.nav style={tocSpring} className="rules-toc">
        <a href="#setup">Setup</a>
        <span className="toc-dot">&middot;</span>
        <a href="#movement">Movement</a>
        <span className="toc-dot">&middot;</span>
        <a href="#striking">Striking</a>
        <span className="toc-dot">&middot;</span>
        <a href="#upgrading">Upgrading</a>
        <span className="toc-dot">&middot;</span>
        <a href="#upgraded-movement">Upgraded Movement</a>
        <span className="toc-dot">&middot;</span>
        <a href="#endgame">End Game</a>
      </animated.nav>

      {/* ────────────────────────────── */}
      {/* 1. SETUP */}
      {/* ────────────────────────────── */}
      <animated.section id="setup" ref={setupFade.ref} style={setupFade.style} className="rule-section">
        <div className="rule-content">
          <div className="rule-text">
            <h2 className="rule-heading">
              <span className="rule-number">1</span>
              Game Setup
            </h2>
            <p>
              Each player begins with <strong>four pawns</strong>. White occupies
              positions <strong>D1, D2, C1, and C2</strong> at the bottom of the board.
              Black occupies <strong>D3, D4, C7, and C8</strong> at the top.
            </p>
            <p>
              Positions labeled <strong>D</strong> are the <em>domestic</em> positions&mdash;each
              player's home territory. Positions <strong>C</strong> form the outer
              circumference ring (12 positions), <strong>B</strong> the inner boundary
              hexagon (6 positions), and <strong>A1</strong> is the absolute center.
            </p>
            <p>
              <strong>White moves first.</strong>
            </p>
          </div>
          <div className="rule-board">
            <MiniBoard
              checkers={SETUP_CHECKERS}
              highlightVertices={['D1', 'D2', 'C1', 'C2', 'D3', 'D4', 'C7', 'C8']}
              size={280}
              label="Starting position"
            />
          </div>
        </div>
      </animated.section>

      {/* ────────────────────────────── */}
      {/* 2. MOVEMENT */}
      {/* ────────────────────────────── */}
      <animated.section id="movement" ref={movementFade.ref} style={movementFade.style} className="rule-section alt-bg">
        <div className="rule-content reverse">
          <div className="rule-text">
            <h2 className="rule-heading">
              <span className="rule-number">2</span>
              Movement
            </h2>
            <p>
              On each turn, a player moves <strong>one pawn</strong> along a single
              edge to an <strong>adjacent empty position</strong>. Pawns cannot jump
              over other pieces, and no two pawns may occupy the same vertex.
            </p>
            <p>
              <strong>Regular (non-upgraded) pawns can only move forward</strong>&mdash;meaning
              towards the opponent's side of the board. They cannot retreat
              or move purely sideways. This constraint is what makes positioning
              so critical from the very first move.
            </p>
            <p className="rule-note">
              <span style={{color: '#c0392b'}}>Red arrows</span> show White's
              legal moves from B1 (toward Black's side).{' '}
              <span style={{color: '#2c3e50', fontWeight: 600}}>Dark arrows</span> show
              Black's legal moves from B4 (toward White's side).
              Notice both can reach the center A1, but neither can move backward.
            </p>
          </div>
          <div className="rule-board">
            <MiniBoard
              checkers={MOVEMENT_CHECKERS}
              arrows={[['B1', 'A1'], ['B1', 'B2'], ['B1', 'B6']]}
              arrowsAlt={[['B4', 'A1'], ['B4', 'B3'], ['B4', 'B5']]}
              highlightVertices={['B1', 'B4']}
              size={300}
              label="All legal forward moves for each player"
            />
          </div>
        </div>
      </animated.section>

      {/* ────────────────────────────── */}
      {/* 3. STRIKING */}
      {/* ────────────────────────────── */}
      <animated.section id="striking" ref={strikingFade.ref} style={strikingFade.style} className="rule-section">
        <div className="rule-content">
          <div className="rule-text">
            <h2 className="rule-heading">
              <span className="rule-number">3</span>
              Striking
            </h2>
            <p>
              When a pawn <strong>lands on a position adjacent to an opponent's pawn</strong>,
              the opponent's pawn is <strong>flipped</strong>&mdash;its color changes
              to match yours. This is a <em>strike</em>.
            </p>
            <p>
              A single move can flip <strong>multiple adjacent opponents</strong> at once.
              Every adjacent enemy pawn is struck simultaneously. Struck pawns are not
              removed&mdash;they switch allegiance to the moving player's color.
            </p>
            <p className="rule-note">
              Here, White moves from C3 to B2. Black's pawn at C4 is adjacent
              to B2 and gets flipped to White.
            </p>
          </div>
          <div className="rule-board">
            <div className="board-pair">
              <MiniBoard
                checkers={STRIKE_BEFORE}
                arrows={[['C3', 'B2']]}
                highlightVertices={['C3', 'C4']}
                highlightEdges={[['B2', 'C4']]}
                size={220}
                label="Before: White moves C3 → B2"
              />
              <div className="arrow-between">&rarr;</div>
              <MiniBoard
                checkers={STRIKE_AFTER}
                highlightVertices={['B2', 'C4']}
                size={220}
                label="After: C4 flipped to White"
              />
            </div>
          </div>
        </div>
      </animated.section>

      {/* ────────────────────────────── */}
      {/* 4. UPGRADING */}
      {/* ────────────────────────────── */}
      <animated.section id="upgrading" ref={upgradingFade.ref} style={upgradingFade.style} className="rule-section alt-bg">
        <div className="rule-content reverse">
          <div className="rule-text">
            <h2 className="rule-heading">
              <span className="rule-number">4</span>
              Upgrading
            </h2>
            <p>
              When a pawn <strong>lands on or strikes a pawn onto the opponent's
              home base</strong> (C1, C2, D1, D2 for Black reaching White's side;
              C7, C8, D3, D4 for White reaching Black's side), that
              pawn is <strong>upgraded</strong>. An upgraded pawn is marked with
              an inner circle of the opposite color.
            </p>
            <p>
              Upgraded status is <strong>permanent</strong>&mdash;even if the pawn
              is later struck and flipped, it retains its upgrade.
            </p>
            <p className="rule-note">
              White's pawn advances from B4 into C8&mdash;one of Black's home
              base positions. The pawn gains the upgrade marker (inner circle),
              allowing it to move in any direction on its next turn.
            </p>
          </div>
          <div className="rule-board">
            <div className="board-pair">
              <MiniBoard
                checkers={UPGRADE_BEFORE}
                arrows={[['B4', 'C8']]}
                highlightVertices={['B4', 'C8']}
                size={220}
                label="Before: White moves B4 → C8"
              />
              <div className="arrow-between">&rarr;</div>
              <MiniBoard
                checkers={UPGRADE_AFTER}
                highlightVertices={['C8']}
                size={220}
                label="After: pawn upgraded at C8"
              />
            </div>
          </div>
        </div>
      </animated.section>

      {/* ────────────────────────────── */}
      {/* 5. UPGRADED MOVEMENT */}
      {/* ────────────────────────────── */}
      <animated.section id="upgraded-movement" ref={upgradedMoveFade.ref} style={upgradedMoveFade.style} className="rule-section">
        <div className="rule-content">
          <div className="rule-text">
            <h2 className="rule-heading">
              <span className="rule-number">5</span>
              Upgraded Movement
            </h2>
            <p>
              An upgraded pawn gains a special ability: it may move in <strong>any
              direction</strong>&mdash;forward, backward, or sideways&mdash;along a single edge.
              This is the only way to retreat on the board.
            </p>
            <p>
              This makes upgraded pawns extremely versatile and dangerous.
              They can strike in directions regular pawns cannot reach,
              creating surprising reversals late in the game.
            </p>
            <p className="rule-note">
              The upgraded White pawn at B3 (marked with inner circle)
              can move to any of its connected positions&mdash;including
              backward toward C5/C6 or forward to A1.
            </p>
          </div>
          <div className="rule-board">
            <MiniBoard
              checkers={UPGRADED_MOVE}
              arrows={[['B3', 'A1'], ['B3', 'C5'], ['B3', 'C6'], ['B3', 'B2'], ['B3', 'B4']]}
              highlightVertices={['B3']}
              size={280}
              label="Upgraded pawn: all directions available"
            />
          </div>
        </div>
      </animated.section>

      {/* ────────────────────────────── */}
      {/* 6. END GAME */}
      {/* ────────────────────────────── */}
      <animated.section id="endgame" ref={endgameFade.ref} style={endgameFade.style} className="rule-section alt-bg">
        <div className="rule-content reverse">
          <div className="rule-text">
            <h2 className="rule-heading">
              <span className="rule-number">6</span>
              End Game
            </h2>
            <p>The game ends when either of these conditions is met:</p>
            <ul className="rule-list">
              <li>
                <strong>No legal moves</strong> &mdash; The current player has no
                valid move available. The opponent wins.
              </li>
              <li>
                <strong>Total conversion</strong> &mdash; All remaining pawns on the
                board are the same color. That color's player wins.
              </li>
            </ul>
            <p>
              Because striking flips colors rather than removing pieces,
              the game often reaches a dramatic tipping point where a
              single well-placed move converts the entire remaining board.
            </p>
          </div>
          <div className="rule-board">
            <MiniBoard
              checkers={ENDGAME_STATE}
              highlightVertices={['C3', 'B2', 'A1', 'B4']}
              size={280}
              label="All pawns are White — White wins"
            />
          </div>
        </div>
      </animated.section>

      {/* ── CTA ── */}
      <animated.section ref={ctaFade.ref} style={ctaFade.style} className="rules-cta">
        <h2>Ready to try it?</h2>
        <Link to="/play" className="btn-primary">
          Play Tarati
        </Link>
      </animated.section>
    </div>
  );
};

export default RulesPage;
