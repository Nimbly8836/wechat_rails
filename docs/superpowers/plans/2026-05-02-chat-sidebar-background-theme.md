# Chat Sidebar Background Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add desktop full sidebar collapse, Rails-saved chat background uploads, full-shell background coverage, and automatic black/white bubble text contrast.

**Architecture:** Keep chat room theme settings in the existing localStorage-backed frontend theme object. Add Rails endpoints on `ChatRoomController` to save image uploads under `storage/chat_backgrounds/:chat_room_id` and stream those files back. Apply background visuals at the chat shell level and keep per-room font and bubble styling inside `chat_room_theme.js`.

**Tech Stack:** Rails 8 controllers/routes, Minitest integration tests, Stimulus controllers, importmap JavaScript modules, existing CSS in `app/assets/stylesheets/chat.css`.

---

## File Structure

- Modify `config/routes.rb`: add member routes for uploading and serving chat background images.
- Modify `app/controllers/chat_room_controller.rb`: add `upload_background_image`, `background_image`, storage path helpers, MIME validation, and safe filename handling.
- Modify `test/controllers/chat_room_controller_test.rb`: add upload, invalid upload, serve, and traversal rejection tests.
- Modify `app/views/chat/index.html.erb`: add desktop floating sidebar button target.
- Modify `app/javascript/controllers/chat_controller.js`: add desktop collapsed state, persistence, and toggle behavior while preserving mobile drawer behavior.
- Modify `app/views/chat_room/show.html.erb`: add background upload input/button/status UI in appearance settings.
- Modify `app/javascript/controllers/chat_room_controller.js`: add upload targets and wrapper methods for theme upload.
- Modify `app/javascript/controllers/chat_room/chat_room_theme.js`: add upload function, full-shell background application, and exported contrast helpers.
- Modify `app/assets/stylesheets/chat.css`: add collapsed sidebar/floating button styles and transparent layered surfaces for image backgrounds.

## Task 1: Rails Background Upload Endpoint

**Files:**
- Modify: `config/routes.rb`
- Modify: `app/controllers/chat_room_controller.rb`
- Test: `test/controllers/chat_room_controller_test.rb`

- [ ] **Step 1: Write failing upload and serve tests**

Add these tests near the end of `test/controllers/chat_room_controller_test.rb`, before the final `end`:

```ruby
  test "upload_background_image stores image and returns url" do
    file = fixture_file_upload(
      Rails.root.join("test/fixtures/files/background.png"),
      "image/png"
    )

    post upload_background_image_chat_room_path(@chat_room), params: { image: file }

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal true, payload["success"]
    assert_match %r{\A/chat_room/#{@chat_room.id}/background_image/}, payload["url"]
    assert File.exist?(Rails.root.join("storage", "chat_backgrounds", @chat_room.id.to_s, File.basename(payload["url"])))
  ensure
    FileUtils.rm_rf(Rails.root.join("storage", "chat_backgrounds", @chat_room.id.to_s))
  end

  test "upload_background_image rejects non image files" do
    file = fixture_file_upload(
      Rails.root.join("test/fixtures/files/not-image.txt"),
      "text/plain"
    )

    post upload_background_image_chat_room_path(@chat_room), params: { image: file }

    assert_response :unprocessable_entity
    payload = JSON.parse(response.body)
    assert_equal false, payload["success"]
    assert_equal "请选择图片文件", payload["error"]
  end

  test "background_image serves stored image" do
    dir = Rails.root.join("storage", "chat_backgrounds", @chat_room.id.to_s)
    FileUtils.mkdir_p(dir)
    File.binwrite(dir.join("sample.png"), File.binread(Rails.root.join("test/fixtures/files/background.png")))

    get background_image_chat_room_path(@chat_room, filename: "sample.png")

    assert_response :success
    assert_equal "image/png", response.media_type
  ensure
    FileUtils.rm_rf(dir)
  end

  test "background_image rejects traversal filenames" do
    get background_image_chat_room_path(@chat_room, filename: "..%2Fsecret.png")

    assert_response :not_found
  end
```

