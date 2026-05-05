import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../theme/app_theme.dart';
import '../../models/models.dart';
import '../../providers/exports_provider.dart';
import '../../widgets/common_widgets.dart';

class ExportsScreen extends StatefulWidget {
  const ExportsScreen({super.key});

  @override
  State<ExportsScreen> createState() => _ExportsScreenState();
}

class _ExportsScreenState extends State<ExportsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }
      final provider = context.read<ExportsProvider>();
      if (provider.jobs.isEmpty && !provider.isLoading) {
        provider.loadExports();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final exportsProvider = context.watch<ExportsProvider>();

    return Scaffold(
      backgroundColor: AppTheme.surfaceColor,
      appBar: AppBar(
        title: const Text('Eksporty dowodowe'),
        actions: [
          IconButton(
            icon: const Icon(Icons.info_outline),
            onPressed: () => _showInfo(context),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // eIDAS notice
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: const Color(0xFFE3F2FD),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFF90CAF9)),
              ),
              child: const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.gavel, color: Color(0xFF1565C0), size: 18),
                      SizedBox(width: 8),
                      Text(
                        'Dowodowość w Polsce (eIDAS)',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF1565C0),
                        ),
                      ),
                    ],
                  ),
                  SizedBox(height: 6),
                  Text(
                    'Eksporty coparentes zawieraja metadane i manifest integralnosci SHA-256. To pomaga uporzadkowac material roboczy dla prawnika lub mediatora, ale nie stanowi gwarancji procesowej.',
                    style: TextStyle(fontSize: 12, color: Color(0xFF1565C0)),
                  ),
                  SizedBox(height: 4),
                  Text(
                    'Ocena przydatnosci i wiarygodnosci materialu zawsze nalezy do organu lub profesjonalisty prowadzacego sprawe.',
                    style: TextStyle(
                      fontSize: 11,
                      color: Color(0xFF1565C0),
                      fontStyle: FontStyle.italic,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // New export
            const Text(
              'Nowy eksport',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: AppTheme.textPrimary,
              ),
            ),
            const SizedBox(height: 12),
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
              childAspectRatio: 1.4,
              children: ExportType.values.map((type) {
                return _ExportTypeCard(
                  type: type,
                  onTap: () => _createExport(context, type),
                );
              }).toList(),
            ),

            const SizedBox(height: 24),

            // History
            const Text(
              'Historia eksportów',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: AppTheme.textPrimary,
              ),
            ),
            const SizedBox(height: 12),
            if (exportsProvider.isLoading)
              const Center(child: CircularProgressIndicator())
            else if (exportsProvider.jobs.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text(
                  'Brak wygenerowanych eksportow.',
                  style: TextStyle(color: AppTheme.textSecondary),
                ),
              )
            else
              ...exportsProvider.jobs.map((job) => _ExportJobCard(job: job)),
          ],
        ),
      ),
    );
  }

  Future<void> _createExport(BuildContext context, ExportType type) async {
    final job = await showModalBottomSheet<ExportJob>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _ExportConfigSheet(type: type),
    );

    if (!context.mounted || job == null) return;

    final created = await context.read<ExportsProvider>().createExport(
          type: job.type,
          fromDate: job.fromDate,
          toDate: job.toDate,
        );
    if (!context.mounted || created == null) return;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'Pakiet "${created.typeLabel}" wygenerowany z manifestem SHA-256',
        ),
        backgroundColor: AppTheme.successColor,
      ),
    );
  }

  void _showInfo(BuildContext context) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('O eksportach dowodowych'),
        content: const SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Format eksportu:',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
              SizedBox(height: 4),
              Text('• JSON dla MVP'),
              Text('• Zakres dat i typ pakietu'),
              Text('• Manifest integralnosci'),
              SizedBox(height: 12),
              Text(
                'Manifest zawiera:',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
              SizedBox(height: 4),
              Text('• SHA-256 calego payloadu'),
              Text('• Id eksportu i czas generacji'),
              Text('• Metadane: czas, użytkownik, wersja'),
              SizedBox(height: 12),
              Text(
                'Jak przekazać prawnikowi:',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
              SizedBox(height: 4),
              Text(
                'Pobierz paczke robocza i przekaz prawnikowi albo mediatorowi. W MVP eksport sluzy do porzadkowania materialu, a nie do skladania obietnic procesowych.',
              ),
            ],
          ),
        ),
        actions: [
          ElevatedButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }
}

class _ExportTypeCard extends StatelessWidget {
  final ExportType type;
  final VoidCallback onTap;

  const _ExportTypeCard({required this.type, required this.onTap});

