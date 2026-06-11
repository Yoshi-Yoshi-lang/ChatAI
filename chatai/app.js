// discord2LLM Web UI Frontend Application Logic

// State management
let activeRoomId = null;
let rooms = [];
let models = [];
let roomSummaries = {};
let roomSearchQuery = "";
let selectedFiles = [];
let activeToolMode = "chat";
let temporaryRoomIds = new Set();
let draftRoomIds = new Set();
const SIDEBAR_COLLAPSED_KEY = "discord2llm.sidebarCollapsed";

// DOM Elements
const roomsListEl = document.getElementById("rooms-list");
const messagesContainerEl = document.getElementById("messages-container");
const welcomeScreenEl = document.getElementById("welcome-screen");
const activeRoomTitleEl = document.getElementById("active-room-title");
const promptInputEl = document.getElementById("prompt-input");
const sendBtnEl = document.getElementById("send-btn");
const newRoomBtnEl = document.getElementById("new-room-btn");
const temporaryRoomBtnEl = document.getElementById("temporary-room-btn");
const settingsModalEl = document.getElementById("settings-modal");
const settingsCloseBtnEl = document.getElementById("settings-close-btn");
const settingsSaveBtnEl = document.getElementById("settings-save-btn");
const settingsFormEl = document.getElementById("settings-form");
const typingIndicatorEl = document.getElementById("typing-indicator");
const typingStatusTextEl = document.getElementById("typing-status-text");
const sidebarBackdropEl = document.getElementById("sidebar-backdrop");
const historySearchEl = document.getElementById("history-search");
const roomsCountEl = document.getElementById("rooms-count");
const toolMenuBtnEl = document.getElementById("tool-menu-btn");
const toolMenuEl = document.getElementById("tool-menu");
const attachFileBtnEl = document.getElementById("attach-file-btn");
const imageModeBtnEl = document.getElementById("image-mode-btn");
const fileInputEl = document.getElementById("file-input");
const attachmentBarEl = document.getElementById("attachment-bar");
const modelStatusEl = document.getElementById("model-status");
const webStatusEl = document.getElementById("web-status");
const thinkingStatusEl = document.getElementById("thinking-status");
const inputContextHintEl = document.getElementById("input-context-hint");
const railBrandBtnEl = document.getElementById("rail-brand-btn");
const railNewRoomBtnEl = document.getElementById("rail-new-room-btn");
const railSearchBtnEl = document.getElementById("rail-search-btn");
const railHistoryBtnEl = document.getElementById("rail-history-btn");
const railSettingsBtnEl = document.getElementById("rail-settings-btn");

// Mini-controls fast select
const webSearchFastToggle = document.getElementById("web-search-fast-toggle");
const thinkingModeFastSelect = document.getElementById("thinking-mode-fast-select");
const API_BASE_STORAGE_KEY = "discord2llm.apiBaseUrl";
const pageParams = new URLSearchParams(window.location.search);
const configuredApiBase = pageParams.get("api") || localStorage.getItem(API_BASE_STORAGE_KEY) || "";
const API_BASE_URL = configuredApiBase.replace(/\/+$/, "");
if (pageParams.get("api")) {
    localStorage.setItem(API_BASE_STORAGE_KEY, API_BASE_URL);
}

function apiPath(path) {
    return `${API_BASE_URL}${path}`;
}

function apiFetch(path, options) {
    return fetch(apiPath(path), options);
}

function resolveBackendResourceUrl(url) {
    if (!url || !API_BASE_URL || !url.startsWith("/")) return url;
    return `${API_BASE_URL}${url}`;
}

// Initialize application
document.addEventListener("DOMContentLoaded", () => {
    initializeSidebarState();
    showPagesBackendHint();
    loadRooms();
    loadModels();
    setupEventListeners();
});

function showPagesBackendHint() {
    const isPagesHost = window.location.hostname.endsWith("github.io");
    if (!isPagesHost || API_BASE_URL) return;
    showSystemMessage(
        "GitHub PagesではUIのみ配信されます。バックエンドを使う場合はURL末尾に ?api=https://your-backend.example.com を付けて開いてください。"
    );
}

// Load available chat rooms
async function loadRooms() {
    try {
        const res = await apiFetch("/api/rooms");
        if (!res.ok) throw new Error("Rooms load failed");
        const data = await res.json();
        rooms = data.rooms.map(roomId => roomId.toString());
        await loadRoomSummaries();
        renderRooms();
    } catch (e) {
        console.error("Error loading rooms:", e);
        showSystemMessage("ルーム一覧の読み込みに失敗しました。");
    }
}

async function loadRoomSummaries() {
    try {
        const res = await apiFetch("/api/room_summaries");
        if (!res.ok) return;
        const data = await res.json();
        roomSummaries = data.summaries || {};
        normalizeRoomSummaryKeys();
    } catch (e) {
        console.error("Error loading room summaries:", e);
    }
}

function normalizeRoomSummaryKeys() {
    const normalized = {};
    Object.entries(roomSummaries || {}).forEach(([roomId, summary]) => {
        normalized[String(roomId)] = summary || {};
    });
    roomSummaries = normalized;
}

// Load available Ollama models
async function loadModels() {
    try {
        const res = await apiFetch("/api/models");
        if (!res.ok) throw new Error("Models load failed");
        const data = await res.json();
        models = data.models;
        renderModelOptions();
    } catch (e) {
        console.error("Error loading models:", e);
    }
}

