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

// 2. Movement — White cob at B1, Black cob at B4 (both off home base: forward only)
const MOVEMENT_CHECKERS = {
  'B1': { color: 'WHITE', isUpgraded: false },
  'D1': { color: 'WHITE', isUpgraded: false },
  'C1': { color: 'WHITE', isUpgraded: false },
  'B4': { color: 'BLACK', isUpgraded: false },
  'D3': { color: 'BLACK', isUpgraded: false },
  'C7': { color: 'BLACK', isUpgraded: false },
};

// 2b. Home-base exception — White cob at D1 can move any direction
const HOME_BASE_CHECKERS = {
  'D1': { color: 'WHITE', isUpgraded: false },
  'C2': { color: 'WHITE', isUpgraded: false },
  'C8': { color: 'BLACK', isUpgraded: false },
  'D3': { color: 'BLACK', isUpgraded: false },
};

// 3. Striking — pre-adjacency rule
// Before: White at C1 (upgraded), Black at B2. C1 NOT adjacent to B2.
const STRIKE_BEFORE = {
  'C1': { color: 'WHITE', isUpgraded: true },
  'D1': { color: 'WHITE', isUpgraded: false },
  'B2': { color: 'BLACK', isUpgraded: false },
  'C8': { color: 'BLACK', isUpgraded: false },
  'D3': { color: 'BLACK', isUpgraded: false },
};
// After: White moves C1 → B1. B1 adj to B2, and C1 was NOT adj to B2 → strike.
const STRIKE_AFTER = {
  'B1': { color: 'WHITE', isUpgraded: true },
  'D1': { color: 'WHITE', isUpgraded: false },
  'B2': { color: 'WHITE', isUpgraded: false },
  'C8': { color: 'BLACK', isUpgraded: false },
  'D3': { color: 'BLACK', isUpgraded: false },
};

// 3b. Pre-adjacency blocked — White at C3, Black at C4. C3 IS adj to C4.
const PREADJ_BEFORE = {
  'C3': { color: 'WHITE', isUpgraded: false },
  'C1': { color: 'WHITE', isUpgraded: false },
  'C4': { color: 'BLACK', isUpgraded: false },
  'D3': { color: 'BLACK', isUpgraded: false },
};
// After: White moves C3 → B2. B2 adj to C4, but C3 WAS adj to C4 → NO strike.
const PREADJ_AFTER = {
  'B2': { color: 'WHITE', isUpgraded: false },
  'C1': { color: 'WHITE', isUpgraded: false },
  'C4': { color: 'BLACK', isUpgraded: false },
  'D3': { color: 'BLACK', isUpgraded: false },
};

// 4. Upgrade — White at B4 moves to C7 (Black's home base) → upgrades
const UPGRADE_BEFORE = {
  'B4': { color: 'WHITE', isUpgraded: false },
  'C1': { color: 'WHITE', isUpgraded: false },
  'B1': { color: 'WHITE', isUpgraded: false },
  'C6': { color: 'BLACK', isUpgraded: false },
  'B5': { color: 'BLACK', isUpgraded: false },
};
const UPGRADE_AFTER = {
  'C7': { color: 'WHITE', isUpgraded: true },
  'C1': { color: 'WHITE', isUpgraded: false },
  'B1': { color: 'WHITE', isUpgraded: false },
  'C6': { color: 'BLACK', isUpgraded: false },
  'B5': { color: 'BLACK', isUpgraded: false },
};

// 5. Upgraded movement — rok at B3 can move any direction
const UPGRADED_MOVE = {
  'B3': { color: 'WHITE', isUpgraded: true },
  'D1': { color: 'WHITE', isUpgraded: false },
  'C9': { color: 'BLACK', isUpgraded: false },
  'D3': { color: 'BLACK', isUpgraded: false },
  'B5': { color: 'BLACK', isUpgraded: false },
};

// 6. Captured-on-own-home — Black cob at D3 (Black's home), struck but NOT promoted
const OWN_HOME_BEFORE = {
  'B4': { color: 'WHITE', isUpgraded: true },
  'C1': { color: 'WHITE', isUpgraded: false },
  'D3': { color: 'BLACK', isUpgraded: false },
  'D4': { color: 'BLACK', isUpgraded: false },
};
const OWN_HOME_AFTER = {
  'C7': { color: 'WHITE', isUpgraded: true },
  'C1': { color: 'WHITE', isUpgraded: false },
  'D3': { color: 'WHITE', isUpgraded: false },   // flipped but NOT upgraded
  'D4': { color: 'BLACK', isUpgraded: false },
};

