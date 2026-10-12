/*
 * 전성분 글자 → 성분 목록으로 나누고, 성분 DB와 대조한다.
 * 브라우저(window.Matcher)와 Node(require) 양쪽에서 쓴다. 화면 코드는 넣지 않는다.
 *
 * 원본 앱(SubActivity)과 달라진 점
 * - 쉼표·마침표만이 아니라 가운뎃점·세미콜론·슬래시 없는 줄바꿈 등으로 나누고,
 *   "1,2-헥산다이올"처럼 숫자 사이 쉼표는 성분 이름의 일부로 둔다.
 * - "전성분:" 같은 머리말, 함량(%), 괄호 속 영문 병기를 정리한다.
 * - 띄어쓰기·하이픈·대소문자를 무시하고 비교한다 (영문명 포함).
 * - 이름이 하나로 같지 않아도 OCR 오타 1~2글자는 "비슷한 이름"으로 잡는다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Matcher = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CATEGORIES = ['caution', 'allergy', 'good'];

  // 비교용 키: 공백·하이픈·가운뎃점·괄호 기호를 없애고 소문자로
  function normalize(s) {
    return String(s || '')
      .normalize('NFC')
      .toLowerCase()
      .replace(/[\s\-‐‑–—_·ㆍ・'’`"“”]/g, '')
      .replace(/[［【〔{<]/g, '(')
      .replace(/[］】〕}>]/g, ')');
  }

  var HEADER = /^(?:\[?\s*(?:전\s*성\s*분|성\s*분\s*명?|ingredients?|全成分)\s*\]?\s*[:：]?\s*)/i;

  var LINE_JOIN = '\u0001';

  // OCR 글자 → 성분 후보 배열 (줄바꿈으로 이어 붙인 자리에 LINE_JOIN 표시가 남는다)
  function splitRaw(text) {
    var t = String(text || '').normalize('NFC');

    // 줄 끝 하이픈으로 끊긴 단어는 붙이고, 나머지 줄바꿈은 구분자로 본다.
    // (원본 앱은 줄바꿈을 그냥 지워서 줄 끝 성분과 다음 줄 성분이 붙는 일이 많았다)
    t = t.replace(/-\s*\n\s*/g, '-');
    // 한 성분이 두 줄로 나뉜 경우: 줄이 구분자 없이 끝나고 다음 줄이 한글로 이어지면 붙인다.
    // 붙인 자리를 표시해 두고, 붙인 이름이 DB에 없으면 analyze()가 줄별로 다시 찾아본다.
    t = t.replace(/([가-힣])[ \t]*\n\s*(?=[가-힣])/g, '$1' + LINE_JOIN);
    t = t.replace(/\n+/g, ',');

    // 숫자 사이 쉼표(1,2-헥산다이올)는 지키고 나머지 쉼표를 구분자로
    t = t.replace(/(\d)\s*,\s*(?=\d)/g, '$1\u0000');
    var parts = t.split(/[,，、;；·ㆍ•|]|\.(?!\d)/);

    var out = [];
    parts.forEach(function (raw) {
      var s = raw.replace(/\u0000/g, ',').trim();
      s = s.replace(HEADER, '');
      s = s.replace(/\(?\s*\d+(?:\.\d+)?\s*%\s*\)?/g, ''); // 함량 표기
      s = s.replace(/^[\s:：\-*()]+|[\s:：\-*]+$/g, '');
      if (!s) return;
      if (!/[가-힣a-zA-Z]/.test(s)) return; // 숫자·기호만 남은 조각
      out.push(s);
    });
    return out;
  }

  function splitIngredients(text) {
    return splitRaw(text).map(function (s) { return s.split(LINE_JOIN).join(''); });
  }

  // 성분 DB → 비교용 색인. 이름에 ;로 적힌 다른 표기와 영문명도 같은 성분으로 본다.
  function buildIndex(db) {
    var index = { exact: new Map(), entries: [] };
    CATEGORIES.forEach(function (cat) {
      (db[cat] || []).forEach(function (row) {
        var names = String(row.name).split(';').map(function (n) { return n.trim(); }).filter(Boolean);
        var entry = {
          category: cat,
          name: names[0],
          aliases: names.slice(1),
          english: row.english || '',
          comment: row.comment || '',
          tags: row.tags || [],
          skin: row.skin || { good: [], avoid: [] },
          keys: []
        };
        names.concat(row.english ? [row.english] : []).forEach(function (n) {
          var k = normalize(n);
          if (!k || entry.keys.indexOf(k) !== -1) return;
          entry.keys.push(k);
          if (!index.exact.has(k)) index.exact.set(k, []);
          index.exact.get(k).push(entry);
        });
        index.entries.push(entry);
      });
    });
    return index;
  }

  // 레벤슈타인 거리 (limit을 넘으면 일찍 멈춘다)
  function distance(a, b, limit) {
    if (Math.abs(a.length - b.length) > limit) return limit + 1;
    var prev = new Array(b.length + 1);
    for (var j = 0; j <= b.length; j++) prev[j] = j;
    for (var i = 1; i <= a.length; i++) {
      var cur = [i];
      var rowMin = i;
      for (var k = 1; k <= b.length; k++) {
        var cost = a.charCodeAt(i - 1) === b.charCodeAt(k - 1) ? 0 : 1;
        cur[k] = Math.min(prev[k] + 1, cur[k - 1] + 1, prev[k - 1] + cost);
        if (cur[k] < rowMin) rowMin = cur[k];
      }
      if (rowMin > limit) return limit + 1;
      prev = cur;
    }
    return prev[b.length];
  }

  // 글자 수에 따라 허용할 오타 수. 짧은 이름은 오타 하나로도 다른 성분이 되므로 정확히만.
  function fuzzyLimit(len) {
    if (len >= 9) return 2;
    if (len >= 5) return 1;
    return 0;
  }

  function findFuzzy(key, index) {
    var limit = fuzzyLimit(key.length);
    if (!limit) return null;
    var best = null;
    var bestD = limit + 1;
    index.entries.forEach(function (entry) {
      entry.keys.forEach(function (k) {
        if (fuzzyLimit(k.length) === 0) return;
        var d = distance(key, k, Math.min(limit, bestD - 1));
        if (d < bestD) { bestD = d; best = [entry]; }
        else if (d === bestD && best && best.indexOf(entry) === -1) best.push(entry);
      });
    });
    return best;
  }

  // 성분 목록 → 분류별 결과
  // match: 'exact'(정확히 같음) | 'similar'(OCR 오타로 보이는 비슷한 이름)
  function analyze(text, index) {
    var raws = splitRaw(text);
    var tokens = raws.map(function (s) { return s.split(LINE_JOIN).join(''); });
    // items: 전성분 순서 그대로, 각 성분이 사전의 어느 성분과 맞았는지 (없으면 hits: [])
    var result = {
      tokens: tokens,
      items: tokens.map(function (t) { return { token: t, key: normalize(t), hits: [] }; }),
      caution: [], allergy: [], good: []
    };
    var seen = new Set();

    function keysOf(s) {
      var keys = [];
      (function add(str) {
        var key = normalize(str);
        if (key && keys.indexOf(key) === -1) keys.push(key);
        // 괄호 속 병기(예: "글리세린(Glycerin)")는 앞부분과 괄호 안을 각각 시도
        var m = key.match(/^(.+?)\((.+)\)$/);
        if (m) { add(m[1]); add(m[2]); }
      })(s);
      return keys;
    }
    function lookup(keys, how) {
      for (var i = 0; i < keys.length; i++) {
        var found = how === 'exact' ? index.exact.get(keys[i]) : findFuzzy(keys[i], index);
        if (found) return found;
      }
      return null;
    }
    var current = null; // 지금 보고 있는 전성분 항목
    function add(found, how, token) {
      found.forEach(function (entry) {
        if (current.hits.indexOf(entry) === -1) current.hits.push(entry);
        var id = entry.category + ':' + entry.name;
        if (seen.has(id)) return;
        seen.add(id);
        result[entry.category].push({
          name: entry.name,
          english: entry.english,
          comment: entry.comment,
          tags: entry.tags,
          skin: entry.skin,
          read: token,
          match: how
        });
      });
    }

    raws.forEach(function (raw, n) {
      current = result.items[n];
      var token = tokens[n];
      var whole = keysOf(token);
      var found = lookup(whole, 'exact');
      if (found) return add(found, 'exact', token);

      // 줄을 이어 붙인 이름이 DB에 없으면, 원래 줄마다 따로 찾는다 (쉼표가 빠진 두 성분일 수 있다)
      var pieces = raw.indexOf(LINE_JOIN) === -1 ? [] : raw.split(LINE_JOIN);
      var pieceHit = false;
      pieces.forEach(function (piece) {
        var f = lookup(keysOf(piece), 'exact');
        if (f) { pieceHit = true; add(f, 'exact', piece.trim()); }
      });
      if (pieceHit) return;

      found = lookup(whole, 'similar');
      if (found) return add(found, 'similar', token);
      pieces.forEach(function (piece) {
        var f = lookup(keysOf(piece), 'similar');
        if (f) add(f, 'similar', piece.trim());
      });
    });
    return result;
  }

  // 성분 이름 검색 (한글·영문, 부분 일치)
  function search(query, index, limit) {
    var q = normalize(query);
    if (!q) return [];
    var hits = [];
    index.entries.forEach(function (entry) {
      var rank = -1;
      entry.keys.forEach(function (k) {
        var p = k.indexOf(q);
        if (p === -1) return;
        var r = (k === q ? 0 : p === 0 ? 1 : 2);
        if (rank === -1 || r < rank) rank = r;
      });
      if (rank !== -1) hits.push({ entry: entry, rank: rank });
    });
    hits.sort(function (a, b) {
      return a.rank - b.rank || a.entry.name.length - b.entry.name.length || a.entry.name.localeCompare(b.entry.name, 'ko');
    });
    return hits.slice(0, limit || 50).map(function (h) { return h.entry; });
  }

  return {
    CATEGORIES: CATEGORIES,
    normalize: normalize,
    splitIngredients: splitIngredients,
    buildIndex: buildIndex,
    analyze: analyze,
    search: search,
    distance: distance
  };
});
