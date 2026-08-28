import { UserRole } from '@interview-assistant/shared';

export interface RoleAwareUser {
  role?: UserRole | string | null;
  roles?: readonly (UserRole | string)[] | null;
}

const USER_ROLES = new Set<string>(Object.values(UserRole));

function isUserRole(value: UserRole | string): value is UserRole {
  return USER_ROLES.has(value);
}

export function getUserRoles(user: RoleAwareUser | null | undefined): UserRole[] {
  if (!user) return [];

  const candidates = [...(user.roles ?? [])];
  if (user.role) candidates.push(user.role);

  return [...new Set(candidates.filter(isUserRole))];
}

export function hasUserRole(user: RoleAwareUser | null | undefined, role: UserRole): boolean {
  return getUserRoles(user).includes(role);
}
