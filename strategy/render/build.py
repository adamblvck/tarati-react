#!/usr/bin/env python3
"""build.py — render the guide from one Markdown source into every format.

The chapters in `strategy/guide/*.md` are the single source. This produces:

  build/guide.html      self-contained HTML (the published artifact)
  build/guide.pdf       32-page A5 saddle-stitch booklet, print-shop ready
  build/guide.md        chapters concatenated, for review and diffing
  ../src/pages/guideContent.js   chapter data for the in-app React page

Figures are written as `![caption](fig:SPEC)` in the Markdown and expanded here,
so a chapter never contains raw SVG and stays readable and editable. SPEC is:

    fig:occ,white,rok,stm[|arrow=D2-C2][|mark=C1,C2][|labels]

Those four numbers identify a real position in the corpus or the book, which is
what makes every diagram in the guide traceable back to the data that produced
it rather than hand-drawn to suit the prose.

Usage:
    ./venv/bin/python render/build.py            # all formats
    ./venv/bin/python render/build.py --pdf      # booklet only
"""

import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import markdown

from guide import figures
from engine import bitboard as bb

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GUIDE_DIR = os.path.join(ROOT, 'guide')
BUILD_DIR = os.path.join(ROOT, 'build')
CSS_PATH = os.path.join(ROOT, 'render', 'booklet.css')
REACT_OUT = os.path.join(ROOT, '..', 'src', 'pages', 'guideContent.js')

#: Saddle stitch folds sheets down the middle, so the count must divide by 4.
#: Relaxed from 32 to 48 for a bigger, more advanced guide (opener
#: classification, attack setups, endgame), then to 56 for the advanced band:
#: the eight, doors, contact, cramp and the quiet power moves.
TARGET_PAGES = 56

FIG_RE = re.compile(r'!\[([^\]]*)\]\((fig|seq):([^)]+)\)')


def _parse_board(spec):
    """Parse one `occ,white,rok,stm[|arrow=A-B;C-D][|mark=X,Y][|sub=text][|labels]`."""
    parts = spec.split('|')
    occ, white, rok, stm = (int(v) for v in parts[0].split(','))
    board = {'occ': occ, 'white': white, 'rok': rok, 'stm': stm,
             'arrows': [], 'highlights': [], 'labels': False, 'sub': None}
    for extra in parts[1:]:
        if extra.startswith('arrow='):
            board['arrows'] = [tuple(p.split('-')) for p in extra[6:].split(';')]
        elif extra.startswith('mark='):
            board['highlights'] = extra[5:].split(',')
        elif extra.startswith('sub='):
            board['sub'] = extra[4:]
        elif extra == 'labels':
            board['labels'] = True
    return board


def expand_figure(caption, spec):
    b = _parse_board(spec)
    svg = figures.render(b['occ'], b['white'], b['rok'], b['stm'],
                         highlights=b['highlights'], arrows=b['arrows'],
                         labels=b['labels'], title=caption)
    cap = '<figcaption>%s</figcaption>' % caption if caption else ''
    return '<figure>%s%s</figure>' % (svg, cap)


def expand_sequence(caption, spec):
    """Render a `seq:` figure — boards separated by `;;`, options by `|`."""
    boards = [_parse_board(s.strip()) for s in spec.split(';;')]
    subs = [b['sub'] for b in boards]
    svg = figures.render_sequence(boards, subs)
    cap = '<figcaption>%s</figcaption>' % caption if caption else ''
    return '<figure class="sequence">%s%s</figure>' % (svg, cap)


def expand_match(kind, caption, spec):
    return expand_sequence(caption, spec) if kind == 'seq' \
        else expand_figure(caption, spec)


#: The front-matter file holds the cover, colophon and TOC placeholder as raw
#: HTML rather than a chapter. It is prefixed 00- so it sorts first, and it is
#: kept out of the in-app chapter tabs.
FRONT_MATTER = '00-front-matter.md'


def load_chapters():
    if not os.path.isdir(GUIDE_DIR):
        raise SystemExit('no chapters in %s yet' % os.path.relpath(GUIDE_DIR))
    names = sorted(f for f in os.listdir(GUIDE_DIR)
                   if f.endswith('.md') and f != FRONT_MATTER)
    if not names:
        raise SystemExit('no chapters in %s yet' % os.path.relpath(GUIDE_DIR))
    return [(n, open(os.path.join(GUIDE_DIR, n)).read()) for n in names]