// Render rooms list in sidebar
function renderRooms() {
    roomsListEl.replaceChildren(); // Safe empty
    const visibleRooms = rooms.filter(roomId => {
        if (!roomSearchQuery) return true;
        const summary = getRoomSummary(roomId);
        const haystack = `${roomId} ${summary.title} ${summary.snippet}`.toLowerCase();
        return haystack.includes(roomSearchQuery.toLowerCase());
    });
    roomsCountEl.textContent = rooms.length.toString();
    
    if (rooms.length === 0) {
        const emptyEl = document.createElement("li");
        emptyEl.className = "room-item";
        emptyEl.textContent = "ルームがありません";
        roomsListEl.appendChild(emptyEl);
        return;
    }

    if (visibleRooms.length === 0) {
        const emptyEl = document.createElement("li");
        emptyEl.className = "room-item muted";
        emptyEl.textContent = "一致する履歴がありません";
        roomsListEl.appendChild(emptyEl);
        return;
    }

    let lastGroup = "";
    visibleRooms.sort(compareRoomsForDisplay).forEach(roomId => {
        const group = getRoomGroupLabel(roomId);
        if (group !== lastGroup) {
            const groupEl = document.createElement("li");
            groupEl.className = "room-group-label";
            groupEl.textContent = group;
            roomsListEl.appendChild(groupEl);
            lastGroup = group;
        }

        const li = document.createElement("li");
        li.className = `room-item ${roomId === activeRoomId ? 'active' : ''}`;
        li.dataset.roomId = roomId;

        const link = document.createElement("div");
        link.className = "room-link";
        
        // Dynamic room icon
        const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        icon.setAttribute("width", "16");
        icon.setAttribute("height", "16");
        icon.setAttribute("fill", "none");
        icon.setAttribute("stroke", "currentColor");
        icon.setAttribute("viewBox", "0 0 24 24");
        
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-linejoin", "round");
        path.setAttribute("stroke-width", "2");
        path.setAttribute("d", "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z");
        icon.appendChild(path);

        const textWrap = document.createElement("div");
        textWrap.className = "room-text";

        const label = document.createElement("span");
        label.className = "room-title";
        const summary = getRoomSummary(roomId);
        label.textContent = summary.title;

        const subLabel = document.createElement("span");
        subLabel.className = "room-subtitle";
        subLabel.textContent = summary.snippet || `ID ${roomId}`;

        link.appendChild(icon);
        textWrap.appendChild(label);
        textWrap.appendChild(subLabel);
        link.appendChild(textWrap);
        li.appendChild(link);

        const actions = document.createElement("div");
        actions.className = "room-actions";

        const activeLabel = document.createElement("span");
        activeLabel.className = "room-num";
        activeLabel.textContent = roomId === activeRoomId ? "選択中" : formatRoomUpdated(summary.updated);
        actions.appendChild(activeLabel);

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "room-delete-btn";
        deleteBtn.type = "button";
        deleteBtn.title = "履歴を削除";
        deleteBtn.setAttribute("aria-label", `${summary.title} を履歴から削除`);
        deleteBtn.innerHTML = '<svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.7 12.1A2 2 0 0116.3 21H7.7a2 2 0 01-2-1.9L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16"/></svg>';
        deleteBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            deleteRoom(roomId);
        });
        actions.appendChild(deleteBtn);
        li.appendChild(actions);

        li.addEventListener("click", () => selectRoom(roomId));
        roomsListEl.appendChild(li);
    });
}

function getRoomSummary(roomId) {
    if (draftRoomIds.has(String(roomId))) {
        return roomSummaries[String(roomId)] || {
            title: `チャット ${roomId.toString().slice(-6)}`,
            snippet: "未送信",
            updated: null
        };
    }
    if (temporaryRoomIds.has(String(roomId))) {
        return roomSummaries[String(roomId)] || {
            title: "一時チャット",
            snippet: "履歴に保存されません",
            updated: null
        };
    }
    return roomSummaries[String(roomId)] || {
        title: `チャット ${roomId.toString().slice(-6)}`,
        snippet: `ID ${roomId}`,
        updated: null
    };
}

// Render model options in settings modal
function renderModelOptions() {
    const modelSelect = document.getElementById("settings-model");
    modelSelect.replaceChildren(); // Safe empty

    if (models.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "モデルが取得できませんでした";
        modelSelect.appendChild(opt);
        return;
    }

    models.forEach(model => {
        const opt = document.createElement("option");
        opt.value = model;
        opt.textContent = model;
        modelSelect.appendChild(opt);
    });
}

// Select room and load its history & config
async function selectRoom(roomId) {
    activeRoomId = roomId;
    renderRooms(); // Update active highlights
    closeSidebarOnMobile();
    
    welcomeScreenEl.classList.add("hidden");
    activeRoomTitleEl.textContent = getRoomSummary(roomId).title;
    
    // Enable inputs
    ensureInputReady();
    
    if (isTemporaryRoom(roomId)) {
        showEmptyConversation();
        updateStatusPanel({
            model: document.getElementById("settings-model")?.value || "",
            web_search_enabled: webSearchFastToggle.checked,
            thinking_mode: thinkingModeFastSelect.value
        });
        updateInputContextHint();
        return;
    }

    // Load config and history
    await loadRoomSettings(roomId);
    await loadHistory(roomId);
    updateInputContextHint();
}

