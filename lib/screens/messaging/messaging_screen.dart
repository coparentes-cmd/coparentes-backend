import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/models.dart';
import '../../providers/app_provider.dart';
import '../../providers/exports_provider.dart';
import '../../services/ai_guidance_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/common_widgets.dart';

class MessagingScreen extends StatefulWidget {
  final String? openThreadId;
  const MessagingScreen({super.key, this.openThreadId});

  @override
  State<MessagingScreen> createState() => _MessagingScreenState();
}

class _MessagingScreenState extends State<MessagingScreen> {
  String _selectedCategory = 'Wszystkie';
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }
      final messaging = context.read<MessagingProvider>();
      if (messaging.threads.isEmpty && !messaging.isLoading) {
        messaging.loadThreads();
      }
    });

    if (widget.openThreadId != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        final messaging = context.read<MessagingProvider>();
        final thread = messaging.getThreadById(widget.openThreadId!);
        if (thread == null) {
          return;
        }
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => ThreadScreen(threadId: thread.id),
          ),
        );
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final messaging = context.watch<MessagingProvider>();
    final user = context.watch<AppProvider>().currentUser;
    final isReadOnly = user?.role == UserRole.observer;
    final visibleThreads = messaging.threads.where((thread) {
      final matchesCategory =
          _selectedCategory == 'Wszystkie' || thread.category == _selectedCategory;
      final query = _searchQuery.trim().toLowerCase();
      final matchesQuery = query.isEmpty ||
          thread.subject.toLowerCase().contains(query) ||
          thread.messages.any(
            (message) => message.content.toLowerCase().contains(query),
          );
      return matchesCategory && matchesQuery;
    }).toList();

    return Scaffold(
      backgroundColor: AppTheme.surfaceColor,
      appBar: AppBar(
        title: const Text('Wiadomości'),
        actions: [
          IconButton(
            icon: const Icon(Icons.search),
            onPressed: () => _showSearch(context),
          ),
          if (!isReadOnly)
            IconButton(
              icon: const Icon(Icons.add),
              onPressed: () => _newThread(context),
            ),
        ],
      ),
      body: Column(
        children: [
          // Category filter chips
          SizedBox(
            height: 50,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              children: [
                'Wszystkie',
                'Szkoła',
                'Zdrowie',
                'Finansowe',
                'Zmiana grafiku',
                'Inne',
              ]
                  .map(
                    (cat) => _CategoryChip(
                      category: cat,
                      selected: _selectedCategory == cat,
                      onTap: () => setState(() => _selectedCategory = cat),
                    ),
                  )
                  .toList(),
            ),
          ),
          // Immutable notice
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: AppTheme.immutableBadge.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Row(
              children: [
                Icon(Icons.lock, size: 14, color: AppTheme.immutableBadge),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Wiadomości po wysłaniu są niezmienialnie archiwizowane (hash SHA-256)',
                    style: TextStyle(
                      fontSize: 11,
                      color: AppTheme.immutableBadge,
                    ),
                  ),
                ),
              ],
            ),
          ),
          // AI contextual tip for messaging
          if (!isReadOnly)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: AiContextualTip(
                tips: AiTips.messaging,
                intervalSeconds: 7,
              ),
            ),
          // Threads list
          Expanded(
            child: messaging.isLoading
                ? const Center(child: CircularProgressIndicator())
                : visibleThreads.isEmpty
                ? const EmptyState(
                    icon: Icons.chat_bubble_outline,
                    title: 'Brak wyników',
                    subtitle: 'Zmień filtr albo rozpocznij nowy wątek tematyczny',
                  )
                : ListView.builder(
                    itemCount: visibleThreads.length,
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    itemBuilder: (ctx, i) {
                      return _ThreadTile(thread: visibleThreads[i]);
                    },
                  ),
          ),
        ],
      ),
      floatingActionButton: isReadOnly
          ? null
          : FloatingActionButton.extended(
              onPressed: () => _newThread(context),
              icon: const Icon(Icons.edit),
              label: const Text('Nowy wątek'),
            ),
    );
  }

  void _showSearch(BuildContext context) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Search threads'),
        content: TextField(
          autofocus: true,
          decoration: const InputDecoration(
            hintText: 'Search by subject or message content',
          ),
          onChanged: (value) => _searchQuery = value,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              setState(() {});
              Navigator.pop(context);
            },
            child: const Text('Apply'),
          ),
        ],
      ),
    );
  }

  Future<void> _newThread(BuildContext context) async {
    final thread = await showModalBottomSheet<MessageThread>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => const _NewThreadSheet(),
    );

    if (!context.mounted || thread == null) return;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Wątek "${thread.subject}" został utworzony'),
        backgroundColor: AppTheme.successColor,
      ),
    );

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ThreadScreen(threadId: thread.id),
      ),
    );
  }
}

