import 'dart:async';

import 'package:flutter/material.dart';

import '../config/country_profiles.dart';
import '../data/models/auth_session.dart';
import '../data/repositories/auth_repository.dart';
import '../data/repositories/messaging_repository.dart';
import '../models/models.dart';

// ─── Theme & Color Settings ───────────────────────────────────────────────────

enum AppColorScheme {
  teal,
  blue,
  purple,
  rose,
  amber,
  green,
}

extension AppColorSchemeExt on AppColorScheme {
  String get label {
    switch (this) {
      case AppColorScheme.teal:
        return 'Coparentes Green';
      case AppColorScheme.blue:
        return 'Electric Blue';
      case AppColorScheme.purple:
        return 'Lavender';
      case AppColorScheme.rose:
        return 'Coral';
      case AppColorScheme.amber:
        return 'Sun Yellow';
      case AppColorScheme.green:
        return 'Mint';
    }
  }

  Color get primary {
    switch (this) {
      case AppColorScheme.teal:
        return const Color(0xFF00C896);
      case AppColorScheme.blue:
        return const Color(0xFF0080FF);
      case AppColorScheme.purple:
        return const Color(0xFF9C27B0);
      case AppColorScheme.rose:
        return const Color(0xFFFF6B68);
      case AppColorScheme.amber:
        return const Color(0xFFF4B400);
      case AppColorScheme.green:
        return const Color(0xFF63E0BC);
    }
  }

  Color get light {
    switch (this) {
      case AppColorScheme.teal:
        return const Color(0xFF63E0BC);
      case AppColorScheme.blue:
        return const Color(0xFF5EA8FF);
      case AppColorScheme.purple:
        return const Color(0xFFC77DFF);
      case AppColorScheme.rose:
        return const Color(0xFFFF9D9B);
      case AppColorScheme.amber:
        return const Color(0xFFFDE47A);
      case AppColorScheme.green:
        return const Color(0xFFA8F0D3);
    }
  }

  Color get swatch {
    switch (this) {
      case AppColorScheme.teal:
        return const Color(0xFF00C896);
      case AppColorScheme.blue:
        return const Color(0xFF0080FF);
      case AppColorScheme.purple:
        return const Color(0xFF9C27B0);
      case AppColorScheme.rose:
        return const Color(0xFFFF6B68);
      case AppColorScheme.amber:
        return const Color(0xFFF4B400);
      case AppColorScheme.green:
        return const Color(0xFF63E0BC);
    }
  }
}

// ─── AppProvider ──────────────────────────────────────────────────────────────

class AppProvider extends ChangeNotifier {
  final AuthRepository _authRepository;

  AppProvider({required AuthRepository authRepository})
      : _authRepository = authRepository {
    unawaited(bootstrap());
  }

  AppUser? _currentUser;
  Workspace? _currentWorkspace;
  bool _highConflictMode = false;
  bool _aiCoachEnabled = true;
  bool _aiShieldEnabled = true;
  bool _isInitializing = true;
  bool _isDemoMode = false;
  String? _authError;
  Locale _locale = const Locale('pl');
  CountryProfile _countryProfile = CountryProfiles.poland;

  // Theme & appearance
  ThemeMode _themeMode = ThemeMode.light;
  AppColorScheme _colorScheme = AppColorScheme.teal;

  // Notification preferences
  bool _notifyMessages = true;
  bool _notifyCalendar = true;
  bool _notifyFinance = true;
  bool _notifySwaps = true;

  // PIN lock setting
  bool _requirePinOnResume = true;

  // Language (placeholder for future)
  String _language = 'pl';

  // Getters
  AppUser? get currentUser => _currentUser;
  Workspace? get currentWorkspace => _currentWorkspace;
  bool get highConflictMode => _highConflictMode;
  bool get aiCoachEnabled => _aiCoachEnabled;
  bool get aiShieldEnabled => _aiShieldEnabled;
  ThemeMode get themeMode => _themeMode;
  AppColorScheme get colorScheme => _colorScheme;
  bool get notifyMessages => _notifyMessages;
  bool get notifyCalendar => _notifyCalendar;
  bool get notifyFinance => _notifyFinance;
  bool get notifySwaps => _notifySwaps;
  bool get requirePinOnResume => _requirePinOnResume;
  String get language => _language;
  bool get isInitializing => _isInitializing;
  bool get isDemoMode => _isDemoMode;
  String? get authError => _authError;
  Locale get locale => _locale;
  CountryProfile get countryProfile => _countryProfile;
  String get currencyCode => _countryProfile.currencyCode;