async function deleteRoom(roomId) {
    const summary = getRoomSummary(roomId);
    const confirmed = confirm(`「${summary.title}」を履歴から削除しますか？`);
    if (!confirmed) return;

    try {
        const res = await apiFetch(`/api/rooms/${roomId}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Delete failed");

        if (activeRoomId === roomId) {
            activeRoomId = null;
            draftRoomIds.delete(String(roomId));
            temporaryRoomIds.delete(String(roomId));
            messagesContainerEl.replaceChildren();
            welcomeScreenEl.classList.remove("hidden");
            messagesContainerEl.appendChild(welcomeScreenEl);
            activeRoomTitleEl.textContent = "ルームを選択してください";
            resetStatusPanel();
            disableInputs();
        }

        rooms = rooms.filter(id => id !== roomId);
        delete roomSummaries[String(roomId)];
        await loadRooms();
        showSystemMessage("履歴を削除しました。");
    } catch (e) {
        console.error("Error deleting room:", e);
        showSystemMessage("履歴の削除に失敗しました。");
    }
}

// Load settings for room
async function loadRoomSettings(roomId) {
    try {
        const res = await apiFetch(`/api/settings/${roomId}`);
        if (!res.ok) throw new Error("Settings fetch failed");
        const config = await res.json();
        
        // Bind to settings form elements
        document.getElementById("settings-model").value = config.model || "";
        document.getElementById("settings-system-prompt").value = config.system_prompt || "";
        document.getElementById("settings-temperature").value = config.temperature ?? 0.8;
        document.getElementById("settings-max-tokens").value = config.max_tokens ?? 2048;
        document.getElementById("settings-web-search").checked = !!config.web_search_enabled;
        document.getElementById("settings-web-scrape").checked = !!config.web_scrape_enabled;
        document.getElementById("settings-search-engine").value = config.search_engine || "duckduckgo";
        document.getElementById("settings-thinking-mode").value = config.thinking_mode || "off";
        
        // Sync with fast selector in mini controls
        webSearchFastToggle.checked = !!config.web_search_enabled;
        thinkingModeFastSelect.value = config.thinking_mode || "off";
        updateStatusPanel(config);
    } catch (e) {
        console.error("Error loading settings:", e);
    }
}

// Load conversation logs
async function loadHistory(roomId) {
    try {
        const res = await apiFetch(`/api/history/${roomId}`);
        if (!res.ok) throw new Error("History fetch failed");
        const data = await res.json();
        
        messagesContainerEl.replaceChildren(); // Safe empty
        
        if (data.history.length === 0) {
            showEmptyConversation();
            return;
        }

        data.history.forEach(msg => {
            appendMessageBubble(msg.role, msg.content, msg.username);
        });
        
        scrollToBottom();
    } catch (e) {
        console.error("Error loading history:", e);
        showSystemMessage("過去ログの読み込みに失敗しました。");
    }
}

// Setup static event listeners
function setupEventListeners() {
    sidebarBackdropEl.addEventListener("click", () => setSidebarCollapsed(true));
    railBrandBtnEl.addEventListener("click", () => toggleSidebar());
    railHistoryBtnEl.addEventListener("click", () => openSidebar());
    railSearchBtnEl.addEventListener("click", () => {
        openSidebar();
        requestAnimationFrame(() => historySearchEl.focus());
    });
    railNewRoomBtnEl.addEventListener("click", () => createAndSelectLocalRoom());
    railSettingsBtnEl.addEventListener("click", async () => {
        await ensureActiveRoom();
        settingsModalEl.classList.remove("hidden");
    });
    toolMenuBtnEl.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleToolMenu();
    });
    attachFileBtnEl.addEventListener("click", async () => {
        closeToolMenu();
        await ensureActiveRoom();
        fileInputEl.click();
    });
    imageModeBtnEl.addEventListener("click", async () => {
        await ensureActiveRoom();
        activeToolMode = activeToolMode === "image" ? "chat" : "image";
        closeToolMenu();
        updateToolModeUI();
        promptInputEl.focus();
    });
    fileInputEl.addEventListener("change", async () => {
        await ensureActiveRoom();
        addSelectedFiles(Array.from(fileInputEl.files || []));
        fileInputEl.value = "";
        ensureInputReady();
        requestAnimationFrame(() => promptInputEl.focus());
    });
    document.addEventListener("click", (event) => {
        if (!toolMenuEl.contains(event.target) && event.target !== toolMenuBtnEl) {
            closeToolMenu();
        }
    });

    historySearchEl.addEventListener("input", () => {
        roomSearchQuery = historySearchEl.value.trim();
        renderRooms();
    });

    // Send message handling
    sendBtnEl.addEventListener("click", sendMessage);
    promptInputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && e.ctrlKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Create room
    newRoomBtnEl.addEventListener("click", () => {
        createAndSelectLocalRoom();
    });
    temporaryRoomBtnEl.addEventListener("click", () => {
        createAndSelectLocalRoom({ temporary: true });
    });

    welcomeScreenEl.addEventListener("click", async (event) => {
        const actionButton = event.target.closest("[data-action]");
        if (!actionButton) return;
        const action = actionButton.dataset.action;
        if (action === "new-chat") {
            await createAndSelectLocalRoom();
            promptInputEl.focus();
        } else if (action === "attach-file") {
            await ensureActiveRoom();
            fileInputEl.click();
        } else if (action === "image-mode") {
            await ensureActiveRoom();
            activeToolMode = "image";
            updateToolModeUI();
            promptInputEl.focus();
        }
    });

    settingsCloseBtnEl.addEventListener("click", () => {
        settingsModalEl.classList.add("hidden");
    });

    // Close settings on outside click
    settingsModalEl.addEventListener("click", (e) => {
        if (e.target === settingsModalEl) {
            settingsModalEl.classList.add("hidden");
        }
    });

    // Save settings
    settingsSaveBtnEl.addEventListener("click", async () => {
        if (!activeRoomId) return;
        
        const settingsData = {
            model: document.getElementById("settings-model").value,
            system_prompt: document.getElementById("settings-system-prompt").value.trim(),
            temperature: parseFloat(document.getElementById("settings-temperature").value) || 0.8,
            max_tokens: parseInt(document.getElementById("settings-max-tokens").value) || 2048,
            web_search_enabled: document.getElementById("settings-web-search").checked,
            web_scrape_enabled: document.getElementById("settings-web-scrape").checked,
            search_engine: document.getElementById("settings-search-engine").value,
            thinking_mode: document.getElementById("settings-thinking-mode").value
        };

        try {
            const res = await apiFetch(`/api/settings/${activeRoomId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(settingsData)
            });
            
            if (!res.ok) throw new Error("Settings save failed");
            
            // Sync fast controls
            webSearchFastToggle.checked = settingsData.web_search_enabled;
            thinkingModeFastSelect.value = settingsData.thinking_mode;
            updateStatusPanel(settingsData);
            
            settingsModalEl.classList.add("hidden");
            showSystemMessage("設定を保存しました。");
        } catch (e) {
            console.error("Error saving settings:", e);
            alert("設定の保存に失敗しました。");
        }
    });

    // Toggle sub-groups inside settings form dynamically
    const webSearchCheckbox = document.getElementById("settings-web-search");
    const searchEngineGroup = document.getElementById("search-engine-group");
    const webScrapeGroup = document.getElementById("web-scrape-group");

    webSearchCheckbox.addEventListener("change", () => {
        if (webSearchCheckbox.checked) {
            searchEngineGroup.classList.remove("hidden");
            webScrapeGroup.classList.remove("hidden");
        } else {
            searchEngineGroup.classList.add("hidden");
            webScrapeGroup.classList.add("hidden");
        }
    });

    // Mini fast select sync callbacks
    webSearchFastToggle.addEventListener("change", async () => {
        if (!activeRoomId) return;
        try {
            // Fetch current settings, edit fast variable, save back
            const res = await apiFetch(`/api/settings/${activeRoomId}`);
            if (res.ok) {
                const config = await res.json();
                config.web_search_enabled = webSearchFastToggle.checked;
                document.getElementById("settings-web-search").checked = webSearchFastToggle.checked;
                config.web_scrape_enabled = !!config.web_scrape_enabled;
                
                await apiFetch(`/api/settings/${activeRoomId}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(config)
                });
                updateStatusPanel(config);
            }
        } catch (e) {
            console.error(e);
        }
    });

    thinkingModeFastSelect.addEventListener("change", async () => {
        if (!activeRoomId) return;
        try {
            const res = await apiFetch(`/api/settings/${activeRoomId}`);
            if (res.ok) {
                const config = await res.json();
                config.thinking_mode = thinkingModeFastSelect.value;
                document.getElementById("settings-thinking-mode").value = thinkingModeFastSelect.value;
                
                await apiFetch(`/api/settings/${activeRoomId}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(config)
                });
                updateStatusPanel(config);
            }
        } catch (e) {
            console.error(e);
        }
    });
}

