import React, { useState } from 'react';
import MiniBoard from '../components/MiniBoard';
import { GUIDE_CHAPTERS } from './guideContent';
import './StrategyPage.css';

// The chapter content is generated from strategy/guide/*.md by
// strategy/render/build.py — the same source that produces the booklet PDF and
// the published HTML. Do not edit guideContent.js by hand; edit the Markdown
// and rebuild, so every surface stays in sync.

// MiniBoard destructures each arrow as [from, to]. Coerce to that shape and
// drop anything malformed, so a bad build artifact degrades to a plain board
// rather than throwing and unmounting the whole page.
const asArrowPairs = (arrows) =>
  (Array.isArray(arrows) ? arrows : [])
    .map((a) => (Array.isArray(a) ? a : [a?.from, a?.to]))
    .filter(([from, to]) => from && to);

const Figure = ({ caption, board }) => (
  <figure className="strategy-figure">
    <MiniBoard
      checkers={board.checkers || {}}
      arrows={asArrowPairs(board.arrows)}
      highlightVertices={board.highlightVertices || []}
      size={300}
    />
    {caption ? <figcaption>{caption}</figcaption> : null}
  </figure>
);

// A row of boards showing a line of play. On a narrow screen the boards wrap
// and stack; the arrows between them are a print-only nicety, so the app just
// spaces them and lets each board carry its own sub-caption.
const Sequence = ({ caption, boards }) => (
  <figure className="strategy-sequence">
    <div className="strategy-sequence-row">
      {(boards || []).map((b, i) => (
        <div className="strategy-sequence-step" key={i}>
          <MiniBoard
            checkers={b.checkers || {}}
            arrows={asArrowPairs(b.arrows)}
            highlightVertices={b.highlightVertices || []}
            size={190}
          />
          {b.sub ? <span className="strategy-sequence-sub">{b.sub}</span> : null}
        </div>
      ))}
    </div>
    {caption ? <figcaption>{caption}</figcaption> : null}
  </figure>
);

const Chapter = ({ chapter }) => (
  <section id={chapter.slug} className="strategy-chapter">
    {chapter.blocks.map((block, i) => {
      if (block.type === 'figure') {
        return <Figure key={i} caption={block.caption} board={block.board} />;
      }
      if (block.type === 'sequence') {
        return <Sequence key={i} caption={block.caption} boards={block.boards} />;
      }
      return (
        <div
          key={i}
          className="strategy-prose"
          // Markdown is rendered to HTML at build time from our own source,
          // never from user input, so this is safe.
          dangerouslySetInnerHTML={{ __html: block.html }}
        />
      );
    })}
  </section>
);

const StrategyPage = () => {
  const chapters = GUIDE_CHAPTERS || [];
  const [active, setActive] = useState(chapters[0]?.slug);

  if (!chapters.length) {
    return (
      <div className="strategy-page">
        <p className="strategy-empty">
          The strategy guide has not been built yet. Run{' '}
          <code>strategy/render/build.py</code>.
        </p>
      </div>
    );
  }

  const index = Math.max(0, chapters.findIndex((c) => c.slug === active));
  const current = chapters[index] || chapters[0];
  const previous = index > 0 ? chapters[index - 1] : null;
  const next = index < chapters.length - 1 ? chapters[index + 1] : null;

  // Reading a chapter leaves you at the bottom of it; jumping to the next one
  // without scrolling back up would drop you into the middle of it.
  const goTo = (chapter) => {
    if (!chapter) return;
    setActive(chapter.slug);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="strategy-page">
      <header className="strategy-hero">
        <h1>Strategy</h1>
        <p>
          Everything here is measured. Openings come from an exhaustive solve of
          the first ten moves; move-quality claims come from an engine scoring
          every legal move in more than a hundred thousand real positions. Each
          board is a position that actually occurred.
        </p>
      </header>

      <nav className="strategy-toc" aria-label="Chapters">
        {chapters.map((c) => (
          <button
            key={c.slug}
            className={`strategy-tab ${c.slug === current.slug ? 'active' : ''}`}
            onClick={() => setActive(c.slug)}
          >
            {c.title}
          </button>
        ))}
      </nav>

      <Chapter chapter={current} />

      <nav className="chapter-nav" aria-label="Chapter navigation">
        <button
          type="button"
          className="chapter-nav-btn prev"
          onClick={() => goTo(previous)}
          disabled={!previous}
        >
          <span className="chapter-nav-dir">← Previous</span>
          <span className="chapter-nav-title">{previous ? previous.title : 'Start of the guide'}</span>
        </button>

        <span className="chapter-nav-count">
          {index + 1} of {chapters.length}
        </span>

        <button
          type="button"
          className="chapter-nav-btn next"
          onClick={() => goTo(next)}
          disabled={!next}
        >
          <span className="chapter-nav-dir">Next →</span>
          <span className="chapter-nav-title">{next ? next.title : 'End of the guide'}</span>
        </button>
      </nav>
    </div>
  );
};

export default StrategyPage;
