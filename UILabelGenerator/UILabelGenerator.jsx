// UILabelGenerator.jsx  Ver.1.2.11
// Copyright (c) 2026 Over Ray Studio / Takashi Aoki @voyager_vision. All rights reserved.
// LastUpdate: 2026/04/04
// 選択したボタンパスにAI生成ラベルテキストを配置します

var SCRIPT_NAME    = "UILabelGenerator";
var SCRIPT_VERSION = "1.2.11";

// ============================================================
// 設定ファイルパス（スクリプトと同じフォルダ）
// ============================================================
var SCRIPT_DIR   = (new File($.fileName)).parent.fsName;
var CONFIG_PATH  = SCRIPT_DIR + "/config.json";
var PRESETS_PATH = SCRIPT_DIR + "/presets.json";
var GLOSSARY_PATH= SCRIPT_DIR + "/MG_Glossary_v27.1.csv";

// グレーパレット（輝度昇順）
var GRAY_PALETTE = [0, 26, 51, 77, 102, 128, 153, 179, 204, 230, 242, 255];

// ============================================================
// メイン
// ============================================================
(function () {
	var doc = checkActiveDocument();
	if (!doc) return;

	var selection = doc.selection;
	var allShapes = [];
	for (var i = 0; i < selection.length; i++) {
		allShapes = allShapes.concat(getAllShapes(selection[i]));
	}
	if (allShapes.length === 0) {
		alert("パスオブジェクトを1つ以上選択して下さい");
		return;
	}

	// 設定ファイル読み込み
	var config  = readJSON(CONFIG_PATH);
	var presets = readJSON(PRESETS_PATH);
	if (!config || !presets) {
		alert("設定ファイルの読み込みに失敗しました。\n" + CONFIG_PATH + "\n" + PRESETS_PATH);
		return;
	}

	// ダイアログ表示
	var settings = showDialog(config, presets, allShapes.length);
	if (!settings) return; // キャンセル

	// 前回値を保存
	saveLastSettings(config, settings);

	// ボタン情報取得
	var buttonInfoList = getButtonInfoList(allShapes);

	// 用語集ロード＋カテゴリ絞り込み
	var glossaryTerms = loadGlossaryTerms(settings.categories);

	// キーワードからUIパターンヒントを検索
	settings.patternHint = findPatternHint(settings.keywords, presets);

	// ラベル生成：連番 / 固定レイアウト / AI生成 の3分岐
	var kw   = (settings.keywords    || "").toLowerCase();
	var hint = (settings.patternHint || "").toLowerCase();
	var isNumpad = (kw.indexOf("テンキー") !== -1 || kw.indexOf("numpad")  !== -1 ||
					kw.indexOf("数字キー") !== -1 || kw.indexOf("計算機")  !== -1 ||
					kw.indexOf("電卓")     !== -1 || kw.indexOf("keypad")  !== -1 ||
					hint.indexOf("numeric keypad") !== -1);
	var isPhone = (!isNumpad &&
				   (kw.indexOf("電話")    !== -1 || kw.indexOf("ダイヤル") !== -1 ||
					kw.indexOf("phone")   !== -1 || kw.indexOf("dial")     !== -1 ||
					kw.indexOf("受話器")  !== -1 || hint.indexOf("phone keypad") !== -1));

	var labels;
	if (settings.seq_mode) {
		labels = generateSequentialLabels(buttonInfoList.length, settings);
	} else if (isNumpad) {
		// テンキー固定配列: APIを使わず形状・グリッドで直接割り当て
		labels = assignNumpadLabels(buttonInfoList);
	} else if (isPhone) {
		// 電話キー固定配列: APIを使わず直接割り当て
		labels = assignPhoneLabels(buttonInfoList);
	} else {
		labels = generateLabels(config.anthropic_api_key, buttonInfoList, settings, glossaryTerms);
	}
	if (!labels || labels.length === 0) {
		alert("ラベルの生成に失敗しました");
		return;
	}

	// テキスト配置
	placeLabels(doc, allShapes, buttonInfoList, labels, settings);

})();

// ============================================================
// ドキュメントチェック
// ============================================================
function checkActiveDocument() {
	if (app.documents.length === 0) {
		alert("アクティブドキュメントがありません");
		return null;
	}
	return app.activeDocument;
}

// ============================================================
// グループを再帰展開してシェイプ一覧を返す
// ============================================================
function getAllShapes(item) {
	var shapes = [];
	if (item.typename === "GroupItem") {
		for (var i = 0; i < item.pageItems.length; i++) {
			shapes = shapes.concat(getAllShapes(item.pageItems[i]));
		}
	} else {
		shapes.push(item);
	}
	return shapes;
}

