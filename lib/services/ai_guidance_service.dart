import '../models/models.dart';

class AiGuidanceResult {
  final MessageTone tone;
  final String rewrite;
  final String logisticsSummary;
  final List<String> cues;

  const AiGuidanceResult({
    required this.tone,
    required this.rewrite,
    required this.logisticsSummary,
    required this.cues,
  });
}

class AiGuidanceService {
  static const _tenseWords = [
    'zawsze',
    'nigdy',
    'skandal',
    'musisz',
    'natychmiast',
    'to twoja wina',
  ];

  static const _positiveWords = [
    'prosze',
    'dziekuje',
    'potwierdzam',
    'czy mozemy',
    'dzieki',
  ];

  static AiGuidanceResult analyze(String text) {
    final normalized = text.trim().toLowerCase();
    final cues = <String>[];

    final tenseHits = _tenseWords.where(normalized.contains).toList();
    final positiveHits = _positiveWords.where(normalized.contains).toList();

    MessageTone tone = MessageTone.neutral;
    if (tenseHits.isNotEmpty) {
      tone = MessageTone.tense;
      cues.addAll(tenseHits);
    } else if (positiveHits.isNotEmpty) {
      tone = MessageTone.positive;
      cues.addAll(positiveHits);
    }

    var rewrite = text.trim();
    rewrite = rewrite
        .replaceAll('Musisz', 'Prosze')
        .replaceAll('musisz', 'prosze')
        .replaceAll('zawsze', 'czesto')
        .replaceAll('nigdy', 'rzadko');
    if (rewrite.isNotEmpty && !rewrite.toLowerCase().startsWith('prosze')) {
      rewrite = 'Prosze o potwierdzenie: $rewrite';
    }

    final logisticsSummary = _buildLogisticsSummary(text);

    return AiGuidanceResult(
      tone: tone,
      rewrite: rewrite,
      logisticsSummary: logisticsSummary,
      cues: cues,
    );
  }

  static String _buildLogisticsSummary(String text) {
    final trimmed = text.trim();
    if (trimmed.length <= 80) {
      return trimmed;
    }
    return '${trimmed.substring(0, 77)}...';
  }
}
