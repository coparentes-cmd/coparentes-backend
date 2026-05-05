import 'package:flutter/material.dart';

// ─── Enums ───────────────────────────────────────────────────────────────────

enum UserRole { parentA, parentB, child, observer }

enum MessageTone { neutral, tense, aggressive, positive }

enum ExpenseStatus { pending, accepted, disputed, settled }

enum SwapStatus { pending, accepted, rejected, counterProposed }

enum EventType { school, medical, activity, handover, holiday, other }

enum ExportType { messages, calendar, finances, fullPack }

// ─── User & Workspace ────────────────────────────────────────────────────────

class AppUser {
  final String id;
  final String name;
  final String email;
  final UserRole role;
  final String? avatarUrl;
  final bool twoFactorEnabled;
  final bool highConflictMode;
  final DateTime createdAt;

  AppUser({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    this.avatarUrl,
    this.twoFactorEnabled = false,
    this.highConflictMode = false,
    required this.createdAt,
  });

  Color get roleColor {
    switch (role) {
      case UserRole.parentA:
        return const Color(0xFF00897B);
      case UserRole.parentB:
        return const Color(0xFF1565C0);
      case UserRole.child:
        return const Color(0xFFF57C00);
      case UserRole.observer:
        return const Color(0xFF6A1B9A);
    }
  }

  String get roleLabel {
    switch (role) {
      case UserRole.parentA:
        return 'Parent A';
      case UserRole.parentB:
        return 'Parent B';
      case UserRole.child:
        return 'Child';
      case UserRole.observer:
        return 'Observer';
    }
  }

  IconData get roleIcon {
    switch (role) {
      case UserRole.parentA:
        return Icons.person;
      case UserRole.parentB:
        return Icons.person_outline;
      case UserRole.child:
        return Icons.child_care;
      case UserRole.observer:
        return Icons.visibility;
    }
  }
}

class Workspace {
  final String id;
  final String name;
  final String? inviteCode;
  final List<AppUser> members;
  final List<ChildProfile> children;
  final DateTime createdAt;

  Workspace({
    required this.id,
    required this.name,
    this.inviteCode,
    required this.members,
    required this.children,
    required this.createdAt,
  });
}

class ChildProfile {
  final String id;
  final String name;
  final DateTime dateOfBirth;
  final String? school;

  ChildProfile({
    required this.id,
    required this.name,
    required this.dateOfBirth,
    this.school,
  });

  int get age {
    final now = DateTime.now();
    int age = now.year - dateOfBirth.year;
    if (now.month < dateOfBirth.month ||
        (now.month == dateOfBirth.month && now.day < dateOfBirth.day)) {
      age--;
    }
    return age;
  }
}

// ─── Messaging ───────────────────────────────────────────────────────────────

class MessageThread {
  final String id;
  final String subject;
  final String category;
  final List<Message> messages;
  final DateTime lastActivity;
  final bool hasUnread;
  final String? childId;

  MessageThread({
    required this.id,
    required this.subject,
    required this.category,
    required this.messages,
    required this.lastActivity,
    this.hasUnread = false,
    this.childId,
  });

  IconData get categoryIcon {
    switch (category) {
      case 'Szkoła':
        return Icons.school;
      case 'Zdrowie':
        return Icons.medical_services;
      case 'Finansowe':
        return Icons.account_balance_wallet;
      case 'Zmiana grafiku':
        return Icons.swap_horiz;
      default:
        return Icons.chat_bubble_outline;
    }
  }

  Color get categoryColor {
    switch (category) {
      case 'Szkoła':
        return const Color(0xFF1565C0);
      case 'Zdrowie':
        return const Color(0xFFD32F2F);
      case 'Finansowe':
        return const Color(0xFF388E3C);
      case 'Zmiana grafiku':
        return const Color(0xFFF57C00);
      default:
        return const Color(0xFF546E7A);
    }
  }
}

