export enum UserRole {
  ADMIN = 'ADMIN',
  INTERVIEWER = 'INTERVIEWER',
  COMMITTEE = 'COMMITTEE',
  HR = 'HR',
  FREELANCER = 'FREELANCER',
  INTERNAL = 'INTERNAL',
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  roles: UserRole[];
  createdAt: string;
  updatedAt: string;
}
