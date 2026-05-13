export type Team14Role = 'Leader' | 'Member';

export type Team14Member = {
  fullName: string;
  studentId: string;
  courseYear: string;
  citEmail: string;
  gmail: string;
  role: Team14Role;
};

/** Single source of truth for the Team 14 roster shown in both the teacher and student portals. */
export const TEAM_14: Team14Member[] = [
  {
    fullName: 'Alexandreinash Dinapo',
    studentId: '22-5471-353',
    courseYear: 'BSIT-4',
    citEmail: 'alexandreinash.dinapo@cit.edu',
    gmail: 'dinaponash26@gmail.com',
    role: 'Leader',
  },
  {
    fullName: 'Jushua Peter Te',
    studentId: '20-4539-311',
    courseYear: 'BSIT-4',
    citEmail: 'jushuapeter.te@cit.edu',
    gmail: 'jushuapeterte2@gmail.com',
    role: 'Member',
  },
  {
    fullName: 'Jeffer Azcona',
    studentId: '20-1096-892',
    courseYear: 'BSIT-4',
    citEmail: 'jeffer.azcona@cit.edu',
    gmail: 'jeffer.azcona21@gmail.com',
    role: 'Member',
  },
  {
    fullName: 'Ryan Bebiro',
    studentId: '22-2193-721',
    courseYear: 'BSIT-4',
    citEmail: 'ryan.bebiro@cit.edu',
    gmail: 'ryanbebiro7@gmail.com',
    role: 'Member',
  },
];
