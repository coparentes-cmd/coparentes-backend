import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:table_calendar/table_calendar.dart';
import '../../models/models.dart';
import '../../providers/app_provider.dart';
import '../../theme/app_theme.dart';
import '../../widgets/common_widgets.dart';

class CalendarScreen extends StatefulWidget {
  const CalendarScreen({super.key});

  @override
  State<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends State<CalendarScreen>
    with SingleTickerProviderStateMixin {
  DateTime _focusedDay = DateTime.now();
  DateTime _selectedDay = DateTime.now();
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
    final calendar = context.watch<CalendarProvider>();
    final user = context.watch<AppProvider>().currentUser;
    final isReadOnly = user?.role == UserRole.observer;
    final roleColor = user?.role == UserRole.parentA
        ? AppTheme.parentAColor
        : AppTheme.parentBColor;

    final selectedSlots = calendar.getSlotsForDay(_selectedDay);
    final selectedEvents = calendar.getEventsForDay(_selectedDay);
    final pendingSwaps = calendar.swapRequests
        .where((s) => s.status == SwapStatus.pending)
        .toList();

    return Scaffold(
      backgroundColor: AppTheme.surfaceColor,
      appBar: AppBar(
        title: const Text('Kalendarz opieki'),
        actions: [
          if (!isReadOnly)
            IconButton(
              icon: const Icon(Icons.add),
              onPressed: () => _addEvent(context),
            ),
        ],
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: Colors.white,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white70,
          tabs: [
            const Tab(text: 'Grafik'),
            Tab(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('Zamiany'),
                  if (pendingSwaps.isNotEmpty) ...[
                    const SizedBox(width: 4),
                    Container(
                      width: 16,
                      height: 16,
                      decoration: const BoxDecoration(
                        color: Colors.white,
                        shape: BoxShape.circle,
                      ),
                      child: Text(
                        '${pendingSwaps.length}',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 10,
                          color: roleColor,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const Tab(text: 'Zdarzenia'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          // Tab 1: Calendar
          _buildCalendarTab(
            context,
            calendar,
            selectedSlots,
            selectedEvents,
            roleColor,
          ),
          // Tab 2: Swap requests
          _buildSwapsTab(context, calendar),
          // Tab 3: Events list
          _buildEventsTab(context, calendar),
        ],
      ),
      floatingActionButton: isReadOnly
          ? null
          : FloatingActionButton.extended(
              onPressed: () => _requestSwap(context),
              icon: const Icon(Icons.swap_horiz),
              label: const Text('Zamiana'),
            ),
    );
  }

  Widget _buildCalendarTab(
    BuildContext context,
    CalendarProvider calendar,
    List<CustodySlot> selectedSlots,
    List<CalendarEvent> selectedEvents,
    Color roleColor,
  ) {
    return SingleChildScrollView(
      child: Column(
        children: [
          // AI contextual tip for calendar
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 4),
            child: AiContextualTip(
              tips: AiTips.calendar,
              intervalSeconds: 8,
            ),
          ),
          // Calendar widget
          Container(
            color: Colors.white,
            child: TableCalendar(
              firstDay: DateTime.now().subtract(const Duration(days: 60)),
              lastDay: DateTime.now().add(const Duration(days: 120)),
              focusedDay: _focusedDay,
              selectedDayPredicate: (day) => isSameDay(day, _selectedDay),
              onDaySelected: (selected, focused) {
                setState(() {
                  _selectedDay = selected;
                  _focusedDay = focused;
                });
              },
              calendarBuilders: CalendarBuilders(
                defaultBuilder: (ctx, day, focused) {
                  final slots = calendar.getSlotsForDay(day);
                  if (slots.isEmpty) return null;
                  final custodian = slots.first.custodian;
                  final isParentA = custodian == UserRole.parentA;
                  return Container(
                    margin: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: (isParentA
                              ? AppTheme.parentAColor
                              : AppTheme.parentBColor)
                          .withValues(alpha: 0.15),
                      shape: BoxShape.circle,
                    ),
                    child: Center(
                      child: Text(
                        '${day.day}',
                        style: TextStyle(
                          color: isParentA
                              ? AppTheme.parentAColor
                              : AppTheme.parentBColor,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  );
                },
                markerBuilder: (ctx, day, events) {
                  final dayEvents = calendar.getEventsForDay(day);
                  if (dayEvents.isEmpty) return null;
                  return Positioned(
                    bottom: 4,
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: dayEvents
                          .take(3)
                          .map(
                            (e) => Container(
                              width: 5,
                              height: 5,
                              margin: const EdgeInsets.symmetric(horizontal: 1),
                              decoration: BoxDecoration(
                                color: e.typeColor,
                                shape: BoxShape.circle,
                              ),
                            ),
                          )
                          .toList(),
                    ),
                  );
                },
              ),
              headerStyle: const HeaderStyle(
                formatButtonVisible: false,
                titleCentered: true,
                titleTextStyle: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.textPrimary,
                ),
              ),
              calendarStyle: CalendarStyle(
                selectedDecoration: BoxDecoration(
                  color: roleColor,
                  shape: BoxShape.circle,
                ),
                todayDecoration: BoxDecoration(
                  color: roleColor.withValues(alpha: 0.3),
                  shape: BoxShape.circle,
                ),
                weekendTextStyle: const TextStyle(color: AppTheme.errorColor),
              ),
            ),
          ),

          // Legend
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _LegendItem(
                  color: AppTheme.parentAColor,
                  label: 'U Mamy',
                ),
                const SizedBox(width: 24),
                _LegendItem(
                  color: AppTheme.parentBColor,
                  label: 'U Taty',
                ),
              ],
            ),
          ),

          // Selected day details
          if (selectedSlots.isNotEmpty) ...[
            _SelectedDayCard(
              day: _selectedDay,
              slot: selectedSlots.first,
              events: selectedEvents,
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildSwapsTab(BuildContext context, CalendarProvider calendar) {
    final swaps = calendar.swapRequests;
    final user = context.watch<AppProvider>().currentUser;

    if (swaps.isEmpty) {
      return const EmptyState(
        icon: Icons.swap_horiz,
        title: 'Brak wniosków o zamianę',
        subtitle: 'Wnioski o zamianę dni opieki pojawią się tutaj',
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: swaps.length,
      itemBuilder: (ctx, i) {
        final swap = swaps[i];
        final isMyRequest = swap.requesterId == user?.id;
        return _SwapCard(
          swap: swap,
          isMyRequest: isMyRequest,
          onAccept: () =>
              calendar.respondToSwap(swap.id, SwapStatus.accepted, note: 'Akceptuję'),
          onReject: () =>
              calendar.respondToSwap(swap.id, SwapStatus.rejected, note: 'Odrzucam'),
        );
      },
    );
  }

  Widget _buildEventsTab(BuildContext context, CalendarProvider calendar) {
    final events = calendar.events;
    if (events.isEmpty) {
      return const EmptyState(
        icon: Icons.event_note,
        title: 'Brak zdarzeń',
        subtitle: 'Dodaj zdarzenia szkolne, medyczne i inne',
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: events.length,
      itemBuilder: (ctx, i) {
        final event = events[i];
        return _EventCard(event: event);
      },
    );
  }

  void _addEvent(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => const _AddEventSheet(),
    );
  }

  void _requestSwap(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => const _SwapRequestSheet(),
    );
  }
}

class _LegendItem extends StatelessWidget {
  final Color color;
  final String label;

  const _LegendItem({required this.color, required this.label});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 16,
          height: 16,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.3),
            shape: BoxShape.circle,
            border: Border.all(color: color, width: 2),
          ),
        ),
        const SizedBox(width: 6),
        Text(
          label,
          style: const TextStyle(fontSize: 13, color: AppTheme.textSecondary),
        ),
      ],
    );
  }
}

