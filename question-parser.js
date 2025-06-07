
/**
 * 宅建PDF抽出システム - 問題パーサー
 * テキストから問題・答え・解説を抽出・構造化
 */

const QuestionParser = {
    /**
     * テキストから問題を解析・抽出
     * @param {string} text - 解析するテキスト
     * @param {string} fileName - ファイル名
     * @param {object} options - パース オプション
     * @returns {object} パース結果
     */
    parseQuestions: function(text, fileName, options = {}) {
        const startTime = performance.now();
        
        try {
            console.log(`問題パース開始: ${fileName}`);
            Utils.debugLog.log('debug', `=== 問題パース詳細デバッグ: ${fileName} ===`);
            Utils.debugLog.log('debug', `元テキスト長: ${text.length}文字`);
            
            const cleanedText = TextCleaner.cleanJapaneseText(text);
            const lines = this.preprocessText(cleanedText);
            
            Utils.debugLog.log('debug', `クリーニング後テキスト長: ${cleanedText.length}文字`);
            Utils.debugLog.log('debug', `分割後行数: ${lines.length}行`);
            
            // 最初の20行をサンプル表示
            Utils.debugLog.log('debug', '=== テキスト最初20行サンプル ===');
            for (let i = 0; i < Math.min(20, lines.length); i++) {
                const line = lines[i];
                Utils.debugLog.log('debug', `行${i+1}: "${line}"`);
                
                // 5桁数字パターンのテスト
                const fiveDigitMatch = line.match(/^(\d{4,6})/);
                if (fiveDigitMatch) {
                    Utils.debugLog.log('debug', `  → 5桁数字検出: ${fiveDigitMatch[1]}`);
                }
            }
            
            // セクション検出
            const detectedSection = this.detectSection(cleanedText, fileName);
            
            // 問題抽出
            const extractionResult = this.extractQuestions(lines, detectedSection, fileName, options);
            
            // 後処理
            const processedQuestions = this.postProcessQuestions(extractionResult.questions, options);
            
            // パターン統計
            const patterns = this.analyzePatterns(extractionResult.patterns);
            
            const processingTime = performance.now() - startTime;
            
            console.log(`問題パース完了: ${processedQuestions.length}問, ${processingTime.toFixed(2)}ms`);
            
            return {
                questions: processedQuestions,
                patterns: patterns,
                statistics: this.calculateParsingStats(processedQuestions, extractionResult),
                metadata: {
                    fileName: fileName,
                    detectedSection: detectedSection,
                    processingTime: processingTime,
                    originalTextLength: text.length,
                    cleanedTextLength: cleanedText.length
                }
            };
            
        } catch (error) {
            Utils.logError('問題パースエラー', error, { fileName });
            return {
                questions: [],
                patterns: {},
                statistics: {},
                metadata: { fileName, error: error.message }
            };
        }
    },

    /**
     * テキストの前処理
     * @param {string} text - 前処理するテキスト
     * @returns {Array<string>} 処理済み行配列
     */
    preprocessText: function(text) {
        const rawLines = text
            .split(/\n+/)
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => TextCleaner.cleanJapaneseText(line));
        
        // 短い行を結合する処理を追加
        return this.mergeShortLines(rawLines, 25);
    },
    
    /**
     * 短い行を結合
     * @param {Array<string>} lines - 行配列
     * @param {number} minLen - 最小行長
     * @returns {Array<string>} 結合後の行配列
     */
    mergeShortLines: function(lines, minLen = 25) {
        const merged = [];
        let buffer = '';
        
        for (const line of lines) {
            if (line.length < minLen && !line.match(/^(\d{4,6})|[×〇○]$/)) {
                buffer += (buffer ? ' ' : '') + line.trim();
                continue;
            }
            
            if (buffer) {
                merged.push(buffer + ' ' + line);
                buffer = '';
            } else {
                merged.push(line);
            }
        }
        
        if (buffer) {
            merged.push(buffer);
        }
        
        return merged;
    },

    /**
     * セクション検出
     * @param {string} text - テキスト
     * @param {string} fileName - ファイル名
     * @returns {string} 検出されたセクション
     */
    detectSection: function(text, fileName) {
        // ファイル名からの検出
        const fileNameSection = this.detectSectionFromFileName(fileName);
        if (fileNameSection !== 'その他') {
            return fileNameSection;
        }

        // テキスト内容からの検出
        const textSection = this.detectSectionFromContent(text);
        if (textSection !== 'その他') {
            return textSection;
        }

        // 問題番号範囲からの推測
        const numberRangeSection = this.detectSectionFromQuestionNumbers(text);
        return numberRangeSection;
    },

    /**
     * ファイル名からセクション検出
     * @param {string} fileName - ファイル名
     * @returns {string} セクション名
     */
    detectSectionFromFileName: function(fileName) {
        const lowerFileName = fileName.toLowerCase();
        
        for (const [sectionKey, sectionInfo] of Object.entries(CONFIG.SECTIONS)) {
            for (const keyword of sectionInfo.keywords) {
                if (lowerFileName.includes(keyword.toLowerCase())) {
                    return sectionInfo.name;
                }
            }
        }

        // 数字範囲での判定
        const rangeMatch = fileName.match(/(\d+)[-_～〜](\d+)/);
        if (rangeMatch) {
            const start = parseInt(rangeMatch[1]);
            const end = parseInt(rangeMatch[2]);
            
            for (const [sectionKey, sectionInfo] of Object.entries(CONFIG.SECTIONS)) {
                const [rangeStart, rangeEnd] = sectionInfo.questionRange;
                if (start >= rangeStart && end <= rangeEnd) {
                    return sectionInfo.name;
                }
            }
        }

        return 'その他';
    },

    /**
     * テキスト内容からセクション検出
     * @param {string} text - テキスト
     * @returns {string} セクション名
     */
    detectSectionFromContent: function(text) {
        const sectionCounts = {};
        
        // 各セクションのキーワード出現回数をカウント
        for (const [sectionKey, sectionInfo] of Object.entries(CONFIG.SECTIONS)) {
            sectionCounts[sectionInfo.name] = 0;
            
            for (const keyword of sectionInfo.keywords) {
                const regex = new RegExp(keyword, 'gi');
                const matches = text.match(regex);
                if (matches) {
                    sectionCounts[sectionInfo.name] += matches.length;
                }
            }
        }

        // 最もカウントが多いセクションを返す
        const maxSection = Object.keys(sectionCounts).reduce((a, b) => 
            sectionCounts[a] > sectionCounts[b] ? a : b
        );

        return sectionCounts[maxSection] > 0 ? maxSection : 'その他';
    },

    /**
     * 問題番号範囲からセクション推測
     * @param {string} text - テキスト
     * @returns {string} セクション名
     */
    detectSectionFromQuestionNumbers: function(text) {
        const numbers = [];
        
        for (const pattern of CONFIG.PARSING.questionNumberPatterns) {
            const matches = text.matchAll(new RegExp(pattern.source, 'gm'));
            for (const match of matches) {
                const num = parseInt(match[1]);
                if (num > 0 && num < 1000) {
                    numbers.push(num);
                }
            }
        }

        if (numbers.length === 0) return 'その他';

        const avgNumber = numbers.reduce((a, b) => a + b, 0) / numbers.length;

        for (const [sectionKey, sectionInfo] of Object.entries(CONFIG.SECTIONS)) {
            const [rangeStart, rangeEnd] = sectionInfo.questionRange;
            if (avgNumber >= rangeStart && avgNumber <= rangeEnd) {
                return sectionInfo.name;
            }
        }

        return 'その他';
    },

    /**
     * 問題抽出メイン処理
     * @param {Array<string>} lines - テキスト行配列
     * @param {string} section - セクション
     * @param {string} fileName - ファイル名
     * @param {object} options - オプション
     * @returns {object} 抽出結果
     */
    extractQuestions: function(lines, section, fileName, options) {
        const patterns = {
            questionNumbers: [],
            answers: [],
            explanations: [],
            sections: [section]
        };

        console.log(`問題抽出開始: ${fileName}, 行数: ${lines.length}`);
        console.log(`=== 詳細デバッグ情報 ===`);
        console.log(`テキスト行の最初20行:`, lines.slice(0, 20));
        console.log(`各行の文字数:`, lines.slice(0, 20).map(line => line.length));
        console.log(`設定されたセクション: ${section}`);
        console.log(`抽出オプション:`, options);
        
        // 行の詳細分析を追加
        console.log(`=== 行の詳細分析 ===`);
        for (let i = 0; i < Math.min(30, lines.length); i++) {
            const line = lines[i];
            if (line.trim().length > 0) {
                console.log(`行${i+1}: "${line}" (長さ: ${line.length})`);
                // 各種パターンテスト
                const tests = [
                    { name: '問N', pattern: /^(?:問題?|問)\s*(\d+)/ },
                    { name: '第N問', pattern: /^第\s*(\d+)\s*問/ },
                    { name: '数字.', pattern: /^(\d+)[．.。]/ },
                    { name: '数字)', pattern: /^(\d+)\)/ },
                    { name: '(数字)', pattern: /^\((\d+)\)/ },
                    { name: '【数字】', pattern: /^【(\d+)】/ },
                    { name: '数字スペース', pattern: /^(\d+)\s+/ }
                ];
                
                for (const test of tests) {
                    const match = line.match(test.pattern);
                    if (match) {
                        console.log(`  → ${test.name}パターンマッチ: 問${match[1]}`);
                    }
                }
            }
        }
        
        // まず適応的システムで問題を検出
        const fullText = lines.join('\n');
        console.log(`結合後の全テキスト文字数: ${fullText.length}`);
        console.log(`全テキストの最初1500文字:`, fullText.substring(0, 1500));
        console.log(`全テキストの最後1000文字:`, fullText.substring(Math.max(0, fullText.length - 1000)));
        
        let questions = this.detectQuestionsAdaptive(fullText);
        
        console.log(`適応的検出結果: ${questions.length}問`);
        
        // 適応的システムで問題が見つからない場合、フォールバック処理
        if (questions.length === 0) {
            console.log('=== フォールバック処理開始 ===');
            console.log(`フォールバック処理対象行数: ${lines.length}`);
            console.log(`行のサンプル (最初10行):`, lines.slice(0, 10));
            
            // 簡単なパターンマッチテスト（拡張版）
            console.log('=== 簡単パターンテスト ===');
            const simpleTests = [
                { name: '問+数字', pattern: /問\s*\d+/ },
                { name: '数字+ピリオド', pattern: /\d+\s*[．.。]/ },
                { name: '第N問', pattern: /第\s*\d+\s*問/ },
                { name: '行頭数字', pattern: /^\d+/ },
                { name: '数字括弧', pattern: /^\d+\)/ },
                { name: '括弧数字', pattern: /^\(\d+\)/ },
                { name: '【数字】', pattern: /^【\d+】/ },
                { name: '数字コロン', pattern: /^\d+[:：]/ },
                { name: '数字スペース文字', pattern: /^\d+\s+[あ-ん]/ },
                { name: '宅建形式', pattern: /^\d{3,4}\s/ }
            ];
            
            let totalMatches = 0;
            for (let i = 0; i < Math.min(50, lines.length); i++) {
                const line = lines[i];
                let lineMatches = [];
                
                for (const test of simpleTests) {
                    if (test.pattern.test(line)) {
                        lineMatches.push(test.name);
                        totalMatches++;
                    }
                }
                
                if (lineMatches.length > 0) {
                    console.log(`行${i+1}: "${line.substring(0, 100)}" → [${lineMatches.join(', ')}]`);
                }
            }
            
            console.log(`総マッチ数: ${totalMatches}個の潜在的問題番号を発見`);
            
            // より詳細な全文解析
            console.log('=== 全文での数字パターン検索 ===');
            const numberPatterns = [
                { name: '行頭数字', regex: /^(\d+)/gm },
                { name: '問+数字', regex: /問\s*(\d+)/g },
                { name: '第+数字+問', regex: /第\s*(\d+)\s*問/g }
            ];
            
            for (const test of numberPatterns) {
                const matches = [...fullText.matchAll(test.regex)];
                if (matches.length > 0) {
                    console.log(`${test.name}: ${matches.length}個のマッチ`);
                    console.log(`  最初の5個: ${matches.slice(0, 5).map(m => m[1]).join(', ')}`);
                }
            }
            
            questions = this.fallbackExtraction(lines, section, fileName, options);
            
            // 最後の手段: 極めて単純な数字ベース抽出
            if (questions.length === 0) {
                console.log('=== 緊急フォールバック: 単純数字抽出 ===');
                questions = this.emergencySimpleExtraction(lines, section, fileName);
            }
        }
        
        // セクション・メタデータの設定
        questions.forEach((question, index) => {
            question.id = index + 1;
            question.section = section;
            question.source = fileName;
            question.year = this.extractYear(fileName) || 'R6';
            
            // パターン統計の更新
            if (question.questionNumber) patterns.questionNumbers.push(question.questionNumber);
            if (question.answer) patterns.answers.push(question.answer);
            if (question.explanation) patterns.explanations.push(question.explanation);
        });

        console.log(`最終抽出結果: ${questions.length}問`);
        return { questions, patterns };
    },

    /**
     * フォールバック抽出処理（従来方式）
     * @param {Array<string>} lines - テキスト行配列
     * @param {string} section - セクション
     * @param {string} fileName - ファイル名
     * @param {object} options - オプション
     * @returns {Array} 問題配列
     */
    fallbackExtraction: function(lines, section, fileName, options) {
        console.log('=== フォールバック抽出処理開始 ===');
        const questions = [];
        let currentQuestion = null;
        let questionId = 1;
        let lineIndex = 0;
        let questionNumbersFound = 0;

        while (lineIndex < lines.length) {
            const line = lines[lineIndex];
            
            // 行の詳細ログ（最初20行のみ）
            if (lineIndex < 20) {
                console.log(`行${lineIndex + 1}: "${line}"`);
            }
            
            // 問題番号検出（新実装）
            const questionMatch = this.detectQuestionNumber(line);
            if (questionMatch) {
                questionNumbersFound++;
                console.log(`問題番号検出！行${lineIndex + 1}: 問${questionMatch.number}`);
                
                // 前の問題を保存
                if (currentQuestion && this.isValidQuestionRelaxed(currentQuestion)) {
                    console.log(`前の問題を保存: 問${currentQuestion.questionNumber}`);
                    questions.push(this.finalizeQuestion(currentQuestion));
                }

                // 新しい問題を開始
                currentQuestion = this.createNewQuestion(
                    questionId++, 
                    questionMatch, 
                    section, 
                    fileName,
                    lineIndex
                );
                console.log(`新しい問題開始: 問${currentQuestion.questionNumber}`);
                lineIndex++;
                continue;
            }

            // 答え検出（新実装）
            if (currentQuestion && !currentQuestion.answer) {
                const answerMatch = this.detectAnswer(line);
                if (answerMatch) {
                    currentQuestion.answer = answerMatch.answer;
                    currentQuestion.confidence += CONFIG.PARSING.confidence.answerFound;
                    lineIndex++;
                    continue;
                }
            }

            // 解説検出
            if (currentQuestion) {
                const explanationMatch = this.detectExplanation(line);
                if (explanationMatch) {
                    currentQuestion.explanation = explanationMatch.explanation;
                    currentQuestion.confidence += CONFIG.PARSING.confidence.explanationFound;
                    lineIndex++;
                    continue;
                }
            }

            // 問題文の続きまたは新しい問題文
            if (currentQuestion) {
                currentQuestion.question = this.appendToQuestion(currentQuestion.question, line);
            }

            lineIndex++;
        }

        // 最後の問題を保存
        if (currentQuestion && this.isValidQuestionRelaxed(currentQuestion)) {
            console.log(`最後の問題を保存: 問${currentQuestion.questionNumber}`);
            questions.push(this.finalizeQuestion(currentQuestion));
        }

        console.log(`=== フォールバック処理完了 ===`);
        console.log(`総行数: ${lines.length}`);
        console.log(`問題番号発見数: ${questionNumbersFound}`);
        console.log(`最終的な問題数: ${questions.length}`);
        
        return questions;
    },

    /**
     * 問題の後処理
     * @param {Array} questions - 問題配列
     * @param {object} options - オプション
     * @returns {Array} 処理済み問題配列
     */
    postProcessQuestions: function(questions, options = {}) {
        console.log(`後処理開始: ${questions.length}問`);
        
        if (!questions || questions.length === 0) {
            return [];
        }
        
        let processedQuestions = [];
        
        for (const question of questions) {
            try {
                // 問題の最終化処理
                const finalizedQuestion = this.finalizeQuestion(question);
                
                // 信頼度による検証
                if (this.isValidQuestion(finalizedQuestion)) {
                    processedQuestions.push(finalizedQuestion);
                } else {
                    console.log(`問題${finalizedQuestion.questionNumber}は品質基準を満たしません (信頼度: ${finalizedQuestion.confidence}%)`);
                }
            } catch (error) {
                console.warn(`問題処理エラー (問${question.questionNumber || 'unknown'}):`, error);
                continue;
            }
        }
        
        // 重複除去
        processedQuestions = this.removeDuplicateQuestions(processedQuestions);
        
        // 問題番号順にソート
        processedQuestions.sort((a, b) => (a.questionNumber || 0) - (b.questionNumber || 0));
        
        console.log(`後処理完了: ${processedQuestions.length}問が有効`);
        return processedQuestions;
    },

    /**
     * 重複問題を削除
     * @param {Array} questions - 問題配列
     * @returns {Array} 重複除去後の問題配列
     */
    removeDuplicateQuestions: function(questions) {
        const seen = new Set();
        const unique = [];
        
        for (const question of questions) {
            // 問題番号と問題文の最初の50文字で重複判定
            const key = `${question.questionNumber}_${question.question.substring(0, 50)}`;
            
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(question);
            } else {
                console.log(`重複問題を除去: 問${question.questionNumber}`);
            }
        }
        
        return unique;
    },

    /**
     * 適応的問題検出システム
     * @param {string} text - 全テキスト
     * @returns {Array} 検出された問題配列
     */
    detectQuestionsAdaptive: function(text) {
        console.log('適応的問題検出開始、テキスト長:', text.length);
        Utils.debugLog.log('debug', '=== 適応的問題検出開始 ===');
        Utils.debugLog.log('debug', `テキスト長: ${text.length}文字`);
        
        if (!text || text.length < 10) {
            console.warn('テキストが短すぎるか空です');
            Utils.debugLog.log('warn', 'テキストが短すぎるか空です');
            return [];
        }
        
        // 5桁数字の存在確認
        const fiveDigitNumbers = text.match(/\d{5}/g) || [];
        Utils.debugLog.log('debug', `5桁数字の発見数: ${fiveDigitNumbers.length}`);
        if (fiveDigitNumbers.length > 0) {
            Utils.debugLog.log('debug', `5桁数字サンプル: ${fiveDigitNumbers.slice(0, 10).join(', ')}`);
        }
        
        const detectionResults = [];
        
        // 各パターンで検出を試行
        for (const patternConfig of CONFIG.PARSING.questionNumberPatterns) {
            console.log(`パターン試行: ${patternConfig.name}`);
            Utils.debugLog.log('debug', `=== パターン試行: ${patternConfig.name} ===`);
            Utils.debugLog.log('debug', `パターン: ${patternConfig.regex.source}`);
            
            try {
                const result = this.detectWithPattern(text, patternConfig);
                console.log(`${patternConfig.name}で${result.questions.length}問検出、信頼度: ${result.confidence.toFixed(2)}`);
                Utils.debugLog.log('debug', `検出結果: ${result.questions.length}問、信頼度: ${result.confidence.toFixed(2)}%`);
                
                if (result.questions.length > 0) {
                    Utils.debugLog.log('debug', `成功パターン: ${patternConfig.name}`);
                    detectionResults.push({
                        pattern: patternConfig,
                        questions: result.questions,
                        confidence: result.confidence,
                        coverage: result.coverage
                    });
                }
            } catch (error) {
                console.error(`パターン ${patternConfig.name} でエラー:`, error);
                Utils.debugLog.log('error', `パターンエラー: ${patternConfig.name}`, error.message);
                continue;
            }
        }
        
        console.log(`検出結果: ${detectionResults.length}個のパターンで問題発見`);
        
        // 最適なパターンを選択
        const bestPattern = this.selectBestPattern(detectionResults);
        
        if (bestPattern) {
            console.log(`最適パターン: ${bestPattern.pattern.name}, 問題数: ${bestPattern.questions.length}`);
            
            // 選択肢も検出
            for (const question of bestPattern.questions) {
                try {
                    question.choices = this.detectChoices(question.question);
                    question.patternUsed = bestPattern.pattern.name;
                } catch (choiceError) {
                    console.warn(`選択肢検出エラー (問${question.questionNumber}):`, choiceError);
                    question.choices = [];
                }
            }
            
            return bestPattern.questions;
        } else {
            console.warn('適応的検出で問題が見つかりませんでした');
            return [];
        }
    },

    /**
     * 問題番号を検出（基本実装）
     * @param {string} line - テキスト行
     * @returns {object|null} 検出結果
     */
    detectQuestionNumber: function(line) {
        console.log(`問題番号検出を試行: "${line.substring(0, 50)}..."`);
        
        // 複数のパターンで試行
        for (const patternConfig of CONFIG.PARSING.questionNumberPatterns) {
            try {
                // パターンを単一行用に適切に調整
                let pattern = patternConfig.regex.source;
                // 改行マッチを削除し、単一行モードに変更
                pattern = pattern.replace(/\[\\^[^\]]+\]\*\?/g, '.*?'); // [^問]+? を .*? に変更
                pattern = pattern.replace(/gs?$/, ''); // グローバル・マルチラインフラグを削除
                
                // 行の先頭から検索
                if (!pattern.startsWith('^')) {
                    pattern = '^' + pattern;
                }
                
                const singleLineRegex = new RegExp(pattern, 'i');
                const match = line.match(singleLineRegex);
                
                if (match && match[1]) {
                    const number = parseInt(match[1]);
                    if (number > 0 && number <= CONFIG.VALIDATION.questionNumberMax) {
                        console.log(`問題番号検出成功: ${number} (パターン: ${patternConfig.name})`);
                        return {
                            number: number,
                            questionText: match[2] ? match[2].trim() : '',
                            fullMatch: match[0],
                            pattern: patternConfig.name
                        };
                    }
                }
            } catch (regexError) {
                console.warn(`正規表現エラー (${patternConfig.name}):`, regexError);
                continue;
            }
        }
        
        // シンプルな数字パターンもチェック
        const simplePatterns = [
            /^(\d+)[\s\.\)：。]+(.+)?/,
            /^問\s*(\d+)[\s\.\)：。]*(.+)?/,
            /^第?\s*(\d+)\s*問[\s\.\)：。]*(.+)?/,
            /^\[(\d+)\][\s\.\)：。]*(.+)?/,
            /^【(\d+)】[\s\.\)：。]*(.+)?/,
            /^(\d{4,6})(.+)?/,  // 4-6桁の数字
            /^(\d{5})\s*(.+)?/  // 5桁専用
        ];
        
        for (const pattern of simplePatterns) {
            const match = line.match(pattern);
            if (match) {
                const number = parseInt(match[1]);
                if (number > 0 && number <= CONFIG.VALIDATION.questionNumberMax) {
                    console.log(`シンプルパターンで検出成功: ${number}`);
                    return {
                        number: number,
                        questionText: match[2] ? match[2].trim() : '',
                        fullMatch: match[0],
                        pattern: 'simple_number'
                    };
                }
            }
        }
        
        return null;
    },

    /**
     * 答えを検出（基本実装）
     * @param {string} line - テキスト行
     * @returns {object|null} 検出結果
     */
    detectAnswer: function(line) {
        // 設定されたパターンを使用
        for (const patternConfig of CONFIG.PARSING.answerPatterns) {
            const match = line.match(patternConfig.regex);
            if (match && match[1]) {
                console.log(`答え検出成功: ${match[1]} (パターン: ${patternConfig.name})`);
                return {
                    answer: match[1],
                    fullMatch: match[0],
                    pattern: patternConfig.name,
                    confidence: patternConfig.confidence
                };
            }
        }
        
        // 単純な○×検出
        const simplePatterns = [
            /([〇○×])/,
            /^答え?[:：]?\s*([〇○×])/i,
            /^正解[:：]?\s*([〇○×])/i
        ];
        
        for (const pattern of simplePatterns) {
            const match = line.match(pattern);
            if (match) {
                const answer = match[1] === '○' ? '〇' : match[1];
                console.log(`シンプルパターンで答え検出: ${answer}`);
                return {
                    answer: answer,
                    fullMatch: match[0],
                    pattern: 'simple_answer',
                    confidence: 0.8
                };
            }
        }
        
        return null;
    },
    
    /**
     * 指定パターンで問題を検出
     * @param {string} text - テキスト
     * @param {object} patternConfig - パターン設定
     * @returns {object} 検出結果
     */
    detectWithPattern: function(text, patternConfig) {
        console.log(`パターン検出実行: ${patternConfig.name}`);
        Utils.debugLog.log('debug', `パターン検出実行: ${patternConfig.name}`);
        Utils.debugLog.log('debug', `パターン: ${patternConfig.regex.source}`);
        Utils.debugLog.log('debug', `テキストサンプル (最初500文字): "${text.substring(0, 500)}"`);
        
        const questions = [];
        let regex;
        
        try {
            regex = new RegExp(patternConfig.regex.source, patternConfig.regex.flags);
        } catch (regexError) {
            console.error(`正規表現作成エラー (${patternConfig.name}):`, regexError);
            Utils.debugLog.log('error', `正規表現作成エラー: ${patternConfig.name}`, regexError.message);
            return { questions: [], confidence: 0, coverage: 0 };
        }
        
        // 回答アンカー形式の特別処理
        if (patternConfig.type === 'answer_anchored') {
            return this.processAnswerAnchoredPattern(text, patternConfig, regex);
        }
        
        let match;
        let totalMatches = 0;
        
        try {
            while ((match = regex.exec(text)) !== null) {
                totalMatches++;
                console.log(`マッチ発見 ${totalMatches}: ${match[0].substring(0, 100)}`);
                
                if (match[1]) {
                    const questionNumber = parseInt(match[1]);
                    const questionText = match[2] ? match[2].trim() : '';
                    
                    console.log(`問題番号: ${questionNumber}, テキスト長: ${questionText.length}`);
                    
                    if (questionNumber > 0 && questionNumber <= CONFIG.VALIDATION.questionNumberMax) {
                        questions.push({
                            questionNumber: questionNumber,
                            question: questionText,
                            answer: null,
                            explanation: '',
                            confidence: patternConfig.confidence * 100, // パーセンテージに変換
                            choices: [],
                            metadata: {
                                fullMatch: match[0],
                                position: match.index,
                                detectedPattern: patternConfig.name
                            }
                        });
                        console.log(`有効な問題として追加: 問${questionNumber}`);
                    } else {
                        console.log(`問題番号が範囲外: ${questionNumber}`);
                    }
                } else {
                    console.log(`問題番号が見つからない: ${match[0]}`);
                }
                
                if (totalMatches > 1000) {
                    console.warn('マッチ数上限に達しました');
                    break;
                }
            }
        } catch (execError) {
            console.error(`正規表現実行エラー (${patternConfig.name}):`, execError);
        }
        
        console.log(`パターン ${patternConfig.name} 結果: ${questions.length}問検出`);
        
        const confidence = this.calculatePatternConfidence(questions, patternConfig);
        const coverage = questions.length > 0 ? questions.length / this.estimateQuestionCount(text) : 0;
        
        return {
            questions: questions,
            confidence: confidence,
            coverage: Math.min(coverage, 1.0)
        };
    },
    
    /**
     * 最適なパターンを選択
     * @param {Array} detectionResults - 検出結果配列
     * @returns {object|null} 最適なパターン
     */
    selectBestPattern: function(detectionResults) {
        if (detectionResults.length === 0) return null;
        
        // スコアリング: 信頼度 × カバレッジ × 問題数
        let bestResult = null;
        let bestScore = 0;
        
        for (const result of detectionResults) {
            const score = result.confidence * result.coverage * Math.log(result.questions.length + 1);
            
            if (score > bestScore) {
                bestScore = score;
                bestResult = result;
            }
        }
        
        return bestResult;
    },
    
    /**
     * パターンの信頼度を計算
     * @param {Array} questions - 検出された問題
     * @param {object} patternConfig - パターン設定
     * @returns {number} 信頼度
     */
    calculatePatternConfidence: function(questions, patternConfig) {
        if (questions.length === 0) return 0;
        
        let confidence = patternConfig.confidence;
        
        // 連続性チェック
        const numbers = questions.map(q => q.number).sort((a, b) => a - b);
        let sequential = true;
        for (let i = 1; i < numbers.length; i++) {
            if (numbers[i] !== numbers[i-1] + 1) {
                sequential = false;
                break;
            }
        }
        
        if (sequential) confidence += 0.1;
        
        // 問題文の質チェック
        const avgQuestionLength = questions.reduce((sum, q) => sum + q.questionText.length, 0) / questions.length;
        if (avgQuestionLength >= CONFIG.PARSING.minQuestionLength) {
            confidence += 0.05;
        }
        
        return Math.min(confidence, 1.0);
    },
    
    /**
     * 問題数を推定
     * @param {string} text - テキスト
     * @returns {number} 推定問題数
     */
    estimateQuestionCount: function(text) {
        // 数字の出現回数から推定
        const numberMatches = text.match(/\d+/g);
        if (!numberMatches) return 1;
        
        const uniqueNumbers = new Set(numberMatches.map(n => parseInt(n)));
        const reasonableNumbers = Array.from(uniqueNumbers).filter(n => n >= 1 && n <= 100);
        
        return Math.max(reasonableNumbers.length / 3, 1); // 保守的な推定
    },
    
    /**
     * 選択肢を検出
     * @param {string} questionText - 問題文
     * @returns {Array} 検出された選択肢
     */
    detectChoices: function(questionText) {
        const choices = [];
        
        for (const choicePattern of CONFIG.PARSING.choicePatterns) {
            const result = this.extractChoicesByPattern(questionText, choicePattern);
            if (result.length > 0) {
                return result.map(choice => ({
                    ...choice,
                    pattern: choicePattern.name,
                    confidence: choicePattern.confidence
                }));
            }
        }
        
        return choices;
    },
    
    /**
     * パターン別選択肢抽出
     * @param {string} text - テキスト
     * @param {object} pattern - 選択肢パターン
     * @returns {Array} 抽出された選択肢
     */
    extractChoicesByPattern: function(text, pattern) {
        const extractFunction = this[pattern.extractFunction];
        if (typeof extractFunction === 'function') {
            return extractFunction.call(this, text, pattern);
        }
        return [];
    },
    
    /**
     * 丸数字選択肢の抽出
     * @param {string} text - テキスト
     * @param {object} pattern - パターン設定
     * @returns {Array} 選択肢配列
     */
    extractCircledNumbers: function(text, pattern) {
        const choices = [];
        const circledMap = { '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5, '⑥': 6, '⑦': 7, '⑧': 8, '⑨': 9, '⑩': 10 };
        
        // ①から始まる文章を抽出
        const lines = text.split('\n');
        let currentChoice = null;
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            const circledMatch = trimmedLine.match(/^([①②③④⑤⑥⑦⑧⑨⑩])\s*(.+)/);
            
            if (circledMatch) {
                // 前の選択肢を保存
                if (currentChoice) {
                    choices.push(currentChoice);
                }
                
                // 新しい選択肢を開始
                currentChoice = {
                    number: circledMap[circledMatch[1]],
                    symbol: circledMatch[1],
                    text: circledMatch[2]
                };
            } else if (currentChoice && trimmedLine.length > 0) {
                // 選択肢の続きとして追加
                currentChoice.text += ' ' + trimmedLine;
            }
        }
        
        // 最後の選択肢を保存
        if (currentChoice) {
            choices.push(currentChoice);
        }
        
        return choices;
    },
    
    /**
     * 数字選択肢の抽出
     * @param {string} text - テキスト
     * @param {object} pattern - パターン設定
     * @returns {Array} 選択肢配列
     */
    extractNumberedChoices: function(text, pattern) {
        const choices = [];
        const matches = text.matchAll(pattern.regex);
        
        for (const match of matches) {
            choices.push({
                number: parseInt(match[0].charAt(0)),
                symbol: match[0].charAt(0),
                text: match[1].trim()
            });
        }
        
        return choices;
    },
    
    /**
     * カタカナ選択肢の抽出
     * @param {string} text - テキスト
     * @param {object} pattern - パターン設定
     * @returns {Array} 選択肢配列
     */
    extractKatakanaChoices: function(text, pattern) {
        const choices = [];
        const kanaMap = { 'ア': 1, 'イ': 2, 'ウ': 3, 'エ': 4, 'オ': 5 };
        const matches = text.matchAll(pattern.regex);
        
        for (const match of matches) {
            const kana = match[0].charAt(0);
            choices.push({
                number: kanaMap[kana] || 0,
                symbol: kana,
                text: match[1].trim()
            });
        }
        
        return choices;
    },
    
    /**
     * 括弧数字選択肢の抽出
     * @param {string} text - テキスト
     * @param {object} pattern - パターン設定
     * @returns {Array} 選択肢配列
     */
    extractParenthesesChoices: function(text, pattern) {
        const choices = [];
        const matches = text.matchAll(pattern.regex);
        
        for (const match of matches) {
            choices.push({
                number: parseInt(match[1]),
                symbol: `(${match[1]})`,
                text: match[2].trim()
            });
        }
        
        return choices;
    },

    /**
     * 改良された答え検出
     * @param {string} text - テキスト
     * @param {Array} choices - 選択肢配列
     * @returns {object|null} 検出結果
     */
    detectAnswerImproved: function(text, choices = []) {
        // パターンベース検出
        for (const patternConfig of CONFIG.PARSING.answerPatterns) {
            const match = text.match(patternConfig.regex);
            if (match && match[1]) {
                const answerText = match[1];
                const result = this.normalizeAnswer(answerText, patternConfig.type, choices);
                
                if (result) {
                    return {
                        ...result,
                        fullMatch: match[0],
                        pattern: patternConfig.name,
                        confidence: patternConfig.confidence
                    };
                }
            }
        }

        // キーワードベース推測
        const keywordResult = this.detectAnswerFromKeywords(text);
        if (keywordResult) {
            return keywordResult;
        }

        return null;
    },
    
    /**
     * 答えを正規化
     * @param {string} answerText - 答えテキスト
     * @param {string} type - 答えのタイプ
     * @param {Array} choices - 選択肢配列
     * @returns {object|null} 正規化された答え
     */
    normalizeAnswer: function(answerText, type, choices) {
        switch (type) {
            case 'correct_incorrect':
                if (answerText === '〇' || answerText === '○') {
                    return { answer: '〇', type: 'correct_incorrect' };
                } else if (answerText === '×') {
                    return { answer: '×', type: 'correct_incorrect' };
                }
                break;
                
            case 'multiple_choice':
                // 丸数字や数字の場合
                const circledMap = { '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5 };
                const kanaMap = { 'ア': 1, 'イ': 2, 'ウ': 3, 'エ': 4, 'オ': 5 };
                
                let choiceNumber = null;
                
                if (circledMap[answerText]) {
                    choiceNumber = circledMap[answerText];
                } else if (kanaMap[answerText]) {
                    choiceNumber = kanaMap[answerText];
                } else if (/^[1-5]$/.test(answerText)) {
                    choiceNumber = parseInt(answerText);
                }
                
                if (choiceNumber && choices.length >= choiceNumber) {
                    return {
                        answer: answerText,
                        choiceNumber: choiceNumber,
                        choiceText: choices[choiceNumber - 1]?.text || '',
                        type: 'multiple_choice'
                    };
                }
                break;
        }
        
        return null;
    },

    /**
     * キーワードから答えを推測
     * @param {string} line - テキスト行
     * @returns {object|null} 検出結果
     */
    detectAnswerFromKeywords: function(line) {
        const lowerLine = line.toLowerCase();
        
        let positiveScore = 0;
        let negativeScore = 0;

        for (const keyword of CONFIG.CLEANING.positiveKeywords) {
            if (lowerLine.includes(keyword)) positiveScore++;
        }

        for (const keyword of CONFIG.CLEANING.negativeKeywords) {
            if (lowerLine.includes(keyword)) negativeScore++;
        }

        // 明確な傾向がある場合のみ答えを推測
        if (positiveScore > negativeScore && positiveScore >= 2) {
            return {
                answer: '〇',
                fullMatch: line,
                pattern: 'keyword_inference',
                confidence: 0.7
            };
        } else if (negativeScore > positiveScore && negativeScore >= 2) {
            return {
                answer: '×',
                fullMatch: line,
                pattern: 'keyword_inference',
                confidence: 0.7
            };
        }

        return null;
    },

    /**
     * 解説を検出
     * @param {string} line - テキスト行
     * @returns {object|null} 検出結果
     */
    detectExplanation: function(line) {
        for (const pattern of CONFIG.PARSING.explanationPatterns) {
            const match = line.match(pattern);
            if (match && match[1]) {
                return {
                    explanation: match[1].trim(),
                    fullMatch: match[0],
                    pattern: pattern.source
                };
            }
        }
        return null;
    },

    /**
     * 基本的な問題の妥当性をチェック
     * @param {object} question - 問題オブジェクト
     * @returns {boolean} 妥当かどうか
     */
    isValidQuestionBasic: function(question) {
        // 問題番号の存在チェック
        if (!question.questionNumber || question.questionNumber < 1) {
            return false;
        }
        
        // 問題文の最小長チェック
        if (!question.question || question.question.length < 20) {
            return false;
        }
        
        // 問題文に日本語が含まれているかチェック
        if (!/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(question.question)) {
            return false;
        }
        
        return true;
    },

    /**
     * テキストから選択肢を抽出
     * @param {string} text - テキスト
     * @returns {Array} 選択肢配列
     */
    extractChoices: function(text) {
        const choices = [];
        
        // 設定から選択肢パターンを取得
        for (const choicePattern of CONFIG.PARSING.choicePatterns) {
            const matches = [...text.matchAll(choicePattern.regex)];
            
            if (matches.length >= 2) { // 最低2つの選択肢が必要
                for (const match of matches) {
                    if (match[1] && match[1].trim().length > 3) {
                        choices.push({
                            number: match[0].charAt(0), // 選択肢番号
                            text: match[1].trim(),
                            format: choicePattern.name
                        });
                    }
                }
                
                // 選択肢が見つかったら最初のパターンを使用
                if (choices.length > 0) {
                    console.log(`選択肢抽出成功: ${choicePattern.name}形式で${choices.length}個`);
                    break;
                }
            }
        }
        
        return choices;
    },

    /**
     * 新しい問題オブジェクトを作成
     * @param {number} id - 問題ID
     * @param {object} questionMatch - 問題番号マッチ結果
     * @param {string} section - セクション
     * @param {string} fileName - ファイル名
     * @param {number} lineIndex - 行インデックス
     * @returns {object} 問題オブジェクト
     */
    createNewQuestion: function(id, questionMatch, section, fileName, lineIndex) {
        return {
            id: id,
            section: section,
            year: this.extractYear(fileName) || 'R6',
            questionNumber: questionMatch.number,
            question: questionMatch.questionText,
            answer: null,
            explanation: '',
            source: fileName,
            extractionMethod: 'pattern_match',
            confidence: CONFIG.PARSING.confidence.baseScore + CONFIG.PARSING.confidence.questionNumberFound,
            metadata: {
                detectedPattern: questionMatch.pattern,
                lineIndex: lineIndex,
                originalFullMatch: questionMatch.fullMatch
            }
        };
    },

    /**
     * 問題文に行を追加
     * @param {string} currentQuestion - 現在の問題文
     * @param {string} line - 追加する行
     * @returns {string} 更新された問題文
     */
    appendToQuestion: function(currentQuestion, line) {
        // 問題文として適切でない行は無視
        if (this.isIgnorableLine(line)) {
            return currentQuestion;
        }

        // 改行が必要かを判断
        if (currentQuestion && !currentQuestion.endsWith('。') && !currentQuestion.endsWith(' ')) {
            return currentQuestion + ' ' + line;
        }
        
        return currentQuestion + line;
    },

    /**
     * 無視すべき行かどうかを判定
     * @param {string} line - 行
     * @returns {boolean} 無視すべきかどうか
     */
    isIgnorableLine: function(line) {
        // 短すぎる行
        if (line.length < 3) return true;

        // 数字のみの行
        if (/^\d+$/.test(line)) return true;

        // 記号のみの行
        if (/^[・●○▲△□■◆\-=]+$/.test(line)) return true;

        // ヘッダー・フッター的な行
        if (/^(ページ|Page|\d+\/\d+|第\d+章)/.test(line)) return true;

        return false;
    },

    /**
     * 問題が有効かどうかを判定
     * @param {object} question - 問題オブジェクト
     * @returns {boolean} 有効かどうか
     */
    isValidQuestion: function(question) {
        if (!question) return false;
        
        // 必須フィールドチェック
        if (!question.question || question.question.trim().length < CONFIG.PARSING.minQuestionLength) {
            return false;
        }

        // 問題番号の妥当性
        if (question.questionNumber < CONFIG.VALIDATION.questionNumberMin || 
            question.questionNumber > CONFIG.VALIDATION.questionNumberMax) {
            return false;
        }

        // 信頼度チェック
        const threshold = parseInt(Utils.getNestedValue(
            document.getElementById('confidenceThreshold'), 
            'value', 
            CONFIG.PARSING.confidence.minThreshold
        ));
        
        if (question.confidence < threshold) {
            return false;
        }

        return true;
    },

    /**
     * 問題が有効かどうかを判定（緩和版）
     * @param {object} question - 問題オブジェクト
     * @returns {boolean} 有効かどうか
     */
    isValidQuestionRelaxed: function(question) {
        if (!question) return false;
        
        // より緩い条件でチェック
        if (!question.question || question.question.trim().length < 5) {
            return false;
        }

        // 問題番号の妥当性
        if (question.questionNumber < CONFIG.VALIDATION.questionNumberMin || 
            question.questionNumber > CONFIG.VALIDATION.questionNumberMax) {
            return false;
        }

        // 信頼度チェック（より緩い閾値）
        const threshold = Math.min(
            parseInt(Utils.getNestedValue(
                document.getElementById('confidenceThreshold'), 
                'value', 
                CONFIG.PARSING.confidence.minThreshold
            )),
            50  // 最大でも50%に制限
        );
        
        if (question.confidence < threshold) {
            return false;
        }

        return true;
    },

    /**
     * 多次元品質評価による問題最終化
     * @param {object} question - 問題オブジェクト
     * @returns {object} 最終化された問題
     */
    finalizeQuestion: function(question) {
        // metadataオブジェクトを初期化
        if (!question.metadata) {
            question.metadata = {};
        }
        
        // 答えがない場合は推測
        if (!question.answer) {
            question.answer = this.guessAnswerFromQuestion(question.question, question.choices);
            question.confidence -= 20;
            question.metadata.answerGuessed = true;
        }

        // 解説がない場合は生成
        if (!question.explanation) {
            question.explanation = this.generateExplanation(question.question, question.answer, question.section);
            question.metadata.explanationGenerated = true;
        }

        // 問題文と解説のクリーニング
        question.question = TextCleaner.cleanQuestionText(question.question);
        question.explanation = TextCleaner.cleanExplanationText(question.explanation);

        // 多次元品質評価
        const qualityScore = this.calculateMultiDimensionalQuality(question);
        question.qualityScore = qualityScore;
        
        // 品質スコアに基づく信頼度調整
        question.confidence = this.adjustConfidenceByQuality(question.confidence, qualityScore);

        // 最終的な信頼度を制限
        question.confidence = Utils.clamp(
            question.confidence, 
            0, 
            CONFIG.PARSING.confidence.maxThreshold
        );

        // 作成日時を追加
        question.createdAt = new Date().toISOString();

        return question;
    },
    
    /**
     * 多次元品質評価
     * @param {object} question - 問題オブジェクト
     * @returns {object} 品質スコア
     */
    calculateMultiDimensionalQuality: function(question) {
        const weights = CONFIG.PARSING.qualityWeights;
        let totalScore = 0;
        const details = {};
        
        // 1. 問題文の長さ・完整性
        const questionLengthScore = this.evaluateQuestionLength(question.question);
        details.questionLength = questionLengthScore;
        totalScore += questionLengthScore * weights.questionLength;
        
        // 2. 選択肢の数
        const choiceCountScore = this.evaluateChoiceCount(question.choices || []);
        details.choiceCount = choiceCountScore;
        totalScore += choiceCountScore * weights.choiceCount;
        
        // 3. 選択肢の品質
        const choiceQualityScore = this.evaluateChoiceQuality(question.choices || []);
        details.choiceQuality = choiceQualityScore;
        totalScore += choiceQualityScore * weights.choiceQuality;
        
        // 4. 正解の存在
        const answerPresenceScore = this.evaluateAnswerPresence(question.answer);
        details.answerPresence = answerPresenceScore;
        totalScore += answerPresenceScore * weights.answerPresence;
        
        // 5. 解説の品質
        const explanationQualityScore = this.evaluateExplanationQuality(question.explanation);
        details.explanationQuality = explanationQualityScore;
        totalScore += explanationQualityScore * weights.explanationQuality;
        
        // 6. 形式の一貫性
        const formatConsistencyScore = this.evaluateFormatConsistency(question);
        details.formatConsistency = formatConsistencyScore;
        totalScore += formatConsistencyScore * weights.formatConsistency;
        
        return {
            totalScore: Math.min(totalScore, 1.0),
            details: details,
            confidence: Math.round(totalScore * 100)
        };
    },
    
    /**
     * 問題文の長さを評価
     * @param {string} questionText - 問題文
     * @returns {number} スコア (0-1)
     */
    evaluateQuestionLength: function(questionText) {
        if (!questionText) return 0;
        
        const length = questionText.length;
        if (length < 10) return 0.1;
        if (length < 20) return 0.3;
        if (length < 50) return 0.7;
        if (length < 200) return 1.0;
        if (length < 500) return 0.9;
        return 0.6; // 長すぎる場合
    },
    
    /**
     * 選択肢数を評価
     * @param {Array} choices - 選択肢配列
     * @returns {number} スコア (0-1)
     */
    evaluateChoiceCount: function(choices) {
        const count = choices.length;
        if (count === 0) return 0.5; // ○×問題の場合
        if (count >= 2 && count <= 5) return 1.0;
        if (count === 1) return 0.3;
        return 0.2; // 多すぎる場合
    },
    
    /**
     * 選択肢の品質を評価
     * @param {Array} choices - 選択肢配列
     * @returns {number} スコア (0-1)
     */
    evaluateChoiceQuality: function(choices) {
        if (choices.length === 0) return 0.5; // ○×問題
        
        let totalScore = 0;
        for (const choice of choices) {
            let choiceScore = 0;
            
            // テキストの長さ
            if (choice.text && choice.text.length > 5) choiceScore += 0.5;
            if (choice.text && choice.text.length > 15) choiceScore += 0.3;
            
            // 記号の存在
            if (choice.symbol) choiceScore += 0.2;
            
            totalScore += Math.min(choiceScore, 1.0);
        }
        
        return choices.length > 0 ? totalScore / choices.length : 0;
    },
    
    /**
     * 正解の存在を評価
     * @param {string} answer - 答え
     * @returns {number} スコア (0-1)
     */
    evaluateAnswerPresence: function(answer) {
        if (!answer) return 0;
        if (answer === '〇' || answer === '×') return 1.0;
        if (/^[①②③④⑤1-5アイウエオ]$/.test(answer)) return 1.0;
        return 0.5;
    },
    
    /**
     * 解説の品質を評価
     * @param {string} explanation - 解説
     * @returns {number} スコア (0-1)
     */
    evaluateExplanationQuality: function(explanation) {
        if (!explanation) return 0;
        
        const length = explanation.length;
        if (length < 10) return 0.2;
        if (length < 30) return 0.5;
        if (length < 100) return 0.8;
        if (length < 300) return 1.0;
        return 0.9; // 長すぎる場合
    },
    
    /**
     * 形式の一貫性を評価
     * @param {object} question - 問題オブジェクト
     * @returns {number} スコア (0-1)
     */
    evaluateFormatConsistency: function(question) {
        let score = 0;
        
        // 問題番号の妥当性
        if (question.questionNumber >= 1 && question.questionNumber <= 100) {
            score += 0.3;
        }
        
        // パターンの信頼度
        if (question.patternUsed) {
            score += 0.3;
        }
        
        // 選択肢の連続性（もしあれば）
        if (question.choices && question.choices.length > 1) {
            const numbers = question.choices.map(c => c.number).sort();
            let sequential = true;
            for (let i = 1; i < numbers.length; i++) {
                if (numbers[i] !== numbers[i-1] + 1) {
                    sequential = false;
                    break;
                }
            }
            if (sequential) score += 0.4;
            else score += 0.2;
        } else {
            score += 0.4; // ○×問題の場合
        }
        
        return Math.min(score, 1.0);
    },
    
    /**
     * 品質スコアに基づく信頼度調整
     * @param {number} baseConfidence - 基本信頼度
     * @param {object} qualityScore - 品質スコア
     * @returns {number} 調整後信頼度
     */
    adjustConfidenceByQuality: function(baseConfidence, qualityScore) {
        // 品質スコアが高い場合は信頼度を上げ、低い場合は下げる
        const qualityMultiplier = 0.5 + (qualityScore.totalScore * 0.5);
        const adjustedConfidence = baseConfidence * qualityMultiplier;
        
        // 極端な調整を防ぐ
        return Utils.clamp(adjustedConfidence, baseConfidence * 0.7, baseConfidence * 1.3);
    },

    /**
     * 問題文から答えを推測
     * @param {string} questionText - 問題文
     * @returns {string} 推測された答え
     */
    guessAnswerFromQuestion: function(questionText) {
        if (!questionText) return '×'; // デフォルト

        const text = questionText.toLowerCase();
        let positiveScore = 0;
        let negativeScore = 0;

        // ポジティブキーワードをカウント
        for (const keyword of CONFIG.CLEANING.positiveKeywords) {
            const count = (text.match(new RegExp(keyword, 'g')) || []).length;
            positiveScore += count;
        }

        // ネガティブキーワードをカウント
        for (const keyword of CONFIG.CLEANING.negativeKeywords) {
            const count = (text.match(new RegExp(keyword, 'g')) || []).length;
            negativeScore += count;
        }

        // 疑問文のパターン
        if (text.includes('か。') || text.includes('でしょうか') || text.includes('ですか')) {
            // 疑問文の場合、肯定的な答えになりやすい
            positiveScore += 1;
        }

        // 「～ない」「～でない」などの否定表現
        if (text.includes('ない') || text.includes('でない') || text.includes('ではない')) {
            negativeScore += 1;
        }

        // 判定
        if (positiveScore > negativeScore) {
            return '〇';
        } else if (negativeScore > positiveScore) {
            return '×';
        } else {
            // 同点の場合は×を返す（より安全）
            return '×';
        }
    },

    /**
     * 解説を生成
     * @param {string} questionText - 問題文
     * @param {string} answer - 答え
     * @param {string} section - セクション
     * @returns {string} 生成された解説
     */
    generateExplanation: function(questionText, answer, section) {
        const isCorrect = answer === '〇';
        const sectionName = section || 'その他';

        // セクション別のテンプレート
        const templates = {
            '権利関係': {
                correct: '民法および関連法の規定により、この記述は正しいです。権利関係の基本的な理解を深めることが重要です。',
                incorrect: '民法および関連法の規定により、この記述は誤りです。正しい法律関係を確認しましょう。'
            },
            '宅建業法': {
                correct: '宅建業法の規定により、この記述は正しいです。宅建業者の義務や制限について正確に理解しましょう。',
                incorrect: '宅建業法の規定により、この記述は誤りです。宅建業法の正しい内容を確認することが重要です。'
            },
            '法令上の制限': {
                correct: '法令上の制限に関する規定により、この記述は正しいです。各種法令の制限内容を正確に把握しましょう。',
                incorrect: '法令上の制限に関する規定により、この記述は誤りです。関連する法令の正しい制限内容を確認しましょう。'
            },
            '税・その他': {
                correct: '税法およびその他の関連法令により、この記述は正しいです。不動産に関する税制の理解を深めましょう。',
                incorrect: '税法およびその他の関連法令により、この記述は誤りです。正しい税制や評価方法を確認しましょう。'
            }
        };

        const template = templates[sectionName] || templates['税・その他'];
        let explanation = isCorrect ? template.correct : template.incorrect;

        // 問題文の特定キーワードに基づく追加説明
        if (questionText.includes('契約')) {
            explanation += ' 契約の成立要件や効力について詳しく学習することをお勧めします。';
        } else if (questionText.includes('登記')) {
            explanation += ' 不動産登記法の仕組みと手続きについて理解を深めましょう。';
        } else if (questionText.includes('免許')) {
            explanation += ' 免許制度の詳細と更新手続きについて確認しておきましょう。';
        } else if (questionText.includes('重要事項')) {
            explanation += ' 重要事項説明書の記載事項と説明義務について復習しましょう。';
        }

        return explanation;
    },

    /**
     * ファイル名から年度を抽出
     * @param {string} fileName - ファイル名
     * @returns {string|null} 年度
     */
    extractYear: function(fileName) {
        // 令和年の検出
        const reiwaMatch = fileName.match(/[Rr](\d+)|令和(\d+)/);
        if (reiwaMatch) {
            const year = parseInt(reiwaMatch[1] || reiwaMatch[2]);
            return `R${year}`;
        }

        // 平成年の検出
        const heiseiMatch = fileName.match(/[Hh](\d+)|平成(\d+)/);
        if (heiseiMatch) {
            const year = parseInt(heiseiMatch[1] || heiseiMatch[2]);
            return `H${year}`;
        }

        // 西暦の検出
        const yearMatch = fileName.match(/20(\d{2})/);
        if (yearMatch) {
            const year = parseInt(yearMatch[1]);
            // 2019年以降は令和に変換
            if (year >= 19) {
                return `R${year - 18}`;
            }
        }

        return null;
    },

    /**
     * 適応的問題検出システム
     * @param {string} text - 全体のテキスト
     * @returns {Array} 検出された問題配列
     */
    detectQuestionsAdaptive: function(text) {
        console.log('=== 適応的問題検出開始 ===');
        console.log(`テキスト長: ${text.length}文字`);
        
        const detectionResults = [];
        
        // 各パターンで検出を試行
        for (const patternConfig of CONFIG.PARSING.questionNumberPatterns) {
            console.log(`パターン試行: ${patternConfig.name}`);
            
            try {
                const result = this.detectWithPattern(text, patternConfig);
                console.log(`パターン${patternConfig.name}: ${result.questions.length}問検出, 信頼度: ${result.confidence}%`);
                
                if (result.questions.length > 0) {
                    detectionResults.push({
                        pattern: patternConfig,
                        questions: result.questions,
                        confidence: result.confidence,
                        coverage: result.coverage
                    });
                }
            } catch (error) {
                console.warn(`パターン${patternConfig.name}でエラー:`, error);
            }
        }
        
        // 最適パターンを選択
        const bestPattern = this.selectBestPattern(detectionResults);
        if (bestPattern) {
            console.log(`最適パターン選択: ${bestPattern.pattern.name}, ${bestPattern.questions.length}問`);
            return bestPattern.questions;
        }
        
        console.log('適応的検出で問題が見つかりませんでした');
        return [];
    },

    /**
     * 指定パターンで問題を検出
     * @param {string} text - テキスト
     * @param {object} patternConfig - パターン設定
     * @returns {object} 検出結果
     */
    detectWithPattern: function(text, patternConfig) {
        const questions = [];
        let totalMatches = 0;
        let validQuestions = 0;
        
        console.log(`=== ${patternConfig.name} デバッグ開始 ===`);
        console.log(`パターン: ${patternConfig.regex}`);
        console.log(`パターンフラグ: ${patternConfig.regex.flags}`);
        console.log(`テキストサンプル (最初500文字):`, text.substring(0, 500));
        console.log(`テキストの行数: ${text.split('\n').length}`);
        
        // パターンマッチング
        let matches;
        try {
            matches = [...text.matchAll(patternConfig.regex)];
            totalMatches = matches.length;
        } catch (regexError) {
            console.error(`正規表現エラー: ${regexError.message}`);
            matches = [];
            totalMatches = 0;
        }
        
        console.log(`${patternConfig.name}: ${totalMatches}個のマッチ`);
        
        if (totalMatches === 0) {
            console.log('=== マッチなし - 問題診断開始 ===');
            
            // パターンを段階的にテスト
            const diagnosticTests = [
                { name: '数字のみ', pattern: /\d+/g },
                { name: '問文字', pattern: /問/g },
                { name: '第文字', pattern: /第/g },
                { name: '行頭数字', pattern: /^\d+/gm },
                { name: '問+任意文字', pattern: /問[\s\S]*?\d+/g },
                { name: '数字+ピリオド', pattern: /\d+[．.。]/g }
            ];
            
            for (const test of diagnosticTests) {
                const testMatches = [...text.matchAll(test.pattern)];
                console.log(`診断テスト "${test.name}": ${testMatches.length}個マッチ`);
                if (testMatches.length > 0 && testMatches.length <= 10) {
                    console.log(`  例: ${testMatches.slice(0, 3).map(m => `"${m[0]}"`).join(', ')}`);
                }
            }
            
            // 実際のパターンの構成要素をテスト
            console.log('=== パターン構成要素テスト ===');
            const originalPattern = patternConfig.regex.source;
            console.log(`元パターン: ${originalPattern}`);
            
            // より簡単なバリエーションをテスト
            const simpleVariations = [
                /問\s*(\d+)/g,
                /^問\s*(\d+)/gm,
                /(?:問題?|問)\s*(\d+)/g,
                /^(?:問題?|問)\s*(\d+)/gm
            ];
            
            for (let i = 0; i < simpleVariations.length; i++) {
                const simpleMatches = [...text.matchAll(simpleVariations[i])];
                console.log(`簡単バリエーション${i+1}: ${simpleMatches.length}個マッチ`);
                if (simpleMatches.length > 0) {
                    console.log(`  最初の3個: ${simpleMatches.slice(0, 3).map(m => `問${m[1]}`).join(', ')}`);
                }
            }
            
        } else {
            console.log('マッチ結果例:', matches.slice(0, 3).map(m => ({
                fullMatch: m[0].substring(0, 100),
                number: m[1],
                text: m[2] ? m[2].substring(0, 100) : 'なし'
            })));
        }
        
        for (const match of matches) {
            try {
                const questionNumber = parseInt(match[1]);
                const questionText = match[2] ? match[2].trim() : '';
                
                console.log(`処理中: 問${questionNumber}, テキスト長: ${questionText.length}`);
                
                if (questionNumber && questionText.length > 10) {
                    const question = {
                        questionNumber: questionNumber,
                        question: questionText,
                        choices: [],
                        answer: null,
                        explanation: '',
                        confidence: patternConfig.confidence * 100,
                        metadata: {
                            pattern: patternConfig.name,
                            extractedAt: new Date().toISOString()
                        }
                    };
                    
                    // 選択肢抽出
                    question.choices = this.extractChoices(questionText);
                    
                    // 基本検証
                    if (this.isValidQuestionBasic(question)) {
                        questions.push(question);
                        validQuestions++;
                        console.log(`問${questionNumber}を追加 (信頼度: ${question.confidence})`);
                    } else {
                        console.log(`問${questionNumber}は基本検証で失格`);
                    }
                } else {
                    console.log(`問${questionNumber}は条件不足 (テキスト長: ${questionText.length})`);
                }
            } catch (error) {
                console.warn(`問題処理エラー:`, error);
            }
        }
        
        const confidence = totalMatches > 0 ? (validQuestions / totalMatches) * 100 : 0;
        const coverage = text.length > 0 ? (totalMatches * 50) / text.length : 0; // 概算
        
        console.log(`=== ${patternConfig.name} 結果 ===`);
        console.log(`総マッチ: ${totalMatches}, 有効問題: ${validQuestions}, 信頼度: ${confidence}%`);
        
        return {
            questions: questions,
            confidence: confidence,
            coverage: coverage,
            totalMatches: totalMatches,
            validQuestions: validQuestions
        };
    },

    /**
     * 最適パターンを選択
     * @param {Array} detectionResults - 検出結果配列
     * @returns {object|null} 最適パターン
     */
    selectBestPattern: function(detectionResults) {
        if (detectionResults.length === 0) {
            return null;
        }
        
        // スコア計算による選択
        let bestPattern = null;
        let bestScore = 0;
        
        for (const result of detectionResults) {
            const score = this.calculatePatternScore(result);
            console.log(`パターン${result.pattern.name}のスコア: ${score}`);
            
            if (score > bestScore) {
                bestScore = score;
                bestPattern = result;
            }
        }
        
        // 最低スコア閾値チェック
        const minimumThreshold = CONFIG.PARSING.confidence.minimumThreshold || 20;
        console.log(`スコア評価: 最高スコア=${bestScore}, 閾値=${minimumThreshold}`);
        
        if (bestScore < minimumThreshold) {
            console.log(`最高スコア${bestScore}が閾値${minimumThreshold}を下回ります`);
            console.log('利用可能な全パターンの詳細:');
            for (const result of detectionResults) {
                console.log(`  ${result.pattern.name}: 問題数=${result.questions.length}, 信頼度=${result.confidence}, スコア計算結果=${this.calculatePatternScore(result)}`);
            }
            return null;
        }
        
        return bestPattern;
    },

    /**
     * パターンスコアを計算
     * @param {object} result - 検出結果
     * @returns {number} スコア
     */
    calculatePatternScore: function(result) {
        const questionCount = result.questions.length;
        const confidence = result.confidence;
        const coverage = result.coverage;
        const patternConfidence = result.pattern.confidence;
        
        // 重み付きスコア計算
        const score = (questionCount * 0.4) + 
                     (confidence * 0.3) + 
                     (coverage * 0.2) + 
                     (patternConfidence * 100 * 0.1);
        
        return Math.min(score, 100); // 最大100
    },

    /**
     * パターンを分析
     * @param {object} patterns - 検出されたパターン
     * @returns {object} 分析結果
     */
    analyzePatterns: function(patterns) {
        return {
            questionNumberDistribution: this.analyzeNumberDistribution(patterns.questionNumbers),
            answerDistribution: this.analyzeAnswerDistribution(patterns.answers),
            patternReliability: this.calculatePatternReliability(patterns),
            detectedFormats: this.detectQuestionFormats(patterns)
        };
    },

    /**
     * 問題番号の分布を分析
     * @param {Array<number>} numbers - 問題番号配列
     * @returns {object} 分析結果
     */
    analyzeNumberDistribution: function(numbers) {
        if (numbers.length === 0) {
            return { min: 0, max: 0, range: 0, sequential: false, gaps: [] };
        }

        const sorted = [...numbers].sort((a, b) => a - b);
        const min = sorted[0];
        const max = sorted[sorted.length - 1];
        const range = max - min + 1;
        
        // 連続性チェック
        let sequential = true;
        const gaps = [];
        
        for (let i = 1; i < sorted.length; i++) {
            const expected = sorted[i - 1] + 1;
            if (sorted[i] !== expected) {
                sequential = false;
                if (sorted[i] > expected) {
                    gaps.push({ from: expected, to: sorted[i] - 1 });
                }
            }
        }

        return {
            min: min,
            max: max,
            range: range,
            count: numbers.length,
            sequential: sequential,
            gaps: gaps,
            completeness: numbers.length / range
        };
    },

    /**
     * 答えの分布を分析
     * @param {Array<string>} answers - 答え配列
     * @returns {object} 分析結果
     */
    analyzeAnswerDistribution: function(answers) {
        const correct = answers.filter(a => a === '〇').length;
        const incorrect = answers.filter(a => a === '×').length;
        const total = answers.length;

        return {
            total: total,
            correct: correct,
            incorrect: incorrect,
            correctRatio: total > 0 ? correct / total : 0,
            incorrectRatio: total > 0 ? incorrect / total : 0,
            balanced: total > 0 ? Math.abs(correct - incorrect) / total < 0.3 : false
        };
    },

    /**
     * パターンの信頼性を計算
     * @param {object} patterns - パターン
     * @returns {number} 信頼性スコア (0-1)
     */
    calculatePatternReliability: function(patterns) {
        let score = 0;
        let factors = 0;

        // 問題番号の検出率
        if (patterns.questionNumbers.length > 0) {
            score += 0.4;
            factors++;
        }

        // 答えの検出率
        if (patterns.answers.length > 0) {
            const answerRate = patterns.answers.length / Math.max(patterns.questionNumbers.length, 1);
            score += answerRate * 0.3;
            factors++;
        }

        // 解説の検出率
        if (patterns.explanations.length > 0) {
            const explanationRate = patterns.explanations.length / Math.max(patterns.questionNumbers.length, 1);
            score += explanationRate * 0.3;
            factors++;
        }

        return factors > 0 ? score : 0;
    },

    /**
     * 問題フォーマットを検出
     * @param {object} patterns - パターン
     * @returns {Array<string>} 検出されたフォーマット
     */
    detectQuestionFormats: function(patterns) {
        const formats = [];

        if (patterns.questionNumbers.length > 0) {
            formats.push('番号付き問題');
        }

        if (patterns.answers.length > 0) {
            formats.push('○×問題');
        }

        if (patterns.explanations.length > 0) {
            formats.push('解説付き');
        }

        const answerDist = this.analyzeAnswerDistribution(patterns.answers);
        if (answerDist.balanced) {
            formats.push('バランス型');
        }

        return formats;
    },

    /**
     * パース統計を計算
     * @param {Array} questions - 問題配列
     * @param {object} extractionResult - 抽出結果
     * @returns {object} 統計情報
     */
    calculateParsingStats: function(questions, extractionResult) {
        const stats = {
            totalQuestions: questions.length,
            averageConfidence: 0,
            confidenceDistribution: { high: 0, medium: 0, low: 0 },
            sectionDistribution: {},
            answerDistribution: { correct: 0, incorrect: 0 },
            hasExplanation: 0,
            averageQuestionLength: 0,
            qualityIssues: []
        };

        if (questions.length === 0) return stats;

        // 信頼度統計
        const confidences = questions.map(q => q.confidence);
        stats.averageConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;

        // 信頼度分布
        for (const q of questions) {
            if (q.confidence >= 80) stats.confidenceDistribution.high++;
            else if (q.confidence >= 50) stats.confidenceDistribution.medium++;
            else stats.confidenceDistribution.low++;
        }

        // セクション分布
        for (const q of questions) {
            stats.sectionDistribution[q.section] = (stats.sectionDistribution[q.section] || 0) + 1;
        }

        // 答え分布
        for (const q of questions) {
            if (q.answer === '〇') stats.answerDistribution.correct++;
            else stats.answerDistribution.incorrect++;
        }

        // 解説有無
        stats.hasExplanation = questions.filter(q => q.explanation && q.explanation.length > 10).length;

        // 平均問題文長
        const questionLengths = questions.map(q => q.question.length);
        stats.averageQuestionLength = questionLengths.reduce((a, b) => a + b, 0) / questionLengths.length;

        // 品質問題の検出
        for (const q of questions) {
            if (q.confidence < 50) {
                stats.qualityIssues.push(`問${q.questionNumber}: 信頼度が低い (${q.confidence}%)`);
            }
            if (q.question.length < 20) {
                stats.qualityIssues.push(`問${q.questionNumber}: 問題文が短い`);
            }
            if (!q.answer) {
                stats.qualityIssues.push(`問${q.questionNumber}: 答えが不明`);
            }
        }

        return stats;
    },

    /**
     * 緊急用の単純抽出（最後の手段）
     * @param {Array<string>} lines - テキスト行配列
     * @param {string} section - セクション
     * @param {string} fileName - ファイル名
     * @returns {Array} 問題配列
     */
    emergencySimpleExtraction: function(lines, section, fileName) {
        console.log('緊急単純抽出を開始します');
        const questions = [];
        let questionCount = 0;
        
        // 非常に単純なパターンで数字を探す
        const simplePatterns = [
            /^(\d+)[\.．。\s]/,  // 数字 + ピリオドまたはスペース
            /^(\d+)\)/,         // 数字 + 閉じ括弧  
            /^\((\d+)\)/,       // 括弧数字
            /^(\d+):/,          // 数字 + コロン
            /^(\d+)\s+/         // 数字 + スペース
        ];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.length < 5) continue; // 短すぎる行はスキップ
            
            for (const pattern of simplePatterns) {
                const match = line.match(pattern);
                if (match) {
                    const questionNumber = parseInt(match[1]);
                    
                    // 合理的な問題番号の範囲内か
                    if (questionNumber >= 1 && questionNumber <= 999) {
                        // 問題文を収集（複数行の可能性）
                        let questionText = line.replace(pattern, '').trim();
                        
                        // 次の数行も問題文として追加（次の問題番号まで）
                        for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
                            const nextLine = lines[j].trim();
                            
                            // 次の問題番号らしきものが見つかったら停止
                            let isNextQuestion = false;
                            for (const testPattern of simplePatterns) {
                                if (testPattern.test(nextLine)) {
                                    const testMatch = nextLine.match(testPattern);
                                    if (testMatch) {
                                        const testNumber = parseInt(testMatch[1]);
                                        if (testNumber > questionNumber && testNumber <= questionNumber + 3) {
                                            isNextQuestion = true;
                                            break;
                                        }
                                    }
                                }
                            }
                            
                            if (isNextQuestion) break;
                            
                            // 答えや解説っぽい行は除外
                            if (nextLine.length > 0 && 
                                !nextLine.match(/^(答え?|解答|解説|正解)[:：]/i) &&
                                !nextLine.match(/^[〇○×]$/) &&
                                nextLine.length < 200) {
                                questionText += ' ' + nextLine;
                            }
                        }
                        
                        // 最低限の長さがあれば問題として追加
                        if (questionText.length >= 10) {
                            questionCount++;
                            questions.push({
                                id: questionCount,
                                section: section,
                                year: this.extractYear(fileName) || 'R6',
                                questionNumber: questionNumber,
                                question: questionText,
                                answer: null,
                                explanation: '',
                                source: fileName,
                                extractionMethod: 'emergency_simple',
                                confidence: 30, // 低い信頼度
                                metadata: {
                                    detectedPattern: 'emergency_simple',
                                    lineIndex: i,
                                    originalLine: line
                                }
                            });
                            
                            console.log(`緊急抽出: 問${questionNumber} - "${questionText.substring(0, 50)}..."`);
                        }
                        
                        break; // 一つのパターンがマッチしたら他はテストしない
                    }
                }
            }
        }
        
        console.log(`緊急単純抽出完了: ${questions.length}問を抽出`);
        return questions;
    },
    
    /**
     * 回答アンカー形式の処理
     * @param {string} text - テキスト
     * @param {object} patternConfig - パターン設定
     * @param {RegExp} regex - 正規表現
     * @returns {object} 検出結果
     */
    processAnswerAnchoredPattern: function(text, patternConfig, regex) {
        const questions = [];
        let match;
        
        Utils.debugLog.log('debug', '=== 回答アンカー形式処理開始 ===');
        
        while ((match = regex.exec(text)) !== null) {
            const questionNumber = parseInt(match[1]);
            const questionText = match[2] ? match[2].trim() : '';
            const answer = match[3] === '○' ? '〇' : match[3]; // 正規化
            
            Utils.debugLog.log('debug', `回答アンカー検出: 問${questionNumber}, 答え: ${answer}`);
            Utils.debugLog.log('debug', `問題文プレビュー: "${questionText.substring(0, 100)}..."`);
            
            if (questionNumber > 0 && questionNumber <= CONFIG.VALIDATION.questionNumberMax && questionText.length > 5) {
                questions.push({
                    questionNumber: questionNumber,
                    question: questionText,
                    answer: answer,
                    explanation: '',
                    confidence: patternConfig.confidence * 100,
                    choices: [],
                    metadata: {
                        fullMatch: match[0],
                        position: match.index,
                        detectedPattern: patternConfig.name,
                        hasAnswer: true
                    }
                });
                
                Utils.debugLog.log('debug', `有効な問題として追加: 問${questionNumber} (信頼度: ${patternConfig.confidence * 100}%)`);
            }
        }
        
        const confidence = questions.length > 0 ? 95 : 0; // 回答が見つかれば高信頼度
        const coverage = questions.length / Math.max(1, this.estimateQuestionCount(text));
        
        Utils.debugLog.log('debug', `回答アンカー処理結果: ${questions.length}問検出, 信頼度: ${confidence}%`);
        
        return {
            questions: questions,
            confidence: confidence,
            coverage: Math.min(coverage, 1.0)
        };
    }
};

// グローバルエクスポート
window.QuestionParser = QuestionParser;
