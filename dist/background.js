chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "CHATFLOW_CONVERSATION_FINISHED") {
    void handleBackgroundConversationFinished(message.conversationId, sender.tab?.id);
  }
});

async function handleBackgroundConversationFinished(conversationId, tabId) {
  try {
    const result = await chrome.storage.local.get([
      "chatflowData",
      "chatflowSidepanelOpen",
      "chatflowAutoplay"
    ]);

    // If the sidepanel is open, App.tsx handles the progression
    if (result.chatflowSidepanelOpen) {
      return;
    }

    if (result.chatflowAutoplay === false) {
      return;
    }

    const data = result.chatflowData;
    if (!data?.playlists || !tabId) return;

    for (const playlist of data.playlists) {
      const idx = playlist.conversationIds.indexOf(conversationId);
      if (idx !== -1) {
        const progress = data.progress[playlist.id] || {};

        // Check if there is a next conversation in this playlist
        if (idx + 1 < playlist.conversationIds.length) {
          const nextConvId = playlist.conversationIds[idx + 1];
          const nextConv = data.conversations[nextConvId];
          if (nextConv?.url) {
            progress.currentConversationId = nextConvId;
            progress.lastVisitedAt = Date.now();
            data.progress[playlist.id] = progress;
            await chrome.storage.local.set({ chatflowData: data });

            await chrome.tabs.update(tabId, { url: nextConv.url });

            const onUpdated = (updatedTabId, changeInfo) => {
              if (updatedTabId === tabId && changeInfo.status === "complete") {
                chrome.tabs.onUpdated.removeListener(onUpdated);
                setTimeout(() => {
                  chrome.tabs.sendMessage(tabId, { type: "CHATFLOW_READ_ALOUD" }).catch(() => {});
                }, 1500);
              }
            };
            chrome.tabs.onUpdated.addListener(onUpdated);
            return;
          }
        }
        break;
      }
    }
  } catch (err) {
    console.error("ChatFlow background auto-advance error:", err);
  }
}
