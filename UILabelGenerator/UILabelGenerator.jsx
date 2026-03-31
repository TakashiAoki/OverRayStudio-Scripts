// UILabelGenerator.jsx  Ver.1.0.5
// Copyright (c) 2026 Over Ray Studio / Takashi Aoki @voyager_vision. All rights reserved.
// LastUpdate: 2026/03/31
// 選択したボタンパスにAI生成ラベルテキストを配置します

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

    // Claude API でラベルリスト生成
    var labels = generateLabels(config.anthropic_api_key, buttonInfoList, settings, glossaryTerms);
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

    var dlg = new Window("dialog", "UILabelGenerator  [" + shapeCount + " shapes]");
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.spacing = 8;
    dlg.margins = 16;

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

    // ── ボタン
    var grpBtn = dlg.add("group");
    grpBtn.alignment = ["right", "center"];
    var btnCancel = grpBtn.add("button", undefined, "キャンセル", { name: "cancel" });
    var btnOK     = grpBtn.add("button", undefined, "実行", { name: "ok" });

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
        text_anchor: "CENTER"
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
    // ボタン説明：サイズ＋グリッド位置
    var btnDesc = [];
    var maxRow = 0; var maxCol = 0;
    for (var i = 0; i < buttonInfoList.length; i++) {
        var b = buttonInfoList[i];
        if (b.row > maxRow) maxRow = b.row;
        if (b.col > maxCol) maxCol = b.col;
        var desc = "Button " + (i + 1) + ": w=" + Math.round(b.innerW) + "px h=" + Math.round(b.innerH) + "px";
        if (b.row > 0 && b.col > 0) desc += " row=" + b.row + " col=" + b.col;
        btnDesc.push(desc);
    }

    // グリッド情報
    var gridInfo = "";
    if (maxRow > 1 || maxCol > 1) {
        gridInfo = "\\nGrid structure: " + maxRow + " rows x " + maxCol + " cols detected.\\n" +
            "- Buttons in the same row are contextually related (parallel functions)\\n" +
            "- Buttons in the same col are hierarchically related (sequential/layered)\\n" +
            "- Make labels coherent within each row and column\\n";
    }

    var glossarySample = "";
    if (glossaryTerms.length > 0) {
        var sample = glossaryTerms.slice(0, 100);
        glossarySample = "\\nVocabulary inspiration (use freely as a springboard, add original terms as needed):\\n" + sample.join(", ");
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
        "- Return ONLY a JSON array of strings ordered by Button number. Example: [\"SCAN\",\"TARGET\",\"NAV\"]\\n\\n" +
        "Button layout:\\n" + btnDesc.join("\\n") +
        gridInfo +
        glossarySample

    // リクエストJSONをヘルパー用フォーマットで書き出す
    var reqFile  = new File("/tmp/_aab_req.json");
    var respFile = new File("/tmp/_aab_resp.json");

    // 念のため古いレスポンスを削除
    if (respFile.exists) respFile.remove();

    // api_key と body を分けて渡す（ヘルパー側でAPIキーを使う）
    var reqBody =
        '{\n' +
        '  "api_key": "' + escapeForJSON(apiKey) + '",\n' +
        '  "body": {\n' +
        '    "model": "claude-haiku-4-5-20251001",\n' +
        '    "max_tokens": 512,\n' +
        '    "messages": [{"role": "user", "content": "' + escapeForJSON(promptText) + '"}]\n' +
        '  }\n' +
        '}';

    reqFile.encoding = "UTF-8";
    reqFile.open("w");
    reqFile.write(reqBody);
    reqFile.close();

    // ヘルパーがレスポンスを返すまでポーリング（最大30秒）
    var maxWait  = 30000;
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
    var arrMatch = rawText.match(/\[[\s\S]*?\]/);
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
// JSON文字列用エスケープ
// ============================================================
function escapeForJSON(s) {
    return String(s)
        .replace(/\\/g, "\\\\")
        .replace(/"/g,  '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "")
        .replace(/\t/g, "\\t")
        .replace(/[\x00-\x1f\x7f]/g, "");
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
    // コメント行を除去してからeval
    src = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
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
    out += '    "text_anchor": "' + escapeForJSON(settings.text_anchor) + '"\n';
    out += '  }\n';
    out += '}\n';

    var f = new File(CONFIG_PATH);
    f.encoding = "UTF-8";
    f.open("w");
    f.write(out);
    f.close();
}
