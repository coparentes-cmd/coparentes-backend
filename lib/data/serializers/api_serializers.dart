import '../../models/models.dart';
import '../models/auth_session.dart';

UserRole userRoleFromApi(String value) {
  switch (value) {
    case 'parentA':
      return UserRole.parentA;
    case 'parentB':
      return UserRole.parentB;
    case 'child':
      return UserRole.child;
    case 'observer':
      return UserRole.observer;
    default:
      return UserRole.parentA;
  }
}

String userRoleToApi(UserRole role) {
  switch (role) {
    case UserRole.parentA:
      return 'parentA';
    case UserRole.parentB:
      return 'parentB';
    case UserRole.child:
      return 'child';
    case UserRole.observer:
      return 'observer';
  }
}

MessageTone messageToneFromApi(String value) {
  switch (value) {
    case 'neutral':
      return MessageTone.neutral;
    case 'tense':
      return MessageTone.tense;
    case 'aggressive':
      return MessageTone.aggressive;
    case 'positive':
      return MessageTone.positive;
    default:
      return MessageTone.neutral;
  }
}

String messageToneToApi(MessageTone tone) {
  switch (tone) {
    case MessageTone.neutral:
      return 'neutral';
    case MessageTone.tense:
      return 'tense';
    case MessageTone.aggressive:
      return 'aggressive';
    case MessageTone.positive:
      return 'positive';
  }
}

ExportType exportTypeFromApi(String value) {
  switch (value) {
    case 'messages':
      return ExportType.messages;
    case 'calendar':
      return ExportType.calendar;
    case 'finances':
      return ExportType.finances;
    case 'fullPack':
      return ExportType.fullPack;
    default:
      return ExportType.messages;
  }
}

String exportTypeToApi(ExportType type) {
  switch (type) {
    case ExportType.messages:
      return 'messages';
    case ExportType.calendar:
      return 'calendar';
    case ExportType.finances:
      return 'finances';
    case ExportType.fullPack:
      return 'fullPack';
  }
}

AppUser appUserFromJson(Map<String, dynamic> json) {
  return AppUser(
    id: json['id'] as String,
    name: json['name'] as String,
    email: json['email'] as String,
    role: userRoleFromApi(json['role'] as String),
    twoFactorEnabled: json['twoFactorEnabled'] as bool? ?? false,
    highConflictMode: json['highConflictMode'] as bool? ?? false,
    createdAt: DateTime.parse(json['createdAt'] as String),
  );
}

Map<String, dynamic> appUserToJson(AppUser user) {
  return {
    'id': user.id,
    'name': user.name,
    'email': user.email,
    'role': userRoleToApi(user.role),
    'twoFactorEnabled': user.twoFactorEnabled,
    'highConflictMode': user.highConflictMode,
    'createdAt': user.createdAt.toIso8601String(),
  };
}

ChildProfile childProfileFromJson(Map<String, dynamic> json) {
  return ChildProfile(
    id: json['id'] as String,
    name: json['name'] as String,
    dateOfBirth: DateTime.parse(json['dateOfBirth'] as String),
    school: json['school'] as String?,
  );
}

Map<String, dynamic> childProfileToJson(ChildProfile child) {
  return {
    'id': child.id,
    'name': child.name,
    'dateOfBirth': child.dateOfBirth.toIso8601String(),
    'school': child.school,
  };
}

Workspace workspaceFromJson(Map<String, dynamic> json) {
  return Workspace(
    id: json['id'] as String,
    name: json['name'] as String,
    inviteCode: json['inviteCode'] as String?,
    members: (json['members'] as List<dynamic>)
        .map((item) => appUserFromJson(Map<String, dynamic>.from(item as Map)))
        .toList(),
    children: (json['children'] as List<dynamic>)
        .map(
          (item) => childProfileFromJson(
            Map<String, dynamic>.from(item as Map),
          ),
        )
        .toList(),
    createdAt: DateTime.parse(json['createdAt'] as String),
  );
}

Map<String, dynamic> workspaceToJson(Workspace workspace) {
  return {
    'id': workspace.id,
    'name': workspace.name,
    'inviteCode': workspace.inviteCode,
    'members': workspace.members.map(appUserToJson).toList(),
    'children': workspace.children.map(childProfileToJson).toList(),
    'createdAt': workspace.createdAt.toIso8601String(),
  };
}

