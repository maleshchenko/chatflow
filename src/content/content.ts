import type { CurrentConversation } from "../types";

function getConversationId(): string | null {
  const match = window.location.pathname.match(/\/c\/([^/?#]+)/);
  return match?.[1] ?? null;
}

function getConversation(): CurrentConversation | null {
  const id = getConversationId();

  if (!id) {
    return null;
  }

  const rawTitle = document.title || "";

  const title =
    rawTitle.replace(/\s*[-|]\s*ChatGPT\s*$/i, "").trim() ||
    "Untitled conversation";

  return {
    id,
    title,
    url: window.location.href
  };
}

const sleep = (milliseconds: number) =>
  new Promise<void>(resolve => window.setTimeout(resolve, milliseconds));

let currentSessionId = 0;
let requestJumpToIndex: number | null = null;
let currentlyPlayingButton: HTMLButtonElement | null = null;
let currentPlayingPartNumber = 1;
let currentPlayingTotalParts = 1;

function simulateClick(element: HTMLElement) {
  try {
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    element.click();
  } catch {
    element.click();
  }
}

function getButtonDescription(button: HTMLButtonElement): string {
  return [
    button.getAttribute("aria-label"),
    button.getAttribute("title"),
    button.getAttribute("data-testid"),
    button.getAttribute("data-state"),
    button.innerText,
    button.textContent
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getAllReadAloudButtons(): HTMLButtonElement[] {
  const assistantMessages = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[data-message-author-role="assistant"]'
    )
  );

  const found: HTMLButtonElement[] = [];

  for (const message of assistantMessages) {
    const buttons = Array.from(
      message.querySelectorAll<HTMLButtonElement>("button")
    );

    let candidate = buttons.find(button => {
      const description = getButtonDescription(button);
      return (
        !button.disabled &&
        /read\s*aloud|listen\s*to\s*this|play\s*audio|voice-play-turn-action-button/.test(
          description
        )
      );
    });

    if (!candidate && message.parentElement) {
      const nearbyButtons = Array.from(
        message.parentElement.querySelectorAll<HTMLButtonElement>("button")
      );
      candidate = nearbyButtons.find(button => {
        const description = getButtonDescription(button);
        return (
          !button.disabled &&
          /read\s*aloud|listen\s*to\s*this|play\s*audio|voice-play-turn-action-button/.test(
            description
          )
        );
      });
    }

    if (!candidate) {
      const turn = message.closest('article, [data-testid*="conversation-turn"]');
      if (turn) {
        const turnButtons = Array.from(
          turn.querySelectorAll<HTMLButtonElement>("button")
        );
        candidate = turnButtons.find(button => {
          const description = getButtonDescription(button);
          return (
            !button.disabled &&
            /read\s*aloud|listen\s*to\s*this|play\s*audio|voice-play-turn-action-button/.test(
              description
            )
          );
        });
      }
    }

    if (candidate && !found.includes(candidate)) {
      found.push(candidate);
    }
  }

  // Fallback to known ChatGPT action identifiers
  const knownButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>(
      'button[data-testid*="voice-play-turn"], button[data-testid*="read-aloud"], button[aria-label*="Read aloud" i], button[title*="Read aloud" i]'
    )
  ).filter(button => !button.disabled);

  if (found.length === 0) {
    return knownButtons;
  }

  if (knownButtons.length > found.length) {
    return knownButtons;
  }

  return found;
}

async function waitForButtons(timeoutMs = 60_000): Promise<HTMLButtonElement[]> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const buttons = getAllReadAloudButtons();
    if (buttons.length > 0) {
      return buttons;
    }
    await sleep(500);
  }

  return [];
}

