/*
 * 분석 결과를 "나" 기준으로 읽는 계산들. 화면 코드는 넣지 않는다 (Node 테스트 가능).
 * - personal(): 내 피부 프로필로 본 분석 결과 (피할 성분, 피부 타입 안내, 고민 맞춤 성분)
 * - expiry(): 개봉일 + 사용기한 → 남은 날
 * - trouble(): 트러블 난 화장품들에 공통으로 든 성분
 * - compare(): 두 화장품의 같은 성분 / 다른 성분
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./matcher.js'));
  else root.Insights = factory(root.Matcher);
})(typeof self !== 'undefined' ? self : this, function (Matcher) {
  'use strict';

  var SKIN = {
    dry: '건성', oily: '지성', combination: '복합성', sensitive: '민감성', unknown: '잘 모르겠어요'
  };
  var CONCERN = { uv: '자외선 차단', whitening: '미백', wrinkle: '주름 개선' };
  // 피할 성분 묶음 (사전 태그)
  var GROUP = {
    fragrance: '향료',
    allergen: '알레르기 유발 착향제',
    paraben: '파라벤',
    tar: '타르색소',
    peg: 'PEG 계열',
    sulfate: '황산염 계면활성제',
    preservative: '방부제',
    antioxidant: '합성 산화방지제',
    sunscreen: '유기 자외선 차단제',
    etc: '기타 주의 성분',
    uv: '자외선 차단',
    whitening: '미백',
    wrinkle: '주름 개선'
  };
  var AVOID_GROUPS = ['fragrance', 'allergen', 'paraben', 'tar', 'peg', 'sulfate'];
  var PRODUCT = {
    toner: '스킨·토너', serum: '세럼·앰플', lotion: '로션·에멀전', cream: '크림',
    sun: '선케어', cleanser: '클렌저', makeup: '메이크업', etc: '기타'
  };
  var RATING = { good: '잘 맞아요', soso: '보통이에요', bad: '트러블 났어요' };
  // 화장품 공통 바탕 성분: 트러블 원인 후보에서 뺀다
  var BASE = ['정제수', '물', 'water', 'aqua', '글리세린', 'glycerin'].map(Matcher.normalize);

  function uniq(arr) { return arr.filter(function (x, i) { return arr.indexOf(x) === i; }); }

  // result: Matcher.analyze() 결과, profile: Store.profile()
  function personal(result, profile) {
    profile = profile || {};
    var avoidKeys = (profile.avoid || []).map(Matcher.normalize);
    var groups = profile.avoidGroups || [];
    var skin = profile.skinType;
    var out = { avoidHits: [], skinAvoid: [], skinGood: [], concern: {}, hasProfile: !!(skin || groups.length || avoidKeys.length || (profile.concerns || []).length) };

    (profile.concerns || []).forEach(function (c) { out.concern[c] = []; });

    var seenAvoid = {};
    result.items.forEach(function (item) {
      var names = item.hits.map(function (h) { return h.name; });
      var keys = [item.key].concat(item.hits.map(function (h) { return h.keys; }).reduce(function (a, b) { return a.concat(b); }, []));
      var label = names[0] || item.token;

      // 1) 내가 고른 피할 성분
      if (avoidKeys.some(function (k) { return keys.indexOf(k) !== -1; }) && !seenAvoid[label]) {
        seenAvoid[label] = true;
        out.avoidHits.push({ name: label, why: '내가 피하기로 한 성분' });
      }
      // 2) 피할 성분 묶음 (향료, 파라벤 …)
      item.hits.forEach(function (h) {
        h.tags.forEach(function (t) {
          if (groups.indexOf(t) === -1 || seenAvoid[h.name]) return;
          if (h.category === 'good') return; // 좋은 성분의 효능 태그는 피할 묶음이 아니다
          seenAvoid[h.name] = true;
          out.avoidHits.push({ name: h.name, why: GROUP[t] });
        });
      });
    });

    result.good.forEach(function (g) {
      if (skin && g.skin.avoid.indexOf(skin) !== -1) out.skinAvoid.push(g.name);
      if (skin && g.skin.good.indexOf(skin) !== -1) out.skinGood.push(g.name);
      g.tags.forEach(function (t) { if (out.concern[t]) out.concern[t].push(g.name); });
    });

    out.level = out.avoidHits.length ? 'warn' : out.skinAvoid.length ? 'check' : 'ok';
    return out;
  }

  // 개봉일(YYYY-MM-DD)과 사용기한(개월) → { until: Date, daysLeft }
  function expiry(item, now) {
    if (!item.openedAt || !item.paoMonths) return null;
    var p = item.openedAt.split('-').map(Number);
    if (p.length !== 3 || p.some(isNaN)) return null;
    var until = new Date(p[0], p[1] - 1 + Number(item.paoMonths), p[2]);
    var today = now ? new Date(now) : new Date();
    today.setHours(0, 0, 0, 0);
    return { until: until, daysLeft: Math.round((until - today) / 86400000) };
  }

  function keySet(text) {
    var map = {};
    Matcher.splitIngredients(text).forEach(function (t) {
      var k = Matcher.normalize(t);
      if (k && !map[k]) map[k] = t;
    });
    return map; // key → 처음 적힌 모양
  }

  // 트러블 난 화장품 2개 이상에 함께 들어 있고, 잘 맞는 화장품에는 없는 성분
  function trouble(items) {
    var bad = items.filter(function (it) { return it.rating === 'bad'; });
    var good = items.filter(function (it) { return it.rating === 'good'; });
    if (bad.length < 2) return { badCount: bad.length, goodCount: good.length, list: [] };
    var goodKeys = {};
    good.forEach(function (it) { Object.keys(keySet(it.text)).forEach(function (k) { goodKeys[k] = true; }); });
    var count = {};
    bad.forEach(function (it) {
      var set = keySet(it.text);
      Object.keys(set).forEach(function (k) {
        if (!count[k]) count[k] = { key: k, name: set[k], products: [] };
        count[k].products.push(it.name);
      });
    });
    var list = Object.keys(count).map(function (k) { return count[k]; }).filter(function (c) {
      return c.products.length >= 2 && !goodKeys[c.key] && BASE.indexOf(c.key) === -1;
    });
    list.sort(function (a, b) { return b.products.length - a.products.length || a.name.localeCompare(b.name, 'ko'); });
    return { badCount: bad.length, goodCount: good.length, list: list };
  }

  function compare(textA, textB) {
    var a = keySet(textA);
    var b = keySet(textB);
    var both = [];
    var onlyA = [];
    var onlyB = [];
    Object.keys(a).forEach(function (k) { (b[k] ? both : onlyA).push(a[k]); });
    Object.keys(b).forEach(function (k) { if (!a[k]) onlyB.push(b[k]); });
    return { both: both, onlyA: onlyA, onlyB: onlyB };
  }

  // 날짜마다 바뀌는 "오늘의 성분" (설명이 있는 좋은 성분·알레르기 성분 중에서)
  function dailyPick(index, date) {
    var pool = index.entries.filter(function (e) { return e.category !== 'caution' && e.comment; });
    var names = uniq(pool.map(function (e) { return e.name; })).sort();
    var d = date || new Date();
    var seed = d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate();
    return names.length ? names[seed % names.length] : null;
  }

  return {
    SKIN: SKIN, CONCERN: CONCERN, GROUP: GROUP, AVOID_GROUPS: AVOID_GROUPS, PRODUCT: PRODUCT, RATING: RATING,
    personal: personal, expiry: expiry, trouble: trouble, compare: compare, dailyPick: dailyPick
  };
});