Create `test/fixtures/files/not-image.txt` with:

```text
not an image
```

Create `test/fixtures/files/background.png` using a tiny PNG fixture. If no binary fixture helper is available, decode this base64 once:

```bash
mkdir -p test/fixtures/files
printf 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' | base64 -d > test/fixtures/files/background.png
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
bin/rails test test/controllers/chat_room_controller_test.rb
```

Expected: FAIL because `upload_background_image_chat_room_path` and `background_image_chat_room_path` are undefined.

- [ ] **Step 3: Add routes**

In `config/routes.rb`, inside `resources :chat_room do ... member do`, add:

```ruby
      post :upload_background_image
      get "background_image/:filename", action: :background_image, as: :background_image
```

- [ ] **Step 4: Add controller implementation**

In `app/controllers/chat_room_controller.rb`, add public actions before `private`:

```ruby
  def upload_background_image
    chat_room = ChatRoom.find(params[:id])
    uploaded = params[:image]

    unless uploaded.respond_to?(:content_type) && uploaded.respond_to?(:tempfile)
      render json: { success: false, error: "请选择图片文件" }, status: :unprocessable_entity and return
    end

    unless uploaded.content_type.to_s.start_with?("image/")
      render json: { success: false, error: "请选择图片文件" }, status: :unprocessable_entity and return
    end

    filename = background_image_filename(uploaded)
    directory = chat_background_directory(chat_room)
    FileUtils.mkdir_p(directory)
    FileUtils.cp(uploaded.tempfile.path, directory.join(filename))

    render json: {
      success: true,
      url: background_image_chat_room_path(chat_room, filename: filename)
    }
  rescue => error
    Rails.logger.error("chat background upload failed: #{error.class}: #{error.message}")
    render json: { success: false, error: "背景图片保存失败" }, status: :internal_server_error
  end

  def background_image
    chat_room = ChatRoom.find(params[:id])
    filename = File.basename(params[:filename].to_s)
    raise ActionController::RoutingError, "Not Found" if filename.blank? || filename != params[:filename].to_s

    path = chat_background_directory(chat_room).join(filename)
    raise ActionController::RoutingError, "Not Found" unless File.file?(path)

    send_file path, disposition: "inline", type: Marcel::MimeType.for(Pathname(path))
  end
```

Add private helpers below `private`:

```ruby
  def chat_background_directory(chat_room)
    Rails.root.join("storage", "chat_backgrounds", chat_room.id.to_s)
  end

  def background_image_filename(uploaded)
    extension = Rack::Mime::MIME_TYPES.invert[uploaded.content_type].presence ||
      File.extname(uploaded.original_filename.to_s).presence ||
      ".img"
    "#{SecureRandom.hex(16)}#{extension}"
  end
```

Ensure the top of the file has:

```ruby
require "fileutils"
require "securerandom"
```

- [ ] **Step 5: Run tests to verify pass**

Run:

```bash
bin/rails test test/controllers/chat_room_controller_test.rb
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add config/routes.rb app/controllers/chat_room_controller.rb test/controllers/chat_room_controller_test.rb test/fixtures/files/background.png test/fixtures/files/not-image.txt
git commit -m "Add chat background image upload endpoint"
```

## Task 2: Theme Upload UI and Bubble Contrast

**Files:**
- Modify: `app/views/chat_room/show.html.erb`
- Modify: `app/javascript/controllers/chat_room_controller.js`
- Modify: `app/javascript/controllers/chat_room/chat_room_theme.js`

- [ ] **Step 1: Write failing frontend smoke checks**

Because this project has no JavaScript test harness (`package.json` has no test command), use a static smoke check first:

```bash
rg -n "uploadBackgroundImage|backgroundUploadInput|readableTextColorForBackground|applyThemeToShell" app/javascript app/views/chat_room/show.html.erb
```

Expected: no matches for the new behavior.