function toggleToolMenu() {
    const isHidden = toolMenuEl.classList.toggle("hidden");
    toolMenuBtnEl.setAttribute("aria-expanded", (!isHidden).toString());
}

function closeToolMenu() {
    toolMenuEl.classList.add("hidden");
    toolMenuBtnEl.setAttribute("aria-expanded", "false");
}

function addSelectedFiles(files) {
    const nextFiles = [];
    for (const file of files) {
        if (file.size > 10 * 1024 * 1024) {
            showSystemMessage(`${file.name} は10MBを超えるため添付できません。`);
            continue;
        }
        nextFiles.push(file);
    }
    selectedFiles = selectedFiles.concat(nextFiles).slice(0, 6);
    renderAttachmentBar();
    ensureInputReady();
    updateInputContextHint();
}

function renderAttachmentBar() {
    attachmentBarEl.replaceChildren();
    if (selectedFiles.length === 0 && activeToolMode === "chat") {
        attachmentBarEl.classList.add("hidden");
        return;
    }

    if (activeToolMode === "image") {
        const modeChip = document.createElement("div");
        modeChip.className = "attachment-chip mode-chip";
        modeChip.textContent = "画像生成モード";
        const clearBtn = document.createElement("button");
        clearBtn.type = "button";
        clearBtn.textContent = "×";
        clearBtn.addEventListener("click", () => {
            activeToolMode = "chat";
            updateToolModeUI();
        });
        modeChip.appendChild(clearBtn);
        attachmentBarEl.appendChild(modeChip);
    }

    selectedFiles.forEach((file, index) => {
        const chip = document.createElement("div");
        chip.className = file.type.startsWith("image/") ? "attachment-chip image-chip" : "attachment-chip";
        const name = document.createElement("span");
        name.textContent = file.name;
        chip.appendChild(name);

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.textContent = "×";
        removeBtn.setAttribute("aria-label", `${file.name} を添付から外す`);
        removeBtn.addEventListener("click", () => {
            selectedFiles.splice(index, 1);
            renderAttachmentBar();
            updateInputContextHint();
        });
        chip.appendChild(removeBtn);
        attachmentBarEl.appendChild(chip);
    });

    attachmentBarEl.classList.remove("hidden");
}

function updateToolModeUI() {
    document.body.classList.toggle("image-mode-active", activeToolMode === "image");
    promptInputEl.placeholder = activeToolMode === "image"
        ? "生成したい画像を説明してください..."
        : "メッセージを入力してください... (Ctrl+Enter で送信)";
    renderAttachmentBar();
    ensureInputReady();
    updateInputContextHint();
}

function createRoomId() {
    let roomId = "";
    do {
        roomId = Math.floor(10000000 + Math.random() * 90000000).toString();
    } while (rooms.includes(roomId) || temporaryRoomIds.has(roomId) || draftRoomIds.has(roomId));
    return roomId;
}

async function createAndSelectLocalRoom({ temporary = false } = {}) {
    const newRoomId = createRoomId();
    if (temporary) {
        temporaryRoomIds.add(newRoomId);
    } else {
        draftRoomIds.add(newRoomId);
    }
    roomSummaries[newRoomId] = {
        title: temporary ? "一時チャット" : `チャット ${newRoomId.slice(-6)}`,
        snippet: temporary ? "履歴に保存されません" : "新しいチャット",
        updated: new Date().toISOString()
    };
    renderRooms();
    await selectRoom(newRoomId);
    ensureInputReady();
    promptInputEl.focus();
    return newRoomId;
}

function isTemporaryRoom(roomId) {
    return temporaryRoomIds.has(String(roomId));
}

