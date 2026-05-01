# Chat Sidebar, Background, and Bubble Contrast Design

## Goal

Improve the chat UI so the sidebar can fully collapse on desktop, chat backgrounds can use a URL or an uploaded image saved by Rails, the selected background spans both the sidebar and chat area, and message text remains readable against custom bubble colors.

## Scope

- Add a desktop sidebar collapsed state where the sidebar width becomes zero and the chat area fills the viewport.
- Keep the existing mobile drawer behavior.
- Show a floating open button when the desktop sidebar is collapsed.
- Let users set a background image by URL or by uploading an image file.
- Save uploaded background files under `storage/chat_backgrounds`.
- Serve uploaded background images through a Rails route.
- Apply the active background across the whole chat shell, including sidebar and chat room.
- Choose black or white message text automatically from the bubble background color.

## Out of Scope

- Cross-device theme synchronization through the database.
- Active Storage migration or attachment tables.
- Per-user global theme persistence on the server.
- Image editing, cropping, or remote image downloading.

## Current System

The chat index uses `app/views/chat/index.html.erb` with a Stimulus `chat` controller. Desktop sidebar width is resizable but cannot collapse to zero; mobile uses a translated drawer state.

Individual chat rooms use `app/views/chat_room/show.html.erb` and `app/javascript/controllers/chat_room_controller.js`. Appearance settings are handled in `app/javascript/controllers/chat_room/chat_room_theme.js`. Theme values are stored in localStorage through `chatStorageKeys.chatRoomTheme(roomId)`.

The app already saves downloaded media directly under `storage/images`, `storage/files`, `storage/videos`, and similar folders. `db/schema.rb` does not include Active Storage tables, so direct Rails file storage is the lower-risk path for this change.

## Design

### Sidebar Collapse

Add a desktop-only collapsed state to `chat_controller.js`, persisted in localStorage. On desktop:

- Expanded: current layout remains available, including resizing.
- Collapsed: sidebar width is set to `0`, the resizer is hidden, and the main panel fills available space.
- A floating button appears in the upper-left corner to reopen the sidebar.

Mobile keeps the existing `isSidebarOpen` drawer behavior and overlay behavior.

### Background Image Upload

Add a file input and upload button to the chat room appearance panel. The existing URL input remains available.

When a user chooses a file:

1. The browser posts multipart form data to `POST /chat_room/:id/background_image`.
2. Rails validates that the file is present and has an image content type.
3. Rails writes the file to `storage/chat_backgrounds/:chat_room_id/:token.ext`.
4. Rails returns JSON with a URL for the saved file.
5. The Stimulus controller stores that URL in `theme.backgroundImage` and reapplies the theme.

Add `GET /chat_room/:id/background_image/:filename` to stream saved images. The controller must constrain reads to the chat room background directory and use `send_file`.

### Background Coverage

Move the visual background application from only the chat room/message list to the nearest `.tg-app-shell`, while still setting the chat room font family locally.

When a background image exists:

- `.tg-app-shell` receives the background image with `cover`, `center`, and `no-repeat`.
- Sidebar, main panel, chat header, message list, and composer use translucent backgrounds so the image is visible across the full app.
- The message list no longer repeats its own separate background image.

When no background image exists, the app falls back to the selected background color and existing default styling.

### Bubble Text Contrast

Add a small color utility in `chat_room_theme.js`:

- Parse hex colors and `rgb(...)` / `rgba(...)` colors.
- Composite semi-transparent colors against white for contrast decisions.
- Compute relative luminance.
- Return `#ffffff` for dark bubble colors and `#111827` for light bubble colors.

Apply this to both self and other bubbles. Remove the hard-coded `text-white` behavior for normal message bubbles so Tailwind classes do not override the computed inline color.

For background values that cannot be parsed, use current safe defaults:

- Self bubble fallback: `#111827` for the default light green.
- Other bubble fallback: `#111827`.

## Error Handling

- Missing upload file returns `422` with JSON error.
- Non-image upload returns `422` with JSON error.
- File system errors return `500` with JSON error and a Rails log entry.
- Client upload failures show status text in the appearance panel and leave the current background unchanged.

## Testing

- Controller tests for successful image upload and invalid non-image upload.
- Controller test for serving a saved background file and rejecting traversal-like filenames.
- JavaScript unit tests for color parsing and contrast selection if the existing test setup supports JS tests.
- If no JS test harness exists, verify with a focused browser/manual check and keep the contrast utility pure and exported for future tests.

## Acceptance Criteria

- On desktop, the sidebar can collapse to zero width and reopen through a floating button.
- On mobile, the existing sidebar drawer still works.
- A background URL applies across both sidebar and chat area.
- An uploaded background image is saved under `storage/chat_backgrounds` and applies across both sidebar and chat area.
- Message text automatically switches to black or white based on the selected bubble color.