class _CategoryChip extends StatelessWidget {
  final String category;
  final bool selected;
  final VoidCallback onTap;

  const _CategoryChip({
    required this.category,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: FilterChip(
        label: Text(category),
        selected: selected,
        onSelected: (_) => onTap(),
        backgroundColor: Colors.white,
        selectedColor: AppTheme.primaryTeal.withValues(alpha: 0.15),
        checkmarkColor: AppTheme.primaryTeal,
        labelStyle: TextStyle(
          fontSize: 12,
          color: selected ? AppTheme.primaryTeal : AppTheme.textSecondary,
          fontWeight: selected ? FontWeight.w600 : FontWeight.normal,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: BorderSide(
            color: selected ? AppTheme.primaryTeal : AppTheme.dividerColor,
          ),
        ),
      ),
    );
  }
}

class _ThreadTile extends StatelessWidget {
  final MessageThread thread;
  const _ThreadTile({required this.thread});

  @override
  Widget build(BuildContext context) {
    final lastMsg = thread.messages.isNotEmpty ? thread.messages.last : null;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => ThreadScreen(threadId: thread.id),
              ),
            );
          },
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: thread.categoryColor.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    thread.categoryIcon,
                    color: thread.categoryColor,
                    size: 22,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Text(
                              thread.subject,
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: thread.hasUnread
                                    ? FontWeight.w700
                                    : FontWeight.w500,
                                color: AppTheme.textPrimary,
                              ),
                            ),
                          ),
                          Text(
                            _formatTime(thread.lastActivity),
                            style: const TextStyle(
                              fontSize: 11,
                              color: AppTheme.textHint,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 6,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: thread.categoryColor.withValues(
                                alpha: 0.08,
                              ),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              thread.category,
                              style: TextStyle(
                                fontSize: 10,
                                color: thread.categoryColor,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          if (lastMsg != null)
                            Expanded(
                              child: Text(
                                '${lastMsg.senderName}: ${lastMsg.content}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: AppTheme.textSecondary,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Column(
                  children: [
                    if (thread.hasUnread)
                      Container(
                        width: 10,
                        height: 10,
                        decoration: const BoxDecoration(
                          color: AppTheme.primaryTeal,
                          shape: BoxShape.circle,
                        ),
                      ),
                    const SizedBox(height: 4),
                    Text(
                      '${thread.messages.length}',
                      style: const TextStyle(
                        fontSize: 11,
                        color: AppTheme.textHint,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _formatTime(DateTime dt) {
    final now = DateTime.now();
    final diff = now.difference(dt);
    if (diff.inMinutes < 60) return '${diff.inMinutes}m';
    if (diff.inHours < 24) return '${diff.inHours}h';
    return '${diff.inDays}d';
  }
}

// ─── Thread Screen ─────────────────────────────────────────────────────────────

class ThreadScreen extends StatefulWidget {
  final String threadId;
  const ThreadScreen({super.key, required this.threadId});

  @override
  State<ThreadScreen> createState() => _ThreadScreenState();
}

class _ThreadScreenState extends State<ThreadScreen> {
  final TextEditingController _controller = TextEditingController();
  String _analyzedTone = 'neutral';
  bool _showAiSuggestion = false;
  String _aiSuggestion = '';

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AppProvider>().currentUser;
    final aiCoach = context.watch<AppProvider>().aiCoachEnabled;
    final aiShield = context.watch<AppProvider>().aiShieldEnabled;
    final isReadOnly = user?.role == UserRole.observer;
    final thread = context.watch<MessagingProvider>().getThreadById(widget.threadId);

    if (thread == null) {
      return const Scaffold(
        body: Center(
          child: Text('Nie znaleziono watku.'),
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppTheme.surfaceColor,
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(thread.subject, style: const TextStyle(fontSize: 16)),
            Text(
              thread.category,
              style: const TextStyle(fontSize: 12, color: Colors.white70),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.picture_as_pdf_outlined),
            onPressed: () => _exportThread(context),
            tooltip: 'Eksportuj wątek',
          ),
        ],
      ),
      body: Column(
        children: [
          // Immutable + shield notice
          Container(
            margin: const EdgeInsets.all(8),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppTheme.dividerColor),
            ),
            child: Row(
              children: [
                const ImmutableBadge(),
                const SizedBox(width: 8),
                if (aiShield) ...[
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 6,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: AppTheme.aiCoachColor.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.shield,
                          size: 10,
                          color: AppTheme.aiCoachColor,
                        ),
                        SizedBox(width: 3),
                        Text(
                          'AI Shield',
                          style: TextStyle(
                            fontSize: 9,
                            color: AppTheme.aiCoachColor,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),

          // Messages list
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              itemCount: thread.messages.length,
              itemBuilder: (ctx, i) {
                final msg = thread.messages[i];
                final isMe = msg.senderId == user?.id;
                return _MessageBubble(
                  message: msg,
                  isMe: isMe,
                  aiShieldEnabled: aiShield,
                );
              },
            ),
          ),

          // AI Coach area
          if (_showAiSuggestion && aiCoach)
            Container(
              margin: const EdgeInsets.symmetric(horizontal: 12),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFE3F2FD),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFF90CAF9)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Icon(
                        Icons.auto_awesome,
                        size: 14,
                        color: AppTheme.aiCoachColor,
                      ),
                      SizedBox(width: 4),
                      Text(
                        'Sugestia AI Coach',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: AppTheme.aiCoachColor,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    _aiSuggestion,
                    style: const TextStyle(
                      fontSize: 13,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const AiDisclaimerBanner(),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () {
                            setState(() => _showAiSuggestion = false);
                          },
                          style: OutlinedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 8),
                          ),
                          child: const Text('Użyj oryginału'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: ElevatedButton(
                          onPressed: () {
                            _controller.text = _aiSuggestion;
                            setState(() => _showAiSuggestion = false);
                          },
                          style: ElevatedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 8),
                          ),
                          child: const Text('Użyj sugestii'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),

          // Tone indicator
          if (_controller.text.isNotEmpty && aiCoach)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              child: _ToneIndicator(tone: _analyzedTone),
            ),

          // AI tip shown when input is empty and coach is on
          if (_controller.text.isEmpty && aiCoach && !_showAiSuggestion)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 4),
              child: AiContextualTip(
                tips: AiTips.messaging,
                intervalSeconds: 8,
                dismissible: true,
              ),
            ),

          // Input area
          if (!isReadOnly)
            Container(
              color: Colors.white,
              padding: EdgeInsets.only(
                left: 12,
                right: 12,
                top: 8,
                bottom: MediaQuery.of(context).viewInsets.bottom + 12,
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  IconButton(
                    icon: const Icon(
                      Icons.attach_file,
                      color: AppTheme.textSecondary,
                    ),
                    onPressed: () {},
                  ),
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      maxLines: 4,
                      minLines: 1,
                      decoration: const InputDecoration(
                        hintText: 'Napisz wiadomość...',
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.all(Radius.circular(20)),
                          borderSide: BorderSide(color: AppTheme.dividerColor),
                        ),
                        contentPadding: EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 10,
                        ),
                      ),
                      onChanged: (v) {
                        setState(() {});
                        if (aiCoach && v.length > 10) {
                          _analyzeTone(v);
                        }
                      },
                    ),
                  ),
                  const SizedBox(width: 8),
                  if (aiCoach && _controller.text.length > 10)
                    IconButton(
                      icon: const Icon(
                        Icons.auto_awesome,
                        color: AppTheme.aiCoachColor,
                      ),
                      onPressed: _getAiSuggestion,
                      tooltip: 'AI Coach',
                    ),
                  IconButton(
                    icon: Icon(
                      Icons.send,
                      color: _controller.text.isEmpty
                          ? AppTheme.textHint
                          : AppTheme.primaryTeal,
                    ),
                    onPressed: _controller.text.isEmpty ? null : _sendMessage,
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  void _analyzeTone(String text) {
    final result = AiGuidanceService.analyze(text);
    setState(() => _analyzedTone = result.tone == MessageTone.tense ? 'tense' : 'neutral');
  }

  void _getAiSuggestion() {
    final result = AiGuidanceService.analyze(_controller.text);
    setState(() {
      _aiSuggestion = result.rewrite;
      _showAiSuggestion = true;
    });
  }

  void _sendMessage() {
    final content = _controller.text.trim();
    if (content.isEmpty) return;
    context.read<MessagingProvider>().sendMessage(
      threadId: widget.threadId,
      content: content,
      tone: _analyzedTone == 'neutral'
          ? MessageTone.neutral
          : MessageTone.tense,
    );
    _controller.clear();
    setState(() {
      _showAiSuggestion = false;
      _analyzedTone = 'neutral';
    });
  }

  void _exportThread(BuildContext context) {
    final thread = context.read<MessagingProvider>().getThreadById(widget.threadId);

    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Eksport wątku'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Watek: ${thread?.subject ?? 'Brak'}'),
            Text('Wiadomosci: ${thread?.messages.length ?? 0}'),
            const SizedBox(height: 12),
            const Text(
              'Eksport bedzie zawieral:',
              style: TextStyle(fontWeight: FontWeight.w600),
            ),
            const Text('• JSON pakietu wiadomosci'),
            const Text('• Manifest integralnosci SHA-256'),
            const Text('• Metadane: czas, nadawca, dostarczenie'),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Anuluj'),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(context);
              final thread = context.read<MessagingProvider>().getThreadById(widget.threadId);
              if (thread == null) {
                return;
              }

              final created = await context.read<ExportsProvider>().createExport(
                type: ExportType.messages,
                fromDate: thread.messages.isEmpty
                    ? DateTime.now()
                    : thread.messages.first.sentAt,
                toDate: thread.messages.isEmpty
                    ? DateTime.now()
                    : thread.messages.last.sentAt,
                threadId: thread.id,
              );

              if (!context.mounted || created == null) {
                return;
              }

              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text(
                    'Eksport ${created.typeLabel} zostal wygenerowany.',
                  ),
                  backgroundColor: AppTheme.successColor,
                ),
              );
            },
            child: const Text('Generuj eksport'),
          ),
        ],
      ),
    );
  }
}

