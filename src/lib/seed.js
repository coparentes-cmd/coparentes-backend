import bcrypt from 'bcryptjs';
import { prisma } from './prisma.js';
import { createIntegrityHash } from '../utils/security.js';
import { createWorkspace } from '../services/workspace.js';

const DEFAULT_TEST_EMAIL = 'test@coparentes.app';

function resolveSeedPassword(options = {}) {
  const password = options.password ?? process.env.SEED_TEST_PASSWORD;
  if (!password?.trim()) {
    throw new Error('SEED_TEST_PASSWORD is required when seeding test users');
  }
  return password;
}

export async function ensureTestUser(options = {}) {
  const email = (options.email ?? process.env.SEED_TEST_EMAIL ?? DEFAULT_TEST_EMAIL)
    .trim()
    .toLowerCase();
  const password = resolveSeedPassword(options);
  const workspaceName =
    options.workspaceName ?? process.env.SEED_TEST_WORKSPACE ?? 'Przestrzeń testowa';
  const passwordHash = await bcrypt.hash(password, 12);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({
      where: { email },
      data: {
        passwordHash,
        twoFactorEnabled: false
      }
    });
    console.log(`Ensured test user password: ${email}`);
    return { action: 'updated', email };
  }

  const workspace = await createWorkspace({ name: workspaceName });

  await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      name: 'Użytkownik testowy',
      email,
      passwordHash,
      role: 'parentA',
      twoFactorEnabled: false,
      highConflictMode: false
    }
  });

  await prisma.child.create({
    data: {
      workspaceId: workspace.id,
      name: 'Dziecko testowe',
      dateOfBirth: new Date('2016-03-20'),
      school: 'SP Testowa 1'
    }
  });

  console.log(`Seeded test user: ${email} (workspace invite ${workspace.inviteCode})`);
  return { action: 'created', email, inviteCode: workspace.inviteCode };
}

/** @deprecated Use ensureTestUser */
export async function seedTestUser(options = {}) {
  return ensureTestUser(options);
}

