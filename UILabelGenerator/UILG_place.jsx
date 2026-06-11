// UILG_place.jsx  Ver.2.0.0 (Elena-driven architecture)
// Copyright (c) 2026 Over Ray Studio / Takashi Aoki @voyager_vision. All rights reserved.
// Folder.temp/uilg_input.json からラベル配列＋設定を読み、ボタンに配置する。
// 収集・ソートは UILG_collect.jsx と同一ロジック（labels[i] = ソート後i番目のボタン）。
//
// 入力JSON例: {"labels":["7","8","9"],"font_ps":"Square721BT-RomanExtended",
//              "font_size":8,"align":"CENTER","clear_existing":true}
// 戻り値: {"ok":true,"placed":N,"cleared":M}

(function () {

	var INPUT_PATH = Folder.temp.fsName + "/uilg_input.json";

	// ============================================================
	// 共有ロジック（UILG_collect.jsxと同一。変更時は両方更新すること）
	// ============================================================
	function collectTargets(doc) {
		var allShapes = [];
		var sel = doc.selection;
		if (sel && sel.length > 0) {
			for (var i = 0; i < sel.length; i++) {
				allShapes = allShapes.concat(getAllShapes(sel[i]));
			}
		} else {
			for (var i = 0; i < doc.pathItems.length; i++) {
				var p = doc.pathItems[i];
				if (!p.locked && !p.hidden && !p.clipping && p.editable) allShapes.push(p);
			}
		}
		var shapes = [];
		for (var i = 0; i < allShapes.length; i++) {
			if (allShapes[i].typename !== "TextFrame") shapes.push(allShapes[i]);
		}
		// 選択がテキストフレームのみだった場合（ラベル再生成時）は全パスにフォールバック
		if (shapes.length === 0 && allShapes.length > 0) {
			for (var i = 0; i < doc.pathItems.length; i++) {
				var p = doc.pathItems[i];
				if (!p.locked && !p.hidden && !p.clipping && p.editable) shapes.push(p);
			}
		}
		return shapes;
	}

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

	function getGeometricBounds(item) {
		if (item.typename === "GroupItem" && item.clipped) {
			for (var i = 0; i < item.pageItems.length; i++) {
				if (item.pageItems[i].clipping) return item.pageItems[i].geometricBounds;
			}
		}
		return item.geometricBounds;
	}

	function getFillRGB(shape) {
		if (!shape.filled) return { r: 128, g: 128, b: 128 };
		var fc = shape.fillColor;
		if (fc.typename === "RGBColor") return { r: fc.red, g: fc.green, b: fc.blue };
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

	function getButtonInfoList(shapes) {
		var list = [];
		for (var i = 0; i < shapes.length; i++) {
			var s = shapes[i];
			var bounds = getGeometricBounds(s);
			var w = bounds[2] - bounds[0];
			var h = bounds[1] - bounds[3];
			var strokeW = s.stroked ? s.strokeWidth : 0;
			list.push({
				index:   i,
				width:   w,
				height:  h,
				centerX: bounds[0] + w / 2,
				centerY: bounds[3] + h / 2,
				innerW:  w - strokeW,
				innerH:  h - strokeW,
				fillRGB: getFillRGB(s),
				strokeW: strokeW,
				row: -1,
				col: -1
			});
		}
		detectGrid(list);
		list.sort(function (a, b) {
			if (a.row !== b.row) return a.row - b.row;
			return a.col - b.col;
		});
		return list;
	}

	function detectGrid(list) {
		var TOLERANCE = 10;
		var WIDE_RATIO = 1.8;
		var TALL_RATIO = 0.6;

		var colGroups = [];
		var rowGroups = [];
		for (var i = 0; i < list.length; i++) {
			var b = list[i];
			var ratio = (b.innerH > 0) ? b.innerW / b.innerH : 1;
			if (ratio >= WIDE_RATIO || ratio <= TALL_RATIO) continue;

			var found = false;
			for (var g = 0; g < colGroups.length; g++) {
				if (Math.abs(colGroups[g] - b.centerX) <= TOLERANCE) { found = true; break; }
			}
			if (!found) colGroups.push(b.centerX);

			found = false;
			for (var g = 0; g < rowGroups.length; g++) {
				if (Math.abs(rowGroups[g] - b.centerY) <= TOLERANCE) { found = true; break; }
			}
			if (!found) rowGroups.push(b.centerY);
		}
		colGroups.sort(function (a, b) { return a - b; });
		rowGroups.sort(function (a, b) { return b - a; });

		for (var i = 0; i < list.length; i++) {
			var b = list[i];
			var ratio = (b.innerH > 0) ? b.innerW / b.innerH : 1;
			var isOdd = (ratio >= WIDE_RATIO || ratio <= TALL_RATIO);

			var bestIdx = -1; var bestDist = 9999;
			for (var g = 0; g < colGroups.length; g++) {
				var dist = Math.abs(colGroups[g] - b.centerX);
				var thresh = isOdd ? 9999 : TOLERANCE;
				if (dist <= thresh && dist < bestDist) { bestDist = dist; bestIdx = g; }
			}
			if (bestIdx >= 0) b.col = bestIdx + 1;

			bestIdx = -1; bestDist = 9999;
			for (var g = 0; g < rowGroups.length; g++) {
				var dist = Math.abs(rowGroups[g] - b.centerY);
				var thresh = isOdd ? 9999 : TOLERANCE;
				if (dist <= thresh && dist < bestDist) { bestDist = dist; bestIdx = g; }
			}
			if (bestIdx >= 0) b.row = bestIdx + 1;
		}
	}

	// ============================================================
	// 配置（v1のplaceLabels/setFont/setTextColorFromPaletteを継承）
	// ============================================================
	var GRAY_PALETTE = [0, 26, 51, 77, 102, 128, 153, 179, 204, 230, 242, 255];

	function setFont(tf, postscriptName) {
		try {
			tf.textRange.characterAttributes.textFont = textFonts.getByName(postscriptName);
		} catch (e) {
			try {
				tf.textRange.characterAttributes.textFont = textFonts.getByName("ArialMT");
			} catch (e2) { }
		}
	}

	function setTextColorFromPalette(tf, fillRGB) {
		var brightness = (fillRGB.r + fillRGB.g + fillRGB.b) / 3;
		var targetBrightness = 255 - brightness;
		var closest = GRAY_PALETTE[0];
		var minDiff = Math.abs(GRAY_PALETTE[0] - targetBrightness);
		for (var i = 1; i < GRAY_PALETTE.length; i++) {
			var diff = Math.abs(GRAY_PALETTE[i] - targetBrightness);
			if (diff < minDiff) { minDiff = diff; closest = GRAY_PALETTE[i]; }
		}
		if (Math.abs(closest - brightness) < 32) {
			closest = brightness >= 128 ? 26 : 230;
		}
		var col = new RGBColor();
		col.red = col.green = col.blue = closest;
		tf.textRange.characterAttributes.fillColor = col;
	}

	// ラベル専用レイヤーを取得（なければ作成）。表示・ロック解除も保証
	function getLabelLayer(doc) {
		var layer;
		try { layer = doc.layers.getByName("UI_Labels"); }
		catch (e) {
			layer = doc.layers.add();
			layer.name = "UI_Labels";
		}
		layer.visible = true;
		layer.locked = false;
		return layer;
	}

	// 既存の UI_Label テキストフレームを削除（再実行での差し替え用）
	// 非表示・ロック中レイヤー上のものは編集不可のためスキップ
	function clearExistingLabels(doc) {
		var removed = 0;
		for (var i = doc.textFrames.length - 1; i >= 0; i--) {
			var tf = doc.textFrames[i];
			if (tf.name !== "UI_Label") continue;
			if (tf.locked || tf.hidden) continue;
			var lay = tf.layer;
			if (lay && (lay.locked || !lay.visible)) continue;
			tf.remove();
			removed++;
		}
		return removed;
	}

	// ============================================================
	// メイン
	// ============================================================
	if (app.documents.length === 0) return '{"ok":false,"error":"no active document"}';
	var doc = app.activeDocument;

	// 入力読み込み
	var inFile = new File(INPUT_PATH);
	if (!inFile.exists) return '{"ok":false,"error":"input not found: ' + INPUT_PATH.replace(/\\/g, '/') + '"}';
	inFile.encoding = "UTF-8";
	inFile.open("r");
	var src = inFile.read();
	inFile.close();

	var input;
	try { input = eval("(" + src + ")"); }
	catch (e) { return '{"ok":false,"error":"input parse failed"}'; }
	if (!input || !input.labels || input.labels.length === 0) {
		return '{"ok":false,"error":"no labels in input"}';
	}

	var cleared = 0;
	if (input.clear_existing !== false) cleared = clearExistingLabels(doc);

	var shapes = collectTargets(doc);
	if (shapes.length === 0) return '{"ok":false,"error":"no target shapes"}';
	var infoList = getButtonInfoList(shapes);

	if (input.labels.length !== infoList.length) {
		return '{"ok":false,"error":"label count mismatch: labels=' + input.labels.length +
			' buttons=' + infoList.length + '"}';
	}

	var fontPS   = input.font_ps   || "ArialMT";
	var fontSize = input.font_size || 8;
	var justMap  = { "LEFT": Justification.LEFT, "CENTER": Justification.CENTER, "RIGHT": Justification.RIGHT };
	var just     = justMap[input.align || "CENTER"] || Justification.CENTER;

	var labelLayer = getLabelLayer(doc);
	var textFrames = [];
	for (var i = 0; i < infoList.length; i++) {
		var info  = infoList[i];
		var label = String(input.labels[i]);

		var tf = labelLayer.textFrames.add();
		tf.name = "UI_Label";
		tf.contents = label;
		setFont(tf, fontPS);
		tf.textRange.characterAttributes.size = fontSize;
		tf.textRange.paragraphAttributes.justification = just;
		setTextColorFromPalette(tf, info.fillRGB);

		var tfBounds = tf.geometricBounds;
		var tfW = tfBounds[2] - tfBounds[0];
		var tfH = tfBounds[1] - tfBounds[3];
		tf.translate(
			info.centerX - tfW / 2 - tfBounds[0],
			info.centerY + tfH / 2 - tfBounds[1]
		);
		textFrames.push(tf);
	}

	// 選択をラベルに切り替え
	doc.selection = null;
	for (var i = 0; i < textFrames.length; i++) { textFrames[i].selected = true; }

	return '{"ok":true,"placed":' + textFrames.length + ',"cleared":' + cleared + '}';

})();