function isAnySpeechPlaying(): boolean {
  // 1. Check HTML <audio> element
  const audios = Array.from(document.querySelectorAll<HTMLAudioElement>("audio"));
  if (audios.some(a => !a.paused && !a.ended && a.currentTime > 0)) {
    return true;
  }

  // 2. Check for active stop or pause buttons in ChatGPT's UI
  const stopButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>(
      'button[aria-label*="Stop" i], button[aria-label*="Pause" i], button[title*="Stop" i], button[title*="Pause" i], button[data-testid*="stop" i], button[data-testid*="voice-stop" i]'
    )
  ).filter(btn => {
    if (btn.id === "chatflow-hud-stop") return false;
    if (btn.disabled) return false;
    const desc = getButtonDescription(btn);
    return /stop|pause|voice-stop/.test(desc);
  });

  if (stopButtons.length > 0) {
    return true;
  }

  return false;
}

function stopCurrentSpeech() {
  // 1. Click currently playing button again to toggle off
  if (currentlyPlayingButton && document.body.contains(currentlyPlayingButton)) {
    try {
      simulateClick(currentlyPlayingButton);
    } catch {
      // ignore
    }
  }
  currentlyPlayingButton = null;

  // 2. Click any active stop or pause buttons on the page
  const stopButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>(
      'button[aria-label*="Stop" i], button[aria-label*="Pause" i], button[title*="Stop" i], button[title*="Pause" i], button[data-testid*="stop" i], button[data-testid*="voice-stop" i]'
    )
  ).filter(btn => btn.id !== "chatflow-hud-stop" && !btn.disabled);

  for (const btn of stopButtons) {
    try {
      simulateClick(btn);
    } catch {
      // ignore
    }
  }

  // 3. Pause any audio elements
  const audios = Array.from(document.querySelectorAll<HTMLAudioElement>("audio"));
  for (const a of audios) {
    try {
      a.pause();
      a.currentTime = 0;
    } catch {
      // ignore
    }
  }

  // 4. Cancel browser speech synthesis if active
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
}

function stopCurrentSession() {
  currentSessionId = 0;
  requestJumpToIndex = null;
  stopCurrentSpeech();
  removeFloatingHUD();

  notifyProgress({
    type: "CHATFLOW_PLAYBACK_PROGRESS",
    conversationId: getConversationId() ?? "",
    currentPart: 0,
    totalParts: 0,
    status: "stopped"
  });
}

const HUD_ID = "chatflow-playback-hud";

function updateFloatingHUD(params: {
  visible: boolean;
  currentPart?: number;
  totalParts?: number;
  isDone?: boolean;
}) {
  let hud = document.getElementById(HUD_ID);

  if (!params.visible || params.isDone) {
    if (hud) hud.remove();
    return;
  }

  if (!hud) {
    hud = document.createElement("div");
    hud.id = HUD_ID;
    hud.style.position = "fixed";
    hud.style.bottom = "24px";
    hud.style.right = "24px";
    hud.style.zIndex = "999999";
    hud.style.display = "flex";
    hud.style.alignItems = "center";
    hud.style.gap = "10px";
    hud.style.padding = "8px 14px";
    hud.style.borderRadius = "9999px";
    hud.style.background = "rgba(23, 24, 28, 0.94)";
    hud.style.backdropFilter = "blur(12px)";
    hud.style.border = "1px solid rgba(255, 255, 255, 0.15)";
    hud.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.4)";
    hud.style.color = "#ececf1";
    hud.style.fontSize = "12px";
    hud.style.fontWeight = "600";
    hud.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    hud.style.userSelect = "none";
    document.body.appendChild(hud);
  }

  const current = params.currentPart ?? currentPlayingPartNumber;
  const total = params.totalParts ?? currentPlayingTotalParts;
  const label = total > 1 ? `Response ${current} of ${total}` : "Reading aloud";

  const btnStyle = "background: rgba(255,255,255,0.12); border: 0; color: #e4e4e7; border-radius: 6px; padding: 3px 8px; font-size: 11px; font-weight: 500; cursor: pointer;";
  const disabledBtnStyle = "background: rgba(255,255,255,0.05); border: 0; color: #666; border-radius: 6px; padding: 3px 8px; font-size: 11px; font-weight: 500; cursor: not-allowed;";

  hud.innerHTML = `
    <span style="color: #c4b5fd; display: flex; align-items: center; gap: 6px;">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
      </svg>
      ChatFlow
    </span>
    <span style="color: #8e8ea0;">|</span>
    <div style="display: flex; align-items: center; gap: 4px;">
      ${
        total > 1
          ? `<button id="chatflow-hud-prev" title="Previous response" style="${current > 1 ? btnStyle : disabledBtnStyle}" ${current <= 1 ? "disabled" : ""}>&lt;&lt; Prev</button>`
          : ""
      }
      <span style="color: #f4f4f5; padding: 0 3px;">${label}</span>
      ${
        total > 1
          ? `<button id="chatflow-hud-next" title="Next response" style="${current < total ? btnStyle : disabledBtnStyle}" ${current >= total ? "disabled" : ""}>Next &gt;&gt;</button>`
          : ""
      }
      <button id="chatflow-hud-stop" title="Stop reading" style="background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239,68,68,0.4); color: #fca5a5; border-radius: 6px; padding: 3px 8px; font-size: 11px; font-weight: 500; cursor: pointer; margin-left: 2px;">
        Stop
      </button>
    </div>
  `;

  const prevBtn = hud.querySelector("#chatflow-hud-prev");
  if (prevBtn) {
    prevBtn.addEventListener("click", e => {
      e.stopPropagation();
      void jumpToPart(current - 2);
    });
  }

  const nextBtn = hud.querySelector("#chatflow-hud-next");
  if (nextBtn) {
    nextBtn.addEventListener("click", e => {
      e.stopPropagation();
      void jumpToPart(current);
    });
  }

  const stopBtn = hud.querySelector("#chatflow-hud-stop");
  if (stopBtn) {
    stopBtn.addEventListener("click", e => {
      e.stopPropagation();
      stopCurrentSession();
    });
  }
}