- [ ] **Step 2: Add upload UI targets**

In `app/views/chat_room/show.html.erb`, inside the “背景图片” appearance block after the URL input, add:

```erb
        <div class="mt-2 flex items-center gap-2">
          <input type="file"
                 accept="image/*"
                 class="hidden"
                 data-chat-room-target="backgroundUploadInput"
                 data-action="change->chat-room#uploadBackgroundImage"/>
          <button type="button"
                  class="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                  data-action="click->chat-room#openBackgroundUpload">
            上传图片
          </button>
          <span class="min-w-0 truncate text-xs text-slate-400"
                data-chat-room-target="backgroundUploadStatus"></span>
        </div>
```

- [ ] **Step 3: Add Stimulus targets and wrappers**

In `app/javascript/controllers/chat_room_controller.js`, extend `static targets` with:

```js
    "backgroundUploadInput", "backgroundUploadStatus",
```

Add imports from `chat_room_theme`:

```js
  openBackgroundUpload,
  uploadBackgroundImage,
```

Add controller wrapper methods near other theme wrappers:

```js
  openBackgroundUpload(event) { return openBackgroundUpload(this, event); }
  uploadBackgroundImage(event) { return uploadBackgroundImage(this, event); }
```

- [ ] **Step 4: Add contrast helpers and upload functions**

In `app/javascript/controllers/chat_room/chat_room_theme.js`, add exported helpers near the top:

```js
export function parseCssColor(value) {
  const color = String(value || "").trim();
  const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const raw = hex[1].length === 3
      ? hex[1].split("").map((part) => `${part}${part}`).join("")
      : hex[1];
    return {
      r: parseInt(raw.slice(0, 2), 16),
      g: parseInt(raw.slice(2, 4), 16),
      b: parseInt(raw.slice(4, 6), 16),
      a: 1
    };
  }

  const rgb = color.match(/^rgba?\(([^)]+)\)$/i);
  if (!rgb) {
    return null;
  }

  const parts = rgb[1].split(",").map((part) => part.trim());
  if (parts.length < 3) {
    return null;
  }

  const [r, g, b] = parts.slice(0, 3).map((part) => Number.parseFloat(part));
  const a = parts[3] == null ? 1 : Number.parseFloat(parts[3]);
  if ([r, g, b, a].some((part) => Number.isNaN(part))) {
    return null;
  }

  return { r, g, b, a: Math.max(0, Math.min(a, 1)) };
}

export function readableTextColorForBackground(value, fallback = "#111827") {
  const color = parseCssColor(value);
  if (!color) {
    return fallback;
  }

  const composite = {
    r: color.r * color.a + 255 * (1 - color.a),
    g: color.g * color.a + 255 * (1 - color.a),
    b: color.b * color.a + 255 * (1 - color.a)
  };
  const channels = [composite.r, composite.g, composite.b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return luminance > 0.45 ? "#111827" : "#ffffff";
}
```

Add upload functions:

```js
export function openBackgroundUpload(controller, event = null) {
  event?.preventDefault();
  controller.backgroundUploadInputTarget?.click();
}

export function uploadBackgroundImage(controller, event) {
  const file = event?.target?.files?.[0];
  if (!file) {
    return;
  }

  if (controller.hasBackgroundUploadStatusTarget) {
    controller.backgroundUploadStatusTarget.textContent = "上传中...";
  }

  const formData = new FormData();
  formData.append("image", file);

  fetch(`/chat_room/${controller.idValue}/upload_background_image`, {
    method: "POST",
    headers: {
      "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content || "",
      "Accept": "application/json"
    },
    body: formData
  })
    .then((response) => response.json().then((payload) => ({ response, payload })))
    .then(({ response, payload }) => {
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || "背景图片上传失败");
      }
      controller.theme.backgroundImage = payload.url;
      applyTheme(controller);
      syncThemeInputs(controller);
      if (controller.hasBackgroundUploadStatusTarget) {
        controller.backgroundUploadStatusTarget.textContent = "已上传";
      }
    })
    .catch((error) => {
      if (controller.hasBackgroundUploadStatusTarget) {
        controller.backgroundUploadStatusTarget.textContent = error.message || "上传失败";
      }
    })
    .finally(() => {
      event.target.value = "";
    });
}
```