  bool get isDark => _themeMode == ThemeMode.dark;

  Color get primaryColor => _colorScheme.primary;
  Color get primaryLight => _colorScheme.light;

  Future<void> bootstrap() async {
    _isInitializing = true;
    notifyListeners();

    try {
      final session = await _authRepository.restoreSession();
      if (session != null) {
        _applySession(session);
      }
    } finally {
      _isInitializing = false;
      notifyListeners();
    }
  }

  Future<bool> login({
    required String email,
    required String password,
  }) async {
    try {
      _authError = null;
      final session = await _authRepository.login(
        email: email,
        password: password,
      );
      _isDemoMode = false;
      _applySession(session);
      notifyListeners();
      return true;
    } catch (error) {
      _authError = 'Nie udało się zalogować. Sprawdź dane i spróbuj ponownie.';
      notifyListeners();
      return false;
    }
  }

  Future<bool> registerWorkspace({
    required String name,
    required String email,
    required String password,
    required String workspaceName,
  }) async {
    try {
      _authError = null;
      final session = await _authRepository.registerWorkspace(
        name: name,
        email: email,
        password: password,
        workspaceName: workspaceName,
      );
      _isDemoMode = false;
      _applySession(session);
      notifyListeners();
      return true;
    } catch (error) {
      _authError = 'Nie udało się utworzyć konta i workspace.';
      notifyListeners();
      return false;
    }
  }

  Future<bool> joinWorkspace({
    required String name,
    required String email,
    required String password,
    required String inviteCode,
    required UserRole role,
  }) async {
    try {
      _authError = null;
      final session = await _authRepository.joinWorkspace(
        name: name,
        email: email,
        password: password,
        inviteCode: inviteCode,
        role: _roleToApi(role),
      );
      _isDemoMode = false;
      _applySession(session);
      notifyListeners();
      return true;
    } catch (error) {
      _authError = 'Nie udało się dołączyć do workspace.';
      notifyListeners();
      return false;
    }
  }

  Future<void> enterDemoRole(UserRole role) async {
    _authError = null;
    _isDemoMode = true;

    final workspace = _buildDemoWorkspace();
    _currentWorkspace = workspace;
    _currentUser = _buildDemoUser(role);
    _highConflictMode = role == UserRole.parentB;

    notifyListeners();
  }

  // ── Toggles ────────────────────────────────────────────────────────────────

  void toggleHighConflictMode() {
    _highConflictMode = !_highConflictMode;
    notifyListeners();
  }

  void toggleAiCoach() {
    _aiCoachEnabled = !_aiCoachEnabled;
    notifyListeners();
  }

  void toggleAiShield() {
    _aiShieldEnabled = !_aiShieldEnabled;
    notifyListeners();
  }

  // ── Theme ──────────────────────────────────────────────────────────────────

  void setThemeMode(ThemeMode mode) {
    _themeMode = mode;
    notifyListeners();
  }

  void toggleDarkMode() {
    _themeMode =
        _themeMode == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark;
    notifyListeners();
  }

  void setColorScheme(AppColorScheme scheme) {
    _colorScheme = scheme;
    notifyListeners();
  }

  // ── Notifications ──────────────────────────────────────────────────────────

  void setNotifyMessages(bool v) {
    _notifyMessages = v;
    notifyListeners();
  }

  void setNotifyCalendar(bool v) {
    _notifyCalendar = v;
    notifyListeners();
  }

  void setNotifyFinance(bool v) {
    _notifyFinance = v;
    notifyListeners();
  }

  void setNotifySwaps(bool v) {
    _notifySwaps = v;
    notifyListeners();
  }

  void setRequirePinOnResume(bool v) {
    _requirePinOnResume = v;
    notifyListeners();
  }

  void setLanguage(String lang) {
    _language = lang;
    notifyListeners();
  }

  void setLocale(Locale locale) {
    _locale = locale;
    _language = locale.languageCode;
    notifyListeners();
  }

  void setCountryProfile(String countryCode) {
    _countryProfile = CountryProfiles.byCode(countryCode);
    _locale = Locale(_countryProfile.languageCode);
    _language = _countryProfile.languageCode;
    notifyListeners();
  }

  // ── Logout ─────────────────────────────────────────────────────────────────

  void logout() {
    _currentUser = null;
    _currentWorkspace = null;
    _authError = null;
    _isDemoMode = false;
    unawaited(_authRepository.logout());
    notifyListeners();
  }

  void _applySession(AuthSession session) {
    _currentUser = session.user;
    _currentWorkspace = session.workspace;
    _highConflictMode = session.user.highConflictMode;
  }