class Message {
  final String id;
  final String threadId;
  final String senderId;
  final String senderName;
  final String content;
  final String? aiSuggestedContent;
  final MessageTone tone;
  final List<MessageAttachment> attachments;
  final DateTime sentAt;
  final bool isDelivered;
  final bool isRead;
  final String hash;
  final bool isShielded;

  Message({
    required this.id,
    required this.threadId,
    required this.senderId,
    required this.senderName,
    required this.content,
    this.aiSuggestedContent,
    required this.tone,
    required this.attachments,
    required this.sentAt,
    this.isDelivered = true,
    this.isRead = false,
    required this.hash,
    this.isShielded = false,
  });
}

class MessageAttachment {
  final String id;
  final String name;
  final String type;
  final int sizeBytes;

  MessageAttachment({
    required this.id,
    required this.name,
    required this.type,
    required this.sizeBytes,
  });
}

// ─── Calendar ────────────────────────────────────────────────────────────────

class CustodySlot {
  final String id;
  final DateTime date;
  final UserRole custodian;
  final String? handoverLocation;
  final String? handoverTime;

  CustodySlot({
    required this.id,
    required this.date,
    required this.custodian,
    this.handoverLocation,
    this.handoverTime,
  });
}

class CalendarEvent {
  final String id;
  final String title;
  final String? description;
  final DateTime startDate;
  final DateTime? endDate;
  final EventType type;
  final String? childId;
  final String createdBy;
  final String? location;

  CalendarEvent({
    required this.id,
    required this.title,
    this.description,
    required this.startDate,
    this.endDate,
    required this.type,
    this.childId,
    required this.createdBy,
    this.location,
  });

  Color get typeColor {
    switch (type) {
      case EventType.school:
        return const Color(0xFF1565C0);
      case EventType.medical:
        return const Color(0xFFD32F2F);
      case EventType.activity:
        return const Color(0xFFF57C00);
      case EventType.handover:
        return const Color(0xFF00897B);
      case EventType.holiday:
        return const Color(0xFF6A1B9A);
      case EventType.other:
        return const Color(0xFF546E7A);
    }
  }

  IconData get typeIcon {
    switch (type) {
      case EventType.school:
        return Icons.school;
      case EventType.medical:
        return Icons.medical_services;
      case EventType.activity:
        return Icons.sports_soccer;
      case EventType.handover:
        return Icons.swap_horiz;
      case EventType.holiday:
        return Icons.beach_access;
      case EventType.other:
        return Icons.event;
    }
  }
}

class SwapRequest {
  final String id;
  final String requesterId;
  final String requesterName;
  final DateTime originalDate;
  final DateTime proposedDate;
  final String? reason;
  final SwapStatus status;
  final DateTime createdAt;
  final String? responseNote;

  SwapRequest({
    required this.id,
    required this.requesterId,
    required this.requesterName,
    required this.originalDate,
    required this.proposedDate,
    this.reason,
    required this.status,
    required this.createdAt,
    this.responseNote,
  });

  Color get statusColor {
    switch (status) {
      case SwapStatus.pending:
        return const Color(0xFFF57C00);
      case SwapStatus.accepted:
        return const Color(0xFF388E3C);
      case SwapStatus.rejected:
        return const Color(0xFFD32F2F);
      case SwapStatus.counterProposed:
        return const Color(0xFF1565C0);
    }
  }

  String get statusLabel {
    switch (status) {
      case SwapStatus.pending:
        return 'Oczekuje';
      case SwapStatus.accepted:
        return 'Zaakceptowany';
      case SwapStatus.rejected:
        return 'Odrzucony';
      case SwapStatus.counterProposed:
        return 'Kontrpropozycja';
    }
  }
}

// ─── Finance ─────────────────────────────────────────────────────────────────

class Expense {
  final String id;
  final String title;
  final double amount;
  final String currency;
  final String category;
  final String? childId;
  final String paidBy;
  final double splitRatio;
  final DateTime date;
  final String? receiptUrl;
  final ExpenseStatus status;
  final String? note;
  final String hash;

