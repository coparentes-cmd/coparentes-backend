import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'config/app_environment.dart';
import 'data/api/app_api_client.dart';
import 'data/local/offline_store.dart';
import 'data/repositories/auth_repository.dart';
import 'data/repositories/export_repository.dart';
import 'data/repositories/messaging_repository.dart';
import 'models/models.dart';
import 'providers/app_provider.dart';
import 'providers/exports_provider.dart';
import 'providers/offline_sync_provider.dart';
import 'screens/auth/role_selection_screen.dart';
import 'screens/child/child_dashboard.dart';
import 'screens/dashboard/parent_dashboard.dart';
import 'screens/observer/observer_dashboard.dart';
import 'theme/app_theme.dart';
import 'widgets/offline_status_banner.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final preferences = await SharedPreferences.getInstance();
  final offlineStore = OfflineStore(preferences: preferences);
  final apiClient = AppApiClient(baseUrl: AppEnvironment.apiBaseUrl);
  final messagingRepository = MessagingRepository(
    apiClient: apiClient,
    offlineStore: offlineStore,
  );
  final exportRepository = ExportRepository(
    apiClient: apiClient,
    offlineStore: offlineStore,
  );

  runApp(
    CoparentesApp(
      authRepository: AuthRepository(
        apiClient: apiClient,
        preferences: preferences,
        offlineStore: offlineStore,
      ),
      messagingRepository: messagingRepository,
      exportRepository: exportRepository,
      offlineStore: offlineStore,
      apiClient: apiClient,
    ),
  );
}

class CoparentesApp extends StatelessWidget {
  final AuthRepository authRepository;
  final MessagingRepository messagingRepository;
  final ExportRepository exportRepository;
  final OfflineStore offlineStore;
  final AppApiClient apiClient;

  const CoparentesApp({
    super.key,
    required this.authRepository,
    required this.messagingRepository,
    required this.exportRepository,
    required this.offlineStore,
    required this.apiClient,
  });

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(
          create: (_) => AppProvider(authRepository: authRepository),
        ),
        ChangeNotifierProvider(
          create: (_) => MessagingProvider(repository: messagingRepository),
        ),
        ChangeNotifierProvider(create: (_) => CalendarProvider()),
        ChangeNotifierProvider(create: (_) => FinanceProvider()),
        ChangeNotifierProvider(
          create: (_) => ExportsProvider(repository: exportRepository),
        ),
        ChangeNotifierProvider(
          create: (context) => OfflineSyncProvider(
            apiClient: apiClient,
            messagingRepository: messagingRepository,
            exportRepository: exportRepository,
            offlineStore: offlineStore,
            refreshData: () async {
              await context.read<MessagingProvider>().loadThreads();
              await context.read<ExportsProvider>().loadExports();
            },
          ),
        ),
      ],
      child: Consumer<AppProvider>(
        builder: (context, ap, _) {
          return MaterialApp(
            title: 'Coparentes',
            debugShowCheckedModeBanner: false,
            themeMode: ap.themeMode,
            locale: ap.locale,
            supportedLocales: const [
              Locale('pl'),
              Locale('en'),
              Locale('de'),
              Locale('fr'),
            ],
            localizationsDelegates: const [
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
            theme: AppTheme.buildLight(ap.colorScheme.primary),
            darkTheme: AppTheme.buildDark(ap.colorScheme.primary),
            builder: (context, child) {
              return Stack(
                children: [
                  Positioned.fill(child: child ?? const SizedBox.shrink()),
                  const Align(
                    alignment: Alignment.topCenter,
                    child: OfflineStatusBanner(),
                  ),
                ],
              );
            },
            home: const _AppGate(),
          );
        },
      ),
    );
  }
}

class _AppGate extends StatefulWidget {
  const _AppGate();

  @override
  State<_AppGate> createState() => _AppGateState();
}

class _AppGateState extends State<_AppGate> {
  String? _hydratedUserId;

  @override
  Widget build(BuildContext context) {
    final appProvider = context.watch<AppProvider>();

    if (appProvider.isInitializing) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    final user = appProvider.currentUser;
    if (user == null) {
      _hydratedUserId = null;
      return const RoleSelectionScreen();
    }

    _hydrateSession(user.id);

    switch (user.role) {
      case UserRole.child:
        return const ChildDashboard();
      case UserRole.observer:
        return const ObserverDashboard();
      case UserRole.parentA:
      case UserRole.parentB:
        return const ParentDashboard();
    }
  }

  void _hydrateSession(String userId) {
    if (_hydratedUserId == userId) {
      return;
    }

    _hydratedUserId = userId;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) {
        return;
      }

      final messagingProvider = context.read<MessagingProvider>();
      final exportsProvider = context.read<ExportsProvider>();
      final calendarProvider = context.read<CalendarProvider>();
      final financeProvider = context.read<FinanceProvider>();
      final offlineProvider = context.read<OfflineSyncProvider>();
      final isDemoMode = context.read<AppProvider>().isDemoMode;

      if (isDemoMode) {
        messagingProvider.clear();
        exportsProvider.clear();
      } else {
        await messagingProvider.loadThreads();
        await exportsProvider.loadExports();
        await offlineProvider.refreshStatus();
      }

      if (!mounted) {
        return;
      }

      calendarProvider.initializeSampleData();
      financeProvider.initializeSampleData();
    });
  }
}
