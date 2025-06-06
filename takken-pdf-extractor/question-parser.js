
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
     * 問題番号を検出
     * @param {string} line - テキスト行
     * @returns {object|null} 検出結果
     */
    detectQuestionNumber: function(line) {
        for (const pattern of CONFIG.PARSING.questionNumberPatterns) {
            const match = line.match(pattern);
            if (match && match[1]) {
                const number = parseInt(match[1]);
                if (number > 0 && number <= CONFIG.VALIDATION.questionNumberMax) {
                    return {
                        number: number,
                        fullMatch: match[0],
                        questionText: line.replace(pattern, '').trim(),
                        pattern: pattern.source
                    };
                }
            }
        }
        return null;
    },

    /**
     * 答えを検出
     * @param {string} line - テキスト行
     * @returns {object|null} 検出結果
     */
    detectAnswer: function(line) {
        for (const pattern of CONFIG.PARSING.answerPatterns) {
            const match = line.match(pattern);
            if (match && match[1]) {
                const answerText = match[1];
                let normalizedAnswer;
                
                if (answerText === '〇' || answerText === '○') {
                    normalizedAnswer = '〇';
                } else if (answerText === '×') {
                    normalizedAnswer = '×';
                } else {
                    continue; // 無効な答え
                }

                return {
                    answer: normalizedAnswer,
                    fullMatch: match[0],
                    pattern: pattern.source
                };
            }
        }

        // 問題文中の答えキーワード検出
        const answerKeywords = this.detectAnswerFromKeywords(line);
        if (answerKeywords) {
            return answerKeywords;
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
     * 問題を最終化
     * @param {object} question - 問題オブジェクト
     * @returns {object} 最終化された問題
     */
    finalizeQuestion: function(question) {
        // 答えがない場合は推測
        if (!question.answer) {
            question.answer = this.guessAnswerFromQuestion(question.question);
            question.confidence -= 20; // 推測なので信頼度を下げる
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

        // 長さに応じた信頼度調整
        if (question.question.length >= CONFIG.PARSING.minQuestionLength) {
            question.confidence += CONFIG.PARSING.confidence.properLength;
        }

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
