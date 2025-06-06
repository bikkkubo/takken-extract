
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
            
            const cleanedText = TextCleaner.cleanJapaneseText(text);
            const lines = this.preprocessText(cleanedText);
            
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
        return text
            .split(/\n+/)
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => TextCleaner.cleanJapaneseText(line));
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
        const questions = [];
        const patterns = {
            questionNumbers: [],
            answers: [],
            explanations: [],
            sections: [section]
        };

        let currentQuestion = null;
        let questionId = 1;
        let lineIndex = 0;

        while (lineIndex < lines.length) {
            const line = lines[lineIndex];
            
            // 問題番号検出
            const questionMatch = this.detectQuestionNumber(line);
            if (questionMatch) {
                // 前の問題を保存
                if (currentQuestion && this.isValidQuestion(currentQuestion)) {
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
                patterns.questionNumbers.push(questionMatch.number);
                lineIndex++;
                continue;
            }

            // 答え検出
            if (currentQuestion && !currentQuestion.answer) {
                const answerMatch = this.detectAnswer(line);
                if (answerMatch) {
                    currentQuestion.answer = answerMatch.answer;
                    currentQuestion.confidence += CONFIG.PARSING.confidence.answerFound;
                    patterns.answers.push(answerMatch.answer);
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
                    patterns.explanations.push(explanationMatch.explanation);
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
        if (currentQuestion && this.isValidQuestion(currentQuestion)) {
            questions.push(this.finalizeQuestion(currentQuestion));
        }

        return { questions, patterns };
    },

    /**
     * 適応的問題検出システム
     * @param {string} text - 全テキスト
     * @returns {Array} 検出された問題配列
     */
    detectQuestionsAdaptive: function(text) {
        const detectionResults = [];
        
        // 各パターンで検出を試行
        for (const patternConfig of CONFIG.PARSING.questionNumberPatterns) {
            const result = this.detectWithPattern(text, patternConfig);
            if (result.questions.length > 0) {
                detectionResults.push({
                    pattern: patternConfig,
                    questions: result.questions,
                    confidence: result.confidence,
                    coverage: result.coverage
                });
            }
        }
        
        // 最適なパターンを選択
        const bestPattern = this.selectBestPattern(detectionResults);
        
        if (bestPattern) {
            // 選択肢も検出
            for (const question of bestPattern.questions) {
                question.choices = this.detectChoices(question.questionText);
                question.patternUsed = bestPattern.pattern.name;
            }
        }
        
        return bestPattern ? bestPattern.questions : [];
    },
    
    /**
     * 指定パターンで問題を検出
     * @param {string} text - テキスト
     * @param {object} patternConfig - パターン設定
     * @returns {object} 検出結果
     */
    detectWithPattern: function(text, patternConfig) {
        const questions = [];
        const regex = new RegExp(patternConfig.regex.source, patternConfig.regex.flags);
        let match;
        let totalMatches = 0;
        
        while ((match = regex.exec(text)) !== null) {
            totalMatches++;
            const questionNumber = parseInt(match[1]);
            const questionText = match[2] ? match[2].trim() : '';
            
            if (questionNumber > 0 && questionNumber <= CONFIG.VALIDATION.questionNumberMax) {
                questions.push({
                    number: questionNumber,
                    questionText: questionText,
                    fullMatch: match[0],
                    position: match.index,
                    confidence: patternConfig.confidence
                });
            }
            
            if (totalMatches > 1000) break; // 無限ループ防止
        }
        
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
     * 多次元品質評価による問題最終化
     * @param {object} question - 問題オブジェクト
     * @returns {object} 最終化された問題
     */
    finalizeQuestion: function(question) {
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
    }
};

// グローバルエクスポート
window.QuestionParser = QuestionParser;
