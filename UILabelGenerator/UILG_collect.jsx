// UILG_collect.jsx  Ver.2.0.0 (Elena-driven architecture)
// Copyright (c) 2026 Over Ray Studio / Takashi Aoki @voyager_vision. All rights reserved.
// 選択中（または全パス）のボタン形状・グリッド情報をJSONで返す。
// エレナ（Claude Code）がCOM/osascriptブリッジ経由で実行し、戻り値JSONを読んで
// ラベルを生成 → UILG_place.jsx で配置する。AI生成はエレナ本体が担うため
// APIキー・常駐ヘルパー・ポーリングは不要。
//
// 戻り値: {"ok":true,"doc":"...","count":N,"grid":{"rows":R,"cols":C},"buttons":[...]}

(function () {

	// ============================================================
	// 収集対象: 選択があれば選択、なければ全パスアイテム
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
		// テキストフレーム（既存ラベル等）は対象外
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

	// ============================================================
	// ボタン情報リスト（v1のgetButtonInfoList/detectGridを継承）
	// ============================================================
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
	// JSON組み立て（ExtendScriptにJSON.stringifyはない）
	// ============================================================
	function num(v) { return Math.round(v * 10) / 10; }

	function buildJSON(docName, list) {
		var maxRow = 0; var maxCol = 0;
		var parts = [];
		for (var i = 0; i < list.length; i++) {
			var b = list[i];
			if (b.row > maxRow) maxRow = b.row;
			if (b.col > maxCol) maxCol = b.col;
			var ratio = (b.innerH > 0) ? num(b.innerW / b.innerH) : 1;
			parts.push('{"i":' + b.index +
				',"row":' + b.row + ',"col":' + b.col +
				',"w":' + num(b.innerW) + ',"h":' + num(b.innerH) +
				',"ratio":' + ratio +
				',"cx":' + num(b.centerX) + ',"cy":' + num(b.centerY) +
				',"fill":[' + Math.round(b.fillRGB.r) + ',' + Math.round(b.fillRGB.g) + ',' + Math.round(b.fillRGB.b) + ']}');
		}
		return '{"ok":true,"doc":"' + docName.replace(/"/g, '\\"') + '"' +
			',"count":' + list.length +
			',"grid":{"rows":' + maxRow + ',"cols":' + maxCol + '}' +
			',"buttons":[' + parts.join(',') + ']}';
	}

	// ============================================================
	// メイン
	// ============================================================
	if (app.documents.length === 0) return '{"ok":false,"error":"no active document"}';
	var doc = app.activeDocument;
	var shapes = collectTargets(doc);
	if (shapes.length === 0) return '{"ok":false,"error":"no target shapes"}';

	return buildJSON(doc.name, getButtonInfoList(shapes));

})();
