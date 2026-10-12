/*
 * 여러 화면이 함께 쓰는 그리기 조각과 도우미.
 */
(function (root) {
  'use strict';

  var CAT = {
    caution: { label: '주의 성분', short: '주의' },
    allergy: { label: '알레르기 유발 성분', short: '알레르기' },
    good: { label: '좋은 성분', short: '좋은' }
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var toastEl = null;
  var toastTimer = null;
  function toast(msg) {
    toastEl = toastEl || document.getElementById('toast');
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }

  function formatDate(ms) {
    var d = new Date(ms);
    return d.getFullYear() + '. ' + (d.getMonth() + 1) + '. ' + d.getDate() + '.';
  }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function ingHref(name) { return '#/ing/' + encodeURIComponent(name); }

  // 선 아이콘
  var ICON = {
    chevron: '<path d="M9 5l7 7-7 7"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    text: '<path d="M5 6h14M5 11h14M5 16h9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>'
  };
  function icon(name, cls) {
    return '<svg class="' + (cls || 'ic') + '" viewBox="0 0 24 24" aria-hidden="true">' + ICON[name] + '</svg>';
  }

  // 링크 한 줄 (오른쪽 꺾쇠)
  function row(href, title, sub, right) {
    return '<a class="row" href="' + href + '"><span class="row-body"><span class="row-title">' + esc(title) + '</span>' +
      (sub ? '<span class="row-sub">' + sub + '</span>' : '') + '</span>' +
      (right || '') + icon('chevron', 'ic row-chev') + '</a>';
  }

  // 선택 칩. pressed면 aria-pressed=true
  function chip(attrs, label, pressed) {
    return '<button type="button" class="chip" ' + attrs + ' aria-pressed="' + (pressed ? 'true' : 'false') + '">' + esc(label) + '</button>';
  }

  function counts(result) {
    return { caution: result.caution.length, allergy: result.allergy.length, good: result.good.length };
  }

  function tagsLine(c) {
    return '<span class="tag tag-caution">주의 ' + c.caution + '</span>' +
      '<span class="tag tag-allergy">알레르기 ' + c.allergy + '</span>' +
      '<span class="tag tag-good">좋은 ' + c.good + '</span>';
  }

  // ---------- "나에게는?" 요약 ----------
  function personalBlock(p, profile) {
    if (!p.hasProfile) {
      return '<a class="notice notice-plain" href="#/me"><strong>내 피부를 알려 주세요</strong>' +
        '<span>피부 타입과 피하고 싶은 성분을 정하면, 이 화장품이 나에게 맞는지 먼저 알려 드려요.</span></a>';
    }
    var html = '';
    if (p.level === 'warn') {
      html += '<div class="notice notice-warn"><strong>피하기로 한 성분이 ' + p.avoidHits.length + '개 들어 있어요</strong><ul class="plain">' +
        p.avoidHits.map(function (h) {
          return '<li><a href="' + ingHref(h.name) + '">' + esc(h.name) + '</a> <span class="muted">· ' + esc(h.why) + '</span></li>';
        }).join('') + '</ul></div>';
    } else {
      html += '<div class="notice notice-ok"><strong>피하기로 한 성분은 없어요</strong>' +
        '<span>내 피부 설정에서 정한 성분과 묶음을 기준으로 봤어요.</span></div>';
    }
    var skin = Insights.SKIN[profile.skinType];
    if (p.skinAvoid.length) {
      html += '<p class="line"><span class="tag tag-allergy">' + esc(skin) + '</span> ' +
        names(p.skinAvoid) + '은(는) ' + esc(skin) + ' 피부라면 피하는 게 좋다고 알려져 있어요.</p>';
    }
    if (p.skinGood.length) {
      html += '<p class="line"><span class="tag tag-good">' + esc(skin) + '</span> ' +
        names(p.skinGood) + '은(는) ' + esc(skin) + ' 피부에 좋다고 알려져 있어요.</p>';
    }
    Object.keys(p.concern).forEach(function (c) {
      var list = p.concern[c];
      html += '<p class="line"><span class="tag tag-neutral">' + esc(Insights.CONCERN[c]) + '</span> ' +
        (list.length ? names(list) + '이(가) 들어 있어요.' : '도움 되는 성분은 찾지 못했어요.') + '</p>';
    });
    return html;
  }

  function names(list) {
    return list.map(function (n) { return '<a href="' + ingHref(n) + '">' + esc(n) + '</a>'; }).join(', ');
  }

  // ---------- 전성분 한눈에 ----------
  function fullList(result, profile) {
    var avoid = avoidMatcher(profile);
    var html = '<ol class="toks">' + result.items.map(function (it) {
      var cats = it.hits.map(function (h) { return h.category; });
      var cls = cats.indexOf('caution') !== -1 ? 'caution' : cats.indexOf('allergy') !== -1 ? 'allergy' : cats.indexOf('good') !== -1 ? 'good' : 'plain';
      var avoided = avoid(it);
      var label = esc(it.token) + (avoided ? ' <span class="tok-flag">피함</span>' : '');
      var inner = it.hits.length ? '<a href="' + ingHref(it.hits[0].name) + '">' + label + '</a>' : '<span>' + label + '</span>';
      return '<li class="tok tok-' + cls + (avoided ? ' tok-avoid' : '') + '">' + inner + '</li>';
    }).join('') + '</ol>';
    return html + '<p class="legend"><span class="tok tok-caution">주의</span><span class="tok tok-allergy">알레르기</span>' +
      '<span class="tok tok-good">좋은</span><span class="tok tok-plain">사전에 없음</span></p>';
  }

  function avoidMatcher(profile) {
    var keys = ((profile && profile.avoid) || []).map(Matcher.normalize);
    var groups = (profile && profile.avoidGroups) || [];
    return function (it) {
      if (keys.indexOf(it.key) !== -1) return true;
      return it.hits.some(function (h) {
        if (h.keys.some(function (k) { return keys.indexOf(k) !== -1; })) return true;
        return h.category !== 'good' && h.tags.some(function (t) { return groups.indexOf(t) !== -1; });
      });
    };
  }

  // ---------- 분류별 성분 ----------
  function countRow(c) {
    return '<div class="counts">' + Matcher.CATEGORIES.map(function (k) {
      return '<div class="count count-' + k + '"><strong>' + c[k] + '</strong><span>' + CAT[k].short + '</span></div>';
    }).join('') + '</div>';
  }

  function ingItem(it) {
    var read = it.match === 'similar'
      ? '<p class="read">사진에서 ‘' + esc(it.read) + '’(으)로 읽혀서 비슷한 이름으로 찾았어요.</p>' : '';
    return '<li class="ing"><a class="ing-link" href="' + ingHref(it.name) + '">' +
      '<p class="ing-name">' + esc(it.name) + (it.english ? ' <span class="eng">' + esc(it.english) + '</span>' : '') + '</p>' +
      (it.comment ? '<p class="ing-desc">' + esc(it.comment) + '</p>' : '') + read + '</a></li>';
  }

  // 주의 성분은 같은 설명이 수백 개 겹치므로 묶음별로 한 번만 설명한다
  function cautionGroups(list) {
    var groups = {};
    var order = [];
    list.forEach(function (it) {
      var t = it.tags[0] || 'etc';
      if (!groups[t]) { groups[t] = []; order.push(t); }
      groups[t].push(it);
    });
    return order.map(function (t) {
      var items = groups[t];
      var shared = items.every(function (x) { return x.comment === items[0].comment; }) && items.length > 1;
      if (!shared) {
        return '<li class="cgroup"><p class="cgroup-title">' + esc(Insights.GROUP[t]) + ' ' + items.length + '</p><ul class="ing-list">' +
          items.map(ingItem).join('') + '</ul></li>';
      }
      return '<li class="cgroup"><p class="cgroup-title">' + esc(Insights.GROUP[t]) + ' ' + items.length + '</p>' +
        '<p class="ing-names">' + names(items.map(function (x) { return x.name; })) + '</p>' +
        (items[0].comment ? '<p class="ing-desc">' + esc(items[0].comment) + '</p>' : '') + '</li>';
    }).join('');
  }

  function resultSections(result) {
    var c = counts(result);
    var html = countRow(c);
    Matcher.CATEGORIES.forEach(function (k) {
      html += '<section class="group group-' + k + '">';
      html += '<h3 class="group-title"><span class="dot" aria-hidden="true"></span>' + CAT[k].label + ' <span class="num">' + c[k] + '</span></h3>';
      if (!c[k]) html += '<p class="none">찾은 성분이 없어요.</p>';
      else if (k === 'caution') html += '<ul class="ing-list">' + cautionGroups(result[k]) + '</ul>';
      else html += '<ul class="ing-list">' + result[k].map(ingItem).join('') + '</ul>';
      html += '</section>';
    });
    return html;
  }

  // 분석 결과 전체: 나에게는? → 전성분 한눈에 → 분류별
  function analysisHtml(result, profile) {
    var p = Insights.personal(result, profile);
    return '<section class="block"><h2 class="block-title">나에게는?</h2>' + personalBlock(p, profile) + '</section>' +
      '<section class="block"><h2 class="block-title">전성분 한눈에</h2>' +
      '<p class="hint">적힌 순서 그대로예요. 앞쪽일수록 많이 들어 있어요. 누르면 성분 설명을 볼 수 있어요.</p>' +
      fullList(result, profile) + '</section>' +
      '<section class="block"><h2 class="block-title">성분 분류</h2>' +
      '<p class="meta">읽은 성분 ' + result.tokens.length + '개 중 성분 사전에 있는 것을 찾았어요.</p>' +
      resultSections(result) +
      '<p class="note">성분 사전과 이름을 비교한 결과라 참고용이에요. 피부 고민은 전문가와 상담하세요.</p></section>';
  }

  root.UI = {
    CAT: CAT, esc: esc, toast: toast, formatDate: formatDate, todayStr: todayStr, ingHref: ingHref,
    icon: icon, row: row, chip: chip, counts: counts, tagsLine: tagsLine, names: names,
    analysisHtml: analysisHtml, avoidMatcher: avoidMatcher
  };
})(this);
