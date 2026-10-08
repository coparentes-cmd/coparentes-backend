const PARENT_ROLES = new Set(['parentA', 'parentB']);
const MESSAGE_ROLES = new Set(['parentA', 'parentB', 'child']);
// Observer retired from product — kept in DB enum only; not a supported client role.
const NON_CHILD_ROLES = new Set(['parentA', 'parentB']);

/** Roles that must not receive sessions or API access. */
export function isRetiredAuthRole(role) {
  return role === 'observer';
}

export function requireParentRole(req, res, next) {
  if (!PARENT_ROLES.has(req.user?.role)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  return next();
}

export function requireParentOrChildMessage(req, res, next) {
  if (!MESSAGE_ROLES.has(req.user?.role)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  return next();
}

export function requireNonChildRole(req, res, next) {
  if (!NON_CHILD_ROLES.has(req.user?.role)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  return next();
}

export function requireRole(...roles) {
  const allowed = new Set(roles);

  return (req, res, next) => {
    if (!allowed.has(req.user?.role)) {
      return res.status(403).json({ error: 'forbidden' });
    }

    return next();
  };
}
