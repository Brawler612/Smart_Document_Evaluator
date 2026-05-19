/**
 * Software Project Proposal — IT332 / CIT-U CCS.
 * Rubric: Weeks 7–8 **Project Proposal Guide** only (Parts 1–7, 100 points total).
 */

import type { RubricCriterionRow } from './geminiDocumentEvaluation.js';

export const SPP_WORKSHEET_PARTS = [
  'Part 1: Introduction (~300 words — background, RRL-supported importance, problem statement, research gap)',
  'Part 2: Objectives (3–4 SMART general objectives, specific objectives, research questions)',
  'Part 3: Methods (solution concept & users, development methodology, validation approach)',
  'Part 4: Expected System (MVP features, high-level workflow)',
  'Part 5: Discussion (scope, limitations, expected contribution)',
  'Part 6: Traceability Matrix (RRL finding → gap → research question → proposed function)',
  'Part 7: References (APA 7th edition)',
] as const;

/** Team block on the worksheet cover (checked within Part 1 evaluation by Gemini). */
export const SPP_TEAM_INFO_HINT =
  'Team Information: project title, short description (<20 words), team code, members 1–5.';

export type SppRubricCategory = 'Project Proposal Guide (Weeks 7–8)';

export type SppRubricDefinition = {
  id: number;
  name: string;
  category: SppRubricCategory;
  max: number;
  geminiFocus: string;
};

export const SPP_PROPOSAL_RUBRIC: SppRubricDefinition[] = [
  {
    id: 1,
    name: 'Part 1: Introduction',
    category: 'Project Proposal Guide (Weeks 7–8)',
    max: 15,
    geminiFocus: `Evaluate ONLY Part 1 (approx. 300 words). Also note if Team Information is complete (title, short description <20 words, team code, members 1–5).

Required in Part 1:
• Background: real-world situation, environment, stakeholders, consequences of not addressing the problem.
• RRL-supported importance: peer-reviewed journals, conference papers, or reputable academic sources cited.
• Formal problem statement: specific operational or technological challenge.
• Research gap: limitation or unresolved issue in existing studies/solutions showing novel contribution.`,
  },
  {
    id: 2,
    name: 'Part 2: Objectives',
    category: 'Project Proposal Guide (Weeks 7–8)',
    max: 15,
    geminiFocus: `Evaluate ONLY Part 2.

Required:
• Three to four general objectives following SMART (Specific, Measurable, Attainable, Relevant, Time-bound) — major outcomes such as designing, developing, evaluating, or implementing the system.
• Specific objectives: smaller tasks / engineering milestones (often map to main features or modules).
• Research questions: investigable inquiries aligned with objectives; what the project aims to discover or validate.`,
  },
  {
    id: 3,
    name: 'Part 3: Methods',
    category: 'Project Proposal Guide (Weeks 7–8)',
    max: 15,
    geminiFocus: `Evaluate ONLY Part 3 (three paragraph expectations).

Required:
• Paragraph 1 — Proposed solution concept: type of system, how it addresses the problem, target users/stakeholders.
• Paragraph 2 — Development methodology (e.g. Agile, Scrum, RAD): how it supports structured development, iterative improvement, systematic testing.
• Paragraph 3 — Validation approach: usability/UAT/performance/comparison; metrics and how effectiveness is demonstrated.`,
  },
  {
    id: 4,
    name: 'Part 4: Expected System',
    category: 'Project Proposal Guide (Weeks 7–8)',
    max: 14,
    geminiFocus: `Evaluate ONLY Part 4.

Required:
• MVP key features: core functionalities that demonstrate value toward solving the problem.
• High-level workflow: how users interact; information flow among inputs, processes, outputs (foundation for SRS/SDD).`,
  },
  {
    id: 5,
    name: 'Part 5: Discussion',
    category: 'Project Proposal Guide (Weeks 7–8)',
    max: 14,
    geminiFocus: `Evaluate ONLY Part 5.

Required:
• Scope: functionalities and operational coverage the system will include.
• Limitations: constraints (data, resources, connectivity, time, etc.).
• Expected contribution: how the solution improves processes, adds capabilities, or addresses the research gap from Part 1.`,
  },
  {
    id: 6,
    name: 'Part 6: Traceability Matrix',
    category: 'Project Proposal Guide (Weeks 7–8)',
    max: 14,
    geminiFocus: `Evaluate ONLY Part 6.

Required matrix columns populated with real content (not blank template rows):
• RRL Finding/Theme
• Identified Gap
• Research Question
• Proposed Function

Matrix must show research-driven features (literature → gap → question → function), not arbitrary features.`,
  },
  {
    id: 7,
    name: 'Part 7: References',
    category: 'Project Proposal Guide (Weeks 7–8)',
    max: 13,
    geminiFocus: `Evaluate ONLY Part 7.

Required:
• APA 7th edition citation style throughout the reference list.
• Sources primarily peer-reviewed journals and reputable academic publications.
• In-text citations in Part 1 should correspond to entries in Part 7.`,
  },
];