function isDraftRoom(roomId) {
    return draftRoomIds.has(String(roomId));
}

function promoteDraftRoom(roomId) {
    const key = String(roomId);
    if (!draftRoomIds.has(key) || temporaryRoomIds.has(key)) return;
    draftRoomIds.delete(key);
    if (!rooms.includes(key)) {
        rooms.push(key);
    }
    rooms.sort(compareRoomIds);
    renderRooms();
}

async function ensureActiveRoom() {
    if (activeRoomId) {
        ensureInputReady();
        return activeRoomId;
    }
    return createAndSelectLocalRoom();
}

function ensureInputReady() {
    if (!activeRoomId) return;
    promptInputEl.disabled = false;
    sendBtnEl.disabled = false;
    promptInputEl.removeAttribute("disabled");
    sendBtnEl.removeAttribute("disabled");
    updateInputContextHint();
}

function initializeSidebarState() {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    const shouldCollapse = stored === null
        ? window.matchMedia("(max-width: 760px)").matches
        : stored === "true";
    setSidebarCollapsed(shouldCollapse, false);
}

function setSidebarCollapsed(collapsed, persist = true) {
    document.body.classList.toggle("sidebar-collapsed", collapsed);
    railBrandBtnEl.setAttribute("aria-expanded", (!collapsed).toString());
    railBrandBtnEl.setAttribute("title", collapsed ? "サイドバーを開く" : "サイドバーを閉じる");
    railBrandBtnEl.setAttribute("aria-label", collapsed ? "サイドバーを開く" : "サイドバーを閉じる");
    updateSidebarBackdrop(collapsed);
    if (persist) {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed.toString());
    }
}

function updateSidebarBackdrop(collapsed = document.body.classList.contains("sidebar-collapsed")) {
    const isMobile = window.matchMedia("(max-width: 760px)").matches;
    sidebarBackdropEl.classList.toggle("hidden", collapsed || !isMobile);
}

function closeSidebarOnMobile() {
    if (window.matchMedia("(max-width: 760px)").matches) {
        setSidebarCollapsed(true);
    }
}

function openSidebar() {
    setSidebarCollapsed(false);
}

function toggleSidebar() {
    setSidebarCollapsed(!document.body.classList.contains("sidebar-collapsed"));
}

window.addEventListener("resize", () => updateSidebarBackdrop());

// Send active prompt message
async function sendMessage() {
    const text = promptInputEl.value.trim();
    if ((!text && selectedFiles.length === 0) || !activeRoomId) return;
    if (activeToolMode === "image") {
        await sendImageGeneration(text);
        return;
    }
    promoteDraftRoom(activeRoomId);

    // Clear input
    promptInputEl.value = "";
    const filesToSend = [...selectedFiles];
    selectedFiles = [];
    renderAttachmentBar();
    disableInputs();

    // Show user message in chat
    const displayText = text || "添付ファイルを確認してください。";
    appendMessageBubble("user", buildUserDisplayText(displayText, filesToSend), "あなた");
    updateRoomSummaryFromPrompt(activeRoomId, displayText);
    scrollToBottom();

    // Create assistant placeholder bubble
    const assistantBubble = appendPlaceholderBubble("assistant");
    scrollToBottom();

    // Setup thinking block if reasoning mode is on
    let thinkingDetailsEl = null;
    let thinkingBodyEl = null;
    let assistantBodyEl = document.createElement("div");
    assistantBodyEl.className = "markdown-body";
    assistantBubble.appendChild(assistantBodyEl);

    // Dynamic show typing
    showTyping("回答を準備中...");

    try {
        const response = await apiFetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                room_id: activeRoomId,
                message: text,
                username: "あなた",
                override_thinking_mode: thinkingModeFastSelect.value,
                temporary: isTemporaryRoom(activeRoomId),
                attachments: await Promise.all(filesToSend.map(fileToPayload))
            })
        });

        if (!response.ok) throw new Error("Chat request failed");

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        let fullAnswerText = "";
        let fullThinkingText = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");

            // Save the last incomplete line back to buffer
            buffer = lines.pop();

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                if (trimmed.startsWith("data: ")) {
                    const dataStr = trimmed.substring(6);
                    if (dataStr === "[DONE]") {
                        hideTyping();
                        break;
                    }

                    try {
                        const eventObj = JSON.parse(dataStr);
                        if (eventObj.event === "status") {
                            showTyping(eventObj.text);
                        } else if (eventObj.event === "thinking") {
                            // Show thinking segment
                            if (!thinkingDetailsEl) {
                                thinkingDetailsEl = document.createElement("details");
                                thinkingDetailsEl.className = "thinking-block";
                                thinkingDetailsEl.setAttribute("open", "");
                                
                                const summary = document.createElement("summary");
                                summary.textContent = "思考プロセス";
                                thinkingDetailsEl.appendChild(summary);

                                thinkingBodyEl = document.createElement("div");
                                thinkingBodyEl.className = "thinking-content";
                                thinkingDetailsEl.appendChild(thinkingBodyEl);
                                
                                // Insert thinking block before the assistant content body
                                assistantBubble.insertBefore(thinkingDetailsEl, assistantBodyEl);
                            }
                            fullThinkingText += eventObj.text;
                            thinkingBodyEl.textContent = fullThinkingText; // Strict safe textContent
                        } else if (eventObj.event === "text") {
                            // Close thinking block active state if text comes in
                            if (thinkingDetailsEl && thinkingDetailsEl.hasAttribute("open")) {
                                thinkingDetailsEl.removeAttribute("open");
                            }
                            fullAnswerText += eventObj.text;
                            renderMarkdownSecurely(fullAnswerText, assistantBodyEl);
                        } else if (eventObj.event === "error") {
                            showSystemMessage(eventObj.text);
                        }
                        scrollToBottom();
                    } catch (err) {
                        console.error("Error parsing event JSON:", err);
                    }
                }
            }
        }
    } catch (e) {
        console.error("Streaming error:", e);
        hideTyping();
        showSystemMessage(`応答受信時にエラーが発生しました: ${e.message}`);
    } finally {
        hideTyping();
        enableInputs();
        promptInputEl.focus();
    }
}

