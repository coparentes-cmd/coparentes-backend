import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/models.dart';
import '../../providers/app_provider.dart';
import '../../services/ai_guidance_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/common_widgets.dart';

class AiCoachScreen extends StatefulWidget {
  const AiCoachScreen({super.key});

  @override
  State<AiCoachScreen> createState() => _AiCoachScreenState();
}

class _AiCoachScreenState extends State<AiCoachScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final TextEditingController _inputController = TextEditingController();
  String _toneResult = '';
  String _rewriteResult = '';
  bool _isAnalyzing = false;

  final List<Map<String, String>> _tips = [
    {
      'title': 'Używaj faktów, nie ocen',
      'desc':
          'Zamiast "Zawsze spóźniasz się" napisz "W dniu 12.03 przekazanie nastąpiło o 17:30, czyli 30 minut po ustalonym czasie."',
      'icon': 'facts',
    },
    {
      'title': 'Formułuj prośby, nie żądania',
      'desc':
          'Zamiast "Musisz zapłacić" napisz "Proszę o przelew 140 PLN do 20 marca."',
      'icon': 'request',
    },
    {
      'title': 'Centruj na dziecku',
      'desc':
          'Zamiast "Chcę żebyś..." napisz "Dla Zosi byłoby lepiej, gdyby..."',
      'icon': 'child',
    },
    {
      'title': 'Unikaj generalizacji',
      'desc': 'Słowa "zawsze", "nigdy", "cały czas" eskalują konflikt.',
      'icon': 'generalize',
    },
  ];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    _inputController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final aiEnabled = context.watch<AppProvider>().aiCoachEnabled;

    return Scaffold(
      backgroundColor: AppTheme.surfaceColor,
      appBar: AppBar(
        backgroundColor: AppTheme.aiCoachColor,
        title: const Row(
          children: [
            Icon(Icons.auto_awesome, color: Colors.white, size: 20),
            SizedBox(width: 8),
            Text('AI Coach'),
          ],
        ),
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: Colors.white,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white70,
          tabs: const [
            Tab(text: 'Analizuj'),
            Tab(text: 'Porady'),
            Tab(text: 'AI Shield'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildAnalyzeTab(aiEnabled),
          _buildTipsTab(),
          _buildShieldTab(),
        ],
      ),
    );
  }

  Widget _buildAnalyzeTab(bool aiEnabled) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Disclaimer
          const AiDisclaimerBanner(),
          const SizedBox(height: 16),

          if (!aiEnabled)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppTheme.warningColor.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Row(
                children: [
                  Icon(Icons.warning, color: AppTheme.warningColor, size: 18),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'AI Coach jest wyłączony. Włącz go w Ustawieniach.',
                      style: TextStyle(
                        color: AppTheme.warningColor,
                        fontSize: 13,
                      ),
                    ),
                  ),
                ],
              ),
            ),

          const SizedBox(height: 12),
          const Text(
            'Wklej treść wiadomości do analizy tonu',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppTheme.textPrimary,
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _inputController,
            maxLines: 6,
            decoration: const InputDecoration(
              hintText:
                  'np. "Musisz odebrać dzieci o 16:00 bo zawsze się spóźniasz i to jest nieakceptowalne..."',
            ),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              icon: _isAnalyzing
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        color: Colors.white,
                        strokeWidth: 2,
                      ),
                    )
                  : const Icon(Icons.auto_awesome),
              label: Text(_isAnalyzing ? 'Analizuję...' : 'Analizuj ton'),
              onPressed:
                  (_inputController.text.isEmpty || _isAnalyzing || !aiEnabled)
                  ? null
                  : _analyze,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.aiCoachColor,
              ),
            ),
          ),

          if (_toneResult.isNotEmpty) ...[
            const SizedBox(height: 20),
            _ToneResultCard(
              tone: _toneResult,
              rewrite: _rewriteResult,
              onUseRewrite: () {
                _inputController.text = _rewriteResult;
                setState(() {
                  _toneResult = '';
                  _rewriteResult = '';
                });
              },
            ),
          ],

          const SizedBox(height: 24),

          // Common templates
          const Text(
            'Gotowe szablony',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppTheme.textPrimary,
            ),
          ),
          const SizedBox(height: 10),
          ..._buildTemplates(),
        ],
      ),
    );
  }

  Widget _buildTipsTab() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppTheme.aiCoachColor.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(14),
          ),
          child: const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Jak pisać neutralnie',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.aiCoachColor,
                ),
              ),
              SizedBox(height: 4),
              Text(
                'Neutralna komunikacja redukuje konflikty i zwiększa szansę na współpracę. Każda wiadomość jest niezmiennie archiwizowana – warto dbać o jej formę.',
                style: TextStyle(
                  fontSize: 13,
                  color: AppTheme.textSecondary,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        ..._tips.map(
          (tip) => Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    tip['title']!,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    tip['desc']!,
                    style: const TextStyle(
                      fontSize: 13,
                      color: AppTheme.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 16),
        // Psychological note
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: const Color(0xFFFFF8E1),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFFFFCC02).withValues(alpha: 0.5)),
          ),
          child: const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.psychology, color: Color(0xFFF57F17), size: 20),
                  SizedBox(width: 8),
                  Text(
                    'Uwaga psychologiczna',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFFF57F17),
                    ),
                  ),
                ],
              ),
              SizedBox(height: 8),
              Text(
                'AI Coach to narzędzie komunikacyjne, nie psychologiczne. Jeśli odczuwasz silny stres lub lęk, skonsultuj się ze specjalistą – psychologiem lub mediatorem rodzinnym.',
                style: TextStyle(
                  fontSize: 13,
                  color: Color(0xFFF57F17),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildShieldTab() {
    final aiShield = context.watch<AppProvider>().aiShieldEnabled;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Shield status
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: aiShield
                  ? AppTheme.successColor.withValues(alpha: 0.08)
                  : AppTheme.textHint.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: aiShield
                    ? AppTheme.successColor.withValues(alpha: 0.3)
                    : AppTheme.dividerColor,
              ),
            ),
            child: Row(
              children: [
                Icon(
                  Icons.shield,
                  color: aiShield
                      ? AppTheme.successColor
                      : AppTheme.textHint,
                  size: 28,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        aiShield ? 'AI Shield AKTYWNY' : 'AI Shield WYŁĄCZONY',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: aiShield
                              ? AppTheme.successColor
                              : AppTheme.textHint,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        aiShield
                            ? 'Otrzymywane wiadomości są filtrowane – widzisz wersję logistyczną, oryginał jest dostępny na żądanie i archiwizowany.'
                            : 'Włącz w Ustawieniach → AI Shield',
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppTheme.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          const Text(
            'Jak działa AI Shield',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppTheme.textPrimary,
            ),
          ),
          const SizedBox(height: 12),
          ...[
            {
              'step': '1',
              'title': 'Detekcja toksycznych treści',
              'desc':
                  'AI analizuje przychodzącą wiadomość pod kątem agresji, manipulacji i obraźliwych treści.',
            },
            {
              'step': '2',
              'title': 'Ekstrakcja logistyki',
              'desc':
                  'Z wiadomości wyciągane są fakty: daty, godziny, miejsca, prośby i kwoty.',
            },
            {
              'step': '3',
              'title': 'Wyświetlanie wersji logistycznej',
              'desc':
                  'Widzisz spokojną, rzeczową wersję. Oryginał pozostaje w archiwum dowodowym i jest dostępny na Twoje żądanie.',
            },
            {
              'step': '4',
              'title': 'Pełny oryginał zawsze dostępny',
              'desc':
                  'Kliknij "Pokaż oryginał" przy każdej wiadomości, aby zobaczyć oryginalną treść – niezmienioną, zarchiwizowaną z hashem.',
            },
          ].map(
            (step) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 28,
                    height: 28,
                    decoration: const BoxDecoration(
                      color: AppTheme.aiCoachColor,
                      shape: BoxShape.circle,
                    ),
                    child: Center(
                      child: Text(
                        step['step']!,
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          step['title']!,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: AppTheme.textPrimary,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          step['desc']!,
                          style: const TextStyle(
                            fontSize: 13,
                            color: AppTheme.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          const AiDisclaimerBanner(),
        ],
      ),
    );
  }

  List<Widget> _buildTemplates() {
    final templates = [
      {
        'label': 'Potwierdzenie odbioru',
        'text': 'Potwierdzam odbiór dzieci w dniu [DATA] o godzinie [GODZINA].',
      },
      {
        'label': 'Prośba o zmianę',
        'text':
            'Proszę o rozważenie zmiany terminu [DATA] na [NOWA DATA]. Powód: [POWÓD]. Proszę o odpowiedź do [TERMIN].',
      },
      {
        'label': 'Wniosek o zwrot kosztów',
        'text':
            'Informuję o wydatku [OPIS] na kwotę [KWOTA] PLN w dniu [DATA]. Zgodnie z ustaleniami (podział 50/50) proszę o przelew [POŁOWA] PLN do dnia [TERMIN].',
      },
      {
        'label': 'Informacja o zdrowiu',
        'text':
            '[IMIĘ DZIECKA] ma [DOLEGLIWOŚĆ]. Zastosowane leczenie: [LECZENIE]. Wizyta u lekarza: [DATA]. Proszę o kontynuację leczenia zgodnie z zaleceniami.',
      },
    ];

    return templates.map((t) {
      return Card(
        margin: const EdgeInsets.only(bottom: 8),
        child: ListTile(
          title: Text(
            t['label']!,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppTheme.textPrimary,
            ),
          ),
          subtitle: Text(
            t['text']!,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
          ),
          trailing: IconButton(
            icon: const Icon(
              Icons.copy,
              color: AppTheme.primaryTeal,
              size: 18,
            ),
            onPressed: () {
              _inputController.text = t['text']!;
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('Szablon "${t['label']}" wklejony')),
              );
            },
          ),
        ),
      );
    }).toList();
  }

  void _analyze() async {
    setState(() {
      _isAnalyzing = true;
      _toneResult = '';
      _rewriteResult = '';
    });

    await Future.delayed(const Duration(milliseconds: 1200));

    final result = AiGuidanceService.analyze(_inputController.text);
    final tone = result.tone == MessageTone.tense ? 'tense' : 'neutral';
    final rewrite = result.rewrite;

    setState(() {
      _isAnalyzing = false;
      _toneResult = tone;
      _rewriteResult = rewrite;
    });
  }
}

