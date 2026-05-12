/**
 * Generates TS roster entries from unzipped ODS content.xml.
 * Filters IT332 Sem 2 teams 01–65 (G1–G65). Run:
 * node scripts/gen-it332-roster-snippet.mjs C:/path/to/content.xml
 */
import fs from 'fs';

function stripTags(s) {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

const [, , xmlPath] = process.argv;
if (!xmlPath) {
  console.error('usage: node scripts/gen-it332-roster-snippet.mjs <content.xml>');
  process.exit(1);
}
const xml = fs.readFileSync(xmlPath, 'utf8');
const slice = xml.slice(xml.indexOf('<table:table '));
const rows = slice.split('<table:table-row').slice(1);

const TEAM_RE = /^2526-sem2-it332-(\d{2})$/;

for (const row of rows) {
  const texts = [...row.matchAll(/<text:p[^>]*>([\s\S]*?)<\/text:p>/g)]
    .map((m) => stripTags(m[1]))
    .filter(Boolean);
  if (texts.length < 6) continue;
  const [teamCode, memberStr, studentId, lastName, firstName, email] = texts;
  if (!TEAM_RE.test(teamCode)) continue;
  const n = Number(teamCode.slice(-2));
  if (n < 1 || n > 65) continue;
  if (!/^[\w.-]+@[\w.-]+\.[a-z]+$/i.test(email)) continue;
  const member = Number(memberStr);
  if (!Number.isFinite(member)) continue;

  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  console.log(`  {
    teamCode: '${esc(teamCode)}',
    memberNumber: ${member},
    studentSchoolId: '${esc(studentId)}',
    lastName: '${esc(lastName)}',
    firstName: '${esc(firstName)}',
    citEmail: '${esc(email)}',
  },`);
}
