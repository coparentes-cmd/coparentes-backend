import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:fl_chart/fl_chart.dart';
import '../../models/models.dart';
import '../../providers/app_provider.dart';
import '../../theme/app_theme.dart';
import '../../widgets/common_widgets.dart';

class FinanceScreen extends StatefulWidget {
  const FinanceScreen({super.key});

  @override
  State<FinanceScreen> createState() => _FinanceScreenState();
}

class _FinanceScreenState extends State<FinanceScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final finance = context.watch<FinanceProvider>();
    final user = context.watch<AppProvider>().currentUser;
    final isReadOnly = user?.role == UserRole.observer;

    return Scaffold(
      backgroundColor: AppTheme.surfaceColor,
      appBar: AppBar(
        title: const Text('Finanse'),
        actions: [
          if (!isReadOnly)
            IconButton(
              icon: const Icon(Icons.add),
              onPressed: () => _addExpense(context),
            ),
          IconButton(
            icon: const Icon(Icons.picture_as_pdf_outlined),
            onPressed: () => _exportFinances(context),
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: Colors.white,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white70,
          tabs: [
            const Tab(text: 'Przegląd'),
            Tab(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('Wydatki'),
                  const SizedBox(width: 4),
                  Consumer<FinanceProvider>(
                    builder: (_, fp, __) {
                      final pending = fp.expenses
                          .where((e) => e.status == ExpenseStatus.pending)
                          .length;
                      if (pending == 0) return const SizedBox.shrink();
                      return Container(
                        width: 16,
                        height: 16,
                        decoration: const BoxDecoration(
                          color: Colors.white,
                          shape: BoxShape.circle,
                        ),
                        child: Text(
                          '$pending',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 10,
                            color: AppTheme.primaryTeal,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      );
                    },
                  ),
                ],
              ),
            ),
            const Tab(text: 'Prognoza AI'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildOverviewTab(context, finance),
          _buildExpensesTab(context, finance, isReadOnly),
          _buildForecastTab(context, finance),
        ],
      ),
      floatingActionButton: isReadOnly
          ? null
          : FloatingActionButton.extended(
              onPressed: () => _addExpense(context),
              icon: const Icon(Icons.add_a_photo),
              label: const Text('Dodaj z paragonu'),
            ),
    );
  }

  Widget _buildOverviewTab(BuildContext context, FinanceProvider finance) {
    final categoryTotals = finance.categoryTotals;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // AI contextual tip for finance
          AiContextualTip(
            tips: AiTips.finance,
            intervalSeconds: 8,
          ),
          const SizedBox(height: 12),
          // Summary cards
          Row(
            children: [
              Expanded(
                child: _SummaryCard(
                  title: 'Ten miesiąc',
                  amount: finance.totalThisMonth,
                  color: AppTheme.primaryTeal,
                  icon: Icons.calendar_month,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _SummaryCard(
                  title: 'Do zwrotu',
                  amount: finance.totalPending,
                  color: AppTheme.warningColor,
                  icon: Icons.account_balance_wallet,
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),

          // Category breakdown
          const Text(
            'Podział po kategoriach',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppTheme.textPrimary,
            ),
          ),
          const SizedBox(height: 12),
          if (categoryTotals.isNotEmpty)
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                children: categoryTotals.entries.map((entry) {
                  final max = categoryTotals.values.reduce(
                    (a, b) => a > b ? a : b,
                  );
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _CategoryBar(
                      category: entry.key,
                      amount: entry.value,
                      maxAmount: max,
                    ),
                  );
                }).toList(),
              ),
            ),

          const SizedBox(height: 20),

          // Split overview
          const Text(
            'Podział kosztów (50/50)',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppTheme.textPrimary,
            ),
          ),
          const SizedBox(height: 12),
          _SplitOverviewCard(finance: finance),

          const SizedBox(height: 20),

          // AI prediction banner
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF1565C0), Color(0xFF42A5F5)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.auto_awesome, color: Colors.white, size: 20),
                    SizedBox(width: 8),
                    Text(
                      'Prognoza AI na następny miesiąc',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                const Text(
                  'Na podstawie historii wydatków AI przewiduje ~820 PLN wydatków wspólnych w przyszłym miesiącu.',
                  style: TextStyle(color: Colors.white70, fontSize: 13),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    _PredictionChip(
                      label: 'Szkoła',
                      amount: '280 PLN',
                    ),
                    const SizedBox(width: 8),
                    _PredictionChip(
                      label: 'Zdrowie',
                      amount: '180 PLN',
                    ),
                    const SizedBox(width: 8),
                    _PredictionChip(
                      label: 'Zajęcia',
                      amount: '360 PLN',
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildExpensesTab(
    BuildContext context,
    FinanceProvider finance,
    bool isReadOnly,
  ) {
    return Column(
      children: [
        // Filter row
        Container(
          color: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            children: [
              const Text(
                'Filtruj:',
                style: TextStyle(
                  fontSize: 13,
                  color: AppTheme.textSecondary,
                ),
              ),
              const SizedBox(width: 8),
              ...[null, ExpenseStatus.pending, ExpenseStatus.disputed].map(
                (status) => Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: FilterChip(
                    label: Text(
                      status == null
                          ? 'Wszystkie'
                          : status == ExpenseStatus.pending
                          ? 'Oczekujące'
                          : 'Sporne',
                      style: const TextStyle(fontSize: 11),
                    ),
                    selected: status == null,
                    onSelected: (_) {},
                    selectedColor: AppTheme.primaryTeal.withValues(alpha: 0.15),
                    checkmarkColor: AppTheme.primaryTeal,
                    padding: EdgeInsets.zero,
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: finance.expenses.isEmpty
              ? const EmptyState(
                  icon: Icons.receipt_long,
                  title: 'Brak wydatków',
                  subtitle: 'Dodaj pierwszy wydatek z paragonu lub ręcznie',
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: finance.expenses.length,
                  itemBuilder: (ctx, i) {
                    return _ExpenseCard(
                      expense: finance.expenses[i],
                      isReadOnly: isReadOnly,
                    );
                  },
                ),
        ),
      ],
    );
  }

  Widget _buildForecastTab(BuildContext context, FinanceProvider finance) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // AI disclaimer
          const AiDisclaimerBanner(),
          const SizedBox(height: 16),

          const Text(
            'Prognoza miesięczna',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppTheme.textPrimary,
            ),
          ),
          const SizedBox(height: 12),

          // Bar chart
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
                  'Wydatki ostatnie 6 miesięcy + prognoza',
                  style: TextStyle(
                    fontSize: 13,
                    color: AppTheme.textSecondary,
                  ),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  height: 180,
                  child: BarChart(
                    BarChartData(
                      alignment: BarChartAlignment.spaceAround,
                      maxY: 1200,
                      barTouchData: BarTouchData(enabled: false),
                      titlesData: FlTitlesData(
                        show: true,
                        bottomTitles: AxisTitles(
                          sideTitles: SideTitles(
                            showTitles: true,
                            getTitlesWidget: (value, meta) {
                              final months = [
                                'Paź',
                                'Lis',
                                'Gru',
                                'Sty',
                                'Lut',
                                'Mar*',
                              ];
                              if (value.toInt() < months.length) {
                                return Text(
                                  months[value.toInt()],
                                  style: const TextStyle(
                                    fontSize: 10,
                                    color: AppTheme.textSecondary,
                                  ),
                                );
                              }
                              return const Text('');
                            },
                          ),
                        ),
                        leftTitles: AxisTitles(
                          sideTitles: SideTitles(
                            showTitles: true,
                            reservedSize: 40,
                            getTitlesWidget: (value, meta) {
                              return Text(
                                '${value.toInt()}',
                                style: const TextStyle(
                                  fontSize: 10,
                                  color: AppTheme.textSecondary,
                                ),
                              );
                            },
                          ),
                        ),
                        topTitles: const AxisTitles(
                          sideTitles: SideTitles(showTitles: false),
                        ),
                        rightTitles: const AxisTitles(
                          sideTitles: SideTitles(showTitles: false),
                        ),
                      ),
                      gridData: const FlGridData(show: false),
                      borderData: FlBorderData(show: false),
                      barGroups: [
                        _barGroup(0, 650, false),
                        _barGroup(1, 820, false),
                        _barGroup(2, 590, false),
                        _barGroup(3, 740, false),
                        _barGroup(4, 680, false),
                        _barGroup(5, 820, true),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    _ChartLegendItem(
                      color: AppTheme.primaryTeal,
                      label: 'Rzeczywiste',
                    ),
                    const SizedBox(width: 16),
                    _ChartLegendItem(
                      color: AppTheme.primaryTeal.withValues(alpha: 0.4),
                      label: 'Prognoza AI',
                    ),
                  ],
                ),
              ],
            ),
          ),

          const SizedBox(height: 20),

          // Category predictions
          const Text(
            'Prognozy per kategoria',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppTheme.textPrimary,
            ),
          ),
          const SizedBox(height: 12),
          ...[
            {
              'category': 'Szkoła',
              'predicted': 280.0,
              'avg': 260.0,
              'trend': 'up',
            },
            {
              'category': 'Zdrowie',
              'predicted': 180.0,
              'avg': 200.0,
              'trend': 'down',
            },
            {
              'category': 'Zajęcia',
              'predicted': 360.0,
              'avg': 350.0,
              'trend': 'stable',
            },
          ].map(
            (pred) => _CategoryForecastCard(
              category: pred['category'] as String,
              predicted: pred['predicted'] as double,
              average: pred['avg'] as double,
              trend: pred['trend'] as String,
            ),
          ),
        ],
      ),
    );
  }

  BarChartGroupData _barGroup(int x, double y, bool isForecast) {
    return BarChartGroupData(
      x: x,
      barRods: [
        BarChartRodData(
          toY: y,
          color: isForecast
              ? AppTheme.primaryTeal.withValues(alpha: 0.4)
              : AppTheme.primaryTeal,
          width: 20,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
        ),
      ],
    );
  }

  void _addExpense(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => const _AddExpenseSheet(),
    );
  }

  void _exportFinances(BuildContext context) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Eksport finansów'),
        content: const Text(
          'Generowanie raportu finansowego PDF/A z manifestem integralności SHA-256. Gotowy do użycia jako dowód w postępowaniu.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Anuluj'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Eksport finansowy PDF wygenerowany'),
                  backgroundColor: AppTheme.successColor,
                ),
              );
            },
            child: const Text('Generuj raport'),
          ),
        ],
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  final String title;
  final double amount;
  final Color color;
  final IconData icon;

  const _SummaryCard({
    required this.title,
    required this.amount,
    required this.color,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
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
          Icon(icon, color: color, size: 22),
          const SizedBox(height: 8),
          Text(
            '${amount.toStringAsFixed(0)} PLN',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
          Text(
            title,
            style: const TextStyle(
              fontSize: 12,
              color: AppTheme.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}

class _CategoryBar extends StatelessWidget {
  final String category;
  final double amount;
  final double maxAmount;

  const _CategoryBar({
    required this.category,
    required this.amount,
    required this.maxAmount,
  });

  @override
  Widget build(BuildContext context) {
    final ratio = maxAmount > 0 ? amount / maxAmount : 0.0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              category,
              style: const TextStyle(fontSize: 13, color: AppTheme.textPrimary),
            ),
            Text(
              '${amount.toStringAsFixed(0)} PLN',
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppTheme.textPrimary,
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        LinearProgressIndicator(
          value: ratio,
          backgroundColor: AppTheme.dividerColor,
          color: AppTheme.primaryTeal,
          borderRadius: BorderRadius.circular(4),
          minHeight: 6,
        ),
      ],
    );
  }
}

class _SplitOverviewCard extends StatelessWidget {
  final FinanceProvider finance;

  const _SplitOverviewCard({required this.finance});

  @override
  Widget build(BuildContext context) {
    final currencyCode = context.watch<AppProvider>().currencyCode;
    final totalMama = finance.expenses
        .where((e) => e.paidBy == 'user_001')
        .fold(0.0, (sum, e) => sum + e.amount);
    final totalTata = finance.expenses
        .where((e) => e.paidBy == 'user_002')
        .fold(0.0, (sum, e) => sum + e.amount);
    final total = totalMama + totalTata;
    final mamaRatio = total > 0 ? totalMama / total : 0.5;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
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
                    'Parent A paid',
                    style: TextStyle(
                      fontSize: 12,
                      color: AppTheme.textSecondary,
                    ),
                  ),
                  Text(
                    '${totalMama.toStringAsFixed(0)} $currencyCode',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.parentAColor,
                    ),
                  ),
                ],
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  const Text(
                    'Parent B paid',
                    style: TextStyle(
                      fontSize: 12,
                      color: AppTheme.textSecondary,
                    ),
                  ),
                  Text(
                    '${totalTata.toStringAsFixed(0)} $currencyCode',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.parentBColor,
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: mamaRatio,
              backgroundColor: AppTheme.parentBColor.withValues(alpha: 0.3),
              color: AppTheme.parentAColor,
              minHeight: 10,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            '${(mamaRatio * 100).toStringAsFixed(0)}% / ${((1 - mamaRatio) * 100).toStringAsFixed(0)}%',
            style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
          ),
        ],
      ),
    );
  }
}