class _ToneResultCard extends StatelessWidget {
  final String tone;
  final String rewrite;
  final VoidCallback onUseRewrite;

  const _ToneResultCard({
    required this.tone,
    required this.rewrite,
    required this.onUseRewrite,
  });

  @override
  Widget build(BuildContext context) {
    final isNeutral = tone == 'neutral';
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isNeutral
            ? AppTheme.successColor.withValues(alpha: 0.05)
            : AppTheme.warningColor.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isNeutral
              ? AppTheme.successColor.withValues(alpha: 0.3)
              : AppTheme.warningColor.withValues(alpha: 0.3),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                isNeutral ? Icons.sentiment_satisfied_alt : Icons.warning_amber,
                color: isNeutral ? AppTheme.successColor : AppTheme.warningColor,
                size: 20,
              ),
              const SizedBox(width: 8),
              Text(
                isNeutral
                    ? 'Ton: Neutralny – można wysłać'
                    : 'Ton: Napięty – rozważ przepisanie',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: isNeutral
                      ? AppTheme.successColor
                      : AppTheme.warningColor,
                ),
              ),
            ],
          ),
          if (!isNeutral) ...[
            const SizedBox(height: 12),
            const Text(
              'Proponowana wersja AI:',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: AppTheme.textSecondary,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              rewrite,
              style: const TextStyle(
                fontSize: 13,
                color: AppTheme.textPrimary,
              ),
            ),
            const SizedBox(height: 10),
            const AiDisclaimerBanner(),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: onUseRewrite,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.aiCoachColor,
                ),
                child: const Text('Użyj wersji AI'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
