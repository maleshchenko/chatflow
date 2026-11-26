export interface Conversation {
  id: string;
  title: string;
  url: string;
  addedAt: number;
}

export interface Playlist {
  id: string;
  name: string;
  description: string;
  conversationIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ReadingProgress {
  completedConversationIds: string[];
  currentConversationId?: string;
  lastVisitedAt?: number;
}

export interface ChatFlowData {
  conversations: Record<string, Conversation>;
  playlists: Playlist[];
  progress: Record<string, ReadingProgress>;
}

export interface CurrentConversation {
  id: string;
  title: string;
  url: string;
}