async function sendImageGeneration(text) {
    if (!text || !activeRoomId) return;
    promoteDraftRoom(activeRoomId);

    promptInputEl.value = "";
    activeToolMode = "chat";
    updateToolModeUI();
    disableInputs();

    appendMessageBubble("user", `画像生成: ${text}`, "あなた");
    updateRoomSummaryFromPrompt(activeRoomId, `画像生成: ${text}`);
    const assistantBubble = appendPlaceholderBubble("assistant");
    const assistantBodyEl = document.createElement("div");
    assistantBodyEl.className = "markdown-body";
    assistantBubble.appendChild(assistantBodyEl);
    showTyping("画像を生成中...");
    scrollToBottom();

    try {
        const res = await apiFetch("/api/images/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                room_id: activeRoomId,
                prompt: text,
                username: "あなた",
                temporary: isTemporaryRoom(activeRoomId)
            })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || "Image generation failed");
        }
        const data = await res.json();
        renderMarkdownSecurely(data.assistant_text, assistantBodyEl);
    } catch (e) {
        console.error("Image generation error:", e);
        showSystemMessage(`画像生成に失敗しました: ${e.message}`);
    } finally {
        hideTyping();
        enableInputs();
        promptInputEl.focus();
    }
}

function buildUserDisplayText(text, files) {
    if (files.length === 0) return text;
    const fileList = files.map(file => `- ${file.name}`).join("\n");
    return `${text}\n\n添付ファイル\n${fileList}`;
}

function fileToPayload(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result || "";
            const dataBase64 = result.toString().split(",", 2)[1] || "";
            resolve({
                filename: file.name,
                content_type: file.type || "application/octet-stream",
                data_base64: dataBase64
            });
        };
        reader.onerror = () => reject(reader.error || new Error("File read failed"));
        reader.readAsDataURL(file);
    });
}

function updateRoomSummaryFromPrompt(roomId, text) {
    const key = String(roomId);
    const compact = text.replace(/\s+/g, " ").trim();
    if (!roomSummaries[key]) {
        roomSummaries[key] = {
            title: `チャット ${roomId.toString().slice(-6)}`,
            snippet: "",
            updated: null
        };
    }
    if (roomSummaries[key].title.startsWith("チャット ")) {
        roomSummaries[key].title = createAutoTitle(compact);
    } else if (isTemporaryRoom(key) && roomSummaries[key].title === "一時チャット") {
        roomSummaries[key].title = `一時: ${createAutoTitle(compact)}`;
    }
    roomSummaries[key].snippet = truncateText(compact, 64);
    roomSummaries[key].updated = new Date().toISOString();
    if (key === String(activeRoomId)) {
        activeRoomTitleEl.textContent = roomSummaries[key].title;
    }
    renderRooms();
}

