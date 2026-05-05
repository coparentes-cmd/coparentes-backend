import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../../config/country_profiles.dart';
import '../../config/legal_config.dart';
import '../../models/models.dart';
import '../../providers/app_provider.dart';
import '../../theme/app_theme.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final ap = context.watch<AppProvider>();
    final user = ap.currentUser;
    final workspace = ap.currentWorkspace;
    final roleColor = _roleColor(user?.role);
    final isDark = ap.isDark;
    final canShowInviteCode =
        workspace?.inviteCode != null &&
        workspace!.inviteCode!.isNotEmpty &&
        (user?.role == UserRole.parentA || user?.role == UserRole.parentB);

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF121212) : AppTheme.surfaceColor,
      body: CustomScrollView(
        slivers: [
          // ── App Bar ────────────────────────────────────────────────────────
          SliverAppBar(
            pinned: true,
            expandedHeight: 180,
            backgroundColor: roleColor,
            leading: IconButton(
              icon: const Icon(Icons.arrow_back_ios_new, color: Colors.white),
              onPressed: () => Navigator.pop(context),
            ),
            flexibleSpace: FlexibleSpaceBar(
              background: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [roleColor, roleColor.withValues(alpha: 0.8)],
                  ),
                ),
                child: SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 60, 20, 20),
                    child: Row(
                      children: [
                        // Avatar
                        Container(
                          width: 72,
                          height: 72,
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.25),
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: Colors.white.withValues(alpha: 0.5),
                              width: 2.5,
                            ),
                          ),
                          child: Center(
                            child: Text(
                              _roleEmoji(user?.role),
                              style: const TextStyle(fontSize: 36),
                            ),
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(
                                user?.name ?? 'Użytkownik',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 20,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                user?.email ?? '',
                                style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.8),
                                  fontSize: 13,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 10, vertical: 3),
                                decoration: BoxDecoration(
                                  color:
                                      Colors.white.withValues(alpha: 0.2),
                                  borderRadius: BorderRadius.circular(20),
                                ),
                                child: Text(
                                  _roleBadge(user?.role),
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),

          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // ── Profil osobisty ──────────────────────────────────────
                  _SectionHeader(
                      label: 'Profil osobisty', icon: Icons.person_outline),
                  _SettingsCard(isDark: isDark, children: [
                    _InfoTile(
                      icon: Icons.badge_outlined,
                      label: 'Imię i nazwisko',
                      value: user?.name ?? '—',
                      isDark: isDark,
                    ),
                    _Divider(),
                    _InfoTile(
                      icon: Icons.email_outlined,
                      label: 'Adres e-mail',
                      value: user?.email ?? '—',
                      isDark: isDark,
                    ),
                    _Divider(),
                    _InfoTile(
                      icon: Icons.work_outline,
                      label: 'Rola w aplikacji',
                      value: _roleBadge(user?.role),
                      isDark: isDark,
                    ),
                    _Divider(),
                    _InfoTile(
                      icon: Icons.group_outlined,
                      label: 'Workspace',
                      value: workspace?.name ?? '—',
                      isDark: isDark,
                    ),
                    if (canShowInviteCode) ...[
                      _Divider(),
                      _ActionTile(
                        icon: Icons.key_outlined,
                        label: 'Kod zaproszenia dziecka',
                        subtitle: workspace!.inviteCode!,
                        color: roleColor,
                        isDark: isDark,
                        onTap: () => _copyInviteCode(
                          context,
                          workspace.inviteCode!,
                          roleColor,
                        ),
                      ),
                    ],
                    _Divider(),
                    _ActionTile(
                      icon: Icons.edit_outlined,
                      label: 'Edytuj profil',
                      color: roleColor,
                      isDark: isDark,
                      onTap: () => _showEditProfile(context, user, roleColor),
                    ),
                  ]),

                  const SizedBox(height: 20),

                  // ── Wygląd ────────────────────────────────────────────────
                  _SectionHeader(label: 'Wygląd', icon: Icons.palette_outlined),
                  _SettingsCard(isDark: isDark, children: [
                    // Dark / Light mode
                    _SwitchTile(
                      icon: isDark
                          ? Icons.dark_mode
                          : Icons.light_mode_outlined,
                      label: 'Tryb ciemny',
                      subtitle: isDark ? 'Ciemne tło aktywne' : 'Jasne tło aktywne',
                      value: isDark,
                      activeColor: roleColor,
                      isDark: isDark,
                      onChanged: (v) => ap.toggleDarkMode(),
                    ),
                    _Divider(),

                    // Color palette
                    Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Icon(Icons.color_lens_outlined,
                                  color: isDark
                                      ? Colors.white70
                                      : AppTheme.textSecondary,
                                  size: 20),
                              const SizedBox(width: 12),
                              Text(
                                'Kolor aplikacji',
                                style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w500,
                                  color: isDark
                                      ? Colors.white
                                      : AppTheme.textPrimary,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 14),
                          Wrap(
                            spacing: 10,
                            runSpacing: 10,
                            children:
                                AppColorScheme.values.map((scheme) {
                              final isSelected =
                                  ap.colorScheme == scheme;
                              return GestureDetector(
                                onTap: () => ap.setColorScheme(scheme),
                                child: AnimatedContainer(
                                  duration:
                                      const Duration(milliseconds: 200),
                                  width: isSelected ? 46 : 40,
                                  height: isSelected ? 46 : 40,
                                  decoration: BoxDecoration(
                                    color: scheme.primary,
                                    shape: BoxShape.circle,
                                    border: Border.all(
                                      color: isSelected
                                          ? Colors.white
                                          : Colors.transparent,
                                      width: 3,
                                    ),
                                    boxShadow: isSelected
                                        ? [
                                            BoxShadow(
                                              color: scheme.primary
                                                  .withValues(alpha: 0.5),
                                              blurRadius: 10,
                                              offset: const Offset(0, 3),
                                            )
                                          ]
                                        : [],
                                  ),
                                  child: isSelected
                                      ? const Icon(Icons.check,
                                          color: Colors.white, size: 20)
                                      : null,
                                ),
                              );
                            }).toList(),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'Wybrano: ${ap.colorScheme.label}',
                            style: TextStyle(
                              fontSize: 12,
                              color: isDark
                                  ? Colors.white54
                                  : AppTheme.textHint,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ]),

                  const SizedBox(height: 20),

                  // ── Bezpieczeństwo i logowanie ────────────────────────────
                  _SectionHeader(
                      label: 'Bezpieczeństwo',
                      icon: Icons.security_outlined),
                  _SettingsCard(isDark: isDark, children: [
                    _SwitchTile(
                      icon: Icons.lock_outline,
                      label: 'PIN przy wznowieniu',
                      subtitle: 'Wymagaj PIN-u po przejściu w tło',
                      value: ap.requirePinOnResume,
                      activeColor: roleColor,
                      isDark: isDark,
                      onChanged: (v) => ap.setRequirePinOnResume(v),
                    ),
                    _Divider(),
                    _SwitchTile(
                      icon: Icons.verified_user_outlined,
                      label: '2FA (dwuetapowa weryfikacja)',
                      subtitle: 'Dodatkowe zabezpieczenie konta',
                      value: user?.twoFactorEnabled ?? false,
                      activeColor: roleColor,
                      isDark: isDark,
                      onChanged: (_) => _showFeatureInfo(
                          context,
                          '2FA',
                          'Dwuetapowa weryfikacja jest aktywna. Możesz ją dezaktywować w ustawieniach konta na stronie internetowej.',
                          roleColor),
                    ),
                    _Divider(),
                    _ActionTile(
                      icon: Icons.pin_outlined,
                      label: 'Zmień PIN logowania',
                      color: roleColor,
                      isDark: isDark,
                      onTap: () =>
                          _showChangePinDialog(context, roleColor),
                    ),
                    _Divider(),
                    _InfoTile(
                      icon: Icons.history_outlined,
                      label: 'Ostatnie logowanie',
                      value: 'Dziś, ${_formatNow()}',
                      isDark: isDark,
                    ),
                    _Divider(),
                    _ActionTile(
                      icon: Icons.devices_outlined,
                      label: 'Zaufane urządzenia',
                      subtitle: '1 urządzenie zarejestrowane',
                      color: roleColor,
                      isDark: isDark,
                      onTap: () => _showFeatureInfo(
                          context,
                          'Zaufane urządzenia',
                          'Zarządzaj urządzeniami z dostępem do konta. Ta funkcja będzie dostępna w pełnej wersji.',
                          roleColor),
                    ),
                  ]),

                  const SizedBox(height: 20),

                  // ── Powiadomienia ─────────────────────────────────────────
                  _SectionHeader(
                      label: 'Powiadomienia',
                      icon: Icons.notifications_outlined),
                  _SettingsCard(isDark: isDark, children: [
                    _SwitchTile(
                      icon: Icons.chat_bubble_outline,
                      label: 'Nowe wiadomości',
                      subtitle: 'Alert przy każdej nowej wiadomości',
                      value: ap.notifyMessages,
                      activeColor: roleColor,
                      isDark: isDark,
                      onChanged: ap.setNotifyMessages,
                    ),
                    _Divider(),
                    _SwitchTile(
                      icon: Icons.calendar_today_outlined,
                      label: 'Zdarzenia kalendarza',
                      subtitle: 'Przypomnienia o przekazaniach i zajęciach',
                      value: ap.notifyCalendar,
                      activeColor: roleColor,
                      isDark: isDark,
                      onChanged: ap.setNotifyCalendar,
                    ),
                    _Divider(),
                    _SwitchTile(
                      icon: Icons.swap_horiz_outlined,
                      label: 'Wnioski o zamianę',
                      subtitle: 'Alert o nowych wnioskach o zamianę',
                      value: ap.notifySwaps,
                      activeColor: roleColor,
                      isDark: isDark,
                      onChanged: ap.setNotifySwaps,
                    ),
                    _Divider(),
                    _SwitchTile(
                      icon: Icons.account_balance_wallet_outlined,
                      label: 'Finanse',
                      subtitle: 'Nowe wydatki wymagające uwagi',
                      value: ap.notifyFinance,
                      activeColor: roleColor,
                      isDark: isDark,
                      onChanged: ap.setNotifyFinance,
                    ),
                  ]),

                  const SizedBox(height: 20),

                  // ── AI & Prywatność ────────────────────────────────────────
                  _SectionHeader(
                      label: 'AI i prywatność',
                      icon: Icons.auto_awesome_outlined),
                  _SettingsCard(isDark: isDark, children: [
                    _SwitchTile(
                      icon: Icons.psychology_outlined,
                      label: 'AI Coach (pre-send)',
                      subtitle: 'Analiza tonu przed wysłaniem wiadomości',
                      value: ap.aiCoachEnabled,
                      activeColor: roleColor,
                      isDark: isDark,
                      onChanged: (_) => ap.toggleAiCoach(),
                    ),
                    _Divider(),
                    _SwitchTile(
                      icon: Icons.shield_outlined,
                      label: 'AI Shield (post-receive)',
                      subtitle: 'Filtrowanie toksycznych treści',
                      value: ap.aiShieldEnabled,
                      activeColor: roleColor,
                      isDark: isDark,
                      onChanged: (_) => ap.toggleAiShield(),
                    ),
                    _Divider(),
                    _SwitchTile(
                      icon: Icons.warning_amber_outlined,
                      label: 'Tryb wysokiego konfliktu',
                      subtitle: 'HC – ograniczone powiadomienia',
                      value: ap.highConflictMode,
                      activeColor: AppTheme.highConflictColor,
                      isDark: isDark,
                      onChanged: (_) => ap.toggleHighConflictMode(),
                    ),
                    _Divider(),
                    _ActionTile(
                      icon: Icons.privacy_tip_outlined,
                      label: 'Polityka prywatności AI',
                      color: roleColor,
                      isDark: isDark,
                      onTap: () => _showFeatureInfo(
                          context,
                          'AI i prywatność',
                          'Modele AI nie przechowują Twoich wiadomości. Każda analiza jest efemeryczna i nie wpływa na treningowe zbiory danych. Zgodność z EU AI Act (tryb transparency).',
                          roleColor),
                    ),
                  ]),

                  const SizedBox(height: 20),

                  // ── Billing ───────────────────────────────────────────────
                  _SectionHeader(
                      label: 'Subskrypcja i rozliczenia',
                      icon: Icons.credit_card_outlined),
                  _SettingsCard(isDark: isDark, children: [
                    _InfoTile(
                      icon: Icons.workspace_premium_outlined,
                      label: 'Plan',
                      value: 'Coparentes',
                      isDark: isDark,
                      valueColor: const Color(0xFF6A1B9A),
                    ),
                    _Divider(),
                    _InfoTile(
                      icon: Icons.calendar_month_outlined,
                      label: 'Następne odnowienie',
                      value: '15 maja 2025',
                      isDark: isDark,
                    ),
                    _Divider(),
                    _InfoTile(
                      icon: Icons.payments_outlined,
                      label: 'Kwota',
                      value: '39,99 PLN / miesiąc',
                      isDark: isDark,
                    ),
                    _Divider(),
                    _ActionTile(
                      icon: Icons.receipt_long_outlined,
                      label: 'Historia płatności',
                      color: roleColor,
                      isDark: isDark,
                      onTap: () => _showBillingHistory(context, roleColor),
                    ),
                    _Divider(),
                    _ActionTile(
                      icon: Icons.credit_card_outlined,
                      label: 'Zmień metodę płatności',
                      color: roleColor,
                      isDark: isDark,
                      onTap: () => _showFeatureInfo(
                          context,
                          'Metoda płatności',
                          'Obsługujemy BLIK, kartę płatniczą oraz przelew bankowy. Zarządzaj metodami płatności w panelu klienta.',
                          roleColor),
                    ),
                    _Divider(),
                    _ActionTile(
                      icon: Icons.cancel_outlined,
                      label: 'Anuluj subskrypcję',
                      color: AppTheme.errorColor,
                      isDark: isDark,
                      onTap: () => _showCancelDialog(context, roleColor),
                    ),
                  ]),

                  const SizedBox(height: 20),

                  // ── Eksport danych ────────────────────────────────────────
                  _SectionHeader(
                      label: 'Dane i eksport',
                      icon: Icons.folder_special_outlined),
                  _SettingsCard(isDark: isDark, children: [
                    _ActionTile(
                      icon: Icons.download_outlined,
                      label: 'Pobierz moje dane (RODO)',
                      subtitle: 'Eksport JSON wszystkich danych konta',
                      color: roleColor,
                      isDark: isDark,
                      onTap: () => _showFeatureInfo(
                          context,
                          'Eksport RODO',
                          'Możesz pobrać kompletną kopię swoich danych zgodnie z art. 20 RODO. Plik zostanie wygenerowany i przesłany na Twój adres e-mail w ciągu 24 godzin.',
                          roleColor),
                    ),
                    _Divider(),
                    _ActionTile(
                      icon: Icons.delete_outline,
                      label: 'Usuń konto',
                      subtitle: 'Nieodwracalne – wymaga potwierdzenia',
                      color: AppTheme.errorColor,
                      isDark: isDark,
                      onTap: () => _showDeleteDialog(context, roleColor),
                    ),
                  ]),

                  const SizedBox(height: 20),

                  // ── Aplikacja ─────────────────────────────────────────────
                  _SectionHeader(
                      label: 'Aplikacja', icon: Icons.info_outline),
                  _SettingsCard(isDark: isDark, children: [
                    _InfoTile(
                      icon: Icons.apps_outlined,
                      label: 'Wersja aplikacji',
                      value: '1.0.0 (MVP)',
                      isDark: isDark,
                    ),
                    _Divider(),
                    _ActionTile(
                      icon: Icons.language_outlined,
                      label: 'Language',
                      subtitle: ap.locale.languageCode.toUpperCase(),
                      color: roleColor,
                      isDark: isDark,
                      onTap: () => _pickLanguage(context, ap, roleColor),
                    ),
                    _Divider(),
                    _ActionTile(
                      icon: Icons.public_outlined,
                      label: 'Country profile',
                      subtitle: ap.countryProfile.code,
                      color: roleColor,
                      isDark: isDark,
                      onTap: () => _pickCountryProfile(context, ap, roleColor),
                    ),
                    _Divider(),
                    _InfoTile(
                      icon: Icons.credit_card_outlined,
                      label: 'Currency',
                      value: ap.currencyCode,
                      isDark: isDark,
                    ),
                    _Divider(),
                    _ActionTile(
                      icon: Icons.gavel_outlined,
                      label: 'Regulamin',
                      color: roleColor,
                      isDark: isDark,
                      onTap: () => _showFeatureInfo(
                          context,
                          'Regulamin',
                          '${LegalConfig.companyName} · ${LegalConfig.companyAddress}\nRegulamin i polityka prywatnosci powinny byc opublikowane pod ${LegalConfig.websiteUrl} przed wysylka do sklepow.',
                          roleColor),
                    ),
                    _Divider(),
                    _ActionTile(
                      icon: Icons.shield_moon_outlined,
                      label: 'Polityka prywatności (RODO)',
                      color: roleColor,
                      isDark: isDark,
                      onTap: () => _showFeatureInfo(
                          context,
                          'RODO',
                          'Administratorem danych jest ${LegalConfig.companyName}. Zakres danych i retencja zaleza od aktywnych funkcji konta. Przed publikacja produkcyjna nalezy opublikowac finalna polityke prywatnosci pod ${LegalConfig.privacyUrl}.',
                          roleColor),
                    ),
                    _Divider(),
                    _ActionTile(
                      icon: Icons.support_agent_outlined,
                      label: 'Pomoc i wsparcie',
                      color: roleColor,
                      isDark: isDark,
                      onTap: () => _showFeatureInfo(
                          context,
                          'Wsparcie',
                          'E-mail: ${LegalConfig.supportEmail}\nTelefon: ${LegalConfig.supportPhone}\nWWW: ${LegalConfig.supportUrl}\n\nPrzed wypchnieciem do sklepow upewnij sie, ze te dane prowadza do aktywnego supportu.',
                          roleColor),
                    ),
                  ]),

                  const SizedBox(height: 24),

                  // ── Wyloguj ───────────────────────────────────────────────
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      icon: const Icon(Icons.logout),
                      label: const Text('Wyloguj się',
                          style: TextStyle(fontSize: 16)),
                      onPressed: () => _logout(context),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppTheme.errorColor,
                        side:
                            const BorderSide(color: AppTheme.errorColor),
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                    ),
                  ),

                  const SizedBox(height: 12),
                  Center(
                    child: Text(
                      'Coparentes v1.0.0 · branding aligned\nCopyright © 2026 ${LegalConfig.companyName}',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 11,
                        color:
                            isDark ? Colors.white38 : AppTheme.textHint,
                      ),
                    ),
                  ),
                  const SizedBox(height: 30),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  String _roleEmoji(UserRole? role) {
    switch (role) {
      case UserRole.parentA:
        return '👩';
      case UserRole.parentB:
        return '👨';
      case UserRole.child:
        return '👧';
      case UserRole.observer:
        return '⚖️';
      default:
        return '👤';
    }
  }

  String _roleBadge(UserRole? role) {
    switch (role) {
      case UserRole.parentA:
        return 'Parent A';
      case UserRole.parentB:
        return 'Parent B';
      case UserRole.child:
        return 'Child';
      case UserRole.observer:
        return 'Professional / Observer';
      default:
        return 'User';
    }
  }

  Color _roleColor(UserRole? role) {
    switch (role) {
      case UserRole.parentA:
        return AppTheme.parentAColor;
      case UserRole.parentB:
        return AppTheme.parentBColor;
      case UserRole.child:
        return AppTheme.childColor;
      case UserRole.observer:
        return AppTheme.observerColor;
      default:
        return AppTheme.primaryTeal;
    }
  }

  String _formatNow() {
    final now = DateTime.now();
    return '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';
  }

  void _logout(BuildContext context) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Wyloguj się'),
        content:
            const Text('Czy na pewno chcesz się wylogować z Coparentes?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Anuluj')),
          ElevatedButton(
            onPressed: () {
              context.read<AppProvider>().logout();
              Navigator.of(context)
                  .pushNamedAndRemoveUntil('/', (r) => false);
            },
            style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.errorColor),
            child: const Text('Wyloguj',
                style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  void _pickLanguage(BuildContext context, AppProvider ap, Color color) {
    showModalBottomSheet(
      context: context,
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final locale in const [
              Locale('pl'),
              Locale('en'),
              Locale('de'),
              Locale('fr'),
            ])
              ListTile(
                leading: Icon(Icons.language, color: color),
                title: Text(locale.languageCode.toUpperCase()),
                onTap: () {
                  ap.setLocale(locale);
                  Navigator.pop(context);
                },
              ),
          ],
        ),
      ),
    );
  }

  void _pickCountryProfile(BuildContext context, AppProvider ap, Color color) {
    showModalBottomSheet(
      context: context,
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final profile in CountryProfiles.all)
              ListTile(
                leading: Icon(Icons.public, color: color),
                title: Text('${profile.name} (${profile.code})'),
                subtitle: Text(
                  '${profile.languageCode.toUpperCase()} · ${profile.currencyCode}',
                ),
                onTap: () {
                  ap.setCountryProfile(profile.code);
                  Navigator.pop(context);
                },
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _copyInviteCode(
    BuildContext context,
    String inviteCode,
    Color color,
  ) async {
    await Clipboard.setData(ClipboardData(text: inviteCode));
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Kod zaproszenia skopiowany: $inviteCode'),
        backgroundColor: color,
      ),
    );
  }

  void _showFeatureInfo(
      BuildContext context, String title, String msg, Color color) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(title),
        content: Text(msg, style: const TextStyle(fontSize: 14)),
        actions: [
          ElevatedButton(
            onPressed: () => Navigator.pop(context),
            style: ElevatedButton.styleFrom(backgroundColor: color),
            child: const Text('OK', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  void _showEditProfile(
      BuildContext context, AppUser? user, Color color) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => Padding(
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
            const Text('Edytuj profil',
                style: TextStyle(
                    fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 16),
            TextFormField(
              initialValue: user?.name,
              decoration: const InputDecoration(
                  labelText: 'Imię i nazwisko',
                  prefixIcon: Icon(Icons.person_outline)),
            ),
            const SizedBox(height: 12),
            TextFormField(
              initialValue: user?.email,
              decoration: const InputDecoration(
                  labelText: 'Adres e-mail',
                  prefixIcon: Icon(Icons.email_outlined)),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {
                  Navigator.pop(context);
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                        content: Text('Profil zaktualizowany ✓'),
                        backgroundColor: AppTheme.successColor),
                  );
                },
                style:
                    ElevatedButton.styleFrom(backgroundColor: color),
                child: const Text('Zapisz zmiany',
                    style: TextStyle(color: Colors.white)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showChangePinDialog(BuildContext context, Color color) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => Padding(
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
            const Text('Zmień PIN',
                style: TextStyle(
                    fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            const Text('Wpisz nowy 4-cyfrowy PIN logowania',
                style: TextStyle(
                    fontSize: 13, color: AppTheme.textSecondary)),
            const SizedBox(height: 16),
            TextFormField(
              obscureText: true,
              keyboardType: TextInputType.number,
              maxLength: 4,
              decoration: const InputDecoration(
                  labelText: 'Aktualny PIN',
                  prefixIcon: Icon(Icons.lock_outline)),
            ),
            const SizedBox(height: 12),
            TextFormField(
              obscureText: true,
              keyboardType: TextInputType.number,
              maxLength: 4,
              decoration: const InputDecoration(
                  labelText: 'Nowy PIN',
                  prefixIcon: Icon(Icons.lock_reset_outlined)),
            ),
            const SizedBox(height: 12),
            TextFormField(
              obscureText: true,
              keyboardType: TextInputType.number,
              maxLength: 4,
              decoration: const InputDecoration(
                  labelText: 'Powtórz nowy PIN',
                  prefixIcon: Icon(Icons.lock_reset_outlined)),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {
                  Navigator.pop(context);
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                        content: Text('PIN został zmieniony ✓'),
                        backgroundColor: AppTheme.successColor),
                  );
                },
                style:
                    ElevatedButton.styleFrom(backgroundColor: color),
                child: const Text('Zapisz PIN',
                    style: TextStyle(color: Colors.white)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showBillingHistory(BuildContext context, Color color) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Historia płatności',
                style: TextStyle(
                    fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 16),
            _billingRow('15 kwi 2025', '39,99 PLN', 'Opłacona', color),
            _billingRow('15 mar 2025', '39,99 PLN', 'Opłacona', color),
            _billingRow('15 lut 2025', '39,99 PLN', 'Opłacona', color),
            _billingRow('15 sty 2025', '39,99 PLN', 'Opłacona', color),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Zamknij'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _billingRow(
      String date, String amount, String status, Color color) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Icon(Icons.check_circle_outline, color: color, size: 18),
          const SizedBox(width: 10),
          Expanded(
              child: Text(date,
                  style: const TextStyle(
                      fontSize: 14,
                      color: AppTheme.textPrimary))),
          Text(amount,
              style: const TextStyle(
                  fontSize: 14, fontWeight: FontWeight.w600)),
          const SizedBox(width: 10),
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(status,
                style: TextStyle(
                    fontSize: 11,
                    color: color,
                    fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }

  void _showCancelDialog(BuildContext context, Color color) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Anuluj subskrypcję'),
        content: const Text(
            'Czy na pewno chcesz anulować? Stracisz dostęp do wszystkich funkcji Pro po zakończeniu okresu rozliczeniowego (15 maja 2025).'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Nie, zachowaj')),
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text(
                      'Subskrypcja zostanie anulowana 15 maja 2025'),
                  backgroundColor: AppTheme.warningColor,
                ),
              );
            },
            child: const Text('Anuluj subskrypcję',
                style: TextStyle(color: AppTheme.errorColor)),
          ),
        ],
      ),
    );
  }

  void _showDeleteDialog(BuildContext context, Color color) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Usuń konto'),
        content: const Text(
            'Ta operacja jest nieodwracalna. Wszystkie Twoje dane zostaną trwale usunięte. Czy na pewno chcesz kontynuować?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Anuluj')),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text(
                      'Wniosek o usunięcie konta został wysłany'),
                  backgroundColor: AppTheme.errorColor,
                ),
              );
            },
            style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.errorColor),
            child: const Text('Usuń konto',
                style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }
}

