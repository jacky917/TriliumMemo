document.addEventListener("DOMContentLoaded", function () {

    // 全域變數：將由 storage 中讀取
    let token = "";
    let apiUrl = "";
    let parentNoteId = "";

    /**
     * 儲存的 optApiUrl、optFolder 與 optPassword，再使用這些參數呼叫登入 API，
     * 若成功取得 token，則存入 chrome.storage.local 中，並可更新 UI（例如顯示提示訊息）。
     */
    function login() {
        // 先從 chrome.storage.local 中取得用戶在 Options 頁面中儲存的設定值
        chrome.storage.local.get(["optApiUrl", "optFolder", "optPassword"], async function(items) {
            // 檢查是否完整儲存了所有必要的資訊
            if (items.optApiUrl && items.optFolder && items.optPassword) {

                // 如果有，則可將這些值填回對應的輸入框（這段僅作為 UI 維護用途）
                document.getElementById("optApiUrl").value = items.optApiUrl;
                document.getElementById("optFolder").value = items.optFolder;
                document.getElementById("optPassword").value = items.optPassword;

                // 組合登入的完整 URL，這裡使用已儲存的 API URL
                const loginUrl = items.optApiUrl + "/etapi/auth/login";

                try {
                    // 使用 fetch() 發送 POST 請求到登入端點
                    // await 將暫停 async 函數執行，直到 fetch() 返回結果
                    const response = await fetch(loginUrl, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        // 將密碼包裝成 JSON 作為請求內容傳送
                        body: JSON.stringify({ password: items.optPassword })
                    });

                    // 檢查 HTTP 回應是否成功，response.ok 為 false 時，拋出錯誤
                    if (!response.ok) {
                        showStatusMessage("登入失敗！");
                        throw new Error(`登入失敗，狀態碼：${response.status}`);
                    }

                    // 使用 await 將回應轉換為 JSON 格式
                    const data = await response.json();
                    console.log("取得 token：", data.authToken);

                    // 將取得的 token 存入 chrome.storage.local 中，便於後續操作使用
                    chrome.storage.local.set({ authToken: data.authToken }, function() {
                        showStatusMessage("登入成功！");
                        console.log("Auth token 已儲存到 storage。");


                        setTimeout(function() {
                            // 關閉分頁
                            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                                if (tabs.length > 0) {
                                    chrome.tabs.remove(tabs[0].id, function() {
                                        console.log("分頁已關閉");
                                    });
                                }
                            });
                        }, 1000);

                    });
                } catch (error) {
                    showStatusMessage("登入失敗！");
                    // 若在 fetch 或 JSON 轉換過程中發生錯誤，會進入這裡
                    console.error("login() error:", error);
                    // 可根據需要在這裡更新 UI，例如顯示錯誤訊息
                    // 例如：
                    // document.getElementById("error").textContent = error.message;
                }
            } else {
                showStatusMessage("登入失敗！");
                // 若未儲存完整的設置，則提示用戶先進入 Options 頁面設置
                console.error("尚未設定完整的 API URL、Folder 或 Password");
                // 例如：
                // alert("請先填寫完整的 API URL、Folder 與 Password");
            }
        });
    }


    // 齒輪按鈕點擊事件：打開選項頁
    const openOptionsBtn = document.getElementById("openOptions");
    if (openOptionsBtn) {
        openOptionsBtn.addEventListener("click", () => {
            chrome.tabs.create({ url: chrome.runtime.getURL("options.html") });
        });
    }

    // 初始化：從 storage 取得 token 與設定
    chrome.storage.local.get(["authToken", "optApiUrl", "optFolder"], function (items) {
        if (items.authToken && items.optApiUrl && items.optFolder) {
            token = items.authToken;
            apiUrl = items.optApiUrl;
            parentNoteId = items.optFolder;
            document.getElementById("message").textContent = "";
            document.getElementById("mainSection").style.display = "block";
            initMain();
        } else {
            document.getElementById("message").textContent =
                "尚未登入，請點擊右上角齒輪進入設置頁進行配置和登入。";
        }
    });

    // 主操作：取得當前活動分頁與用戶選取文字，進而呼叫查詢筆記 API
    function initMain() {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (!tabs || tabs.length === 0) {
                document.getElementById("selectedTextDisplay").textContent = "無法取得活動分頁";
                return;
            }
            const activeTab = tabs[0];
            const pageUrl = activeTab.url;

            // 取得當前分頁中用戶選取的文字
            chrome.scripting.executeScript({
                target: { tabId: activeTab.id },
                function: () => window.getSelection().toString()
            }, (results) => {
                let selectedText = "";
                if (results && results[0] && typeof results[0].result === "string") {
                    selectedText = results[0].result.trim();
                }
                if (!selectedText) {
                    document.getElementById("selectedTextDisplay").textContent = "請先於網頁中選取文字";
                    return;
                }
                const disp = document.getElementById("selectedTextDisplay");
                // 這邊有 XSS 風險
                disp.innerHTML = `選取中的文字: <span class="highlight">${selectedText}</span>`;
                // document.getElementById("selectedTextDisplay").textContent = "選取中的文字: " + selectedText;
                queryNote(pageUrl, selectedText);
            });
        });
    }

    /**
     * 取得指定筆記的內容 (HTML 格式)
     * @param {string} token 使用 /auth/login 取得的 token
     * @param {string} noteId 指定的筆記ID
     * @returns {Promise<string>} 返回筆記內容的 HTML 字串
     */
    async function getNoteContent(token, noteId) {
        const url = `${apiUrl}/etapi/notes/${noteId}/content`;
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    // 'Accept': 'text/html',
                    'Authorization': token
                }
            });
            if (!response.ok) {
                throw new Error(`獲取筆記內容失敗，狀態碼：${response.status}`);
            }
            const content = await response.text();
            console.log('筆記內容：', content);
            return content;
        } catch (error) {
            console.error('getNoteContent() error:', error);
            throw error;
        }
    }

    function queryNote(pageUrl, selectedText) {
        const statusEl = document.getElementById("noteStatus");
        statusEl.textContent = "查詢筆記中…";
        const queryUrl = `${apiUrl}/etapi/notes?search=${encodeURIComponent(selectedText)}`;

        fetch(queryUrl, {
            headers: {
                "Accept": "application/json",
                "Authorization": token
            }
        })
            .then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json();
            })
            .then(data => {
                const results = data.results || [];
                if (results.length > 0) {
                    statusEl.textContent = `已找到 ${results.length} 筆筆記，最多顯示前2筆：`;
                    // 只取前三筆
                    showNoteList(pageUrl, selectedText, results.slice(0, 2));
                } else {
                    statusEl.textContent = "無筆記記錄，請新增筆記：";
                    showAddNoteForm(pageUrl, selectedText);
                }
            })
            .catch(error => {
                statusEl.textContent = "查詢筆記失敗";
                console.error(error);
            });
    }

    function showNoteList(pageUrl, selectedText, notes) {
        const container = document.getElementById("noteContent");
        container.innerHTML = "";

        notes.forEach((note, idx) => {
            // 每筆筆記放在一個只讀的 textarea
            const ta = document.createElement("textarea");
            ta.className = "NoteContent";
            ta.readOnly = true;

            // 透過 async 函式獲取內容並更新 textarea 的值
            (async () => {
                try {
                    ta.value = await getNoteContent(token, note.noteId);
                } catch (error) {
                    console.error("獲取筆記內容失敗:", error);
                    // ta.value = "載入筆記內容失敗";
                }
            })();


            ta.style.marginBottom = "12px";
            container.appendChild(ta);

            // const btn = document.createElement("button");
            // btn.className = "updateBtn";
            // btn.textContent = "更新筆記";
            // btn.addEventListener("click", () => {
            //     // // 假設取第一筆的 selectedText
            //     // const selectedText = notes[0]?.content || "";
            //     // showAddNoteForm(pageUrl, selectedText);
            // });
            // container.appendChild(btn);

        });

        const textarea = document.createElement("textarea");
        textarea.id = "newNoteContent";
        textarea.className = "NoteContent";
        textarea.placeholder = "請輸入筆記內容…";
        container.appendChild(textarea);

        const btn = document.createElement("button");
        btn.className = "addBtn";
        btn.textContent = "新增筆記";
        btn.addEventListener("click", function () {
            const newContent = textarea.value.trim();
            if (!newContent) {
                alert("筆記內容不能為空");
                return;
            }
            createNote(pageUrl, selectedText, newContent);
        });
        container.appendChild(btn);
    }