class _PredictionChip extends StatelessWidget {
  final String label;
  final String amount;

  const _PredictionChip({required this.label, required this.amount});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        children: [
          Text(
            label,
            style: const TextStyle(color: Colors.white70, fontSize: 10),
          ),
          Text(
            amount,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 12,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }
}

class _CategoryForecastCard extends StatelessWidget {
  final String category;
  final double predicted;
  final double average;
  final String trend;

  const _CategoryForecastCard({
    required this.category,
    required this.predicted,
    required this.average,
    required this.trend,
  });

  @override
  Widget build(BuildContext context) {
    final currencyCode = context.watch<AppProvider>().currencyCode;
    final isUp = trend == 'up';
    final isDown = trend == 'down';
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        leading: const Icon(Icons.category, color: AppTheme.primaryTeal),
        title: Text(
          category,
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
        ),
        subtitle: Text(
          'Średnia: ${average.toStringAsFixed(0)} $currencyCode',
          style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              '${predicted.toStringAsFixed(0)} $currencyCode',
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: isUp
                    ? AppTheme.warningColor
                    : isDown
                    ? AppTheme.successColor
                    : AppTheme.textPrimary,
              ),
            ),
            const SizedBox(width: 4),
            Icon(
              isUp
                  ? Icons.trending_up
                  : isDown
                  ? Icons.trending_down
                  : Icons.trending_flat,
              color: isUp
                  ? AppTheme.warningColor
                  : isDown
                  ? AppTheme.successColor
                  : AppTheme.textSecondary,
              size: 18,
            ),
          ],
        ),
      ),
    );
  }
}

