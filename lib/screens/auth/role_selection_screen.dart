import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../providers/app_provider.dart';
import '../../theme/app_theme.dart';
import '../../widgets/brand_widgets.dart';

enum _AuthMode { login, register, join }

class RoleSelectionScreen extends StatefulWidget {
  const RoleSelectionScreen({super.key});

  @override
  State<RoleSelectionScreen> createState() => _RoleSelectionScreenState();
}

class _RoleSelectionScreenState extends State<RoleSelectionScreen> {
  _AuthMode _mode = _AuthMode.login;
  final _nameController = TextEditingController();
  final _workspaceController = TextEditingController();
  final _inviteCodeController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  UserRole _joinRole = UserRole.parentB;
  bool _submitting = false;

  @override
  void dispose() {
    _nameController.dispose();
    _workspaceController.dispose();
    _inviteCodeController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final authError = context.watch<AppProvider>().authError;

    return Scaffold(
      body: BrandBackdrop(
        child: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 1040),
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 20),
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final narrow = constraints.maxWidth < 840;
                    return Wrap(
                      spacing: 22,
                      runSpacing: 22,
                      alignment: WrapAlignment.center,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        SizedBox(
                          width: narrow ? constraints.maxWidth : 420,
                          child: _BrandIntroCard(mode: _mode),
                        ),
                        SizedBox(
                          width: narrow ? constraints.maxWidth : 520,
                          child: BrandCard(
                            padding: const EdgeInsets.all(26),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                _ModeSelector(
                                  mode: _mode,
                                  onChanged: (mode) => setState(() => _mode = mode),
                                ),
                                const SizedBox(height: 22),
                                Text(
                                  _titleForMode(_mode),
                                  style: Theme.of(context).textTheme.headlineSmall,
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  _subtitleForMode(_mode),
                                  style: Theme.of(context).textTheme.bodyMedium,
                                ),
                                const SizedBox(height: 20),
                                if (_mode != _AuthMode.login)
                                  _Field(
                                    controller: _nameController,
                                    label: 'Imię i nazwisko',
                                    hint: 'np. Anna Kowalska',
                                  ),
                                if (_mode == _AuthMode.register)
                                  _Field(
                                    controller: _workspaceController,
                                    label: 'Nazwa przestrzeni rodzinnej',
                                    hint: 'np. Rodzina Kowalska',
                                  ),
                                if (_mode == _AuthMode.join) ...[
                                  _Field(
                                    controller: _inviteCodeController,
                                    label: 'Kod zaproszenia',
                                    hint: 'np. RODZINA-AB12',
                                  ),
                                  Padding(
                                    padding: const EdgeInsets.only(bottom: 12),
                                    child: DropdownButtonFormField<UserRole>(
                                      initialValue: _joinRole,
                                      decoration: const InputDecoration(
                                        labelText: 'Rola po dołączeniu',
                                      ),
                                      items: const [
                                        DropdownMenuItem(
                                          value: UserRole.parentB,
                                          child: Text('Rodzic współdzielący opiekę'),
                                        ),
                                        DropdownMenuItem(
                                          value: UserRole.child,
                                          child: Text('Dziecko'),
                                        ),
                                        DropdownMenuItem(
                                          value: UserRole.observer,
                                          child: Text('Specjalista / obserwator'),
                                        ),
                                      ],
                                      onChanged: (value) {
                                        if (value != null) {
                                          setState(() => _joinRole = value);
                                        }
                                      },
                                    ),
                                  ),
                                ],
                                _Field(
                                  controller: _emailController,
                                  label: 'E-mail',
                                  hint: 'twoj@email.pl',
                                  keyboardType: TextInputType.emailAddress,
                                ),
                                _Field(
                                  controller: _passwordController,
                                  label: 'Hasło',
                                  hint: 'Minimum 10 znaków',
                                  obscureText: true,
                                ),
                                if (authError != null) ...[
                                  const SizedBox(height: 6),
                                  Container(
                                    width: double.infinity,
                                    padding: const EdgeInsets.all(14),
                                    decoration: BoxDecoration(
                                      color: AppTheme.coralColor.withValues(alpha: 0.1),
                                      borderRadius: BorderRadius.circular(18),
                                      border: Border.all(
                                        color: AppTheme.coralColor.withValues(alpha: 0.18),
                                      ),
                                    ),
                                    child: Text(
                                      authError,
                                      style: const TextStyle(
                                        color: AppTheme.errorColor,
                                        fontSize: 12,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                                ],
                                const SizedBox(height: 20),
                                SizedBox(
                                  width: double.infinity,
                                  child: DecoratedBox(
                                    decoration: BoxDecoration(
                                      gradient: AppTheme.brandGradient,
                                      borderRadius: BorderRadius.circular(999),
                                      boxShadow: AppTheme.softShadow,
                                    ),
                                    child: ElevatedButton(
                                      onPressed: _submitting ? null : _submit,
                                      style: ElevatedButton.styleFrom(
                                        backgroundColor: Colors.transparent,
                                        shadowColor: Colors.transparent,
                                      ),
                                      child: _submitting
                                          ? const SizedBox(
                                              width: 18,
                                              height: 18,
                                              child: CircularProgressIndicator(
                                                strokeWidth: 2,
                                                color: Colors.white,
                                              ),
                                            )
                                          : Text(_buttonLabel(_mode)),
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 18),
                                Container(
                                  width: double.infinity,
                                  padding: const EdgeInsets.all(16),
                                  decoration: BoxDecoration(
                                    color: Colors.white,
                                    borderRadius: BorderRadius.circular(22),
                                    border: Border.all(color: AppTheme.dividerColor),
                                  ),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        children: [
                                          Container(
                                            width: 36,
                                            height: 36,
                                            decoration: BoxDecoration(
                                              gradient: AppTheme.brandGradient,
                                              borderRadius: BorderRadius.circular(12),
                                            ),
                                            child: const Icon(
                                              Icons.visibility_outlined,
                                              color: Colors.white,
                                              size: 18,
                                            ),
                                          ),
                                          const SizedBox(width: 12),
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment: CrossAxisAlignment.start,
                                              children: [
                                                Text(
                                                  'Tryb demo — obejrzyj wszystkie role',
                                                  style: Theme.of(context)
                                                      .textTheme
                                                      .titleMedium,
                                                ),
                                                const SizedBox(height: 2),
                                                Text(
                                                  'Wejście bez hasła i bez kodu zaproszenia. Idealne do prezentacji MVP.',
                                                  style: Theme.of(context)
                                                      .textTheme
                                                      .bodySmall,
                                                ),
                                              ],
                                            ),
                                          ),
                                        ],
                                      ),
                                      const SizedBox(height: 14),
                                      Wrap(
                                        spacing: 10,
                                        runSpacing: 10,
                                        children: [
                                          _DemoRoleButton(
                                            icon: Icons.family_restroom,
                                            label: 'Rodzic A',
                                            onTap: _submitting
                                                ? null
                                                : () => _enterDemoRole(UserRole.parentA),
                                          ),
                                          _DemoRoleButton(
                                            icon: Icons.family_restroom,
                                            label: 'Rodzic B',
                                            onTap: _submitting
                                                ? null
                                                : () => _enterDemoRole(UserRole.parentB),
                                          ),
                                          _DemoRoleButton(
                                            icon: Icons.child_care,
                                            label: 'Dziecko',
                                            onTap: _submitting
                                                ? null
                                                : () => _enterDemoRole(UserRole.child),
                                          ),
                                          _DemoRoleButton(
                                            icon: Icons.visibility,
                                            label: 'Observer',
                                            onTap: _submitting
                                                ? null
                                                : () => _enterDemoRole(UserRole.observer),
                                          ),
                                        ],
                                      ),
                                    ],
                                  ),
                                ),
                                const SizedBox(height: 14),
                                Text(
                                  'Korzystając z aplikacji akceptujesz zasady Coparentes oraz prywatność zgodną ze stroną Coparentes.ai.',
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                              ],
                            ),
                          ),
                        ),
                        if (kDebugMode)
                          SizedBox(
                            width: narrow ? constraints.maxWidth : 962,
                            child: Container(
                              padding: const EdgeInsets.all(16),
                              decoration: BoxDecoration(
                                color: AppTheme.yellowColor.withValues(alpha: 0.18),
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(
                                  color: AppTheme.yellowColor.withValues(alpha: 0.45),
                                ),
                              ),
                              child: const Text(
                                'Lokalny tryb debug jest aktywny. Użyj własnych danych seed skonfigurowanych po stronie backendu deweloperskiego.',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: AppTheme.textPrimary,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ),
                      ],
                    );
                  },
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _submit() async {
    final appProvider = context.read<AppProvider>();
    final email = _emailController.text.trim();
    final password = _passwordController.text.trim();

    if (email.isEmpty || password.isEmpty) {
      _showMessage('Uzupełnij e-mail i hasło.');
      return;
    }

    setState(() => _submitting = true);

    bool success;
    switch (_mode) {
      case _AuthMode.login:
        success = await appProvider.login(email: email, password: password);
        break;
      case _AuthMode.register:
        success = await appProvider.registerWorkspace(
          name: _nameController.text.trim(),
          email: email,
          password: password,
          workspaceName: _workspaceController.text.trim(),
        );
        break;
      case _AuthMode.join:
        success = await appProvider.joinWorkspace(
          name: _nameController.text.trim(),
          email: email,
          password: password,
          inviteCode: _inviteCodeController.text.trim(),
          role: _joinRole,
        );
        break;
    }

    if (!mounted) {
      return;
    }

    setState(() => _submitting = false);

    if (!success) {
      _showMessage(appProvider.authError ?? 'Operacja nie powiodła się.');
    }
  }