class _MessageBubble extends StatefulWidget {
  final Message message;
  final bool isMe;
  final bool aiShieldEnabled;

  const _MessageBubble({
    required this.message,
    required this.isMe,
    required this.aiShieldEnabled,
  });

  @override
  State<_MessageBubble> createState() => _MessageBubbleState();
}

class _MessageBubbleState extends State<_MessageBubble> {
  bool _showOriginal = false;

  bool get _isShielded =>
      widget.aiShieldEnabled &&
      !widget.isMe &&
      widget.message.tone == MessageTone.tense;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: widget.isMe ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.78,
        ),
        child: Column(
          crossAxisAlignment: widget.isMe
              ? CrossAxisAlignment.end
              : CrossAxisAlignment.start,
          children: [
            // Sender name
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
              child: Text(
                widget.message.senderName,
                style: const TextStyle(
                  fontSize: 11,
                  color: AppTheme.textSecondary,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
            // Bubble
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: widget.isMe
                    ? AppTheme.primaryTeal
                    : Colors.white,
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(16),
                  topRight: const Radius.circular(16),
                  bottomLeft: Radius.circular(widget.isMe ? 16 : 4),
                  bottomRight: Radius.circular(widget.isMe ? 4 : 16),
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.05),
                    blurRadius: 4,
                    offset: const Offset(0, 1),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (_isShielded && !_showOriginal) ...[
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.shield,
                          size: 12,
                          color: AppTheme.aiCoachColor,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          'AI Shield – wersja logistyczna',
                          style: const TextStyle(
                            fontSize: 10,
                            color: AppTheme.aiCoachColor,
                            fontStyle: FontStyle.italic,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _extractLogistics(widget.message.content),
                      style: TextStyle(
                        fontSize: 14,
                        color: widget.isMe ? Colors.white : AppTheme.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 6),
                    GestureDetector(
                      onTap: () => setState(() => _showOriginal = true),
                      child: const Text(
                        'Pokaż oryginał',
                        style: TextStyle(
                          fontSize: 11,
                          color: AppTheme.aiCoachColor,
                          decoration: TextDecoration.underline,
                        ),
                      ),
                    ),
                  ] else ...[
                    Text(
                      widget.message.content,
                      style: TextStyle(
                        fontSize: 14,
                        color: widget.isMe ? Colors.white : AppTheme.textPrimary,
                      ),
                    ),
                    if (_isShielded && _showOriginal) ...[
                      const SizedBox(height: 4),
                      GestureDetector(
                        onTap: () => setState(() => _showOriginal = false),
                        child: const Text(
                          'Ukryj oryginał',
                          style: TextStyle(
                            fontSize: 11,
                            color: AppTheme.aiCoachColor,
                            decoration: TextDecoration.underline,
                          ),
                        ),
                      ),
                    ],
                  ],
                  if (widget.message.attachments.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    ...widget.message.attachments.map(
                      (att) => Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.black12,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.attach_file,
                              size: 12,
                              color: widget.isMe ? Colors.white70 : AppTheme.textSecondary,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              att.name,
                              style: TextStyle(
                                fontSize: 11,
                                color: widget.isMe ? Colors.white70 : AppTheme.textSecondary,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            // Timestamp + hash
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    _formatTime(widget.message.sentAt),
                    style: const TextStyle(
                      fontSize: 10,
                      color: AppTheme.textHint,
                    ),
                  ),
                  const SizedBox(width: 4),
                  if (widget.message.isRead)
                    const Icon(
                      Icons.done_all,
                      size: 12,
                      color: AppTheme.primaryTeal,
                    )
                  else if (widget.message.isDelivered)
                    const Icon(Icons.done, size: 12, color: AppTheme.textHint),
                  const SizedBox(width: 4),
                  const Icon(Icons.lock, size: 10, color: AppTheme.textHint),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _extractLogistics(String content) {
    return AiGuidanceService.analyze(content).logisticsSummary;
  }

  String _formatTime(DateTime dt) {
    return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }
}

class _ToneIndicator extends StatelessWidget {
  final String tone;
  const _ToneIndicator({required this.tone});

  @override
  Widget build(BuildContext context) {
    final isNeutral = tone == 'neutral';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: (isNeutral ? AppTheme.successColor : AppTheme.warningColor)
            .withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            isNeutral ? Icons.sentiment_satisfied : Icons.sentiment_neutral,
            size: 14,
            color: isNeutral ? AppTheme.successColor : AppTheme.warningColor,
          ),
          const SizedBox(width: 6),
          Text(
            isNeutral ? 'Ton: Neutralny' : 'Ton: Napięty – rozważ AI Coach',
            style: TextStyle(
              fontSize: 11,
              color: isNeutral ? AppTheme.successColor : AppTheme.warningColor,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}

class _NewThreadSheet extends StatefulWidget {
  const _NewThreadSheet();

  @override
  State<_NewThreadSheet> createState() => _NewThreadSheetState();
}

class _NewThreadSheetState extends State<_NewThreadSheet> {
  final _subjectController = TextEditingController();
  String _selectedCategory = 'Szkoła';

  @override
  void dispose() {
    _subjectController.dispose();
    super.dispose();
  }

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
          const Text(
            'Nowy wątek',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: AppTheme.textPrimary,
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _subjectController,
            decoration: const InputDecoration(
              labelText: 'Temat wątku',
              hintText: 'np. Angielski – zmiana terminu',
            ),
          ),
          const SizedBox(height: 12),
          const Text(
            'Kategoria',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w500,
              color: AppTheme.textSecondary,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: ['Szkoła', 'Zdrowie', 'Finansowe', 'Zmiana grafiku', 'Inne']
                .map(
                  (cat) => ChoiceChip(
                    label: Text(cat),
                    selected: _selectedCategory == cat,
                    onSelected: (_) => setState(() => _selectedCategory = cat),
                    selectedColor: AppTheme.primaryTeal.withValues(alpha: 0.15),
                    checkmarkColor: AppTheme.primaryTeal,
                  ),
                )
                .toList(),
          ),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _createThread,
              child: const Text('Utwórz wątek'),
            ),
          ),
        ],
      ),
    );
  }

  void _createThread() {
    final subject = _subjectController.text.trim();
    if (subject.isEmpty) return;

    final workspace = context.read<AppProvider>().currentWorkspace;
    context.read<MessagingProvider>()
        .createThread(
          subject: subject,
          category: _selectedCategory,
          childId: workspace?.children.isNotEmpty == true
              ? workspace!.children.first.id
              : null,
        )
        .then((thread) {
      if (!mounted || thread == null) {
        return;
      }
      Navigator.pop(context, thread);
    });
  }
}