export const SPP_GEMINI_EVALUATOR_BRIEF = `Document type: Software Project Proposal — IT332, CIT-U College of Computer Studies.

Evaluate ONLY against the Weeks 7–8 **Project Proposal Guide** worksheet. There are exactly 7 rubric rows (Parts 1–7). Each rubric name in JSON must match character-for-character. Point values sum to 100.

${SPP_TEAM_INFO_HINT}

Worksheet parts:
${SPP_WORKSHEET_PARTS.map((p) => `• ${p}`).join('\n')}

Rules:
• Score each part 0 through its max points. Use the full range; weak or missing sections earn low scores.
• Comments: one cohesive academic paragraph (4–6 sentences) per part, like a thesis adviser review. Mention specific evidence (subsection names, cited authors, matrix columns, SMART objectives, etc.). Professional, constructive tone.
• Do NOT score institutional headers, timelines, repo links, or other items outside Parts 1–7 unless they appear inside the relevant part.
• executiveSummary: 1–2 paragraphs on overall proposal quality, then exactly:
  Strengths: bullet1; bullet2; bullet3 (3–5 concise strengths with optional short titles)
  Needs improvement: bullet1; bullet2 (2–4 items; if none major, suggest one forward-looking improvement)
• Return empty arrays for languageCorrections, correctHighlights, pageRewrites, documentOverviewScores, diagramEvaluations.`;

export type SppHeuristicContext = {
  allowedEmails?: Set<string>;
};

function norm(content: string): string {
  return content.toLowerCase().replace(/\s+/g, ' ');
}

function hasAny(content: string, terms: string[]): boolean {
  const n = norm(content);
  return terms.some((t) => n.includes(t));
}

function countHits(content: string, terms: string[]): number {
  const n = norm(content);
  return terms.reduce((acc, t) => (n.includes(t) ? acc + 1 : acc), 0);
}

function scoreRatio(hits: number, total: number, max: number): number {
  if (total <= 0) return 0;
  const ratio = hits / total;
  const base = Math.round(max * 0.35);
  return Math.min(max, Math.max(0, base + Math.round((max - base) * ratio)));
}

function sectionPresent(content: string, labels: string[]): boolean {
  const n = norm(content);
  return labels.some((l) => n.includes(l));
}

function partScore(
  def: SppRubricDefinition,
  content: string,
  checks: { labels: string[]; weight: number }[],
  passComment: string,
  failComment: string
): RubricCriterionRow {
  const t = content.trim();
  if (!t || t.length < 40) {
    return { name: def.name, score: 0, max: def.max, comment: 'Insufficient text to evaluate this part.' };
  }
  const totalWeight = checks.reduce((s, c) => s + c.weight, 0);
  const earned = checks.reduce(
    (s, c) => s + (sectionPresent(t, c.labels) || countHits(t, c.labels) > 0 ? c.weight : 0),
    0
  );
  const score = scoreRatio(earned, totalWeight, def.max);
  const threshold = Math.ceil(def.max * 0.65);
  return {
    name: def.name,
    score,
    max: def.max,
    comment: score >= threshold ? passComment : failComment,
  };
}