function createAutoTitle(text) {
    const cleaned = text
        .replace(/\s+/g, " ")
        .replace(/^(画像を生成|画像生成|ファイル確認|添付ファイルを確認)[:：\s]*/g, "")
        .replace(/^[「『"']+|[」』"']+$/g, "")
        .trim();
    return truncateText(cleaned || "新しいチャット", 24);
}

function truncateText(text, limit) {
    if (text.length <= limit) return text;
    return `${text.slice(0, Math.max(0, limit - 1)).trim()}…`;
}

function compareRoomsForDisplay(a, b) {
    const aTime = Date.parse(getRoomSummary(a).updated || "") || 0;
    const bTime = Date.parse(getRoomSummary(b).updated || "") || 0;
    if (aTime !== bTime) return bTime - aTime;
    return compareRoomIds(a, b);
}

function getRoomGroupLabel(roomId) {
    const updated = Date.parse(getRoomSummary(roomId).updated || "");
    if (!updated) return "その他";
    const now = new Date();
    const date = new Date(updated);
    const dayMs = 24 * 60 * 60 * 1000;
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (date.getTime() >= startToday) return "今日";
    if (date.getTime() >= startToday - dayMs) return "昨日";
    if (date.getTime() >= startToday - dayMs * 7) return "過去7日";
    return "以前";
}

function formatRoomUpdated(updated) {
    const date = new Date(updated || "");
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

function showEmptyConversation() {
    messagesContainerEl.replaceChildren();
    const emptyEl = document.createElement("div");
    emptyEl.className = "empty-conversation";

    const title = document.createElement("h2");
    title.textContent = "このチャットで始める";
    const text = document.createElement("p");
    text.textContent = "質問、ファイル要約、画像認識、画像生成を同じ入力欄から実行できます。";

    const actions = document.createElement("div");
    actions.className = "empty-actions";
    [
        ["ファイルを添付", "attach-file"],
        ["画像生成モード", "image-mode"],
        ["Web検索を切替", "web-toggle"],
    ].forEach(([label, action]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "empty-action";
        button.dataset.action = action;
        button.textContent = label;
        button.addEventListener("click", async () => {
            if (action === "attach-file") {
                fileInputEl.click();
            } else if (action === "image-mode") {
                activeToolMode = "image";
                updateToolModeUI();
                promptInputEl.focus();
            } else if (action === "web-toggle") {
                webSearchFastToggle.checked = !webSearchFastToggle.checked;
                webSearchFastToggle.dispatchEvent(new Event("change"));
            }
        });
        actions.appendChild(button);
    });

    emptyEl.appendChild(title);
    emptyEl.appendChild(text);
    emptyEl.appendChild(actions);
    messagesContainerEl.appendChild(emptyEl);
}

function updateStatusPanel(config = null) {
    const model = config?.model || document.getElementById("settings-model")?.value || "";
    const webEnabled = config ? !!config.web_search_enabled : webSearchFastToggle.checked;
    const thinkingMode = config?.thinking_mode || thinkingModeFastSelect.value || "off";

    modelStatusEl.textContent = model ? compactModelName(model) : "モデル未選択";
    webStatusEl.textContent = webEnabled ? "Web検索 On" : "Web検索 Off";
    webStatusEl.classList.toggle("active", webEnabled);
    thinkingStatusEl.textContent = getThinkingLabel(thinkingMode);
    thinkingStatusEl.classList.toggle("active", thinkingMode !== "off");
    updateInputContextHint();
}

function resetStatusPanel() {
    modelStatusEl.textContent = "モデル未選択";
    webStatusEl.textContent = "Web検索 Off";
    webStatusEl.classList.remove("active");
    thinkingStatusEl.textContent = "通常";
    thinkingStatusEl.classList.remove("active");
    updateInputContextHint();
}

function compactModelName(model) {
    return model.replace("hf.co/bartowski/", "").replace(":latest", "");
}

function getThinkingLabel(mode) {
    if (mode === "native") return "推論";
    if (mode === "debate") return "討論";
    return "通常";
}

function updateInputContextHint() {
    if (!activeRoomId) {
        inputContextHintEl.textContent = "チャットを選択すると入力できます";
        return;
    }
    const parts = [];
    if (isDraftRoom(activeRoomId)) parts.push("未送信");
    if (isTemporaryRoom(activeRoomId)) parts.push("一時チャット");
    if (selectedFiles.length) {
        const imageCount = selectedFiles.filter(file => file.type.startsWith("image/")).length;
        const fileCount = selectedFiles.length - imageCount;
        if (fileCount) parts.push(`ファイル ${fileCount}件`);
        if (imageCount) parts.push(`画像 ${imageCount}件`);
    }
    if (activeToolMode === "image") parts.push("画像生成モード");
    if (webSearchFastToggle.checked) parts.push("Web検索");
    inputContextHintEl.textContent = parts.length ? parts.join(" / ") : "Ctrl+Enter で送信";
}

function compareRoomIds(a, b) {
    if (a.length !== b.length) {
        return a.length - b.length;
    }
    return a.localeCompare(b);
}

// Disable textareas while streaming
function disableInputs() {
    promptInputEl.disabled = true;
    sendBtnEl.disabled = true;
    promptInputEl.setAttribute("disabled", "true");
    sendBtnEl.setAttribute("disabled", "true");
    inputContextHintEl.textContent = "処理中...";
}

function enableInputs() {
    promptInputEl.disabled = false;
    sendBtnEl.disabled = false;
    promptInputEl.removeAttribute("disabled");
    sendBtnEl.removeAttribute("disabled");
    updateInputContextHint();
}

// Show/hide typing indicators
function showTyping(text) {
    typingIndicatorEl.classList.remove("hidden");
    typingStatusTextEl.textContent = text;
}

function hideTyping() {
    typingIndicatorEl.classList.add("hidden");
}

// Append chat bubbles using strict DOM manipulation (No innerHTML for XSS safety)
function appendMessageBubble(role, content, username) {
    const row = document.createElement("div");
    row.className = `message-row ${role}`;

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";

    // Format content securely using Markdown parser
    const contentBody = document.createElement("div");
    contentBody.className = "markdown-body";
    renderMarkdownSecurely(content, contentBody);
    bubble.appendChild(contentBody);

    // Meta display
    const meta = document.createElement("div");
    meta.className = "message-meta";
    
    const sender = document.createElement("span");
    sender.textContent = role === "user" ? (username || "あなた") : "Assistant";
    meta.appendChild(sender);

    const time = document.createElement("span");
    time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    meta.appendChild(time);

    bubble.appendChild(meta);
    row.appendChild(bubble);
    messagesContainerEl.appendChild(row);
}

// Append assistant message container while token stream loads
function appendPlaceholderBubble(role) {
    const row = document.createElement("div");
    row.className = `message-row ${role}`;

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";

    // Meta details
    const meta = document.createElement("div");
    meta.className = "message-meta";
    
    const sender = document.createElement("span");
    sender.textContent = role === "user" ? "あなた" : "Assistant";
    meta.appendChild(sender);

    const time = document.createElement("span");
    time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    meta.appendChild(time);

    bubble.appendChild(meta);
    row.appendChild(bubble);
    messagesContainerEl.appendChild(row);
    return bubble;
}

// Show helper server notification bubbles
function showSystemMessage(text) {
    const systemEl = document.createElement("div");
    systemEl.className = "system-status-bubble";
    
    // Icon element
    const infoIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    infoIcon.setAttribute("width", "14");
    infoIcon.setAttribute("height", "14");
    infoIcon.setAttribute("fill", "none");
    infoIcon.setAttribute("stroke", "currentColor");
    infoIcon.setAttribute("viewBox", "0 0 24 24");
    
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("d", "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z");
    infoIcon.appendChild(path);

    const textSpan = document.createElement("span");
    textSpan.textContent = text; // Strict safe textContent

    systemEl.appendChild(infoIcon);
    systemEl.appendChild(textSpan);
    messagesContainerEl.appendChild(systemEl);
    scrollToBottom();
}

function scrollToBottom() {
    messagesContainerEl.scrollTop = messagesContainerEl.scrollHeight;
}

// Markdown Formatter (Adheres strictly to XSS guidelines. No innerHTML.)
function renderMarkdownSecurely(text, container) {
    container.replaceChildren(); // Safe empty
    
    // Split text by code blocks ```
    const parts = text.split("```");
    for (let i = 0; i < parts.length; i++) {
        if (i % 2 === 1) {
            // Code block content
            const rawBlock = parts[i];
            
            // Extract language if present
            const firstLineBreak = rawBlock.indexOf("\n");
            let lang = "";
            let codeContent = rawBlock;
            
            if (firstLineBreak !== -1) {
                const candidateLang = rawBlock.substring(0, firstLineBreak).trim();
                if (candidateLang && candidateLang.length < 15 && !candidateLang.includes(" ")) {
                    lang = candidateLang;
                    codeContent = rawBlock.substring(firstLineBreak + 1);
                }
            }

            const pre = document.createElement("pre");
            if (lang) pre.setAttribute("data-lang", lang);
            
            const code = document.createElement("code");
            code.textContent = codeContent.trim(); // Safe textContent escaping
            pre.appendChild(code);
            container.appendChild(pre);
        } else {
            // Standard text with inline formatting
            const lines = parts[i].split("\n");
            let currentParagraph = null;
            let currentList = null;

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) {
                    if (currentParagraph) {
                        container.appendChild(currentParagraph);
                        currentParagraph = null;
                    }
                    if (currentList) {
                        container.appendChild(currentList);
                        currentList = null;
                    }
                    continue;
                }

                // Check list tags
                if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
                    if (currentParagraph) {
                        container.appendChild(currentParagraph);
                        currentParagraph = null;
                    }
                    if (!currentList) {
                        currentList = document.createElement("ul");
                    }
                    const li = document.createElement("li");
                    renderInlineSecurely(trimmed.substring(2), li);
                    currentList.appendChild(li);
                } else if (trimmed.startsWith("### ")) {
                    if (currentParagraph) container.appendChild(currentParagraph);
                    if (currentList) container.appendChild(currentList);
                    currentParagraph = null;
                    currentList = null;
                    
                    const h3 = document.createElement("h3");
                    renderInlineSecurely(trimmed.substring(4), h3);
                    container.appendChild(h3);
                } else if (trimmed.startsWith("## ")) {
                    if (currentParagraph) container.appendChild(currentParagraph);
                    if (currentList) container.appendChild(currentList);
                    currentParagraph = null;
                    currentList = null;
                    
                    const h2 = document.createElement("h2");
                    renderInlineSecurely(trimmed.substring(3), h2);
                    container.appendChild(h2);
                } else if (trimmed.startsWith("# ")) {
                    if (currentParagraph) container.appendChild(currentParagraph);
                    if (currentList) container.appendChild(currentList);
                    currentParagraph = null;
                    currentList = null;
                    
                    const h1 = document.createElement("h1");
                    renderInlineSecurely(trimmed.substring(2), h1);
                    container.appendChild(h1);
                } else {
                    if (currentList) {
                        container.appendChild(currentList);
                        currentList = null;
                    }
                    if (!currentParagraph) {
                        currentParagraph = document.createElement("p");
                    } else {
                        currentParagraph.appendChild(document.createElement("br"));
                    }
                    renderInlineSecurely(line, currentParagraph);
                }
            }

            if (currentParagraph) container.appendChild(currentParagraph);
            if (currentList) container.appendChild(currentList);
        }
    }
}

