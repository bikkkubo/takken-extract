
/**
 * 宅建PDF抽出システム - メインアプリケーション
 * 全機能を統合したメインコントローラー
 */

const TakkenApp = {
    // アプリケーション状態
    state: {
        uploadedFiles: [],
        extractedData: [],
        debugData: [],
        extractionStats: null,
        isProcessing: false,
        lastUpdate: null
    },

    // UI要素キャッシュ
    elements: {},

    /**
     * アプリケーション初期化
     */
    init: function() {
        console.log('宅建PDF抽出システム初期化開始');
        
        // UI要素をキャッシュ
        this.cacheElements();
        
        // イベントリスナーを設定
        this.setupEventListeners();
        
        // 初期状態を設定
        this.setupInitialState();
        
        // 設定の復元
        this.restoreSettings();
        
        console.log('アプリケーション初期化完了');
    },

    /**
     * UI要素をキャッシュ
     */
    cacheElements: function() {
        this.elements = {
            // ファイル関連
            pdfInput: document.getElementById('pdfInput'),
            uploadSection: document.getElementById('uploadSection'),
            fileList: document.getElementById('fileList'),
            
            // オプション
            textExtractionMode: document.getElementById('textExtractionMode'),
            confidenceThreshold: document.getElementById('confidenceThreshold'),
            confidenceValue: document.getElementById('confidenceValue'),
            questionMinLength: document.getElementById('questionMinLength'),
            enableDebugMode: document.getElementById('enableDebugMode'),
            
            // 統計
            totalQuestions: document.getElementById('totalQuestions'),
            correctAnswers: document.getElementById('correctAnswers'),
            incorrectAnswers: document.getElementById('incorrectAnswers'),
            sectionsCount: document.getElementById('sectionsCount'),
            averageConfidence: document.getElementById('averageConfidence'),
            
            // ボタン
            extractBtn: document.getElementById('extractBtn'),
            downloadBtn: document.getElementById('downloadBtn'),
            previewBtn: document.getElementById('previewBtn'),
            debugBtn: document.getElementById('debugBtn'),
            reportBtn: document.getElementById('reportBtn'),
            
            // プログレス
            progressBar: document.getElementById('progressBar'),
            progressText: document.getElementById('progressText'),
            
            // 表示エリア
            status: document.getElementById('status'),
            debugInfo: document.getElementById('debugInfo'),
            preview: document.getElementById('preview'),
            report: document.getElementById('report')
        };
    },

    /**
     * イベントリスナーを設定
     */
    setupEventListeners: function() {
        // ファイル選択
        if (this.elements.pdfInput) {
            this.elements.pdfInput.addEventListener('change', (e) => this.handleFileSelect(e));
        }

        // ドラッグ&ドロップ
        if (this.elements.uploadSection) {
            this.elements.uploadSection.addEventListener('dragover', (e) => this.handleDragOver(e));
            this.elements.uploadSection.addEventListener('dragleave', (e) => this.handleDragLeave(e));
            this.elements.uploadSection.addEventListener('drop', (e) => this.handleDrop(e));
        }

        // オプション変更
        if (this.elements.confidenceThreshold) {
            this.elements.confidenceThreshold.addEventListener('input', (e) => this.updateConfidenceDisplay(e));
        }

        if (this.elements.textExtractionMode) {
            this.elements.textExtractionMode.addEventListener('change', (e) => this.saveSettings());
        }

        // キーボードショートカット
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));

        // ウィンドウイベント
        window.addEventListener('beforeunload', (e) => this.handleBeforeUnload(e));
        window.addEventListener('resize', Utils.throttle(() => this.handleResize(), 250));
    },

    /**
     * 初期状態を設定
     */
    setupInitialState: function() {
        this.updateStats();
        this.updateConfidenceDisplay();
        this.setStatus('PDFファイルをアップロードして開始してください。', 'info');
        this.updateButtonStates();
    },

    /**
     * 設定を復元
     */
    restoreSettings: function() {
        const savedSettings = Utils.loadFromLocalStorage('takkenAppSettings', {});
        
        if (savedSettings.extractionMode && this.elements.textExtractionMode) {
            this.elements.textExtractionMode.value = savedSettings.extractionMode;
        }
        
        if (savedSettings.confidenceThreshold && this.elements.confidenceThreshold) {
            this.elements.confidenceThreshold.value = savedSettings.confidenceThreshold;
            this.updateConfidenceDisplay();
        }
        
        if (savedSettings.questionMinLength && this.elements.questionMinLength) {
            this.elements.questionMinLength.value = savedSettings.questionMinLength;
        }
        
        if (savedSettings.debugMode !== undefined && this.elements.enableDebugMode) {
            this.elements.enableDebugMode.checked = savedSettings.debugMode;
        }
    },

    /**
     * 設定を保存
     */
    saveSettings: function() {
        const settings = {
            extractionMode: this.elements.textExtractionMode?.value,
            confidenceThreshold: this.elements.confidenceThreshold?.value,
            questionMinLength: this.elements.questionMinLength?.value,
            debugMode: this.elements.enableDebugMode?.checked
        };
        
        Utils.saveToLocalStorage('takkenAppSettings', settings);
    },

    /**
     * ファイル選択処理
     */
    handleFileSelect: function(event) {
        const files = Array.from(event.target.files);
        this.addFiles(files);
    },

    /**
     * ドラッグオーバー処理
     */
    handleDragOver: function(event) {
        event.preventDefault();
        if (this.elements.uploadSection) {
            this.elements.uploadSection.classList.add('dragover');
        }
    },

    /**
     * ドラッグリーブ処理
     */
    handleDragLeave: function(event) {
        event.preventDefault();
        if (this.elements.uploadSection) {
            this.elements.uploadSection.classList.remove('dragover');
        }
    },

    /**
     * ドロップ処理
     */
    handleDrop: function(event) {
        event.preventDefault();
        if (this.elements.uploadSection) {
            this.elements.uploadSection.classList.remove('dragover');
        }

        const files = Array.from(event.dataTransfer.files);
        const pdfFiles = files.filter(file => Utils.validateFileType(file));

        if (pdfFiles.length !== files.length) {
            this.setStatus('PDFファイル以外はスキップされました。', 'warning');
        }

        if (pdfFiles.length > 0) {
            this.addFiles(pdfFiles);
        }
    },

    /**
     * ファイルを追加
     */
    addFiles: function(files) {
        console.log('ファイル追加:', files.length);

        for (const file of files) {
            if (Utils.validateFileType(file) && Utils.validateFileSize(file)) {
                const fileId = Utils.generateId('file');
                this.state.uploadedFiles.push({
                    id: fileId,
                    file: file,
                    name: file.name,
                    size: file.size,
                    addedAt: new Date()
                });
            } else {
                console.warn('無効なファイル:', file.name);
            }
        }

        this.updateFileList();
        this.updateButtonStates();
        this.setStatus(`${this.state.uploadedFiles.length}個のPDFファイルが登録されています。`, 'success');
    },

    /**
     * ファイルを削除
     */
    removeFile: function(fileId) {
        this.state.uploadedFiles = this.state.uploadedFiles.filter(f => f.id !== fileId);
        this.updateFileList();
        this.updateButtonStates();

        if (this.state.uploadedFiles.length === 0) {
            this.setStatus('ファイルがありません。PDFをアップロードしてください。', 'info');
        } else {
            this.setStatus(`${this.state.uploadedFiles.length}個のファイルが登録されています。`, 'info');
        }
    },

    /**
     * ファイルリストを更新
     */
    updateFileList: function() {
        if (!this.elements.fileList) return;

        if (this.state.uploadedFiles.length === 0) {
            this.elements.fileList.innerHTML = '';
            return;
        }

        const html = this.state.uploadedFiles.map(fileObj => `
            <div class="file-item">
                <div class="file-info">
                    <div class="file-name">📄 ${Utils.escapeHtml(fileObj.name)}</div>
                    <div class="file-size">${Utils.formatFileSize(fileObj.size)}</div>
                </div>
                <div class="file-actions">
                    <button class="remove-file" onclick="app.removeFile('${fileObj.id}')">削除</button>
                </div>
            </div>
        `).join('');

        this.elements.fileList.innerHTML = html;
    },

    /**
     * 信頼度表示を更新
     */
    updateConfidenceDisplay: function() {
        if (this.elements.confidenceThreshold && this.elements.confidenceValue) {
            const value = this.elements.confidenceThreshold.value;
            this.elements.confidenceValue.textContent = value + '%';
        }
    },

    /**
     * 統計情報を更新
     */
    updateStats: function() {
        const total = this.state.extractedData.length;
        const correct = this.state.extractedData.filter(q => q.answer === '〇').length;
        const incorrect = this.state.extractedData.filter(q => q.answer === '×').length;
        const sections = new Set(this.state.extractedData.map(q => q.section)).size;
        const avgConfidence = total > 0 ? 
            this.state.extractedData.reduce((sum, q) => sum + (q.confidence || 0), 0) / total : 0;

        if (this.elements.totalQuestions) this.elements.totalQuestions.textContent = total;
        if (this.elements.correctAnswers) this.elements.correctAnswers.textContent = correct;
        if (this.elements.incorrectAnswers) this.elements.incorrectAnswers.textContent = incorrect;
        if (this.elements.sectionsCount) this.elements.sectionsCount.textContent = sections;
        if (this.elements.averageConfidence) this.elements.averageConfidence.textContent = Math.round(avgConfidence) + '%';
    },

    /**
     * ボタン状態を更新
     */
    updateButtonStates: function() {
        const hasFiles = this.state.uploadedFiles.length > 0;
        const hasData = this.state.extractedData.length > 0;

        if (this.elements.extractBtn) {
            this.elements.extractBtn.disabled = !hasFiles || this.state.isProcessing;
        }
        if (this.elements.downloadBtn) {
            this.elements.downloadBtn.disabled = !hasData;
        }
        if (this.elements.previewBtn) {
            this.elements.previewBtn.disabled = !hasData;
        }
        if (this.elements.debugBtn) {
            this.elements.debugBtn.disabled = !hasData;
        }
        if (this.elements.reportBtn) {
            this.elements.reportBtn.disabled = !hasData;
        }
    },

    /**
     * プログレスを更新
     */
    updateProgress: function(percent, text = '') {
        if (this.elements.progressBar) {
            this.elements.progressBar.style.width = percent + '%';
        }
        if (this.elements.progressText && text) {
            this.elements.progressText.textContent = text;
        }
    },

    /**
     * ステータスを設定
     */
    setStatus: function(message, type = 'info') {
        if (!this.elements.status) return;

        this.elements.status.textContent = message;
        this.elements.status.className = 'status ' + type;
        
        // 自動非表示（成功・警告メッセージの場合）
        if (type === 'success' || type === 'warning') {
            setTimeout(() => {
                if (this.elements.status.textContent === message) {
                    this.elements.status.className = 'status';
                }
            }, 5000);
        }
    },

    /**
     * PDFからデータを抽出
     */
    async extractFromPDFs() {
        if (this.state.uploadedFiles.length === 0) {
            this.setStatus('PDFファイルを先にアップロードしてください。', 'error');
            return;
        }

        this.state.isProcessing = true;
        this.state.extractedData = [];
        this.state.debugData = [];
        this.updateStats();
        this.updateProgress(0);
        this.updateButtonStates();

        this.setStatus('PDF解析を開始しています...', 'loading');

        try {
            // 抽出オプションを設定
            const options = {
                mode: this.elements.textExtractionMode?.value || CONFIG.EXTRACTION.modes.IMPROVED,
                confidenceThreshold: parseInt(this.elements.confidenceThreshold?.value || CONFIG.PARSING.confidence.minThreshold),
                minQuestionLength: parseInt(this.elements.questionMinLength?.value || CONFIG.PARSING.minQuestionLength),
                debugMode: this.elements.enableDebugMode?.checked || false
            };

            console.log('抽出オプション:', options);

            // 進捗コールバック
            const progressCallback = (progress) => {
                const percent = (progress.completed / progress.total) * 100;
                this.updateProgress(percent, `${progress.currentFile} を処理中... (${progress.completed}/${progress.total})`);
                
                // デバッグデータを収集
                if (progress.result) {
                    this.state.debugData.push({
                        fileName: progress.currentFile,
                        result: progress.result
                    });
                }
            };

            // 複数ファイルを並列処理
            const files = this.state.uploadedFiles.map(f => f.file);
            const extractionResults = await PDFExtractor.extractFromMultipleFiles(files, options, progressCallback);

            // 各ファイルから問題をパース
            for (const { file, result } of extractionResults) {
                if (result.success && result.cleanedText) {
                    try {
                        const parsingResult = QuestionParser.parseQuestions(
                            result.cleanedText, 
                            file.name, 
                            options
                        );
                        
                        this.state.extractedData.push(...parsingResult.questions);
                        
                        // デバッグ情報を更新
                        const debugEntry = this.state.debugData.find(d => d.fileName === file.name);
                        if (debugEntry) {
                            debugEntry.parsingResult = parsingResult;
                        }
                        
                    } catch (parseError) {
                        Utils.logError('問題パースエラー', parseError, { fileName: file.name });
                    }
                }
            }

            // 統計計算
            this.state.extractionStats = PDFExtractor.calculateExtractionStats(extractionResults);

            this.updateStats();
            this.updateProgress(100, '抽出完了');
            this.setStatus(`抽出完了！合計 ${this.state.extractedData.length} 問を抽出しました。`, 'success');

        } catch (error) {
            Utils.logError('抽出処理エラー', error);
            this.setStatus('抽出処理でエラーが発生しました: ' + error.message, 'error');
        } finally {
            this.state.isProcessing = false;
            this.updateButtonStates();
            this.state.lastUpdate = new Date();
        }
    },

    /**
     * CSVダウンロード
     */
    downloadCSV: function() {
        if (this.state.extractedData.length === 0) {
            this.setStatus('ダウンロードする問題がありません。', 'warning');
            return;
        }

        try {
            const csvData = [CONFIG.EXPORT.csv.headers];
            
            for (const q of this.state.extractedData) {
                csvData.push([
                    q.id,
                    q.section,
                    q.year,
                    q.questionNumber,
                    Utils.escapeCsvField(q.question),
                    q.answer,
                    Utils.escapeCsvField(q.explanation),
                    Utils.escapeCsvField(q.source),
                    q.extractionMethod || 'unknown',
                    q.confidence || 'N/A',
                    Utils.formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss')
                ]);
            }

            const csvString = csvData.map(row => row.join(',')).join('\n');
            const filename = `宅建問題集_${Utils.formatDate(new Date(), 'YYYY-MM-DD')}.csv`;
            
            Utils.downloadFile('\ufeff' + csvString, filename, 'text/csv;charset=utf-8');
            this.setStatus(`CSVファイルをダウンロードしました。(${this.state.extractedData.length}問)`, 'success');

        } catch (error) {
            Utils.logError('CSV出力エラー', error);
            this.setStatus('CSVダウンロードでエラーが発生しました。', 'error');
        }
    },

    /**
     * プレビュー表示
     */
    showPreview: function() {
        if (this.state.extractedData.length === 0) {
            this.setStatus('表示する問題がありません。', 'warning');
            return;
        }

        // セクション別に分類
        const sections = {};
        for (const q of this.state.extractedData) {
            if (!sections[q.section]) {
                sections[q.section] = [];
            }
            sections[q.section].push(q);
        }

        let html = '';
        const maxPreview = CONFIG.UI.maxPreviewQuestions;

        for (const [sectionName, questions] of Object.entries(sections)) {
            html += `<div class="section-header">${sectionName} (${questions.length}問)</div>`;

            const displayQuestions = questions.slice(0, maxPreview);
            for (const q of displayQuestions) {
                html += `
                    <div class="question-item">
                        <div class="question-header">
                            <span class="question-number">問 ${q.questionNumber}</span>
                            <span class="answer-badge ${q.answer === '〇' ? 'answer-correct' : 'answer-incorrect'}">${q.answer}</span>
                        </div>
                        <div class="question-text">${Utils.escapeHtml(q.question)}</div>
                        <div class="explanation">${Utils.escapeHtml(q.explanation)}</div>
                        <div class="question-meta">
                            抽出方法: ${q.extractionMethod || 'unknown'} | 
                            信頼度: ${q.confidence || 'N/A'}% |
                            ソース: ${Utils.escapeHtml(q.source)}
                        </div>
                    </div>
                `;
            }

            if (questions.length > maxPreview) {
                html += `<div style="text-align: center; color: #718096; margin: 10px 0;">
                    他 ${questions.length - maxPreview} 問... (プレビューは${maxPreview}問まで)
                </div>`;
            }
        }

        if (this.elements.preview) {
            this.elements.preview.innerHTML = html;
            this.elements.preview.style.display = 'block';
        }

        this.setStatus('プレビューを表示しました。', 'success');
    },

    /**
     * デバッグ情報表示
     */
    showDebugInfo: function() {
        if (this.state.debugData.length === 0) {
            this.setStatus('デバッグ情報がありません。', 'warning');
            return;
        }

        const debugInfo = PDFExtractor.generateDebugInfo(
            this.state.debugData.map(d => ({ file: { name: d.fileName }, result: d.result }))
        );

        let output = '=== 宅建PDF抽出システム デバッグ情報 ===\n\n';
        output += `生成日時: ${debugInfo.timestamp}\n`;
        output += `システム情報: ${debugInfo.system.userAgent}\n`;
        output += `PDF.js バージョン: ${debugInfo.system.pdfJsVersion}\n\n`;

        if (debugInfo.system.memoryUsage !== 'unavailable') {
            output += `メモリ使用量: ${debugInfo.system.memoryUsage.used} / ${debugInfo.system.memoryUsage.total}\n\n`;
        }

        output += '=== 設定 ===\n';
        output += `抽出モード: ${debugInfo.config.extractionMode}\n`;
        output += `信頼度閾値: ${debugInfo.config.confidenceThreshold}%\n`;
        output += `デバッグモード: ${debugInfo.config.debugMode}\n\n`;

        output += '=== 処理統計 ===\n';
        const stats = debugInfo.statistics;
        output += `処理ファイル数: ${stats.totalFiles}\n`;
        output += `成功: ${stats.successfulFiles}, 失敗: ${stats.failedFiles}\n`;
        output += `総ページ数: ${stats.totalPages}\n`;
        output += `平均品質: ${stats.averageQuality.toFixed(1)}%\n`;
        output += `処理時間: ${stats.processingTime.toFixed(2)}ms\n\n`;

        output += '=== ファイル詳細 ===\n';
        for (const fileInfo of debugInfo.files) {
            output += `\nファイル: ${fileInfo.name}\n`;
            output += `  サイズ: ${fileInfo.size}\n`;
            output += `  ページ数: ${fileInfo.pages}\n`;
            output += `  抽出文字数: ${fileInfo.textLength}\n`;
            output += `  品質: ${fileInfo.quality}%\n`;
            output += `  抽出方法: ${fileInfo.method}\n`;
            output += `  処理時間: ${fileInfo.processingTime.toFixed(2)}ms\n`;
            if (fileInfo.issues.length > 0) {
                output += `  問題: ${fileInfo.issues.join(', ')}\n`;
            }
            if (fileInfo.error) {
                output += `  エラー: ${fileInfo.error}\n`;
            }
        }

        if (this.elements.debugInfo) {
            this.elements.debugInfo.textContent = output;
            this.elements.debugInfo.style.display = 'block';
        }

        this.setStatus('デバッグ情報を表示しました。', 'success');
    },

    /**
     * 詳細レポート表示
     */
    showReport: function() {
        if (this.state.extractedData.length === 0) {
            this.setStatus('レポートを生成する問題がありません。', 'warning');
            return;
        }

        const report = this.generateDetailedReport();

        if (this.elements.report) {
            this.elements.report.innerHTML = report;
            this.elements.report.style.display = 'block';
        }

        this.setStatus('詳細レポートを表示しました。', 'success');
    },

    /**
     * 詳細レポートを生成
     */
    generateDetailedReport: function() {
        const data = this.state.extractedData;
        const stats = this.state.extractionStats;

        let html = '<div class="report-section">';
        html += '<h4>📊 抽出結果サマリー</h4>';
        html += `<p>総問題数: <strong>${data.length}</strong></p>`;
        html += `<p>正解問題: <strong>${data.filter(q => q.answer === '〇').length}</strong></p>`;
        html += `<p>不正解問題: <strong>${data.filter(q => q.answer === '×').length}</strong></p>`;
        html += `<p>平均信頼度: <strong>${(data.reduce((sum, q) => sum + (q.confidence || 0), 0) / data.length).toFixed(1)}%</strong></p>`;
        html += '</div>';

        // セクション別統計
        const sectionStats = {};
        for (const q of data) {
            if (!sectionStats[q.section]) {
                sectionStats[q.section] = { total: 0, correct: 0, avgConfidence: 0 };
            }
            sectionStats[q.section].total++;
            if (q.answer === '〇') sectionStats[q.section].correct++;
        }

        html += '<div class="report-section">';
        html += '<h4>📚 セクション別統計</h4>';
        html += '<table style="width: 100%; border-collapse: collapse;">';
        html += '<tr style="background: #f5f5f5;"><th style="padding: 8px; border: 1px solid #ddd;">セクション</th><th style="padding: 8px; border: 1px solid #ddd;">問題数</th><th style="padding: 8px; border: 1px solid #ddd;">正解率</th></tr>';
        
        for (const [section, stat] of Object.entries(sectionStats)) {
            const correctRate = ((stat.correct / stat.total) * 100).toFixed(1);
            html += `<tr><td style="padding: 8px; border: 1px solid #ddd;">${section}</td><td style="padding: 8px; border: 1px solid #ddd;">${stat.total}</td><td style="padding: 8px; border: 1px solid #ddd;">${correctRate}%</td></tr>`;
        }
        html += '</table>';
        html += '</div>';

        // 品質分析
        const qualityIssues = data.filter(q => q.confidence < 70);
        if (qualityIssues.length > 0) {
            html += '<div class="report-section">';
            html += '<h4>⚠️ 品質要注意問題</h4>';
            html += `<p>${qualityIssues.length}問で信頼度が70%未満です。</p>`;
            html += '<ul>';
            for (const q of qualityIssues.slice(0, 10)) {
                html += `<li>問${q.questionNumber} (${q.section}): ${q.confidence}% - ${Utils.truncateString(q.question, 50)}</li>`;
            }
            if (qualityIssues.length > 10) {
                html += `<li>... 他${qualityIssues.length - 10}問</li>`;
            }
            html += '</ul>';
            html += '</div>';
        }

        // 処理統計
        if (stats) {
            html += '<div class="report-section">';
            html += '<h4>⚙️ 処理統計</h4>';
            html += `<p>処理ファイル数: ${stats.totalFiles}</p>`;
            html += `<p>成功ファイル数: ${stats.successfulFiles}</p>`;
            html += `<p>総処理ページ数: ${stats.totalPages}</p>`;
            html += `<p>総処理時間: ${stats.processingTime.toFixed(2)}ms</p>`;
            html += '</div>';
        }

        return html;
    },

    /**
     * キーボードショートカット処理
     */
    handleKeyboardShortcuts: function(event) {
        if (event.ctrlKey || event.metaKey) {
            switch (event.key) {
                case 'o':
                    event.preventDefault();
                    this.elements.pdfInput?.click();
                    break;
                case 's':
                    event.preventDefault();
                    if (this.state.extractedData.length > 0) {
                        this.downloadCSV();
                    }
                    break;
                case 'r':
                    event.preventDefault();
                    if (this.state.uploadedFiles.length > 0 && !this.state.isProcessing) {
                        this.extractFromPDFs();
                    }
                    break;
            }
        }
    },

    /**
     * ウィンドウリサイズ処理
     */
    handleResize: function() {
        // 必要に応じてレイアウト調整
        console.log('ウィンドウリサイズ');
    },

    /**
     * ページ離脱前処理
     */
    handleBeforeUnload: function(event) {
        if (this.state.isProcessing) {
            event.preventDefault();
            event.returnValue = '処理中です。本当にページを離れますか？';
        }

        // 設定を保存
        this.saveSettings();
    },

    /**
     * エラーハンドリング
     */
    handleError: function(error, context = {}) {
        Utils.logError('アプリケーションエラー', error, context);
        this.setStatus('エラーが発生しました: ' + error.message, 'error');
        this.state.isProcessing = false;
        this.updateButtonStates();
    }
};

// グローバルエクスポート（HTMLから参照するため）
window.app = TakkenApp;

// DOM読み込み完了時に初期化
document.addEventListener('DOMContentLoaded', function() {
    try {
        TakkenApp.init();
    } catch (error) {
        console.error('アプリケーション初期化エラー:', error);
        alert('アプリケーションの初期化に失敗しました。ページをリロードしてください。');
    }
});
