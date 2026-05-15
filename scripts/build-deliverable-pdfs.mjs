/**
 * Builds five PDFs from Markdown: SRS, SDD, SPMP, STD, Presentation checklist.
 * Usage: node scripts/build-deliverable-pdfs.mjs
 */
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mdToPdf } from 'md-to-pdf';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, 'docs', 'pdf');

const jobs = [
  ['docs/SRS-Smart-Document-Evaluator-v3.md', 'SRS-Smart-Document-Evaluator-v3.pdf'],
  ['docs/SDD-Smart-Document-Evaluator-v3.md', 'SDD-Smart-Document-Evaluator-v3.pdf'],
  ['docs/SPMP-Smart-Document-Evaluator-v3.md', 'SPMP-Smart-Document-Evaluator-v3.pdf'],
  ['docs/STD-Smart-Document-Evaluator-v3.md', 'STD-Smart-Document-Evaluator-v3.pdf'],
  ['docs/PRESENTATION-READINESS-AND-DELIVERABLES.md', 'PRESENTATION-READINESS-AND-DELIVERABLES.pdf'],
];

async function main() {
  mkdirSync(outDir, { recursive: true });
  const pdfOpts = {
    format: 'Letter',
    printBackground: true,
    margin: { top: '18mm', right: '16mm', bottom: '18mm', left: '16mm' },
  };

  for (const [relMd, outName] of jobs) {
    const mdPath = join(root, relMd);
    const dest = join(outDir, outName);
    console.log(`Building ${outName}…`);
    const pdf = await mdToPdf(
      { path: mdPath },
      {
        dest,
        basedir: join(root, dirname(relMd)),
        pdf_options: pdfOpts,
      }
    );
    console.log(`  → ${pdf.filename} (${pdf.content?.length ?? 0} bytes)`);
  }
  console.log('\nDone. Open folder:', outDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
