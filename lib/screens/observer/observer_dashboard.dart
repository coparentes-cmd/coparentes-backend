import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/models.dart';
import '../../providers/app_provider.dart';
import '../../theme/app_theme.dart';
import '../messaging/messaging_screen.dart';
import '../calendar/calendar_screen.dart';
import '../finance/finance_screen.dart';
import '../exports/exports_screen.dart';
import '../documents/documents_screen.dart';
import '../settings/settings_screen.dart';
import '../../widgets/brand_widgets.dart';

class ObserverDashboard extends StatefulWidget {
  const ObserverDashboard({super.key});

  @override
  State<ObserverDashboard> createState() => _ObserverDashboardState();
}

class _ObserverDashboardState extends State<ObserverDashboard> {
  int _selectedIndex = 0;

  final List<Widget> _screens = const [
    _ObserverHome(),
    MessagingScreen(),
    CalendarScreen(),
    FinanceScreen(),
    DocumentsScreen(),
    ExportsScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: _selectedIndex, children: _screens),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _selectedIndex,
        onTap: (i) => setState(() => _selectedIndex = i),
        backgroundColor: Colors.white,
        selectedItemColor: AppTheme.observerColor,
        unselectedItemColor: AppTheme.textHint,
        type: BottomNavigationBarType.fixed,
        selectedLabelStyle: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
        ),
        unselectedLabelStyle: const TextStyle(fontSize: 11),
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.dashboard_outlined),
            activeIcon: Icon(Icons.dashboard),
            label: 'Przegląd',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.chat_bubble_outline),
            activeIcon: Icon(Icons.chat_bubble),
            label: 'Wiadomości',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.calendar_month_outlined),
            activeIcon: Icon(Icons.calendar_month),
            label: 'Kalendarz',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.account_balance_wallet_outlined),
            activeIcon: Icon(Icons.account_balance_wallet),
            label: 'Finanse',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.folder_open_outlined),
            activeIcon: Icon(Icons.folder_open),
            label: 'Documents',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.folder_special_outlined),
            activeIcon: Icon(Icons.folder_special),
            label: 'Eksporty',
          ),
        ],
      ),
    );
  }
}

class _ObserverHome extends StatelessWidget {
  const _ObserverHome();

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AppProvider>().currentUser;
    final workspace = context.watch<AppProvider>().currentWorkspace;
    final messaging = context.watch<MessagingProvider>();
    final finance = context.watch<FinanceProvider>();
    final calendar = context.watch<CalendarProvider>();

    final pendingSwaps = calendar.swapRequests
        .where((s) => s.status == SwapStatus.pending)
        .length;
    final totalExpenses = finance.totalThisMonth;
    final threads = messaging.threads.length;