def load_front_matter():
    path = os.path.join(GUIDE_DIR, FRONT_MATTER)
    if not os.path.exists(path):
        return None
    # md_in_html lets the colophon's prose be written as Markdown inside its
    # <div>, so the front matter stays as editable as the chapters.
    md = markdown.Markdown(extensions=['md_in_html', 'attr_list'])
    return md.convert(open(path).read())


def toc_html(chapters):
    """A table of contents whose page numbers the print renderer fills in.

    ``target-counter`` in booklet.css resolves each link to the actual printed
    page, so the TOC can never drift out of sync with the content the way a
    hand-maintained one would.
    """
    items = []
    for name, text in chapters:
        title = text.lstrip().split('\n', 1)[0].lstrip('# ').strip()
        anchor = os.path.splitext(name)[0]
        items.append('<li><a href="#%s">%s</a></li>' % (anchor, title))
    return ('<nav class="toc"><h1 class="no-break">Contents</h1><ul>%s</ul></nav>'
            % ''.join(items))


def to_html(chapters):
    """Markdown to HTML, expanding figure references.

    Figures are swapped for opaque placeholders *before* conversion and
    substituted back afterwards. Doing it the other way round does not work:
    Markdown consumes the `![caption](fig:...)` image syntax itself, so a regex
    run against the converted HTML never matches, and the diagrams silently
    vanish leaving only their captions.
    """
    md = markdown.Markdown(extensions=['tables', 'attr_list'])
    body = []
    for name, text in chapters:
        pending = []

        def stash(match):
            # FIG_RE groups: 1=caption, 2=kind (fig|seq), 3=spec
            pending.append((match.group(2), match.group(1), match.group(3)))
            return '@@FIGURE%d@@' % (len(pending) - 1)

        md.reset()
        html = md.convert(FIG_RE.sub(stash, text))

        for index, (kind, caption, spec) in enumerate(pending):
            token = '@@FIGURE%d@@' % index
            figure = expand_match(kind, caption, spec)
            # The placeholder sits alone in its own paragraph; replace the
            # whole paragraph so <figure> is not nested inside <p>, which is
            # invalid and breaks page-break-inside: avoid.
            html = html.replace('<p>%s</p>' % token, figure)
            html = html.replace(token, figure)

        anchor = os.path.splitext(name)[0]
        body.append('<section id="%s">%s</section>' % (anchor, html))

    front = load_front_matter()
    prefix = ''
    if front is not None:
        prefix = front + toc_html(chapters)
    return prefix + '\n'.join(body)


def write_html(html):
    os.makedirs(BUILD_DIR, exist_ok=True)
    css = open(CSS_PATH).read()
    # Screen overrides: the print sheet forces a page break before every h1,
    # which is meaningless on a scrolling page.
    screen = '''
      body { max-width: 46rem; margin: 0 auto; padding: 2rem 1.25rem 6rem;
             font-size: 17px; text-align: left; }
      h1 { page-break-before: auto; margin-top: 3rem; }
      figure svg { width: min(100%, 300px); }
      @media (prefers-color-scheme: dark) {
        body { background: #14151a; color: #e6e6e6; }
        figcaption, .evidence { color: #a8a8a8; }
      }
    '''
    doc = ('<!doctype html><meta charset="utf-8">'
           '<meta name="viewport" content="width=device-width,initial-scale=1">'
           '<title>Tarati — Strategy Guide</title>'
           '<style>%s\n%s</style>%s' % (css, screen, html))
    path = os.path.join(BUILD_DIR, 'guide.html')
    with open(path, 'w') as handle:
        handle.write(doc)
    return path


def write_pdf(html):
    from weasyprint import HTML, CSS
    os.makedirs(BUILD_DIR, exist_ok=True)
    doc = HTML(string=html, base_url=GUIDE_DIR).render(
        stylesheets=[CSS(filename=CSS_PATH)])
    path = os.path.join(BUILD_DIR, 'guide.pdf')
    doc.write_pdf(path)

    pages = len(doc.pages)
    print('  booklet: %d pages' % pages)
    if pages != TARGET_PAGES:
        delta = pages - TARGET_PAGES
        print('  ** page budget: %+d against the %d-page target%s'
              % (delta, TARGET_PAGES,
                 '' if pages % 4 == 0 else
                 ' — and %d is not a multiple of 4, so it cannot be '
                 'saddle-stitched as is' % pages))
    return path, pages