class _SelectedDayCard extends StatelessWidget {
  final DateTime day;
  final CustodySlot slot;
  final List<CalendarEvent> events;

  const _SelectedDayCard({
    required this.day,
    required this.slot,
    required this.events,
  });

  @override
  Widget build(BuildContext context) {
    final isParentA = slot.custodian == UserRole.parentA;
    final color = isParentA ? AppTheme.parentAColor : AppTheme.parentBColor;
    final label = isParentA ? 'U Mamy' : 'U Taty';

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.home, color: color, size: 20),
                  const SizedBox(width: 8),
                  Text(
                    label,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: color,
                    ),
                  ),
                  const Spacer(),
                  if (slot.handoverTime != null)
                    Text(
                      'Przekazanie: ${slot.handoverTime}',
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                ],
              ),
              if (slot.handoverLocation != null) ...[
                const SizedBox(height: 4),
                Row(
                  children: [
                    const Icon(
                      Icons.location_on_outlined,
                      size: 14,
                      color: AppTheme.textSecondary,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      slot.handoverLocation!,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                  ],
                ),
              ],
              if (events.isNotEmpty) ...[
                const SizedBox(height: 12),
                const Divider(height: 1),
                const SizedBox(height: 12),
                ...events.map(
                  (e) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      children: [
                        Container(
                          width: 32,
                          height: 32,
                          decoration: BoxDecoration(
                            color: e.typeColor.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Icon(
                            e.typeIcon,
                            size: 16,
                            color: e.typeColor,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                e.title,
                                style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w500,
                                  color: AppTheme.textPrimary,
                                ),
                              ),
                              if (e.description != null)
                                Text(
                                  e.description!,
                                  style: const TextStyle(
                                    fontSize: 11,
                                    color: AppTheme.textSecondary,
                                  ),
                                ),
                            ],
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
      ),
    );
  }
}