  Workspace _buildDemoWorkspace() {
    final createdAt = DateTime(2026, 1, 12, 9, 30);
    return Workspace(
      id: 'workspace_demo_001',
      name: 'Rodzina Kowalskich — demo',
      inviteCode: 'DEMO-2026',
      members: [
        AppUser(
          id: 'user_demo_parent_a',
          name: 'Anna Kowalska',
          email: 'anna.demo@coparentes.app',
          role: UserRole.parentA,
          createdAt: createdAt,
        ),
        AppUser(
          id: 'user_demo_parent_b',
          name: 'Marek Kowalski',
          email: 'marek.demo@coparentes.app',
          role: UserRole.parentB,
          highConflictMode: true,
          createdAt: createdAt,
        ),
      ],
      children: const [
        ChildProfile(
          id: 'child_001',
          name: 'Zosia Kowalska',
          dateOfBirth: DateTime(2016, 4, 18),
          school: 'Szkoła Podstawowa nr 15',
        ),
        ChildProfile(
          id: 'child_002',
          name: 'Tomek Kowalski',
          dateOfBirth: DateTime(2013, 9, 7),
          school: 'Szkoła Podstawowa nr 15',
        ),
      ],
      createdAt: createdAt,
    );
  }

  AppUser _buildDemoUser(UserRole role) {
    const createdAt = DateTime(2026, 1, 12, 9, 30);
    switch (role) {
      case UserRole.parentA:
        return const AppUser(
          id: 'user_demo_parent_a',
          name: 'Anna Kowalska',
          email: 'anna.demo@coparentes.app',
          role: UserRole.parentA,
          createdAt: createdAt,
        );
      case UserRole.parentB:
        return const AppUser(
          id: 'user_demo_parent_b',
          name: 'Marek Kowalski',
          email: 'marek.demo@coparentes.app',
          role: UserRole.parentB,
          highConflictMode: true,
          createdAt: createdAt,
        );
      case UserRole.child:
        return const AppUser(
          id: 'user_demo_child',
          name: 'Zosia',
          email: 'zosia.demo@coparentes.app',
          role: UserRole.child,
          createdAt: createdAt,
        );
      case UserRole.observer:
        return const AppUser(
          id: 'user_demo_observer',
          name: 'Dr Marta Nowak',
          email: 'marta.demo@coparentes.app',
          role: UserRole.observer,
          createdAt: createdAt,
        );
    }
  }

  String _roleToApi(UserRole role) {
    switch (role) {
      case UserRole.parentA:
        return 'parentA';
      case UserRole.parentB:
        return 'parentB';
      case UserRole.child:
        return 'child';
      case UserRole.observer:
        return 'observer';
    }
  }
}

// ─── Messaging Provider ───────────────────────────────────────────────────────

class MessagingProvider extends ChangeNotifier {
  final MessagingRepository _repository;

  MessagingProvider({required MessagingRepository repository})
      : _repository = repository;

  final List<MessageThread> _threads = [];
  bool _isLoading = false;
  String? _error;

  List<MessageThread> get threads => _threads;
  bool get isLoading => _isLoading;
  String? get error => _error;

  Future<void> loadThreads() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final threads = await _repository.getThreads();
      _threads
        ..clear()
        ..addAll(threads);
    } catch (error) {
      _error = 'Nie udało się pobrać wiadomości.';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  MessageThread? getThreadById(String threadId) {
    try {
      return _threads.firstWhere((thread) => thread.id == threadId);
    } catch (_) {
      return null;
    }
  }

  Future<MessageThread?> createThread({
    required String subject,
    required String category,
    String? childId,
  }) async {
    try {
      final thread = await _repository.createThread(
        subject: subject,
        category: category,
        childId: childId,
      );
      _threads.insert(0, thread);
      notifyListeners();
      return thread;
    } catch (error) {
      _error = 'Nie udało się utworzyć wątku.';
      notifyListeners();
      return null;
    }
  }

  Future<MessageThread?> sendMessage({
    required String threadId,
    required String content,
    required MessageTone tone,
  }) async {
    try {
      final updatedThread = await _repository.sendMessage(
        threadId: threadId,
        content: content,
        tone: tone,
      );
      final index = _threads.indexWhere((thread) => thread.id == threadId);
      if (index >= 0) {
        _threads[index] = updatedThread;
      } else {
        _threads.insert(0, updatedThread);
      }
      notifyListeners();
      return updatedThread;
    } catch (error) {
      _error = 'Nie udało się wysłać wiadomości.';
      notifyListeners();
      return null;
    }
  }

  void clear() {
    _threads.clear();
    _error = null;
    _isLoading = false;
    notifyListeners();
  }
}

