import { prisma } from '../lib/prisma.js';
import { createInviteCode } from '../utils/security.js';
import { serializeChild, serializeUser } from './serializers.js';

export async function createWorkspace({ name, client = prisma }) {
  let inviteCode = createInviteCode();
  let attempts = 0;

  while (attempts < 5) {
    const existing = await client.workspace.findUnique({ where: { inviteCode } });
    if (!existing) {
      break;
    }
    inviteCode = createInviteCode();
    attempts += 1;
  }

  return client.workspace.create({
    data: {
      name,
      inviteCode
    }
  });
}

export async function findWorkspaceByInviteCode(inviteCode) {
  return prisma.workspace.findUnique({
    where: { inviteCode: inviteCode.trim().toUpperCase() }
  });
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
