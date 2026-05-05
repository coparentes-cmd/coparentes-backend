import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/app_provider.dart';
import '../../theme/app_theme.dart';
import '../../widgets/common_widgets.dart';

class ChildDashboard extends StatefulWidget {
  const ChildDashboard({super.key});

  @override
  State<ChildDashboard> createState() => _ChildDashboardState();
}

class _ChildDashboardState extends State<ChildDashboard> {
  int _selectedIndex = 0;
  int _mood = 3;
  final List<String> _packList = [
    'Tornister szkolny',
    'Etui z kredkami',
    'Strój na WF',
    'Butelka z wodą',
    'Kanapki',
  ];
  final List<bool> _packed = [false, false, false, false, false];

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AppProvider>().currentUser;
    final firstName = user?.name.split(' ').first ?? 'Zosiu';

    return Scaffold(
      backgroundColor: const Color(0xFFFFF8F0),
      body: SafeArea(
        child: IndexedStack(
          index: _selectedIndex,
          children: [
            _buildTodayTab(firstName),
            _buildPackTab(),
            _buildRequestTab(),
          ],
        ),
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _selectedIndex,
        onTap: (i) => setState(() => _selectedIndex = i),
        backgroundColor: Colors.white,
        selectedItemColor: AppTheme.childColor,
        unselectedItemColor: AppTheme.textHint,
        type: BottomNavigationBarType.fixed,
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.today),
            label: 'Dzisiaj',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.backpack),
            label: 'Plecak',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.star),
            label: 'Prośby',
          ),
        ],
      ),
    );
  }

  void _showExitDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Zmień profil'),
        content: const Text('Czy chcesz wrócić do ekranu wyboru profilu?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Nie'),
          ),
          ElevatedButton(
            onPressed: () {
              context.read<AppProvider>().logout();
              Navigator.pop(context);
              Navigator.pushReplacementNamed(context, '/');
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.childColor,
            ),
            child: const Text('Tak, zmień'),
          ),
        ],
      ),
    );
  }

  Widget _buildTodayTab(String firstName) {
    final now = DateTime.now();
    final weekdays = [
      'Poniedziałek',
      'Wtorek',
      'Środa',
      'Czwartek',
      'Piątek',
      'Sobota',
      'Niedziela',
    ];
    final dayName = weekdays[now.weekday - 1];

    return Scaffold(
      backgroundColor: const Color(0xFFFFF8F0),
      appBar: AppBar(
        backgroundColor: AppTheme.childColor,
        title: const Row(
          children: [
            Text('👧', style: TextStyle(fontSize: 20)),
            SizedBox(width: 8),
            Text('Mój dzień', style: TextStyle(color: Colors.white)),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.switch_account, color: Colors.white),
            tooltip: 'Zmień profil',
            onPressed: () => _showExitDialog(context),
          ),
        ],
        automaticallyImplyLeading: false,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFFF57C00), Color(0xFFFF9800)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Cześć, $firstName! 👋',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 22,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          dayName,
                          style: const TextStyle(
                            color: Colors.white70,
                            fontSize: 15,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Text('🌟', style: TextStyle(fontSize: 40)),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // AI tip for child
            AiContextualTip(
              tips: AiTips.child,
              intervalSeconds: 9,
              dismissible: true,
            ),

            const SizedBox(height: 16),

            // Where am I today
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                boxShadow: [
                  BoxShadow(
                    color: AppTheme.childColor.withValues(alpha: 0.1),
                    blurRadius: 8,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Text('🏠', style: TextStyle(fontSize: 20)),
                      SizedBox(width: 8),
                      Text(
                        'Gdzie jestem dziś?',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: AppTheme.textPrimary,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: AppTheme.parentAColor.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Row(
                      children: [
                        Text('👩', style: TextStyle(fontSize: 24)),
                        SizedBox(width: 10),
                        Text(
                          'U Mamy',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                            color: AppTheme.parentAColor,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 10),
                  const Row(
                    children: [
                      Text('🕓', style: TextStyle(fontSize: 16)),
                      SizedBox(width: 8),
                      Text(
                        'Jutro przekazanie o 16:00 przy szkole',
                        style: TextStyle(
                          fontSize: 13,
                          color: AppTheme.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // Today events
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Text('📅', style: TextStyle(fontSize: 20)),
                      SizedBox(width: 8),
                      Text(
                        'Dzisiaj',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: AppTheme.textPrimary,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  const _EventItem(
                    time: '07:30',
                    emoji: '🏫',
                    title: 'Szkoła – SP nr 15',
                  ),
                  const _EventItem(
                    time: '13:30',
                    emoji: '🍕',
                    title: 'Obiad w szkole',
                  ),
                  const _EventItem(
                    time: '17:00',
                    emoji: '📚',
                    title: 'Angielski – ul. Mokotowska',
                  ),
                  const _EventItem(
                    time: '18:30',
                    emoji: '🏠',
                    title: 'Powrót do domu',
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // Mood
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Jak się dzisiaj czujesz? 💭',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'To tylko dla Ciebie – rodzice tego nie widzą 🔒',
                    style: TextStyle(
                      fontSize: 12,
                      color: AppTheme.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      _MoodButton(
                          emoji: '😢',
                          value: 1,
                          selected: _mood == 1,
                          onTap: () => setState(() => _mood = 1)),
                      _MoodButton(
                          emoji: '😕',
                          value: 2,
                          selected: _mood == 2,
                          onTap: () => setState(() => _mood = 2)),
                      _MoodButton(
                          emoji: '😊',
                          value: 3,
                          selected: _mood == 3,
                          onTap: () => setState(() => _mood = 3)),
                      _MoodButton(
                          emoji: '😄',
                          value: 4,
                          selected: _mood == 4,
                          onTap: () => setState(() => _mood = 4)),
                      _MoodButton(
                          emoji: '🤩',
                          value: 5,
                          selected: _mood == 5,
                          onTap: () => setState(() => _mood = 5)),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPackTab() {
    return Scaffold(
      backgroundColor: const Color(0xFFFFF8F0),
      appBar: AppBar(
        backgroundColor: AppTheme.childColor,
        title: const Row(
          children: [
            Text('🎒', style: TextStyle(fontSize: 20)),
            SizedBox(width: 8),
            Text('Plecak', style: TextStyle(color: Colors.white)),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.switch_account, color: Colors.white),
            tooltip: 'Zmień profil',
            onPressed: () => _showExitDialog(context),
          ),
        ],
        automaticallyImplyLeading: false,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '🎒 Co spakować?',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w700,
                color: AppTheme.textPrimary,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '${_packed.where((p) => p).length} / ${_packList.length} spakowanych',
              style: const TextStyle(
                fontSize: 14,
                color: AppTheme.textSecondary,
              ),
            ),
            const SizedBox(height: 16),
            LinearProgressIndicator(
              value: _packed.where((p) => p).length / _packList.length,
              backgroundColor: AppTheme.dividerColor,
              color: AppTheme.childColor,
              borderRadius: BorderRadius.circular(4),
              minHeight: 8,
            ),
            const SizedBox(height: 20),
            ...List.generate(_packList.length, (i) {
              return Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: CheckboxListTile(
                  title: Text(
                    _packList[i],
                    style: TextStyle(
                      fontSize: 15,
                      color: _packed[i] ? AppTheme.textHint : AppTheme.textPrimary,
                      decoration: _packed[i] ? TextDecoration.lineThrough : null,
                    ),
                  ),
                  value: _packed[i],
                  activeColor: AppTheme.childColor,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  onChanged: (v) => setState(() => _packed[i] = v ?? false),
                ),
              );
            }),
            if (_packed.every((p) => p)) ...[
              const SizedBox(height: 20),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppTheme.successColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Row(
                  children: [
                    Text('🎉', style: TextStyle(fontSize: 28)),
                    SizedBox(width: 12),
                    Text(
                      'Wszystko spakowane!\nJesteś gotowa!',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.successColor,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildRequestTab() {
    return Scaffold(
      backgroundColor: const Color(0xFFFFF8F0),
      appBar: AppBar(
        backgroundColor: AppTheme.childColor,
        title: const Row(
          children: [
            Text('⭐', style: TextStyle(fontSize: 20)),
            SizedBox(width: 8),
            Text('Prośby', style: TextStyle(color: Colors.white)),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.switch_account, color: Colors.white),
            tooltip: 'Zmień profil',
            onPressed: () => _showExitDialog(context),
          ),
        ],
        automaticallyImplyLeading: false,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '⭐ Moje prośby',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w700,
                color: AppTheme.textPrimary,
              ),
            ),
            const SizedBox(height: 4),
            const Text(
              'Możesz wysłać prośbę do rodziców. Zobaczą ją oboje.',
              style: TextStyle(fontSize: 13, color: AppTheme.textSecondary),
            ),
            const SizedBox(height: 20),

            // Quick requests
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                '🎮 Chcę zabrać konsolę',
                '📱 Chcę zabrać tablet',
                '🎸 Chcę zabrać gitarę',
                '🐱 Tęsknię za kotem',
                '🤝 Chcę zostać dłużej',
                '📞 Zadzwoń do mnie',
              ]
                  .map(
                    (req) => ActionChip(
                      label: Text(req, style: const TextStyle(fontSize: 13)),
                      backgroundColor: Colors.white,
                      side: BorderSide(
                        color: AppTheme.childColor.withValues(alpha: 0.3),
                      ),
                      onPressed: () {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text('Prośba wysłana: $req'),
                            backgroundColor: AppTheme.childColor,
                          ),
                        );
                      },
                    ),
                  )
                  .toList(),
            ),

            const SizedBox(height: 24),

            const Text(
              'Napisz swoją prośbę',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: AppTheme.textPrimary,
              ),
            ),
            const SizedBox(height: 10),
            const TextField(
              maxLines: 3,
              decoration: InputDecoration(
                hintText: 'Napisz co chcesz powiedzieć rodzicom...',
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                icon: const Text('⭐', style: TextStyle(fontSize: 16)),
                label: const Text('Wyślij prośbę'),
                onPressed: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Prośba wysłana do rodziców!'),
                      backgroundColor: AppTheme.childColor,
                    ),
                  );
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.childColor,
                ),
              ),
            ),

            const SizedBox(height: 24),
            // Safety note
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: const Color(0xFFE3F2FD),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Row(
                children: [
                  Text('💙', style: TextStyle(fontSize: 20)),
                  SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Jeśli czujesz się niekomfortowo lub potrzebujesz pomocy, powiedz o tym dorosłemu, któremu ufasz.',
                      style: TextStyle(
                        fontSize: 12,
                        color: AppTheme.aiCoachColor,
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
}

class _EventItem extends StatelessWidget {
  final String time;
  final String emoji;
  final String title;

  const _EventItem({
    required this.time,
    required this.emoji,
    required this.title,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          SizedBox(
            width: 40,
            child: Text(
              time,
              style: const TextStyle(
                fontSize: 12,
                color: AppTheme.textSecondary,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          Text(emoji, style: const TextStyle(fontSize: 18)),
          const SizedBox(width: 8),
          Text(
            title,
            style: const TextStyle(fontSize: 14, color: AppTheme.textPrimary),
          ),
        ],
      ),
    );
  }
}

class _MoodButton extends StatelessWidget {
  final String emoji;
  final int value;
  final bool selected;
  final VoidCallback onTap;

  const _MoodButton({
    required this.emoji,
    required this.value,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 52,
        height: 52,
        decoration: BoxDecoration(
          color: selected
              ? AppTheme.childColor.withValues(alpha: 0.15)
              : Colors.transparent,
          shape: BoxShape.circle,
          border: Border.all(
            color: selected ? AppTheme.childColor : Colors.transparent,
            width: 2,
          ),
        ),
        child: Center(
          child: Text(
            emoji,
            style: TextStyle(fontSize: selected ? 28 : 24),
          ),
        ),
      ),
    );
  }
}