  Future<void> _enterDemoRole(UserRole role) async {
    setState(() => _submitting = true);
    await context.read<AppProvider>().enterDemoRole(role);
    if (!mounted) {
      return;
    }
    setState(() => _submitting = false);
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  String _titleForMode(_AuthMode mode) {
    switch (mode) {
      case _AuthMode.login:
        return 'Zaloguj się';
      case _AuthMode.register:
        return 'Utwórz konto i przestrzeń';
      case _AuthMode.join:
        return 'Dołącz do istniejącej przestrzeni';
    }
  }

  String _subtitleForMode(_AuthMode mode) {
    switch (mode) {
      case _AuthMode.login:
        return 'Wejdź do wspólnej przestrzeni rodzicielskiej i zarządzaj codziennością dziecka spokojniej.';
      case _AuthMode.register:
        return 'Załóż pierwsze konto rodzica, skonfiguruj rodzinę i zaproś drugiego opiekuna.';
      case _AuthMode.join:
        return 'Wpisz kod zaproszenia i wybierz rolę, aby dołączyć do już istniejącej przestrzeni.';
    }
  }

  String _buttonLabel(_AuthMode mode) {
    switch (_mode) {
      case _AuthMode.login:
        return 'Zaloguj';
      case _AuthMode.register:
        return 'Utwórz konto';
      case _AuthMode.join:
        return 'Dołącz';
    }
  }
}

class _BrandIntroCard extends StatelessWidget {
  final _AuthMode mode;
  const _BrandIntroCard({required this.mode});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFFFFFFFF), Color(0xFFF7FAFF)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(AppTheme.radiusXl),
        border: Border.all(color: AppTheme.dividerColor),
        boxShadow: AppTheme.softShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const BrandLogo(width: 186, height: 74),
          const SizedBox(height: 18),
          BrandGradientPill(
            child: Text(
              _pillText(mode),
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
            ),
          ),
          const SizedBox(height: 20),
          Text(
            'Spokojne rodzicielstwo po rozstaniu — teraz także w aplikacji.',
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: 12),
          Text(
            'Ten interfejs zachowuje ten sam język marki co strona internetowa: jasne tło, miękkie karty, duże zaokrąglenia i gradient Coparentes.',
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(color: AppTheme.textSecondary),
          ),
          const SizedBox(height: 24),
          const _FeatureBullet(
            icon: Icons.chat_bubble_outline,
            title: 'Komunikacja',
            subtitle: 'Wiadomości, AI Coach i archiwizacja rozmów w jednym miejscu.',
          ),
          const SizedBox(height: 14),
          const _FeatureBullet(
            icon: Icons.calendar_month_outlined,
            title: 'Organizacja',
            subtitle: 'Kalendarz opieki, wydarzenia i zamiany terminów bez chaosu.',
          ),
          const SizedBox(height: 14),
          const _FeatureBullet(
            icon: Icons.account_balance_wallet_outlined,
            title: 'Finanse',
            subtitle: 'Wydatki, paragony i rozliczenia zaprojektowane pod wspólne rodzicielstwo.',
          ),
        ],
      ),
    );
  }

  String _pillText(_AuthMode mode) {
    switch (mode) {
      case _AuthMode.login:
        return 'Powrót do aplikacji';
      case _AuthMode.register:
        return 'Nowa przestrzeń rodzinna';
      case _AuthMode.join:
        return 'Dołączanie do rodziny';
    }
  }
}