function removeFloatingHUD() {
  const hud = document.getElementById(HUD_ID);
  if (hud) hud.remove();
}

// Track when user clicks ChatGPT's native stop button
window.addEventListener("click", event => {
  if (currentSessionId === 0) return;
  const target = event.target as HTMLElement | null;
  const btn = target?.closest("button");
  if (!btn || btn.id === "chatflow-hud-next" || btn.id === "chatflow-hud-prev") return;

  if (btn.id === "chatflow-hud-stop") {
    stopCurrentSession();
    return;
  }

  const desc = getButtonDescription(btn);
  if (/stop|pause|voice-stop/.test(desc)) {
    console.log("ChatFlow: User clicked native stop button.");
    stopCurrentSession();
  }
});

function notifyProgress(message: {
  type: string;
  conversationId: string;
  currentPart?: number;
  totalParts?: number;
  status?: string;
}) {
  try {
    chrome.runtime.sendMessage(message).catch(() => {});
  } catch {
    // ignore
  }
}

async function waitForCurrentResponseToEnd(sessionId: number): Promise<void> {
  // 1. Give up to 4s for speech to register as active
  const startDeadline = Date.now() + 4_000;
  while (Date.now() < startDeadline) {
    if (currentSessionId !== sessionId) return;
    if (requestJumpToIndex !== null) return;
    if (isAnySpeechPlaying()) break;
    await sleep(200);
  }

  // 2. Wait for speech to finish (isAnySpeechPlaying becomes false)
  let silenceStart: number | null = null;
  const SILENCE_THRESHOLD_MS = 1000;
  const maxTimeout = Date.now() + 600_000; // 10 min max per turn

  while (Date.now() < maxTimeout) {
    if (currentSessionId !== sessionId) return;
    if (requestJumpToIndex !== null) return;

    if (isAnySpeechPlaying()) {
      silenceStart = null;
    } else {
      if (silenceStart === null) {
        silenceStart = Date.now();
      } else if (Date.now() - silenceStart >= SILENCE_THRESHOLD_MS) {
        // Natural end of this response
        return;
      }
    }

    await sleep(250);
  }
}

