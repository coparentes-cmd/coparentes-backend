import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/offline_sync_provider.dart';
import '../theme/app_theme.dart';

class OfflineStatusBanner extends StatelessWidget {
  const OfflineStatusBanner({super.key});

  @override
  Widget build(BuildContext context) {
    final offline = context.watch<OfflineSyncProvider>();
    if (!offline.showBanner) {
      return const SizedBox.shrink();
    }

    final background = offline.isOnline
        ? AppTheme.primaryTeal.withValues(alpha: 0.96)
        : AppTheme.textPrimary.withValues(alpha: 0.96);

    return SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
        child: Material(
          color: Colors.transparent,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: background,
              borderRadius: BorderRadius.circular(18),
              boxShadow: AppTheme.softShadow,
            ),
            child: Row(
              children: [
                Icon(
                  offline.isOnline ? Icons.cloud_done : Icons.cloud_off,
                  color: Colors.white,
                  size: 18,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    offline.statusLabel,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                TextButton(
                  onPressed: offline.isSyncing
                      ? null
                      : () => context.read<OfflineSyncProvider>().syncNow(),
                  style: TextButton.styleFrom(
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                  ),
                  child: Text(offline.isSyncing ? 'Trwa…' : 'Synchronizuj'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
