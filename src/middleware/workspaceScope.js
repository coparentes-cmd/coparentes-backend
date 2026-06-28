/**
 * Workspace (family) isolation — workspaceId is the tenant / family_id.
 */
export function attachWorkspaceScope(req, _res, next) {
  if (req.user?.workspaceId) {
    req.workspaceId = req.user.workspaceId;
    req.familyId = req.user.workspaceId;
  }
  return next();
}

export function requireWorkspaceScope(req, res, next) {
  if (!req.user?.workspaceId) {
    return res.status(403).json({ error: 'workspace_required' });
  }

  req.workspaceId = req.user.workspaceId;
  req.familyId = req.user.workspaceId;
  return next();
}

export function assertWorkspaceMatch(resourceWorkspaceId, requestWorkspaceId) {
  if (!resourceWorkspaceId || !requestWorkspaceId) {
    const error = new Error('workspace_forbidden');
    error.statusCode = 403;
    throw error;
  }

  if (resourceWorkspaceId !== requestWorkspaceId) {
    const error = new Error('workspace_forbidden');
    error.statusCode = 403;
    throw error;
  }
}

export function workspaceWhere(req, extra = {}) {
  return {
    workspaceId: req.workspaceId,
    ...extra
  };
}
