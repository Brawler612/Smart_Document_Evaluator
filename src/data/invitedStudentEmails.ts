/**
 * Personal Gmail addresses for the IT332/CS342 cohort that we are explicitly
 * inviting to evaluate Smart Docs Validator. When any of these accounts signs
 * in we surface a one-time in-app invitation card with a "Rate us" CTA — the
 * card is dismissible per-user (see `StudentInvitationCard`).
 *
 * Keep this list in sync with `src/data/it332Sem2ClassRoster.ts`. Every email
 * here also appears as the `citEmail` of the matching student row, which is
 * what `getInvitedStudentRosterEntry` uses to recover the student's full name
 * for the personalized greeting.
 */

import {
  IT332_SEM2_PLANNED_ROSTER,
  type It332PlannedMember,
} from './it332Sem2ClassRoster';

/** Static, alphabetised by gmail handle. 45 entries — one per invited student. */
export const INVITED_STUDENT_GMAILS = [
  'allysonsharaine@gmail.com',
  'anaclaireellen@gmail.com',
  'andresalonga.cit@gmail.com',
  'arnnon.pangan123@gmail.com',
  'banicojosephjames@gmail.com',
  'binagatanalexander2005@gmail.com',
  'bramwellicer@gmail.com',
  'brawler612@gmail.com',
  'bryekanesy@gmail.com',
  'charlesdarwinhudar@gmail.com',
  'chrisdanielcabatana@gmail.com',
  'christianaire18@gmail.com',
  'davidrysia12@gmail.com',
  'destinegalo29@gmail.com',
  'drakathrosalina@gmail.com',
  'earlgeraldesparcia@gmail.com',
  'geraldezjunjie@gmail.com',
  'gyraldmigelbelen4604@gmail.com',
  'homerfernandez213@gmail.com',
  'jgcjgc123123@gmail.com',
  'jhecyleightolibasmando@gmail.com',
  'joshuaphillipanggamer@gmail.com',
  'justinrey312@gmail.com',
  'karylleamad1@gmail.com',
  'kirstenshaneb@gmail.com',
  'kylenearong127@gmail.com',
  'lanticsev@gmail.com',
  'marklorenzbarangan@gmail.com',
  'markantoncamoro@gmail.com',
  'monicanajarro111@gmail.com',
  'morrelukerz@gmail.com',
  'obejerochad@gmail.com',
  'polarsystem09@gmail.com',
  'rodayban@gmail.com',
  'rodgabriellecanete2002@gmail.com',
  'rubyxmanalo@gmail.com',
  'sheshtyz@gmail.com',
  'sonephoenix46@gmail.com',
  'tedbennarsico04@gmail.com',
  'trafalgardreii@gmail.com',
  'trixieann750@gmail.com',
  'valmera27@gmail.com',
  'villadareznn@gmail.com',
  'zlyhansonbatucan@gmail.com',
  'zyrrahkayelacida@gmail.com',
] as const;

/** Lower-cased lookup set so checks are case-insensitive without re-allocating per call. */
const NORMALIZED_INVITED_GMAILS = new Set<string>(
  INVITED_STUDENT_GMAILS.map((e) => e.toLowerCase())
);

/** Returns true when the given email matches one of the invited students. */
export function isInvitedStudent(email: string | null | undefined): boolean {
  if (!email) return false;
  return NORMALIZED_INVITED_GMAILS.has(email.trim().toLowerCase());
}

/**
 * Recovers the planned-roster row for an invited student so we can address
 * them by their official `firstName lastName` instead of the raw OAuth name.
 * Returns null when the email is not part of the invited cohort.
 */
export function getInvitedStudentRosterEntry(
  email: string | null | undefined
): It332PlannedMember | null {
  if (!email) return null;
  const target = email.trim().toLowerCase();
  return (
    IT332_SEM2_PLANNED_ROSTER.find(
      (m) => m.citEmail.trim().toLowerCase() === target
    ) ?? null
  );
}