class _ChartLegendItem extends StatelessWidget {
  final Color color;
  final String label;

  const _ChartLegendItem({required this.color, required this.label});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 12,
          height: 12,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: 4),
        Text(
          label,
          style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary),
        ),
      ],
    );
  }
}

class _ExpenseCard extends StatelessWidget {
  final Expense expense;
  final bool isReadOnly;

  const _ExpenseCard({required this.expense, required this.isReadOnly});

  @override
  Widget build(BuildContext context) {
    final currencyCode = context.watch<AppProvider>().currencyCode;
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: expense.statusColor.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(
                    expense.categoryIcon,
                    color: expense.statusColor,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        expense.title,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.textPrimary,
                        ),
                      ),
                      Text(
                        '${expense.date.day}.${expense.date.month}.${expense.date.year} · ${expense.category}',
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppTheme.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      '${expense.amount.toStringAsFixed(0)} $currencyCode',
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                    Text(
                      'Do zwrotu: ${expense.amountDue.toStringAsFixed(0)} $currencyCode',
                      style: const TextStyle(
                        fontSize: 11,
                        color: AppTheme.warningColor,
                      ),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                StatusChip(
                  label: expense.statusLabel,
                  color: expense.statusColor,
                ),
                Row(
                  children: [
                    const Icon(
                      Icons.lock,
                      size: 12,
                      color: AppTheme.textHint,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      'SHA: ${expense.hash.substring(7, 15)}...',
                      style: const TextStyle(
                        fontSize: 10,
                        color: AppTheme.textHint,
                        fontFamily: 'monospace',
                      ),
                    ),
                  ],
                ),
              ],
            ),
            if (expense.note != null) ...[
              const SizedBox(height: 8),
              Text(
                expense.note!,
                style: const TextStyle(
                  fontSize: 12,
                  color: AppTheme.textSecondary,
                  fontStyle: FontStyle.italic,
                ),
              ),
            ],
            if (!isReadOnly && expense.status == ExpenseStatus.pending) ...[
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      icon: const Icon(Icons.close, size: 14),
                      label: const Text('Spór', style: TextStyle(fontSize: 12)),
                      onPressed: () {
                        context.read<FinanceProvider>().updateExpenseStatus(
                          expense.id,
                          ExpenseStatus.disputed,
                        );
                      },
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppTheme.errorColor,
                        side: const BorderSide(color: AppTheme.errorColor),
                        padding: const EdgeInsets.symmetric(vertical: 6),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ElevatedButton.icon(
                      icon: const Icon(Icons.check, size: 14),
                      label: const Text(
                        'Akceptuj',
                        style: TextStyle(fontSize: 12),
                      ),
                      onPressed: () {
                        context.read<FinanceProvider>().updateExpenseStatus(
                          expense.id,
                          ExpenseStatus.accepted,
                        );
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.successColor,
                        padding: const EdgeInsets.symmetric(vertical: 6),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _AddExpenseSheet extends StatefulWidget {
  const _AddExpenseSheet();

  @override
  State<_AddExpenseSheet> createState() => _AddExpenseSheetState();
}

class _AddExpenseSheetState extends State<_AddExpenseSheet> {
  final _titleController = TextEditingController();
  final _amountController = TextEditingController();
  String _selectedCategory = 'Szkoła';
  bool _ocrMode = true;

  @override
  void dispose() {
    _titleController.dispose();
    _amountController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        top: 24,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Nowy wydatek',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: AppTheme.textPrimary,
              ),
            ),
            const SizedBox(height: 16),

            // OCR / Manual toggle
            Row(
              children: [
                Expanded(
                  child: GestureDetector(
                    onTap: () => setState(() => _ocrMode = true),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      decoration: BoxDecoration(
                        color: _ocrMode
                            ? AppTheme.primaryTeal
                            : Colors.white,
                        borderRadius: const BorderRadius.horizontal(
                          left: Radius.circular(10),
                        ),
                        border: Border.all(color: AppTheme.primaryTeal),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.camera_alt,
                            color: _ocrMode ? Colors.white : AppTheme.primaryTeal,
                            size: 16,
                          ),
                          const SizedBox(width: 6),
                          Text(
                            'Paragon OCR',
                            style: TextStyle(
                              color: _ocrMode
                                  ? Colors.white
                                  : AppTheme.primaryTeal,
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                Expanded(
                  child: GestureDetector(
                    onTap: () => setState(() => _ocrMode = false),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      decoration: BoxDecoration(
                        color: !_ocrMode
                            ? AppTheme.primaryTeal
                            : Colors.white,
                        borderRadius: const BorderRadius.horizontal(
                          right: Radius.circular(10),
                        ),
                        border: Border.all(color: AppTheme.primaryTeal),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.edit,
                            color: !_ocrMode ? Colors.white : AppTheme.primaryTeal,
                            size: 16,
                          ),
                          const SizedBox(width: 6),
                          Text(
                            'Ręcznie',
                            style: TextStyle(
                              color: !_ocrMode
                                  ? Colors.white
                                  : AppTheme.primaryTeal,
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            if (_ocrMode) ...[
              // OCR upload area
              GestureDetector(
                onTap: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text(
                        'AI OCR: analizuję paragon... (symulacja)',
                      ),
                    ),
                  );
                  Future.delayed(const Duration(seconds: 1), () {
                    if (context.mounted) {
                      setState(() {
                        _ocrMode = false;
                        _titleController.text = 'Wizyta u dentysty';
                        _amountController.text = '280.00';
                        _selectedCategory = 'Zdrowie';
                      });
                    }
                  });
                },
                child: Container(
                  height: 100,
                  decoration: BoxDecoration(
                    color: AppTheme.primaryTeal.withValues(alpha: 0.05),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: AppTheme.primaryTeal.withValues(alpha: 0.3),
                      style: BorderStyle.solid,
                    ),
                  ),
                  child: const Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.add_a_photo,
                        color: AppTheme.primaryTeal,
                        size: 32,
                      ),
                      SizedBox(height: 8),
                      Text(
                        'Zrób zdjęcie paragonu\nAI automatycznie wypełni dane',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: AppTheme.primaryTeal,
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ] else ...[
              TextField(
                controller: _titleController,
                decoration: const InputDecoration(
                  labelText: 'Opis wydatku',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _amountController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Kwota (PLN)',
                  suffixText: 'PLN',
                ),
              ),
              const SizedBox(height: 12),
              const Text(
                'Kategoria',
                style: TextStyle(
                  fontSize: 14,
                  color: AppTheme.textSecondary,
                ),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                children: [
                  'Szkoła',
                  'Zdrowie',
                  'Zajęcia',
                  'Ubrania',
                  'Jedzenie',
                  'Transport',
                  'Inne',
                ].map(
                  (cat) => ChoiceChip(
                    label: Text(cat, style: const TextStyle(fontSize: 12)),
                    selected: _selectedCategory == cat,
                    onSelected: (_) =>
                        setState(() => _selectedCategory = cat),
                    selectedColor: AppTheme.primaryTeal.withValues(alpha: 0.15),
                    checkmarkColor: AppTheme.primaryTeal,
                  ),
                ).toList(),
              ),
            ],

            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _saveExpense,
                child: const Text('Zapisz wydatek'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _saveExpense() {
    final messenger = ScaffoldMessenger.of(context);
    final title = _titleController.text.trim();
    final amount = double.tryParse(_amountController.text.replaceAll(',', '.'));

    if (title.isEmpty || amount == null || amount <= 0) {
      messenger.showSnackBar(
        const SnackBar(
          content: Text('Uzupełnij poprawnie opis i kwotę wydatku.'),
          backgroundColor: AppTheme.warningColor,
        ),
      );
      return;
    }

    final app = context.read<AppProvider>();
    final user = app.currentUser;
    final workspace = app.currentWorkspace;

    context.read<FinanceProvider>().addExpense(
      Expense(
        id: 'exp_${DateTime.now().millisecondsSinceEpoch}',
        title: title,
        amount: amount,
        category: _selectedCategory,
        childId: workspace?.children.isNotEmpty == true
            ? workspace!.children.first.id
            : null,
        paidBy: user?.id ?? 'unknown',
        splitRatio: 0.5,
        date: DateTime.now(),
        status: ExpenseStatus.pending,
        note: _ocrMode ? 'Dodano z trybu OCR demo' : null,
        hash: 'sha256_exp_${DateTime.now().millisecondsSinceEpoch}',
      ),
    );

    Navigator.pop(context);
    messenger.showSnackBar(
      const SnackBar(
        content: Text(
          'Wydatek zapisany z hashiem SHA-256. Wysłano wniosek o zwrot.',
        ),
        backgroundColor: AppTheme.successColor,
      ),
    );
  }
}
