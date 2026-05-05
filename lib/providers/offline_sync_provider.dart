import 'dart:async';

import 'package:flutter/material.dart';

import '../data/api/app_api_client.dart';
import '../data/local/offline_store.dart';
import '../data/repositories/export_repository.dart';
import '../data/repositories/messaging_repository.dart';

class OfflineSyncProvider extends ChangeNotifier {
  final AppApiClient _apiClient;
  final MessagingRepository _messagingRepository;
  final ExportRepository _exportRepository;
  final OfflineStore _offlineStore;
  final Future<void> Function()? _refreshData;

  Timer? _timer;
  bool _isOnline = true;
  bool _isSyncing = false;
  int _pendingCount = 0;
  String? _lastSyncError;

  OfflineSyncProvider({
    required AppApiClient apiClient,
    required MessagingRepository messagingRepository,
    required ExportRepository exportRepository,
    required OfflineStore offlineStore,
    Future<void> Function()? refreshData,
  })  : _apiClient = apiClient,
        _messagingRepository = messagingRepository,
        _exportRepository = exportRepository,
        _offlineStore = offlineStore,
        _refreshData = refreshData {
    _offlineStore.addListener(_handleStoreChanged);
    unawaited(initialize());
  }

  bool get isOnline => _isOnline;
  bool get isSyncing => _isSyncing;
  int get pendingCount => _pendingCount;
  String? get lastSyncError => _lastSyncError;
  bool get showBanner =>
      !_isOnline || _isSyncing || _pendingCount > 0 || _lastSyncError != null;

  String get statusLabel {
    if (_isSyncing) {
      return 'Synchronizacja danych offline…';
    }
    if (!_isOnline) {
      return _pendingCount > 0
          ? 'Tryb offline • $_pendingCount zmian czeka na synchronizację'
          : 'Tryb offline • ostatnie dane zapisane lokalnie';
    }
    if (_lastSyncError != null) {
      return _pendingCount > 0
          ? 'Online • błąd synchronizacji, $_pendingCount zmian nadal czeka'
          : 'Online • ostatnia synchronizacja wymaga sprawdzenia';
    }
    if (_pendingCount > 0) {
      return 'Online • $_pendingCount zmian czeka na wysłanie';
    }
    return 'Online';
  }

  Future<void> initialize() async {
    await _refreshPendingCount();
    _isOnline = await _apiClient.pingHealth();
    notifyListeners();

    if (_isOnline && _pendingCount > 0) {
      await syncNow();
    }

    _timer?.cancel();
    _timer = Timer.periodic(
      const Duration(seconds: 20),
      (_) => unawaited(refreshStatus()),
    );
  }

  Future<void> refreshStatus() async {
    final previousOnline = _isOnline;
    final previousPendingCount = _pendingCount;
    final online = await _apiClient.pingHealth();
    _isOnline = online;
    await _refreshPendingCount();

    if (_isOnline && _pendingCount > 0) {
      await syncNow();
      return;
    }

    if (previousOnline != _isOnline || previousPendingCount != _pendingCount) {
      notifyListeners();
    }
  }

  Future<void> syncNow() async {
    if (_isSyncing) {
      return;
    }

    _isSyncing = true;
    notifyListeners();

    try {
      _lastSyncError = null;
      await _messagingRepository.syncPendingActions();
      await _exportRepository.syncPendingActions();
      _isOnline = await _apiClient.pingHealth();
      await _refreshPendingCount();
      if (_isOnline && _refreshData != null) {
        await _refreshData!.call();
      }
    } catch (error) {
      _lastSyncError = error.toString();
    } finally {
      _isSyncing = false;
      notifyListeners();
    }
  }

  Future<void> _refreshPendingCount() async {
    _pendingCount = _offlineStore.pendingActionCount();
  }

  void _handleStoreChanged() {
    unawaited(_syncPendingCountFromStore());
  }

  Future<void> _syncPendingCountFromStore() async {
    await _refreshPendingCount();
    notifyListeners();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _offlineStore.removeListener(_handleStoreChanged);
    super.dispose();
  }
}
