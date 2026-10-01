// Staff roles and what each may do. Least privilege: every admin endpoint
// names the one permission it needs.
export const ROLES = ['user', 'analyst', 'support', 'moderator', 'admin', 'owner'];

export const ROLE_INFO = {
  user: 'No admin access.',
  analyst: 'Reads analytics and the models people make.',
  support: 'Helps people: views accounts, watches a live studio, signs people out and makes password reset links.',
  moderator: 'Keeps the site clean: bans, saved designs and the community gallery.',
  admin: 'Everything except managing owners and security policy.',
  owner: 'Everything, including roles, two-factor policy and the audit log.',
};

const PERMS = {
  'analytics.view': ['analyst', 'support', 'moderator', 'admin', 'owner'],
  'models.view': ['analyst', 'support', 'admin', 'owner'],
  'live.view': ['support', 'admin', 'owner'],
  'users.view': ['support', 'moderator', 'admin', 'owner'],
  'users.manage': ['support', 'admin', 'owner'],
  'users.delete': ['admin', 'owner'],
  'users.roles': ['admin', 'owner'],
  'bans.manage': ['moderator', 'admin', 'owner'],
  'designs.manage': ['moderator', 'admin', 'owner'],
  'templates.manage': ['admin', 'owner'],
  'engine.manage': ['admin', 'owner'],
  'settings.manage': ['admin', 'owner'],
  'forum.manage': ['admin', 'owner'],
  'site.lock': ['admin', 'owner'],
  'blog.write': ['admin', 'owner'],
  'contests.manage': ['admin', 'owner'],
  'billing.manage': ['admin', 'owner'],
  'billing.keys': ['owner'],
  'logs.view': ['admin', 'owner'],
  'audit.view': ['admin', 'owner'],
  'security.manage': ['owner'],
  // Full backups hold every account's email and password hash.
  'data.backup': ['owner'],
  // The tool tracer's private docs and its reference pictures: kept under wraps.
  'tracer.private': ['owner'],
};

export const PERMISSIONS = Object.keys(PERMS);
export const isStaff = (user) => Boolean(user && ROLES.includes(user.role) && user.role !== 'user');
export const can = (user, perm) => Boolean(user && PERMS[perm]?.includes(user.role));
export const permissionsFor = (role) => PERMISSIONS.filter((p) => PERMS[p].includes(role));

// Roles `actor` may hand out: owners any; admins up to moderator.
export function assignableRoles(actor) {
  if (actor?.role === 'owner') return ROLES;
  if (actor?.role === 'admin') return ['user', 'analyst', 'support', 'moderator'];
  return [];
}
