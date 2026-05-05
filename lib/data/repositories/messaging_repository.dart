import '../../models/models.dart';
import '../api/app_api_client.dart';
import '../local/offline_store.dart';
import '../serializers/api_serializers.dart';

class MessagingRepository {
  final AppApiClient _apiClient;
  final OfflineStore _offlineStore;

  MessagingRepository({
    required AppApiClient apiClient,
    required OfflineStore offlineStore,
  })  : _apiClient = apiClient,
        _offlineStore = offlineStore;

  Future<List<MessageThread>> getThreads() async {
    await syncPendingActions();

    try {
      final payload = await _apiClient.getJson('/threads');
      final threads = (payload['threads'] as List<dynamic>)
          .map(
            (item) => messageThreadFromJson(
              Map<String, dynamic>.from(item as Map),
            ),
          )
          .toList();
      await _saveThreads(threads);
      return threads;
    } catch (error) {
      final cached = _getCachedThreads();
      if (cached.isNotEmpty) {
        return cached;
      }
      rethrow;
    }
  }

  Future<MessageThread> createThread({
    required String subject,
    required String category,
    String? childId,
  }) async {
    try {
      final payload = await _apiClient.postJson('/threads', {
        'subject': subject,
        'category': category,
        'childId': childId,
      });
      final thread = messageThreadFromJson(payload);
      await _upsertThread(thread);
      return thread;
    } catch (error) {
      if (!_apiClient.isNetworkError(error)) {
        rethrow;
      }

      final now = DateTime.now();
      final localThread = MessageThread(
        id: 'local_thread_${now.microsecondsSinceEpoch}',
        subject: subject,
        category: category,
        childId: childId,
        lastActivity: now,
        hasUnread: false,
        messages: const [],
      );

      await _upsertThread(localThread);
      await _offlineStore.appendPendingAction({
        'type': 'messaging.createThread',
        'createdAt': now.toIso8601String(),
        'payload': {
          'clientThreadId': localThread.id,
          'subject': subject,
          'category': category,
          'childId': childId,
        },
      });
      return localThread;
    }
  }

  Future<MessageThread> sendMessage({
    required String threadId,
    required String content,
    required MessageTone tone,
  }) async {
    try {
      final payload = await _apiClient.postJson('/threads/$threadId/messages', {
        'content': content,
        'tone': messageToneToApi(tone),
      });
      final thread = messageThreadFromJson(payload);
      await _upsertThread(thread);
      return thread;
    } catch (error) {
      if (!_apiClient.isNetworkError(error)) {
        rethrow;
      }

      final now = DateTime.now();
      final cachedThreads = _getCachedThreads();
      final threadIndex = cachedThreads.indexWhere((thread) => thread.id == threadId);
      final optimisticMessage = Message(
        id: 'local_msg_${now.microsecondsSinceEpoch}',
        threadId: threadId,
        senderId: 'local_user',
        senderName: 'Ty',
        content: content,
        tone: tone,
        attachments: const [],
        sentAt: now,
        isDelivered: false,
        isRead: true,
        hash: 'pending_${now.microsecondsSinceEpoch}',
        isShielded: tone == MessageTone.aggressive,
      );

      late final MessageThread optimisticThread;
      if (threadIndex >= 0) {
        final existing = cachedThreads[threadIndex];
        optimisticThread = MessageThread(
          id: existing.id,
          subject: existing.subject,
          category: existing.category,
          childId: existing.childId,
          lastActivity: now,
          hasUnread: existing.hasUnread,
          messages: [...existing.messages, optimisticMessage],
        );
        cachedThreads[threadIndex] = optimisticThread;
      } else {
        optimisticThread = MessageThread(
          id: threadId,
          subject: 'Nowy wątek',
          category: 'Ogólne',
          childId: null,
          lastActivity: now,
          hasUnread: false,
          messages: [optimisticMessage],
        );
        cachedThreads.insert(0, optimisticThread);
      }

      await _saveThreads(cachedThreads);
      await _offlineStore.appendPendingAction({
        'type': 'messaging.sendMessage',
        'createdAt': now.toIso8601String(),
        'payload': {
          'threadId': threadId,
          'content': content,
          'tone': messageToneToApi(tone),
        },
      });

      return optimisticThread;
    }
  }

  Future<void> syncPendingActions() async {
    final actions = _offlineStore.getPendingActions();
    if (actions.isEmpty) {
      return;
    }

    final cachedThreads = _getCachedThreads();
    final rewrittenQueue = <Map<String, dynamic>>[];
    final localThreadIdMap = <String, String>{};
    var networkFailed = false;

    for (final action in actions) {
      final type = action['type'] as String? ?? '';
      if (!type.startsWith('messaging.')) {
        rewrittenQueue.add(action);
        continue;
      }

      if (networkFailed) {
        rewrittenQueue.add(action);
        continue;
      }

      try {
        switch (type) {
          case 'messaging.createThread':
            final payload = Map<String, dynamic>.from(action['payload'] as Map);
            final response = await _apiClient.postJson('/threads', {
              'subject': payload['subject'],
              'category': payload['category'],
              'childId': payload['childId'],
            });
            final createdThread = messageThreadFromJson(response);
            final clientThreadId = payload['clientThreadId'] as String;
            localThreadIdMap[clientThreadId] = createdThread.id;
            _replaceThreadId(cachedThreads, clientThreadId, createdThread);
            break;
          case 'messaging.sendMessage':
            final payload = Map<String, dynamic>.from(action['payload'] as Map);
            final requestedThreadId = payload['threadId'] as String;
            final resolvedThreadId = localThreadIdMap[requestedThreadId] ?? requestedThreadId;
            final response = await _apiClient.postJson(
              '/threads/$resolvedThreadId/messages',
              {
                'content': payload['content'],
                'tone': payload['tone'],
              },
            );
            final updatedThread = messageThreadFromJson(response);
            _replaceThreadId(cachedThreads, resolvedThreadId, updatedThread);
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

    await _saveThreads(cachedThreads);
    await _offlineStore.savePendingActions(rewrittenQueue);
  }

  List<MessageThread> _getCachedThreads() {
    return _offlineStore
        .getThreads()
        .map(messageThreadFromJson)
        .toList()
      ..sort((a, b) => b.lastActivity.compareTo(a.lastActivity));
  }

  Future<void> _saveThreads(List<MessageThread> threads) {
    return _offlineStore.saveThreads(threads.map(messageThreadToJson).toList());
  }

  Future<void> _upsertThread(MessageThread thread) async {
    final cachedThreads = _getCachedThreads();
    final index = cachedThreads.indexWhere((item) => item.id == thread.id);
    if (index >= 0) {
      cachedThreads[index] = thread;
    } else {
      cachedThreads.insert(0, thread);
    }
    cachedThreads.sort((a, b) => b.lastActivity.compareTo(a.lastActivity));
    await _saveThreads(cachedThreads);
  }

  void _replaceThreadId(
    List<MessageThread> threads,
    String threadId,
    MessageThread replacement,
  ) {
    final index = threads.indexWhere((thread) => thread.id == threadId);
    if (index >= 0) {
      threads[index] = replacement;
    } else {
      threads.insert(0, replacement);
    }
  }
}