- [ ] **Step 5: Apply background to shell and contrast to bubbles**

In `applyTheme`, create:

```js
  const shell = controller.element?.closest(".tg-app-shell");
```

Apply background to `shell || controller.element` instead of only `controller.element`. Extract repeated style into:

```js
function applyBackgroundStyles(element, backgroundColor, backgroundImageValue) {
  if (!element) {
    return;
  }
  element.style.backgroundColor = backgroundColor;
  if (backgroundImageValue) {
    element.style.backgroundImage = backgroundImageValue;
    element.style.backgroundSize = "cover";
    element.style.backgroundRepeat = "no-repeat";
    element.style.backgroundPosition = "center";
  } else {
    element.style.backgroundImage = "";
    element.style.backgroundSize = "";
    element.style.backgroundRepeat = "";
    element.style.backgroundPosition = "";
  }
}
```

In `refreshBubbleStyles`, replace fixed colors with:

```js
      const textColor = readableTextColorForBackground(controller.theme.selfBubbleColor, "#111827");
      bubble.style.color = textColor;
      bubble.classList.remove("text-white");
```

and for other bubbles:

```js
      const textColor = readableTextColorForBackground(controller.theme.otherBubbleColor, "#111827");
      bubble.style.color = textColor;
      bubble.classList.remove("text-white");
```

Use the computed `textColor` for `voice-progress-inner` where current code uses self text color.

- [ ] **Step 6: Run smoke check**

Run:

```bash
rg -n "uploadBackgroundImage|backgroundUploadInput|readableTextColorForBackground|applyBackgroundStyles" app/javascript app/views/chat_room/show.html.erb
```

Expected: matches in the three modified frontend files.

- [ ] **Step 7: Commit**

```bash
git add app/views/chat_room/show.html.erb app/javascript/controllers/chat_room_controller.js app/javascript/controllers/chat_room/chat_room_theme.js
git commit -m "Add chat background upload UI and bubble contrast"
```

## Task 3: Desktop Full Sidebar Collapse

**Files:**
- Modify: `app/views/chat/index.html.erb`
- Modify: `app/javascript/controllers/chat_controller.js`
- Modify: `app/javascript/utils/chat_storage.js`
- Modify: `app/assets/stylesheets/chat.css`

- [ ] **Step 1: Write failing static smoke check**

Run:

```bash
rg -n "desktopSidebarCollapsed|toggleDesktopSidebar|desktopSidebarToggle|sidebar-desktop-collapsed" app/views/chat/index.html.erb app/javascript app/assets/stylesheets/chat.css
```

Expected: no matches.

- [ ] **Step 2: Add storage key**

In `app/javascript/utils/chat_storage.js`, add:

```js
  desktopSidebarCollapsed: () => ["desktop-sidebar-collapsed", ""],
```

- [ ] **Step 3: Add floating desktop button**

In `app/views/chat/index.html.erb`, after the mobile overlay button, add:

```erb
  <button type="button"
          class="tg-desktop-sidebar-toggle hidden"
          aria-controls="sidebar"
          aria-label="打开侧边栏"
          title="打开侧边栏"
          data-chat-target="desktopSidebarToggle"
          data-action="click->chat#toggleDesktopSidebar">
    <img src="/icon/menu.svg" alt="" class="h-5 w-5 tg-ui-icon" aria-hidden="true">
  </button>
```

Add a desktop collapse button near the sidebar search close button area:

```erb
        <button type="button"
                class="hidden h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 sm:flex"
                aria-label="收起侧边栏"
                title="收起侧边栏"
                data-action="click->chat#toggleDesktopSidebar">
          <img src="/icon/back.svg" alt="" class="h-5 w-5 tg-ui-icon rotate-180" aria-hidden="true">
        </button>
```