    return Scaffold(
      backgroundColor: AppTheme.surfaceColor,
      appBar: AppBar(
        backgroundColor: AppTheme.observerColor,
        automaticallyImplyLeading: false,
        title: Row(
          children: [
            const BrandLogo(width: 108, height: 30),
            const SizedBox(width: 10),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Panel obserwatora',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                  Text('Tryb tylko do odczytu',
                      style: TextStyle(fontSize: 11, color: Colors.white70)),
                ],
              ),
            ),
          ],
        ),
        actions: [
          GestureDetector(
            onTap: () => Navigator.push(context,
                MaterialPageRoute(builder: (_) => const SettingsScreen())),
            child: Padding(
              padding: const EdgeInsets.only(right: 16),
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  CircleAvatar(
                    radius: 18,
                    backgroundColor: Colors.white.withValues(alpha: 0.22),
                    child: Text(
                      user?.name.isNotEmpty == true ? user!.name[0] : 'A',
                      style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 16),
                    ),
                  ),
                  Positioned(
                    right: -3,
                    top: -3,
                    child: Container(
                      width: 16,
                      height: 16,
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.9),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(Icons.settings,
                          size: 10, color: AppTheme.observerColor),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Observer badge
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppTheme.observerColor.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: AppTheme.observerColor.withValues(alpha: 0.2),
                ),
              ),
              child: Row(
                children: [
                  const Icon(
                    Icons.visibility,
                    color: AppTheme.observerColor,
                    size: 22,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          user?.name ?? 'Observer',
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            color: AppTheme.observerColor,
                          ),
                        ),
                        const Text(
                          'Read-only access · All actions are audited',
                          style: TextStyle(
                            fontSize: 12,
                            color: AppTheme.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: AppTheme.observerColor.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Text(
                      'READ-ONLY',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.observerColor,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            if (workspace != null) ...[
              Text(
                workspace.name,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.textPrimary,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '${workspace.children.length} dzieci · ${workspace.members.length} rodziców',
                style: const TextStyle(
                  fontSize: 13,
                  color: AppTheme.textSecondary,
                ),
              ),
              const SizedBox(height: 16),
            ],

            // Case summary stats
            const Text(
              'Podsumowanie sprawy',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: AppTheme.textPrimary,
              ),
            ),
            const SizedBox(height: 12),
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
              childAspectRatio: 1.5,
              children: [
                _StatBlock(
                  title: 'Wątki wiadomości',
                  value: '$threads',
                  icon: Icons.chat,
                  color: AppTheme.primaryTeal,
                ),
                _StatBlock(
                  title: 'Wydatki (miesiąc)',
                  value: '${totalExpenses.toStringAsFixed(0)} PLN',
                  icon: Icons.receipt_long,
                  color: AppTheme.successColor,
                ),
                _StatBlock(
                  title: 'Wnioski zamiany',
                  value: '$pendingSwaps oczekujące',
                  icon: Icons.swap_horiz,
                  color: AppTheme.warningColor,
                ),
                _StatBlock(
                  title: 'Wydatki sporne',
                  value:
                      '${finance.expenses.where((e) => e.status == ExpenseStatus.disputed).length}',
                  icon: Icons.warning_amber,
                  color: AppTheme.errorColor,
                ),
              ],
            ),

            const SizedBox(height: 20),

            // Timeline feed
            const Text(
              'Ostatnia aktywność',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: AppTheme.textPrimary,
              ),
            ),
            const SizedBox(height: 12),
            ..._buildTimeline(context, messaging, finance, calendar),

            const SizedBox(height: 20),

            // Quick export
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppTheme.dividerColor),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Szybki eksport',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      icon: const Icon(Icons.folder_special),
                      label: const Text('Generuj pełny pakiet dowodowy'),
                      onPressed: () {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text(
                              'Pakiet dowodowy generowany... (PDF + manifest SHA-256)',
                            ),
                            backgroundColor: AppTheme.successColor,
                          ),
                        );
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.observerColor,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _buildTimeline(
    BuildContext context,
    MessagingProvider messaging,
    FinanceProvider finance,
    CalendarProvider calendar,
  ) {
    final items = <Map<String, dynamic>>[];

    for (final thread in messaging.threads.take(3)) {
      if (thread.messages.isNotEmpty) {
        final msg = thread.messages.last;
        items.add({
          'time': msg.sentAt,
          'icon': Icons.chat,
          'color': AppTheme.primaryTeal,
          'title': 'Wiadomość w wątku: ${thread.subject}',
          'subtitle': '${msg.senderName}: ${msg.content.substring(0, msg.content.length > 40 ? 40 : msg.content.length)}...',
        });
      }
    }

    for (final exp in finance.expenses.take(2)) {
      items.add({
        'time': exp.date,
        'icon': Icons.receipt_long,
        'color': AppTheme.successColor,
        'title': 'Wydatek: ${exp.title}',
        'subtitle': '${exp.amount.toStringAsFixed(0)} PLN · ${exp.statusLabel}',
      });
    }

    items.sort((a, b) => (b['time'] as DateTime).compareTo(a['time'] as DateTime));

    return items.take(5).map((item) {
      final dt = item['time'] as DateTime;
      return Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Card(
          child: ListTile(
            leading: Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: (item['color'] as Color).withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(
                item['icon'] as IconData,
                color: item['color'] as Color,
                size: 18,
              ),
            ),
            title: Text(
              item['title'] as String,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppTheme.textPrimary,
              ),
            ),
            subtitle: Text(
              item['subtitle'] as String,
              style: const TextStyle(fontSize: 12),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            trailing: Text(
              '${dt.day}.${dt.month}',
              style: const TextStyle(
                fontSize: 11,
                color: AppTheme.textHint,
              ),
            ),
          ),
        ),
      );
    }).toList();
  }
}

class _StatBlock extends StatelessWidget {
  final String title;
  final String value;
  final IconData icon;
  final Color color;

  const _StatBlock({
    required this.title,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: color.withValues(alpha: 0.06),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(height: 6),
          Text(
            value,
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
          Text(
            title,
            style: const TextStyle(
              fontSize: 11,
              color: AppTheme.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}
