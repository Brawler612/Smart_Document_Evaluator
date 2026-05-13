/**
 * One-off updater: swap 42 students' `citEmail` in
 * `src/data/it332Sem2ClassRoster.ts` with the personal Gmail address each
 * student now uses to sign in to Smart Docs.
 *
 * The script preserves file formatting and only rewrites the matching
 * `citEmail: '...'` value inside each student's block. It is idempotent —
 * running it twice produces the same file once the swap is done.
 *
 * Run from the repo root:
 *   node scripts/swap-cit-emails-to-gmail.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROSTER_PATH = resolve(__dirname, '..', 'src', 'data', 'it332Sem2ClassRoster.ts');

/**
 * Each tuple identifies a student by `lastName` + `firstName` exactly as
 * spelled in the roster. The third field is the personal Gmail to use as
 * `citEmail` going forward (kept under that key so existing roster lookups
 * keep working). Names that include accents (Cañete, Cabataña) match
 * because we read/write the file as UTF-8.
 */
const UPDATES = [
  ['Naranjo', 'Ana Claire Ellen', 'anaclaireellen@gmail.com'],
  ['Narsico', 'Theodore Benjamin', 'tedbennarsico04@gmail.com'],
  ['Rosalina', 'Kremer', 'drakathrosalina@gmail.com'],
  ['Barangan', 'Mark Lorenz', 'marklorenzbarangan@gmail.com'],
  ['Cantero', 'Patrick James', 'polarsystem09@gmail.com'],
  ['Villadarez', 'Niña Nicole', 'villadareznn@gmail.com'],
  ['Najarro', 'Monica', 'monicanajarro111@gmail.com'],
  ['Galo', 'Margel Destine Krizia', 'destinegalo29@gmail.com'],
  ['Lanticse', 'Vince Clark', 'lanticsev@gmail.com'],
  ['Armamento', 'Justin Rey', 'justinrey312@gmail.com'],
  ['Salonga', 'Andre D.', 'andresalonga.cit@gmail.com'],
  ['Aytona', 'Rod Ivanne', 'rodayban@gmail.com'],
  ['Rentuma', 'Trixie Ann V.', 'trixieann750@gmail.com'],
  ['Arong', 'Kylene', 'kylenearong127@gmail.com'],
  ['Matsuda', 'Joji', 'rubyxmanalo@gmail.com'],
  ['Lacida', 'Zyrrah Kaye', 'zyrrahkayelacida@gmail.com'],
  ['Binagatan', 'Alexander Jr.', 'binagatanalexander2005@gmail.com'],
  ['Sy', 'Brye Kane', 'bryekanesy@gmail.com'],
  ['Cañete', 'Rod Gabrielle', 'rodgabriellecanete2002@gmail.com'],
  ['Morre', 'Lyndon Luke', 'morrelukerz@gmail.com'],
  ['Salutan', 'Sharaine Allyson', 'allysonsharaine@gmail.com'],
  ['Camoro', 'Mark Anton', 'markantoncamoro@gmail.com'],
  ['Cabataña', 'Chris Daniel', 'chrisdanielcabatana@gmail.com'],
  ['Tan', 'Christian Aire', 'christianaire18@gmail.com'],
  ['Cabalida', 'John Gil', 'jgcjgc123123@gmail.com'],
  ['Fernandez', 'Homer', 'homerfernandez213@gmail.com'],
  ['Banico', 'Joseph James', 'banicojosephjames@gmail.com'],
  ['Baldon', 'Kirsten Shane', 'kirstenshaneb@gmail.com'],
  ['Pangan', 'Arnnon Zevv', 'arnnon.pangan123@gmail.com'],
  ['Valmera', 'Harvey Rod Christian', 'valmera27@gmail.com'],
  ['Bramwell', 'Earion Icer', 'bramwellicer@gmail.com'],
  ['Batucan', 'Zly hanson', 'zlyhansonbatucan@gmail.com'],
  ['Belen', 'Gyrald Migel A.', 'gyraldmigelbelen4604@gmail.com'],
  ['Hudar', 'Charles Darwin', 'charlesdarwinhudar@gmail.com'],
  ['Ang', 'Joshua Phillip', 'Joshuaphillipanggamer@gmail.com'],
  ['Sia', 'David Ryan', 'davidrysia12@gmail.com'],
  ['Obejero', 'Kelvin Chad', 'obejerochad@gmail.com'],
  ['Igonia', 'Ashley', 'sonephoenix46@gmail.com'],
  ['Amad', 'Karylle', 'karylleamad1@gmail.com'],
  ['Esparcia', 'Earl Gerald', 'earlgeraldesparcia@gmail.com'],
  ['Geraldez', 'Junjie', 'geraldezjunjie@gmail.com'],
  ['Mando', 'Jhecy Leigh', 'jhecyleightolibasmando@gmail.com'],
];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function main() {
  let content = readFileSync(ROSTER_PATH, 'utf8');
  const updated = [];
  const missed = [];

  for (const [lastName, firstName, email] of UPDATES) {
    /**
     * The roster lays out each student as:
     *   lastName: 'X',
     *   firstName: 'Y',
     *   citEmail: 'Z',
     * Match all three lines together so we only touch the right student.
     */
    const re = new RegExp(
      `(lastName:\\s*'${escapeRegex(lastName)}',\\s*\\r?\\n\\s*firstName:\\s*'${escapeRegex(firstName)}',\\s*\\r?\\n\\s*citEmail:\\s*')[^']*('\\s*,)`
    );
    if (re.test(content)) {
      content = content.replace(re, `$1${email}$2`);
      updated.push(`${firstName} ${lastName}`);
    } else {
      missed.push(`${firstName} ${lastName}`);
    }
  }

  writeFileSync(ROSTER_PATH, content);

  console.log(`Updated ${updated.length}/${UPDATES.length} students.`);
  if (missed.length > 0) {
    console.log(`\nNot found (please re-check the spelling in roster):`);
    for (const name of missed) console.log(`  - ${name}`);
    process.exitCode = 1;
  }
}

main();