def _fig_to_react(spec):
    """Turn a fig: spec into props the app's MiniBoard consumes directly.

    Parsing the spec here rather than in the browser keeps the four board words
    (which only the Python engine knows how to unpack into vertex names) on the
    Python side, so the React page never needs the engine.
    """
    parts = spec.split('|')
    occ, white, rok, stm = (int(v) for v in parts[0].split(','))
    checkers = {}
    for i in bb.bit_list(occ):
        checkers[bb.VERTEX[i]] = {
            'color': 'WHITE' if (white >> i) & 1 else 'BLACK',
            'isUpgraded': bool((rok >> i) & 1),
        }
    arrows, marks, sub = [], [], None
    for extra in parts[1:]:
        if extra.startswith('arrow='):
            for pair in extra[6:].split(';'):
                a, b = pair.split('-')
                # MiniBoard destructures each arrow as [from, to], so emit
                # two-element lists, not {from, to} objects — an object is not
                # iterable and crashes the whole page.
                arrows.append([a, b])
        elif extra.startswith('mark='):
            marks = extra[5:].split(',')
        elif extra.startswith('sub='):
            sub = extra[4:]
    return {'checkers': checkers, 'arrows': arrows,
            'highlightVertices': marks, 'sub': sub}


def _chapter_blocks(text):
    """Split a chapter into ordered blocks the React page can map over.

    Each block is {'type':'md'}, {'type':'figure'} (one board) or
    {'type':'sequence'} (a row of boards). Splitting on the figure syntax keeps
    the page's structure identical to the print and HTML outputs without the app
    re-running a Markdown parser over embedded SVG.
    """
    import markdown as _md
    md = _md.Markdown(extensions=['tables', 'attr_list'])
    blocks = []
    last = 0
    for m in FIG_RE.finditer(text):
        before = text[last:m.start()].strip()
        if before:
            md.reset()
            blocks.append({'type': 'md', 'html': md.convert(before)})
        caption, kind, spec = m.group(1), m.group(2), m.group(3)
        if kind == 'seq':
            blocks.append({'type': 'sequence', 'caption': caption,
                           'boards': [_fig_to_react(s.strip())
                                      for s in spec.split(';;')]})
        else:
            blocks.append({'type': 'figure', 'caption': caption,
                           'board': _fig_to_react(spec)})
        last = m.end()
    tail = text[last:].strip()
    if tail:
        md.reset()
        blocks.append({'type': 'md', 'html': md.convert(tail)})
    return blocks


def write_react(chapters):
    """Structured chapter data for the in-app page."""
    import json
    payload = []
    for name, text in chapters:
        title = text.lstrip().split('\n', 1)[0].lstrip('# ').strip()
        payload.append({'slug': os.path.splitext(name)[0], 'title': title,
                        'blocks': _chapter_blocks(text)})
    os.makedirs(os.path.dirname(REACT_OUT), exist_ok=True)
    with open(REACT_OUT, 'w') as handle:
        handle.write('// Generated by strategy/render/build.py — do not edit.\n'
                     '// Source of truth: strategy/guide/*.md\n'
                     'export const GUIDE_CHAPTERS = %s;\n'
                     % json.dumps(payload, indent=1))
    return REACT_OUT


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--pdf', action='store_true', help='booklet only')
    parser.add_argument('--html', action='store_true', help='artifact HTML only')
    args = parser.parse_args()
    everything = not (args.pdf or args.html)

    chapters = load_chapters()
    print('chapters: %s' % ', '.join(n for n, _ in chapters))
    html = to_html(chapters)

    if everything or args.html:
        print('  wrote %s' % os.path.relpath(write_html(html), ROOT))
    if everything or args.pdf:
        path, _pages = write_pdf(html)
        print('  wrote %s' % os.path.relpath(path, ROOT))
    if everything:
        os.makedirs(BUILD_DIR, exist_ok=True)
        combined = os.path.join(BUILD_DIR, 'guide.md')
        with open(combined, 'w') as handle:
            handle.write('\n\n'.join(t for _, t in chapters))
        print('  wrote %s' % os.path.relpath(combined, ROOT))
        print('  wrote %s' % os.path.relpath(write_react(chapters), ROOT))


if __name__ == '__main__':
    main()