class _SwapCard extends StatelessWidget {
  final SwapRequest swap;
  final bool isMyRequest;
  final VoidCallback onAccept;
  final VoidCallback onReject;

  const _SwapCard({
    required this.swap,
    required this.isMyRequest,
    required this.onAccept,
    required this.onReject,
  });

  @override
  Widget build(BuildContext context) {
    final isPending = swap.status == SwapStatus.pending;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  isMyRequest ? 'Twój wniosek' : 'Wniosek od ${swap.requesterName}',
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textPrimary,
                  ),
                ),
                StatusChip(
                  label: swap.statusLabel,
                  color: swap.statusColor,
                ),
              ],
            ),
            const SizedBox(height: 12),
            _SwapDateRow(
              label: 'Oryginalny dzień',
              date: swap.originalDate,
              icon: Icons.event,
              color: AppTheme.errorColor,
            ),
            const SizedBox(height: 6),
            _SwapDateRow(
              label: 'Proponowany dzień',
              date: swap.proposedDate,
              icon: Icons.event_available,
              color: AppTheme.successColor,
            ),
            if (swap.reason != null) ...[
              const SizedBox(height: 10),
              Text(
                'Powód: ${swap.reason}',
                style: const TextStyle(
                  fontSize: 13,
                  color: AppTheme.textSecondary,
                  fontStyle: FontStyle.italic,
                ),
              ),
            ],
            if (swap.responseNote != null) ...[
              const SizedBox(height: 8),
              Text(
                'Odpowiedź: ${swap.responseNote}',
                style: const TextStyle(fontSize: 13, color: AppTheme.textSecondary),
              ),
            ],
            if (isPending && !isMyRequest) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      icon: const Icon(Icons.close, size: 16),
                      label: const Text('Odrzuć'),
                      onPressed: onReject,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppTheme.errorColor,
                        side: const BorderSide(color: AppTheme.errorColor),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: ElevatedButton.icon(
                      icon: const Icon(Icons.check, size: 16),
                      label: const Text('Akceptuj'),
                      onPressed: onAccept,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.successColor,
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

class _SwapDateRow extends StatelessWidget {
  final String label;
  final DateTime date;
  final IconData icon;
  final Color color;

  const _SwapDateRow({
    required this.label,
    required this.date,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: 8),
        Text(
          label,
          style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
        ),
        const Spacer(),
        Text(
          '${date.day}.${date.month}.${date.year}',
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: color,
          ),
        ),
      ],
    );
  }
}

