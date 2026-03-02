import React from 'react';
import { Link } from 'react-router-dom';
import MiniBoard from '../components/MiniBoard';
import { AI_DIFFICULTY_PROFILES } from '../config/aiConfig';
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

const AIPage = () => {
  return (
    <div className="ai-page">
      <section className="ai-hero">
        <div>
          <h1 className="ai-title">Tarati AI Engine</h1>
          <p className="ai-subtitle">
            A depth-first strategist with modern safeguards:
            alpha-beta pruning, transposition reuse, and strict move-time budgets.
          </p>
          <div className="ai-hero-actions">
            <Link to="/play" className="btn-primary">Test It In Game</Link>
            <Link to="/rules" className="btn-secondary">Review Rules</Link>
          </div>
        </div>
        <div className="ai-hero-board">
          <MiniBoard
            checkers={EXAMPLE_POSITION}
            arrows={[['B2', 'A1'], ['B4', 'C7']]}
            highlightVertices={['B2', 'B4', 'A1', 'C7']}
            size={330}
            label="The AI scores and compares many continuations from this structure."
          />
        </div>
      </section>

      <section className="ai-grid">
        <article className="ai-card">
          <h2>How Search Works</h2>
          <ol>
            <li>Generate legal moves for the current side.</li>
            <li>Sort candidates using a fast heuristic.</li>
            <li>Run minimax with alpha-beta pruning.</li>
            <li>Cache solved states in a transposition table.</li>
            <li>At root, round-robin probe each move when budgets are active.</li>
            <li>Return best move, or weighted top-k when randomization is enabled.</li>
          </ol>
        </article>

        <article className="ai-card">
          <h2>Complexity Pressure</h2>
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
        </article>

        <article className="ai-card">
          <h2>Budget Utilization</h2>
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
        </article>

        <article className="ai-card">
          <h2>Scoring Signals</h2>
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
        </article>
      </section>

      <section className="ai-profiles">
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
                <li>Root probe: {profile.rootProbeNodes}</li>
                <li>Top-k: {profile.stochasticTopK}</li>
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="ai-footer">
        <h2>Why this design?</h2>
        <p>
          It keeps the strategic flavor of deep minimax while behaving like a modern interactive system:
          graceful under pressure, configurable for experimentation, and deterministic enough to study.
        </p>
      </section>
    </div>
  );
};

export default AIPage;

