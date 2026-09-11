import type { AppRole } from './domain';

// Management and department boundaries shared by API actions and UI controls.
export const operationalPermissions: Record<string, readonly AppRole[]> = {
  'staff.manage': ['OWNER'],
  'property.manage': ['OWNER','MANAGER'],
  'rooms.manage': ['OWNER','MANAGER'],
  'maintenance.manage': ['OWNER','MANAGER'],
  'lostfound.manage': ['OWNER','MANAGER','RECEPTION'],
  'restaurant.manage': ['OWNER','MANAGER','RESTAURANT'],
};
export type OperationalPermission = 'staff.manage'|'property.manage'|'rooms.manage'|'maintenance.manage'|'lostfound.manage'|'restaurant.manage';
export const operationalRoleCan = (role: AppRole, permission: OperationalPermission) => operationalPermissions[permission].includes(role);
