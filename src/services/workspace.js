import { prisma } from '../lib/prisma.js';
import { createInviteCode } from '../utils/security.js';
import { env } from '../utils/env.js';
import { serializeChild, serializeUser } from './serializers.js';
import { CRYPTO_KEYS, encryptOptional, decryptOptionalSafe } from './crypto.service.js';

export function parentInviteExpiresAt(from = new Date()) {
  return new Date(from.getTime() + env.parentInviteTtlHours * 60 * 60 * 1000);
}

export function isParentInviteExpired(workspace) {
  if (!workspace?.inviteCodeExpiresAt) {
    return true;
  }
  return workspace.inviteCodeExpiresAt < new Date();
}

async function generateUniqueParentInviteCode(client = prisma) {
  let inviteCode = createInviteCode();
  let attempts = 0;

  while (attempts < 5) {
    const existingInvite = await client.workspace.findUnique({ where: { inviteCode } });
    if (!existingInvite) {
      return inviteCode;
    }
    inviteCode = createInviteCode();
    attempts += 1;
  }

  return inviteCode;
}

/** Unique invite code for one child profile (must not collide with workspace codes). */
export async function generateUniqueChildInviteCode(client = prisma) {
  let inviteCode = createInviteCode();
  let attempts = 0;

  while (attempts < 8) {
    const [onChild, onWorkspaceInvite, onWorkspaceChildInvite] = await Promise.all([
      client.child.findUnique({ where: { inviteCode } }),
      client.workspace.findUnique({ where: { inviteCode } }),
      client.workspace.findUnique({ where: { childInviteCode: inviteCode } })
    ]);
    if (!onChild && !onWorkspaceInvite && !onWorkspaceChildInvite) {
      return inviteCode;
    }
    inviteCode = createInviteCode();
    attempts += 1;
  }

  return inviteCode;
}

export async function refreshParentInviteCode(workspaceId, client = prisma) {
  const inviteCode = await generateUniqueParentInviteCode(client);
  return client.workspace.update({
    where: { id: workspaceId },
    data: {
      inviteCode,
      inviteCodeExpiresAt: parentInviteExpiresAt()
    }
  });
}

export async function workspaceHasParentB(workspaceId, client = prisma) {
  const parentB = await client.user.findFirst({
    where: { workspaceId, role: 'parentB', deletedAt: null }
  });
  return parentB != null;
}

/** Current active parentA/parentB user ids in a workspace (0–2). */
export async function listParentUserIds(workspaceId, client = prisma) {
  const parents = await client.user.findMany({
    where: {
      workspaceId,
      role: { in: ['parentA', 'parentB'] },
      deletedAt: null
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' }
  });
  return parents.map((row) => row.id);
}

/** Current active parentA/parentB e-mail addresses in a workspace (0–2). */
export async function listParentEmails(workspaceId, client = prisma) {
  const parents = await client.user.findMany({
    where: {
      workspaceId,
      role: { in: ['parentA', 'parentB'] },
      deletedAt: null
    },
    select: { email: true },
    orderBy: { createdAt: 'asc' }
  });
  return parents
    .map((p) => p.email)
    .filter((e) => typeof e === 'string' && e.length > 0);
}

export async function createWorkspace({ name, client = prisma }) {
  let inviteCode = createInviteCode();
  let childInviteCode = createInviteCode();
  let attempts = 0;

  while (attempts < 5) {
    const existingInvite = await client.workspace.findUnique({ where: { inviteCode } });
    const existingChildInvite = await client.workspace.findUnique({
      where: { childInviteCode }
    });
    if (!existingInvite && !existingChildInvite) {
      break;
    }
    if (existingInvite) {
      inviteCode = createInviteCode();
    }
    if (existingChildInvite) {
      childInviteCode = createInviteCode();
    }
    attempts += 1;
  }

  return client.workspace.create({
    data: {
      name,
      inviteCode,
      childInviteCode,
      inviteCodeExpiresAt: parentInviteExpiresAt()
    }
  });
}

export async function findWorkspaceByInviteCode(inviteCode) {
  return prisma.workspace.findUnique({
    where: { inviteCode: inviteCode.trim().toUpperCase() }
  });
}

export async function assertParentInviteJoinAllowed(workspace) {
  if (!workspace) {
    return { ok: false, error: 'workspace_not_found' };
  }

  if (await workspaceHasParentB(workspace.id)) {
    return { ok: false, error: 'parent_already_joined' };
  }

  if (isParentInviteExpired(workspace)) {
    return { ok: false, error: 'invite_expired' };
  }

  return { ok: true };
}

export async function findWorkspaceByChildInviteCode(childInviteCode) {
  return prisma.workspace.findUnique({
    where: { childInviteCode: childInviteCode.trim().toUpperCase() }
  });
}

export async function findChildByInviteCode(inviteCode) {
  const code = inviteCode.trim().toUpperCase();
  return prisma.child.findUnique({
    where: { inviteCode: code },
    include: {
      workspace: true,
      linkedAccount: true
    }
  });
}

export async function getChildJoinPreview(childInviteCode) {
  const code = childInviteCode.trim().toUpperCase();

  // Preferred: per-child invite code → one profile.
  const child = await findChildByInviteCode(code);
  if (child) {
    return {
      workspaceName: child.workspace.name,
      children: [
        {
          id: child.id,
          name: decryptOptionalSafe(child.name, CRYPTO_KEYS.KEY_GENERAL, 'Dziecko'),
          hasAccount: child.linkedAccount != null
        }
      ]
    };
  }

  // Legacy fallback: workspace-wide childInviteCode (pre per-child codes).
  const workspace = await findWorkspaceByChildInviteCode(code);
  if (!workspace) {
    return null;
  }

  const children = await prisma.child.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { name: 'asc' },
    include: { linkedAccount: { select: { id: true } } }
  });

  return {
    workspaceName: workspace.name,
    children: children.map((row) => ({
      id: row.id,
      name: decryptOptionalSafe(row.name, CRYPTO_KEYS.KEY_GENERAL, 'Dziecko'),
      hasAccount: row.linkedAccount != null
    }))
  };
}

