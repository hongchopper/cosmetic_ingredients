/*
 * 화면 전환과 그리기.
 *   #/            내 화장품 (원본 MainActivity)
 *   #/scan        성분 분석 (원본 textDetector + SubActivity)
 *   #/item/<id>   저장한 화장품 (원본 DetailActivity)
 *   #/search      성분 검색 (원본에서 미구현이던 검색 버튼)
 */
(function () {
  'use strict';

  var CAT = {
    caution: { label: '주의 성분', short: '주의' },
    allergy: { label: '알레르기 유발 성분', short: '알레르기' },
    good: { label: '좋은 성분', short: '좋은' }
  };

  var view = document.getElementById('view');
  var titleEl = document.getElementById('title');
  var backBtn = document.getElementById('backBtn');
  var toastEl = document.getElementById('toast');

  var index = null;      // 성분 DB 색인
  var indexError = false;

  // 분석 화면 상태 (다른 탭에 다녀와도 유지)
  var scan = { text: '', thumb: null, preview: null, busy: false, progress: 0, step: '', error: '', analyzed: false, name: '' };
  var searchQuery = '';

  // ---------- 공통 ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }

  function formatDate(ms) {
    var d = new Date(ms);
    return d.getFullYear() + '. ' + (d.getMonth() + 1) + '. ' + d.getDate() + '.';
  }

  function counts(result) {
    return { caution: result.caution.length, allergy: result.allergy.length, good: result.good.length };
  }

  function setChrome(title, showBack, tab) {
    titleEl.textContent = title;
    backBtn.hidden = !showBack;
    document.querySelectorAll('.tabbar a').forEach(function (a) {
      if (a.getAttribute('data-tab') === tab) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  // 뒤로 버튼은 저장한 화장품 화면에만 있고, 늘 목록으로 돌아간다
  backBtn.addEventListener('click', function () { location.hash = '#/'; });

  // ---------- 결과 그리기 ----------
  function countRow(c) {
    return '<div class="counts">' + Matcher.CATEGORIES.map(function (k) {
      return '<div class="count count-' + k + '"><strong>' + c[k] + '</strong><span>' + CAT[k].short + '</span></div>';
    }).join('') + '</div>';
  }

  function resultHtml(result) {
    var c = counts(result);
    var html = '<p class="meta">읽은 성분 ' + result.tokens.length + '개 중 성분 사전에 있는 것을 찾았어요.</p>';
    html += countRow(c);
    Matcher.CATEGORIES.forEach(function (k) {
      html += '<section class="group group-' + k + '">';
      html += '<h3 class="group-title"><span class="dot" aria-hidden="true"></span>' + CAT[k].label + ' <span class="num">' + c[k] + '</span></h3>';
      if (!c[k]) {
        html += '<p class="none">찾은 성분이 없어요.</p>';
      } else {
        html += '<ul class="ing-list">' + result[k].map(ingItem).join('') + '</ul>';
      }
      html += '</section>';
    });
    html += '<p class="note">성분 사전에 있는 이름과 비교한 결과라 참고용이에요. 피부 고민은 전문가와 상담하세요.</p>';
    return html;
  }

  function ingItem(it) {
    var read = '';
    if (it.match === 'similar') {
      read = '<p class="read">사진에서 ‘' + esc(it.read) + '’(으)로 읽혀서 비슷한 이름으로 찾았어요.</p>';
    }
    return '<li class="ing">' +
      '<p class="ing-name">' + esc(it.name) + (it.english ? ' <span class="eng">' + esc(it.english) + '</span>' : '') + '</p>' +
      (it.comment ? '<p class="ing-desc">' + esc(it.comment) + '</p>' : '') +
      read + '</li>';
  }

  // ---------- 내 화장품 ----------
  function renderHome() {
    setChrome('내 화장품', false, 'home');
    var items = Store.list();
    if (!items.length) {
      view.innerHTML =
        '<div class="empty">' +
          '<p class="empty-title">아직 저장한 화장품이 없어요</p>' +
          '<p class="empty-desc">전성분표를 찍으면 주의 성분, 알레르기 유발 성분, 좋은 성분을 찾아 드려요.</p>' +
          '<a class="btn btn-primary" href="#/scan">전성분 분석하기</a>' +
        '</div>';
      return;
    }
    var html = '<div class="toolbar"><p class="meta">' + items.length + '개</p><a class="btn btn-small" href="#/scan">새로 분석</a></div><ul class="cos-list">';
    items.forEach(function (it) {
      var c = index ? counts(Matcher.analyze(it.text, index)) : null;
      html += '<li><a class="cos" href="#/item/' + encodeURIComponent(it.id) + '">' +
        (it.image ? '<img class="cos-thumb" src="' + esc(it.image) + '" alt="">' : '<span class="cos-thumb cos-thumb-empty" aria-hidden="true"></span>') +
        '<span class="cos-body"><span class="cos-name">' + esc(it.name) + '</span>' +
        (c ? '<span class="cos-tags">' +
          '<span class="tag tag-caution">주의 ' + c.caution + '</span>' +
          '<span class="tag tag-allergy">알레르기 ' + c.allergy + '</span>' +
          '<span class="tag tag-good">좋은 ' + c.good + '</span></span>' : '') +
        '<span class="cos-date">' + formatDate(it.createdAt) + '</span></span></a></li>';
    });
    view.innerHTML = html + '</ul>';
  }

  // ---------- 성분 분석 ----------
  function renderScan() {
    setChrome('성분 분석', false, 'scan');
    var html = '';

    html += '<section class="block">' +
      '<h2 class="block-title">전성분표 사진</h2>' +
      '<p class="hint">성분 목록이 화면에 꽉 차도록, 흔들리지 않게 찍어 주세요.</p>' +
      '<div class="btn-row">' +
        '<label class="btn btn-primary"><input type="file" accept="image/*" capture="environment" id="camInput" hidden>사진 찍기</label>' +
        '<label class="btn"><input type="file" accept="image/*" id="fileInput" hidden>앨범에서 고르기</label>' +
      '</div>';
    if (scan.preview) {
      html += '<img class="photo" src="' + esc(scan.preview) + '" alt="고른 전성분표 사진">';
    }
    if (scan.busy) {
      html += '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(scan.progress * 100) + '">' +
        '<div class="progress-bar" style="width:' + Math.round(scan.progress * 100) + '%"></div></div>' +
        '<p class="hint" id="stepText">' + esc(scan.step) + '</p>';
    }
    if (scan.error) html += '<p class="error">' + esc(scan.error) + '</p>';
    html += '</section>';

    html += '<section class="block">' +
      '<h2 class="block-title">전성분 글자</h2>' +
      '<p class="hint">사진에서 읽은 글자예요. 틀린 글자를 고치거나, 사진 없이 전성분을 붙여 넣어도 돼요.</p>' +
      '<textarea id="textInput" rows="6" placeholder="예) 정제수, 글리세린, 부틸렌글라이콜, 향료">' + esc(scan.text) + '</textarea>' +
      '<button class="btn btn-primary btn-block" type="button" id="analyzeBtn"' + (scan.busy ? ' disabled' : '') + '>분석하기</button>' +
      '</section>';

    if (scan.analyzed && index) {
      var result = Matcher.analyze(scan.text, index);
      html += '<section class="block" id="resultBlock"><h2 class="block-title">분석 결과</h2>' + resultHtml(result) + '</section>';
      html += '<section class="block">' +
        '<h2 class="block-title">결과 저장</h2>' +
        '<label class="field-label" for="nameInput">화장품 이름</label>' +
        '<input id="nameInput" type="text" maxlength="60" placeholder="예) 수분 크림" value="' + esc(scan.name) + '">' +
        '<button class="btn btn-primary btn-block" type="button" id="saveBtn">저장하기</button>' +
        '</section>';
    }

    view.innerHTML = html;

    document.getElementById('camInput').addEventListener('change', onFile);
    document.getElementById('fileInput').addEventListener('change', onFile);
    var ta = document.getElementById('textInput');
    ta.addEventListener('input', function () { scan.text = ta.value; });
    document.getElementById('analyzeBtn').addEventListener('click', function () {
      scan.text = ta.value;
      if (!scan.text.trim()) { toast('전성분 글자를 넣어 주세요.'); ta.focus(); return; }
      runAnalyze();
    });
    var nameInput = document.getElementById('nameInput');
    if (nameInput) {
      nameInput.addEventListener('input', function () { scan.name = nameInput.value; });
      document.getElementById('saveBtn').addEventListener('click', onSave);
    }
  }

  function runAnalyze() {
    if (!index) { toast(indexError ? '성분 사전을 불러오지 못했어요. 새로고침해 주세요.' : '성분 사전을 불러오는 중이에요.'); return; }
    scan.analyzed = true;
    renderScan();
    var block = document.getElementById('resultBlock');
    if (block) block.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function onFile(e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (scan.preview) URL.revokeObjectURL(scan.preview);
    scan.preview = URL.createObjectURL(file);
    scan.thumb = null;
    scan.busy = true;
    scan.error = '';
    scan.progress = 0;
    scan.step = '사진 준비 중';
    scan.analyzed = false;
    renderScan();

    Ocr.prepare(file).then(function (prep) {
      scan.thumb = prep.thumb;
      return Ocr.recognize(prep.canvas, function (p, step) {
        scan.progress = p;
        scan.step = step;
        var bar = view.querySelector('.progress-bar');
        var stepText = document.getElementById('stepText');
        if (bar) bar.style.width = Math.round(p * 100) + '%';
        if (stepText) stepText.textContent = step;
      });
    }).then(function (text) {
      scan.busy = false;
      scan.text = text.trim();
      if (!scan.text) {
        scan.error = '글자를 찾지 못했어요. 전성분이 크게 보이도록 다시 찍어 주세요.';
        renderScan();
        return;
      }
      if (location.hash === '#/scan') runAnalyze();
    }).catch(function () {
      scan.busy = false;
      scan.error = '글자를 읽지 못했어요. 인터넷 연결을 확인하고 다시 시도하거나, 전성분을 직접 붙여 넣어 주세요.';
      if (location.hash === '#/scan') renderScan();
    });
  }

  function onSave() {
    var name = scan.name.trim();
    if (!name) { toast('화장품 이름을 넣어 주세요.'); document.getElementById('nameInput').focus(); return; }
    var id = Store.add({ name: name, text: scan.text, image: scan.thumb });
    if (!id) { toast('저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.'); return; }
    if (scan.preview) URL.revokeObjectURL(scan.preview);
    scan = { text: '', thumb: null, preview: null, busy: false, progress: 0, step: '', error: '', analyzed: false, name: '' };
    toast('저장했어요.');
    location.hash = '#/item/' + encodeURIComponent(id);
  }

  // ---------- 저장한 화장품 ----------
  function renderItem(id) {
    var it = Store.get(id);
    if (!it) {
      setChrome('화장품', true, 'home');
      view.innerHTML = '<div class="empty"><p class="empty-title">기록을 찾을 수 없어요</p><a class="btn" href="#/">내 화장품으로</a></div>';
      return;
    }
    setChrome(it.name, true, 'home');
    var html = '<section class="block">' +
      (it.image ? '<img class="photo" src="' + esc(it.image) + '" alt="">' : '') +
      '<p class="meta">' + formatDate(it.createdAt) + ' 저장</p></section>';
    if (index) html += '<section class="block"><h2 class="block-title">분석 결과</h2>' + resultHtml(Matcher.analyze(it.text, index)) + '</section>';
    html += '<section class="block"><h2 class="block-title">전성분 글자</h2><p class="raw">' + esc(it.text) + '</p></section>';
    html += '<section class="block"><button class="btn btn-danger btn-block" type="button" id="deleteBtn">이 기록 삭제</button></section>';
    view.innerHTML = html;

    document.getElementById('deleteBtn').addEventListener('click', function () {
      if (!confirm('‘' + it.name + '’ 기록을 삭제할까요?')) return;
      Store.remove(it.id);
      toast('삭제했어요.');
      location.replace('#/');
    });
  }

  // ---------- 성분 검색 ----------
  function renderSearch() {
    setChrome('성분 검색', false, 'search');
    view.innerHTML =
      '<section class="block">' +
        '<label class="field-label" for="q">성분 이름 (한글 또는 영문)</label>' +
        '<input id="q" type="search" autocomplete="off" placeholder="예) 리날룰, Linalool" value="' + esc(searchQuery) + '">' +
      '</section>' +
      '<section class="block" id="searchResult" aria-live="polite"></section>';
    var q = document.getElementById('q');
    q.addEventListener('input', function () { searchQuery = q.value; drawSearch(); });
    drawSearch();
    if (!searchQuery) q.focus();
  }

  function drawSearch() {
    var box = document.getElementById('searchResult');
    if (!box) return;
    if (!index) { box.innerHTML = '<p class="hint">성분 사전을 불러오는 중이에요.</p>'; return; }
    if (!searchQuery.trim()) {
      box.innerHTML = '<p class="hint">주의 성분 ' + index.entries.filter(function (e) { return e.category === 'caution'; }).length +
        '개, 알레르기 유발 성분 ' + index.entries.filter(function (e) { return e.category === 'allergy'; }).length +
        '개, 좋은 성분 ' + index.entries.filter(function (e) { return e.category === 'good'; }).length + '개가 사전에 있어요.</p>';
      return;
    }
    var hits = Matcher.search(searchQuery, index, 60);
    if (!hits.length) {
      box.innerHTML = '<p class="none">‘' + esc(searchQuery.trim()) + '’은(는) 성분 사전에 없어요. 사전에 없는 성분은 주의·알레르기·좋은 성분으로 분류되지 않은 성분이에요.</p>';
      return;
    }
    box.innerHTML = '<ul class="ing-list">' + hits.map(function (e) {
      return '<li class="ing">' +
        '<p class="ing-name"><span class="tag tag-' + e.category + '">' + CAT[e.category].short + '</span> ' + esc(e.name) +
        (e.english ? ' <span class="eng">' + esc(e.english) + '</span>' : '') + '</p>' +
        (e.aliases.length ? '<p class="read">다른 표기: ' + esc(e.aliases.join(', ')) + '</p>' : '') +
        (e.comment ? '<p class="ing-desc">' + esc(e.comment) + '</p>' : '') + '</li>';
    }).join('') + '</ul>';
  }

  // ---------- 라우터 ----------
  function route() {
    var h = location.hash || '#/';
    var m;
    if (h === '#/scan') renderScan();
    else if (h === '#/search') renderSearch();
    else if ((m = h.match(/^#\/item\/(.+)$/))) renderItem(decodeURIComponent(m[1]));
    else renderHome();
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', route);

  fetch('data/ingredients.json')
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (db) { index = Matcher.buildIndex(db); route(); })
    .catch(function () { indexError = true; toast('성분 사전을 불러오지 못했어요.'); });

  route();
})();
