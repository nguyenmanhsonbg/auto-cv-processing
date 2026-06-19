export enum UserRole {
  ADMIN = 'ADMIN',
  INTERVIEWER = 'INTERVIEWER',
  HR = 'HR',
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}