export async function seedDemoData(options = {}) {
  if (process.env.ALLOW_SEED !== 'true') {
    console.warn('[seed] ALLOW_SEED is not true — skipping demo data seed.');
    return;
  }

  const existingAnna = await prisma.user.findUnique({
    where: { email: 'anna@coparentes.app' }
  });
  if (existingAnna) {
    console.log('[seed] Demo Kowalscy already exists — skipping.');
    return;
  }

  console.warn('[seed] WARNING: Seeding demo accounts into the database.');
  if (!options.force) {
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return;
    }
  }

  const demoPassword = process.env.SEED_DEMO_PASSWORD?.trim();
  if (!demoPassword) {
    throw new Error('SEED_DEMO_PASSWORD is required when seeding demo data');
  }

  const passwordHash = await bcrypt.hash(demoPassword, 12);
  const workspace = await prisma.workspace.create({
    data: {
      id: 'ws_kowalscy',
      name: 'Rodzina Kowalska',
      inviteCode: 'KOWALSCY2026',
      childInviteCode: 'DZIECIKOWAL2026'
    }
  });

  const parentA = await prisma.user.create({
    data: {
      id: 'user_parent_a',
      workspaceId: workspace.id,
      name: 'Anna Kowalska',
      email: 'anna@coparentes.app',
      passwordHash,
      role: 'parentA',
      twoFactorEnabled: true
    }
  });

  await prisma.user.create({
    data: {
      id: 'user_parent_b',
      workspaceId: workspace.id,
      name: 'Marek Kowalski',
      email: 'marek@coparentes.app',
      passwordHash,
      role: 'parentB',
      twoFactorEnabled: true
    }
  });

  await prisma.user.create({
    data: {
      id: 'user_observer',
      workspaceId: workspace.id,
      name: 'Adw. Maria Nowak',
      email: 'maria@coparentes.app',
      passwordHash,
      role: 'observer',
      twoFactorEnabled: true
    }
  });

  const child = await prisma.child.create({
    data: {
      id: 'child_zosia',
      workspaceId: workspace.id,
      name: 'Zosia Kowalska',
      dateOfBirth: new Date('2016-05-12'),
      school: 'SP nr 15 w Warszawie'
    }
  });

  const threadHealth = await prisma.thread.create({
    data: {
      id: 'thread_health_1',
      workspaceId: workspace.id,
      subject: 'Wizyta u dentysty',
      category: 'Zdrowie',
      childId: child.id,
      createdById: parentA.id,
      audience: 'parents'
    }
  });

  await prisma.thread.create({
    data: {
      id: 'thread_family_1',
      workspaceId: workspace.id,
      subject: 'Rodzina',
      category: 'Rodzina',
      childId: null,
      createdById: parentA.id,
      audience: 'family'
    }
  });

  const threadSchool = await prisma.thread.create({
    data: {
      id: 'thread_school_1',
      workspaceId: workspace.id,
      subject: 'Angielski czwartek 17:00',
      category: 'Szkoła',
      childId: child.id,
      createdById: parentA.id,
      audience: 'parents'
    }
  });

  const firstPayload = {
    threadId: threadSchool.id,
    senderId: parentA.id,
    content:
      'Zosia ma zajęcia z angielskiego w czwartek o 17:00 przy ul. Mokotowskiej 12. Proszę o potwierdzenie odbioru.',
    sentAt: new Date().toISOString()
  };

  await prisma.message.create({
    data: {
      id: 'msg_school_1',
      threadId: threadSchool.id,
      workspaceId: workspace.id,
      senderId: parentA.id,
      senderName: 'Anna',
      content: firstPayload.content,
      tone: 'neutral',
      isRead: true,
      hash: createIntegrityHash(firstPayload)
    }
  });

  const secondPayload = {
    threadId: threadSchool.id,
    senderId: 'user_parent_b',
    content: 'Potwierdzam. Odbiorę Zosię punktualnie.',
    sentAt: new Date().toISOString()
  };

  await prisma.message.create({
    data: {
      id: 'msg_school_2',
      threadId: threadSchool.id,
      workspaceId: workspace.id,
      senderId: 'user_parent_b',
      senderName: 'Marek',
      content: secondPayload.content,
      tone: 'neutral',
      hash: createIntegrityHash(secondPayload)
    }
  });

  const healthPayload = {
    threadId: threadHealth.id,
    senderId: parentA.id,
    content:
      'Zosia była u dentysty. Koszt 280 PLN. Proszę o zwrot 140 PLN zgodnie z ustalonym podziałem.',
    sentAt: new Date().toISOString()
  };

  await prisma.message.create({
    data: {
      id: 'msg_health_1',
      threadId: threadHealth.id,
      workspaceId: workspace.id,
      senderId: parentA.id,
      senderName: 'Anna',
      content: healthPayload.content,
      tone: 'neutral',
      isRead: true,
      hash: createIntegrityHash(healthPayload)
    }
  });

  const exportPayload = {
    type: 'messages',
    workspaceId: workspace.id,
    generatedAt: new Date().toISOString(),
    items: [threadSchool.id, threadHealth.id]
  };

  await prisma.exportJob.create({
    data: {
      id: 'export_seed_messages',
      workspaceId: workspace.id,
      requestedById: parentA.id,
      type: 'messages',
      fromDate: new Date('2025-01-01'),
      toDate: new Date(),
      status: 'completed',
      downloadUrl: '/api/exports/export_seed_messages/download',
      manifestHash: createIntegrityHash(exportPayload),
      payloadJson: JSON.stringify(exportPayload)
    }
  });

  const now = new Date();
  const custodyDates = [];
  for (let offset = -7; offset <= 21; offset += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() + offset);
    date.setHours(12, 0, 0, 0);
    custodyDates.push(date);
  }

  await prisma.custodySlot.createMany({
    data: custodyDates.map((date, index) => ({
      id: `slot_seed_${index}`,
      workspaceId: workspace.id,
      date,
      custodian: index % 2 === 0 ? 'parentA' : 'parentB',
      handoverLocation: 'Szkoła SP nr 15',
      handoverTime: '16:00'
    }))
  });

  await prisma.calendarEvent.createMany({
    data: [
      {
        id: 'evt_seed_english',
        workspaceId: workspace.id,
        title: 'Angielski – Zosia',
        description: 'Zajęcia o 17:00',
        startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 17, 0, 0),
        type: 'school',
        childId: child.id,
        createdById: parentA.id,
        location: 'ul. Mokotowska 12'
      },
      {
        id: 'evt_seed_dentist',
        workspaceId: workspace.id,
        title: 'Dentysta – Zosia',
        description: 'Wizyta o 10:30',
        startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5, 10, 30, 0),
        type: 'medical',
        childId: child.id,
        createdById: parentA.id,
        location: 'Przychodnia Centrum'
      }
    ]
  });

  await prisma.swapRequest.create({
    data: {
      id: 'swap_seed_001',
      workspaceId: workspace.id,
      requesterId: 'user_parent_b',
      requesterName: 'Marek',
      originalDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 11, 12, 0, 0),
      proposedDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 18, 12, 0, 0),
      reason: 'Wyjazd służbowy do Krakowa',
      status: 'pending'
    }
  });

  const expensePayload = {
    title: 'Wizyta u dentysty – Zosia',
    amount: 280,
    workspaceId: workspace.id,
    paidById: parentA.id,
    date: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString()
  };

  await prisma.expense.create({
    data: {
      id: 'exp_seed_001',
      workspaceId: workspace.id,
      title: 'Wizyta u dentysty – Zosia',
      amount: 280,
      currency: 'PLN',
      category: 'Zdrowie',
      childId: child.id,
      paidById: parentA.id,
      splitRatio: 0.5,
      date: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1),
      status: 'pending',
      note: 'Plombowanie 2 zębów',
      hash: createIntegrityHash(expensePayload)
    }
  });
}