async function jumpToPart(targetIndex: number) {
  const buttons = getAllReadAloudButtons();
  if (buttons.length === 0) return;

  const validIndex = Math.max(0, Math.min(targetIndex, buttons.length - 1));

  // Signal any current wait loop to return immediately
  requestJumpToIndex = validIndex;
  stopCurrentSpeech();

  // If no playback loop is active, start a new session
  if (currentSessionId === 0) {
    const sessionId = Date.now();
    currentSessionId = sessionId;
    void monitorAndPlayRemaining(validIndex, sessionId);
  }
}

async function monitorAndPlayRemaining(startIndex: number, sessionId: number) {
  let i = startIndex;

  while (true) {
    if (currentSessionId !== sessionId) return;

    // Check if user requested a jump to another part
    if (requestJumpToIndex !== null) {
      i = requestJumpToIndex;
      requestJumpToIndex = null;
    }

    const currentButtons = getAllReadAloudButtons();
    const totalParts = Math.max(currentButtons.length, 1);
    currentPlayingTotalParts = totalParts;

    if (i >= totalParts) {
      break;
    }

    const partNumber = i + 1;
    currentPlayingPartNumber = partNumber;

    updateFloatingHUD({
      visible: true,
      currentPart: partNumber,
      totalParts
    });

    notifyProgress({
      type: "CHATFLOW_PLAYBACK_PROGRESS",
      conversationId: getConversationId() ?? "",
      currentPart: partNumber,
      totalParts,
      status: "reading"
    });

    const targetButton = currentButtons[i];

    if (!targetButton) {
      console.warn(`ChatFlow: Button for response ${partNumber} not found.`);
      break;
    }

    targetButton.scrollIntoView({ block: "center", behavior: "smooth" });
    await sleep(250);
    currentlyPlayingButton = targetButton;
    simulateClick(targetButton);

    await waitForCurrentResponseToEnd(sessionId);

    currentlyPlayingButton = null;

    if (currentSessionId !== sessionId) return;

    // If jump was requested while waiting, loop directly to that part without pause
    if (requestJumpToIndex !== null) {
      continue;
    }

    i++;
    await sleep(800);
  }

  // All responses in this conversation have finished
  updateFloatingHUD({ visible: false, isDone: true });

  const conversationId = getConversationId();
  if (conversationId) {
    notifyProgress({
      type: "CHATFLOW_CONVERSATION_FINISHED",
      conversationId
    });
  }
}

async function handleStartReadAloud(sendResponse: (res: any) => void) {
  try {
    const sessionId = Date.now();
    currentSessionId = sessionId;
    requestJumpToIndex = null;

    // 1. Wait for Read Aloud button(s) to be available (up to 60s)
    const buttons = await waitForButtons(60_000);

    if (buttons.length === 0 || currentSessionId !== sessionId) {
      sendResponse({
        ok: false,
        reason: "Could not find ChatGPT's Read Aloud button after waiting."
      });
      return;
    }

    // 2. Click the first button
    const firstButton = buttons[0];
    firstButton.scrollIntoView({ block: "nearest" });
    currentlyPlayingButton = firstButton;
    simulateClick(firstButton);

    // 3. Confirm playback started to sidepanel
    sendResponse({ ok: true });

    // 4. Continue playing all responses sequentially
    void monitorAndPlayRemaining(0, sessionId);
  } catch (error) {
    sendResponse({
      ok: false,
      reason: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "CHATFLOW_GET_CURRENT_CONVERSATION") {
    sendResponse({
      conversation: getConversation()
    });
    return false;
  }

  if (message?.type === "CHATFLOW_READ_ALOUD") {
    void handleStartReadAloud(sendResponse);
    return true; // Keep message channel open until sendResponse is called!
  }

  if (message?.type === "CHATFLOW_STOP") {
    stopCurrentSession();
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "CHATFLOW_JUMP_TO_PART") {
    const partNum = typeof message.part === "number" ? message.part : 1;
    void jumpToPart(partNum - 1);
    sendResponse({ ok: true });
    return false;
  }

  return false;
});
