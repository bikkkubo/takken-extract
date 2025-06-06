
/**
 * 宅建PDF抽出システム - ユーティリティ関数
 */

const Utils = {
    /**
     * ファイルサイズを人間が読める形式にフォーマット
     * @param {number} bytes - バイト数
     * @returns {string} フォーマットされたファイルサイズ
     */
    formatFileSize: function(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    /**
     * 日付を指定形式でフォーマット
     * @param {Date} date - 日付オブジェクト
     * @param {string} format - フォーマット文字列 (YYYY-MM-DD, YYYY/MM/DD HH:mm:ss など)
     * @returns {string} フォーマットされた日付文字列
     */
    formatDate: function(date, format = 'YYYY-MM-DD HH:mm:ss') {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        
        return format
            .replace('YYYY', year)
            .replace('MM', month)
            .replace('DD', day)
            .replace('HH', hours)
            .replace('mm', minutes)
            .replace('ss', seconds);
    },

    /**
     * ファイル名から拡張子を取得
     * @param {string} filename - ファイル名
     * @returns {string} 拡張子（ドット含む）
     */
    getFileExtension: function(filename) {
        return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
    },

    /**
     * ファイルタイプを検証
     * @param {File} file - ファイルオブジェクト
     * @returns {boolean} 有効なPDFファイルかどうか
     */
    validateFileType: function(file) {
        const allowedTypes = CONFIG.VALIDATION.allowedMimeTypes;
        const allowedExtensions = CONFIG.VALIDATION.allowedExtensions;
        
        const hasValidMimeType = allowedTypes.includes(file.type);
        const hasValidExtension = allowedExtensions.includes('.' + this.getFileExtension(file.name));
        
        return hasValidMimeType || hasValidExtension;
    },

    /**
     * ファイルサイズを検証
     * @param {File} file - ファイルオブジェクト
     * @returns {boolean} 許可サイズ内かどうか
     */
    validateFileSize: function(file) {
        const maxSizeBytes = CONFIG.UI.maxFileSizeMB * 1024 * 1024;
        return file.size <= maxSizeBytes;
    },

    /**
     * 文字列をHTMLエスケープ
     * @param {string} text - エスケープする文字列
     * @returns {string} エスケープされた文字列
     */
    escapeHtml: function(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, function(m) { return map[m]; });
    },

    /**
     * CSVフィールドをエスケープ
     * @param {string} field - エスケープするフィールド
     * @returns {string} エスケープされたフィールド
     */
    escapeCsvField: function(field) {
        if (typeof field !== 'string') field = String(field);
        if (field.includes('"') || field.includes(',') || field.includes('\n')) {
            return '"' + field.replace(/"/g, '""') + '"';
        }
        return field;
    },

    /**
     * 一意IDを生成
     * @param {string} prefix - プレフィックス
     * @returns {string} 一意ID
     */
    generateId: function(prefix = 'id') {
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    },

    /**
     * 深いオブジェクトのクローンを作成
     * @param {object} obj - クローンするオブジェクト
     * @returns {object} クローンされたオブジェクト
     */
    deepClone: function(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj.getTime());
        if (obj instanceof Array) return obj.map(item => this.deepClone(item));
        if (typeof obj === 'object') {
            const clonedObj = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    clonedObj[key] = this.deepClone(obj[key]);
                }
            }
            return clonedObj;
        }
    },

    /**
     * 配列を指定サイズのチャンクに分割
     * @param {Array} array - 分割する配列
     * @param {number} size - チャンクサイズ
     * @returns {Array} チャンクの配列
     */
    chunkArray: function(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    },

    /**
     * 文字列の類似度を計算（レーベンシュタイン距離）
     * @param {string} str1 - 文字列1
     * @param {string} str2 - 文字列2
     * @returns {number} 類似度（0-1）
     */
    calculateSimilarity: function(str1, str2) {
        const maxLength = Math.max(str1.length, str2.length);
        if (maxLength === 0) return 1.0;
        
        const distance = this.levenshteinDistance(str1, str2);
        return 1 - (distance / maxLength);
    },

    /**
     * レーベンシュタイン距離を計算
     * @param {string} str1 - 文字列1
     * @param {string} str2 - 文字列2
     * @returns {number} 編集距離
     */
    levenshteinDistance: function(str1, str2) {
        const matrix = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    },

    /**
     * ローカルストレージに安全に保存
     * @param {string} key - キー
     * @param {any} value - 値
     * @returns {boolean} 成功可能性
     */
    saveToLocalStorage: function(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.warn('localStorage save failed:', error);
            return false;
        }
    },

    /**
     * ローカルストレージから安全に読み込み
     * @param {string} key - キー
     * @param {any} defaultValue - デフォルト値
     * @returns {any} 読み込まれた値
     */
    loadFromLocalStorage: function(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.warn('localStorage load failed:', error);
            return defaultValue;
        }
    },

    /**
     * 非同期処理の待機
     * @param {number} ms - 待機時間（ミリ秒）
     * @returns {Promise} プロミス
     */
    sleep: function(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * 関数の実行を遅延させるデバウンス
     * @param {Function} func - 実行する関数
     * @param {number} delay - 遅延時間（ミリ秒）
     * @returns {Function} デバウンスされた関数
     */
    debounce: function(func, delay) {
        let timeoutId;
        return function(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    },

    /**
     * 関数の実行を制限するスロットル
     * @param {Function} func - 実行する関数
     * @param {number} delay - 制限時間（ミリ秒）
     * @returns {Function} スロットルされた関数
     */
    throttle: function(func, delay) {
        let timeoutId;
        let lastExecTime = 0;
        return function(...args) {
            const currentTime = Date.now();
            
            if (currentTime - lastExecTime > delay) {
                func.apply(this, args);
                lastExecTime = currentTime;
            } else {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => {
                    func.apply(this, args);
                    lastExecTime = Date.now();
                }, delay - (currentTime - lastExecTime));
            }
        };
    },

    /**
     * 配列から重複を除去
     * @param {Array} array - 処理する配列
     * @param {Function} keyFunc - キー抽出関数
     * @returns {Array} 重複が除去された配列
     */
    removeDuplicates: function(array, keyFunc = item => item) {
        const seen = new Set();
        return array.filter(item => {
            const key = keyFunc(item);
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    },

    /**
     * 数値を指定範囲に制限
     * @param {number} value - 値
     * @param {number} min - 最小値
     * @param {number} max - 最大値
     * @returns {number} 制限された値
     */
    clamp: function(value, min, max) {
        return Math.min(Math.max(value, min), max);
    },

    /**
     * 日本語文字列の長さを正確に計算
     * @param {string} str - 文字列
     * @returns {number} 文字数
     */
    getStringLength: function(str) {
        return Array.from(str).length;
    },

    /**
     * 日本語を含む文字列の truncate
     * @param {string} str - 文字列
     * @param {number} maxLength - 最大長
     * @param {string} suffix - 省略記号
     * @returns {string} 切り詰められた文字列
     */
    truncateString: function(str, maxLength, suffix = '…') {
        if (this.getStringLength(str) <= maxLength) return str;
        
        const chars = Array.from(str);
        return chars.slice(0, maxLength - suffix.length).join('') + suffix;
    },

    /**
     * パーセンテージを計算
     * @param {number} part - 部分
     * @param {number} total - 全体
     * @param {number} precision - 小数点以下桁数
     * @returns {number} パーセンテージ
     */
    calculatePercentage: function(part, total, precision = 1) {
        if (total === 0) return 0;
        return parseFloat(((part / total) * 100).toFixed(precision));
    },

    /**
     * オブジェクトの指定パスの値を安全に取得
     * @param {object} obj - オブジェクト
     * @param {string} path - パス（例: 'a.b.c'）
     * @param {any} defaultValue - デフォルト値
     * @returns {any} 値
     */
    getNestedValue: function(obj, path, defaultValue = undefined) {
        return path.split('.').reduce((current, key) => {
            return (current && current[key] !== undefined) ? current[key] : defaultValue;
        }, obj);
    },

    /**
     * オブジェクトの指定パスに値を安全に設定
     * @param {object} obj - オブジェクト
     * @param {string} path - パス（例: 'a.b.c'）
     * @param {any} value - 設定する値
     * @returns {object} 変更されたオブジェクト
     */
    setNestedValue: function(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((current, key) => {
            if (!current[key] || typeof current[key] !== 'object') {
                current[key] = {};
            }
            return current[key];
        }, obj);
        
        target[lastKey] = value;
        return obj;
    },

    /**
     * ファイルをダウンロード
     * @param {Blob|string} content - ファイル内容
     * @param {string} filename - ファイル名
     * @param {string} mimeType - MIMEタイプ
     */
    downloadFile: function(content, filename, mimeType = 'text/plain') {
        const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // メモリリークを防ぐためURLを解放
        setTimeout(() => URL.revokeObjectURL(url), 100);
    },

    /**
     * DOM要素を安全に取得
     * @param {string} selector - CSSセレクタ
     * @param {Element} parent - 親要素
     * @returns {Element|null} DOM要素
     */
    getElement: function(selector, parent = document) {
        try {
            return parent.querySelector(selector);
        } catch (error) {
            console.warn('Invalid selector:', selector, error);
            return null;
        }
    },

    /**
     * DOM要素の表示・非表示を切り替え
     * @param {string|Element} element - 要素またはセレクタ
     * @param {boolean} show - 表示するかどうか
     */
    toggleElement: function(element, show) {
        const el = typeof element === 'string' ? this.getElement(element) : element;
        if (el) {
            el.style.display = show ? 'block' : 'none';
        }
    },

    /**
     * エラーを安全にログ出力
     * @param {string} message - メッセージ
     * @param {Error} error - エラーオブジェクト
     * @param {object} context - コンテキスト情報
     */
    logError: function(message, error = null, context = {}) {
        if (CONFIG.LOGGING.enableConsole) {
            console.error(message, error, context);
        }
        
        // 将来的にエラー報告サービスに送信する場合の準備
        const errorInfo = {
            message,
            error: error ? error.toString() : null,
            stack: error ? error.stack : null,
            context,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent
        };
        
        // ローカルストレージにエラーログを保存（オプション）
        if (CONFIG.LOGGING.enableFileExport) {
            const logs = this.loadFromLocalStorage('errorLogs', []);
            logs.push(errorInfo);
            
            // 最大ログ数を制限
            if (logs.length > CONFIG.LOGGING.maxLogEntries) {
                logs.splice(0, logs.length - CONFIG.LOGGING.maxLogEntries);
            }
            
            this.saveToLocalStorage('errorLogs', logs);
        }
    }
};

// グローバルエクスポート
window.Utils = Utils;