  Expense({
    required this.id,
    required this.title,
    required this.amount,
    this.currency = 'PLN',
    required this.category,
    this.childId,
    required this.paidBy,
    required this.splitRatio,
    required this.date,
    this.receiptUrl,
    required this.status,
    this.note,
    required this.hash,
  });

  double get amountDue => amount * splitRatio;

  Color get statusColor {
    switch (status) {
      case ExpenseStatus.pending:
        return const Color(0xFFF57C00);
      case ExpenseStatus.accepted:
        return const Color(0xFF388E3C);
      case ExpenseStatus.disputed:
        return const Color(0xFFD32F2F);
      case ExpenseStatus.settled:
        return const Color(0xFF546E7A);
    }
  }

  String get statusLabel {
    switch (status) {
      case ExpenseStatus.pending:
        return 'Oczekuje';
      case ExpenseStatus.accepted:
        return 'Zaakceptowany';
      case ExpenseStatus.disputed:
        return 'Sporny';
      case ExpenseStatus.settled:
        return 'Rozliczony';
    }
  }

  IconData get categoryIcon {
    switch (category) {
      case 'Szkoła':
        return Icons.school;
      case 'Zdrowie':
        return Icons.medical_services;
      case 'Zajęcia':
        return Icons.sports;
      case 'Ubrania':
        return Icons.checkroom;
      case 'Jedzenie':
        return Icons.restaurant;
      case 'Transport':
        return Icons.directions_car;
      default:
        return Icons.receipt_long;
    }
  }
}

class ReimbursementRequest {
  final String id;
  final String expenseId;
  final String requesterId;
  final double amount;
  final DateTime dueDate;
  final ExpenseStatus status;
  final DateTime createdAt;

  ReimbursementRequest({
    required this.id,
    required this.expenseId,
    required this.requesterId,
    required this.amount,
    required this.dueDate,
    required this.status,
    required this.createdAt,
  });
}

// ─── Evidence & Exports ──────────────────────────────────────────────────────

class ExportJob {
  final String id;
  final ExportType type;
  final DateTime fromDate;
  final DateTime toDate;
  final String status;
  final String? downloadUrl;
  final String? manifestHash;
  final DateTime createdAt;

  ExportJob({
    required this.id,
    required this.type,
    required this.fromDate,
    required this.toDate,
    required this.status,
    this.downloadUrl,
    this.manifestHash,
    required this.createdAt,
  });

  String get typeLabel {
    switch (type) {
      case ExportType.messages:
        return 'Wiadomości';
      case ExportType.calendar:
        return 'Kalendarz';
      case ExportType.finances:
        return 'Finanse';
      case ExportType.fullPack:
        return 'Pełny pakiet dowodowy';
    }
  }

  IconData get typeIcon {
    switch (type) {
      case ExportType.messages:
        return Icons.chat;
      case ExportType.calendar:
        return Icons.calendar_month;
      case ExportType.finances:
        return Icons.account_balance_wallet;
      case ExportType.fullPack:
        return Icons.folder_special;
    }
  }
}

// Extension on ExportType for label/icon outside of ExportJob context
extension ExportTypeExtension on ExportType {
  String get typeLabel {
    switch (this) {
      case ExportType.messages:
        return 'Wiadomości';
      case ExportType.calendar:
        return 'Kalendarz';
      case ExportType.finances:
        return 'Finanse';
      case ExportType.fullPack:
        return 'Pełny pakiet dowodowy';
    }
  }

  IconData get typeIcon {
    switch (this) {
      case ExportType.messages:
        return Icons.chat;
      case ExportType.calendar:
        return Icons.calendar_month;
      case ExportType.finances:
        return Icons.account_balance_wallet;
      case ExportType.fullPack:
        return Icons.folder_special;
    }
  }
}
