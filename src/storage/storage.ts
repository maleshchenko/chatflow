import type { ChatFlowData, Playlist, Conversation, ReadingProgress } from "../types";

const STORAGE_KEY = "chatflowData";

const emptyData: ChatFlowData = {
  conversations: {},
  playlists: [],
  progress: {}
};

export async function loadData(): Promise<ChatFlowData> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const stored = result[STORAGE_KEY] as Partial<ChatFlowData> | undefined;
  return {
    conversations: stored?.conversations ?? {},
    playlists: stored?.playlists ?? [],
    progress: stored?.progress ?? {}
  };
}

export async function saveData(data: ChatFlowData): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
}

export async function createPlaylist(name: string, description = ""): Promise<ChatFlowData> {
  const data = await loadData();
  const now = Date.now();
  const playlist: Playlist = {
    id: crypto.randomUUID(),
    name: name.trim(),
    description: description.trim(),
    conversationIds: [],
    createdAt: now,
    updatedAt: now
  };
  data.playlists.unshift(playlist);
  data.progress[playlist.id] = {};
  await saveData(data);
  return data;
}

export async function renamePlaylist(id: string, name: string): Promise<ChatFlowData> {
  const data = await loadData();
  const playlist = data.playlists.find(item => item.id === id);
  if (playlist) {
    playlist.name = name.trim();
    playlist.updatedAt = Date.now();
    await saveData(data);
  }
  return data;
}

export async function deletePlaylist(id: string): Promise<ChatFlowData> {
  const data = await loadData();
  data.playlists = data.playlists.filter(item => item.id !== id);
  delete data.progress[id];
  await saveData(data);
  return data;
}

export async function addConversationToPlaylist(
  playlistId: string,
  conversation: Conversation
): Promise<ChatFlowData> {
  const data = await loadData();
  data.conversations[conversation.id] = conversation;
  const playlist = data.playlists.find(item => item.id === playlistId);
  if (playlist && !playlist.conversationIds.includes(conversation.id)) {
    playlist.conversationIds.push(conversation.id);
    playlist.updatedAt = Date.now();
  }
  await saveData(data);
  return data;
}

export async function removeConversationFromPlaylist(
  playlistId: string,
  conversationId: string
): Promise<ChatFlowData> {
  const data = await loadData();
  const playlist = data.playlists.find(item => item.id === playlistId);
  if (playlist) {
    playlist.conversationIds = playlist.conversationIds.filter(id => id !== conversationId);
    playlist.updatedAt = Date.now();
  }
  const progress = data.progress[playlistId];
  if (progress && progress.currentConversationId === conversationId) {
    progress.currentConversationId = undefined;
  }
  await saveData(data);
  return data;
}

export async function reorderPlaylist(playlistId: string, conversationIds: string[]): Promise<ChatFlowData> {
  const data = await loadData();
  const playlist = data.playlists.find(item => item.id === playlistId);
  if (playlist) {
    playlist.conversationIds = conversationIds;
    playlist.updatedAt = Date.now();
    await saveData(data);
  }
  return data;
}

export async function updateProgress(
  playlistId: string,
  updater: (progress: ReadingProgress) => ReadingProgress
): Promise<ChatFlowData> {
  const data = await loadData();
  const current = data.progress[playlistId] ?? {};
  data.progress[playlistId] = updater(current);
  await saveData(data);
  return data;
}

export const initialData = emptyData;