// ─── Calendar Provider ────────────────────────────────────────────────────────

class CalendarProvider extends ChangeNotifier {
  final List<CustodySlot> _custodySlots = [];
  final List<CalendarEvent> _events = [];
  final List<SwapRequest> _swapRequests = [];

  List<CustodySlot> get custodySlots => _custodySlots;
  List<CalendarEvent> get events => _events;
  List<SwapRequest> get swapRequests => _swapRequests;

  void initializeSampleData() {
    _custodySlots.clear();
    _events.clear();
    _swapRequests.clear();

    final now = DateTime.now();

    for (int i = -14; i <= 30; i++) {
      final date = now.add(Duration(days: i));
      final weekOfYear =
          date.difference(DateTime(date.year, 1, 1)).inDays ~/ 7;
      _custodySlots.add(CustodySlot(
        id: 'slot_$i',
        date: date,
        custodian: weekOfYear.isEven ? UserRole.parentA : UserRole.parentB,
        handoverLocation: 'Szkoła SP nr 15',
        handoverTime: '16:00',
      ));
    }

    _events.addAll([
      CalendarEvent(
        id: 'evt_001',
        title: 'Angielski – Zosia',
        startDate: now.add(const Duration(days: 2)),
        type: EventType.school,
        childId: 'child_001',
        createdBy: 'user_001',
        location: 'ul. Mokotowska 12',
        description: 'Zajęcia o 17:00',
      ),
      CalendarEvent(
        id: 'evt_002',
        title: 'Dentysta – Tomek',
        startDate: now.add(const Duration(days: 5)),
        type: EventType.medical,
        childId: 'child_002',
        createdBy: 'user_001',
        location: 'Przychodnia Centrum',
        description: 'Wizyta o 10:30',
      ),
      CalendarEvent(
        id: 'evt_003',
        title: 'Basen – Tomek',
        startDate: now.add(const Duration(days: 3)),
        type: EventType.activity,
        childId: 'child_002',
        createdBy: 'user_002',
        location: 'Wodny Park',
        description: 'Trening o 15:00',
      ),
      CalendarEvent(
        id: 'evt_004',
        title: 'Przekazanie dzieci',
        startDate: now.add(const Duration(days: 7)),
        type: EventType.handover,
        createdBy: 'system',
        location: 'Szkoła SP nr 15',
        description: 'Godz. 16:00',
      ),
      CalendarEvent(
        id: 'evt_005',
        title: 'Ferie zimowe',
        startDate: now.add(const Duration(days: 10)),
        endDate: now.add(const Duration(days: 17)),
        type: EventType.holiday,
        createdBy: 'system',
      ),
    ]);

    _swapRequests.addAll([
      SwapRequest(
        id: 'swap_001',
        requesterId: 'user_002',
        requesterName: 'Marek',
        originalDate: now.add(const Duration(days: 11)),
        proposedDate: now.add(const Duration(days: 18)),
        reason: 'Wyjazd służbowy do Krakowa',
        status: SwapStatus.pending,
        createdAt: now.subtract(const Duration(hours: 5)),
      ),
      SwapRequest(
        id: 'swap_002',
        requesterId: 'user_001',
        requesterName: 'Anna',
        originalDate: now.subtract(const Duration(days: 5)),
        proposedDate: now.subtract(const Duration(days: 3)),
        reason: 'Urodziny babci',
        status: SwapStatus.accepted,
        createdAt: now.subtract(const Duration(days: 10)),
        responseNote: 'Oczywiście, bez problemu.',
      ),
    ]);

    notifyListeners();
  }

  List<CustodySlot> getSlotsForDay(DateTime date) {
    return _custodySlots
        .where(
          (s) =>
              s.date.year == date.year &&
              s.date.month == date.month &&
              s.date.day == date.day,
        )
        .toList();
  }

  List<CalendarEvent> getEventsForDay(DateTime date) {
    return _events.where((e) {
      final sameDay = e.startDate.year == date.year &&
          e.startDate.month == date.month &&
          e.startDate.day == date.day;
      if (e.endDate == null) return sameDay;
      return date.isAfter(e.startDate.subtract(const Duration(days: 1))) &&
          date.isBefore(e.endDate!.add(const Duration(days: 1)));
    }).toList();
  }