function scoreCriterion(def: SppRubricDefinition, content: string): RubricCriterionRow {
  const t = content.trim();
  const max = def.max;

  if (!t || t.length < 40) {
    return { name: def.name, score: 0, max, comment: 'Insufficient text to evaluate this part.' };
  }

  switch (def.id) {
    case 1: {
      const checks = [
        { labels: ['introduction', 'background', 'part 1'], weight: 2 },
        { labels: ['problem statement', 'statement of the problem'], weight: 2 },
        { labels: ['research gap', 'gap in', 'literature'], weight: 2 },
        { labels: ['rrl', 'related literature', 'peer-reviewed', 'journal', 'citation'], weight: 2 },
        { labels: ['stakeholder', 'consequence', 'environment'], weight: 1 },
        { labels: ['project title', 'team code', 'short description'], weight: 1 },
      ];
      return partScore(
        def,
        t,
        checks,
        'Part 1 covers background, RRL-supported importance, problem statement, and research gap.',
        'Expand Part 1 (~300 words): background with stakeholders, cited importance, formal problem statement, and research gap. Complete Team Information if missing.'
      );
    }
    case 2: {
      const smart = hasAny(t, ['smart', 'specific', 'measurable', 'attainable', 'time-bound', 'time bound']);
      const general = hasAny(t, ['general objective', 'objectives']);
      const specific = hasAny(t, ['specific objective', 'milestone', 'deliverable']);
      const rq = hasAny(t, ['research question', 'research questions']);
      let earned = 0;
      if (general) earned += 4;
      if (specific) earned += 4;
      if (rq) earned += 3;
      if (smart) earned += 2;
      const score = scoreRatio(Math.min(13, earned), 13, max);
      return {
        name: def.name,
        score,
        max,
        comment:
          score >= 10
            ? 'Part 2 includes SMART general objectives, specific objectives, and research questions.'
            : 'Part 2 needs 3–4 SMART general objectives, specific objectives (features/milestones), and aligned research questions.',
      };
    }
    case 3: {
      const checks = [
        { labels: ['solution', 'proposed system', 'concept'], weight: 2 },
        { labels: ['user', 'stakeholder', 'beneficiar'], weight: 1 },
        { labels: ['agile', 'scrum', 'rad', 'waterfall', 'methodology', 'development methodology'], weight: 2 },
        { labels: ['validation', 'usability', 'user acceptance', 'uat', 'testing', 'metric'], weight: 2 },
      ];
      return partScore(
        def,
        t,
        checks,
        'Part 3 describes solution concept, development methodology, and validation approach.',
        'Part 3 needs three parts: solution concept & users; methodology (Agile/Scrum/RAD); validation with metrics.'
      );
    }
    case 4: {
      const checks = [
        { labels: ['mvp', 'minimum viable', 'key feature', 'features', 'functionality'], weight: 3 },
        { labels: ['workflow', 'information flow', 'process flow', 'user interact'], weight: 3 },
        { labels: ['expected system', 'part 4'], weight: 1 },
      ];
      return partScore(
        def,
        t,
        checks,
        'Part 4 presents MVP features and a high-level system workflow.',
        'Part 4 needs MVP key features and a workflow showing inputs, processes, and outputs.'
      );
    }
    case 5: {
      const checks = [
        { labels: ['scope'], weight: 3 },
        { labels: ['limitation', 'constraints'], weight: 3 },
        { labels: ['contribution', 'significance', 'expected contribution', 'impact'], weight: 2 },
        { labels: ['discussion', 'part 5'], weight: 1 },
      ];
      return partScore(
        def,
        t,
        checks,
        'Part 5 defines scope, limitations, and expected contribution.',
        'Part 5 needs scope (what is included), limitations (constraints), and expected contribution to the research gap.'
      );
    }
    case 6: {
      const matrix = hasAny(t, ['traceability', 'traceability matrix', 'part 6']);
      const cols =
        countHits(t, ['rrl finding', 'identified gap', 'research question', 'proposed function']) +
        (hasAny(t, ['theme', 'gap', 'question', 'function']) ? 1 : 0);
      const score = matrix && cols >= 3 ? max : matrix ? Math.round(max * 0.55) : Math.round(max * 0.25);
      return {
        name: def.name,
        score,
        max,
        comment:
          score >= 9
            ? 'Part 6 Traceability Matrix links RRL findings, gaps, questions, and proposed functions.'
            : 'Complete Part 6 matrix columns: RRL Finding/Theme, Identified Gap, Research Question, Proposed Function (no blank rows).',
      };
    }
    case 7: {
      const refs = hasAny(t, ['references', 'bibliography', 'part 7']);
      const apaish = /\(\d{4}\)/.test(t) || /et al\./i.test(t) || /doi\.org/i.test(t) || /apa/i.test(t);
      const score = refs && apaish ? max : refs ? Math.round(max * 0.55) : Math.round(max * 0.2);
      return {
        name: def.name,
        score,
        max,
        comment: refs
          ? apaish
            ? 'Part 7 References use recognizable APA-style scholarly citations.'
            : 'Format Part 7 in APA 7th edition with peer-reviewed sources.'
          : 'Add Part 7 References in APA 7th edition with scholarly sources cited in Part 1.',
      };
    }
    default:
      return { name: def.name, score: 0, max, comment: 'Not evaluated.' };
  }
}