- [ ] **Step 4: Add controller state**

In `app/javascript/controllers/chat_controller.js`, add `desktopSidebarToggle` to targets.

Initialize in `connect()` where other state is initialized:

```js
    this.desktopSidebarCollapsed = this.readDesktopSidebarCollapsed()
```

Add methods:

```js
  readDesktopSidebarCollapsed() {
    const [namespace, identifier] = chatStorageKeys.desktopSidebarCollapsed()
    return readCache(namespace, identifier, false) === true
  }

  persistDesktopSidebarCollapsed() {
    const [namespace, identifier] = chatStorageKeys.desktopSidebarCollapsed()
    writeCache(namespace, identifier, this.desktopSidebarCollapsed === true)
  }

  toggleDesktopSidebar(event = null) {
    event?.stopPropagation()
    if (this.isMobileViewport()) {
      this.toggleSidebar(event)
      return
    }

    this.desktopSidebarCollapsed = !this.desktopSidebarCollapsed
    this.persistDesktopSidebarCollapsed()
    this.applySidebarState()
  }
```

In `handleViewportChange()`, keep mobile behavior but do not overwrite desktop collapsed state:

```js
    if (this.isMobileViewport()) {
      this.isSidebarOpen = false
      this.sidebarTarget.style.width = ""
    } else {
      this.isSidebarOpen = true
    }
```

In desktop branch of `applySidebarState()`, set:

```js
      this.sidebarTarget.classList.toggle("tg-sidebar-collapsed", this.desktopSidebarCollapsed)
      this.resizerTarget.classList.toggle("hidden", this.desktopSidebarCollapsed)
      this.desktopSidebarToggleTarget.classList.toggle("hidden", !this.desktopSidebarCollapsed)
      if (this.desktopSidebarCollapsed) {
        this.sidebarTarget.style.width = "0px"
      } else if (this.sidebarTarget.style.width === "0px") {
        this.sidebarTarget.style.width = ""
      }
```

In mobile branch, ensure:

```js
      this.sidebarTarget.classList.remove("tg-sidebar-collapsed")
      this.desktopSidebarToggleTarget.classList.add("hidden")
```

- [ ] **Step 5: Add CSS**

In `app/assets/stylesheets/chat.css`, add:

```css
.tg-desktop-sidebar-toggle {
  position: fixed;
  top: 14px;
  left: 14px;
  z-index: 35;
  width: 42px;
  height: 42px;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  border: 1px solid rgba(226, 232, 240, 0.88);
  background: rgba(255, 255, 255, 0.88);
  color: #475569;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.14);
  backdrop-filter: blur(12px);
}

@media (min-width: 640px) {
  .tg-desktop-sidebar-toggle:not(.hidden) {
    display: flex;
  }

  #sidebar.tg-sidebar-collapsed {
    width: 0 !important;
    min-width: 0 !important;
    max-width: 0 !important;
    pointer-events: none;
    box-shadow: none;
  }
}
```

- [ ] **Step 6: Run smoke check**

Run:

```bash
rg -n "desktopSidebarCollapsed|toggleDesktopSidebar|desktopSidebarToggle|tg-sidebar-collapsed" app/views/chat/index.html.erb app/javascript app/assets/stylesheets/chat.css
```

Expected: matches in view, controller, storage utility, and CSS.

- [ ] **Step 7: Commit**

```bash
git add app/views/chat/index.html.erb app/javascript/controllers/chat_controller.js app/javascript/utils/chat_storage.js app/assets/stylesheets/chat.css
git commit -m "Add desktop sidebar collapse"
```

## Task 4: Full-Shell Background Polish

**Files:**
- Modify: `app/assets/stylesheets/chat.css`
- Modify: `app/javascript/controllers/chat_room/chat_room_theme.js`

- [ ] **Step 1: Write failing smoke check**

Run:

