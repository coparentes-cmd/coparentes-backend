import {
  addMessageToThread,
  getOrCreateCategoryThread
} from '../threads.js';
import { SCHEDULE_MESSAGING_CATEGORY } from './constants.js';

export async function notifyScheduleThread({ workspaceId, sender, content }) {
  try {
    const thread = await getOrCreateCategoryThread({
      workspaceId,
      createdBy: sender,
      category: SCHEDULE_MESSAGING_CATEGORY
    });

    await addMessageToThread({
      workspaceId,
      threadId: thread.id,
      sender,
      content,
      tone: 'neutral'
    });
  } catch (error) {
    console.error('schedule_messaging_notify_failed', error);
  }
}