// ============================================================
// ダイアログ
// ============================================================
function showDialog(config, presets, shapeCount) {
	var last = config.last_settings;

	var dlg = new Window("dialog", "UILabelGenerator  Ver." + SCRIPT_VERSION + "  [" + shapeCount + " shapes]");
	dlg.orientation = "column";
	dlg.alignChildren = ["fill", "top"];
	dlg.spacing = 8;
	dlg.margins = 16;

	// 前回の表示位置を復元
	if (last.dlg_x !== undefined && last.dlg_y !== undefined) {
		dlg.location = [last.dlg_x, last.dlg_y];
	}

	// ── プリセット
	var grpPreset = dlg.add("group");
	grpPreset.add("statictext", undefined, "シーンプリセット:");
	var ddPreset = grpPreset.add("dropdownlist", undefined, []);
	for (var i = 0; i < presets.presets.length; i++) {
		ddPreset.add("item", presets.presets[i].label);
	}
	var presetIndex = 0;
	for (var i = 0; i < presets.presets.length; i++) {
		if (presets.presets[i].id === last.preset_id) { presetIndex = i; break; }
	}
	ddPreset.selection = presetIndex;

	// ── 追加キーワード
	var grpKw = dlg.add("group");
	grpKw.add("statictext", undefined, "追加キーワード:");
	var etKeywords = grpKw.add("edittext", undefined, last.keywords || "");
	etKeywords.preferredSize.width = 260;

	// ── 言語 / スタイル
	var grpStyle = dlg.add("group");
	grpStyle.add("statictext", undefined, "スタイル:");
	var ddStyle = grpStyle.add("dropdownlist", undefined, []);
	for (var i = 0; i < presets.styles.length; i++) {
		ddStyle.add("item", presets.styles[i].label);
	}
	var styleIndex = 0;
	for (var i = 0; i < presets.styles.length; i++) {
		if (presets.styles[i].id === last.style_id) { styleIndex = i; break; }
	}
	ddStyle.selection = styleIndex;

	// ── フォント
	var grpFont = dlg.add("group");
	grpFont.add("statictext", undefined, "フォント:");
	var ddFont = grpFont.add("dropdownlist", undefined, []);
	for (var i = 0; i < presets.fonts.length; i++) {
		ddFont.add("item", presets.fonts[i].label);
	}
	var fontIndex = 0;
	for (var i = 0; i < presets.fonts.length; i++) {
		if (presets.fonts[i].label === last.font_label) { fontIndex = i; break; }
	}
	ddFont.selection = fontIndex;

	// ── フォントサイズ
	var grpSize = dlg.add("group");
	grpSize.add("statictext", undefined, "フォントサイズ:");
	var etSize = grpSize.add("edittext", undefined, String(last.font_size || 8));
	etSize.preferredSize.width = 50;

	// ── テキスト行揃え
	var grpAlign = dlg.add("group");
	grpAlign.add("statictext", undefined, "行揃え:");
	var ddAlign = grpAlign.add("dropdownlist", undefined, ["左", "中央", "右"]);
	var alignMap = { "LEFT": 0, "CENTER": 1, "RIGHT": 2 };
	ddAlign.selection = (last.align && alignMap[last.align] !== undefined) ? alignMap[last.align] : 1;

	// ── 区切り線
	dlg.add("panel", undefined, "");

	// ── 連番モード
	var grpSeq = dlg.add("group");
	grpSeq.orientation = "column";
	grpSeq.alignChildren = ["fill", "top"];
	grpSeq.spacing = 4;

	var grpSeqCheck = grpSeq.add("group");
	var cbSeq = grpSeqCheck.add("checkbox", undefined, "Sequential Mode (skip AI)");
	cbSeq.value = last.seq_mode || false;

	var grpSeqFmt = grpSeq.add("group");
	grpSeqFmt.add("statictext", undefined, "Format:");
	var etSeqFmt = grpSeqFmt.add("edittext", undefined, last.seq_format || "CH {n}");
	etSeqFmt.preferredSize.width = 120;
	grpSeqFmt.add("statictext", undefined, " From:");
	var etSeqStart = grpSeqFmt.add("edittext", undefined, String(last.seq_start || 0));
	etSeqStart.preferredSize.width = 35;
	grpSeqFmt.add("statictext", undefined, " Digits:");
	var etSeqDigit = grpSeqFmt.add("edittext", undefined, String(last.seq_digit || 2));
	etSeqDigit.preferredSize.width = 25;

	// 書式ヒントを表示
	var grpSeqHint = grpSeq.add("group");
	grpSeqHint.add("statictext", undefined, " {n}=00,01 {N}=1,2 {A}=A,B {tc}=HH:MM:SS");

	// 連番モードのON/OFFで入力欄の有効/無効を切り替え
	function updateSeqUI() {
		etSeqFmt.enabled  = cbSeq.value;
		etSeqStart.enabled = cbSeq.value;
		etSeqDigit.enabled = cbSeq.value;
	}
	cbSeq.onClick = updateSeqUI;
	updateSeqUI();

	// ── ボタン
	var grpBtn = dlg.add("group");
	grpBtn.alignment = ["right", "center"];
	var btnCancel = grpBtn.add("button", undefined, "Cancel", { name: "cancel" });
	var btnOK     = grpBtn.add("button", undefined, "Generate", { name: "ok" });

	btnCancel.onClick = function () { dlg.close(2); };
	btnOK.onClick = function () { dlg.close(1); };

	var result = dlg.show();
	if (result !== 1) return null;

	var selPreset = presets.presets[ddPreset.selection.index];
	var selStyle  = presets.styles[ddStyle.selection.index];
	var selFont   = presets.fonts[ddFont.selection.index];
	var alignKeys = ["LEFT", "CENTER", "RIGHT"];

	return {
		preset_id:   selPreset.id,
		preset_label:selPreset.label,
		keywords:    etKeywords.text,
		categories:  selPreset.categories,
		style_id:    selStyle.id,
		style_label: selStyle.label,
		font_label:  selFont.label,
		font_ps:     selFont.postscript,
		font_size:   parseFloat(etSize.text) || 8,
		align:       alignKeys[ddAlign.selection.index],
		text_anchor: "CENTER",
		seq_mode:    cbSeq.value,
		seq_format:  etSeqFmt.text,
		seq_start:   parseInt(etSeqStart.text) || 0,
		seq_digit:   parseInt(etSeqDigit.text) || 2,
		dlg_x:       dlg.location[0],
		dlg_y:       dlg.location[1]
	};
}

