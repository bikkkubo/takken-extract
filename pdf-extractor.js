
/**
 * 宅建PDF抽出システム - PDF抽出エンジン
 * PDF.jsを使用した高精度テキスト抽出
 */

const PDFExtractor = {
    /**
     * PDFファイルからテキストを抽出
     * @param {File} file - PDFファイル
     * @param {object} options - 抽出オプション
     * @returns {Promise<object>} 抽出結果
     */
    async extractFromFile(file, options = {}) {
        try {
            // ファイル検証
            if (!Utils.validateFileType(file)) {
                throw new Error(CONFIG.MESSAGES.errors.invalidFileType);
            }

            if (!Utils.validateFileSize(file)) {
                throw new Error(CONFIG.MESSAGES.errors.fileTooBig);
            }

            // PDF.js の初期化確認
            if (typeof pdfjsLib === 'undefined') {
                throw new Error(CONFIG.MESSAGES.errors.pdfNotSupported);
            }

            const extractionMode = options.mode || Utils.getNestedValue(
                document.getElementById('textExtractionMode'), 
                'value', 
                CONFIG.EXTRACTION.modes.IMPROVED
            );

            console.log(`PDF抽出開始: ${file.name} (モード: ${extractionMode})`);

            // PDFを読み込み
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await this.loadPDF(arrayBuffer);

            // メタデータを取得
            const metadata = await this.extractMetadata(pdf);

            // 全ページからテキストを抽出
            const extractionResult = await this.extractAllPages(pdf, extractionMode, options);

            // 品質評価
            const quality = TextCleaner.evaluateTextQuality(extractionResult.cleanedText);

            const result = {
                success: true,
                extractedText: extractionResult.rawText,
                cleanedText: extractionResult.cleanedText,
                metadata: metadata,
                extractionMethod: extractionMode,
                quality: quality,
                pageCount: pdf.numPages,
                processingTime: extractionResult.processingTime,
                error: null
            };

            console.log(`PDF抽出完了: ${file.name} - ${result.pageCount}ページ, 品質: ${quality.confidence}%`);
            return result;

        } catch (error) {
            Utils.logError('PDF抽出エラー', error, { fileName: file.name });
            return {
                success: false,
                extractedText: '',
                cleanedText: '',
                metadata: null,
                extractionMethod: 'error',
                quality: { score: 0, issues: [error.message], confidence: 0 },
                pageCount: 0,
                processingTime: 0,
                error: error.message
            };
        }
    },

    /**
     * PDFドキュメントを読み込み
     * @param {ArrayBuffer} arrayBuffer - PDFデータ
     * @returns {Promise<object>} PDFドキュメント
     */
    async loadPDF(arrayBuffer) {
        const loadingTask = pdfjsLib.getDocument({
            data: arrayBuffer,
            ...CONFIG.PDFJS
        });

        // 読み込み進捗の監視
        loadingTask.onProgress = (progress) => {
            if (progress.total > 0) {
                const percent = (progress.loaded / progress.total) * 100;
                console.log(`PDF読み込み進捗: ${percent.toFixed(1)}%`);
            }
        };

        return await loadingTask.promise;
    },

    /**
     * PDFメタデータを抽出
     * @param {object} pdf - PDFドキュメント
     * @returns {Promise<object>} メタデータ
     */
    async extractMetadata(pdf) {
        try {
            const metadata = await pdf.getMetadata();
            const info = metadata.info || {};
            
            return {
                title: info.Title || '',
                author: info.Author || '',
                subject: info.Subject || '',
                creator: info.Creator || '',
                producer: info.Producer || '',
                creationDate: info.CreationDate || null,
                modificationDate: info.ModDate || null,
                pageCount: pdf.numPages,
                pdfVersion: metadata.metadata ? metadata.metadata.get('pdf:PDFVersion') : null,
                isEncrypted: pdf.isEncrypted || false
            };
        } catch (error) {
            Utils.logError('メタデータ抽出エラー', error);
            return {
                pageCount: pdf.numPages,
                isEncrypted: pdf.isEncrypted || false
            };
        }
    },

    /**
     * 全ページからテキストを抽出
     * @param {object} pdf - PDFドキュメント
     * @param {string} extractionMode - 抽出モード
     * @param {object} options - オプション
     * @returns {Promise<object>} 抽出結果
     */
    async extractAllPages(pdf, extractionMode, options = {}) {
        const startTime = performance.now();
        const maxPages = CONFIG.EXTRACTION.maxPages || pdf.numPages;
        const pagesToProcess = Math.min(pdf.numPages, maxPages);
        
        let rawText = '';
        let pageTexts = [];
        const pageQualities = [];

        console.log(`${pagesToProcess}ページを処理開始`);

        // 並列処理の制御
        const concurrency = Math.min(3, navigator.hardwareConcurrency || 2);
        const chunks = Utils.chunkArray(
            Array.from({length: pagesToProcess}, (_, i) => i + 1), 
            Math.ceil(pagesToProcess / concurrency)
        );

        for (const chunk of chunks) {
            const promises = chunk.map(pageNum => 
                this.extractSinglePage(pdf, pageNum, extractionMode, options)
            );
            
            const results = await Promise.all(promises);
            
            for (let i = 0; i < results.length; i++) {
                const result = results[i];
                const pageNum = chunk[i];
                
                if (result.success) {
                    pageTexts[pageNum - 1] = result.text;
                    rawText += result.text + '\n\n';
                    pageQualities.push(result.quality);
                } else {
                    console.warn(`ページ ${pageNum} の抽出に失敗:`, result.error);
                    pageTexts[pageNum - 1] = '';
                    pageQualities.push({ score: 0, issues: [result.error] });
                }
            }

            // 少し待機して CPU 負荷を軽減
            if (chunk !== chunks[chunks.length - 1]) {
                await Utils.sleep(50);
            }
        }

        // テキストのクリーニング
        const cleanedText = TextCleaner.cleanJapaneseText(rawText);
        
        const processingTime = performance.now() - startTime;
        console.log(`テキスト抽出完了: ${processingTime.toFixed(2)}ms`);

        return {
            rawText: rawText,
            cleanedText: cleanedText,
            pageTexts: pageTexts,
            pageQualities: pageQualities,
            processingTime: processingTime
        };
    },

    /**
     * 単一ページからテキストを抽出
     * @param {object} pdf - PDFドキュメント
     * @param {number} pageNum - ページ番号
     * @param {string} extractionMode - 抽出モード
     * @param {object} options - オプション
     * @returns {Promise<object>} ページ抽出結果
     */
    async extractSinglePage(pdf, pageNum, extractionMode, options = {}) {
        try {
            const page = await pdf.getPage(pageNum);
            
            // レイアウト保持のため、ブロック情報を取得
            const textContent = await page.getTextContent({
                normalizeWhitespace: false,
                disableCombineTextItems: false,
                includeMarkedContent: true
            });
            
            // ブロック単位でテキストを再構築（レイアウト保持）
            const blocks = this.extractTextBlocks(textContent);
            Utils.debugLog.log(`ページ ${pageNum}: ${blocks.length}ブロック抽出`);

            // レンダリング情報も取得（将来的な機能拡張用）
            let renderInfo = null;
            if (options.includeRenderInfo) {
                try {
                    const viewport = page.getViewport({ scale: 1.0 });
                    renderInfo = {
                        width: viewport.width,
                        height: viewport.height,
                        rotation: viewport.rotation
                    };
                } catch (error) {
                    console.warn(`ページ ${pageNum} のレンダリング情報取得失敗:`, error);
                }
            }

            // 抽出モードに応じてテキストを処理
            let extractedText = '';
            switch (extractionMode) {
                case CONFIG.EXTRACTION.modes.IMPROVED:
                    extractedText = TextCleaner.extractTextImproved(textContent);
                    break;
                case CONFIG.EXTRACTION.modes.STRUCTURED:
                    extractedText = TextCleaner.extractTextStructured(textContent);
                    break;
                case CONFIG.EXTRACTION.modes.ADAPTIVE:
                    extractedText = TextCleaner.extractTextAdaptive(textContent);
                    break;
                case CONFIG.EXTRACTION.modes.SIMPLE:
                default:
                    extractedText = TextCleaner.extractTextSimple(textContent);
                    break;
            }

            // ページテキストの品質評価
            const quality = TextCleaner.evaluateTextQuality(extractedText);

            return {
                success: true,
                text: extractedText,
                quality: quality,
                renderInfo: renderInfo,
                itemCount: textContent.items.length,
                error: null
            };

        } catch (error) {
            Utils.logError(`ページ ${pageNum} 抽出エラー`, error);
            return {
                success: false,
                text: '',
                quality: { score: 0, issues: [error.message], confidence: 0 },
                renderInfo: null,
                itemCount: 0,
                error: error.message
            };
        }
    },

    /**
     * 複数ファイルを並列処理
     * @param {Array<File>} files - ファイル配列
     * @param {object} options - オプション
     * @param {Function} progressCallback - 進捗コールバック
     * @returns {Promise<Array>} 抽出結果配列
     */
    async extractFromMultipleFiles(files, options = {}, progressCallback = null) {
        const results = [];
        const concurrency = CONFIG.UI.maxConcurrentFiles;
        
        console.log(`${files.length}ファイルの並列処理開始 (並列数: ${concurrency})`);

        // ファイルをチャンクに分割
        const chunks = Utils.chunkArray(files, concurrency);
        let completedFiles = 0;

        for (const chunk of chunks) {
            const promises = chunk.map(async (file, index) => {
                try {
                    const result = await this.extractFromFile(file, options);
                    completedFiles++;
                    
                    if (progressCallback) {
                        progressCallback({
                            completed: completedFiles,
                            total: files.length,
                            currentFile: file.name,
                            result: result
                        });
                    }
                    
                    return {
                        file: file,
                        result: result,
                        index: files.indexOf(file)
                    };
                } catch (error) {
                    completedFiles++;
                    Utils.logError('ファイル処理エラー', error, { fileName: file.name });
                    
                    const errorResult = {
                        success: false,
                        error: error.message,
                        extractedText: '',
                        cleanedText: ''
                    };

                    if (progressCallback) {
                        progressCallback({
                            completed: completedFiles,
                            total: files.length,
                            currentFile: file.name,
                            result: errorResult
                        });
                    }

                    return {
                        file: file,
                        result: errorResult,
                        index: files.indexOf(file)
                    };
                }
            });

            const chunkResults = await Promise.all(promises);
            results.push(...chunkResults);

            // CPU負荷軽減のため少し待機
            if (chunk !== chunks[chunks.length - 1]) {
                await Utils.sleep(100);
            }
        }

        // 元の順序でソート
        results.sort((a, b) => a.index - b.index);
        
        console.log(`並列処理完了: ${results.length}ファイル`);
        return results.map(item => ({
            file: item.file,
            result: item.result
        }));
    },

    /**
     * 抽出統計情報を計算
     * @param {Array} extractionResults - 抽出結果配列
     * @returns {object} 統計情報
     */
    calculateExtractionStats(extractionResults) {
        const stats = {
            totalFiles: extractionResults.length,
            successfulFiles: 0,
            failedFiles: 0,
            totalPages: 0,
            totalTextLength: 0,
            averageQuality: 0,
            qualityDistribution: {
                high: 0,    // 80%以上
                medium: 0,  // 50-79%
                low: 0      // 50%未満
            },
            extractionMethods: {},
            processingTime: 0,
            issues: []
        };

        for (const item of extractionResults) {
            const result = item.result;
            
            if (result.success) {
                stats.successfulFiles++;
                stats.totalPages += result.pageCount || 0;
                stats.totalTextLength += result.cleanedText.length;
                stats.processingTime += result.processingTime || 0;

                // 品質分布
                const quality = result.quality.confidence || 0;
                if (quality >= 80) {
                    stats.qualityDistribution.high++;
                } else if (quality >= 50) {
                    stats.qualityDistribution.medium++;
                } else {
                    stats.qualityDistribution.low++;
                }

                // 抽出方法の統計
                const method = result.extractionMethod || 'unknown';
                stats.extractionMethods[method] = (stats.extractionMethods[method] || 0) + 1;

                // 品質問題の収集
                if (result.quality.issues && result.quality.issues.length > 0) {
                    stats.issues.push({
                        file: item.file.name,
                        issues: result.quality.issues
                    });
                }
            } else {
                stats.failedFiles++;
                stats.issues.push({
                    file: item.file.name,
                    issues: [result.error || '不明なエラー']
                });
            }
        }

        // 平均品質の計算
        if (stats.successfulFiles > 0) {
            const totalQuality = extractionResults
                .filter(item => item.result.success)
                .reduce((sum, item) => sum + (item.result.quality.confidence || 0), 0);
            stats.averageQuality = totalQuality / stats.successfulFiles;
        }

        return stats;
    },

    /**
     * デバッグ情報を生成
     * @param {Array} extractionResults - 抽出結果配列
     * @returns {object} デバッグ情報
     */
    generateDebugInfo(extractionResults) {
        const debug = {
            timestamp: new Date().toISOString(),
            system: {
                userAgent: navigator.userAgent,
                pdfJsVersion: pdfjsLib?.version || 'unknown',
                memoryUsage: performance.memory ? {
                    used: Utils.formatFileSize(performance.memory.usedJSHeapSize),
                    total: Utils.formatFileSize(performance.memory.totalJSHeapSize),
                    limit: Utils.formatFileSize(performance.memory.jsHeapSizeLimit)
                } : 'unavailable'
            },
            config: {
                extractionMode: Utils.getNestedValue(document.getElementById('textExtractionMode'), 'value'),
                confidenceThreshold: Utils.getNestedValue(document.getElementById('confidenceThreshold'), 'value'),
                debugMode: Utils.getNestedValue(document.getElementById('enableDebugMode'), 'checked')
            },
            files: extractionResults.map(item => ({
                name: item.file.name,
                size: Utils.formatFileSize(item.file.size),
                success: item.result.success,
                pages: item.result.pageCount || 0,
                textLength: item.result.cleanedText.length,
                quality: item.result.quality.confidence || 0,
                method: item.result.extractionMethod,
                processingTime: item.result.processingTime || 0,
                issues: item.result.quality.issues || [],
                error: item.result.error
            })),
            statistics: this.calculateExtractionStats(extractionResults)
        };

        return debug;
    },

    /**
     * テキストコンテンツからブロック単位でテキストを抽出
     * @param {object} textContent - PDF.jsのgetTextContent()の結果
     * @returns {Array} ブロック配列
     */
    extractTextBlocks(textContent) {
        if (!textContent || !textContent.items) {
            return [];
        }

        // アイテムを座標でソート（Y座標 → X座標の順）
        const sortedItems = textContent.items
            .map((item, index) => ({
                ...item,
                originalIndex: index,
                x: item.transform[4],
                y: item.transform[5],
                width: item.width,
                height: item.height
            }))
            .sort((a, b) => {
                // Y座標で降順ソート（上から下へ）
                const yDiff = Math.round(b.y) - Math.round(a.y);
                if (Math.abs(yDiff) > 2) { // 2ピクセルの閾値
                    return yDiff;
                }
                // 同じ行内では X座標で昇順ソート（左から右へ）
                return Math.round(a.x) - Math.round(b.x);
            });

        // ブロックにグループ化
        const blocks = [];
        let currentBlock = [];
        let lastY = null;
        const lineHeightThreshold = 5; // 行間の閾値

        for (const item of sortedItems) {
            const currentY = Math.round(item.y);
            
            // 新しい行の判定
            if (lastY !== null && Math.abs(currentY - lastY) > lineHeightThreshold) {
                // 現在のブロックを完了
                if (currentBlock.length > 0) {
                    blocks.push(this.mergeBlockItems(currentBlock));
                    currentBlock = [];
                }
            }
            
            currentBlock.push(item);
            lastY = currentY;
        }

        // 最後のブロック
        if (currentBlock.length > 0) {
            blocks.push(this.mergeBlockItems(currentBlock));
        }

        Utils.debugLog.log(`ブロック抽出完了: ${blocks.length}ブロック`);
        return blocks;
    },

    /**
     * ブロック内のアイテムをマージしてテキストブロックを作成
     * @param {Array} items - 同一ブロック内のアイテム
     * @returns {object} マージされたブロック
     */
    mergeBlockItems(items) {
        if (!items || items.length === 0) {
            return { text: '', x: 0, y: 0, width: 0, height: 0 };
        }

        // テキストを結合（スペース区切り）
        const text = items
            .map(item => item.str.trim())
            .filter(str => str.length > 0)
            .join(' ');

        // 座標とサイズを計算
        const minX = Math.min(...items.map(item => item.x));
        const maxX = Math.max(...items.map(item => item.x + item.width));
        const minY = Math.min(...items.map(item => item.y));
        const maxY = Math.max(...items.map(item => item.y + item.height));

        return {
            text: text,
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
            itemCount: items.length
        };
    }
};

// グローバルエクスポート
window.PDFExtractor = PDFExtractor;
