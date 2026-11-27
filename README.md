# ChatFlow

A Chrome-only Manifest V3 extension that organizes ChatGPT conversations into ordered 'read aloud' playlists.

## Requirements

- Google Chrome
- Node.js 20 or newer
- npm

## Install dependencies and build

```bash
npm install
npm run build
```

The production extension is generated in `dist/`.

## Load into Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this project's `dist` directory.
5. Open `https://chatgpt.com/`.
6. Click the ChatFlow extension icon to open its side panel.

The extension action opens the side panel automatically. If Chrome does not open it on the first click, right-click the extension icon and choose **Open side panel**.

<img width="1837" height="1195" alt="Screenshot 2026-11-27 at 9 24 45 AM" src="https://github.com/user-attachments/assets/d4055f36-8df1-4478-bfeb-e8c0c9b2b903" />

## Usage

1. Create a playlist in the ChatFlow side panel.
2. Open a conversation on ChatGPT.
3. Select the playlist in the **Current conversation** card and click **Add**.
4. Add more conversations to the same or other playlists.
5. Reorder items using the grip icon.
6. Click a conversation to navigate to it, or use **Previous** and **Next**.
7. Mark items complete using the circular check control.

## Data and privacy

- Playlist metadata and progress are stored in `chrome.storage.local`.
- Conversation content is not downloaded or copied.
- The extension does not read, export, or store ChatGPT cookies or authentication tokens.
- Conversation URLs are used for navigation through your existing ChatGPT browser session.

## Current limitations

- The content script recognizes conversation URLs containing `/c/<conversation-id>`.
- Conversation titles are read from the browser document title. ChatGPT may change its title format or page structure.
- The extension uses the URL currently exposed by the active ChatGPT tab. It does not call undocumented ChatGPT endpoints.
- If ChatGPT is not open, the current-conversation card will prompt you to open a conversation.

## Development

```bash
npm run dev
```

The Vite development server is useful for UI work, but Chrome extension testing should use the production build loaded as an unpacked extension. Rebuild and click **Reload** on `chrome://extensions` after changes.


## Automatic Read Aloud

Pressing Play (or opening a conversation from a playlist) attempts to activate ChatGPT's **Read Aloud** control after the conversation loads. This uses a DOM button lookup in the ChatGPT page, it is not an official ChatGPT API and may need adjustment if ChatGPT changes its interface. If the control cannot be found, the conversation still opens normally.

Chrome may also enforce audio/user-activation restrictions in some situations. If automatic playback does not start, click ChatGPT's Read Aloud button once manually.
