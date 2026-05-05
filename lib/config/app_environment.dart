import 'package:flutter/foundation.dart';

class AppEnvironment {
  static String get apiBaseUrl {
    const configured = String.fromEnvironment(
      'COPARENTES_API_BASE_URL',
      defaultValue: '',
    );
    if (configured.isNotEmpty) {
      return configured;
    }

    if (kReleaseMode) {
      throw StateError(
        'Missing COPARENTES_API_BASE_URL for release build. Pass it with --dart-define.',
      );
    }

    if (kIsWeb) {
      return 'http://localhost:4000/api';
    }

    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return 'http://10.0.2.2:4000/api';
      case TargetPlatform.iOS:
      case TargetPlatform.macOS:
      case TargetPlatform.windows:
      case TargetPlatform.linux:
        return 'http://127.0.0.1:4000/api';
      case TargetPlatform.fuchsia:
        return 'http://127.0.0.1:4000/api';
    }
  }
}