class _EventCard extends StatelessWidget {
  final CalendarEvent event;

  const _EventCard({required this.event});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        leading: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: event.typeColor.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(event.typeIcon, color: event.typeColor, size: 20),
        ),
        title: Text(
          event.title,
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: AppTheme.textPrimary,
          ),
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${event.startDate.day}.${event.startDate.month}.${event.startDate.year}',
              style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
            ),
            if (event.location != null)
              Text(
                event.location!,
                style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
              ),
          ],
        ),
        trailing: Icon(Icons.chevron_right, color: AppTheme.textHint, size: 18),
      ),
    );
  }
}

class _AddEventSheet extends StatefulWidget {
  const _AddEventSheet();

  @override
  State<_AddEventSheet> createState() => _AddEventSheetState();
}

class _AddEventSheetState extends State<_AddEventSheet> {
  final _titleController = TextEditingController();
  EventType _selectedType = EventType.school;
  // selectedDate is used via _buildCalendarTab parameter

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        top: 24,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Nowe zdarzenie',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: AppTheme.textPrimary,
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _titleController,
            decoration: const InputDecoration(
              labelText: 'Tytuł zdarzenia',
              hintText: 'np. Angielski – Zosia',
            ),
          ),
          const SizedBox(height: 12),
          const Text(
            'Typ zdarzenia',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w500,
              color: AppTheme.textSecondary,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: EventType.values.map((type) {
              final labels = {
                EventType.school: 'Szkoła',
                EventType.medical: 'Zdrowie',
                EventType.activity: 'Zajęcia',
                EventType.handover: 'Przekazanie',
                EventType.holiday: 'Ferie',
                EventType.other: 'Inne',
              };
              return ChoiceChip(
                label: Text(labels[type]!),
                selected: _selectedType == type,
                onSelected: (_) => setState(() => _selectedType = type),
                selectedColor: AppTheme.primaryTeal.withValues(alpha: 0.15),
                checkmarkColor: AppTheme.primaryTeal,
              );
            }).toList(),
          ),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () {
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Zdarzenie zostało dodane'),
                    backgroundColor: AppTheme.successColor,
                  ),
                );
              },
              child: const Text('Dodaj zdarzenie'),
            ),
          ),
        ],
      ),
    );
  }
}

class _SwapRequestSheet extends StatefulWidget {
  const _SwapRequestSheet();

  @override
  State<_SwapRequestSheet> createState() => _SwapRequestSheetState();
}

class _SwapRequestSheetState extends State<_SwapRequestSheet> {
  final _reasonController = TextEditingController();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        top: 24,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Wniosek o zamianę',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: AppTheme.textPrimary,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Złóż wniosek o zamianę dnia opieki. Drugi rodzic otrzyma powiadomienie i będzie mógł zaakceptować lub odrzucić.',
            style: TextStyle(fontSize: 13, color: AppTheme.textSecondary),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _reasonController,
            maxLines: 2,
            decoration: const InputDecoration(
              labelText: 'Powód zamiany (opcjonalnie)',
              hintText: 'np. Wyjazd służbowy, urodziny babci...',
            ),
          ),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () {
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Wniosek o zamianę wysłany do drugiego rodzica'),
                    backgroundColor: AppTheme.successColor,
                  ),
                );
              },
              child: const Text('Wyślij wniosek'),
            ),
          ),
        ],
      ),
    );
  }
}
