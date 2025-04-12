document.addEventListener("DOMContentLoaded", function () {

    /**
     * 顯示提示訊息並在短時間後自動消失
     * @param {string} message - 要顯示的提示訊息
     */
    function showStatusMessage(message) {
        // 取得狀態提示元素
        const statusEl = document.getElementById("saveStatus");
        // 將訊息設定進元素中，並設置初始透明度為 1
        statusEl.textContent = message;
        statusEl.style.opacity = "1";

        // 設定 2 秒後開始執行淡出效果
        setTimeout(function() {
            // 設定淡出的過渡效果（0.5 秒）
            statusEl.style.transition = "opacity 0.5s";
            // 將透明度設為 0 以開始淡出效果
            statusEl.style.opacity = "0";

            // 0.5 秒後（即淡出完成）清空訊息，並重置透明度與 transition 設定
            setTimeout(function() {
                statusEl.textContent = "";
                statusEl.style.opacity = "1";  // 重置，方便下次使用
                statusEl.style.transition = ""; // 清除過渡效果設定
            }, 500);
        }, 2000);
    }


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


    // 載入配置，從 chrome.storage 讀取 API URL、Folder 與 Password 預設值
    function loadOptions() {
        chrome.storage.local.get(["optApiUrl", "optFolder", "optPassword"], function(items) {
            if(items.optApiUrl && items.optFolder && items.optPassword) {
                document.getElementById("optApiUrl").value = items.optApiUrl;
                document.getElementById("optFolder").value = items.optFolder;
                document.getElementById("optPassword").value = items.optPassword;
            }
        });
    }

    // 保存選項至 chrome.storage.local
    document.getElementById("saveOptions").addEventListener("click", function(){
        const optApiUrl = document.getElementById("optApiUrl").value.trim();
        const optFolder = document.getElementById("optFolder").value.trim();
        const optPassword = document.getElementById("optPassword").value.trim();

        if (!optApiUrl || !optFolder || !optPassword) {
            alert("請完整填寫所有選項資訊");
            return;
        }

        chrome.storage.local.set({
            optApiUrl: optApiUrl,
            optFolder: optFolder,
            optPassword: optPassword
        }, function(){
            // 傳入提示訊息字串到封裝好的函數中
            showStatusMessage("配置已保存！");
        });
        login();
    });

    // 保存選項至 chrome.storage.local
    document.getElementById("logout").addEventListener("click", function(){


        // 只移除 authToken 這個 key
        chrome.storage.local.remove(['authToken'], () => {
            showStatusMessage("成功登出！");
        });

        // // 如果想一次清空所有 local storage
        // chrome.storage.local.clear(() => {
        //     showStatusMessage("成功登出！");
        // });

    });

    // 初始化載入選項
    loadOptions();
});