// 7. Dead piece & sole remaining — endgame scenarios
const DEAD_PIECE = {
  'D3': { color: 'WHITE', isUpgraded: false },
  'C5': { color: 'BLACK', isUpgraded: false },
};
const DEAD_PROMOTED = {
  'D3': { color: 'WHITE', isUpgraded: true },
  'C5': { color: 'BLACK', isUpgraded: false },
};

// 8. End game — all pieces same color
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
  const homeBaseFade = useScrollFadeIn({ threshold: 0.15 });
  const strikingFade = useScrollFadeIn({ threshold: 0.15 });
  const preAdjFade = useScrollFadeIn({ threshold: 0.15 });
  const upgradingFade = useScrollFadeIn({ threshold: 0.15 });
  const upgradedMoveFade = useScrollFadeIn({ threshold: 0.15 });
  const ownHomeFade = useScrollFadeIn({ threshold: 0.15 });
  const deadPieceFade = useScrollFadeIn({ threshold: 0.15 });
  const endgameFade = useScrollFadeIn({ threshold: 0.15 });
  const ctaFade = useScrollFadeIn({ threshold: 0.2 });

  return (
    <div className="rules-page">
      {/* ── Header ── */}
      <section className="rules-hero">
        <animated.h1 style={heroTitle} className="rules-title">Rules of Tarati</animated.h1>
        <animated.p style={heroIntro} className="rules-intro">
          The complete official rules based on George Spencer-Brown's
          patent (WO&nbsp;89/02772). Each rule is illustrated with a miniature board.
        </animated.p>
      </section>

      {/* ── Table of Contents ── */}
      <animated.nav style={tocSpring} className="rules-toc">
        <a href="#setup">Setup</a>
        <span className="toc-dot">&middot;</span>
        <a href="#movement">Movement</a>
        <span className="toc-dot">&middot;</span>
        <a href="#home-base">Home-Base Exception</a>
        <span className="toc-dot">&middot;</span>
        <a href="#striking">Striking</a>
        <span className="toc-dot">&middot;</span>
        <a href="#pre-adjacency">Pre-Adjacency</a>
        <span className="toc-dot">&middot;</span>
        <a href="#upgrading">Upgrading</a>
        <span className="toc-dot">&middot;</span>
        <a href="#upgraded-movement">Rok Movement</a>
        <span className="toc-dot">&middot;</span>
        <a href="#own-home">Own-Home Capture</a>
        <span className="toc-dot">&middot;</span>
        <a href="#dead-pieces">Dead Pieces</a>
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
              Each player begins with <strong>four cobs</strong> (common pieces). White
              occupies positions <strong>D1, D2, C1, and C2</strong> at the bottom of the
              board. Black occupies <strong>D3, D4, C7, and C8</strong> at the top.
            </p>
            <p>
              Positions labeled <strong>D</strong> are the <em>domestic</em> (home-base)
              positions. <strong>C</strong> forms the outer dodecagon (12&nbsp;positions),
              <strong>B</strong> the inner hexagon (6&nbsp;positions), and <strong>A1</strong> is
              the absolute center. All lines are equal length.
            </p>
            <p>
              <strong>White moves first.</strong> Players alternate turns.
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
              On each turn, a player moves <strong>one piece</strong> along a single
              line to an <strong>adjacent empty position</strong>. Pieces cannot jump
              over other pieces, and no two pieces may occupy the same vertex.
            </p>
            <p>
              <strong>Cobs (non-upgraded pieces) can only move forward</strong>&mdash;toward
              the opponent's side of the board. They cannot retreat or move
              sideways. This constraint is what makes positioning so
              critical from the very first move.
            </p>
            <p className="rule-note">
              <span style={{color: '#c0392b'}}>Red arrows</span> show White's
              legal forward moves from B1.{' '}
              <span style={{color: '#2c3e50', fontWeight: 600}}>Dark arrows</span> show
              Black's legal forward moves from B4.
            </p>
          </div>
          <div className="rule-board">
            <MiniBoard
              checkers={MOVEMENT_CHECKERS}
              arrows={[['B1', 'A1'], ['B1', 'B2'], ['B1', 'B6']]}
              arrowsAlt={[['B4', 'A1'], ['B4', 'B3'], ['B4', 'B5']]}
              highlightVertices={['B1', 'B4']}
              size={300}
              label="Forward-only movement for cobs"
            />
          </div>
        </div>
      </animated.section>

      {/* ────────────────────────────── */}
      {/* 2b. HOME-BASE EXCEPTION */}
      {/* ────────────────────────────── */}
      <animated.section id="home-base" ref={homeBaseFade.ref} style={homeBaseFade.style} className="rule-section">
        <div className="rule-content">
          <div className="rule-text">
            <h2 className="rule-heading">
              <span className="rule-number">2b</span>
              Home-Base Exception
            </h2>
            <p>
              There is one exception to the forward-only rule: when a <strong>cob
              starts its move on one of its own home-base positions</strong> (D1, D2,
              C1, C2 for White; D3, D4, C7, C8 for Black), it may move
              in <strong>any direction</strong>.
            </p>
            <p>
              This allows pieces that haven't left home yet to maneuver
              tactically&mdash;particularly to set up or escape captures early in
              the game.
            </p>
            <p className="rule-note">
              White's cob at D1 can move to both D2 and C1 (its home-base
              neighbors) even though some directions may be "backward."
              Once a cob leaves home base, forward-only applies again.
            </p>
          </div>
          <div className="rule-board">
            <MiniBoard
              checkers={HOME_BASE_CHECKERS}
              arrows={[['D1', 'D2'], ['D1', 'C1']]}
              highlightVertices={['D1', 'D2', 'C1']}
              size={280}
              label="Home-base: any direction allowed"
            />
          </div>
        </div>
      </animated.section>

      {/* ────────────────────────────── */}
      {/* 3. STRIKING */}
      {/* ────────────────────────────── */}
      <animated.section id="striking" ref={strikingFade.ref} style={strikingFade.style} className="rule-section alt-bg">
        <div className="rule-content reverse">
          <div className="rule-text">
            <h2 className="rule-heading">
              <span className="rule-number">3</span>
              Striking
            </h2>
            <p>
              When a piece <strong>lands on a position adjacent to an opponent's
              piece</strong>, the opponent's piece is <strong>flipped</strong>&mdash;its
              colour changes to match yours. This is a <em>strike</em>.
            </p>
            <p>
              A single move can flip <strong>multiple adjacent opponents</strong> at once.
              Struck pieces are not removed&mdash;they switch allegiance. This means
              the total number of pieces on the board always stays at eight.
            </p>
            <p className="rule-note">
              White's rok at C1 moves to B1. Black's cob at B2 is adjacent
              to B1 and gets flipped to White. (C1 was <strong>not</strong> adjacent
              to B2 before the move, so the strike is allowed&mdash;see
              pre-adjacency rule below.)
            </p>
          </div>
          <div className="rule-board">
            <div className="board-pair">
              <MiniBoard
                checkers={STRIKE_BEFORE}
                arrows={[['C1', 'B1']]}
                highlightVertices={['C1', 'B2']}
                highlightEdges={[['B1', 'B2']]}
                size={220}
                label="Before: White moves C1 → B1"
              />
              <div className="arrow-between">&rarr;</div>
              <MiniBoard
                checkers={STRIKE_AFTER}
                highlightVertices={['B1', 'B2']}
                size={220}
                label="After: B2 flipped to White"
              />
            </div>
          </div>
        </div>
      </animated.section>

      {/* ────────────────────────────── */}
      {/* 3b. PRE-ADJACENCY RULE */}
      {/* ────────────────────────────── */}
      <animated.section id="pre-adjacency" ref={preAdjFade.ref} style={preAdjFade.style} className="rule-section">
        <div className="rule-content">
          <div className="rule-text">
            <h2 className="rule-heading">
              <span className="rule-number">3b</span>
              The Pre-Adjacency Rule
            </h2>
            <p>
              A piece <strong>cannot be struck by a piece that was already adjacent
              to it before the move</strong>. The attacker must approach from
              a non-adjacent position to capture.
            </p>
            <p>
              This is the most important tactical constraint in Tarati. You
              can't simply slide along next to an enemy and flip it&mdash;you
              must plan your approach from distance. It makes every move
              about controlling space and lines of attack.
            </p>
            <p className="rule-note">
              White moves C3&nbsp;&rarr;&nbsp;B2. Although B2 is adjacent to Black's
              cob at C4, C3 was <strong>already adjacent</strong> to C4 before the
              move. So the strike is blocked&mdash;C4 stays Black.
            </p>
          </div>
          <div className="rule-board">
            <div className="board-pair">
              <MiniBoard
                checkers={PREADJ_BEFORE}
                arrows={[['C3', 'B2']]}
                highlightVertices={['C3', 'C4']}
                highlightEdges={[['C3', 'C4'], ['B2', 'C4']]}
                size={220}
                label="C3 already adjacent to C4"
              />
              <div className="arrow-between">&rarr;</div>
              <MiniBoard
                checkers={PREADJ_AFTER}
                highlightVertices={['B2', 'C4']}
                highlightEdges={[['B2', 'C4']]}
                size={220}
                label="C4 NOT struck — was pre-adjacent"
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
              Promotion (Cob&nbsp;&rarr;&nbsp;Rok)
            </h2>
            <p>
              A cob is <strong>promoted to a rok</strong> when it <strong>moves onto</strong> one
              of the opponent's home-base positions. For White, those are C7,
              C8, D3, D4. For Black: C1, C2, D1, D2.
            </p>
            <p>
              A rok is shown with an <strong>inner circle</strong> of the opposite colour.
              Promotion is <strong>permanent</strong>&mdash;once promoted, a piece keeps
              its rok status even if it is later struck and flipped.
            </p>
            <p className="rule-note">
              White's cob advances from B4 into C7&mdash;one of Black's home-base
              positions. The cob becomes a rok (gains the inner circle).
            </p>
          </div>
          <div className="rule-board">
            <div className="board-pair">
              <MiniBoard
                checkers={UPGRADE_BEFORE}
                arrows={[['B4', 'C7']]}
                highlightVertices={['B4', 'C7']}
                size={220}
                label="Before: White cob moves B4 → C7"
              />
              <div className="arrow-between">&rarr;</div>
              <MiniBoard
                checkers={UPGRADE_AFTER}
                highlightVertices={['C7']}
                size={220}
                label="After: promoted to rok at C7"
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
              Rok Movement
            </h2>
            <p>
              A rok may move in <strong>any direction</strong>&mdash;forward, backward,
              or sideways&mdash;along a single line. This is the primary way to
              retreat on the board.
            </p>
            <p>
              Roks are extremely versatile. They can strike in directions
              that cobs cannot reach, creating surprising reversals late in
              the game. Getting a piece promoted is one of the most
              powerful strategic objectives.
            </p>
            <p className="rule-note">
              The White rok at B3 (inner circle) can move to any of its
              connected positions&mdash;including backward toward C5/C6 or
              forward to A1.
            </p>
          </div>
          <div className="rule-board">
            <MiniBoard
              checkers={UPGRADED_MOVE}
              arrows={[['B3', 'A1'], ['B3', 'C5'], ['B3', 'C6'], ['B3', 'B2'], ['B3', 'B4']]}
              highlightVertices={['B3']}
              size={280}
              label="Rok: all directions available"
            />
          </div>
        </div>
      </animated.section>

      {/* ────────────────────────────── */}
      {/* 6. CAPTURED-ON-OWN-HOME */}
      {/* ────────────────────────────── */}
      <animated.section id="own-home" ref={ownHomeFade.ref} style={ownHomeFade.style} className="rule-section alt-bg">
        <div className="rule-content reverse">
          <div className="rule-text">
            <h2 className="rule-heading">
              <span className="rule-number">6</span>
              Captured on Own Home
            </h2>
            <p>
              A piece that is <strong>struck while sitting on its own home
              base</strong> is <strong>not</strong> immediately promoted. It simply
              becomes a cob of the new colour. It can only be promoted later
              by being <strong>moved forward</strong> onto the opponent's home base.
            </p>
            <p>
              This prevents "free" promotions from defensive positions. You
              must earn your roks by actually advancing into enemy territory.
            </p>
            <p className="rule-note">
              White's rok moves B4&nbsp;&rarr;&nbsp;C7. Black's cob at D3 (Black's own
              home) is adjacent to C7 and gets flipped to White. But because
              D3 is Black's home base, the flipped piece stays a cob&mdash;it
              does <strong>not</strong> gain rok status.
            </p>
          </div>
          <div className="rule-board">
            <div className="board-pair">
              <MiniBoard
                checkers={OWN_HOME_BEFORE}
                arrows={[['B4', 'C7']]}
                highlightVertices={['B4', 'D3']}
                highlightEdges={[['C7', 'D3']]}
                size={220}
                label="Before: D3 is Black's home"
              />
              <div className="arrow-between">&rarr;</div>
              <MiniBoard
                checkers={OWN_HOME_AFTER}
                highlightVertices={['C7', 'D3']}
                size={220}
                label="After: D3 flipped but NOT promoted"
              />
            </div>
          </div>
        </div>
      </animated.section>

      {/* ────────────────────────────── */}
      {/* 7. DEAD PIECES & FORCED PROMOTION */}
      {/* ────────────────────────────── */}
      <animated.section id="dead-pieces" ref={deadPieceFade.ref} style={deadPieceFade.style} className="rule-section">
        <div className="rule-content">
          <div className="rule-text">
            <h2 className="rule-heading">
              <span className="rule-number">7</span>
              Dead Pieces &amp; Forced Promotion
            </h2>
            <p>
              A cob sitting on the opponent's <strong>outermost home-base positions</strong> (the
              D&nbsp;positions) that cannot advance further is called <strong>"dead."</strong> A
              rok can never be dead since it moves in any direction.
            </p>
            <p>
              If a player has <strong>no legal moves</strong> but possesses one or more dead
              pieces, they may <strong>promote one dead piece</strong> to a rok (if doing
              so would allow it to move). This counts as their turn.
            </p>
            <p>
              Additionally, if a player's colour has only <strong>one piece remaining</strong> and
              it's a cob, it is <strong>automatically promoted</strong> to a rok regardless
              of where it sits on the board.
            </p>
            <p className="rule-note">
              White's cob at D3 (Black's outermost home base) is dead&mdash;no
              forward moves exist. If White has no other moves, the cob can
              be promoted to a rok, unlocking movement to D4 or C7.
            </p>
          </div>
          <div className="rule-board">
            <div className="board-pair">
              <MiniBoard
                checkers={DEAD_PIECE}
                highlightVertices={['D3']}
                size={220}
                label="Dead: White cob stuck at D3"
              />
              <div className="arrow-between">&rarr;</div>
              <MiniBoard
                checkers={DEAD_PROMOTED}
                arrows={[['D3', 'D4'], ['D3', 'C7']]}
                highlightVertices={['D3']}
                size={220}
                label="Promoted: rok can now move"
              />
            </div>
          </div>
        </div>
      </animated.section>

      {/* ────────────────────────────── */}
      {/* 8. END GAME */}
      {/* ────────────────────────────── */}
      <animated.section id="endgame" ref={endgameFade.ref} style={endgameFade.style} className="rule-section alt-bg">
        <div className="rule-content reverse">
          <div className="rule-text">
            <h2 className="rule-heading">
              <span className="rule-number">8</span>
              End Game
            </h2>
            <p><strong>A player wins</strong> when:</p>
            <ul className="rule-list">
              <li>
                <strong>No legal moves</strong> &mdash; The opponent has no
                valid move (including dead piece promotions). The opponent loses.
              </li>
              <li>
                <strong>Total conversion</strong> &mdash; All remaining pieces
                on the board are the same colour. That colour's player wins.
              </li>
            </ul>
            <p><strong>The game is drawn</strong> when:</p>
            <ul className="rule-list">
              <li>
                <strong>Mutual agreement</strong> &mdash; Both players agree to a draw.
              </li>
              <li>
                <strong>50-move rule</strong> &mdash; At least 50 consecutive moves
                by each player have been played without moving or promoting a cob.
              </li>
              <li>
                <strong>Threefold repetition</strong> &mdash; A position (same
                pieces, colours, and turn) has occurred three times.
              </li>
            </ul>
            <p>
              Because striking flips colours rather than removing pieces,
              the game often reaches a dramatic tipping point where a
              single well-placed move converts the entire remaining board.
            </p>
          </div>
          <div className="rule-board">
            <MiniBoard
              checkers={ENDGAME_STATE}
              highlightVertices={['C3', 'B2', 'A1', 'B4']}
              size={280}
              label="All pieces are White — White wins"
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
