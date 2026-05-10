/**
 * IT332 · Sem 2 · 2025–2026 team formation (G1–G7 = teams 2526-sem2-it332-01 … 07).
 * Source: “IT332-CS342 Team Formation 2025-2026.ods” — Member #1 = team lead.
 */

export type It332PlannedMember = {
  teamCode: string;
  memberNumber: number;
  studentSchoolId: string;
  lastName: string;
  firstName: string;
  citEmail: string;
};

/** Full cohort label for page copy */
export const IT332_COHORT_DESCRIPTOR = 'IT332 · Sem 2 · 2025–2026';

/** Academic / school year (scholastic). */
export const IT332_SEM2_SCHOOL_YEAR = '2025–2026';

/** Course + term for roster columns (“course & year” in semester sense). */
export const IT332_SEM2_COURSE_DISPLAY = 'IT332 · Sem 2';

/** @deprecated use IT332_COHORT_DESCRIPTOR */
export const IT332_SEM2_COURSE_LABEL = IT332_COHORT_DESCRIPTOR;

export const IT332_SEM2_PLANNED_ROSTER: It332PlannedMember[] = [
  {
    teamCode: '2526-sem2-it332-01',
    memberNumber: 1,
    studentSchoolId: '23-1603-575',
    lastName: 'Pacio',
    firstName: 'Muriel',
    citEmail: 'muriel.pacio@cit.edu',
  },
  {
    teamCode: '2526-sem2-it332-01',
    memberNumber: 2,
    studentSchoolId: '17-0545-444',
    lastName: 'Lim',
    firstName: 'Michelu',
    citEmail: 'michelutia.lim@cit.edu',
  },
  {
    teamCode: '2526-sem2-it332-01',
    memberNumber: 3,
    studentSchoolId: '23-2297-300',
    lastName: 'Casas',
    firstName: 'Elissa Mae',
    citEmail: 'elissamae.casas@cit.edu',
  },
  {
    teamCode: '2526-sem2-it332-01',
    memberNumber: 4,
    studentSchoolId: '23-1754-768',
    lastName: 'Base',
    firstName: 'Jascha',
    citEmail: 'jascha.base@cit.edu',
  },
  {
    teamCode: '2526-sem2-it332-01',
    memberNumber: 5,
    studentSchoolId: '23-4573-522',
    lastName: 'Leanda',
    firstName: 'John Luis',
    citEmail: 'johnluis.leanda@cit.edu',
  },
  {
    teamCode: '2526-sem2-it332-02',
    memberNumber: 1,
    studentSchoolId: '23-3947-568',
    lastName: 'Portes',
    firstName: 'Ed Lawrenz',
    citEmail: 'edlawrenz.portes@cit.edu',
  },
  {
    teamCode: '2526-sem2-it332-02',
    memberNumber: 2,
    studentSchoolId: '17-1113-413',
    lastName: 'Esdrelon',
    firstName: 'Mary Kaitlin Claire',
    citEmail: 'marykaitlinclaire.esdrelon@cit.edu',
  },
  {
    teamCode: '2526-sem2-it332-02',
    memberNumber: 3,
    studentSchoolId: '23-6700-709',
    lastName: 'Najarro',
    firstName: 'Monica',
    citEmail: 'monica.najarro@cit.edu',
  },
  {
    teamCode: '2526-sem2-it332-02',
    memberNumber: 4,
    studentSchoolId: '23-0145-113',
    lastName: 'Polancos',
    firstName: 'Mizzie',
    citEmail: 'mizzie.polancos@cit.edu',
  },
  {
    teamCode: '2526-sem2-it332-02',
    memberNumber: 5,
    studentSchoolId: '23-4551-411',
    lastName: 'Naranjo',
    firstName: 'Ana Claire Ellen',
    citEmail: 'anaclaireellen.naranjo@cit.edu',
  },
  {
    teamCode: '2526-sem2-it332-03',
    memberNumber: 1,
    studentSchoolId: '23-0496-403',
    lastName: 'Sanchez',
    firstName: 'Franz Raven',
    citEmail: 'franzraven.sanchez@cit.edu',
  },
  {
    teamCode: '2526-sem2-it332-03',
    memberNumber: 2,
    studentSchoolId: '23-1723-185',
    lastName: 'Canadilla',
    firstName: 'John Aaron',
    citEmail: 'johnaaron.canadilla@cit.edu',
  },
  {
    teamCode: '2526-sem2-it332-03',
    memberNumber: 3,
    studentSchoolId: '23-0112-653',
    lastName: 'Saligue',
    firstName: 'Kean Maverick',
    citEmail: 'keanmaverick.saligue@cit.edu',
  },
  {
    teamCode: '2526-sem2-it332-03',
    memberNumber: 4,
    studentSchoolId: '22-0241-200',
    lastName: 'Embalsado',
    firstName: 'Shinely Marie',
    citEmail: 'shinelymarie.embalsado@cit.edu',
  },
  {
    teamCode: '2526-sem2-it332-03',
    memberNumber: 5,
    studentSchoolId: '23-3174-814',
    lastName: 'Estrera',
    firstName: 'Michaela Ma. Alexa',
    citEmail: 'michaelamaalexa.estrera@cit.edu',
  },
  {
    teamCode: '2526-sem2-it332-04',
    memberNumber: 1,
    studentSchoolId: '20-7429-858',
    lastName: 'Ramos',
    firstName: 'Jeremiah',
    citEmail: 'jeremiah.ramos@cit.edu',
  },
  {
    teamCode: '2526-sem2-it332-04',
    memberNumber: 2,
    studentSchoolId: '23-1795-734',
    lastName: 'Villas',
    firstName: 'Ervin Louis',
    citEmail: 'ervinlouis.villas@cit.edu',
  },
  {
    teamCode: '2526-sem2-it332-04',
    memberNumber: 3,
    studentSchoolId: '23-1889-639',
    lastName: 'Dabon',
    firstName: 'Kenn Xavier',
    citEmail: 'kenn.dabon@cit.edu',
  },
  {
    teamCode: '2526-sem2-it332-04',
    memberNumber: 4,
    studentSchoolId: '12-0470-443',
    lastName: 'Migallos',
    firstName: 'Florence Azriel',
    citEmail: 'florenceazriel.migallos@cit.edu',
  },
  {
    teamCode: '2526-sem2-it332-04',
    memberNumber: 5,
    studentSchoolId: '23-1925-986',
    lastName: 'Abel',
    firstName: 'Zydric',
    citEmail: 'zydric.abel@cit.edu',
  },
  {
    teamCode: '2526-sem2-it332-05',
    memberNumber: 1,
    studentSchoolId: '23-1597-784',
    lastName: 'Policios',
    firstName: 'Andre',
    citEmail: 'andre.policios@cit.edu',
  },
  {
    teamCode: '2526-sem2-it332-05',
    memberNumber: 2,
    studentSchoolId: '13-2035-649',
    lastName: 'Narsico',
    firstName: 'Theodore Benjamin',
    citEmail: 'theodorebenjamin.narsico@cit.edu',
  },
  {
    teamCode: '2526-sem2-it332-05',
    memberNumber: 3,
    studentSchoolId: '23-5542-197',
    lastName: 'Cayacap',
    firstName: 'Denn Anton Marc',
    citEmail: 'dennantonmarc.cayacap@cit.edu',
  },
  {
    teamCode: '2526-sem2-it332-05',
    memberNumber: 4,
    studentSchoolId: '23-4767-121',
    lastName: 'Racaza',
    firstName: 'Cydric Luis',
    citEmail: 'cydricluis.racaza@cit.edu',
  },
  {
    teamCode: '2526-sem2-it332-05',
    memberNumber: 5,
    studentSchoolId: '22-5535-943',
    lastName: 'Dela Riarte',
    firstName: 'Dexter',
    citEmail: 'dexter.delariarte@cit.edu',
  },
  {
    teamCode: '2526-sem2-it332-06',
    memberNumber: 1,
    studentSchoolId: '2011-40169',
    lastName: 'Rosalina',
    firstName: 'Kremer',
    citEmail: 'kremer.rosalina@cit.edu',
  },
  {
    teamCode: '2526-sem2-it332-06',
    memberNumber: 2,
    studentSchoolId: '23-5186-858',
    lastName: 'Laputan',
    firstName: 'Sigrid Allison',
    citEmail: 'sigridallison.laputan@cit.edu',
  },
  {
    teamCode: '2526-sem2-it332-06',
    memberNumber: 3,
    studentSchoolId: '23-3765-495',
    lastName: 'Sala',
    firstName: 'Kirby Klent',
    citEmail: 'kirbyklent.sala@cit.edu',
  },
  {
    teamCode: '2526-sem2-it332-06',
    memberNumber: 4,
    studentSchoolId: '17-0792-565',
    lastName: 'Lim',
    firstName: 'Keith Danie',
    citEmail: 'keithdaniel.lim@cit.edu',
  },
  {
    teamCode: '2526-sem2-it332-06',
    memberNumber: 5,
    studentSchoolId: '23-1266-850',
    lastName: 'Quitayen',
    firstName: 'Glen Dale',
    citEmail: 'glendale.quitayen@cit.edu',
  },
  {
    teamCode: '2526-sem2-it332-07',
    memberNumber: 1,
    studentSchoolId: '23-1127-913',
    lastName: 'Chan',
    firstName: 'Lance Lemmor',
    citEmail: 'lancelemmor.chan@cit.edu',
  },
  {
    teamCode: '2526-sem2-it332-07',
    memberNumber: 2,
    studentSchoolId: '23-3638-561',
    lastName: 'Besañez',
    firstName: 'John Anthony',
    citEmail: 'johnanthony.besanez@cit.edu',
  },
  {
    teamCode: '2526-sem2-it332-07',
    memberNumber: 3,
    studentSchoolId: '17-0635-488',
    lastName: 'Ybañez',
    firstName: 'Liezel',
    citEmail: 'liezel.ybanez@cit.edu',
  },
  {
    teamCode: '2526-sem2-it332-07',
    memberNumber: 4,
    studentSchoolId: '21-4357-905',
    lastName: 'Cantero',
    firstName: 'Patrick James',
    citEmail: 'patrickjames.cantero@cit.edu',
  },
  {
    teamCode: '2526-sem2-it332-07',
    memberNumber: 5,
    studentSchoolId: '23-5450-886',
    lastName: 'Barangan',
    firstName: 'Mark Lorenz',
    citEmail: 'marklorenz.barangan@cit.edu',
  },
];
