import 'package:shared_preferences/shared_preferences.dart';

import '../api/app_api_client.dart';
import '../local/offline_store.dart';
import '../models/auth_session.dart';
import '../serializers/api_serializers.dart';

class AuthRepository {
  static const _tokenKey = 'coparentes_auth_token';

  final AppApiClient _apiClient;
  final SharedPreferences _preferences;
  final OfflineStore _offlineStore;

  AuthRepository({
    required AppApiClient apiClient,
    required SharedPreferences preferences,
    required OfflineStore offlineStore,
  })  : _apiClient = apiClient,
        _preferences = preferences,
        _offlineStore = offlineStore;

  Future<AuthSession?> restoreSession() async {
    final token = _preferences.getString(_tokenKey);
    final cachedPayload = _offlineStore.getSessionPayload();

    if (token == null || token.isEmpty) {
      return cachedPayload == null ? null : authSessionFromJson(cachedPayload);
    }

    _apiClient.setToken(token);
    try {
      final payload = await _apiClient.getJson('/auth/session');
      await _offlineStore.saveSessionPayload(payload);
      return authSessionFromJson(payload);
    } on ApiException catch (error) {
      if (error.statusCode == 401 || error.statusCode == 403) {
        await clearToken();
        await _offlineStore.clearSessionPayload();
        return null;
      }

      if (cachedPayload != null) {
        return authSessionFromJson(cachedPayload);
      }
      return null;
    } catch (_) {
      if (cachedPayload != null) {
        return authSessionFromJson(cachedPayload);
      }
      return null;
    }
  }

  Future<AuthSession> login({
    required String email,
    required String password,
  }) async {
    final payload = await _apiClient.postJson('/auth/login', {
      'email': email,
      'password': password,
    });
    return _saveSession(payload);
  }

  Future<AuthSession> registerWorkspace({
    required String name,
    required String email,
    required String password,
    required String workspaceName,
  }) async {
    final payload = await _apiClient.postJson('/auth/register', {
      'name': name,
      'email': email,
      'password': password,
      'workspaceName': workspaceName,
    });
    return _saveSession(payload);
  }

  Future<AuthSession> joinWorkspace({
    required String name,
    required String email,
    required String password,
    required String inviteCode,
    required String role,
  }) async {
    final payload = await _apiClient.postJson('/auth/join', {
      'name': name,
      'email': email,
      'password': password,
      'inviteCode': inviteCode,
      'role': role,
    });
    return _saveSession(payload);
  }

  Future<void> logout() async {
    try {
      await _apiClient.postEmpty('/auth/logout');
    } catch (_) {
      // Ignore backend logout failures and always clear local session.
    } finally {
      await clearToken();
      await _offlineStore.clearSessionScopedData();
    }
  }

  Future<void> clearToken() async {
    _apiClient.setToken(null);
    await _preferences.remove(_tokenKey);
  }

  Future<AuthSession> _saveSession(Map<String, dynamic> payload) async {
    final session = authSessionFromJson(payload);
    _apiClient.setToken(session.token);
    await _preferences.setString(_tokenKey, session.token);
    await _offlineStore.saveSessionPayload(payload);
    return session;
  }
}
