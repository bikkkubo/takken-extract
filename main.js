
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
     * 統計情報を更新（改良版）
     */
    updateStats: function() {
        const total = this.state.extractedData.length;
        const correct = this.state.extractedData.filter(q => q.answer === '〇').length;
        const incorrect = this.state.extractedData.filter(q => q.answer === '×').length;
        const sections = new Set(this.state.extractedData.map(q => q.section)).size;
        const avgConfidence = total > 0 ? 
            this.state.extractedData.reduce((sum, q) => sum + (q.confidence || 0), 0) / total : 0;

        // 基本統計
        if (this.elements.totalQuestions) {
            this.elements.totalQuestions.textContent = total;
            this.animateNumber(this.elements.totalQuestions, total);
        }
        
        if (this.elements.correctAnswers) {
            this.elements.correctAnswers.textContent = correct;
            this.animateNumber(this.elements.correctAnswers, correct);
        }
        
        if (this.elements.incorrectAnswers) {
            this.elements.incorrectAnswers.textContent = incorrect;
            this.animateNumber(this.elements.incorrectAnswers, incorrect);
        }
        
        if (this.elements.sectionsCount) {
            this.elements.sectionsCount.textContent = sections;
            this.animateNumber(this.elements.sectionsCount, sections);
        }

        // パーセンテージ表示
        if (total > 0) {
            const correctPercentage = document.getElementById('correctPercentage');
            const incorrectPercentage = document.getElementById('incorrectPercentage');
            
            if (correctPercentage) {
                correctPercentage.textContent = `${Math.round((correct / total) * 100)}%`;
            }
            if (incorrectPercentage) {
                incorrectPercentage.textContent = `${Math.round((incorrect / total) * 100)}%`;
            }
        }

        // セクション詳細
        const sectionsDetail = document.getElementById('sectionsDetail');
        if (sectionsDetail && total > 0) {
            const sectionCounts = {};
            for (const q of this.state.extractedData) {
                sectionCounts[q.section] = (sectionCounts[q.section] || 0) + 1;
            }
            const maxSection = Object.keys(sectionCounts).reduce((a, b) => 
                sectionCounts[a] > sectionCounts[b] ? a : b
            );
            sectionsDetail.textContent = `最多: ${maxSection}`;
        }

        // 信頼度関連の更新
        this.updateConfidenceDisplay(avgConfidence);
        this.updateQualityBreakdown();
    },
    
    /**
     * 信頼度表示を更新
     * @param {number} avgConfidence - 平均信頼度
     */
    updateConfidenceDisplay: function(avgConfidence = null) {
        if (avgConfidence === null) {
            const total = this.state.extractedData.length;
            avgConfidence = total > 0 ? 
                this.state.extractedData.reduce((sum, q) => sum + (q.confidence || 0), 0) / total : 0;
        }

        const confidenceElement = this.elements.averageConfidence;
        const confidenceFill = document.getElementById('confidenceFill');
        const confidenceNumber = document.querySelector('.confidence-number');

        if (confidenceElement) {
            confidenceElement.textContent = Math.round(avgConfidence) + '%';
        }

        if (confidenceFill) {
            confidenceFill.style.width = avgConfidence + '%';
        }

        // 信頼度に応じた色変更
        if (confidenceNumber) {
            if (avgConfidence >= 80) {
                confidenceNumber.style.color = '#22c55e';
            } else if (avgConfidence >= 60) {
                confidenceNumber.style.color = '#f59e0b';
            } else {
                confidenceNumber.style.color = '#ef4444';
            }
        }
    },
    
    /**
     * 品質分類を更新
     */
    updateQualityBreakdown: function() {
        let high = 0, medium = 0, low = 0;
        
        for (const q of this.state.extractedData) {
            const confidence = q.confidence || 0;
            if (confidence >= 80) high++;
            else if (confidence >= 50) medium++;
            else low++;
        }

        const highElement = document.getElementById('highQualityCount');
        const mediumElement = document.getElementById('mediumQualityCount');
        const lowElement = document.getElementById('lowQualityCount');

        if (highElement) highElement.textContent = high;
        if (mediumElement) mediumElement.textContent = medium;
        if (lowElement) lowElement.textContent = low;
    },
    
    /**
     * 数値アニメーション
     * @param {Element} element - 対象要素
     * @param {number} targetValue - 目標値
     */
    animateNumber: function(element, targetValue) {
        if (!element || targetValue === 0) return;
        
        const startValue = parseInt(element.textContent) || 0;
        const duration = 1000;
        const startTime = performance.now();
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            const currentValue = Math.round(startValue + (targetValue - startValue) * progress);
            element.textContent = currentValue;
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
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
     * プログレスを更新（改良版）
     */
    updateProgress: function(percent, text = '', details = {}) {
        // プログレスバー
        if (this.elements.progressBar) {
            this.elements.progressBar.style.width = percent + '%';
        }
        
        // プログレステキスト
        if (this.elements.progressText && text) {
            this.elements.progressText.textContent = text;
        }
        
        // パーセンテージ表示
        const progressPercentage = document.getElementById('progressPercentage');
        if (progressPercentage) {
            progressPercentage.textContent = Math.round(percent) + '%';
        }
        
        // タイトル更新
        const progressTitle = document.getElementById('progressTitle');
        if (progressTitle) {
            if (percent === 0) {
                progressTitle.textContent = '待機中';
            } else if (percent === 100) {
                progressTitle.textContent = '完了';
            } else {
                progressTitle.textContent = 'PDF解析中';
            }
        }
        
        // 詳細情報
        if (details.completed !== undefined && details.total !== undefined) {
            const processedFiles = document.getElementById('processedFiles');
            const totalFiles = document.getElementById('totalFiles');
            
            if (processedFiles) processedFiles.textContent = details.completed;
            if (totalFiles) totalFiles.textContent = details.total;
        }
        
        // 経過時間
        if (details.startTime) {
            this.updateElapsedTime(details.startTime);
        }
        
        // 詳細ログ
        if (details.currentFile || details.status) {
            this.addProgressDetail(details.currentFile || details.status, details.type || 'info');
        }
    },
    
    /**
     * 経過時間を更新
     * @param {Date} startTime - 開始時間
     */
    updateElapsedTime: function(startTime) {
        const elapsedTime = document.getElementById('elapsedTime');
        if (!elapsedTime || !startTime) return;
        
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        
        elapsedTime.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    },
    
    /**
     * プログレス詳細を追加
     * @param {string} message - メッセージ
     * @param {string} type - タイプ
     */
    addProgressDetail: function(message, type = 'info') {
        const progressDetails = document.getElementById('progressDetails');
        if (!progressDetails) return;
        
        const timestamp = new Date().toLocaleTimeString();
        const icon = type === 'error' ? '❌' : type === 'warning' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️';
        
        const detail = document.createElement('div');
        detail.className = `progress-detail progress-detail-${type}`;
        detail.innerHTML = `<span class="detail-time">[${timestamp}]</span> ${icon} ${message}`;
        
        progressDetails.appendChild(detail);
        progressDetails.scrollTop = progressDetails.scrollHeight;
        
        // 最大100エントリまで保持
        while (progressDetails.children.length > 100) {
            progressDetails.removeChild(progressDetails.firstChild);
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
     * PDFからデータを抽出（改良版エラーハンドリング付き）
     */
    async extractFromPDFs() {
        if (this.state.uploadedFiles.length === 0) {
            this.setStatus('PDFファイルを先にアップロードしてください。', 'error');
            return;
        }

        // 処理開始の準備
        this.state.isProcessing = true;
        this.state.extractedData = [];
        this.state.debugData = [];
        this.state.startTime = new Date();
        const startTime = Date.now();
        
        this.updateStats();
        this.updateProgress(0, '', { 
            completed: 0, 
            total: this.state.uploadedFiles.length,
            startTime: this.state.startTime
        });
        this.updateButtonStates();

        this.setStatus('PDF解析を開始しています...', 'loading');
        this.addProgressDetail('処理を開始しました', 'info');

        try {
            // 事前検証
            const validationResult = this.validateInputs();
            if (!validationResult.valid) {
                throw new Error(validationResult.message);
            }

            // 抽出オプションを設定
            const options = {
                mode: this.elements.textExtractionMode?.value || CONFIG.EXTRACTION.modes.IMPROVED,
                confidenceThreshold: parseInt(this.elements.confidenceThreshold?.value || CONFIG.PARSING.confidence.minThreshold),
                minQuestionLength: parseInt(this.elements.questionMinLength?.value || CONFIG.PARSING.minQuestionLength),
                debugMode: this.elements.enableDebugMode?.checked || false
            };

            console.log('抽出オプション:', options);
            this.addProgressDetail(`抽出モード: ${options.mode}, 信頼度閾値: ${options.confidenceThreshold}%`, 'info');

            // 改良された進捗コールバック
            const progressCallback = (progress) => {
                const percent = (progress.completed / progress.total) * 100;
                
                this.updateProgress(percent, `${progress.currentFile} を処理中...`, {
                    completed: progress.completed,
                    total: progress.total,
                    startTime: this.state.startTime,
                    currentFile: `ファイル処理: ${progress.currentFile}`,
                    type: progress.result?.success ? 'success' : 'warning'
                });
                
                // デバッグデータを収集
                if (progress.result) {
                    this.state.debugData.push({
                        fileName: progress.currentFile,
                        result: progress.result
                    });
                    
                    // 各ファイルの処理結果をログ
                    if (progress.result.success) {
                        this.addProgressDetail(
                            `${progress.currentFile}: ${progress.result.pageCount}ページ、品質${progress.result.quality.confidence}%`, 
                            'success'
                        );
                    } else {
                        this.addProgressDetail(
                            `${progress.currentFile}: 処理エラー - ${progress.result.error}`, 
                            'error'
                        );
                    }
                }
            };

            // 複数ファイルを並列処理
            const files = this.state.uploadedFiles.map(f => f.file);
            let extractionResults;
            
            try {
                extractionResults = await PDFExtractor.extractFromMultipleFiles(files, options, progressCallback);
            } catch (extractionError) {
                throw new Error(`PDF抽出エラー: ${extractionError.message}`);
            }

            this.addProgressDetail('PDF抽出完了、問題解析を開始します', 'info');
            let totalQuestions = 0;
            let successfulFiles = 0;
            let failedFiles = 0;

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
                        totalQuestions += parsingResult.questions.length;
                        successfulFiles++;
                        
                        // デバッグ情報を更新
                        const debugEntry = this.state.debugData.find(d => d.fileName === file.name);
                        if (debugEntry) {
                            debugEntry.parsingResult = parsingResult;
                        }
                        
                        this.addProgressDetail(
                            `${file.name}: ${parsingResult.questions.length}問を抽出`, 
                            'success'
                        );
                        
                    } catch (parseError) {
                        failedFiles++;
                        Utils.logError('問題パースエラー', parseError, { fileName: file.name });
                        this.addProgressDetail(
                            `${file.name}: パースエラー - ${parseError.message}`, 
                            'error'
                        );
                    }
                } else {
                    failedFiles++;
                    this.addProgressDetail(
                        `${file.name}: PDF読み込み失敗 - ${result.error || '不明なエラー'}`, 
                        'error'
                    );
                }
            }

            // 統計計算
            this.state.extractionStats = PDFExtractor.calculateExtractionStats(extractionResults);

            // 最終結果の評価
            const processingTime = Date.now() - startTime;
            this.evaluateExtractionResults(successfulFiles, failedFiles, totalQuestions, processingTime);

            this.updateStats();
            this.updateProgress(100, '抽出完了', {
                completed: this.state.uploadedFiles.length,
                total: this.state.uploadedFiles.length,
                status: '全ての処理が完了しました',
                type: 'success'
            });

        } catch (error) {
            this.handleExtractionError(error);
        } finally {
            this.state.isProcessing = false;
            this.updateButtonStates();
            this.state.lastUpdate = new Date();
        }
    },
    
    /**
     * 入力検証
     * @returns {object} 検証結果
     */
    validateInputs: function() {
        const files = this.state.uploadedFiles;
        
        if (files.length === 0) {
            return { valid: false, message: 'PDFファイルがアップロードされていません' };
        }
        
        // ファイルサイズチェック
        const totalSize = files.reduce((sum, f) => sum + f.file.size, 0);
        const maxTotalSize = CONFIG.UI.maxFileSizeMB * 1024 * 1024 * files.length;
        
        if (totalSize > maxTotalSize) {
            return { 
                valid: false, 
                message: `ファイルサイズが大きすぎます (${Utils.formatFileSize(totalSize)} > ${Utils.formatFileSize(maxTotalSize)})` 
            };
        }
        
        // PDF.js の可用性チェック
        if (typeof pdfjsLib === 'undefined') {
            return { valid: false, message: 'PDF.jsライブラリが読み込まれていません' };
        }
        
        return { valid: true };
    },
    
    /**
     * 抽出結果を評価
     * @param {number} successfulFiles - 成功ファイル数
     * @param {number} failedFiles - 失敗ファイル数 
     * @param {number} totalQuestions - 総問題数
     * @param {number} processingTime - 処理時間
     */
    evaluateExtractionResults: function(successfulFiles, failedFiles, totalQuestions, processingTime) {
        const totalFiles = successfulFiles + failedFiles;
        const successRate = totalFiles > 0 ? (successfulFiles / totalFiles) * 100 : 0;
        
        let statusMessage = '';
        let statusType = 'success';
        
        if (totalQuestions === 0) {
            statusMessage = '問題が抽出できませんでした。PDFの形式や内容を確認してください。';
            statusType = 'error';
        } else if (failedFiles === 0) {
            statusMessage = `抽出完了！合計 ${totalQuestions} 問を抽出しました。(処理時間: ${(processingTime/1000).toFixed(1)}秒)`;
            statusType = 'success';
        } else if (successRate >= 50) {
            statusMessage = `抽出完了！${totalQuestions} 問を抽出しました。${failedFiles}個のファイルで問題が発生しました。`;
            statusType = 'warning';
        } else {
            statusMessage = `抽出完了しましたが、多くのファイルで問題が発生しました。詳細はデバッグ情報を確認してください。`;
            statusType = 'warning';
        }
        
        this.setStatus(statusMessage, statusType);
        this.addProgressDetail(
            `処理結果: 成功${successfulFiles}件、失敗${failedFiles}件、問題数${totalQuestions}`, 
            statusType === 'error' ? 'error' : 'success'
        );
    },
    
    /**
     * 抽出エラーハンドリング
     * @param {Error} error - エラーオブジェクト
     */
    handleExtractionError: function(error) {
        Utils.logError('抽出処理エラー', error);
        
        let userMessage = 'PDF抽出処理でエラーが発生しました。';
        
        // エラータイプに応じたメッセージ
        if (error.message.includes('PDF抽出エラー')) {
            userMessage = 'PDFファイルの読み込みに失敗しました。ファイルが破損している可能性があります。';
        } else if (error.message.includes('メモリ')) {
            userMessage = 'メモリ不足です。より少ないファイル数で処理するか、ファイルサイズを小さくしてください。';
        } else if (error.message.includes('ネットワーク')) {
            userMessage = 'ネットワークエラーです。接続を確認して再試行してください。';
        } else if (error.message.includes('タイムアウト')) {
            userMessage = '処理がタイムアウトしました。ファイル数を減らして再試行してください。';
        }
        
        this.setStatus(userMessage, 'error');
        this.addProgressDetail(`エラー: ${error.message}`, 'error');
        
        // 部分的な結果がある場合は保存
        if (this.state.extractedData.length > 0) {
            this.addProgressDetail(
                `部分的な結果: ${this.state.extractedData.length}問が抽出済みです`, 
                'warning'
            );
            this.updateStats();
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
