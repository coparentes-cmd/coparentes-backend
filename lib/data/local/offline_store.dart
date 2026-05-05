import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

class OfflineStore extends ChangeNotifier {
  static const _sessionPayloadKey = 'coparentes_cached_session_payload_v1';
  static const _threadsKey = 'coparentes_cached_threads_v1';
  static const _exportsKey = 'coparentes_cached_exports_v1';
  static const _pendingActionsKey = 'coparentes_pending_actions_v1';
  static const _exportDownloadPrefix = 'coparentes_cached_export_download_';

  final SharedPreferences _preferences;

  OfflineStore({required SharedPreferences preferences})
      : _preferences = preferences;

  Map<String, dynamic>? getSessionPayload() => _decodeMap(
        _preferences.getString(_sessionPayloadKey),
      );

  Future<void> saveSessionPayload(Map<String, dynamic> payload) async {
    await _preferences.setString(_sessionPayloadKey, jsonEncode(payload));
    notifyListeners();
  }

  Future<void> clearSessionPayload() async {
    await _preferences.remove(_sessionPayloadKey);
    notifyListeners();
  }

  List<Map<String, dynamic>> getThreads() => _decodeList(
        _preferences.getString(_threadsKey),
      );

  Future<void> saveThreads(List<Map<String, dynamic>> threads) async {
    await _preferences.setString(_threadsKey, jsonEncode(threads));
    notifyListeners();
  }

  List<Map<String, dynamic>> getExports() => _decodeList(
        _preferences.getString(_exportsKey),
      );

  Future<void> saveExports(List<Map<String, dynamic>> jobs) async {
    await _preferences.setString(_exportsKey, jsonEncode(jobs));
    notifyListeners();
  }

  Map<String, dynamic>? getExportDownload(String exportId) => _decodeMap(
        _preferences.getString('$_exportDownloadPrefix$exportId'),
      );

  Future<void> saveExportDownload(
    String exportId,
    Map<String, dynamic> payload,
  ) async {
    await _preferences.setString(
      '$_exportDownloadPrefix$exportId',
      jsonEncode(payload),
    );
    notifyListeners();
  }

  List<Map<String, dynamic>> getPendingActions() => _decodeList(
        _preferences.getString(_pendingActionsKey),
      );

  Future<void> savePendingActions(List<Map<String, dynamic>> actions) async {
    await _preferences.setString(_pendingActionsKey, jsonEncode(actions));
    notifyListeners();
  }

  Future<void> appendPendingAction(Map<String, dynamic> action) async {
    final actions = getPendingActions()..add(action);
    await savePendingActions(actions);
  }

  int pendingActionCount() => getPendingActions().length;

  Future<void> clearSessionScopedData() async {
    final keys = _preferences.getKeys();
    for (final key in keys) {
      if (key.startsWith(_exportDownloadPrefix)) {
        await _preferences.remove(key);
      }
    }

    await _preferences.remove(_sessionPayloadKey);
    await _preferences.remove(_threadsKey);
    await _preferences.remove(_exportsKey);
    await _preferences.remove(_pendingActionsKey);
    notifyListeners();
  }

  List<Map<String, dynamic>> _decodeList(String? raw) {
    if (raw == null || raw.isEmpty) {
      return const [];
    }

    try {
      final decoded = jsonDecode(raw) as List<dynamic>;
      return decoded
          .map((item) => Map<String, dynamic>.from(item as Map))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  Map<String, dynamic>? _decodeMap(String? raw) {
    if (raw == null || raw.isEmpty) {
      return null;
    }

    try {
      return Map<String, dynamic>.from(jsonDecode(raw) as Map);
    } catch (_) {
      return null;
    }
  }
}
