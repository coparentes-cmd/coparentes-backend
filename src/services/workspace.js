import { prisma } from '../lib/prisma.js';
import { createInviteCode } from '../utils/security.js';
import { env } from '../utils/env.js';
import { serializeChild, serializeUser } from './serializers.js';
import { CRYPTO_KEYS, encryptOptional } from './crypto.service.js';

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
    where: { workspaceId, role: 'parentB' }
  });
  return parentB != null;
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

export async function getChildJoinPreview(childInviteCode) {
  const workspace = await findWorkspaceByChildInviteCode(childInviteCode);
  if (!workspace) {
    return null;
  }

  const children = await prisma.child.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      linkedAccount: { select: { id: true } }
    }
  });

  return {
    workspaceName: workspace.name,
    children: children.map((child) => ({
      id: child.id,
      name: child.name,
      hasAccount: child.linkedAccount != null
    }))
  };
}

export async function createChild({
  workspaceId,
  name,
  dateOfBirth,
  school
}) {
  const row = await prisma.child.create({
    data: {
      workspaceId,
      name: encryptOptional(name, CRYPTO_KEYS.KEY_GENERAL),
      dateOfBirth: new Date(dateOfBirth),
      school: encryptOptional(school ?? null, CRYPTO_KEYS.KEY_GENERAL)
    }
  });

  return serializeChild(row);
}

export async function getWorkspaceGraph(workspaceId) {
  let workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      users: { orderBy: { createdAt: 'asc' } },
      children: { orderBy: { name: 'asc' } }
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
        users: { orderBy: { createdAt: 'asc' } },
        children: { orderBy: { name: 'asc' } }
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
