
/**
 * 宅建PDF抽出システム - 設定ファイル
 */

const CONFIG = {
    // PDF.js設定
    PDFJS: {
        workerSrc: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
        standardFontDataUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/standard_fonts/',
        useSystemFonts: true,
        disableFontFace: false,
        useWorkerFetch: false,
        isOffscreenCanvasSupported: false,
        maxImageSize: 1024 * 1024 * 50, // 50MB
        cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
        cMapPacked: true
    },

    // テキスト抽出設定
    EXTRACTION: {
        // 抽出モード
        modes: {
            IMPROVED: 'improved',
            STRUCTURED: 'structured', 
            SIMPLE: 'simple',
            ADAPTIVE: 'adaptive'
        },
        
        // フォントサイズ閾値
        minFontSize: 8,
        maxFontSize: 72,
        
        // 行間判定
        lineSpacingMultiplier: 0.5,
        
        // 文字間隔判定
        charSpacingMultiplier: 0.5,
        
        // Y座標精度
        yCoordinatePrecision: 5,
        
        // 最大ページ数制限（0で無制限）
        maxPages: 0
    },

    // 問題パース設定
    PARSING: {
        // 適応的問題番号パターン（信頼度付き）
        questionNumberPatterns: [
            {
                name: '標準問題形式',
                regex: /^(?:問題?|問)\s*(\d+)[．.\s]*([^問]+?)(?=問\s*\d+|$)/gs,
                confidence: 0.95,
                type: 'question_with_text'
            },
            {
                name: '第N問形式',
                regex: /^第\s*(\d+)\s*問[．.\s]*([^第]+?)(?=第\s*\d+\s*問|$)/gs,
                confidence: 0.90,
                type: 'dai_question'
            },
            {
                name: '番号のみ形式',
                regex: /^(\d+)[．.\)\s]+(.+?)(?=\d+[．.\)\s]|$)/gs,
                confidence: 0.80,
                type: 'number_only'
            },
            {
                name: '括弧番号形式',
                regex: /^\((\d+)\)\s*(.+?)(?=\(\d+\)|$)/gs,
                confidence: 0.85,
                type: 'parentheses'
            },
            {
                name: '四角括弧形式',
                regex: /^【(\d+)】\s*(.+?)(?=【\d+】|$)/gs,
                confidence: 0.90,
                type: 'square_brackets'
            },
            {
                name: 'Q番号形式',
                regex: /^Q[．.\s]*(\d+)[．.\s]*(.+?)(?=Q[．.\s]*\d+|$)/gs,
                confidence: 0.75,
                type: 'q_format'
            },
            {
                name: '宅建形式1',
                regex: /^(\d+)[\s　]*[．.。][\s　]*(.+?)(?=\d+[\s　]*[．.。]|$)/gs,
                confidence: 0.85,
                type: 'takken_style1'
            },
            {
                name: '宅建形式2',
                regex: /^(\d+)[\s　]*[:：][\s　]*(.+?)(?=\d+[\s　]*[:：]|$)/gs,
                confidence: 0.85,
                type: 'takken_style2'
            },
            {
                name: '5桁問題番号',
                regex: /^(\d{4,6})(.+?)(?=\d{4,6}|$)/gs,
                confidence: 0.90,
                type: 'five_digit_number'
            },
            {
                name: '宅建年度番号形式',
                regex: /^(\d{5})(.+?)(?=×|〇|○|解説|答え|^[\s]*\d{5}|$)/gs,
                confidence: 0.95,
                type: 'takken_year_number'
            },
            {
                name: 'シンプル数字',
                regex: /^(\d+)[\s　]+(.+?)(?=^\d+[\s　]|$)/gs,
                confidence: 0.70,
                type: 'simple_number'
            },
            {
                name: '数字開始宅建形式',
                regex: /^(\d{3,4})\s+(.+?)(?=^\d{3,4}\s|$)/gms,
                confidence: 0.90,
                type: 'number_start_takken'
            }
        ],
        
        // 多様な選択肢パターン（新規）
        choicePatterns: [
            {
                name: '丸数字選択肢',
                regex: /[①②③④⑤⑥⑦⑧⑨⑩]/g,
                confidence: 0.95,
                extractFunction: 'extractCircledNumbers'
            },
            {
                name: '数字選択肢',
                regex: /^[1-9]\.\s*(.+?)(?=^[1-9]\.|$)/gm,
                confidence: 0.90,
                extractFunction: 'extractNumberedChoices'
            },
            {
                name: 'アイウエ選択肢',
                regex: /^[アイウエオカキクケコ]\.\s*(.+?)(?=^[アイウエオカキクケコ]\.|$)/gm,
                confidence: 0.85,
                extractFunction: 'extractKatakanaChoices'
            },
            {
                name: '括弧数字選択肢',
                regex: /^\(([1-9])\)\s*(.+?)(?=^\([1-9]\)|$)/gm,
                confidence: 0.80,
                extractFunction: 'extractParenthesesChoices'
            }
        ],
        
        // 改良された答えパターン
        answerPatterns: [
            {
                name: '○×答え',
                regex: /(?:答え?|解答|正解|A|Answer)[:：]?\s*([〇○×])/i,
                confidence: 0.95,
                type: 'correct_incorrect'
            },
            {
                name: '単独○×',
                regex: /^([〇○×])\s*$/,
                confidence: 0.85,
                type: 'correct_incorrect'
            },
            {
                name: '選択肢番号答え',
                regex: /(?:答え?|解答|正解)[:：]?\s*([①②③④⑤1-5アイウエオ])/i,
                confidence: 0.90,
                type: 'multiple_choice'
            },
            {
                name: '文中答え',
                regex: /([〇○×①②③④⑤1-5])\s*(?:が正解|が正しい|が誤り)/i,
                confidence: 0.70,
                type: 'in_text'
            }
        ],
        
        // 解説パターン
        explanationPatterns: [
            /^(?:解説|説明|補足|理由|根拠)[:：]?\s*(.+)/i,
            /^(?:ポイント|要点)[:：]?\s*(.+)/i
        ],
        
        // セクションパターン
        sectionPatterns: [
            /^(権利関係|宅建業法|法令上の制限|税・その他|その他関連知識)/,
            /第?\s*(\d+)\s*章?\s*(権利関係|宅建業法|法令上の制限|税・その他)/,
            /(民法|不動産登記法|借地借家法|区分所有法)/
        ],
        
        // 最小問題文長
        minQuestionLength: 20,
        maxQuestionLength: 1000,
        
        // 最小解説文長
        minExplanationLength: 10,
        
        // 多次元品質評価システム
        qualityWeights: {
            questionLength: 0.25,      // 問題文の長さ・完整性
            choiceCount: 0.20,         // 選択肢の数
            choiceQuality: 0.15,       // 選択肢の品質
            answerPresence: 0.20,      // 正解の存在
            explanationQuality: 0.10,  // 解説の品質
            formatConsistency: 0.10    // 形式の一貫性
        },
        
        // 信頼度計算
        confidence: {
            baseScore: 50,
            questionNumberFound: 20,
            answerFound: 20,
            explanationFound: 10,
            properLength: 15,
            sectionDetected: 10,
            patternMatched: 5,
            choicesFound: 15,          // 選択肢発見ボーナス
            formatConsistent: 10,      // 形式一貫性ボーナス
            minThreshold: 20,          // より緩い閾値に変更
            maxThreshold: 95
        }
    },

    // テキストクリーニング設定
    CLEANING: {
        // 文字化け修正パターン
        encodingFixes: {
            '???': '',
            '?': '',
            '・・・': '…',
            '　　': '　',
            '\u0000': '',
            '\uFFFD': '',
            '�': ''
        },
        
        // 正規化パターン
        normalizations: {
            '～': '〜',
            '·': '・',
            '○': '〇'
        },
        
        // 除去パターン
        removePatterns: [
            /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,  // 制御文字
            /\n{3,}/g,                              // 連続改行
            /[ \t]{2,}/g                            // 連続スペース
        ],
        
        // キーワードリスト
        positiveKeywords: ['正しい', '適切', '可能', 'できる', '必要', '義務', '有効'],
        negativeKeywords: ['誤っている', '不適切', '不可能', 'できない', '不要', '禁止', '無効']
    },

    // セクション定義
    SECTIONS: {
        KENRI: {
            name: '権利関係',
            keywords: ['民法', '不動産登記法', '借地借家法', '区分所有法', '契約', '物権', '債権'],
            questionRange: [1, 100]
        },
        TAKKEN: {
            name: '宅建業法',
            keywords: ['宅建業', '免許', '宅地建物取引士', '重要事項説明', '37条書面'],
            questionRange: [101, 150]
        },
        HOUREI: {
            name: '法令上の制限',
            keywords: ['都市計画法', '建築基準法', '国土利用計画法', '農地法', '土地区画整理法'],
            questionRange: [151, 200]
        },
        ZEI: {
            name: '税・その他',
            keywords: ['不動産取得税', '固定資産税', '所得税', '印紙税', '地価公示'],
            questionRange: [201, 250]
        }
    },

    // UI設定
    UI: {
        // アニメーション設定
        animationDuration: 300,
        
        // プログレスバー更新間隔
        progressUpdateInterval: 100,
        
        // ファイルサイズ制限（MB）
        maxFileSizeMB: 100,
        
        // 同時処理ファイル数
        maxConcurrentFiles: 3,
        
        // プレビュー表示制限
        maxPreviewQuestions: 20,
        
        // デバッグ情報表示制限
        maxDebugTextLength: 1000
    },

    // エクスポート設定
    EXPORT: {
        // CSV設定
        csv: {
            delimiter: ',',
            encoding: 'utf-8-sig', // BOM付きUTF-8
            headers: [
                '問題ID',
                'セクション',
                '年度',
                '問題番号',
                '問題文',
                '答え',
                '解説',
                'ソースファイル',
                '抽出方法',
                '信頼度',
                '作成日時'
            ]
        },
        
        // JSON設定
        json: {
            indent: 2,
            includeMetadata: true
        }
    },

    // ログ設定
    LOGGING: {
        level: 'INFO', // DEBUG, INFO, WARN, ERROR
        enableConsole: true,
        enableFileExport: false,
        maxLogEntries: 1000
    },

    // バリデーション設定
    VALIDATION: {
        // ファイル検証
        allowedExtensions: ['.pdf'],
        allowedMimeTypes: ['application/pdf'],
        
        // 問題番号範囲
        questionNumberMin: 1,
        questionNumberMax: 99999,
        
        // 必須フィールド
        requiredFields: ['question', 'answer'],
        
        // 答えの有効値
        validAnswers: ['〇', '×']
    },

    // エラーメッセージ
    MESSAGES: {
        errors: {
            pdfNotSupported: 'PDF.jsライブラリが読み込まれていません',
            fileNotFound: 'ファイルが見つかりません',
            fileTooBig: 'ファイルサイズが大きすぎます',
            invalidFileType: 'PDFファイルではありません',
            parsingFailed: 'PDF解析に失敗しました',
            noQuestionsFound: '問題が見つかりませんでした',
            exportFailed: 'エクスポートに失敗しました'
        },
        success: {
            fileUploaded: 'ファイルがアップロードされました',
            extractionComplete: '抽出が完了しました',
            exportComplete: 'エクスポートが完了しました'
        },
        warnings: {
            lowConfidence: '信頼度が低い問題があります',
            partialExtraction: '一部の問題のみ抽出されました',
            noAnswer: '答えが見つからない問題があります'
        }
    }
};