export async function createChild({
  workspaceId,
  name,
  dateOfBirth,
  school
}) {
  const inviteCode = await generateUniqueChildInviteCode();
  const row = await prisma.child.create({
    data: {
      workspaceId,
      name: encryptOptional(name, CRYPTO_KEYS.KEY_GENERAL),
      dateOfBirth: new Date(dateOfBirth),
      school: encryptOptional(school ?? null, CRYPTO_KEYS.KEY_GENERAL),
      inviteCode
    },
    include: { linkedAccount: { select: { id: true } } }
  });

  return serializeChild(row);
}

export async function updateChild({
  workspaceId,
  childId,
  name,
  dateOfBirth,
  school
}) {
  const existing = await prisma.child.findFirst({
    where: { id: childId, workspaceId },
    include: { linkedAccount: { select: { id: true } } }
  });
  if (!existing) {
    return { error: 'child_not_found', status: 404 };
  }

  const data = {};
  if (name != null) {
    data.name = encryptOptional(name, CRYPTO_KEYS.KEY_GENERAL);
  }
  if (dateOfBirth != null) {
    data.dateOfBirth = new Date(dateOfBirth);
  }
  if (school !== undefined) {
    data.school = encryptOptional(school ?? null, CRYPTO_KEYS.KEY_GENERAL);
  }

  const row = await prisma.child.update({
    where: { id: childId },
    data,
    include: { linkedAccount: { select: { id: true } } }
  });

  return { child: serializeChild(row) };
}

export async function deleteChild({ workspaceId, childId }) {
  const existing = await prisma.child.findFirst({
    where: { id: childId, workspaceId },
    include: { linkedAccount: true }
  });
  if (!existing) {
    return { error: 'child_not_found', status: 404 };
  }

  await prisma.$transaction(async (tx) => {
    if (existing.linkedAccount) {
      await tx.user.update({
        where: { id: existing.linkedAccount.id },
        data: {
          deletedAt: new Date(),
          childProfileId: null,
          email: `deleted+${existing.linkedAccount.id}@accounts.coparentes.internal`,
          name: encryptOptional('Usunięte konto', CRYPTO_KEYS.KEY_GENERAL)
        }
      });
    }
    await tx.child.delete({ where: { id: childId } });
  });

  return { ok: true };
}

export async function updateWorkspaceName({ workspaceId, name }) {
  const trimmed = String(name ?? '').trim();
  if (trimmed.length < 2 || trimmed.length > 120) {
    return { error: 'invalid_request', status: 400 };
  }

  const row = await prisma.workspace.update({
    where: { id: workspaceId },
    data: { name: trimmed }
  });

  return { workspace: await getWorkspaceGraph(row.id) };
}

export async function getWorkspaceGraph(workspaceId) {
  let workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      users: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' }
      },
      children: {
        orderBy: { name: 'asc' },
        include: {
          linkedAccount: { select: { id: true } }
        }
      }
    }
  });

  if (!workspace) {
    return null;
  }

  const hasParentB = workspace.users.some((member) => member.role === 'parentB');
  if (!hasParentB && isParentInviteExpired(workspace)) {
    await refreshParentInviteCode(workspaceId);
    workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        users: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' }
        },
        children: {
          orderBy: { name: 'asc' },
          include: {
            linkedAccount: { select: { id: true } }
          }
        }
      }
    });
  }

  if (!workspace) {
    return null;
  }

  return {
    id: workspace.id,
    name: workspace.name,
    inviteCode: workspace.inviteCode,
    inviteCodeExpiresAt: workspace.inviteCodeExpiresAt
      ? workspace.inviteCodeExpiresAt.toISOString()
      : null,
    childInviteCode: workspace.childInviteCode,
    createdAt: workspace.createdAt.toISOString(),
    members: workspace.users.map(serializeUser),
    children: workspace.children.map(serializeChild)
  };
}

export async function buildAuthPayload(user) {
  const workspace = user.workspaceId
    ? await getWorkspaceGraph(user.workspaceId)
    : null;

  if (!workspace) {
    throw new Error('user_missing_workspace');
  }

  return {
    user: serializeUser(user),
    workspace
  };
}
