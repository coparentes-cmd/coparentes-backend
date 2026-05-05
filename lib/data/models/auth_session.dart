import '../../models/models.dart';

class AuthSession {
  final String token;
  final AppUser user;
  final Workspace workspace;

  const AuthSession({
    required this.token,
    required this.user,
    required this.workspace,
  });
}