  Color get _color {
    switch (type) {
      case ExportType.messages:
        return AppTheme.primaryTeal;
      case ExportType.calendar:
        return AppTheme.parentBColor;
      case ExportType.finances:
        return AppTheme.successColor;
      case ExportType.fullPack:
        return AppTheme.highConflictColor;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: _color.withValues(alpha: 0.2),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(type.typeIcon, color: _color, size: 24),
              const SizedBox(height: 8),
              Text(
                type.typeLabel,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: _color,
                ),
              ),
              if (type == ExportType.fullPack) ...[
                const SizedBox(height: 2),
                const Text(
                  'PDF + ZIP + manifest',
                  style: TextStyle(
                    fontSize: 10,
                    color: AppTheme.textSecondary,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _ExportJobCard extends StatelessWidget {
  final ExportJob job;

  const _ExportJobCard({required this.job});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: AppTheme.primaryTeal.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    job.typeIcon,
                    color: AppTheme.primaryTeal,
                    size: 18,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        job.typeLabel,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.textPrimary,
                        ),
                      ),
                      Text(
                        '${job.fromDate.day}.${job.fromDate.month}.${job.fromDate.year} – ${job.toDate.day}.${job.toDate.month}.${job.toDate.year}',
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppTheme.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                const StatusChip(
                  label: 'Gotowy',
                  color: AppTheme.successColor,
                ),
              ],
            ),
            if (job.manifestHash != null) ...[
              const SizedBox(height: 10),
              HashIntegrityFooter(hash: job.manifestHash!),
            ],
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    icon: const Icon(Icons.verified, size: 14),
                    label: const Text(
                      'Weryfikuj',
                      style: TextStyle(fontSize: 12),
                    ),
                    onPressed: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                            'Manifest ${job.manifestHash ?? 'niedostepny'} jest zapisany przy eksporcie.',
                          ),
                          backgroundColor: AppTheme.successColor,
                        ),
                      );
                    },
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: ElevatedButton.icon(
                    icon: const Icon(Icons.download, size: 14),
                    label: const Text(
                      'Pobierz',
                      style: TextStyle(fontSize: 12),
                    ),
                    onPressed: () async {
                      final payload = await context
                          .read<ExportsProvider>()
                          .downloadExport(job.id);
                      if (!context.mounted || payload == null) {
                        return;
                      }

                      final itemCount =
                          (payload['payload']?['items'] as List<dynamic>? ?? [])
                              .length;
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                            'Eksport gotowy: $itemCount element(ow) w paczce.',
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _ExportConfigSheet extends StatefulWidget {
  final ExportType type;
  const _ExportConfigSheet({required this.type});

  @override
  State<_ExportConfigSheet> createState() => _ExportConfigSheetState();
}

class _ExportConfigSheetState extends State<_ExportConfigSheet> {
  DateTime _fromDate = DateTime.now().subtract(const Duration(days: 90));
  DateTime _toDate = DateTime.now();
  bool _includeAttachments = true;
  bool _includeManifest = true;
  bool _isGenerating = false;

  @override
  Widget build(BuildContext context) {
    return Padding(
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
          Text(
            'Nowy eksport – ${widget.type.typeLabel}',
            style: const TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w700,
              color: AppTheme.textPrimary,
            ),
          ),
          const SizedBox(height: 16),

          // Date range
          Row(
            children: [
              Expanded(
                child: _DatePickerField(
                  label: 'Od',
                  date: _fromDate,
                  onChanged: (d) => setState(() => _fromDate = d),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _DatePickerField(
                  label: 'Do',
                  date: _toDate,
                  onChanged: (d) => setState(() => _toDate = d),
                ),
              ),
            ],
          ),

          const SizedBox(height: 16),

          SwitchListTile(
            title: const Text('Załącz pliki (paragony, dokumenty)'),
            value: _includeAttachments,
            onChanged: (v) => setState(() => _includeAttachments = v),
            activeThumbColor: AppTheme.primaryTeal,
            contentPadding: EdgeInsets.zero,
          ),
          SwitchListTile(
            title: const Text('Manifest integralności SHA-256'),
            subtitle: const Text('Wymagany do weryfikacji dowodowej'),
            value: _includeManifest,
            onChanged: (v) => setState(() => _includeManifest = v),
            activeThumbColor: AppTheme.primaryTeal,
            contentPadding: EdgeInsets.zero,
          ),

          const SizedBox(height: 16),

          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              icon: _isGenerating
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        color: Colors.white,
                        strokeWidth: 2,
                      ),
                    )
                  : const Icon(Icons.folder_special),
              label: Text(_isGenerating ? 'Generuję...' : 'Generuj eksport'),
              onPressed: _isGenerating ? null : _generate,
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _generate() async {
    setState(() => _isGenerating = true);
    await Future.delayed(const Duration(seconds: 2));
    if (mounted) {
      Navigator.pop(
        context,
        ExportJob(
          id: 'exp_${DateTime.now().millisecondsSinceEpoch}',
          type: widget.type,
          fromDate: _fromDate,
          toDate: _toDate,
          status: 'completed',
          manifestHash: _includeManifest
              ? 'sha256_bundle_${DateTime.now().millisecondsSinceEpoch}'
              : null,
          createdAt: DateTime.now(),
        ),
      );
    }
  }
}

class _DatePickerField extends StatelessWidget {
  final String label;
  final DateTime date;
  final ValueChanged<DateTime> onChanged;

  const _DatePickerField({
    required this.label,
    required this.date,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () async {
        final picked = await showDatePicker(
          context: context,
          initialDate: date,
          firstDate: DateTime(2020),
          lastDate: DateTime.now(),
        );
        if (picked != null) onChanged(picked);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppTheme.dividerColor),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: const TextStyle(
                fontSize: 11,
                color: AppTheme.textSecondary,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              '${date.day}.${date.month}.${date.year}',
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppTheme.textPrimary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
