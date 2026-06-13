import { prisma } from '../lib/prisma.js';
import { createInviteCode } from '../utils/security.js';
import { serializeChild, serializeUser } from './serializers.js';

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
      childInviteCode
    }
  });
}

export async function findWorkspaceByInviteCode(inviteCode) {
  return prisma.workspace.findUnique({
    where: { inviteCode: inviteCode.trim().toUpperCase() }
  });
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
      name,
      dateOfBirth: new Date(dateOfBirth),
      school: school ?? null
    }
  });

  return serializeChild(row);
}

export async function getWorkspaceGraph(workspaceId) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      users: { orderBy: { createdAt: 'asc' } },
      children: { orderBy: { name: 'asc' } }
    }
  });

  if (!workspace) {
    return null;
  }

  return {
    id: workspace.id,
    name: workspace.name,
    inviteCode: workspace.inviteCode,
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