class _FeatureBullet extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  const _FeatureBullet({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            gradient: AppTheme.brandGradient,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Icon(icon, color: Colors.white, size: 22),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 4),
              Text(subtitle, style: Theme.of(context).textTheme.bodyMedium),
            ],
          ),
        ),
      ],
    );
  }
}

class _ModeSelector extends StatelessWidget {
  final _AuthMode mode;
  final ValueChanged<_AuthMode> onChanged;

  const _ModeSelector({required this.mode, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return SegmentedButton<_AuthMode>(
      style: ButtonStyle(
        backgroundColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return AppTheme.primaryTeal.withValues(alpha: 0.12);
          }
          return Colors.white;
        }),
        side: WidgetStateProperty.resolveWith((states) {
          final color = states.contains(WidgetState.selected)
              ? AppTheme.primaryTeal.withValues(alpha: 0.24)
              : AppTheme.dividerColor;
          return BorderSide(color: color);
        }),
        shape: WidgetStateProperty.all(
          RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        ),
        foregroundColor: WidgetStateProperty.resolveWith((states) {
          return states.contains(WidgetState.selected)
              ? AppTheme.textPrimary
              : AppTheme.textSecondary;
        }),
      ),
      segments: const [
        ButtonSegment(value: _AuthMode.login, label: Text('Logowanie')),
        ButtonSegment(value: _AuthMode.register, label: Text('Nowa rodzina')),
        ButtonSegment(value: _AuthMode.join, label: Text('Dołącz')),
      ],
      selected: {mode},
      onSelectionChanged: (selection) => onChanged(selection.first),
    );
  }
}

class _DemoRoleButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  const _DemoRoleButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: onTap,
      icon: Icon(icon, size: 18),
      label: Text(label),
      style: OutlinedButton.styleFrom(
        foregroundColor: AppTheme.textPrimary,
        side: const BorderSide(color: AppTheme.dividerColor),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
    );
  }
}

class _Field extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final String hint;
  final bool obscureText;
  final TextInputType keyboardType;

  const _Field({
    required this.controller,
    required this.label,
    required this.hint,
    this.obscureText = false,
    this.keyboardType = TextInputType.text,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        controller: controller,
        obscureText: obscureText,
        keyboardType: keyboardType,
        decoration: InputDecoration(labelText: label, hintText: hint),
      ),
    );
  }
}
