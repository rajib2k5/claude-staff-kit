#!/usr/bin/env node
/**
 * render_probe.mjs - the checks that only exist after layout.
 *
 * ship_gate.py reads source, so it can count <br> tags but not rendered lines.
 * taste-skill's own rule is about what the user sees: "A 4-line hero headline is
 * always a font-size error, never a copy-length error" (SKILL.md §4.7 L237).
 * That rule is unverifiable from source. This measures it.
 *
 *   node render_probe.mjs page.html [--viewport 1440x1000] [--json]
 *
 * Exit 0 if all measured checks pass, 1 otherwise.
 */
import path from 'path';
import fs from 'fs';

// playwright is an OPTIONAL dependency, and this script may be run from anywhere -
// including a globally installed skill directory, where a bare `import('playwright')`
// resolves against THIS file's location and finds nothing. So try the local resolution
// first, then explicitly resolve from the invoking project's node_modules. (CJS
// require.resolve and ESM import do not agree on paths, which is why this resolves a real
// file path and imports that, rather than asking whether a bare specifier "would" work.)
let chromium;
async function loadChromium() {
  try {
    return (await import('playwright')).chromium;
  } catch { /* not next to this script - try the caller's project */ }
  try {
    // createRequire gives a real CJS require rooted at the caller's project. Use it to
    // require playwright directly rather than import()ing its resolved path as ESM:
    // playwright's CJS entry does not expose `chromium` as a statically-detectable named
    // export, so the ESM namespace comes back without it and the check silently fails.
    const { createRequire } = await import('node:module');
    const req = createRequire(path.join(process.cwd(), 'package.json'));
    const pw = req('playwright');
    if (pw && pw.chromium) return pw.chromium;
  } catch { /* genuinely absent */ }
  return null;
}

const args = process.argv.slice(2);
const file = args.filter(a => !a.startsWith('--') && !/^\d+x\d+$/.test(a))[0];
const vpi = args.indexOf('--viewport');
const vpArg = (vpi >= 0 ? args[vpi + 1] : null) || '1440x1000';
const asJson = args.includes('--json');
const [vw, vh] = vpArg.split('x').map(Number);

if (!file) { console.error('usage: node render_probe.mjs page.html'); process.exit(2); }

chromium = await loadChromium();
if (!chromium) {
  console.log('\n  [SKIP] rendered checks - playwright is not installed here.');
  console.log('         Source checks still ran. To enable the rendered layer, in the');
  console.log('         project you are checking:  npm i -D playwright');
  console.log('         A system Chrome/Chromium/Edge is used if present, so the separate');
  console.log('         `npx playwright install chromium` download is usually unnecessary.');
  process.exit(0);
}

// Browser resolution: honour CHROME_PATH, else try common local installs, else let
// Playwright use its own managed Chromium. If none resolve, skip rather than fail the
// commit - an advisory gate that breaks the machine is worse than no gate.
const CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium', '/usr/bin/google-chrome',
].filter(Boolean);
const EXEC = CANDIDATES.find(p => { try { return fs.existsSync(p); } catch { return false; } });
let browser;
try {
  browser = EXEC ? await chromium.launch({ executablePath: EXEC })
                 : await chromium.launch();
} catch (e) {
  console.log(`\n  [SKIP] rendered checks - no usable browser found.`);
  console.log(`         Tried: ${CANDIDATES.join(', ')}`);
  console.log(`         Fix: install Chrome, or set CHROME_PATH, or run: npx playwright install chromium`);
  process.exit(0);
}
const page = await browser.newPage({ viewport: { width: vw, height: vh } });
const errors = [];
page.on('pageerror', e => errors.push(String(e.message)));
await page.goto('file://' + path.resolve(file));
await page.waitForTimeout(700);