// Render inline elements (bold, code, links) securely
function renderInlineSecurely(text, element) {
    let lastIndex = 0;
    
    // Search tags:
    // 0. Images: ![alt](url)
    // 1. Inline code: `code`
    // 2. Bold: **bold**
    // 3. Links: [title](url)
    const tokenRegex = /(!\[.*?\]\(.*?\)|\*\*.*?\*\*|`.*?`|\[.*?\]\(.*?\))/g;
    let match;

    while ((match = tokenRegex.exec(text)) !== null) {
        // Plain text before token match
        if (match.index > lastIndex) {
            const span = document.createElement("span");
            span.textContent = text.substring(lastIndex, match.index);
            element.appendChild(span);
        }
        
        const token = match[0];
        if (token.startsWith("![")) {
            const titleEnd = token.indexOf("]");
            const urlStart = token.indexOf("(", titleEnd);
            const urlEnd = token.indexOf(")", urlStart);
            if (titleEnd !== -1 && urlStart !== -1 && urlEnd !== -1) {
                const img = document.createElement("img");
                img.className = "generated-image";
                img.alt = token.substring(2, titleEnd) || "画像";
                const url = resolveBackendResourceUrl(token.substring(urlStart + 1, urlEnd));
                if (/^(https?:\/\/|\/)/i.test(url)) {
                    img.src = url;
                    element.appendChild(img);
                }
            }
        } else if (token.startsWith("**") && token.endsWith("**")) {
            const strong = document.createElement("strong");
            strong.textContent = token.substring(2, token.length - 2);
            element.appendChild(strong);
        } else if (token.startsWith("`") && token.endsWith("`")) {
            const code = document.createElement("code");
            code.textContent = token.substring(1, token.length - 1);
            element.appendChild(code);
        } else if (token.startsWith("[")) {
            const titleEnd = token.indexOf("]");
            const urlStart = token.indexOf("(", titleEnd);
            const urlEnd = token.indexOf(")", urlStart);
            if (titleEnd !== -1 && urlStart !== -1 && urlEnd !== -1) {
                const a = document.createElement("a");
                a.textContent = token.substring(1, titleEnd);
                const url = resolveBackendResourceUrl(token.substring(urlStart + 1, urlEnd));
                
                // Safe URL scheme check to prevent XSS (javascript: links)
                if (/^(https?:\/\/|file:\/\/|\/)/i.test(url)) {
                    a.setAttribute("href", url);
                    a.setAttribute("target", "_blank");
                    a.setAttribute("rel", "noopener noreferrer");
                } else {
                    a.setAttribute("href", "#");
                }
                element.appendChild(a);
            } else {
                const span = document.createElement("span");
                span.textContent = token;
                element.appendChild(span);
            }
        }
        
        lastIndex = tokenRegex.lastIndex;
    }
    
    if (lastIndex < text.length) {
        const span = document.createElement("span");
        span.textContent = text.substring(lastIndex);
        element.appendChild(span);
    }
}
