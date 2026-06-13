const PARENT_ROLES = new Set(['parentA', 'parentB']);
const MESSAGE_ROLES = new Set(['parentA', 'parentB', 'child']);

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

export function requireRole(...roles) {
  const allowed = new Set(roles);

  return (req, res, next) => {
    if (!allowed.has(req.user?.role)) {
      return res.status(403).json({ error: 'forbidden' });
    }

    return next();
  };
}