  void respondToSwap(String swapId, SwapStatus status, {String? note}) {
    final index = _swapRequests.indexWhere((s) => s.id == swapId);
    if (index >= 0) {
      final swap = _swapRequests[index];
      _swapRequests[index] = SwapRequest(
        id: swap.id,
        requesterId: swap.requesterId,
        requesterName: swap.requesterName,
        originalDate: swap.originalDate,
        proposedDate: swap.proposedDate,
        reason: swap.reason,
        status: status,
        createdAt: swap.createdAt,
        responseNote: note,
      );
      notifyListeners();
    }
  }
}

// ─── Finance Provider ─────────────────────────────────────────────────────────

class FinanceProvider extends ChangeNotifier {
  final List<Expense> _expenses = [];

  List<Expense> get expenses => _expenses;

  double get totalPending {
    return _expenses
        .where((e) => e.status == ExpenseStatus.pending)
        .fold(0.0, (sum, e) => sum + e.amountDue);
  }

  double get totalThisMonth {
    final now = DateTime.now();
    return _expenses
        .where((e) => e.date.year == now.year && e.date.month == now.month)
        .fold(0.0, (sum, e) => sum + e.amount);
  }

  Map<String, double> get categoryTotals {
    final Map<String, double> totals = {};
    for (final e in _expenses) {
      totals[e.category] = (totals[e.category] ?? 0) + e.amount;
    }
    return totals;
  }

  void initializeSampleData() {
    _expenses.clear();
    final now = DateTime.now();
    _expenses.addAll([
      Expense(
        id: 'exp_001',
        title: 'Wizyta u dentysty – Zosia',
        amount: 280.0,
        category: 'Zdrowie',
        childId: 'child_001',
        paidBy: 'user_001',
        splitRatio: 0.5,
        date: now.subtract(const Duration(days: 1)),
        status: ExpenseStatus.pending,
        note: 'Plombowanie 2 zębów',
        hash: 'sha256_exp001',
      ),
      Expense(
        id: 'exp_002',
        title: 'Podręczniki szkolne',
        amount: 340.0,
        category: 'Szkoła',
        childId: 'child_001',
        paidBy: 'user_001',
        splitRatio: 0.5,
        date: now.subtract(const Duration(days: 8)),
        status: ExpenseStatus.accepted,
        hash: 'sha256_exp002',
      ),
      Expense(
        id: 'exp_003',
        title: 'Treningi pływania – Tomek (marzec)',
        amount: 180.0,
        category: 'Zajęcia',
        childId: 'child_002',
        paidBy: 'user_002',
        splitRatio: 0.5,
        date: now.subtract(const Duration(days: 12)),
        status: ExpenseStatus.settled,
        hash: 'sha256_exp003',
      ),
      Expense(
        id: 'exp_004',
        title: 'Zimowe buty – Zosia',
        amount: 199.0,
        category: 'Ubrania',
        childId: 'child_001',
        paidBy: 'user_001',
        splitRatio: 0.5,
        date: now.subtract(const Duration(days: 15)),
        status: ExpenseStatus.disputed,
        note: 'Spór: kwota powyżej limitu uzgodnionego',
        hash: 'sha256_exp004',
      ),
      Expense(
        id: 'exp_005',
        title: 'Wycieczka szkolna',
        amount: 120.0,
        category: 'Szkoła',
        childId: 'child_002',
        paidBy: 'user_001',
        splitRatio: 0.5,
        date: now.subtract(const Duration(days: 20)),
        status: ExpenseStatus.accepted,
        hash: 'sha256_exp005',
      ),
      Expense(
        id: 'exp_006',
        title: 'Leki – Tomek (infekcja)',
        amount: 67.50,
        category: 'Zdrowie',
        childId: 'child_002',
        paidBy: 'user_002',
        splitRatio: 0.5,
        date: now.subtract(const Duration(days: 5)),
        status: ExpenseStatus.pending,
        hash: 'sha256_exp006',
      ),
    ]);
    notifyListeners();
  }

  void addExpense(Expense expense) {
    _expenses.insert(0, expense);
    notifyListeners();
  }

  void updateExpenseStatus(String expenseId, ExpenseStatus status) {
    final index = _expenses.indexWhere((e) => e.id == expenseId);
    if (index >= 0) {
      final exp = _expenses[index];
      _expenses[index] = Expense(
        id: exp.id,
        title: exp.title,
        amount: exp.amount,
        category: exp.category,
        childId: exp.childId,
        paidBy: exp.paidBy,
        splitRatio: exp.splitRatio,
        date: exp.date,
        receiptUrl: exp.receiptUrl,
        status: status,
        note: exp.note,
        hash: exp.hash,
      );
      notifyListeners();
    }
  }
}
