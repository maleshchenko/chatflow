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

function findReadAloudButton(): HTMLButtonElement | null {
  const assistantMessages = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[data-message-author-role="assistant"]'
    )
  );

  for (const message of assistantMessages.reverse()) {
    const buttons = Array.from(
      message.querySelectorAll<HTMLButtonElement>("button")
    );

    const candidate = buttons.find(button => {
      const description = getButtonDescription(button);

      return (
        !button.disabled &&
        /read\s*aloud|listen\s*to\s*this|play\s*audio|voice-play-turn-action-button/.test(
          description
        )
      );
    });

    if (candidate) {
      return candidate;
    }

    // Some ChatGPT versions render message actions outside the message node.
    const parent = message.parentElement;

    if (parent) {
      const nearbyButtons = Array.from(
        parent.querySelectorAll<HTMLButtonElement>("button")
      );

      const nearbyCandidate = nearbyButtons.find(button => {
        const description = getButtonDescription(button);

        return (
          !button.disabled &&
          /read\s*aloud|listen\s*to\s*this|play\s*audio|voice-play-turn-action-button/.test(
            description
          )
        );
      });

      if (nearbyCandidate) {
        return nearbyCandidate;
      }
    }
  }

  // Fallback to known ChatGPT action identifiers.
  const knownButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>(
      'button[data-testid*="voice-play-turn"], button[data-testid*="read-aloud"], button[aria-label*="Read aloud" i], button[title*="Read aloud" i]'
    )
  ).filter(button => !button.disabled);

  return knownButtons.at(-1) ?? null;
}

async function activateReadAloud(
  timeoutMs = 60_000
): Promise<{ ok: boolean; reason?: string }> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const button = findReadAloudButton();

    if (button && !button.disabled) {
      button.scrollIntoView({
        block: "nearest"
      });

      button.click();

      return { ok: true };
    }

    await sleep(500);
  }

  return {
    ok: false,
    reason:
      "Could not find ChatGPT's Read Aloud button after waiting 60 seconds."
  };
}

chrome.runtime.onMessage.addListener(
  (message, _sender, sendResponse) => {
    if (message?.type === "CHATFLOW_GET_CURRENT_CONVERSATION") {
      sendResponse({
        conversation: getConversation()
      });

      return false;
    }

    if (message?.type === "CHATFLOW_READ_ALOUD") {
      void activateReadAloud()
        .then(sendResponse)
        .catch(error => {
          sendResponse({
            ok: false,
            reason:
              error instanceof Error
                ? error.message
                : "Unknown error"
          });
        });

      return true;
    }

    return false;
  }
);