const m = await page.evaluate(() => {
  function lineCount(el) {
    if (!el) return null;
    const r = document.createRange();
    r.selectNodeContents(el);
    const rects = [...r.getClientRects()].filter(x => x.height > 2);
    const tops = [...new Set(rects.map(x => Math.round(x.top)))];
    // merge tops within 4px (sub/superscript jitter)
    tops.sort((a, b) => a - b);
    const lines = tops.filter((t, i) => i === 0 || t - tops[i - 1] > 4);
    return lines.length;
  }
  const hero = document.querySelector('[data-hero="true"]') || document.querySelector('section');
  const h1 = hero && hero.querySelector('h1');
  const sub = hero && hero.querySelector('.hero-sub');
  const nav = document.querySelector('nav');
  const navCenters = nav ? [...nav.children].map(c => {
    const b = c.getBoundingClientRect(); return Math.round(b.top + b.height / 2);
  }) : [];
  const navSpread = navCenters.length ? Math.max(...navCenters) - Math.min(...navCenters) : 0;
  const ctas = hero ? [...hero.querySelectorAll('.cta')] : [];
  const cta = ctas[0];
  const ctaWrapped = cta ? lineCount(cta) > 1 : false;
  const heroBottom = hero ? hero.getBoundingClientRect().bottom : 0;
  const ctaVisible = cta ? cta.getBoundingClientRect().bottom <= window.innerHeight : null;
  const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
  const focusables = [...document.querySelectorAll('a,button')].length;
  // dense-grid hole detection: walk actual track geometry, test each cell centre
  let gridHoles = null, gridCells = null;
  const grid = document.querySelector('.bento');
  if (grid) {
    const gb = grid.getBoundingClientRect();
    const gs = getComputedStyle(grid);
    const gap = parseFloat(gs.gap || gs.rowGap || 0) || 0;
    const colW = gs.gridTemplateColumns.split(' ').map(parseFloat).filter(n => !isNaN(n));
    const rowH = gs.gridTemplateRows.split(' ').map(parseFloat).filter(n => !isNaN(n));
    const kids = [...grid.children].map(c => c.getBoundingClientRect());
    let holes = 0, cells = 0, y = gb.top;
    for (const h of rowH) {
      let x = gb.left;
      for (const w of colW) {
        cells++;
        const cx = x + w / 2, cy = y + h / 2;
        const covered = kids.some(k => cx >= k.left - 1 && cx <= k.right + 1 && cy >= k.top - 1 && cy <= k.bottom + 1);
        if (!covered) holes++;
        x += w + gap;
      }
      y += h + gap;
    }
    gridHoles = holes; gridCells = cells;
  }
  return {
    headlineLines: lineCount(h1),
    subLines: lineCount(sub),
    navHeight: nav ? Math.round(nav.getBoundingClientRect().height) : null,
    navSingleLine: navCenters.length ? navSpread <= 6 : null,
    navSpread,
    ctaWrapped, ctaVisible, heroBottom: Math.round(heroBottom),
    horizontalOverflow: overflow, focusables,
    gridHoles, gridCells,
    docHeight: document.body.scrollHeight,
  };
});

await browser.close();

const RULE = {
  headlineLines: 'taste-skill §4.7 L236-237 (hero headline <=2 rendered lines at desktop; 4 lines is a font-size error)',
  subLines: 'taste-skill §4.7 L236 (hero subtext <=4 rendered lines)',
  navHeight: 'taste-skill §4.7 L247-248 (nav <=80px)',
  navSingleLine: 'taste-skill §4.7 L247 (nav on one line at desktop)',
  ctaWrapped: 'taste-skill §4.5 L226 (a wrapping CTA at desktop is a fail)',
  ctaVisible: 'taste-skill §4.7 L236 (hero CTAs visible without scrolling)',
  horizontalOverflow: 'gpt-tasteskill L65 (no horizontal scroll at any width)',
  jsErrors: 'engineering hygiene (no uncaught errors on load)',
  gridHoles: 'taste-skill §4.7 L250 / gpt-tasteskill L42-44 (N items -> N cells; a dense grid must interlock, no dead cells)',
};

const checks = [
  ['headlineLines', m.headlineLines !== null && m.headlineLines <= 2, `${m.headlineLines} rendered line(s)`],
  ['subLines', m.subLines === null || m.subLines <= 4, `${m.subLines} rendered line(s)`],
  ['navHeight', m.navHeight === null || m.navHeight <= 80, `${m.navHeight}px`],
  ['navSingleLine', m.navSingleLine !== false, m.navSingleLine === null ? 'no nav' : (m.navSingleLine ? `single row (center spread ${m.navSpread}px)` : `children on ${m.navSpread}px of vertical spread`)],
  ['ctaWrapped', !m.ctaWrapped, m.ctaWrapped ? 'primary CTA wraps' : 'no wrap'],
  ['ctaVisible', m.ctaVisible !== false, m.ctaVisible === null ? 'no CTA' : (m.ctaVisible ? 'above the fold' : 'below the fold')],
  ['horizontalOverflow', !m.horizontalOverflow, m.horizontalOverflow ? 'page scrolls sideways' : 'none'],
  ['jsErrors', errors.length === 0, errors.length ? errors.join(' | ') : 'none'],
  ['gridHoles', m.gridHoles === null || m.gridHoles === 0, m.gridHoles === null ? 'no dense grid' : `${m.gridHoles} empty cell(s) of ${m.gridCells}`],
];

const failed = checks.filter(c => !c[1]);

if (asJson) {
  console.log(JSON.stringify({ file, viewport: vpArg, measurements: m, checks: checks.map(([r, ok, d]) => ({ rule: r, ok, detail: d, provenance: RULE[r] })) }, null, 2));
} else {
  console.log(`\n\x1b[1m${file}\x1b[0m @ ${vpArg}  ${checks.length - failed.length}/${checks.length} rendered checks passed`);
  console.log('-'.repeat(72));
  for (const [r, ok, d] of checks) {
    console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${r.padEnd(19)} ${d}`);
    if (!ok) console.log(`           rule: ${RULE[r]}`);
  }
  console.log(`\nVERDICT: ${failed.length ? 'BLOCKED' : 'SHIP'}  (page height ${m.docHeight}px, ${m.focusables} focusable elements)`);
}
process.exit(failed.length ? 1 : 0);