MessageThread messageThreadFromJson(Map<String, dynamic> json) {
  return MessageThread(
    id: json['id'] as String,
    subject: json['subject'] as String,
    category: json['category'] as String,
    childId: json['childId'] as String?,
    lastActivity: DateTime.parse(json['lastActivity'] as String),
    hasUnread: json['hasUnread'] as bool? ?? false,
    messages: (json['messages'] as List<dynamic>)
        .map(
          (item) => messageFromJson(Map<String, dynamic>.from(item as Map)),
        )
        .toList(),
  );
}

Map<String, dynamic> messageThreadToJson(MessageThread thread) {
  return {
    'id': thread.id,
    'subject': thread.subject,
    'category': thread.category,
    'childId': thread.childId,
    'lastActivity': thread.lastActivity.toIso8601String(),
    'hasUnread': thread.hasUnread,
    'messages': thread.messages.map(messageToJson).toList(),
  };
}

Message messageFromJson(Map<String, dynamic> json) {
  return Message(
    id: json['id'] as String,
    threadId: json['threadId'] as String,
    senderId: json['senderId'] as String,
    senderName: json['senderName'] as String,
    content: json['content'] as String,
    aiSuggestedContent: json['aiSuggestedContent'] as String?,
    tone: messageToneFromApi(json['tone'] as String? ?? 'neutral'),
    attachments: (json['attachments'] as List<dynamic>? ?? [])
        .cast<Map<String, dynamic>>()
        .map(
          (item) => MessageAttachment(
            id: item['id'] as String,
            name: item['name'] as String,
            type: item['type'] as String,
            sizeBytes: item['sizeBytes'] as int,
          ),
        )
        .toList(),
    sentAt: DateTime.parse(json['sentAt'] as String),
    isDelivered: json['isDelivered'] as bool? ?? true,
    isRead: json['isRead'] as bool? ?? false,
    hash: json['hash'] as String,
    isShielded: json['isShielded'] as bool? ?? false,
  );
}

Map<String, dynamic> messageToJson(Message message) {
  return {
    'id': message.id,
    'threadId': message.threadId,
    'senderId': message.senderId,
    'senderName': message.senderName,
    'content': message.content,
    'aiSuggestedContent': message.aiSuggestedContent,
    'tone': messageToneToApi(message.tone),
    'attachments': message.attachments
        .map(
          (item) => {
            'id': item.id,
            'name': item.name,
            'type': item.type,
            'sizeBytes': item.sizeBytes,
          },
        )
        .toList(),
    'sentAt': message.sentAt.toIso8601String(),
    'isDelivered': message.isDelivered,
    'isRead': message.isRead,
    'hash': message.hash,
    'isShielded': message.isShielded,
  };
}

ExportJob exportJobFromJson(Map<String, dynamic> json) {
  return ExportJob(
    id: json['id'] as String,
    type: exportTypeFromApi(json['type'] as String),
    fromDate: DateTime.parse(json['fromDate'] as String),
    toDate: DateTime.parse(json['toDate'] as String),
    status: json['status'] as String,
    downloadUrl: json['downloadUrl'] as String?,
    manifestHash: json['manifestHash'] as String?,
    createdAt: DateTime.parse(json['createdAt'] as String),
  );
}

Map<String, dynamic> exportJobToJson(ExportJob job) {
  return {
    'id': job.id,
    'type': exportTypeToApi(job.type),
    'fromDate': job.fromDate.toIso8601String(),
    'toDate': job.toDate.toIso8601String(),
    'status': job.status,
    'downloadUrl': job.downloadUrl,
    'manifestHash': job.manifestHash,
    'createdAt': job.createdAt.toIso8601String(),
  };
}

AuthSession authSessionFromJson(Map<String, dynamic> json) {
  return AuthSession(
    token: json['token'] as String,
    user: appUserFromJson(json['user'] as Map<String, dynamic>),
    workspace: workspaceFromJson(json['workspace'] as Map<String, dynamic>),
  );
}

Map<String, dynamic> authSessionToJson(AuthSession session) {
  return {
    'token': session.token,
    'user': appUserToJson(session.user),
    'workspace': workspaceToJson(session.workspace),
  };
}
