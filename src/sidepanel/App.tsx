import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove
} from "@dnd-kit/sortable";
import {
  BookOpen, ChevronLeft, ChevronRight, CirclePlus, ListMusic,
  Pencil, Play, Plus, Search, Square, Trash2, X
} from "lucide-react";
import SortableConversation from "./components/SortableConversation";
import {
  addConversationToPlaylist,
  createPlaylist,
  deletePlaylist,
  loadData,
  removeConversationFromPlaylist,
  renamePlaylist,
  reorderPlaylist,
  updateProgress
} from "../storage/storage";
import type { ChatFlowData, Conversation, CurrentConversation, Playlist } from "../types";

export default function App() {
  const [data, setData] = useState<ChatFlowData>({
    conversations: {}, playlists: [], progress: {}
  });
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [currentConversation, setCurrentConversation] = useState<CurrentConversation | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [autoplay, setAutoplay] = useState(true);
  const [playbackStatus, setPlaybackStatus] = useState<{
    conversationId: string;
    currentPart: number;
    totalParts: number;
  } | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const refresh = useCallback(async () => {
    const next = await loadData();
    setData(next);
    setSelectedPlaylistId(current => {
      if (current && next.playlists.some(item => item.id === current)) return current;
      return next.playlists[0]?.id ?? null;
    });
    setLoading(false);
  }, []);

  const detectCurrentConversation = useCallback(async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab?.id || !tab.url?.startsWith("https://chatgpt.com/")) {
        setCurrentConversation(null);
        return;
      }
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "CHATFLOW_GET_CURRENT_CONVERSATION"
      });
      setCurrentConversation(response?.conversation ?? null);
    } catch {
      setCurrentConversation(null);
    }
  }, []);

  // Track sidepanel open status and load autoplay preference
  useEffect(() => {
    void chrome.storage.local.set({ chatflowSidepanelOpen: true });
    void chrome.storage.local.get(["chatflowAutoplay"]).then(res => {
      if (res.chatflowAutoplay !== undefined) {
        setAutoplay(Boolean(res.chatflowAutoplay));
      }
    });

    return () => {
      void chrome.storage.local.set({ chatflowSidepanelOpen: false });
    };
  }, []);

  const toggleAutoplay = () => {
    setAutoplay(prev => {
      const next = !prev;
      void chrome.storage.local.set({ chatflowAutoplay: next });
      return next;
    });
  };

  const selectedPlaylist = data.playlists.find(item => item.id === selectedPlaylistId) ?? null;
  const selectedProgress = selectedPlaylistId
    ? data.progress[selectedPlaylistId] ?? {}
    : {};

  const handleConversationFinished = useCallback(async (conversationId: string) => {
    setPlaybackStatus(null);
    const freshData = await loadData();
    let targetPlaylist = freshData.playlists.find(p => p.conversationIds.includes(conversationId));
    if (!targetPlaylist && selectedPlaylistId) {
      targetPlaylist = freshData.playlists.find(p => p.id === selectedPlaylistId);
    }
    if (!targetPlaylist) return;

    // Auto-advance if autoplay is enabled
    const res = await chrome.storage.local.get(["chatflowAutoplay"]);
    const shouldAutoplay = res.chatflowAutoplay !== false;
    if (shouldAutoplay) {
      const ids = targetPlaylist.conversationIds;
      const idx = ids.indexOf(conversationId);
      if (idx !== -1 && idx + 1 < ids.length) {
        const nextId = ids[idx + 1];
        await navigateTo(nextId);
      }
    }
  }, [selectedPlaylistId]);

  useEffect(() => {
    void refresh();
    void detectCurrentConversation();

    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && changes.chatflowData) void refresh();
    };
    const onActivated = () => void detectCurrentConversation();
    const onUpdated = (_tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (changeInfo.url || changeInfo.status === "complete") void detectCurrentConversation();
    };

    const onRuntimeMessage = (message: any) => {
      if (message?.type === "CHATFLOW_PLAYBACK_PROGRESS") {
        setPlaybackStatus({
          conversationId: message.conversationId,
          currentPart: message.currentPart,
          totalParts: message.totalParts
        });
      } else if (message?.type === "CHATFLOW_CONVERSATION_FINISHED") {
        void handleConversationFinished(message.conversationId);
      }
    };

    chrome.storage.onChanged.addListener(onChanged);
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.runtime.onMessage.addListener(onRuntimeMessage);

    return () => {
      chrome.storage.onChanged.removeListener(onChanged);
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.runtime.onMessage.removeListener(onRuntimeMessage);
    };
  }, [refresh, detectCurrentConversation, handleConversationFinished]);

  const playlistConversations = useMemo(() => {
    if (!selectedPlaylist) return [];
    return selectedPlaylist.conversationIds
      .map(id => data.conversations[id])
      .filter((item): item is Conversation => Boolean(item))
      .filter(item => item.title.toLowerCase().includes(search.toLowerCase()));
  }, [selectedPlaylist, data.conversations, search]);

  async function handleCreatePlaylist() {
    const name = window.prompt("Playlist name");
    if (!name?.trim()) return;
    const next = await createPlaylist(name);
    setData(next);
    setSelectedPlaylistId(next.playlists[0]?.id ?? null);
  }

  async function handleAddConversation(playlistId: string) {
    if (!currentConversation) return;
    const conversation: Conversation = { ...currentConversation, addedAt: Date.now() };
    setData(await addConversationToPlaylist(playlistId, conversation));
  }

  async function handleRename(playlist: Playlist) {
    const name = window.prompt("New playlist name", playlist.name);
    if (!name?.trim()) return;
    setData(await renamePlaylist(playlist.id, name));
  }

  async function handleDelete(playlist: Playlist) {
    if (!window.confirm(`Delete "${playlist.name}"? Conversations themselves will not be deleted.`)) return;
    setData(await deletePlaylist(playlist.id));
  }

  async function waitForTabComplete(
    tabId: number,
    timeoutMs = 30_000
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let settled = false;

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);

        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      const listener = (
        updatedTabId: number,
        changeInfo: chrome.tabs.TabChangeInfo
      ) => {
        if (
          updatedTabId === tabId &&
          changeInfo.status === "complete"
        ) {
          finish();
        }
      };

      const timeout = window.setTimeout(() => {
        finish(
          new Error("Timed out waiting for ChatGPT to load.")
        );
      }, timeoutMs);

      chrome.tabs.onUpdated.addListener(listener);

      void chrome.tabs.get(tabId).then(tab => {
        if (tab.status === "complete") {
          finish();
        }
      }).catch(error => {
        finish(
          error instanceof Error
            ? error
            : new Error("Could not read tab status.")
        );
      });
    });
  }

  async function activateReadAloud(tabId: number) {
    await waitForTabComplete(tabId).catch(error => {
      console.warn("ChatFlow tab-load wait:", error);
    });

    const connectionDeadline = Date.now() + 20_000;

    while (Date.now() < connectionDeadline) {
      try {
        const result = await chrome.tabs.sendMessage(
          tabId,
          {
            type: "CHATFLOW_READ_ALOUD"
          }
        );

        if (result?.ok) {
          console.log("ChatFlow: Read Aloud activated.");
          return;
        }

        await new Promise(resolve =>
          window.setTimeout(resolve, 500)
        );
      } catch {
        await new Promise(resolve =>
          window.setTimeout(resolve, 500)
        );
      }
    }

    console.warn(
      "ChatFlow: Could not connect to ChatGPT content script."
    );
  }

  async function stopPlayback() {
    setPlaybackStatus(null);
    try {
      const chatGptTabs = await chrome.tabs.query({ url: "https://chatgpt.com/*" });
      for (const tab of chatGptTabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, { type: "CHATFLOW_STOP" }).catch(() => {});
        }
      }

      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id) {
        chrome.tabs.sendMessage(activeTab.id, { type: "CHATFLOW_STOP" }).catch(() => {});
      }
    } catch (err) {
      console.warn("ChatFlow stopPlayback error:", err);
    }
  }

  async function navigateTo(conversationId: string) {
    if (!selectedPlaylist) return;

    const conversation = data.conversations[conversationId];
    if (!conversation) return;

    setPlaybackStatus(null);

    await updateProgress(
      selectedPlaylist.id,
      progress => ({
        ...progress,
        currentConversationId: conversationId,
        lastVisitedAt: Date.now()
      })
    );

    const [activeTab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true
    });

    let targetTabId: number;

    if (
      activeTab?.id &&
      activeTab.url?.startsWith("https://chatgpt.com/")
    ) {
      targetTabId = activeTab.id;

      await chrome.tabs.update(targetTabId, {
        url: conversation.url
      });
    } else {
      const createdTab = await chrome.tabs.create({
        url: conversation.url,
        active: true
      });

      if (!createdTab.id) return;

      targetTabId = createdTab.id;
    }

    await activateReadAloud(targetTabId);
  }

  async function navigateRelative(direction: -1 | 1) {
    if (!selectedPlaylist || selectedPlaylist.conversationIds.length === 0) return;
    const ids = selectedPlaylist.conversationIds;
    const currentId = currentConversation?.id ?? selectedProgress.currentConversationId;
    const currentIndex = currentId ? ids.indexOf(currentId) : -1;
    const nextIndex = currentIndex === -1
      ? (direction === 1 ? 0 : ids.length - 1)
      : Math.max(0, Math.min(ids.length - 1, currentIndex + direction));
    await navigateTo(ids[nextIndex]);
  }

  async function handleDragEnd(event: DragEndEvent) {
    if (!selectedPlaylist || !event.over || event.active.id === event.over.id) return;
    const oldIndex = selectedPlaylist.conversationIds.indexOf(String(event.active.id));
    const newIndex = selectedPlaylist.conversationIds.indexOf(String(event.over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(selectedPlaylist.conversationIds, oldIndex, newIndex);
    setData(await reorderPlaylist(selectedPlaylist.id, reordered));
  }

  const continueConversation = selectedPlaylist
    ? selectedProgress.currentConversationId && selectedPlaylist.conversationIds.includes(selectedProgress.currentConversationId)
      ? selectedProgress.currentConversationId
      : selectedPlaylist.conversationIds[0]
    : undefined;

  const isAnyPlaying = Boolean(playbackStatus);

  if (loading) return <div className="loading">Loading ChatFlow…</div>;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark"><ListMusic size={19} /></div>
        <div>
          <div className="brand-name">ChatFlow</div>
          <div className="brand-subtitle">Your conversation library</div>
        </div>
        <button className="icon-button top-add" title="Create playlist" onClick={handleCreatePlaylist}>
          <CirclePlus size={19} />
        </button>
      </header>

      <section className="current-card">
        <div className="section-kicker">CURRENT CONVERSATION</div>
        {currentConversation ? (
          <>
            <div className="current-title">{currentConversation.title}</div>
            <div className="current-actions">
              {data.playlists.length === 0 ? (
                <button className="primary-button" onClick={handleCreatePlaylist}><Plus size={15} /> Create playlist</button>
              ) : (
                <select
                  className="playlist-select"
                  aria-label="Choose playlist"
                  value={selectedPlaylistId ?? ""}
                  onChange={event => setSelectedPlaylistId(event.target.value)}
                >
                  {data.playlists.map(playlist => <option key={playlist.id} value={playlist.id}>{playlist.name}</option>)}
                </select>
              )}
              {selectedPlaylist && (
                <button
                  className="primary-button"
                  onClick={() => void handleAddConversation(selectedPlaylist.id)}
                  disabled={selectedPlaylist.conversationIds.includes(currentConversation.id)}
                >
                  <Plus size={15} />
                  {selectedPlaylist.conversationIds.includes(currentConversation.id) ? "Added" : "Add"}
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="empty-current">
            Open a ChatGPT conversation to add it to a playlist.
          </div>
        )}
      </section>

      <section className="continue-section">
        <div className="section-heading">
          <div>
            <div className="section-kicker">PICK UP WHERE YOU LEFT OFF</div>
            <h2>Continue reading</h2>
          </div>
          <BookOpen size={19} className="muted-icon" />
        </div>
        {selectedPlaylist && continueConversation ? (
          <div className="continue-card">
            <div className="continue-copy">
              <span className="continue-playlist">{selectedPlaylist.name}</span>
              <strong>{data.conversations[continueConversation]?.title ?? "Conversation"}</strong>
              <span className="progress-caption">
                {playbackStatus
                  ? `Reading response ${playbackStatus.currentPart} of ${playbackStatus.totalParts}`
                  : `${selectedPlaylist.conversationIds.length} ${selectedPlaylist.conversationIds.length === 1 ? "conversation" : "conversations"}`}
              </span>
            </div>
            <button
              className={`play-button ${isAnyPlaying ? "stop-active" : ""}`}
              title={isAnyPlaying ? "Stop reading" : "Continue reading"}
              onClick={() => {
                if (isAnyPlaying) {
                  void stopPlayback();
                } else {
                  void navigateTo(continueConversation);
                }
              }}
            >
              {isAnyPlaying ? (
                <Square size={15} fill="currentColor" />
              ) : (
                <Play size={17} fill="currentColor" />
              )}
            </button>
          </div>
        ) : (
          <div className="quiet-empty">Choose a playlist with conversations to start reading.</div>
        )}
      </section>

      <section className="playlists-section">
        <div className="section-heading playlist-heading">
          <div>
            <div className="section-kicker">YOUR LIBRARY</div>
            <h2>Playlists <span className="count-pill">{data.playlists.length}</span></h2>
          </div>
          <button className="text-button" onClick={handleCreatePlaylist}><Plus size={15} /> New</button>
        </div>

        {data.playlists.length === 0 ? (
          <div className="empty-library">
            <ListMusic size={27} />
            <strong>Your library is empty</strong>
            <span>Create a playlist, then add conversations from ChatGPT.</span>
            <button className="primary-button" onClick={handleCreatePlaylist}><Plus size={15} /> Create playlist</button>
          </div>
        ) : (
          <>
            <div className="playlist-tabs">
              {data.playlists.map(playlist => (
                <button
                  key={playlist.id}
                  className={`playlist-tab ${playlist.id === selectedPlaylistId ? "active" : ""}`}
                  onClick={() => { setSelectedPlaylistId(playlist.id); setSearch(""); }}
                  title={playlist.name}
                >
                  <span>{playlist.name}</span>
                  <small>{playlist.conversationIds.length}</small>
                </button>
              ))}
            </div>

            {selectedPlaylist && (
              <div className="playlist-content">
                <div className="playlist-title-row">
                  <div className="playlist-title-copy">
                    <h3>{selectedPlaylist.name}</h3>
                    <span>{selectedPlaylist.conversationIds.length} {selectedPlaylist.conversationIds.length === 1 ? "conversation" : "conversations"}</span>
                  </div>
                  <div className="playlist-tools">
                    <button className="icon-button" title="Rename playlist" onClick={() => void handleRename(selectedPlaylist)}><Pencil size={15} /></button>
                    <button className="icon-button danger-hover" title="Delete playlist" onClick={() => void handleDelete(selectedPlaylist)}><Trash2 size={15} /></button>
                  </div>
                </div>

                <label className="search-box">
                  <Search size={15} />
                  <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search this playlist" />
                  {search && <button className="clear-search" onClick={() => setSearch("")} aria-label="Clear search"><X size={13} /></button>}
                </label>

                {playlistConversations.length === 0 ? (
                  <div className="playlist-empty">
                    {selectedPlaylist.conversationIds.length === 0
                      ? "No conversations yet. Open a ChatGPT conversation and add it above."
                      : "No conversations match your search."}
                  </div>
                ) : (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={playlistConversations.map(item => item.id)} strategy={verticalListSortingStrategy}>
                      <div className="conversation-list">
                        {playlistConversations.map((conversation) => (
                          <SortableConversation
                            key={conversation.id}
                            conversation={conversation}
                            number={selectedPlaylist.conversationIds.indexOf(conversation.id) + 1}
                            active={currentConversation?.id === conversation.id}
                            playbackPart={playbackStatus && playbackStatus.conversationId === conversation.id ? playbackStatus : null}
                            onOpen={() => void navigateTo(conversation.id)}
                            onRemove={() => void removeConversationFromPlaylist(selectedPlaylist.id, conversation.id).then(setData)}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
                <div className="player-controls">
                  <button className="secondary-button" onClick={() => void navigateRelative(-1)} disabled={selectedPlaylist.conversationIds.length === 0}>
                    <ChevronLeft size={16} /> Previous
                  </button>
                  {playbackStatus && (
                    <button className="secondary-button stop-button" onClick={() => void stopPlayback()} title="Stop reading">
                      <Square size={13} fill="currentColor" /> Stop
                    </button>
                  )}
                  <button
                    className={`autoplay-toggle ${autoplay ? "is-active" : ""}`}
                    onClick={toggleAutoplay}
                    title={autoplay ? "Autoplay next conversation: ON" : "Autoplay next conversation: OFF"}
                  >
                    Autoplay {autoplay ? "ON" : "OFF"}
                  </button>
                  <button className="primary-button next-button" onClick={() => void navigateRelative(1)} disabled={selectedPlaylist.conversationIds.length === 0}>
                    Next <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <footer className="footer">
        <span>Stored locally in this browser</span>
        <span>ChatFlow v0.1.0</span>
      </footer>
    </main>
  );
}
