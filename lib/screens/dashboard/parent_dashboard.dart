import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/models.dart';
import '../../providers/app_provider.dart';
import '../../theme/app_theme.dart';
import '../../widgets/common_widgets.dart';
import '../../widgets/brand_widgets.dart';
import '../messaging/messaging_screen.dart';
import '../calendar/calendar_screen.dart';
import '../finance/finance_screen.dart';
import '../exports/exports_screen.dart';
import '../documents/documents_screen.dart';
import '../ai_coach/ai_coach_screen.dart';
import '../settings/settings_screen.dart';

class ParentDashboard extends StatefulWidget {
  const ParentDashboard({super.key});

  @override
  State<ParentDashboard> createState() => _ParentDashboardState();
}

class _ParentDashboardState extends State<ParentDashboard> {
  int _selectedIndex = 0;

  final List<Widget> _screens = const [
    _DashboardHome(),
    MessagingScreen(),
    CalendarScreen(),
    FinanceScreen(),
    DocumentsScreen(),
    ExportsScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AppProvider>().currentUser;
    final isParentA = user?.role == UserRole.parentA;

    return Scaffold(
      body: IndexedStack(index: _selectedIndex, children: _screens),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          boxShadow: [
            BoxShadow(
              color: Color(0x14000000),
              blurRadius: 12,
              offset: Offset(0, -2),
            ),
          ],
        ),
        child: BottomNavigationBar(
          currentIndex: _selectedIndex,
          onTap: (i) => setState(() => _selectedIndex = i),
          type: BottomNavigationBarType.fixed,
          backgroundColor: Colors.white,
          selectedItemColor: isParentA
              ? AppTheme.parentAColor
              : AppTheme.parentBColor,
          unselectedItemColor: AppTheme.textHint,
          selectedLabelStyle: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w600,
          ),
          unselectedLabelStyle: const TextStyle(fontSize: 11),
          elevation: 0,
          items: [
            const BottomNavigationBarItem(
              icon: Icon(Icons.dashboard_outlined),
              activeIcon: Icon(Icons.dashboard),
              label: 'Start',
            ),
            BottomNavigationBarItem(
              icon: Stack(
                children: [
                  const Icon(Icons.chat_bubble_outline),
                  Positioned(
                    right: 0,
                    top: 0,
                    child: Consumer<MessagingProvider>(
                      builder: (_, mp, __) {
                        final unread =
                            mp.threads.where((t) => t.hasUnread).length;
                        if (unread == 0) return const SizedBox.shrink();
                        return Container(
                          width: 8,
                          height: 8,
                          decoration: const BoxDecoration(
                            color: AppTheme.errorColor,
                            shape: BoxShape.circle,
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
              activeIcon: const Icon(Icons.chat_bubble),
              label: 'Czat',
            ),
            const BottomNavigationBarItem(
              icon: Icon(Icons.calendar_month_outlined),
              activeIcon: Icon(Icons.calendar_month),
              label: 'Kalendarz',
            ),
            const BottomNavigationBarItem(
              icon: Icon(Icons.account_balance_wallet_outlined),
              activeIcon: Icon(Icons.account_balance_wallet),
              label: 'Finanse',
            ),
            const BottomNavigationBarItem(
              icon: Icon(Icons.folder_open_outlined),
              activeIcon: Icon(Icons.folder_open),
              label: 'Documents',
            ),
            const BottomNavigationBarItem(
              icon: Icon(Icons.folder_special_outlined),
              activeIcon: Icon(Icons.folder_special),
              label: 'Eksporty',
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Dashboard Home ────────────────────────────────────────────────────────────

class _DashboardHome extends StatelessWidget {
  const _DashboardHome();

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AppProvider>().currentUser;
    final workspace = context.watch<AppProvider>().currentWorkspace;
    final aiCoach = context.watch<AppProvider>().aiCoachEnabled;
    final aiShield = context.watch<AppProvider>().aiShieldEnabled;
    final highConflict = context.watch<AppProvider>().highConflictMode;
    final messaging = context.watch<MessagingProvider>();
    final finance = context.watch<FinanceProvider>();
    final calendar = context.watch<CalendarProvider>();

    final now = DateTime.now();
    final todaySlots = calendar.getSlotsForDay(now);
    final todayEvents = calendar.getEventsForDay(now);
    final pendingSwaps = calendar.swapRequests
        .where((s) => s.status == SwapStatus.pending)
        .length;
    final unreadMessages =
        messaging.threads.where((t) => t.hasUnread).length;

    final isParentA = user?.role == UserRole.parentA;
    final roleColor = isParentA ? AppTheme.parentAColor : AppTheme.parentBColor;

    final custodyText = todaySlots.isNotEmpty
        ? (todaySlots.first.custodian == UserRole.parentA
              ? 'U Mamy'
              : 'U Taty')
        : 'Brak danych';

    final firstName = user?.name.split(' ').first ?? '';

    return Scaffold(
      backgroundColor: AppTheme.surfaceColor,
      body: CustomScrollView(
        slivers: [
          // App Bar
          SliverAppBar(
            expandedHeight: 130,
            floating: false,
            pinned: true,
            backgroundColor: roleColor,
            automaticallyImplyLeading: false,
            flexibleSpace: FlexibleSpaceBar(
              background: Container(
                color: roleColor,
                child: SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 14, 20, 14),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        // Title
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const BrandLogo(width: 112, height: 34),
                              const SizedBox(height: 10),
                              Text(
                                'Dzień dobry, $firstName',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 22,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const SizedBox(height: 3),
                              Text(
                                workspace?.name ?? '',
                                style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.75),
                                  fontSize: 13,
                                ),
                              ),
                              if (highConflict) ...[
                                const SizedBox(height: 6),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8,
                                    vertical: 3,
                                  ),
                                  decoration: BoxDecoration(
                                    color: AppTheme.highConflictColor,
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: const Text(
                                    'Tryb HC aktywny',
                                    style: TextStyle(
                                      color: Colors.white,
                                      fontSize: 10,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                        // Profile avatar + gear button
                        GestureDetector(
                          onTap: () => _openSettings(context),
                          child: SizedBox(
                            width: 52,
                            height: 52,
                            child: Stack(
                              clipBehavior: Clip.none,
                              children: [
                                // Avatar circle
                                CircleAvatar(
                                  radius: 22,
                                  backgroundColor:
                                      Colors.white.withValues(alpha: 0.22),
                                  child: Text(
                                    firstName.isNotEmpty ? firstName[0] : '?',
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontWeight: FontWeight.bold,
                                      fontSize: 18,
                                    ),
                                  ),
                                ),
                                // Gear icon badge
                                Positioned(
                                  right: -4,
                                  top: -4,
                                  child: Container(
                                    width: 20,
                                    height: 20,
                                    decoration: BoxDecoration(
                                      color: Colors.white.withValues(alpha: 0.9),
                                      shape: BoxShape.circle,
                                    ),
                                    child: Icon(
                                      Icons.settings,
                                      size: 13,
                                      color: roleColor,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),

          SliverToBoxAdapter(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 16),

                // Today custody status card
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: _TodayCard(
                    custodyText: custodyText,
                    todayEvents: todayEvents,
                    pendingSwaps: pendingSwaps,
                    roleColor: roleColor,
                  ),
                ),

                const SizedBox(height: 16),

                // AI Status bar
                if (aiCoach || aiShield)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: _AiStatusBar(
                      aiCoach: aiCoach,
                      aiShield: aiShield,
                    ),
                  ),

                // AI contextual tips
                if (aiCoach)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: AiContextualTip(tips: AiTips.dashboard),
                  ),

                const SizedBox(height: 16),

                // Quick stats row
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Row(
                    children: [
                      Expanded(
                        child: _StatCard(
                          label: 'Nowe wiad.',
                          value: unreadMessages.toString(),
                          icon: Icons.chat_bubble,
                          color: AppTheme.primaryTeal,
                          onTap: () {},
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _StatCard(
                          label: 'Do zwrotu',
                          value:
                              '${finance.totalPending.toStringAsFixed(0)} PLN',
                          icon: Icons.account_balance_wallet,
                          color: AppTheme.warningColor,
                          onTap: () {},
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _StatCard(
                          label: 'Zamiany',
                          value: pendingSwaps.toString(),
                          icon: Icons.swap_horiz,
                          color: AppTheme.parentBColor,
                          onTap: () {},
                        ),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 20),

                // Recent messages section
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 16),
                  child: Text(
                    'Ostatnie wiadomości',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                ...messaging.threads
                    .take(3)
                    .map((t) => _MessageThreadPreview(thread: t)),

                const SizedBox(height: 20),

                // Finance snapshot
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 16),
                  child: Text(
                    'Finanse – ten miesiąc',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                _FinanceSnapshotCard(finance: finance),

                const SizedBox(height: 20),

                // Children section
                if (workspace != null && workspace.children.isNotEmpty) ...[
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16),
                    child: Text(
                      'Dzieci',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    height: 100,
                    child: ListView.builder(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      itemCount: workspace.children.length,
                      itemBuilder: (ctx, i) {
                        final child = workspace.children[i];
                        return _ChildChip(child: child);
                      },
                    ),
                  ),
                ],

                const SizedBox(height: 30),

                // AI Coach CTA
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: _AiCoachCta(),
                ),
                const SizedBox(height: 30),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _openSettings(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const SettingsScreen()),
    );
  }
}

// ─── Subwidgets ────────────────────────────────────────────────────────────────

class _TodayCard extends StatelessWidget {
  final String custodyText;
  final List<CalendarEvent> todayEvents;
  final int pendingSwaps;
  final Color roleColor;

  const _TodayCard({
    required this.custodyText,
    required this.todayEvents,
    required this.pendingSwaps,
    required this.roleColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: roleColor.withValues(alpha: 0.08),
            blurRadius: 12,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Icon(Icons.home, color: roleColor, size: 20),
                  const SizedBox(width: 8),
                  Text(
                    'Dziś: $custodyText',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: roleColor,
                    ),
                  ),
                ],
              ),
              if (pendingSwaps > 0)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 3,
                  ),
                  decoration: BoxDecoration(
                    color: AppTheme.warningColor.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    '$pendingSwaps zamiana',
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppTheme.warningColor,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
            ],
          ),
          if (todayEvents.isNotEmpty) ...[
            const SizedBox(height: 12),
            const Divider(height: 1),
            const SizedBox(height: 12),
            ...todayEvents.take(3).map(
              (e) => Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(
                  children: [
                    Icon(e.typeIcon, color: e.typeColor, size: 16),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        e.title,
                        style: const TextStyle(
                          fontSize: 13,
                          color: AppTheme.textPrimary,
                        ),
                      ),
                    ),
                    if (e.description != null)
                      Text(
                        e.description!,
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppTheme.textSecondary,
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ] else ...[
            const SizedBox(height: 8),
            const Text(
              'Brak zaplanowanych zdarzeń na dziś',
              style: TextStyle(fontSize: 13, color: AppTheme.textSecondary),
            ),
          ],
        ],
      ),
    );
  }
}

class _AiStatusBar extends StatelessWidget {
  final bool aiCoach;
  final bool aiShield;

  const _AiStatusBar({required this.aiCoach, required this.aiShield});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        color: AppTheme.aiCoachColor.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: AppTheme.aiCoachColor.withValues(alpha: 0.2),
        ),
      ),
      child: Row(
        children: [
          const Icon(Icons.auto_awesome, color: AppTheme.aiCoachColor, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              [
                if (aiCoach) 'AI Coach aktywny',
                if (aiShield) 'AI Shield aktywny',
              ].join(' · '),
              style: const TextStyle(
                fontSize: 13,
                color: AppTheme.aiCoachColor,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          const Text(
            'AKTYWNE',
            style: TextStyle(
              fontSize: 10,
              color: AppTheme.aiCoachColor,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  const _StatCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          boxShadow: [
            BoxShadow(
              color: color.withValues(alpha: 0.08),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(height: 8),
            Text(
              value,
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: color,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: const TextStyle(
                fontSize: 10,
                color: AppTheme.textSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MessageThreadPreview extends StatelessWidget {
  final MessageThread thread;

  const _MessageThreadPreview({required this.thread});

  @override
  Widget build(BuildContext context) {
    final lastMsg = thread.messages.isNotEmpty ? thread.messages.last : null;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => MessagingScreen(openThreadId: thread.id),
              ),
            );
          },
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: thread.categoryColor.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(
                    thread.categoryIcon,
                    color: thread.categoryColor,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            thread.subject,
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: thread.hasUnread
                                  ? FontWeight.w700
                                  : FontWeight.w500,
                              color: AppTheme.textPrimary,
                            ),
                          ),
                          Text(
                            _formatTime(thread.lastActivity),
                            style: const TextStyle(
                              fontSize: 11,
                              color: AppTheme.textHint,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 3),
                      if (lastMsg != null)
                        Text(
                          '${lastMsg.senderName}: ${lastMsg.content}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 12,
                            color: thread.hasUnread
                                ? AppTheme.textPrimary
                                : AppTheme.textSecondary,
                            fontWeight: thread.hasUnread
                                ? FontWeight.w500
                                : FontWeight.normal,
                          ),
                        ),
                    ],
                  ),
                ),
                if (thread.hasUnread) ...[
                  const SizedBox(width: 8),
                  Container(
                    width: 8,
                    height: 8,
                    decoration: const BoxDecoration(
                      color: AppTheme.primaryTeal,
                      shape: BoxShape.circle,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _formatTime(DateTime dt) {
    final now = DateTime.now();
    final diff = now.difference(dt);
    if (diff.inMinutes < 60) return '${diff.inMinutes} min';
    if (diff.inHours < 24) return '${diff.inHours}h';
    return '${diff.inDays}d';
  }
}

class _FinanceSnapshotCard extends StatelessWidget {
  final FinanceProvider finance;

  const _FinanceSnapshotCard({required this.finance});

  @override
  Widget build(BuildContext context) {
    final pending = finance.expenses
        .where((e) => e.status == ExpenseStatus.pending)
        .toList();

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.04),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Wydatki w tym miesiącu',
                      style: TextStyle(
                        fontSize: 12,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                    Text(
                      '${finance.totalThisMonth.toStringAsFixed(0)} PLN',
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                  ],
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    const Text(
                      'Do zwrotu',
                      style: TextStyle(
                        fontSize: 12,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                    Text(
                      '${finance.totalPending.toStringAsFixed(0)} PLN',
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.warningColor,
                      ),
                    ),
                  ],
                ),
              ],
            ),
            if (pending.isNotEmpty) ...[
              const SizedBox(height: 12),
              const Divider(height: 1),
              const SizedBox(height: 12),
              ...pending.take(2).map(
                (e) => Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Row(
                    children: [
                      Icon(e.categoryIcon, size: 16, color: e.statusColor),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          e.title,
                          style: const TextStyle(
                            fontSize: 13,
                            color: AppTheme.textPrimary,
                          ),
                        ),
                      ),
                      Text(
                        '${e.amountDue.toStringAsFixed(0)} PLN',
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.warningColor,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ChildChip extends StatelessWidget {
  final ChildProfile child;

  const _ChildChip({required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 140,
      margin: const EdgeInsets.only(right: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: AppTheme.childColor.withValues(alpha: 0.08),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: AppTheme.childColor.withValues(alpha: 0.1),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.child_care,
              color: AppTheme.childColor,
              size: 20,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            child.name.split(' ').first,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: AppTheme.textPrimary,
            ),
          ),
          Text(
            '${child.age} lat · ${child.school?.split(' ').take(2).join(' ') ?? ''}',
            style: const TextStyle(
              fontSize: 11,
              color: AppTheme.textSecondary,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}

class _AiCoachCta extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF1565C0), Color(0xFF1976D2)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          const Icon(Icons.auto_awesome, color: Colors.white, size: 28),
          const SizedBox(width: 14),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'AI Coach',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                SizedBox(height: 4),
                Text(
                  'Napisz neutralną wiadomość z pomocą AI. Pamiętaj: AI może się mylić — zawsze sprawdź przed wysłaniem.',
                  style: TextStyle(color: Colors.white70, fontSize: 12),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          ElevatedButton(
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const AiCoachScreen()),
              );
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.white,
              foregroundColor: const Color(0xFF1565C0),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            child: const Text(
              'Otwórz',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}