```bash
rg -n "tg-has-chat-background|backgroundAttachment|tg-app-shell" app/assets/stylesheets/chat.css app/javascript/controllers/chat_room/chat_room_theme.js
```

Expected: no `tg-has-chat-background` matches before this task.

- [ ] **Step 2: Toggle shell background class**

In `applyTheme`, after resolving `shell`, add:

```js
  shell?.classList.toggle("tg-has-chat-background", !!backgroundImageValue);
```

When clearing background from the message list, remove `backgroundAttachment = "fixed"` behavior so the shell owns the image.

- [ ] **Step 3: Add translucent surface CSS**

In `app/assets/stylesheets/chat.css`, add:

```css
.tg-app-shell.tg-has-chat-background .tg-folder-rail,
.tg-app-shell.tg-has-chat-background .tg-sidebar-panel,
.tg-app-shell.tg-has-chat-background .tg-main-panel,
.tg-app-shell.tg-has-chat-background .telegram-chat-room {
  background: rgba(248, 250, 252, 0.58);
  backdrop-filter: blur(10px);
}

.tg-app-shell.tg-has-chat-background .telegram-message-list {
  background: transparent;
}

.tg-app-shell.tg-has-chat-background .telegram-message-list::before {
  opacity: 0.12;
}

.tg-app-shell.tg-has-chat-background .telegram-chat-header,
.tg-app-shell.tg-has-chat-background .telegram-composer {
  background: rgba(255, 255, 255, 0.72);
}

html.tg-theme-dark .tg-app-shell.tg-has-chat-background .tg-folder-rail,
html.tg-theme-dark .tg-app-shell.tg-has-chat-background .tg-sidebar-panel,
html.tg-theme-dark .tg-app-shell.tg-has-chat-background .tg-main-panel,
html.tg-theme-dark .tg-app-shell.tg-has-chat-background .telegram-chat-room {
  background: rgba(15, 23, 42, 0.62);
}

html.tg-theme-dark .tg-app-shell.tg-has-chat-background .telegram-chat-header,
html.tg-theme-dark .tg-app-shell.tg-has-chat-background .telegram-composer {
  background: rgba(15, 23, 42, 0.74);
}
```

- [ ] **Step 4: Run smoke check**

Run:

```bash
rg -n "tg-has-chat-background|classList.toggle\\(\"tg-has-chat-background\"" app/assets/stylesheets/chat.css app/javascript/controllers/chat_room/chat_room_theme.js
```

Expected: CSS rules and JS class toggle are present.

- [ ] **Step 5: Commit**

```bash
git add app/assets/stylesheets/chat.css app/javascript/controllers/chat_room/chat_room_theme.js
git commit -m "Apply chat background across shell"
```

## Task 5: Final Verification

**Files:**
- No planned source edits unless verification exposes a defect.

- [ ] **Step 1: Run Rails controller tests**

Run:

```bash
bin/rails test test/controllers/chat_room_controller_test.rb
```

Expected: PASS.

- [ ] **Step 2: Run broader affected controller tests**

Run:

```bash
bin/rails test test/controllers/chat_controller_test.rb test/controllers/chat_room_controller_test.rb
```

Expected: PASS.

- [ ] **Step 3: Build assets if available**

Run:

```bash
bin/rails assets:precompile
```

Expected: PASS. If this writes compiled assets that are not tracked in this repo, remove only generated untracked build outputs after confirming they are unrelated to source changes.

- [ ] **Step 4: Manual browser verification**

Start the app using the repo's normal Rails server command:

```bash
bin/rails server
```

Verify in browser:

- Desktop sidebar collapses to zero width.
- Floating button reopens sidebar.
- Mobile sidebar drawer still opens and closes.
- Background URL covers sidebar and chat.
- Uploaded image saves and covers sidebar and chat.
- Light bubble colors use dark text.
- Dark bubble colors use white text.

- [ ] **Step 5: Final status**

Run:

```bash
git status --short
```

Expected: only intended source changes are present; `.superpowers/` may remain untracked from brainstorming and should not be committed.
