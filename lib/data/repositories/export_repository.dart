import '../../models/models.dart';
import '../api/app_api_client.dart';
import '../local/offline_store.dart';
import '../serializers/api_serializers.dart';

class ExportRepository {
  final AppApiClient _apiClient;
  final OfflineStore _offlineStore;

  ExportRepository({
    required AppApiClient apiClient,
    required OfflineStore offlineStore,
  })  : _apiClient = apiClient,
        _offlineStore = offlineStore;

  Future<List<ExportJob>> getExports() async {
    await syncPendingActions();

    try {
      final payload = await _apiClient.getJson('/exports');
      final jobs = (payload['jobs'] as List<dynamic>)
          .map(
            (item) => exportJobFromJson(
              Map<String, dynamic>.from(item as Map),
            ),
          )
          .toList();
      await _saveJobs(jobs);
      return jobs;
    } catch (error) {
      final cached = _getCachedJobs();
      if (cached.isNotEmpty) {
        return cached;
      }
      rethrow;
    }
  }

  Future<ExportJob> createExport({
    required ExportType type,
    required DateTime fromDate,
    required DateTime toDate,
    String? threadId,
  }) async {
    try {
      final payload = await _apiClient.postJson('/exports', {
        'type': exportTypeToApi(type),
        'fromDate': fromDate.toIso8601String(),
        'toDate': toDate.toIso8601String(),
        'threadId': threadId,
      });
      final job = exportJobFromJson(payload);
      await _upsertJob(job);
      return job;
    } catch (error) {
      if (!_apiClient.isNetworkError(error)) {
        rethrow;
      }

      final now = DateTime.now();
      final localJob = ExportJob(
        id: 'local_export_${now.microsecondsSinceEpoch}',
        type: type,
        fromDate: fromDate,
        toDate: toDate,
        status: 'queued',
        createdAt: now,
      );
      await _upsertJob(localJob);
      await _offlineStore.appendPendingAction({
        'type': 'exports.createExport',
        'createdAt': now.toIso8601String(),
        'payload': {
          'clientExportId': localJob.id,
          'type': exportTypeToApi(type),
          'fromDate': fromDate.toIso8601String(),
          'toDate': toDate.toIso8601String(),
          'threadId': threadId,
        },
      });
      return localJob;
    }
  }

  Future<Map<String, dynamic>> downloadExport(String exportId) async {
    try {
      final payload = await _apiClient.getJson('/exports/$exportId/download');
      await _offlineStore.saveExportDownload(exportId, payload);
      return payload;
    } catch (error) {
      final cached = _offlineStore.getExportDownload(exportId);
      if (cached != null) {
        return cached;
      }
      rethrow;
    }
  }

  Future<void> syncPendingActions() async {
    final actions = _offlineStore.getPendingActions();
    if (actions.isEmpty) {
      return;
    }

    final cachedJobs = _getCachedJobs();
    final rewrittenQueue = <Map<String, dynamic>>[];
    var networkFailed = false;

    for (final action in actions) {
      final type = action['type'] as String? ?? '';
      if (!type.startsWith('exports.')) {
        rewrittenQueue.add(action);
        continue;
      }

      if (networkFailed) {
        rewrittenQueue.add(action);
        continue;
      }

      try {
        switch (type) {
          case 'exports.createExport':
            final payload = Map<String, dynamic>.from(action['payload'] as Map);
            final response = await _apiClient.postJson('/exports', {
              'type': payload['type'],
              'fromDate': payload['fromDate'],
              'toDate': payload['toDate'],
              'threadId': payload['threadId'],
            });
            final createdJob = exportJobFromJson(response);
            final clientExportId = payload['clientExportId'] as String;
            _replaceJob(cachedJobs, clientExportId, createdJob);
            break;
          default:
            rewrittenQueue.add(action);
        }
      } on ApiException {
        rethrow;
      } catch (_) {
        networkFailed = true;
        rewrittenQueue.add(action);
      }
    }

    await _saveJobs(cachedJobs);
    await _offlineStore.savePendingActions(rewrittenQueue);
  }

  List<ExportJob> _getCachedJobs() {
    return _offlineStore
        .getExports()
        .map(exportJobFromJson)
        .toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  }

  Future<void> _saveJobs(List<ExportJob> jobs) {
    return _offlineStore.saveExports(jobs.map(exportJobToJson).toList());
  }

  Future<void> _upsertJob(ExportJob job) async {
    final cachedJobs = _getCachedJobs();
    final index = cachedJobs.indexWhere((item) => item.id == job.id);
    if (index >= 0) {
      cachedJobs[index] = job;
    } else {
      cachedJobs.insert(0, job);
    }
    cachedJobs.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    await _saveJobs(cachedJobs);
  }

  void _replaceJob(List<ExportJob> jobs, String oldId, ExportJob replacement) {
    final index = jobs.indexWhere((job) => job.id == oldId);
    if (index >= 0) {
      jobs[index] = replacement;
    } else {
      jobs.insert(0, replacement);
    }
  }
}
