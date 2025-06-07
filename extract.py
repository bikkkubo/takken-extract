#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
宅建PDF抽出スクリプト - PEP 8準拠版
宅建業法一問一答集からデータを抽出し、CSV/XLSXファイルを出力

レイアウト規則:
- 青い罫囲み：大項目（例: 宅建業法）
- 赤い罫囲み：中項目（例: Section 1 宅建業法の適用）
- 黄色罫囲み：小項目（例: １｜「宅地建物取引業」とは）
- 緑罫囲み：最小項目（例: 1-1「宅地」とは）
- 各問題ブロックは以下の順で出現:
  1. 問題番号（全角/半角数字）
  2. 出題年度（平成は数字のみ、令和は頭に "R"）
  3. 問題文
  4. 解説
  5. 回答（○ / ×）
"""

import sys
import re
import csv
import os
from pathlib import Path
from typing import List, Dict, Tuple, Optional, Union, Any
import warnings

try:
    import fitz  # PyMuPDF
    HAS_PYMUPDF = True
except ImportError:
    HAS_PYMUPDF = False

try:
    import pdfplumber
    HAS_PDFPLUMBER = True
except ImportError:
    HAS_PDFPLUMBER = False

try:
    import pytesseract
    HAS_PYTESSERACT = True
except ImportError:
    HAS_PYTESSERACT = False

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

try:
    import pandas as pd
    HAS_PANDAS = True
except ImportError:
    HAS_PANDAS = False

# 警告を抑制
warnings.filterwarnings("ignore")


class TakkenPDFExtractor:
    """宅建PDF抽出処理クラス"""
    
    # CSV列ヘッダー
    CSV_HEADERS = [
        '大項目', '中項目', '小項目', '最小項目', '問題番号', 
        '出題年度', '問題', '解説', '回答'
    ]
    
    # 項目レベルパターン（階層構造の検出用）
    HIERARCHY_PATTERNS = {
        '大項目': [
            r'第[一二三四五六七八九十０-９0-9]+章\s*[：:]\s*(.+)',
            r'[第]?[一二三四五六七八九十０-９0-9]+\s*[章編部]\s*[：:]?\s*(.+)',
            r'宅建業法|権利関係|税・その他|法令上の制限'
        ],
        '中項目': [
            r'Section\s*[０-９0-9]+\s*(.+)',
            r'第[０-９0-9一二三四五六七八九十]+節\s*(.+)',
            r'[０-９0-9]+[．.]\s*(.+)',
            r'■\s*(.+)'
        ],
        '小項目': [
            r'[０-９0-9一二三四五六七八九十]+[｜|]\s*(.+)',
            r'[０-９0-9]+[-－]\s*(.+)',
            r'●\s*(.+)'
        ],
        '最小項目': [
            r'[０-９0-9]+-[０-９0-9]+\s*(.+)',
            r'[０-９0-9]+\.\s*[０-９0-9]+\s*(.+)',
            r'▶\s*(.+)'
        ]
    }
    
    # 問題番号パターン
    QUESTION_PATTERNS = [
        r'^([０-９0-9]+)[．.。：:\s]+(.+)',
        r'^問\s*([０-９0-9]+)[．.。：:\s]*(.+)',
        r'^第?\s*([０-９0-9]+)\s*問[．.。：:\s]*(.+)',
        r'^\[([０-９0-9]+)\][．.。：:\s]*(.+)',
        r'^【([０-９0-9]+)】[．.。：:\s]*(.+)',
        r'^([０-９0-9]+)\s*[\)\）][．.。：:\s]*(.+)'
    ]
    
    # 回答パターン
    ANSWER_PATTERNS = [
        r'^[答回正解][：:]\s*([○×〇])',
        r'^[答回正解]\s*([○×〇])',
        r'^([○×〇])\s*$',
        r'答え?[：:]?\s*([○×〇])',
        r'正解[：:]?\s*([○×〇])'
    ]
    
    # 年度パターン
    YEAR_PATTERNS = [
        r'[Rr]([0-9０-９]+)',  # 令和
        r'令和([0-9０-９]+)',
        r'[Hh]([0-9０-９]+)',  # 平成
        r'平成([0-9０-９]+)',
        r'([0-9０-９]+)年',
        r'20([0-9０-９]{2})'  # 西暦
    ]
    
    def __init__(self):
        """初期化処理"""
        self.current_hierarchy = {
            '大項目': '',
            '中項目': '',
            '小項目': '',
            '最小項目': ''
        }
        self.questions_data = []
        self.text_buffer = []
        self.current_question = None
        self.debug_mode = False
    
    def extract_from_pdf(self, pdf_path: Union[str, Path]) -> List[Dict[str, Any]]:
        """
        PDFからテキストを抽出し、問題データを解析
        
        Args:
            pdf_path: PDFファイルのパス
            
        Returns:
            抽出された問題データのリスト
        """
        pdf_path = Path(pdf_path)
        if not pdf_path.exists():
            raise FileNotFoundError(f"PDFファイルが見つかりません: {pdf_path}")
        
        print(f"PDF抽出開始: {pdf_path.name}")
        
        # PDFからテキスト抽出
        text = self._extract_text_from_pdf(pdf_path)
        if not text.strip():
            raise ValueError("PDFからテキストを抽出できませんでした")
        
        print(f"抽出されたテキスト長: {len(text)}文字")
        
        # テキストをクリーニング
        cleaned_text = self._clean_text(text)
        
        # 問題データを解析
        self.questions_data = []
        self._parse_questions(cleaned_text)
        
        print(f"抽出された問題数: {len(self.questions_data)}")
        return self.questions_data
    
    def _extract_text_from_pdf(self, pdf_path: Path) -> str:
        """PDFからテキストを抽出（フォールバック対応）"""
        text = ""
        
        # 1. PyMuPDFを使用（推奨）
        if HAS_PYMUPDF:
            try:
                text = self._extract_with_pymupdf(pdf_path)
                if text.strip():
                    print("PyMuPDFでテキスト抽出成功")
                    return text
            except Exception as e:
                print(f"PyMuPDFでエラー: {e}")
        
        # 2. pdfplumberをフォールバック
        if HAS_PDFPLUMBER:
            try:
                text = self._extract_with_pdfplumber(pdf_path)
                if text.strip():
                    print("pdfplumberでテキスト抽出成功")
                    return text
            except Exception as e:
                print(f"pdfplumberでエラー: {e}")
        
        # 3. OCR（最後の手段）
        if HAS_PYTESSERACT and HAS_PIL:
            try:
                text = self._extract_with_ocr(pdf_path)
                if text.strip():
                    print("OCRでテキスト抽出成功")
                    return text
            except Exception as e:
                print(f"OCRでエラー: {e}")
        
        raise RuntimeError("すべてのテキスト抽出方法に失敗しました")
    
    def _extract_with_pymupdf(self, pdf_path: Path) -> str:
        """PyMuPDFを使用したテキスト抽出"""
        doc = fitz.open(str(pdf_path))
        text_parts = []
        
        try:
            for page_num in range(doc.page_count):
                page = doc[page_num]
                page_text = page.get_text()
                if page_text.strip():
                    text_parts.append(page_text)
        finally:
            doc.close()
        
        return '\n'.join(text_parts)
    
    def _extract_with_pdfplumber(self, pdf_path: Path) -> str:
        """pdfplumberを使用したテキスト抽出"""
        text_parts = []
        
        with pdfplumber.open(str(pdf_path)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
        
        return '\n'.join(text_parts)
    
    def _extract_with_ocr(self, pdf_path: Path) -> str:
        """OCRを使用したテキスト抽出"""
        # PyMuPDFを使って画像に変換してからOCR
        if not HAS_PYMUPDF:
            raise RuntimeError("OCRにはPyMuPDFが必要です")
        
        doc = fitz.open(str(pdf_path))
        text_parts = []
        
        try:
            for page_num in range(doc.page_count):
                page = doc[page_num]
                # まずテキスト抽出を試行
                page_text = page.get_text()
                
                if not page_text.strip():
                    # テキストが空の場合、OCRを実行
                    pix = page.get_pixmap()
                    img_data = pix.tobytes("png")
                    img = Image.open(io.BytesIO(img_data))
                    ocr_text = pytesseract.image_to_string(img, lang='jpn')
                    if ocr_text.strip():
                        text_parts.append(ocr_text)
                else:
                    text_parts.append(page_text)
        finally:
            doc.close()
        
        return '\n'.join(text_parts)
    
    def _clean_text(self, text: str) -> str:
        """テキストのクリーニング処理"""
        # 全角数字を半角に変換
        text = self._normalize_numbers(text)
        
        # 不要な文字を除去
        text = re.sub(r'[^\w\s\n\r\t。、．，：；！？「」『』（）〈〉【】○×〇▲△□■◆●・\-=]', '', text)
        
        # 連続する空白文字を正規化
        text = re.sub(r'\s+', ' ', text)
        
        # 連続する改行を正規化
        text = re.sub(r'\n\s*\n', '\n', text)
        
        return text.strip()
    
    def _normalize_numbers(self, text: str) -> str:
        """全角数字を半角数字に変換"""
        zen_to_han = str.maketrans('０１２３４５６７８９', '0123456789')
        return text.translate(zen_to_han)
    
    def _parse_questions(self, text: str) -> None:
        """テキストから問題データを解析"""
        lines = text.split('\n')
        i = 0
        
        while i < len(lines):
            line = lines[i].strip()
            if not line:
                i += 1
                continue
            
            # 階層構造の更新をチェック
            if self._update_hierarchy(line):
                i += 1
                continue
            
            # 問題番号の検出
            question_match = self._detect_question_number(line)
            if question_match:
                # 前の問題を保存
                if self.current_question:
                    self._finalize_current_question()
                
                # 新しい問題を開始
                self._start_new_question(question_match, lines, i)
                i += 1
                continue
            
            # 現在の問題に対する処理
            if self.current_question:
                # 年度検出
                if not self.current_question.get('出題年度'):
                    year = self._extract_year(line)
                    if year:
                        self.current_question['出題年度'] = year
                        i += 1
                        continue
                
                # 回答検出
                if not self.current_question.get('回答'):
                    answer = self._detect_answer(line)
                    if answer:
                        self.current_question['回答'] = answer
                        i += 1
                        continue
                
                # 解説または問題文の続き
                if line and not self._is_ignorable_line(line):
                    if '解説' in line or '【解説】' in line:
                        # 解説開始
                        explanation = self._extract_explanation(line, lines, i)
                        if explanation:
                            self.current_question['解説'] = explanation
                    else:
                        # 問題文の続き
                        current_text = self.current_question.get('問題', '')
                        if current_text and not current_text.endswith('。'):
                            current_text += ' '
                        self.current_question['問題'] = current_text + line
            
            i += 1
        
        # 最後の問題を保存
        if self.current_question:
            self._finalize_current_question()
    
    def _update_hierarchy(self, line: str) -> bool:
        """階層構造を更新"""
        for level, patterns in self.HIERARCHY_PATTERNS.items():
            for pattern in patterns:
                match = re.search(pattern, line, re.IGNORECASE)
                if match:
                    if match.groups():
                        self.current_hierarchy[level] = match.group(1).strip()
                    else:
                        self.current_hierarchy[level] = line.strip()
                    
                    # 下位レベルをクリア
                    levels = list(self.HIERARCHY_PATTERNS.keys())
                    current_index = levels.index(level)
                    for lower_level in levels[current_index + 1:]:
                        self.current_hierarchy[lower_level] = ''
                    
                    if self.debug_mode:
                        print(f"階層更新 {level}: {self.current_hierarchy[level]}")
                    return True
        
        return False
    
    def _detect_question_number(self, line: str) -> Optional[Tuple[str, str]]:
        """問題番号を検出"""
        for pattern in self.QUESTION_PATTERNS:
            match = re.match(pattern, line)
            if match:
                number = self._normalize_numbers(match.group(1))
                question_text = match.group(2).strip() if len(match.groups()) > 1 else ''
                
                # 問題番号の妥当性チェック
                try:
                    num_value = int(number)
                    if 1 <= num_value <= 1000:  # 妥当な範囲
                        return number, question_text
                except ValueError:
                    continue
        
        return None
    
    def _detect_answer(self, line: str) -> Optional[str]:
        """回答を検出"""
        for pattern in self.ANSWER_PATTERNS:
            match = re.search(pattern, line)
            if match:
                answer = match.group(1)
                # 正規化
                if answer == '○':
                    return '〇'
                elif answer in ['×', '〇']:
                    return answer
        
        return None
    
    def _extract_year(self, line: str) -> Optional[str]:
        """出題年度を抽出"""
        for pattern in self.YEAR_PATTERNS:
            match = re.search(pattern, line)
            if match:
                year_str = self._normalize_numbers(match.group(1))
                try:
                    year = int(year_str)
                    
                    # 令和年の判定
                    if pattern.startswith(r'[Rr]') or '令和' in pattern:
                        return f"R{year}"
                    # 平成年の判定
                    elif pattern.startswith(r'[Hh]') or '平成' in pattern:
                        return f"H{year}"
                    # 西暦の場合
                    elif pattern.startswith(r'20'):
                        # 2019年以降は令和に変換
                        if year >= 19:
                            return f"R{year - 18}"
                        else:
                            return f"H{year + 12}"  # 平成に変換
                    # その他の数字（文脈で判断）
                    else:
                        if 1 <= year <= 6:  # 令和の範囲
                            return f"R{year}"
                        elif 1 <= year <= 31:  # 平成の範囲
                            return f"H{year}"
                
                except ValueError:
                    continue
        
        return None
    
    def _extract_explanation(self, line: str, lines: List[str], start_index: int) -> str:
        """解説を抽出"""
        explanation_parts = []
        
        # 最初の行から解説部分を抽出
        if '解説' in line:
            exp_start = line.find('解説')
            if exp_start != -1:
                # 「解説」以降のテキストを取得
                remaining = line[exp_start + 2:].strip()
                if remaining and remaining != '】' and remaining != '】：':
                    explanation_parts.append(remaining)
        
        # 続きの行を読み込み
        i = start_index + 1
        while i < len(lines):
            next_line = lines[i].strip()
            
            # 次の問題や回答が始まったら終了
            if (self._detect_question_number(next_line) or 
                self._detect_answer(next_line) or
                not next_line):
                break
            
            if not self._is_ignorable_line(next_line):
                explanation_parts.append(next_line)
            
            i += 1
        
        return ' '.join(explanation_parts).strip()
    
    def _is_ignorable_line(self, line: str) -> bool:
        """無視すべき行かどうかを判定"""
        # 短すぎる行
        if len(line) < 3:
            return True
        
        # 数字のみの行
        if re.match(r'^\d+$', line):
            return True
        
        # 記号のみの行
        if re.match(r'^[・●○▲△□■◆\-=\s]+$', line):
            return True
        
        # ヘッダー・フッター的な行
        if re.match(r'^(ページ|Page|\d+/\d+|第\d+章)', line):
            return True
        
        # 装飾見出し（要件で無視指定）
        if re.match(r'^表[①②③④⑤]', line):
            return True
        
        return False
    
    def _start_new_question(self, question_match: Tuple[str, str], 
                           lines: List[str], index: int) -> None:
        """新しい問題を開始"""
        number, question_text = question_match
        
        self.current_question = {
            '大項目': self.current_hierarchy['大項目'],
            '中項目': self.current_hierarchy['中項目'],
            '小項目': self.current_hierarchy['小項目'],
            '最小項目': self.current_hierarchy['最小項目'],
            '問題番号': number,
            '出題年度': '',
            '問題': question_text,
            '解説': '',
            '回答': ''
        }
        
        if self.debug_mode:
            print(f"新しい問題開始: 問{number}")
    
    def _finalize_current_question(self) -> None:
        """現在の問題を完了し、リストに追加"""
        if self.current_question:
            # 必須項目のチェック
            if (self.current_question.get('問題番号') and 
                self.current_question.get('問題')):
                
                # デフォルト値の設定
                if not self.current_question.get('出題年度'):
                    self.current_question['出題年度'] = 'R6'  # デフォルト
                
                if not self.current_question.get('回答'):
                    self.current_question['回答'] = '×'  # デフォルト
                
                self.questions_data.append(self.current_question.copy())
                
                if self.debug_mode:
                    print(f"問題完了: 問{self.current_question['問題番号']}")
        
        self.current_question = None
    
    def save_to_csv(self, output_path: Union[str, Path]) -> None:
        """CSVファイルに保存"""
        output_path = Path(output_path)
        
        with open(output_path, 'w', newline='', encoding='utf-8-sig') as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=self.CSV_HEADERS)
            writer.writeheader()
            
            for question in self.questions_data:
                writer.writerow(question)
        
        print(f"Created: {output_path}")
    
    def save_to_excel(self, output_path: Union[str, Path]) -> None:
        """Excelファイルに保存"""
        if not HAS_PANDAS:
            print("Warning: pandas未インストールのためExcel出力をスキップします")
            return
        
        output_path = Path(output_path)
        
        try:
            df = pd.DataFrame(self.questions_data)
            df.to_excel(output_path, index=False, engine='openpyxl')
            print(f"Created: {output_path}")
        except ImportError:
            print("Warning: openpyxl未インストールのためExcel出力をスキップします")
        except Exception as e:
            print(f"Excel出力エラー: {e}")


def main():
    """メイン処理"""
    if len(sys.argv) < 2:
        print("使用方法: python3 extract.py <PDFファイルパス>")
        sys.exit(1)
    
    pdf_path = Path(sys.argv[1])
    
    # 依存関係チェック
    missing_deps = []
    if not HAS_PYMUPDF:
        missing_deps.append("PyMuPDF (pip install PyMuPDF)")
    if not HAS_PDFPLUMBER:
        missing_deps.append("pdfplumber (pip install pdfplumber)")
    if not HAS_PANDAS:
        missing_deps.append("pandas (pip install pandas openpyxl)")
    
    if missing_deps:
        print("警告: 以下の推奨パッケージがインストールされていません:")
        for dep in missing_deps:
            print(f"  - {dep}")
        print()
    
    # 抽出処理実行
    try:
        extractor = TakkenPDFExtractor()
        
        # デバッグモードの設定（環境変数で制御）
        extractor.debug_mode = os.getenv('DEBUG', '').lower() in ['1', 'true', 'yes']
        
        # PDF抽出
        questions = extractor.extract_from_pdf(pdf_path)
        
        if not questions:
            print("Error: 問題が抽出できませんでした")
            sys.exit(1)
        
        # 出力ファイル名を生成
        base_name = pdf_path.stem
        output_dir = pdf_path.parent
        
        csv_path = output_dir / f"{base_name}_parsed.csv"
        xlsx_path = output_dir / f"{base_name}_parsed.xlsx"
        
        # CSV出力
        extractor.save_to_csv(csv_path)
        
        # Excel出力
        extractor.save_to_excel(xlsx_path)
        
        print(f"\n抽出完了: {len(questions)}問")
        
        # 統計情報の表示
        if questions:
            correct_count = sum(1 for q in questions if q.get('回答') == '〇')
            incorrect_count = len(questions) - correct_count
            
            print(f"正解問題: {correct_count}")
            print(f"不正解問題: {incorrect_count}")
            
            # セクション別統計
            sections = {}
            for q in questions:
                section = q.get('大項目', 'その他')
                sections[section] = sections.get(section, 0) + 1
            
            print("\nセクション別問題数:")
            for section, count in sections.items():
                if section:
                    print(f"  {section}: {count}問")
    
    except FileNotFoundError as e:
        print(f"Error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Error: 処理中にエラーが発生しました: {e}")
        if extractor.debug_mode:
            import traceback
            traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()