// 設定の検証
function validateConfig() {
    console.log('CONFIG validation started');
    
    // 必須設定のチェック
    const requiredSections = ['PDFJS', 'EXTRACTION', 'PARSING', 'CLEANING'];
    for (const section of requiredSections) {
        if (!CONFIG[section]) {
            console.error(`Missing config section: ${section}`);
            return false;
        }
    }
    
    console.log('CONFIG validation completed successfully');
    return true;
}

// PDF.js初期化
function initializePDFJS() {
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = CONFIG.PDFJS.workerSrc;
        pdfjsLib.GlobalWorkerOptions.standardFontDataUrl = CONFIG.PDFJS.standardFontDataUrl;
        console.log('PDF.js initialized with config');
    } else {
        console.error('PDF.js library not found');
    }
}

// 設定の動的更新
function updateConfig(section, key, value) {
    if (CONFIG[section] && CONFIG[section][key] !== undefined) {
        CONFIG[section][key] = value;
        console.log(`Config updated: ${section}.${key} = ${value}`);
        return true;
    }
    console.warn(`Invalid config path: ${section}.${key}`);
    return false;
}

// 初期化実行
document.addEventListener('DOMContentLoaded', function() {
    console.log('CONFIG: DOM読み込み完了、初期化開始');
    if (validateConfig()) {
        // PDF.js の読み込み完了を待つ
        if (typeof pdfjsLib !== 'undefined') {
            initializePDFJS();
        } else {
            console.warn('PDF.js未読み込み、再試行します...');
            setTimeout(() => {
                if (typeof pdfjsLib !== 'undefined') {
                    initializePDFJS();
                } else {
                    console.error('PDF.jsの読み込みに失敗しました');
                }
            }, 1000);
        }
    }
});

// グローバルエクスポート
window.CONFIG = CONFIG;
window.updateConfig = updateConfig;