// 顯示新增筆記表單：包含 textarea 與新增按鈕
    function showAddNoteForm(pageUrl, selectedText) {
        const container = document.getElementById("noteContent");
        container.innerHTML = "";

        const textarea = document.createElement("textarea");
        textarea.id = "newNoteContent";
        textarea.className = "NoteContent";
        textarea.placeholder = "請輸入筆記內容…";
        container.appendChild(textarea);

        const btn = document.createElement("button");
        btn.textContent = "新增筆記";
        btn.addEventListener("click", function () {
            const newContent = textarea.value.trim();
            if (!newContent) {
                alert("筆記內容不能為空");
                return;
            }
            createNote(pageUrl, selectedText, newContent);
        });
        container.appendChild(btn);
    }

    /**
     * 使用 async/await 建立新筆記
     *
     * 函數會根據全域變數 apiUrl、token、parentNoteId 與傳入的參數，
     * 組合出建立筆記所需的資料 (payload)，
     * 然後利用 fetch() 以 POST 方法呼叫 /etapi/create-note 端點，
     * 若建立成功則從回應中取得資料並更新 UI，
     * 若失敗則捕獲錯誤並更新 UI 以顯示錯誤訊息。
     *
     * @param {string} pageUrl - 當前頁面 URL（此處可供參考，但未直接用於 payload）
     * @param {string} selectedText - 用戶選取的文字，用以組合筆記標題
     * @param {string} newContent - 用戶輸入的新筆記內容
     * @returns {Promise<object>} - 返回建立成功的筆記資訊物件，若有需要可以使用
     */
    /**
     * 使用 async/await 建立新筆記，並加入詳細 debug 訊息
     *
     * @param {string} pageUrl - 當前頁面 URL（供參考，可依需求使用）
     * @param {string} selectedText - 用戶選取的文字，用以組合筆記標題
     * @param {string} newContent - 用戶輸入的新筆記內容
     * @returns {Promise<object>} - 返回建立成功的筆記資訊物件
     */
    async function createNote(pageUrl, selectedText, newContent) {
        // 組合建立筆記的完整 URL，注意這裡是全域變數 apiUrl 拼接而成
        const postUrl = apiUrl + "/etapi/create-note";

        // 構建 payload 物件，依據 CreateNoteDef schema 的需求
        const payload = {
            parentNoteId: parentNoteId,
            // 若選取文字長度超過 20 字，則截斷後加上 "..."，作為筆記標題
            title: "TriliumMemo: " + (selectedText.length > 20 ? selectedText.substring(0, 20) + "..." : selectedText),
            type: "text",      // 此處使用純文字筆記
            content: newContent,
            notePosition: 10   // 選用欄位，用於指定在父筆記中的排序位置
        };

        // DEBUG: 輸出請求相關訊息
        console.log("正在建立新筆記...");
        console.log("請求 URL:", postUrl);
        console.log("使用的 token:", token);
        console.log("請求 Payload:", payload);

        try {
            // 發送 fetch 請求
            const response = await fetch(postUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    // 使用 Bearer schema 傳遞 token，這裡的 token 為全域變數
                    "Authorization": `${token}`
                },
                body: JSON.stringify(payload)  // 將 payload 轉成 JSON 格式發送
            });

            // DEBUG: 輸出回應狀態
            console.log("回應狀態:", response.status, response.statusText);

            // 如果回應不成功 (例如狀態碼不是 201)，讀取錯誤詳情並拋出錯誤
            if (!response.ok) {
                const errorDetails = await response.text();
                console.error("伺服器回傳錯誤訊息:", errorDetails);
                throw new Error(`新增筆記失敗，狀態碼：${response.status}, 詳情：${errorDetails}`);
            }

            // 等待回應資料轉成 JSON 物件
            const data = await response.json();
            console.log('新筆記建立成功：', data);

            // 更新 UI，顯示成功訊息與新增的筆記內容
            // document.getElementById("noteStatus").textContent = "筆記已新增";

            const disp = document.getElementById("noteStatus");
            disp.innerHTML = `已新增筆記: <span class="highlight">${newContent.length > 10 ? newContent.substring(0, 10) + "..." : newContent}</span>`;


            // 回傳資料，若後續需要使用此結果
            return data;
        } catch (error) {
            // 捕獲錯誤，更新 UI 並輸出詳細錯誤訊息到 Console
            document.getElementById("noteStatus").textContent = "新增筆記時發生錯誤";
            console.error('createNote() error:', error);
            throw error;
        }
    }

});
