
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
        // 問題番号パターン
        questionNumberPatterns: [
            /^(?:問題?|第|Q|No\.?|【|〔|\()?(\d+)(?:問|】|〕|\)|\.|\s)/,
            /^(\d+)[\s\.\)】〕]/,
            /^【(\d+)】/,
            /^〔(\d+)〕/,
            /^\((\d+)\)/,
            /^問(\d+)/,
            /^Q(\d+)/,
            /^No\.?(\d+)/
        ],
        
        // 答えパターン
        answerPatterns: [
            /(?:答え?|解答|正解|A|Answer)[:：]?\s*([〇○×])/i,
            /^([〇○×])\s*$/,
            /([〇○×])\s*(?:が正解|正しい|誤り)/i,
            /正解[:：]\s*([〇○×])/i,
            /^答[:：]\s*([〇○×])/
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
        
        // 信頼度計算
        confidence: {
            baseScore: 50,
            questionNumberFound: 20,
            answerFound: 20,
            explanationFound: 10,
            properLength: 15,
            sectionDetected: 10,
            patternMatched: 5,
            minThreshold: 30,
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
        questionNumberMax: 999,
        
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
    if (validateConfig()) {
        initializePDFJS();
    }
});

// グローバルエクスポート
window.CONFIG = CONFIG;
window.updateConfig = updateConfig;
