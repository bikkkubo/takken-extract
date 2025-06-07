
/**
 * 宅建PDF抽出システム - テキストクリーニングモジュール
 * 日本語PDF特有の文字化けや文字順序の問題を解決
 */

const TextCleaner = {
    /**
     * 日本語エンコーディングの修正
     * @param {string} text - 修正するテキスト
     * @returns {string} 修正されたテキスト
     */
    fixJapaneseEncoding: function(text) {
        if (!text) return '';
        
        try {
            let fixed = text;
            
            // Unicode正規化
            fixed = fixed.normalize('NFC');
            
            // 一般的な文字化けパターンの修正
            for (const [wrong, correct] of Object.entries(CONFIG.CLEANING.encodingFixes)) {
                fixed = fixed.replace(new RegExp(Utils.escapeRegExp(wrong), 'g'), correct);
            }
            
            // 日本語特有文字の正規化
            for (const [wrong, correct] of Object.entries(CONFIG.CLEANING.normalizations)) {
                fixed = fixed.replace(new RegExp(Utils.escapeRegExp(wrong), 'g'), correct);
            }
            
            // 制御文字と無効文字の除去
            for (const pattern of CONFIG.CLEANING.removePatterns) {
                fixed = fixed.replace(pattern, pattern.source.includes('\\n') ? '\n' : ' ');
            }
            
            return fixed;
        } catch (error) {
            Utils.logError('文字エンコーディング修正エラー', error, { originalText: text });
            return text;
        }
    },

    /**
     * PDF.jsのテキストアイテムから改良されたテキストを抽出
     * @param {object} textContent - PDF.jsのtextContentオブジェクト
     * @returns {string} 抽出されたテキスト
     */
    extractTextImproved: function(textContent) {
        if (!textContent || !textContent.items) {
            return '';
        }

        const lines = [];
        let currentLine = [];
        let lastY = null;
        let lastFontSize = null;
        let lastX = null;

        // テキストアイテムをY座標とX座標でソート
        const sortedItems = textContent.items
            .filter(item => item.str && item.str.trim())
            .sort((a, b) => {
                const yDiff = b.transform[5] - a.transform[5];
                if (Math.abs(yDiff) > CONFIG.EXTRACTION.yCoordinatePrecision) {
                    return yDiff > 0 ? 1 : -1;
                }
                return a.transform[4] - b.transform[4];
            });

        for (let i = 0; i < sortedItems.length; i++) {
            const item = sortedItems[i];
            const y = item.transform[5];
            const x = item.transform[4];
            const fontSize = item.transform[0] || 12;
            const text = this.fixJapaneseEncoding(item.str);

            // 新しい行の判定
            const isNewLine = lastY !== null && 
                Math.abs(y - lastY) > (lastFontSize || fontSize) * CONFIG.EXTRACTION.lineSpacingMultiplier;

            if (isNewLine && currentLine.length > 0) {
                const lineText = this.buildLineText(currentLine);
                if (lineText.trim()) {
                    lines.push(lineText);
                }
                currentLine = [];
            }

            // 文字間隔の判定
            let needsSpace = false;
            if (currentLine.length > 0 && lastX !== null) {
                const expectedNextX = lastX + (currentLine[currentLine.length - 1].estimatedWidth || fontSize * 0.6);
                const actualGap = x - expectedNextX;
                needsSpace = actualGap > fontSize * CONFIG.EXTRACTION.charSpacingMultiplier;
            }

            // テキストアイテムを追加
            if (text.trim()) {
                if (needsSpace) {
                    currentLine.push({ text: ' ', type: 'space' });
                }

                currentLine.push({
                    text: text,
                    x: x,
                    y: y,
                    fontSize: fontSize,
                    estimatedWidth: this.estimateTextWidth(text, fontSize),
                    type: 'text'
                });

                lastX = x + this.estimateTextWidth(text, fontSize);
            }

            lastY = y;
            lastFontSize = fontSize;
        }

        // 最後の行を追加
        if (currentLine.length > 0) {
            const lineText = this.buildLineText(currentLine);
            if (lineText.trim()) {
                lines.push(lineText);
            }
        }

        return lines.join('\n');
    },

    /**
     * 構造化テキスト抽出
     * @param {object} textContent - PDF.jsのtextContentオブジェクト
     * @returns {string} 抽出されたテキスト
     */
    extractTextStructured: function(textContent) {
        if (!textContent || !textContent.items) {
            return '';
        }

        const blocks = new Map();
        const yPrecision = CONFIG.EXTRACTION.yCoordinatePrecision;

        // アイテムをブロックに分類
        for (const item of textContent.items) {
            const text = this.fixJapaneseEncoding(item.str);
            if (!text.trim()) continue;

            const y = Math.round(item.transform[5] / yPrecision) * yPrecision;
            const x = Math.round(item.transform[4]);
            const fontSize = item.transform[0] || 12;

            const blockKey = `${y}`;
            if (!blocks.has(blockKey)) {
                blocks.set(blockKey, new Map());
            }

            const xMap = blocks.get(blockKey);
            if (!xMap.has(x)) {
                xMap.set(x, []);
            }

            xMap.get(x).push({
                text: text,
                fontSize: fontSize,
                x: x,
                y: y
            });
        }

        // ブロックをソートして結合
        const sortedYKeys = Array.from(blocks.keys())
            .map(key => parseFloat(key))
            .sort((a, b) => b - a);

        const lines = [];
        for (const yKey of sortedYKeys) {
            const xMap = blocks.get(yKey.toString());
            const sortedXKeys = Array.from(xMap.keys()).sort((a, b) => a - b);

            const lineTexts = [];
            for (const xKey of sortedXKeys) {
                const items = xMap.get(xKey);
                const combinedText = items.map(item => item.text).join('');
                if (combinedText.trim()) {
                    lineTexts.push(combinedText);
                }
            }

            if (lineTexts.length > 0) {
                lines.push(lineTexts.join(' '));
            }
        }

        return lines.join('\n');
    },

    /**
     * シンプルなテキスト抽出
     * @param {object} textContent - PDF.jsのtextContentオブジェクト
     * @returns {string} 抽出されたテキスト
     */
    extractTextSimple: function(textContent) {
        if (!textContent || !textContent.items) {
            return '';
        }

        return textContent.items
            .map(item => this.fixJapaneseEncoding(item.str))
            .filter(text => text && text.trim())
            .join(' ');
    },

    /**
     * 適応的テキスト抽出
     * レイアウトの複雑さに応じて最適な手法を選択
     * @param {object} textContent - PDF.jsのtextContentオブジェクト
     * @returns {string} 抽出されたテキスト
     */
    extractTextAdaptive: function(textContent) {
        if (!textContent || !textContent.items) {
            return '';
        }

        const complexity = this.analyzeLayoutComplexity(textContent);

        if (complexity.score > 0.7) {
            return this.extractTextStructured(textContent);
        } else if (complexity.score > 0.3) {
            return this.extractTextImproved(textContent);
        } else {
            return this.extractTextSimple(textContent);
        }
    },

    /**
     * レイアウトの複雑さを分析
     * @param {object} textContent - PDF.jsのtextContentオブジェクト
     * @returns {object} 複雑さの分析結果
     */
    analyzeLayoutComplexity: function(textContent) {
        const items = textContent.items.filter(item => item.str && item.str.trim());
        
        if (items.length === 0) {
            return { score: 0, factors: [] };
        }

        const factors = [];
        let score = 0;

        // Y座標のばらつき
        const yCoords = items.map(item => item.transform[5]);
        const uniqueYCoords = new Set(yCoords).size;
        const yVariation = uniqueYCoords / items.length;
        if (yVariation > 0.1) {
            score += 0.3;
            factors.push('高いY座標ばらつき');
        }

        // フォントサイズの多様性
        const fontSizes = items.map(item => item.transform[0] || 12);
        const uniqueFontSizes = new Set(fontSizes).size;
        if (uniqueFontSizes > 3) {
            score += 0.2;
            factors.push('多様なフォントサイズ');
        }

        // 文字間隔の不規則性
        const xCoords = items.map(item => item.transform[4]);
        const xDiffs = [];
        for (let i = 1; i < xCoords.length; i++) {
            xDiffs.push(Math.abs(xCoords[i] - xCoords[i-1]));
        }
        const avgXDiff = xDiffs.reduce((a, b) => a + b, 0) / xDiffs.length;
        const xVariance = xDiffs.reduce((sum, diff) => sum + Math.pow(diff - avgXDiff, 2), 0) / xDiffs.length;
        if (xVariance > 1000) {
            score += 0.3;
            factors.push('不規則な文字間隔');
        }

        // 短いテキストアイテムの多さ
        const shortItems = items.filter(item => item.str.length < 3).length;
        const shortItemRatio = shortItems / items.length;
        if (shortItemRatio > 0.3) {
            score += 0.2;
            factors.push('短いテキストアイテム多数');
        }

        return {
            score: Math.min(score, 1.0),
            factors: factors,
            stats: {
                totalItems: items.length,
                uniqueYCoords: uniqueYCoords,
                uniqueFontSizes: uniqueFontSizes,
                yVariation: yVariation,
                shortItemRatio: shortItemRatio
            }
        };
    },

    /**
     * 行テキストを構築
     * @param {Array} lineItems - 行のテキストアイテム
     * @returns {string} 構築された行テキスト
     */
    buildLineText: function(lineItems) {
        return lineItems.map(item => item.text).join('');
    },

    /**
     * テキスト幅を推定
     * @param {string} text - テキスト
     * @param {number} fontSize - フォントサイズ
     * @returns {number} 推定幅
     */
    estimateTextWidth: function(text, fontSize) {
        // 日本語文字の幅を考慮した推定
        let width = 0;
        for (const char of text) {
            if (this.isFullWidthChar(char)) {
                width += fontSize * 1.0; // 全角文字
            } else {
                width += fontSize * 0.5; // 半角文字
            }
        }
        return width;
    },

    /**
     * 全角文字かどうかを判定
     * @param {string} char - 文字
     * @returns {boolean} 全角文字かどうか
     */
    isFullWidthChar: function(char) {
        const code = char.charCodeAt(0);
        return (code >= 0x3040 && code <= 0x309F) || // ひらがな
               (code >= 0x30A0 && code <= 0x30FF) || // カタカナ
               (code >= 0x4E00 && code <= 0x9FAF) || // 漢字
               (code >= 0xFF00 && code <= 0xFFEF);   // 全角英数字
    },

    /**
     * 日本語テキストの全般的なクリーニング
     * @param {string} text - クリーニングするテキスト
     * @returns {string} クリーニングされたテキスト
     */
    cleanJapaneseText: function(text) {
        if (!text) return '';

        let cleaned = text;

        // 基本的なクリーニング
        cleaned = this.fixJapaneseEncoding(cleaned);

        // 不要な改行を整理
        cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

        // 連続するスペースを整理
        cleaned = cleaned.replace(/[ \t]{2,}/g, ' ');
        cleaned = cleaned.replace(/　{2,}/g, '　');

        // 行頭行末の空白を除去
        cleaned = cleaned.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .join('\n');

        // 日本語特有の文字を正規化
        cleaned = cleaned.replace(/[～〜]/g, '〜');
        cleaned = cleaned.replace(/[・·]/g, '・');

        // 括弧の正規化
        cleaned = cleaned.replace(/（/g, '(');
        cleaned = cleaned.replace(/）/g, ')');

        // 数字の正規化（全角→半角）
        cleaned = cleaned.replace(/[０-９]/g, function(char) {
            return String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
        });

        return cleaned;
    },

    /**
     * 問題文特有のクリーニング
     * @param {string} questionText - 問題文
     * @returns {string} クリーニングされた問題文
     */
    cleanQuestionText: function(questionText) {
        if (!questionText) return '';

        let cleaned = this.cleanJapaneseText(questionText);

        // 問題番号を除去（行頭の数字とピリオド等）
        cleaned = cleaned.replace(/^(?:問題?|第|Q|No\.?|【|〔|\()?(\d+)(?:問|】|〕|\)|\.|\s)?\s*/gm, '');

        // 不要な記号を除去
        cleaned = cleaned.replace(/^[　\s]*[・●○▲△□■◆]+[　\s]*/gm, '');

        // 複数行にまたがる問題文を結合
        const lines = cleaned.split('\n').filter(line => line.trim());
        if (lines.length > 1) {
            // 短い行は前の行に結合
            const mergedLines = [];
            let currentLine = '';

            for (const line of lines) {
                if (line.length < 20 && currentLine.length > 0) {
                    currentLine += line;
                } else {
                    if (currentLine) {
                        mergedLines.push(currentLine);
                    }
                    currentLine = line;
                }
            }

            if (currentLine) {
                mergedLines.push(currentLine);
            }

            cleaned = mergedLines.join(' ');
        }

        return cleaned.trim();
    },

    /**
     * 解説文のクリーニング
     * @param {string} explanationText - 解説文
     * @returns {string} クリーニングされた解説文
     */
    cleanExplanationText: function(explanationText) {
        if (!explanationText) return '';

        let cleaned = this.cleanJapaneseText(explanationText);

        // 解説の導入部分を除去
        cleaned = cleaned.replace(/^(?:解説|説明|補足|理由|根拠)[:：]?\s*/i, '');

        // 不要な装飾を除去
        cleaned = cleaned.replace(/^[　\s]*[※注意※]/g, '');

        return cleaned.trim();
    },

    /**
     * テキストの品質を評価
     * @param {string} text - 評価するテキスト
     * @returns {object} 品質評価結果
     */
    evaluateTextQuality: function(text) {
        if (!text) {
            return { score: 0, issues: ['テキストが空'], confidence: 0 };
        }

        const issues = [];
        let score = 100;

        // 長さチェック
        if (text.length < 10) {
            issues.push('テキストが短すぎる');
            score -= 30;
        }

        // 文字化けチェック
        const garbledChars = text.match(/[���?]/g);
        if (garbledChars) {
            issues.push(`文字化け文字が${garbledChars.length}個`);
            score -= garbledChars.length * 5;
        }

        // 制御文字チェック
        const controlChars = text.match(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g);
        if (controlChars) {
            issues.push(`制御文字が${controlChars.length}個`);
            score -= controlChars.length * 3;
        }

        // 日本語文字の比率
        const japaneseChars = text.match(/[あ-んア-ヶ一-龠]/g);
        const japaneseRatio = japaneseChars ? japaneseChars.length / text.length : 0;
        if (japaneseRatio < 0.3) {
            issues.push('日本語文字の比率が低い');
            score -= 20;
        }

        // 連続する同じ文字
        const repeatedChars = text.match(/(.)\1{4,}/g);
        if (repeatedChars) {
            issues.push(`連続する同じ文字: ${repeatedChars.join(', ')}`);
            score -= repeatedChars.length * 10;
        }

        const confidence = Math.max(0, Math.min(100, score));

        return {
            score: confidence,
            issues: issues,
            confidence: confidence,
            stats: {
                length: text.length,
                japaneseRatio: japaneseRatio,
                garbledCount: garbledChars ? garbledChars.length : 0,
                controlCharCount: controlChars ? controlChars.length : 0
            }
        };
    }
};

// グローバルエクスポート
window.TextCleaner = TextCleaner;
