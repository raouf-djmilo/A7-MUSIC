/**
 * 🔔 saveNotification
 * No-op / local-safe stub after migrating away from Supabase.
 */
export const saveNotification = async (
  _senderId: string,
  _receiverId: string,
  _type: 'like' | 'comment' | 'follow',
  _postId?: string
): Promise<void> => {
  // Notifications are handled locally via expo-notifications
};