// ============================================================
// ボタン情報取得（グリッド行・列インデックス付き）
// ============================================================
function getButtonInfoList(shapes) {
	var list = [];
	for (var i = 0; i < shapes.length; i++) {
		var s = shapes[i];
		var bounds   = getGeometricBounds(s);
		var w = bounds[2] - bounds[0];
		var h = bounds[1] - bounds[3]; // Illustratorは上がプラス
		var cx = bounds[0] + w / 2;
		var cy = bounds[3] + h / 2;

		// 線幅・塗色取得
		var strokeW = s.stroked ? s.strokeWidth : 0;
		var fillRGB = getFillRGB(s);

		// 有効内径（線幅は中央揃え＝内側にstrokeW/2）
		var innerW = w - strokeW;
		var innerH = h - strokeW;

		list.push({
			index:   i,
			width:   w,
			height:  h,
			centerX: cx,
			centerY: cy,
			innerW:  innerW,
			innerH:  innerH,
			fillRGB: fillRGB,
			strokeW: strokeW,
			row: -1,  // detectGrid()で設定
			col: -1
		});
	}

	// グリッド構造を検出して row/col を付与
	detectGrid(list);

	// 左上から右下の順にソート（行優先、同行内は左から右）
	// IllustratorのY軸は上がプラスなので、centerYが大きいほど上＝行番号が小さい
	list.sort(function(a, b) {
		if (a.row !== b.row) return a.row - b.row;
		return a.col - b.col;
	});

	return list;
}

// ============================================================
// グリッド検出: centerX/Yの近似値でグループ化して行・列番号を付与
// ============================================================
function detectGrid(list) {
	var TOLERANCE = 10; // px以内は同じ行/列とみなす

	// centerX を昇順ソートして列グループを作成
	var colGroups = [];
	for (var i = 0; i < list.length; i++) {
		var cx = list[i].centerX;
		var found = false;
		for (var g = 0; g < colGroups.length; g++) {
			if (Math.abs(colGroups[g] - cx) <= TOLERANCE) {
				found = true; break;
			}
		}
		if (!found) colGroups.push(cx);
	}
	colGroups.sort(function(a, b) { return a - b; });

	// centerY を昇順ソートして行グループ（Y軸は反転）
	var rowGroups = [];
	for (var i = 0; i < list.length; i++) {
		var cy = list[i].centerY;
		var found = false;
		for (var g = 0; g < rowGroups.length; g++) {
			if (Math.abs(rowGroups[g] - cy) <= TOLERANCE) {
				found = true; break;
			}
		}
		if (!found) rowGroups.push(cy);
	}
	// IllustratorはY軸が上方向プラスなので降順＝上が行1
	rowGroups.sort(function(a, b) { return b - a; });

	// 各ボタンにrow/colを付与（1始まり）
	for (var i = 0; i < list.length; i++) {
		for (var g = 0; g < colGroups.length; g++) {
			if (Math.abs(colGroups[g] - list[i].centerX) <= TOLERANCE) {
				list[i].col = g + 1; break;
			}
		}
		for (var g = 0; g < rowGroups.length; g++) {
			if (Math.abs(rowGroups[g] - list[i].centerY) <= TOLERANCE) {
				list[i].row = g + 1; break;
			}
		}
	}
}

// ============================================================
// ジオメトリバウンズ取得
// ============================================================
function getGeometricBounds(item) {
	if (item.typename === "GroupItem" && item.clipped) {
		for (var i = 0; i < item.pageItems.length; i++) {
			if (item.pageItems[i].clipping) return item.pageItems[i].geometricBounds;
		}
	}
	return item.geometricBounds;
}

// ============================================================
// 塗り色をRGB {r,g,b} で取得
// ============================================================
function getFillRGB(shape) {
	if (!shape.filled) return { r: 128, g: 128, b: 128 };
	var fc = shape.fillColor;
	if (fc.typename === "RGBColor") {
		return { r: fc.red, g: fc.green, b: fc.blue };
	}
	if (fc.typename === "CMYKColor") {
		return {
			r: 255 * (1 - fc.cyan    / 100) * (1 - fc.black / 100),
			g: 255 * (1 - fc.magenta / 100) * (1 - fc.black / 100),
			b: 255 * (1 - fc.yellow  / 100) * (1 - fc.black / 100)
		};
	}
	if (fc.typename === "GrayColor") {
		var v = 255 * (1 - fc.gray / 100);
		return { r: v, g: v, b: v };
	}
	return { r: 128, g: 128, b: 128 };
}

// ============================================================
// キーワードからUIパターンヒントを検索
// ============================================================
function findPatternHint(keywords, presets) {
	if (!keywords || !presets.ui_pattern_hints) return "";
	var kw = keywords.toLowerCase();
	var matched = [];
	for (var i = 0; i < presets.ui_pattern_hints.length; i++) {
		var hint = presets.ui_pattern_hints[i];
		for (var j = 0; j < hint.keywords.length; j++) {
			if (kw.indexOf(hint.keywords[j].toLowerCase()) !== -1) {
				matched.push(hint.hint);
				break; // このヒントはマッチ済み、次へ
			}
		}
	}
	return matched.join("\\n");
}