// ─── Shared sub-widgets ───────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  final String label;
  final IconData icon;

  const _SectionHeader({required this.label, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10, left: 4),
      child: Row(
        children: [
          Icon(icon, size: 16, color: AppTheme.textSecondary),
          const SizedBox(width: 6),
          Text(
            label.toUpperCase(),
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: AppTheme.textSecondary,
              letterSpacing: 1,
            ),
          ),
        ],
      ),
    );
  }
}

class _SettingsCard extends StatelessWidget {
  final List<Widget> children;
  final bool isDark;

  const _SettingsCard({required this.children, required this.isDark});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E1E1E) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.3 : 0.05),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(children: children),
    );
  }
}

class _Divider extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final isDark = context.read<AppProvider>().isDark;
    return Divider(
      height: 1,
      thickness: 0.5,
      indent: 52,
      color: isDark ? Colors.white12 : AppTheme.dividerColor,
    );
  }
}

class _InfoTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final bool isDark;
  final Color? valueColor;

  const _InfoTile({
    required this.icon,
    required this.label,
    required this.value,
    required this.isDark,
    this.valueColor,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon,
          color: isDark ? Colors.white54 : AppTheme.textSecondary, size: 20),
      title: Text(label,
          style: TextStyle(
            fontSize: 14,
            color: isDark ? Colors.white70 : AppTheme.textSecondary,
          )),
      trailing: Text(
        value,
        style: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w500,
          color: valueColor ??
              (isDark ? Colors.white : AppTheme.textPrimary),
        ),
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final String? subtitle;
  final Color color;
  final bool isDark;
  final VoidCallback onTap;

  const _ActionTile({
    required this.icon,
    required this.label,
    this.subtitle,
    required this.color,
    required this.isDark,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: color, size: 20),
      title: Text(label,
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w500,
            color: isDark ? Colors.white : AppTheme.textPrimary,
          )),
      subtitle: subtitle != null
          ? Text(subtitle!,
              style: TextStyle(
                fontSize: 12,
                color: isDark ? Colors.white38 : AppTheme.textHint,
              ))
          : null,
      trailing: Icon(Icons.chevron_right,
          color: isDark ? Colors.white24 : AppTheme.textHint, size: 18),
      onTap: onTap,
    );
  }
}

class _SwitchTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final String? subtitle;
  final bool value;
  final Color activeColor;
  final bool isDark;
  final ValueChanged<bool> onChanged;

  const _SwitchTile({
    required this.icon,
    required this.label,
    this.subtitle,
    required this.value,
    required this.activeColor,
    required this.isDark,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return SwitchListTile(
      secondary: Icon(icon,
          color: value
              ? activeColor
              : (isDark ? Colors.white38 : AppTheme.textSecondary),
          size: 20),
      title: Text(label,
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w500,
            color: isDark ? Colors.white : AppTheme.textPrimary,
          )),
      subtitle: subtitle != null
          ? Text(subtitle!,
              style: TextStyle(
                fontSize: 12,
                color: isDark ? Colors.white38 : AppTheme.textHint,
              ))
          : null,
      value: value,
      activeColor: activeColor, // ignore: deprecated_member_use
      onChanged: onChanged,
    );
  }
}
