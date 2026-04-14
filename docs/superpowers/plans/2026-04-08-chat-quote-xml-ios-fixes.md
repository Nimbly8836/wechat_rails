# Chat Quote XML And iOS Composer Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move quote/XML message shaping to the backend, stop exposing raw XML for nested quotes, and stabilize the iOS composer/message-list layout.

**Architecture:** Parse quote/appmsg payloads in Ruby from normalized XML bodies, expose structured message payloads from `MessagesController`, and make the Stimulus chat room controller prefer server-provided structures with XML parsing only as a fallback. Separately, unify mobile viewport/composer sizing around CSS variables so the message list and composer move together on iOS keyboard changes.

**Tech Stack:** Rails, Minitest, Stimulus, Tailwind/CSS, Nokogiri

---

### Task 1: Backfill-safe quote parsing in Ruby

**Files:**
- Modify: `app/models/wechat_models.rb`
- Modify: `app/models/wx_message.rb`
- Test: `test/models/wechat_models_sync_message_model_test.rb`

- [ ] Add failing tests for group-prefixed quote XML and nested quote preview extraction.
- [ ] Run targeted model tests and confirm the new assertions fail for missing `refer_new_msg_id` / `refer_title`.
- [ ] Implement XML-body normalization plus robust `refermsg` parsing in Ruby.
- [ ] Re-run targeted model tests and confirm they pass.

### Task 2: Expose structured message payloads from the messages API

**Files:**
- Modify: `app/controllers/messages_controller.rb`
- Modify: `app/models/wx_message.rb`
- Test: `test/controllers/message_controller_test.rb`

- [ ] Add failing controller tests for quote messages with prefixed XML, nested quote previews, and parsed message payloads.
- [ ] Run the targeted controller test file and confirm failure.
- [ ] Implement serialized `parsed_message` / `quote_preview` / resolved reference identifiers, including opportunistic backfill for old rows.
- [ ] Re-run the targeted controller tests and confirm they pass.

### Task 3: Prefer server payloads in the chat room controller

**Files:**
- Modify: `app/javascript/controllers/chat_room_controller.js`

- [ ] Update message type normalization, quote rendering, preview building, and XML/file/chat-history rendering to use server payloads first and XML parsing only as a fallback.
- [ ] Keep existing attachment rendering behavior unchanged where the backend payload is absent.

### Task 4: Stabilize mobile/iOS composer layout

**Files:**
- Modify: `app/javascript/controllers/chat_controller.js`
- Modify: `app/javascript/controllers/chat_room_controller.js`
- Modify: `app/assets/stylesheets/chat.css`
- Modify: `app/views/chat_room/show.html.erb`

- [ ] Introduce shared CSS variables for viewport height / keyboard offset / composer height.
- [ ] Update the Stimulus controllers to keep these variables in sync with `visualViewport` and composer resizing.
- [ ] Make the message list and composer consume the same layout variables so focus no longer leaves a blank middle area on iOS.

### Task 5: Verify targeted behavior

**Files:**
- Test: `test/models/wechat_models_sync_message_model_test.rb`
- Test: `test/controllers/message_controller_test.rb`

- [ ] Run targeted model tests.
- [ ] Run targeted controller tests.
- [ ] If possible, inspect the generated room shell / payload shape locally to confirm the frontend now receives parsed quote data.