export function buildSppRubricTemplateRows(): RubricCriterionRow[] {
  return SPP_PROPOSAL_RUBRIC.map((d) => ({
    name: d.name,
    score: 0,
    max: d.max,
    comment: '',
  }));
}

export function buildSppHeuristicCriteria(
  content: string,
  _ctx: SppHeuristicContext = {}
): RubricCriterionRow[] {
  return SPP_PROPOSAL_RUBRIC.map((def) => scoreCriterion(def, content));
}

export function sppCriterionShortLabel(fullName: string): string {
  const stripped = fullName.replace(/^Part\s*\d+:\s*/i, '').trim();
  return stripped || fullName;
}

export function sppCriterionPartNumber(name: string): number {
  const m = name.match(/^Part\s*(\d+)/i);
  return m ? Number(m[1]) : 0;
}

export function alignCriteriaToSppRubric(criteria: RubricCriterionRow[]): RubricCriterionRow[] {
  const byName = new Map(criteria.map((c) => [c.name, c]));
  return SPP_PROPOSAL_RUBRIC.map((def) => {
    const hit = byName.get(def.name);
    if (hit) return { ...hit, name: def.name, max: def.max };
    return {
      name: def.name,
      score: 0,
      max: def.max,
      comment: 'Not scored in the last run — press Run SPP Evaluator again.',
    };
  });
}

export const SPP_RUBRIC_CATEGORIES: SppRubricCategory[] = ['Project Proposal Guide (Weeks 7–8)'];

export function isSppProposalRubric(criteria: { name: string }[]): boolean {
  if (criteria.length !== SPP_PROPOSAL_RUBRIC.length) return false;
  return criteria.every((c, i) => c.name === SPP_PROPOSAL_RUBRIC[i]?.name);
}

export function getSppCategoryForCriterion(name: string): SppRubricCategory | null {
  return SPP_PROPOSAL_RUBRIC.find((d) => d.name === name)?.category ?? null;
}

export function buildSppActionItemsMarkdown(criteria: RubricCriterionRow[]): string {
  const aligned = alignCriteriaToSppRubric(criteria);
  const weak = aligned.filter((c) => c.max > 0 && c.score / c.max < 0.75);
  const lines = [
    '# Revision notes — Project Proposal Guide (Weeks 7–8)',
    '',
    `Generated ${new Date().toISOString().slice(0, 10)}.`,
    '',
  ];
  if (weak.length === 0) {
    lines.push('All seven parts meet a passing level. Review with your adviser before final submission.');
  } else {
    weak.forEach((c) => {
      lines.push(`## ${c.name}`);
      lines.push('');
      lines.push(c.comment || 'Revise this section before submission.');
      lines.push('');
    });
  }
  return lines.join('\n');
}