// ============================================================
// 用語集CSVからカテゴリ絞り込みして用語リストを返す
// ============================================================
function loadGlossaryTerms(categories) {
	if (!categories || categories.length === 0) return [];

	var f = new File(GLOSSARY_PATH);
	if (!f.exists) return [];

	f.encoding = "UTF-8";
	f.open("r");
	var terms = [];
	while (!f.eof) {
		var line = f.readln();
		if (line.charAt(0) === "#" || line === "") continue;
		// CSV列: Category, Abbr, Full, JPN, Source, Scene, Memo
		var cols = splitCSV(line);
		if (cols.length < 3) continue;
		var cat  = trim(cols[0]);
		var abbr = trim(cols[1]);
		var full = trim(cols[2]);
		var jpn  = trim(cols[3] || "");

		for (var i = 0; i < categories.length; i++) {
			if (cat === categories[i]) {
				if (abbr) terms.push(abbr);
				if (full && full !== abbr) terms.push(full);
				if (jpn)  terms.push(jpn);
				break;
			}
		}
	}
	f.close();
	return terms;
}

// 簡易CSVパーサ（ダブルクォート対応）
function splitCSV(line) {
	var result = [];
	var cur = "";
	var inQ  = false;
	for (var i = 0; i < line.length; i++) {
		var c = line.charAt(i);
		if (c === '"') { inQ = !inQ; continue; }
		if (c === "," && !inQ) { result.push(cur); cur = ""; continue; }
		cur += c;
	}
	result.push(cur);
	return result;
}

function trim(s) {
	return s.replace(/^\s+|\s+$/g, "");
}

