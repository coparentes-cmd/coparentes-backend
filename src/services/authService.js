import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import {
  buildAuthPayload,
  createWorkspace,
  findWorkspaceByChildInviteCode,
  findWorkspaceByInviteCode,
  assertParentInviteJoinAllowed,
  getChildJoinPreview
} from './workspace.js';
import { createSessionForUser, deleteAllSessionsForUser, deleteSession } from './session.js';
import {
  createLoginOtpChallenge,
  maskEmail,
  requiresEmailOtp,
  resendLoginOtpChallenge,
  verifyLoginOtpChallenge,
  invalidateUserSecurityArtifacts
} from './otp.service.js';
import {
  isTrustedDeviceValid,
  readTrustedDeviceToken
} from './trustedDevice.service.js';
import {
  saveRegistrationConsents,
  validateRequiredConsents
} from './consent.service.js';

function parseDateOfBirth(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function isSameCalendarDay(left, right) {
  return (
    left.getUTCFullYear() === right.getUTCFullYear() &&
    left.getUTCMonth() === right.getUTCMonth() &&
    left.getUTCDate() === right.getUTCDate()
  );
}

function childAccountEmail(childProfileId) {
  return `child+${childProfileId}@accounts.coparentes.internal`;
}

async function findChildByDateOfBirth(workspaceId, dateOfBirth) {
  const children = await prisma.child.findMany({
    where: { workspaceId },
    include: { linkedAccount: true }
  });

  return children.filter((child) => isSameCalendarDay(child.dateOfBirth, dateOfBirth));
}

export async function buildSessionPayload(user) {
  const token = await createSessionForUser(user.id);
  const { user: serializedUser, workspace } = await buildAuthPayload(user);
  return { token, user: serializedUser, workspace };
}

export async function registerUser({ name, email, password, workspaceName, consents, ipAddress }) {
  const consentCheck = validateRequiredConsents(consents);
  if (!consentCheck.ok) {
    return { error: consentCheck.error, status: 400 };
  }

  const existing = await prisma.user.findUnique({
    where: { email }
  });
  if (existing) {
    return { error: 'email_in_use', status: 409 };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.$transaction(async (tx) => {
    const workspace = await createWorkspace({ name: workspaceName, client: tx });
    const createdUser = await tx.user.create({
      data: {
        workspaceId: workspace.id,
        name,
        email,
        passwordHash,
        role: 'parentA',
        twoFactorEnabled: false,
        highConflictMode: false
      }
    });

    await saveRegistrationConsents({
      userId: createdUser.id,
      consents,
      ipAddress,
      client: tx
    });

    return createdUser;
  });

  return { user, status: 201 };
}

export async function fetchChildJoinPreview(childInviteCode) {
  const preview = await getChildJoinPreview(childInviteCode);
  if (!preview) {
    return { error: 'workspace_not_found', status: 404 };
  }
  return { preview };
}

export async function authenticateChildAccess({
  childInviteCode,
  dateOfBirth: dateOfBirthRaw,
  password,
  name
}) {
  const workspace = await findWorkspaceByChildInviteCode(childInviteCode);

  if (!workspace) {
    return { error: 'workspace_not_found', status: 404 };
  }

  const dateOfBirth = parseDateOfBirth(dateOfBirthRaw);
  if (!dateOfBirth) {
    return { error: 'invalid_date_of_birth', status: 400 };
  }

  const matches = await findChildByDateOfBirth(workspace.id, dateOfBirth);
  if (matches.length === 0) {
    return { error: 'child_not_found', status: 404 };
  }
  if (matches.length > 1) {
    return { error: 'ambiguous_child_profile', status: 409 };
  }

  const childProfile = matches[0];

  if (childProfile.linkedAccount) {
    const user = childProfile.linkedAccount;
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      return { error: 'invalid_credentials', status: 401 };
    }

    return { user, status: 200 };
  }

  if (!name) {
    return { error: 'child_name_required', status: 400 };
  }

  const email = childAccountEmail(childProfile.id);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: 'child_profile_taken', status: 409 };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      name,
      email,
      passwordHash,
      role: 'child',
      childProfileId: childProfile.id,
      twoFactorEnabled: false,
      highConflictMode: false
    }
  });

  return { user, status: 201 };
}

