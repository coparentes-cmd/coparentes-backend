import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';

class DocumentsScreen extends StatefulWidget {
  const DocumentsScreen({super.key});

  @override
  State<DocumentsScreen> createState() => _DocumentsScreenState();
}

class _DocumentsScreenState extends State<DocumentsScreen> {
  String _selectedCategory = 'All';

  final List<_DocumentItem> _documents = const [
    _DocumentItem(
      title: 'Parenting agreement draft',
      category: 'Agreements',
      childName: 'Zosia',
      updatedAt: '2d ago',
    ),
    _DocumentItem(
      title: 'School confirmation',
      category: 'School',
      childName: 'Zosia',
      updatedAt: '5d ago',
    ),
    _DocumentItem(
      title: 'Dental receipt',
      category: 'Medical',
      childName: 'Tomek',
      updatedAt: '7d ago',
    ),
    _DocumentItem(
      title: 'Travel consent',
      category: 'Shared',
      childName: 'Family',
      updatedAt: '12d ago',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final visibleDocuments = _selectedCategory == 'All'
        ? _documents
        : _documents
            .where((document) => document.category == _selectedCategory)
            .toList();

    return Scaffold(
      backgroundColor: AppTheme.surfaceColor,
      appBar: AppBar(
        title: const Text('Documents'),
        actions: [
          IconButton(
            icon: const Icon(Icons.upload_file),
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Upload workflow will be connected next.'),
                ),
              );
            },
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Family vault',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: AppTheme.textPrimary,
                  ),
                ),
                SizedBox(height: 6),
                Text(
                  'Store agreements, school files, medical documents and shared evidence-ready assets in one place.',
                  style: TextStyle(
                    fontSize: 13,
                    color: AppTheme.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: ['All', 'Agreements', 'School', 'Medical', 'Shared']
                .map(
                  (category) => ChoiceChip(
                    label: Text(category),
                    selected: _selectedCategory == category,
                    onSelected: (_) {
                      setState(() => _selectedCategory = category);
                    },
                  ),
                )
                .toList(),
          ),
          const SizedBox(height: 16),
          ...visibleDocuments.map(
            (document) => Card(
              margin: const EdgeInsets.only(bottom: 10),
              child: ListTile(
                leading: const Icon(Icons.description_outlined),
                title: Text(document.title),
                subtitle: Text(
                  '${document.category} · ${document.childName} · ${document.updatedAt}',
                ),
                trailing: const Icon(Icons.chevron_right),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DocumentItem {
  final String title;
  final String category;
  final String childName;
  final String updatedAt;

  const _DocumentItem({
    required this.title,
    required this.category,
    required this.childName,
    required this.updatedAt,
  });
}
