export function handleVoiceClick(controller, messageId, container, label, context) {
  if (container.dataset.loading === "true") {
    return;
  }

  const original = label.dataset.originalText;
  const cachedUrl = controller.voiceBlobUrls.get(messageId);

  if (cachedUrl) {
    playVoice(controller, cachedUrl, container, label, context);
    return;
  }

  container.dataset.loading = "true";
  label.textContent = "加载中…";

  fetch(`/message/voice/${messageId}`)
    .then((res) => {
      if (!res.ok) {
        throw new Error(`请求失败: ${res.status}`);
      }
      return res.blob();
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      controller.voiceBlobUrls.set(messageId, url);
      playVoice(controller, url, container, label, context);
    })
    .catch((err) => {
      console.error("语音下载失败:", err);
      label.textContent = "下载失败";
      setTimeout(() => {
        label.textContent = original;
      }, 1500);
    })
    .finally(() => {
      container.dataset.loading = "false";
    });
}

export function playVoice(controller, url, container, label, context) {
  controller.stopCurrentVoicePlayback();

  const audio = new Audio(url);
  const original = label.dataset.originalText;
  const { messageId, progressBar, progressInner, fallbackDuration, speedButton } = context;

  const playbackState = {
    audio,
    progressBar,
    progressInner,
    speedButton,
    rateIndex: controller.voicePlaybackRates.get(messageId) ?? 1,
    fallbackDuration,
    messageId,
    animationId: null,
    applyRate: null,
    cleanup: null,
  };

  const stopAnimation = () => {
    if (playbackState.animationId) {
      cancelAnimationFrame(playbackState.animationId);
      playbackState.animationId = null;
    }
  };

  const hideProgress = () => {
    const pending = controller.pendingVoiceSeeks.get(messageId);
    const ratio = typeof pending === "number" ? pending : 0;
    if (progressInner) {
      progressInner.style.width = `${Math.min(Math.max(ratio, 0), 1) * 100}%`;
    }
    stopAnimation();
  };

  const cleanup = () => {
    container.classList.remove("opacity-60");
    label.textContent = original;
    if (controller.currentVoicePlayback?.audio === audio) {
      controller.currentVoicePlayback = null;
    }
    hideProgress();
    controller.pendingVoiceSeeks.delete(messageId);
  };

  playbackState.cleanup = cleanup;

  const updateProgress = () => {
    const duration = Number.isFinite(audio.duration) && audio.duration > 0
      ? audio.duration : fallbackDuration;
    if (duration > 0 && progressInner) {
      const percent = Math.min(1, audio.currentTime / duration) * 100;
      progressInner.style.width = `${percent}%`;
    }
    playbackState.animationId = requestAnimationFrame(updateProgress);
  };

  const applyPendingSeek = () => {
    const pending = controller.pendingVoiceSeeks.get(messageId);
    if (typeof pending !== "number") {
      return;
    }
    const clamped = Math.min(Math.max(pending, 0), 1);
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = clamped * audio.duration;
      if (progressInner) {
        progressInner.style.width = `${clamped * 100}%`;
      }
      controller.pendingVoiceSeeks.delete(messageId);
    } else if (progressInner) {
      progressInner.style.width = `${clamped * 100}%`;
    }
  };

  const startTracking = () => {
    if (controller.currentVoicePlayback?.audio !== audio) {
      return;
    }
    applyPendingSeek();
    stopAnimation();
    playbackState.animationId = requestAnimationFrame(updateProgress);
  };

  const applyRate = () => {
    const rate = controller.voicePlaybackOptions[playbackState.rateIndex] ?? 1.0;
    audio.playbackRate = rate;
    speedButton.textContent = `${rate.toFixed(1)}x`;
    controller.voicePlaybackRates.set(messageId, playbackState.rateIndex);
  };

  playbackState.applyRate = applyRate;
  controller.currentVoicePlayback = playbackState;
  applyRate();

  label.textContent = "播放中…";
  container.classList.add("opacity-60");

  audio.addEventListener("loadedmetadata", startTracking, { once: true });
  audio.addEventListener("play", startTracking, { once: true });
  audio.addEventListener("ended", cleanup, { once: true });

  let playResult;
  try {
    playResult = audio.play();
  } catch (err) {
    console.error("语音播放失败:", err);
    cleanup();
    label.textContent = "播放失败";
    setTimeout(() => {
      label.textContent = original;
    }, 2500);
    return;
  }

  if (playResult && typeof playResult.then === "function") {
    playResult.catch((err) => {
      console.error("语音播放失败:", err);
      cleanup();
      label.textContent = "播放失败";
      setTimeout(() => {
        label.textContent = original;
      }, 2500);
    });
  } else {
    startTracking();
  }
}

export function seekVoice(controller, messageId, context, event) {
  const { progressBar, progressInner } = context;
  const rect = progressBar.getBoundingClientRect();
  if (!rect.width) {
    return;
  }

  const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
  if (progressInner) {
    progressInner.style.width = `${ratio * 100}%`;
  }
  controller.pendingVoiceSeeks.set(messageId, ratio);

  if (controller.currentVoicePlayback?.messageId !== messageId) {
    return;
  }

  const activeState = controller.currentVoicePlayback;
  const { audio } = activeState;
  const previousInner = activeState.progressInner;
  activeState.progressBar = progressBar;
  activeState.progressInner = progressInner;
  if (previousInner && previousInner !== progressInner) {
    previousInner.style.width = `${ratio * 100}%`;
  }

  const apply = () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = ratio * audio.duration;
      controller.pendingVoiceSeeks.delete(messageId);
    }
  };

  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    apply();
  } else {
    audio.addEventListener("loadedmetadata", apply, { once: true });
  }
}

export function toggleSpeed(controller, messageId, context) {
  const currentIndex = controller.voicePlaybackRates.get(messageId) ?? 1;
  const nextIndex = (currentIndex + 1) % controller.voicePlaybackOptions.length;
  controller.voicePlaybackRates.set(messageId, nextIndex);

  const rate = controller.voicePlaybackOptions[nextIndex] ?? 1.0;
  context.speedButton.textContent = `${rate.toFixed(1)}x`;

  if (controller.currentVoicePlayback?.messageId !== messageId) {
    return;
  }

  controller.currentVoicePlayback.rateIndex = nextIndex;
  controller.currentVoicePlayback.speedButton = context.speedButton;
  if (typeof controller.currentVoicePlayback.applyRate === "function") {
    controller.currentVoicePlayback.applyRate();
  } else {
    controller.currentVoicePlayback.audio.playbackRate = rate;
  }
}

export function formatVoiceDuration(seconds) {
  const safe = Math.max(1, Math.round(Number(seconds) || 0));
  if (safe >= 60) {
    const minutes = Math.floor(safe / 60);
    const remaining = safe % 60;
    return `${minutes}:${String(remaining).padStart(2, "0")}`;
  }
  return `${safe}″`;
}