export async function joinWorkspace({
  inviteCode,
  childInviteCode,
  name,
  email,
  password,
  childProfileId
}) {
  const existing = await prisma.user.findUnique({
    where: { email }
  });
  if (existing) {
    return { error: 'email_in_use', status: 409 };
  }

  const isChildJoin = Boolean(childInviteCode);
  const workspace = isChildJoin
    ? await findWorkspaceByChildInviteCode(childInviteCode)
    : await findWorkspaceByInviteCode(inviteCode);

  if (!workspace) {
    return { error: 'workspace_not_found', status: 404 };
  }

  if (!isChildJoin) {
    const inviteCheck = await assertParentInviteJoinAllowed(workspace);
    if (!inviteCheck.ok) {
      const status = inviteCheck.error === 'workspace_not_found' ? 404 : 400;
      return { error: inviteCheck.error, status };
    }
  }

  if (isChildJoin) {
    if (!childProfileId) {
      return { error: 'child_profile_required', status: 400 };
    }

    const childProfile = await prisma.child.findFirst({
      where: { id: childProfileId, workspaceId: workspace.id },
      include: { linkedAccount: true }
    });

    if (!childProfile) {
      return { error: 'child_not_found', status: 400 };
    }

    if (childProfile.linkedAccount) {
      return { error: 'child_profile_taken', status: 409 };
    }
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      name,
      email,
      passwordHash,
      role: isChildJoin ? 'child' : 'parentB',
      childProfileId: isChildJoin ? childProfileId : null,
      twoFactorEnabled: false,
      highConflictMode: false
    }
  });

  return { user, status: 201 };
}

export async function loginUser({ email, password, req }) {
  const user = await prisma.user.findUnique({
    where: { email }
  });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: 'invalid_credentials', status: 401 };
  }

  if (!user.workspaceId) {
    return { error: 'user_missing_workspace', status: 403 };
  }

  const trustedToken = readTrustedDeviceToken(req);
  if (
    requiresEmailOtp(user) &&
    !(await isTrustedDeviceValid(user.id, trustedToken))
  ) {
    try {
      const { challenge, expiresAt, resendAvailableAt } =
        await createLoginOtpChallenge(user);
      return {
        requiresOtp: true,
        challengeId: challenge.id,
        email: maskEmail(user.email),
        expiresAt: expiresAt.toISOString(),
        resendAvailableAt: resendAvailableAt.toISOString(),
        status: 200
      };
    } catch (error) {
      if (
        error?.code === 'email_not_configured' ||
        error?.code === 'email_send_failed'
      ) {
        return { error: 'otp_email_failed', status: 503 };
      }
      throw error;
    }
  }

  return { user, status: 200 };
}

export async function verifyLoginOtp({ challengeId, code, trustDevice }) {
  const result = await verifyLoginOtpChallenge({
    challengeId,
    code,
    trustDevice: trustDevice === true
  });

  if (result.error) {
    if (result.error === 'invalid_otp') {
      return {
        error: 'invalid_otp',
        status: 401,
        attemptsRemaining: result.attemptsRemaining ?? 0,
        locked: result.locked === true
      };
    }
    if (result.error === 'otp_expired') {
      return { error: 'otp_expired', status: 410 };
    }
    if (result.error === 'otp_locked') {
      return { error: 'otp_locked', status: 429 };
    }
    return { error: result.error, status: 400 };
  }

  return {
    user: result.user,
    trustedDeviceToken: result.trustedDeviceToken,
    status: 200
  };
}

export async function resendLoginOtp(challengeId) {
  let result;
  try {
    result = await resendLoginOtpChallenge(challengeId);
  } catch (error) {
    if (
      error?.code === 'email_not_configured' ||
      error?.code === 'email_send_failed'
    ) {
      return { error: 'otp_email_failed', status: 503 };
    }
    throw error;
  }

  if (result.error) {
    if (result.error === 'resend_cooldown') {
      return {
        error: 'resend_cooldown',
        status: 429,
        resendAvailableAt: result.resendAvailableAt.toISOString()
      };
    }
    return { error: result.error, status: 400 };
  }

  return {
    challengeId: result.challenge.id,
    email: maskEmail(result.challenge.user?.email ?? ''),
    expiresAt: result.expiresAt.toISOString(),
    resendAvailableAt: result.resendAvailableAt.toISOString(),
    status: 200
  };
}

export async function getSessionPayload(user, sessionToken) {
  const { user: serializedUser, workspace } = await buildAuthPayload(user);
  return {
    token: sessionToken,
    user: serializedUser,
    workspace
  };
}

export async function logoutUser(sessionToken) {
  await deleteSession(sessionToken);
}

export async function updateUserProfile(userId, sessionToken, data) {
  const updates = {};

  if (data.name !== undefined) {
    updates.name = data.name;
  }
  if (data.highConflictMode !== undefined) {
    updates.highConflictMode = data.highConflictMode;
  }
  if (data.twoFactorEnabled !== undefined) {
    updates.twoFactorEnabled = data.twoFactorEnabled;
  }

  if (Object.keys(updates).length === 0) {
    return { error: 'invalid_request', status: 400 };
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: updates
  });

  const { user: serializedUser, workspace } = await buildAuthPayload(user);

  return {
    token: sessionToken,
    user: serializedUser,
    workspace,
    status: 200
  };
}

export async function changeUserPassword(userId, { currentPassword, newPassword }) {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return { error: 'invalid_credentials', status: 401 };
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash }
  });
  await deleteAllSessionsForUser(user.id);
  await invalidateUserSecurityArtifacts(user.id);

  return { success: true, status: 200 };
}
