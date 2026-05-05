import 'dart:convert';

import 'package:http/http.dart' as http;

class ApiException implements Exception {
  final int statusCode;
  final String message;

  const ApiException(this.statusCode, this.message);

  @override
  String toString() => 'ApiException($statusCode, $message)';
}

class AppApiClient {
  final String baseUrl;
  final http.Client _httpClient;
  String? _token;

  AppApiClient({
    required this.baseUrl,
    http.Client? httpClient,
  }) : _httpClient = httpClient ?? http.Client();

  void setToken(String? token) {
    _token = token;
  }

  bool isNetworkError(Object error) => error is! ApiException;

  Future<Map<String, dynamic>> getJson(String path) async {
    final response = await _httpClient.get(
      Uri.parse('$baseUrl$path'),
      headers: _headers(),
    );
    return _decode(response);
  }

  Future<Map<String, dynamic>> postJson(
    String path,
    Map<String, dynamic> body,
  ) async {
    final response = await _httpClient.post(
      Uri.parse('$baseUrl$path'),
      headers: _headers(),
      body: jsonEncode(body),
    );
    return _decode(response);
  }

  Future<void> postEmpty(String path) async {
    final response = await _httpClient.post(
      Uri.parse('$baseUrl$path'),
      headers: _headers(),
    );
    if (response.statusCode >= 400) {
      throw ApiException(response.statusCode, _parseError(response.body));
    }
  }

  Future<bool> pingHealth() async {
    try {
      final response = await _httpClient
          .get(Uri.parse('$baseUrl/health'))
          .timeout(const Duration(seconds: 4));
      return response.statusCode >= 200 && response.statusCode < 500;
    } catch (_) {
      return false;
    }
  }

  Map<String, String> _headers() {
    return {
      'Content-Type': 'application/json',
      if (_token != null) 'Authorization': 'Bearer $_token',
    };
  }

  Map<String, dynamic> _decode(http.Response response) {
    final data = response.body.isEmpty
        ? <String, dynamic>{}
        : jsonDecode(response.body) as Map<String, dynamic>;

    if (response.statusCode >= 400) {
      final message = data['error'] as String? ?? 'request_failed';
      throw ApiException(response.statusCode, message);
    }
    return data;
  }

  String _parseError(String body) {
    if (body.isEmpty) {
      return 'request_failed';
    }

    try {
      final data = jsonDecode(body) as Map<String, dynamic>;
      return data['error'] as String? ?? 'request_failed';
    } catch (_) {
      return 'request_failed';
    }
  }
}