// ============================================================
// Claude API でラベルリスト生成（uilg_helper.py 経由）
// ============================================================
function generateLabels(apiKey, buttonInfoList, settings, glossaryTerms) {
	// ボタン群の左上座標を基準にした相対座標を計算
	var minX = buttonInfoList[0].centerX - buttonInfoList[0].innerW / 2;
	var maxY = buttonInfoList[0].centerY + buttonInfoList[0].innerH / 2;
	for (var i = 1; i < buttonInfoList.length; i++) {
		var b = buttonInfoList[i];
		var bLeft = b.centerX - b.innerW / 2;
		var bTop  = b.centerY + b.innerH / 2;
		if (bLeft < minX) minX = bLeft;
		if (bTop  > maxY) maxY = bTop;
	}

	// ボタン説明：サイズ＋縦横比＋相対位置＋グリッド位置
	var btnDesc = [];
	var maxRow = 0; var maxCol = 0;
	for (var i = 0; i < buttonInfoList.length; i++) {
		var b = buttonInfoList[i];
		if (b.row > maxRow) maxRow = b.row;
		if (b.col > maxCol) maxCol = b.col;

		var w = Math.round(b.innerW);
		var h = Math.round(b.innerH);
		var ratio = Math.round((b.innerW / b.innerH) * 10) / 10;

		// 相対位置（左上基準、Illustratorのy軸を反転）
		var relX = Math.round(b.centerX - b.innerW / 2 - minX);
		var relY = Math.round(maxY - (b.centerY + b.innerH / 2));

		var desc = "Button " + (i + 1) +
			": w=" + w + "px h=" + h + "px ratio=" + ratio +
			" pos=(" + relX + "," + relY + ")";

		if (b.row > 0 && b.col > 0) desc += " row=" + b.row + " col=" + b.col;

		// 横長・縦長の注記
		if (ratio >= 2.0) desc += " [wide: likely spans multiple cols]";
		if (ratio <= 0.6) desc += " [tall: likely spans multiple rows]";

		btnDesc.push(desc);
	}

	// グリッド情報
	var gridInfo = "";
	if (maxRow > 1 || maxCol > 1) {
		gridInfo = "\\nGrid structure: " + maxRow + " rows x " + maxCol + " cols detected.\\n" +
			"- Buttons in the same row are contextually related (parallel functions)\\n" +
			"- Buttons in the same col are hierarchically related (sequential/layered)\\n" +
			"- Make labels coherent within each row and column\\n";
		// 偶数列の場合はL/R対応を示唆
		if (maxCol >= 2 && maxCol % 2 === 0) {
			gridInfo +=
				"- BILATERAL LAYOUT DETECTED: " + maxCol + " cols can be treated as " + (maxCol / 2) + " left/right pairs.\\n" +
				"- Odd columns (1,3,...) = LEFT side components (prefix L or LEFT).\\n" +
				"- Even columns (2,4,...) = RIGHT side counterparts (prefix R or RIGHT).\\n" +
				"- Each row pair should share the same base term. Example: col1=L ARM SERVO, col2=R ARM SERVO\\n";
		}
	}

	var glossarySample = "";
	if (glossaryTerms.length > 0) {
		var sample = glossaryTerms.slice(0, 100);
		// 用語内のシングルクォート・特殊文字をサニタイズ
		var sanitized = [];
		for (var si = 0; si < sample.length; si++) {
			sanitized.push(sample[si].replace(/'/g, "").replace(/[^\x20-\x7E\u3000-\u9FFF]/g, ""));
		}
		glossarySample = "\\nVocabulary inspiration (use freely as a springboard, add original terms as needed):\\n" + sanitized.join(", ");
	}

	var kwText = settings.keywords ? "\\nAdditional keywords: " + escapeForJSON(settings.keywords) : "";

	var promptText =
		"You are a UI designer creating button labels for a fictional SF/military monitor graphics interface.\\n" +
		"Scene: " + escapeForJSON(settings.preset_label) + kwText + "\\n" +
		"Style: " + escapeForJSON(settings.style_label)  + "\\n" +
		"Font size: " + settings.font_size + "pt\\n\\n" +
		"Generate exactly " + buttonInfoList.length + " short button labels.\\n" +
		"Rules:\\n" +
		"- Each label must fit within the button width at font size " + settings.font_size + "pt\\n" +
		"- Shorter is better. Prioritize abbreviations and concise terms.\\n" +
		"- Labels must suit the scene and feel authentic to SF/military UI aesthetics\\n" +
		"- No duplicate labels\\n" +
		"- IMPORTANT: Output raw JSON array only. No markdown, no code blocks, no explanation.\\n" +
		"- VARIETY: Do not default to the first term that comes to mind. Think freely and choose diverse, contextually rich labels each time.\\n" +
		"- Example output: [\"SCAN\",\"TARGET\",\"NAV\"]\\n\\n" +
		(settings.patternHint ? "UI Pattern Hint:\\n" + escapeForJSON(settings.patternHint) + "\\n\\n" : "") +
		"Button layout:\\n" + btnDesc.join("\\n") +
		gridInfo +
		glossarySample

	// リクエストJSONをヘルパー用フォーマットで書き出す
	var reqFile  = new File("/private/tmp/_aab_req.json");
	var respFile = new File("/private/tmp/_aab_resp.json");

	// 念のため古いレスポンスを削除
	if (respFile.exists) respFile.remove();

	// api_key と body を分けて渡す（ヘルパー側でAPIキーを使う）
	var systemPrompt = "You are a creative UI label designer. " +
		"CRITICAL RULE: Every execution must produce a DIFFERENT set of labels than any previous run. " +
		"Never start with the same word twice in a row. " +
		"When given a domain (robotics, military, medical), explore the full vocabulary space, not just the most obvious terms. " +
		"Rotate through different subsystems and categories each time. " +
		"EXCEPTION: When the UI Pattern specifies a FIXED LAYOUT (numeric keypad, phone pad, direction keys, etc.), " +
		"always use the exact standard sequence specified — do not vary it. " +
		"Output ONLY a raw JSON array. No markdown, no explanation.";

	var reqBody =
		'{\n' +
		'  "api_key": "' + escapeForJSON(apiKey) + '",\n' +
		'  "caller": "' + SCRIPT_NAME + ' Ver.' + SCRIPT_VERSION + '",\n' +
		'  "body": {\n' +
		'    "model": "claude-haiku-4-5-20251001",\n' +
		'    "max_tokens": 512,\n' +
		'    "temperature": 1.0,\n' +
		'    "system": "' + escapeForJSON(systemPrompt) + '",\n' +
		'    "messages": [{"role": "user", "content": "' + escapeForJSON(promptText) + '"}]\n' +
		'  }\n' +
		'}';

	reqFile.encoding = "UTF-8";
	reqFile.open("w");
	reqFile.write(reqBody);
	reqFile.close();

	// 書き込み完了フラグを作成（Pythonブリッジはこのファイルを監視する）
	// reqFileが完全に書き終わった後に作成することで競合を防ぐ
	var readyFile = new File("/private/tmp/_aab_ready");
	readyFile.open("w");
	readyFile.write("1");
	readyFile.close();

	// ヘルパーがレスポンスを返すまでポーリング（最大90秒）
	// シンプルな単一ループ: respFileが出現するまで待ち続ける
	var maxWait  = 90000;
	var interval = 500;
	var waited   = 0;
	while (waited < maxWait) {
		$.sleep(interval);
		waited += interval;
		if (respFile.exists) break;
	}

	if (!respFile.exists) {
		// リクエストファイルが残っていたら削除
		if (reqFile.exists) reqFile.remove();
		alert(
			"Adobe API Bridge からの応答がありませんでした。\n\n" +
			"AdobeApiBridge.app を起動してから再実行してください。\n" +
			"python3 ~/AdobeApiBridge.app/Contents/Resources/adobe_api_bridge.py"
		);
		return null;
	}

	// レスポンス読み込み
	respFile.encoding = "UTF-8";
	respFile.open("r");
	var respText = respFile.read();
	respFile.close();
	respFile.remove();

	// JSONパース（eval使用）
	var respObj;
	try {
		respObj = eval("(" + respText + ")");
	} catch (e) {
		alert("レスポンスのパースに失敗しました:\n" + respText.substring(0, 300));
		return null;
	}

	if (!respObj.ok) {
		alert("APIエラー:\n" + respObj.error);
		return null;
	}

	// content[0].text からラベル配列を抽出
	var apiResp = respObj.response;
	if (!apiResp || !apiResp.content || !apiResp.content[0]) {
		alert("APIレスポンスの形式が不正です:\n" + respText.substring(0, 300));
		return null;
	}

	var rawText = apiResp.content[0].text;

	// コードブロック（```json ... ``` や ``` ... ```）を除去してから抽出
	var cleaned = rawText.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "").replace(/^\s+|\s+$/g, "");
	var arrMatch = cleaned.match(/\[[\s\S]*?\]/);
	if (!arrMatch) {
		// フォールバック：元テキストから直接抽出
		arrMatch = rawText.match(/\[[\s\S]*?\]/);
	}
	if (!arrMatch) {
		alert("ラベル配列の抽出に失敗しました:\n" + rawText.substring(0, 300));
		return null;
	}

	try {
		return eval(arrMatch[0]);
	} catch (e) {
		alert("ラベル配列のパースに失敗:\n" + e.message);
		return null;
	}
}

// ============================================================
// 連番ラベルを直接生成（AI不使用）
// ============================================================

// ============================================================
// テンキー固定配列ラベル割り当て（API不使用）
// ============================================================
function assignNumpadLabels(buttonInfoList) {
	// ============================================================
	// テンキー配列ルール（v1.2.11〜）
	//
	// 数字ゾーン検出: normalボタンの中で「最も密集した3×3ブロック」を自動検出
	//   → 全row/col組み合わせをスキャンして9個揃うブロックを探す
	//   → 候補が複数あれば最も下・最も左のブロックを採用
	//
	// 0キー: 数字ゾーン最下行の直下行で、数字ゾーンcolMinと同じかそれ以下のcol最小ボタン
	// . キー: 0の同行col+1ボタン（なければスキップ）
	// tall(ratio<=0.6): ENT
	// 残りnormal: funcKeys順（CLR,EQL,DIV,MUL,SUB,ADD,BS,ESC,TAB,DEL...）
	// ============================================================

	var TALL_RATIO = 0.6;

	var labels = [];
	var i;
	for (i = 0; i < buttonInfoList.length; i++) { labels.push(""); }

	// ① tall判定（形状で先に確定）
	var tallIdxList = [];
	for (i = 0; i < buttonInfoList.length; i++) {
		var b = buttonInfoList[i];
		var ratio = (b.innerH > 0) ? b.innerW / b.innerH : 1;
		if (ratio <= TALL_RATIO) tallIdxList.push(i);
	}

	// ② normalボタン（tall以外）を収集
	var normalList = [];// {idx, row, col}
	for (i = 0; i < buttonInfoList.length; i++) {
		var b = buttonInfoList[i];
		var ratio = (b.innerH > 0) ? b.innerW / b.innerH : 1;
		if (ratio > TALL_RATIO && b.row > 0 && b.col > 0) {
			normalList.push({idx: i, row: b.row, col: b.col});
		}
	}

	// ③ 使用されているrow・colの一覧を収集
	var rowSet = []; var colSet = [];
	for (var ni = 0; ni < normalList.length; ni++) {
		var r = normalList[ni].row; var c = normalList[ni].col;
		var fr = false; var fc = false;
		for (var ri = 0; ri < rowSet.length; ri++) { if (rowSet[ri] === r) { fr = true; break; } }
		for (var ci = 0; ci < colSet.length; ci++) { if (colSet[ci] === c) { fc = true; break; } }
		if (!fr) rowSet.push(r);
		if (!fc) colSet.push(c);
	}
	rowSet.sort(function(a, b) { return a - b; });
	colSet.sort(function(a, b) { return a - b; });

	// ④ 最も密集した3×3ブロックを探す
	// 候補: rowSet内の連続3行 × colSet内の連続3列
	// 評価: その9マスに実際にnormalボタンが存在する数
	// 同スコアなら row最大（より下）・col最小（より左）を優先
	var bestScore = 0;
	var bestRows = []; var bestCols = [];
	for (var ri = 0; ri <= rowSet.length - 3; ri++) {
		for (var ci = 0; ci <= colSet.length - 3; ci++) {
			var r3 = [rowSet[ri], rowSet[ri+1], rowSet[ri+2]];
			var c3 = [colSet[ci], colSet[ci+1], colSet[ci+2]];
			var score = 0;
			for (var ni = 0; ni < normalList.length; ni++) {
				var inR = false; var inC = false;
				for (var x = 0; x < 3; x++) {
					if (normalList[ni].row === r3[x]) inR = true;
					if (normalList[ni].col === c3[x]) inC = true;
				}
				if (inR && inC) score++;
			}
			// 同スコア: より下（rowSet[ri+2]が大きい）かつより左（colSet[ci]が小さい）を優先
			var better = (score > bestScore) ||
				(score === bestScore && score > 0 && (
					r3[2] > bestRows[2] ||
					(r3[2] === bestRows[2] && c3[0] < bestCols[0])
				));
			if (better) {
				bestScore = score; bestRows = r3; bestCols = c3;
			}
		}
	}

	// ⑤ 数字ゾーン3×3に 7,8,9 / 4,5,6 / 1,2,3 を割り当て
	var digitMap = [["7","8","9"],["4","5","6"],["1","2","3"]];
	if (bestScore > 0) {
		for (var ri = 0; ri < 3; ri++) {
			for (var ci = 0; ci < 3; ci++) {
				for (var ni = 0; ni < normalList.length; ni++) {
					if (normalList[ni].row === bestRows[ri] && normalList[ni].col === bestCols[ci]) {
						labels[normalList[ni].idx] = digitMap[ri][ci];
						break;
					}
				}
			}
		}
	}

	// ⑥ 0キー: 数字ゾーン最下行の直下行で colMin以下のcol最小ボタン
	// 直下行がなければmaxRowで探す
	var zoneRowMax = (bestRows.length > 0) ? bestRows[2] : 0;
	var zoneColMin = (bestCols.length > 0) ? bestCols[0] : 1;
	var maxRow = 0;
	for (i = 0; i < buttonInfoList.length; i++) {
		if (buttonInfoList[i].row > maxRow) maxRow = buttonInfoList[i].row;
	}

	// 数字ゾーン直下の行を探す（row > zoneRowMaxの最小行）
	var belowRow = -1;
	for (var ni = 0; ni < normalList.length; ni++) {
		var r = normalList[ni].row;
		if (r <= zoneRowMax) continue;
		if (belowRow < 0 || r < belowRow) belowRow = r;
	}
	// tallも含めて探す
	for (i = 0; i < buttonInfoList.length; i++) {
		var r = buttonInfoList[i].row;
		if (r <= zoneRowMax) continue;
		if (belowRow < 0 || r < belowRow) belowRow = r;
	}

	var zeroRow = (belowRow > 0) ? belowRow : maxRow;

	// zeroRow内でcolMin以下のcol最小ボタン
	var zeroIdx = -1; var zeroCol = -1;
	for (i = 0; i < buttonInfoList.length; i++) {
		var b = buttonInfoList[i];
		if (b.row !== zeroRow) continue;
		if (b.col > zoneColMin) continue;// 数字ゾーンcolMinより右はスキップ
		if (zeroIdx < 0 || b.col < zeroCol) { zeroIdx = i; zeroCol = b.col; }
	}
	// colMin以下に見つからなければzeroRow全体からcol最小
	if (zeroIdx < 0) {
		for (i = 0; i < buttonInfoList.length; i++) {
			var b = buttonInfoList[i];
			if (b.row !== zeroRow) continue;
			if (zeroIdx < 0 || b.col < zeroCol) { zeroIdx = i; zeroCol = b.col; }
		}
	}
	if (zeroIdx >= 0) labels[zeroIdx] = "0";

	// ⑦ 0の同行col+1 → "."
	if (zeroIdx >= 0) {
		for (i = 0; i < buttonInfoList.length; i++) {
			if (buttonInfoList[i].row === zeroRow && buttonInfoList[i].col === zeroCol + 1) {
				labels[i] = ".";
				break;
			}
		}
	}

	// ⑧ tall → "ENT"
	for (var ti = 0; ti < tallIdxList.length; ti++) {
		labels[tallIdxList[ti]] = "ENT";
	}

	// ⑨ 残りnormal → funcKeys（row/col順）
	var funcKeys = ["CLR","EQL","DIV","MUL","SUB","ADD","BS","ESC","TAB","DEL","F1","F2","F3","F4","F5","RET","INS","HOME","END","PGUP"];
	var fki = 0;
	var unassigned = [];
	for (i = 0; i < buttonInfoList.length; i++) {
		if (labels[i] === "") unassigned.push(i);
	}
	unassigned.sort(function(a, b) {
		if (buttonInfoList[a].row !== buttonInfoList[b].row)
			return buttonInfoList[a].row - buttonInfoList[b].row;
		return buttonInfoList[a].col - buttonInfoList[b].col;
	});
	for (var ui = 0; ui < unassigned.length; ui++) {
		if (fki < funcKeys.length) labels[unassigned[ui]] = funcKeys[fki++];
	}

	return labels;
}

function assignPhoneLabels(buttonInfoList) {
	// 電話キー標準配列: 3列×4行
	// row1:1,2,3 / row2:4,5,6 / row3:7,8,9 / row4:*,0,#
	var phoneGrid = [
		["1","2","3"],
		["4","5","6"],
		["7","8","9"],
		["*","0","#"]
	];

	var labels = [];
	for (var li = 0; li < buttonInfoList.length; li++) { labels.push(""); }

	// 行ごとにcol昇順で割り当て
	// まず使われている行番号を収集
	var rows = [];
	for (var i = 0; i < buttonInfoList.length; i++) {
		var r = buttonInfoList[i].row;
		var found = false;
		for (var ri = 0; ri < rows.length; ri++) {
			if (rows[ri] === r) { found = true; break; }
		}
		if (!found && r > 0) rows.push(r);
	}
	rows.sort(function(a, b) { return a - b; });

	for (var ri = 0; ri < rows.length && ri < 4; ri++) {
		var rowBtns = [];
		for (var i = 0; i < buttonInfoList.length; i++) {
			if (buttonInfoList[i].row === rows[ri]) rowBtns.push(i);
		}
		rowBtns.sort(function(a, b) {
			return buttonInfoList[a].col - buttonInfoList[b].col;
		});
		for (var ci = 0; ci < rowBtns.length && ci < 3; ci++) {
			labels[rowBtns[ci]] = phoneGrid[ri][ci];
		}
	}

	return labels;
}

function generateSequentialLabels(count, settings) {
	var fmt   = settings.seq_format || "{n}";
	var start = settings.seq_start  || 0;
	var digit = settings.seq_digit  || 2;
	var labels = [];

	for (var i = 0; i < count; i++) {
		var n = start + i;
		var label = fmt;

		// {n} → ゼロパディング数字
		if (label.indexOf("{n}") !== -1) {
			var s = String(n);
			while (s.length < digit) s = "0" + s;
			label = label.replace(/\{n\}/g, s);
		}
		// {N} → パディングなし数字
		if (label.indexOf("{N}") !== -1) {
			label = label.replace(/\{N\}/g, String(n));
		}
		// {A} → アルファベット（A〜Z、26超はAA,AB...）
		if (label.indexOf("{A}") !== -1) {
			var alpha = "";
			var idx = n;
			do {
				alpha = String.fromCharCode(65 + (idx % 26)) + alpha;
				idx = Math.floor(idx / 26) - 1;
			} while (idx >= 0);
			label = label.replace(/\{A\}/g, alpha);
		}
		// {tc} → タイムコード HH:MM:SS（start=秒数として扱う）
		if (label.indexOf("{tc}") !== -1) {
			var sec = n;
			var hh  = Math.floor(sec / 3600);
			var mm  = Math.floor((sec % 3600) / 60);
			var ss  = sec % 60;
			var tc  = (hh < 10 ? "0" : "") + hh + ":" +
					  (mm < 10 ? "0" : "") + mm + ":" +
					  (ss < 10 ? "0" : "") + ss;
			label = label.replace(/\{tc\}/g, tc);
		}

		labels.push(label);
	}
	return labels;
}

// ============================================================
// JSON文字列用エスケープ
// ============================================================
function escapeForJSON(s) {
	// 正規表現連鎖を避け1文字ずつcharCodeで処理（ExtendScript長文字列クラッシュ対策）
	var str = String(s);
	var out = "";
	for (var i = 0; i < str.length; i++) {
		var c = str.charAt(i);
		var code = str.charCodeAt(i);
		if      (c === "\\") { out += "\\\\"; }
		else if (c === "\"")  { out += "\\\""; }
		else if (c === "\n")  { out += "\\n"; }
		else if (c === "\r")  { out += ""; }
		else if (c === "\t")  { out += "\\t"; }
		else if (code < 0x20 || code === 0x7f) { /* 制御文字は除去 */ }
		else { out += c; }
	}
	return out;
}
// ============================================================
// テキスト配置
// ============================================================
function placeLabels(doc, shapes, buttonInfoList, labels, settings) {
	var textFrames = [];

	for (var i = 0; i < shapes.length; i++) {
		var shape = shapes[i];
		var info  = buttonInfoList[i];
		var label = labels[i] || "LABEL";

		// テキストフレーム作成
		var tf = doc.textFrames.add();
		tf.name = "UI_Label";
		tf.contents = label;

		// フォント設定
		setFont(tf, settings.font_ps);
		tf.textRange.characterAttributes.size = settings.font_size;

		// 行揃え
		var justMap = { "LEFT": Justification.LEFT, "CENTER": Justification.CENTER, "RIGHT": Justification.RIGHT };
		tf.textRange.paragraphAttributes.justification = justMap[settings.align] || Justification.CENTER;

		// 文字色（グレーパレットから選定）
		setTextColorFromPalette(shape, tf, info.fillRGB);

		// 中央に配置
		var tfBounds = tf.geometricBounds;
		var tfW = tfBounds[2] - tfBounds[0];
		var tfH = tfBounds[1] - tfBounds[3];
		var tx  = info.centerX - tfW / 2 - tfBounds[0];
		var ty  = info.centerY + tfH / 2 - tfBounds[1];
		tf.translate(tx, ty);

		textFrames.push(tf);
	}

	// 選択をテキストフレームに切り替え
	for (var i = 0; i < shapes.length; i++) { shapes[i].selected = false; }
	for (var i = 0; i < textFrames.length; i++) { textFrames[i].selected = true; }
}

// ============================================================
// フォント設定
// ============================================================
function setFont(tf, postscriptName) {
	try {
		tf.textRange.characterAttributes.textFont = textFonts.getByName(postscriptName);
	} catch (e) {
		try {
			tf.textRange.characterAttributes.textFont = textFonts.getByName("ArialMT");
		} catch (e2) { /* フォールバック失敗は無視 */ }
	}
}

// ============================================================
// グレーパレットから文字色を選定
// ============================================================
function setTextColorFromPalette(shape, tf, fillRGB) {
	var brightness = (fillRGB.r + fillRGB.g + fillRGB.b) / 3;

	// 輝度を反転させた値を起点に最近傍パレット値を選ぶ
	var targetBrightness = 255 - brightness;
	var closest = GRAY_PALETTE[0];
	var minDiff = Math.abs(GRAY_PALETTE[0] - targetBrightness);
	for (var i = 1; i < GRAY_PALETTE.length; i++) {
		var diff = Math.abs(GRAY_PALETTE[i] - targetBrightness);
		if (diff < minDiff) { minDiff = diff; closest = GRAY_PALETTE[i]; }
	}

	// 文字色が塗色と近すぎる場合（差が32未満）は反対側に寄せる
	// 例: 塗色128 → target127 → closest128 → 差0 → 26に補正
	if (Math.abs(closest - brightness) < 32) {
		closest = brightness >= 128 ? 26 : 230;
	}

	var col = new RGBColor();
	col.red = col.green = col.blue = closest;
	tf.textRange.characterAttributes.fillColor = col;
}

// ============================================================
// JSON読み込み
// ============================================================
function readJSON(path) {
	var f = new File(path);
	if (!f.exists) return null;
	f.encoding = "UTF-8";
	f.open("r");
	var src = f.read();
	f.close();
	// _comment キーはevalでそのまま読み込まれるので除去不要
	try { return eval("(" + src + ")"); } catch (e) { return null; }
}

// ============================================================
// 前回設定値を config.json に書き戻す
// ============================================================
function saveLastSettings(config, settings) {
	// ExtendScriptにはJSON.stringifyがないため手動でJSONを組み立てる
	var out = '{\n';
	out += '  "_comment": "UILabelGenerator config / Over Ray Studio",\n\n';
	out += '  "anthropic_api_key": "' + escapeForJSON(config.anthropic_api_key) + '",\n\n';
	out += '  "last_settings": {\n';
	out += '    "preset_id":   "' + escapeForJSON(settings.preset_id)   + '",\n';
	out += '    "keywords":    "' + escapeForJSON(settings.keywords)    + '",\n';
	out += '    "style_id":    "' + escapeForJSON(settings.style_id)    + '",\n';
	out += '    "font_label":  "' + escapeForJSON(settings.font_label)  + '",\n';
	out += '    "font_size":   '  + settings.font_size                  + ',\n';
	out += '    "align":       "' + escapeForJSON(settings.align)       + '",\n';
	out += '    "text_anchor": "' + escapeForJSON(settings.text_anchor) + '",\n';
	out += '    "seq_mode":    '  + (settings.seq_mode ? 'true' : 'false') + ',\n';
	out += '    "seq_format":  "' + escapeForJSON(settings.seq_format || 'CH {n}') + '",\n';
	out += '    "seq_start":   '  + (settings.seq_start || 0)           + ',\n';
	out += '    "seq_digit":   '  + (settings.seq_digit || 2)           + ',\n';
	out += '    "dlg_x":       '  + (settings.dlg_x || 100)                + ',\n';
	out += '    "dlg_y":       '  + (settings.dlg_y || 100)                + '\n';
	out += '  }\n';
	out += '}\n';

	var f = new File(CONFIG_PATH);
	f.encoding = "UTF-8";
	f.open("w");
	f.write(out);
	f.close();
}
