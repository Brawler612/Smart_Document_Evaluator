/**
 * Merges project Markdown documentation into one file and runs md-to-pdf.
 * Usage: node scripts/build-docs-pdf.mjs
 * Requires: npm install (includes devDependency md-to-pdf)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mdToPdf } from 'md-to-pdf';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, 'docs', 'pdf');
const bundlePath = join(outDir, '_bundle.md');
const pdfPath = join(outDir, 'Smart-Docs-Validator-Documentation-Bundle.pdf');

const PAGE_BREAK = '\n\n<div style="page-break-before: always;"></div>\n\n';

function exists(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/** Preferred order first; remaining docs/*.md appended alphabetically. */
function collectMarkdownPaths() {
  const preferred = [
    join(root, 'README.md'),
    join(root, 'DEPLOY.md'),
    join(root, 'docs', 'PRESENTATION-READINESS-AND-DELIVERABLES.md'),
    join(root, 'docs', 'SRS-Smart-Document-Evaluator-v3.md'),
    join(root, 'docs', 'SRS-Smart-Document-Evaluator-v2.md'),
    join(root, 'docs', 'SDD-Smart-Document-Evaluator-v3.md'),
    join(root, 'docs', 'SPMP-Smart-Document-Evaluator-v3.md'),
    join(root, 'docs', 'STD-Smart-Document-Evaluator-v3.md'),
    join(root, 'docs', 'INVITATION_EMAIL_SETUP.md'),
    join(root, 'docs', 'SoftwareUsabilitySurvey-StudentRateUs.md'),
    join(root, 'docs', 'SRS-Smart-Document-Evaluator.md'),
  ];

  const seen = new Set();
  const ordered = [];
  for (const p of preferred) {
    if (exists(p) && !seen.has(p)) {
      seen.add(p);
      ordered.push(p);
    }
  }

  const docsDir = join(root, 'docs');
  const rest = readdirSync(docsDir)
    .filter((n) => n.endsWith('.md'))
    .sort()
    .map((n) => join(docsDir, n));

  for (const p of rest) {
    if (!seen.has(p)) {
      seen.add(p);
      ordered.push(p);
    }
  }

  return ordered;
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const paths = collectMarkdownPaths();
  const parts = [];

  for (let i = 0; i < paths.length; i++) {
    const p = paths[i];
    const rel = p.replace(/\\/g, '/').replace(root.replace(/\\/g, '/') + '/', '');
    const body = readFileSync(p, 'utf8');
    if (i > 0) parts.push(PAGE_BREAK);
    parts.push(`<!-- source: ${rel} -->\n\n${body}`);
  }

  const merged = parts.join('\n');
  writeFileSync(bundlePath, merged, 'utf8');
  console.log(`Wrote bundle (${paths.length} files) → ${bundlePath}`);

  const pdf = await mdToPdf(
    { path: bundlePath },
    {
      dest: pdfPath,
      basedir: outDir,
      pdf_options: {
        format: 'Letter',
        printBackground: true,
        margin: { top: '18mm', right: '16mm', bottom: '18mm', left: '16mm' },
      },
    }
  );

  console.log(`PDF written → ${pdf.filename ?? pdfPath} (${pdf.content?.length ?? 0} bytes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
