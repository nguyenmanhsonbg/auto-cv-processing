export enum UserRole {
  ADMIN = 'ADMIN',
  INTERVIEWER = 'INTERVIEWER',
  HR = 'HR',
  FREELANCER = 'FREELANCER',
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}
