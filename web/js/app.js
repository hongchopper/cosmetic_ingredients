/*
 * 화면 전환과 각 화면 그리기.
 *   #/                 홈
 *   #/shelf            내 화장대 (원본 MainActivity)
 *   #/scan             성분 분석 (원본 textDetector + SubActivity)
 *   #/p/<id>           화장품 (원본 DetailActivity)
 *   #/compare/<a>[/<b>] 화장품 비교
 *   #/dict             성분 사전 (원본에서 미구현이던 검색)
 *   #/ing/<이름>       성분 설명
 *   #/me               내 피부
 *   #/trouble          트러블 성분 찾기
 *   #/guide/<id>       성분 상식
 */
(function () {
  'use strict';

  var esc = UI.esc;
  var toast = UI.toast;

  var view = document.getElementById('view');
  var titleEl = document.getElementById('title');
  var backBtn = document.getElementById('backBtn');

  var index = null;      // 성분 사전 색인
  var byName = null;     // 이름 → 사전 항목들 (한 이름이 두 분류에 있을 수 있다)
  var indexError = false;
  var backTo = '#/';

  // 분석 화면 상태 (다른 탭에 다녀와도 유지)
  function freshScan() {
    return { text: '', thumb: null, preview: null, busy: false, progress: 0, step: '', error: '', analyzed: false, name: '', category: null };
  }
  var scan = freshScan();
  var dict = { q: '', filter: 'all', limit: 40 };
  var shelfFilter = 'all';

  // ---------- 공통 ----------
  function setChrome(title, back, tab) {
    titleEl.textContent = title;
    backBtn.hidden = !back;
    backTo = back || '#/';
    document.querySelectorAll('.tabbar a').forEach(function (a) {
      if (a.getAttribute('data-tab') === tab) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }
  backBtn.addEventListener('click', function () { location.hash = backTo; });

  function needIndex() {
    if (index) return false;
    view.innerHTML = '<div class="empty"><p class="empty-desc">' +
      (indexError ? '성분 사전을 불러오지 못했어요. 새로고침해 주세요.' : '성분 사전을 불러오는 중이에요.') + '</p></div>';
    return true;
  }

  function analyzeText(text) { return Matcher.analyze(text, index); }

  function on(sel, ev, fn) {
    view.querySelectorAll(sel).forEach(function (el) { el.addEventListener(ev, fn); });
  }

  function expiryBadge(it) {
    var e = Insights.expiry(it);
    if (!e) return '';
    if (e.daysLeft < 0) return '<span class="tag tag-caution">기한 지남</span>';
    if (e.daysLeft <= 30) return '<span class="tag tag-allergy">D-' + e.daysLeft + '</span>';
    return '<span class="tag tag-neutral">D-' + e.daysLeft + '</span>';
  }

  function productRow(it, opts) {
    var c = UI.counts(analyzeText(it.text));
    var cat = it.category ? Insights.PRODUCT[it.category] : '';
    var rating = it.rating ? '<span class="tag tag-' + (it.rating === 'bad' ? 'caution' : it.rating === 'good' ? 'good' : 'neutral') + '">' + Insights.RATING[it.rating] + '</span>' : '';
    var href = (opts && opts.href) || '#/p/' + encodeURIComponent(it.id);
    return '<li><a class="cos" href="' + href + '">' +
      (it.image ? '<img class="cos-thumb" src="' + esc(it.image) + '" alt="">' : '<span class="cos-thumb cos-thumb-empty" aria-hidden="true"></span>') +
      '<span class="cos-body"><span class="cos-name">' + esc(it.name) + '</span>' +
      '<span class="cos-tags">' + UI.tagsLine(c) + '</span>' +
      '<span class="cos-meta">' + [cat ? esc(cat) : '', expiryBadge(it), rating].filter(Boolean).join(' ') + '</span>' +
      '</span></a></li>';
  }

  function profileChips(pr) {
    var out = [];
    if (pr.skinType) out.push(pr.skinType === 'unknown' ? '피부 타입 모름' : Insights.SKIN[pr.skinType] + ' 피부');
    pr.concerns.forEach(function (c) { out.push(Insights.CONCERN[c]); });
    pr.avoidGroups.forEach(function (g) { out.push(Insights.GROUP[g] + ' 피하기'); });
    if (pr.avoid.length) out.push('피할 성분 ' + pr.avoid.length + '개');
    return out;
  }

  // ---------- 홈 ----------
  function renderHome() {
    setChrome('화안', null, 'home');
    if (needIndex()) return;
    var items = Store.list();
    var pr = Store.profile();
    var html = '';

    html += '<section class="block">' +
      '<h2 class="lead">이 화장품, 나에게 맞을까?</h2>' +
      '<p class="hint">전성분표를 찍으면 주의 성분, 알레르기 유발 성분, 좋은 성분을 찾아 내 피부 기준으로 알려 드려요.</p>' +
      '<div class="btn-row">' +
        '<a class="btn btn-primary" href="#/scan">' + UI.icon('camera') + '전성분 찍기</a>' +
        '<a class="btn" href="#/scan?paste">' + UI.icon('text') + '글자로 넣기</a>' +
      '</div></section>';

    var chips = profileChips(pr);
    html += '<section class="block"><div class="block-head"><h2 class="block-title">내 피부</h2>' +
      (chips.length ? '<a class="link" href="#/me">바꾸기</a>' : '') + '</div>';
    if (chips.length) {
      html += '<p class="chips-static">' + chips.map(function (c) { return '<span class="tag tag-neutral">' + esc(c) + '</span>'; }).join('') + '</p>';
    } else {
      html += '<a class="notice notice-plain" href="#/me"><strong>내 피부를 알려 주세요</strong>' +
        '<span>피부 타입, 고민, 피하고 싶은 성분을 정하면 분석 결과를 나에게 맞춰 보여 드려요.</span></a>';
    }
    html += '</section>';

    var soon = items.map(function (it) { return { it: it, e: Insights.expiry(it) }; })
      .filter(function (x) { return x.e && x.e.daysLeft <= 30; })
      .sort(function (a, b) { return a.e.daysLeft - b.e.daysLeft; });
    if (soon.length) {
      html += '<section class="block"><h2 class="block-title">사용기한이 다가와요</h2><ul class="cos-list">' +
        soon.slice(0, 3).map(function (x) { return productRow(x.it); }).join('') + '</ul></section>';
    }

    if (items.length) {
      html += '<section class="block"><div class="block-head"><h2 class="block-title">최근 분석</h2><a class="link" href="#/shelf">전체 ' + items.length + '개</a></div>' +
        '<ul class="cos-list">' + items.slice(0, 3).map(function (it) { return productRow(it); }).join('') + '</ul></section>';
    }

    var pick = Insights.dailyPick(index);
    if (pick) {
      var entries = byName.get(pick);
      var e = entries[0];
      html += '<section class="block"><h2 class="block-title">오늘의 성분</h2>' +
        '<a class="card" href="' + UI.ingHref(pick) + '"><span class="card-title">' + esc(pick) +
        (e.english ? ' <span class="eng">' + esc(e.english) + '</span>' : '') + '</span>' +
        '<span class="cos-tags">' + entries.map(catTag).join('') + '</span>' +
        '<span class="card-desc">' + esc(e.comment.split('\n')[0]) + '</span></a></section>';
    }

    html += '<section class="block"><h2 class="block-title">성분 상식</h2><div class="rows">' +
      GUIDES.map(function (g) { return UI.row('#/guide/' + g.id, g.title, esc(g.summary)); }).join('') + '</div></section>';

    view.innerHTML = html;
  }

  function catTag(e) {
    var extra = e.tags.filter(function (t) { return t !== 'etc' && t !== 'allergen'; }).map(function (t) {
      return '<span class="tag tag-neutral">' + esc(Insights.GROUP[t]) + '</span>';
    }).join('');
    return '<span class="tag tag-' + e.category + '">' + UI.CAT[e.category].short + '</span>' + extra;
  }

  // ---------- 내 화장대 ----------
  function renderShelf() {
    setChrome('내 화장대', null, 'shelf');
    if (needIndex()) return;
    var items = Store.list();
    if (!items.length) {
      view.innerHTML = '<div class="empty"><p class="empty-title">화장대가 비어 있어요</p>' +
        '<p class="empty-desc">전성분을 분석하고 저장하면 여기에 모여요. 개봉일, 사용기한, 잘 맞았는지도 적어 둘 수 있어요.</p>' +
        '<a class="btn btn-primary" href="#/scan">전성분 분석하기</a></div>';
      return;
    }
    var cats = Object.keys(Insights.PRODUCT).filter(function (k) { return items.some(function (it) { return it.category === k; }); });
    if (shelfFilter !== 'all' && cats.indexOf(shelfFilter) === -1) shelfFilter = 'all';
    var shown = items.filter(function (it) { return shelfFilter === 'all' || it.category === shelfFilter; });
    var bad = items.filter(function (it) { return it.rating === 'bad'; }).length;

    var html = '<div class="toolbar"><div class="chips" role="group" aria-label="종류">' +
      UI.chip('data-filter="all"', '전체 ' + items.length, shelfFilter === 'all') +
      cats.map(function (k) { return UI.chip('data-filter="' + k + '"', Insights.PRODUCT[k], shelfFilter === k); }).join('') +
      '</div></div>';
    if (bad) {
      html += '<div class="pad">' + UI.row('#/trouble', '트러블 성분 찾기', '트러블 난 화장품 ' + bad + '개에 공통으로 든 성분을 찾아요.') + '</div>';
    }
    html += '<ul class="cos-list">' + shown.map(function (it) { return productRow(it); }).join('') + '</ul>';
    html += '<div class="pad"><a class="btn btn-block" href="#/scan">' + UI.icon('plus') + '화장품 추가</a></div>';
    view.innerHTML = html;
    on('[data-filter]', 'click', function () { shelfFilter = this.getAttribute('data-filter'); renderShelf(); });
  }

  // ---------- 성분 분석 ----------
  function renderScan(paste) {
    setChrome('성분 분석', null, 'scan');
    var html = '';

    html += '<section class="block">' +
      '<h2 class="block-title">전성분표 사진</h2>' +
      '<p class="hint">성분 목록이 화면에 꽉 차도록, 흔들리지 않게 찍어 주세요.</p>' +
      '<div class="btn-row">' +
        '<label class="btn btn-primary"><input type="file" accept="image/*" capture="environment" id="camInput" hidden>' + UI.icon('camera') + '사진 찍기</label>' +
        '<label class="btn"><input type="file" accept="image/*" id="fileInput" hidden>앨범에서 고르기</label>' +
      '</div>';
    if (scan.preview) html += '<img class="photo" src="' + esc(scan.preview) + '" alt="고른 전성분표 사진">';
    if (scan.busy) {
      html += '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(scan.progress * 100) + '">' +
        '<div class="progress-bar" style="width:' + Math.round(scan.progress * 100) + '%"></div></div>' +
        '<p class="hint" id="stepText">' + esc(scan.step) + '</p>';
    }
    if (scan.error) html += '<p class="error">' + esc(scan.error) + '</p>';
    html += '</section>';

    html += '<section class="block">' +
      '<h2 class="block-title">전성분 글자</h2>' +
      '<p class="hint">사진에서 읽은 글자예요. 틀린 글자를 고치거나, 쇼핑몰 상세 페이지의 전성분을 복사해 붙여 넣어도 돼요.</p>' +
      '<textarea id="textInput" rows="6" placeholder="예) 정제수, 글리세린, 부틸렌글라이콜, 향료">' + esc(scan.text) + '</textarea>' +
      '<button class="btn btn-primary btn-block" type="button" id="analyzeBtn"' + (scan.busy ? ' disabled' : '') + '>분석하기</button>' +
      '</section>';

    if (scan.analyzed && index) {
      html += '<div id="resultBlock">' + UI.analysisHtml(analyzeText(scan.text), Store.profile()) + '</div>';
      html += '<section class="block">' +
        '<h2 class="block-title">내 화장대에 저장</h2>' +
        '<label class="field-label" for="nameInput">화장품 이름</label>' +
        '<input id="nameInput" type="text" maxlength="60" placeholder="예) 수분 크림" value="' + esc(scan.name) + '">' +
        '<p class="field-label">종류</p><div class="chips" role="group" aria-label="종류">' +
        Object.keys(Insights.PRODUCT).map(function (k) { return UI.chip('data-cat="' + k + '"', Insights.PRODUCT[k], scan.category === k); }).join('') +
        '</div>' +
        '<button class="btn btn-primary btn-block" type="button" id="saveBtn">저장하기</button>' +
        '</section>';
    }

    view.innerHTML = html;

    on('#camInput, #fileInput', 'change', onFile);
    var ta = document.getElementById('textInput');
    ta.addEventListener('input', function () { scan.text = ta.value; });
    if (paste && !scan.text) ta.focus();
    document.getElementById('analyzeBtn').addEventListener('click', function () {
      scan.text = ta.value;
      if (!scan.text.trim()) { toast('전성분 글자를 넣어 주세요.'); ta.focus(); return; }
      runAnalyze();
    });
    var nameInput = document.getElementById('nameInput');
    if (nameInput) {
      nameInput.addEventListener('input', function () { scan.name = nameInput.value; });
      on('[data-cat]', 'click', function () {
        var k = this.getAttribute('data-cat');
        scan.category = scan.category === k ? null : k;
        view.querySelectorAll('[data-cat]').forEach(function (b) {
          b.setAttribute('aria-pressed', b.getAttribute('data-cat') === scan.category ? 'true' : 'false');
        });
      });
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
        if (isScan()) renderScan();
        return;
      }
      if (isScan()) runAnalyze();
    }).catch(function () {
      scan.busy = false;
      scan.error = '글자를 읽지 못했어요. 인터넷 연결을 확인하고 다시 시도하거나, 전성분을 직접 붙여 넣어 주세요.';
      if (isScan()) renderScan();
    });
  }

  function isScan() { return location.hash.indexOf('#/scan') === 0; }

  function onSave() {
    var name = scan.name.trim();
    if (!name) { toast('화장품 이름을 넣어 주세요.'); document.getElementById('nameInput').focus(); return; }
    var id = Store.add({ name: name, text: scan.text, image: scan.thumb, category: scan.category });
    if (!id) { toast('저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.'); return; }
    if (scan.preview) URL.revokeObjectURL(scan.preview);
    scan = freshScan();
    toast('내 화장대에 저장했어요.');
    location.hash = '#/p/' + encodeURIComponent(id);
  }

  // ---------- 화장품 ----------
  function renderProduct(id) {
    if (needIndex()) return;
    var it = Store.get(id);
    if (!it) {
      setChrome('화장품', '#/shelf', 'shelf');
      view.innerHTML = '<div class="empty"><p class="empty-title">기록을 찾을 수 없어요</p><a class="btn" href="#/shelf">내 화장대로</a></div>';
      return;
    }
    setChrome(it.name, '#/shelf', 'shelf');
    var e = Insights.expiry(it);
    var html = '<section class="block">' +
      (it.image ? '<img class="photo" src="' + esc(it.image) + '" alt="">' : '') +
      '<p class="meta">' + UI.formatDate(it.createdAt) + ' 분석</p>' +
      '<div class="btn-row"><a class="btn" href="#/compare/' + encodeURIComponent(it.id) + '">비교하기</a>' +
      '<a class="btn" href="#/scan" id="reScan">다시 분석</a></div></section>';

    html += UI.analysisHtml(analyzeText(it.text), Store.profile());

    html += '<section class="block"><h2 class="block-title">내 사용 기록</h2>' +
      '<label class="field-label" for="pName">이름</label><input id="pName" type="text" maxlength="60" value="' + esc(it.name) + '">' +
      '<p class="field-label">종류</p><div class="chips" role="group" aria-label="종류">' +
      Object.keys(Insights.PRODUCT).map(function (k) { return UI.chip('data-cat="' + k + '"', Insights.PRODUCT[k], it.category === k); }).join('') + '</div>' +
      '<p class="field-label">써 보니</p><div class="chips" role="group" aria-label="써 보니">' +
      Object.keys(Insights.RATING).map(function (k) { return UI.chip('data-rating="' + k + '"', Insights.RATING[k], it.rating === k); }).join('') + '</div>' +
      '<div class="two"><div><label class="field-label" for="pOpened">개봉일</label><input id="pOpened" type="date" value="' + esc(it.openedAt || '') + '" max="' + UI.todayStr() + '"></div>' +
      '<div><label class="field-label" for="pPao">개봉 후 사용기한</label><select id="pPao"><option value="">모름</option>' +
      [3, 6, 9, 12, 18, 24, 36].map(function (m) { return '<option value="' + m + '"' + (Number(it.paoMonths) === m ? ' selected' : '') + '>' + m + '개월</option>'; }).join('') +
      '</select></div></div>' +
      (e ? '<p class="hint">' + (e.daysLeft < 0 ? '사용기한이 ' + (-e.daysLeft) + '일 지났어요.' : e.until.getFullYear() + '. ' + (e.until.getMonth() + 1) + '. ' + e.until.getDate() + '.까지, ' + e.daysLeft + '일 남았어요.') + '</p>'
        : '<p class="hint">용기의 뚜껑 열린 통 그림 옆 숫자(예: 12M)가 개봉 후 사용기한이에요.</p>') +
      '<label class="field-label" for="pMemo">메모</label><textarea id="pMemo" rows="3" placeholder="예) 아침에 바르면 밀려요">' + esc(it.memo || '') + '</textarea>' +
      '</section>';

    html += '<section class="block"><h2 class="block-title">전성분 글자</h2><p class="raw">' + esc(it.text) + '</p></section>';
    html += '<section class="block"><button class="btn btn-danger btn-block" type="button" id="deleteBtn">이 화장품 삭제</button></section>';
    view.innerHTML = html;

    function patch(p, msg) {
      if (Store.update(it.id, p)) { Object.keys(p).forEach(function (k) { it[k] = p[k]; }); if (msg) toast(msg); }
      else toast('저장하지 못했어요.');
    }
    var nameEl = document.getElementById('pName');
    nameEl.addEventListener('change', function () {
      var v = nameEl.value.trim();
      if (!v) { nameEl.value = it.name; return; }
      patch({ name: v }, '이름을 바꿨어요.');
      titleEl.textContent = v;
    });
    on('[data-cat]', 'click', function () {
      var k = this.getAttribute('data-cat');
      patch({ category: it.category === k ? null : k });
      view.querySelectorAll('[data-cat]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-cat') === it.category ? 'true' : 'false'); });
    });
    on('[data-rating]', 'click', function () {
      var k = this.getAttribute('data-rating');
      patch({ rating: it.rating === k ? null : k }, it.rating === k ? '' : '기록했어요.');
      view.querySelectorAll('[data-rating]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-rating') === it.rating ? 'true' : 'false'); });
    });
    document.getElementById('pOpened').addEventListener('change', function () {
      patch({ openedAt: this.value || null }); renderProduct(id);
    });
    document.getElementById('pPao').addEventListener('change', function () {
      patch({ paoMonths: this.value ? Number(this.value) : null }); renderProduct(id);
    });
    document.getElementById('pMemo').addEventListener('change', function () { patch({ memo: this.value }, '메모를 저장했어요.'); });
    document.getElementById('reScan').addEventListener('click', function () {
      scan = freshScan();
      scan.text = it.text;
      scan.name = it.name;
      scan.category = it.category;
    });
    document.getElementById('deleteBtn').addEventListener('click', function () {
      if (!confirm('‘' + it.name + '’을(를) 화장대에서 삭제할까요?')) return;
      Store.remove(it.id);
      toast('삭제했어요.');
      location.replace('#/shelf');
    });
  }

  // ---------- 비교 ----------
  function renderCompare(a, b) {
    if (needIndex()) return;
    var A = Store.get(a);
    if (!A) { location.replace('#/shelf'); return; }
    if (!b) {
      setChrome('비교할 화장품', '#/p/' + encodeURIComponent(a), 'shelf');
      var others = Store.list().filter(function (it) { return it.id !== a; });
      view.innerHTML = '<section class="block"><p class="hint">‘' + esc(A.name) + '’과(와) 비교할 화장품을 골라 주세요.</p></section>' +
        (others.length ? '<ul class="cos-list">' + others.map(function (it) {
          return productRow(it, { href: '#/compare/' + encodeURIComponent(a) + '/' + encodeURIComponent(it.id) });
        }).join('') + '</ul>'
          : '<div class="empty"><p class="empty-desc">비교하려면 화장품이 하나 더 필요해요.</p><a class="btn btn-primary" href="#/scan">전성분 분석하기</a></div>');
      return;
    }
    var B = Store.get(b);
    if (!B) { location.replace('#/compare/' + encodeURIComponent(a)); return; }
    setChrome('화장품 비교', '#/p/' + encodeURIComponent(a), 'shelf');
    var pr = Store.profile();
    var rA = analyzeText(A.text);
    var rB = analyzeText(B.text);
    var cmp = Insights.compare(A.text, B.text);
    var avoid = UI.avoidMatcher(pr);

    function side(it, r) {
      var p = Insights.personal(r, pr);
      return '<div class="side"><p class="side-name">' + esc(it.name) + '</p><p class="cos-tags">' + UI.tagsLine(UI.counts(r)) + '</p>' +
        (p.hasProfile ? '<p class="' + (p.level === 'warn' ? 'warn-text' : 'muted') + '">피할 성분 ' + p.avoidHits.length + '개</p>' : '') + '</div>';
    }
    function toks(list) {
      if (!list.length) return '<p class="none">없어요.</p>';
      return '<ol class="toks">' + list.map(function (t) {
        var r = analyzeText(t).items[0];
        if (!r) return '';
        var cats = r.hits.map(function (h) { return h.category; });
        var cls = cats.indexOf('caution') !== -1 ? 'caution' : cats.indexOf('allergy') !== -1 ? 'allergy' : cats.indexOf('good') !== -1 ? 'good' : 'plain';
        var flagged = avoid(r);
        var label = esc(t) + (flagged ? ' <span class="tok-flag">피함</span>' : '');
        return '<li class="tok tok-' + cls + (flagged ? ' tok-avoid' : '') + '">' +
          (r.hits.length ? '<a href="' + UI.ingHref(r.hits[0].name) + '">' + label + '</a>' : '<span>' + label + '</span>') + '</li>';
      }).join('') + '</ol>';
    }

    view.innerHTML = '<section class="block"><div class="sides">' + side(A, rA) + side(B, rB) + '</div></section>' +
      '<section class="block"><h2 class="block-title">함께 든 성분 <span class="num">' + cmp.both.length + '</span></h2>' + toks(cmp.both) + '</section>' +
      '<section class="block"><h2 class="block-title">‘' + esc(A.name) + '’에만 <span class="num">' + cmp.onlyA.length + '</span></h2>' + toks(cmp.onlyA) + '</section>' +
      '<section class="block"><h2 class="block-title">‘' + esc(B.name) + '’에만 <span class="num">' + cmp.onlyB.length + '</span></h2>' + toks(cmp.onlyB) + '</section>';
  }

  // ---------- 성분 사전 ----------
  var DICT_FILTERS = [
    ['all', '전체'], ['caution', '주의'], ['allergy', '알레르기'], ['good', '좋은'],
    ['uv', '자외선 차단'], ['whitening', '미백'], ['wrinkle', '주름 개선'],
    ['fragrance', '향료'], ['paraben', '파라벤'], ['tar', '타르색소'], ['peg', 'PEG 계열'], ['preservative', '방부제']
  ];

  function renderDict() {
    setChrome('성분 사전', null, 'dict');
    if (needIndex()) return;
    view.innerHTML =
      '<section class="block">' +
        '<label class="field-label" for="q">성분 이름 (한글 또는 영문)</label>' +
        '<input id="q" type="search" autocomplete="off" placeholder="예) 리날룰, Linalool" value="' + esc(dict.q) + '">' +
        '<div class="chips chips-scroll" role="group" aria-label="묶음">' +
        DICT_FILTERS.map(function (f) { return UI.chip('data-f="' + f[0] + '"', f[1], dict.filter === f[0]); }).join('') +
        '</div></section>' +
      '<section class="block" id="dictResult" aria-live="polite"></section>';
    var q = document.getElementById('q');
    q.addEventListener('input', function () { dict.q = q.value; dict.limit = 40; drawDict(); });
    on('[data-f]', 'click', function () {
      dict.filter = this.getAttribute('data-f');
      dict.limit = 40;
      view.querySelectorAll('[data-f]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-f') === dict.filter ? 'true' : 'false'); });
      drawDict();
    });
    drawDict();
  }

  function dictMatches(e) {
    var f = dict.filter;
    if (f === 'all') return true;
    if (f === 'caution' || f === 'allergy' || f === 'good') return e.category === f;
    return e.tags.indexOf(f) !== -1;
  }

  function drawDict() {
    var box = document.getElementById('dictResult');
    if (!box) return;
    var list = dict.q.trim() ? Matcher.search(dict.q, index, 2000) : index.entries.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'ko'); });
    list = list.filter(dictMatches);
    // 같은 이름은 한 줄로
    var seen = {};
    var rows = [];
    list.forEach(function (e) { if (!seen[e.name]) { seen[e.name] = true; rows.push(e.name); } });
    if (!rows.length) {
      box.innerHTML = dict.q.trim()
        ? '<p class="none">‘' + esc(dict.q.trim()) + '’은(는) 성분 사전에 없어요. 사전에 없는 성분은 주의·알레르기·좋은 성분으로 분류되지 않은 성분이에요.</p>'
        : '<p class="none">해당하는 성분이 없어요.</p>';
      return;
    }
    var shown = rows.slice(0, dict.limit);
    box.innerHTML = '<p class="meta">' + rows.length + '개</p><ul class="ing-list">' + shown.map(function (name) {
      var entries = byName.get(name);
      var e = entries[0];
      return '<li class="ing"><a class="ing-link" href="' + UI.ingHref(name) + '"><p class="ing-name">' + esc(name) +
        (e.english ? ' <span class="eng">' + esc(e.english) + '</span>' : '') + '</p><p class="cos-tags">' + entries.map(catTag).join('') + '</p></a></li>';
    }).join('') + '</ul>' +
      (rows.length > shown.length ? '<button class="btn btn-block" type="button" id="moreBtn">더 보기 (' + (rows.length - shown.length) + '개 남음)</button>' : '');
    var more = document.getElementById('moreBtn');
    if (more) more.addEventListener('click', function () { dict.limit += 80; drawDict(); });
  }

  // ---------- 성분 설명 ----------
  function renderIngredient(name) {
    if (needIndex()) return;
    var entries = byName.get(name);
    setChrome(name, '#/dict', 'dict');
    if (!entries) {
      view.innerHTML = '<div class="empty"><p class="empty-title">성분 사전에 없는 이름이에요</p><a class="btn" href="#/dict">성분 사전으로</a></div>';
      return;
    }
    var pr = Store.profile();
    var e0 = entries[0];
    var aliases = [];
    entries.forEach(function (e) { e.aliases.forEach(function (a) { if (aliases.indexOf(a) === -1) aliases.push(a); }); });
    var avoiding = pr.avoid.map(Matcher.normalize).indexOf(Matcher.normalize(name)) !== -1;

    var html = '<section class="block"><h2 class="lead">' + esc(name) + '</h2>' +
      (e0.english ? '<p class="muted">' + esc(e0.english) + '</p>' : '') +
      '<p class="cos-tags">' + entries.map(catTag).join('') + '</p>' +
      (aliases.length ? '<p class="hint">다른 표기: ' + esc(aliases.join(', ')) + '</p>' : '') + '</section>';

    html += '<section class="block"><h2 class="block-title">설명</h2>' + entries.map(function (e) {
      var s = '<p class="desc"><span class="tag tag-' + e.category + '">' + UI.CAT[e.category].short + '</span> ' + esc(e.comment || '설명이 없어요.').replace(/\n/g, '<br>') + '</p>';
      if (e.skin.good.length) s += '<p class="line">' + e.skin.good.map(function (k) { return Insights.SKIN[k]; }).join(', ') + ' 피부에 좋다고 알려져 있어요.</p>';
      if (e.skin.avoid.length) s += '<p class="line">' + e.skin.avoid.map(function (k) { return Insights.SKIN[k]; }).join(', ') + ' 피부는 피하는 게 좋다고 알려져 있어요.</p>';
      if (pr.skinType && e.skin.avoid.indexOf(pr.skinType) !== -1) s += '<div class="notice notice-warn"><strong>내 피부(' + Insights.SKIN[pr.skinType] + ')는 조심하세요</strong></div>';
      return s;
    }).join('') + '</section>';

    var keys = [];
    entries.forEach(function (e) { e.keys.forEach(function (k) { keys.push(k); }); });
    var mine = Store.list().filter(function (it) {
      return Matcher.splitIngredients(it.text).some(function (t) { return keys.indexOf(Matcher.normalize(t)) !== -1; });
    });
    html += '<section class="block"><h2 class="block-title">내 화장대에서</h2>' +
      (mine.length ? '<ul class="cos-list cos-list-flush">' + mine.map(function (it) { return productRow(it); }).join('') + '</ul>'
        : '<p class="none">이 성분이 든 화장품이 없어요.</p>') + '</section>';

    html += '<section class="block"><button class="btn btn-block' + (avoiding ? '' : ' btn-primary') + '" type="button" id="avoidBtn">' +
      (avoiding ? '피할 성분에서 빼기' : '피할 성분에 추가') + '</button>' +
      '<p class="hint center">피할 성분이 든 화장품은 분석할 때 먼저 알려 드려요.</p></section>';
    view.innerHTML = html;

    document.getElementById('avoidBtn').addEventListener('click', function () {
      toggleAvoid(name);
      renderIngredient(name);
    });
  }

  function toggleAvoid(name) {
    var pr = Store.profile();
    var k = Matcher.normalize(name);
    var has = pr.avoid.some(function (n) { return Matcher.normalize(n) === k; });
    var list = has ? pr.avoid.filter(function (n) { return Matcher.normalize(n) !== k; }) : pr.avoid.concat([name]);
    Store.setProfile({ avoid: list });
    toast(has ? '피할 성분에서 뺐어요.' : '피할 성분에 추가했어요.');
  }

  // ---------- 내 피부 ----------
  function renderMe() {
    setChrome('내 피부', null, 'me');
    if (needIndex()) return;
    var pr = Store.profile();
    var groupCount = function (g) {
      return index.entries.filter(function (e) { return e.category !== 'good' && e.tags.indexOf(g) !== -1; }).length;
    };
    var html = '<section class="block"><h2 class="block-title">피부 타입</h2><div class="chips" role="group" aria-label="피부 타입">' +
      Object.keys(Insights.SKIN).map(function (k) { return UI.chip('data-skin="' + k + '"', Insights.SKIN[k], pr.skinType === k); }).join('') + '</div>' +
      '<p class="hint">성분 사전에 피부 타입 안내가 있는 성분(건성·지성·민감성)을 분석할 때 알려 드려요.</p></section>';

    html += '<section class="block"><h2 class="block-title">피부 고민</h2><div class="chips" role="group" aria-label="피부 고민">' +
      Object.keys(Insights.CONCERN).map(function (k) { return UI.chip('data-concern="' + k + '"', Insights.CONCERN[k], pr.concerns.indexOf(k) !== -1); }).join('') + '</div>' +
      '<p class="hint">고른 고민에 도움 되는 성분이 들었는지 분석 결과에서 보여 드려요. 여러 개 골라도 돼요.</p></section>';

    html += '<section class="block"><h2 class="block-title">피할 성분 묶음</h2><div class="chips" role="group" aria-label="피할 성분 묶음">' +
      Insights.AVOID_GROUPS.map(function (g) { return UI.chip('data-group="' + g + '"', Insights.GROUP[g] + ' ' + groupCount(g), pr.avoidGroups.indexOf(g) !== -1); }).join('') + '</div>' +
      '<p class="hint">숫자는 성분 사전에 있는 이름 수예요.</p></section>';

    html += '<section class="block"><h2 class="block-title">피할 성분</h2>' +
      (pr.avoid.length ? '<ul class="avoid-list">' + pr.avoid.map(function (n, i) {
        var inDict = byName.has(n);
        return '<li>' + (inDict ? '<a href="' + UI.ingHref(n) + '">' + esc(n) + '</a>' : '<span>' + esc(n) + '</span>') +
          '<button class="btn btn-small" type="button" data-remove="' + i + '">빼기</button></li>';
      }).join('') + '</ul>' : '<p class="none">아직 없어요. 성분 사전이나 트러블 성분 찾기에서 추가할 수 있어요.</p>') +
      '<label class="field-label" for="avoidInput">직접 추가</label>' +
      '<div class="inline"><input id="avoidInput" type="text" placeholder="예) 에탄올" list="avoidSuggest" autocomplete="off">' +
      '<button class="btn" type="button" id="avoidAdd">추가</button></div><datalist id="avoidSuggest"></datalist></section>';

    html += '<section class="block"><div class="rows">' +
      UI.row('#/trouble', '트러블 성분 찾기', '트러블 난 화장품들에 공통으로 든 성분을 찾아요.') +
      '</div></section>';

    html += '<section class="block"><h2 class="block-title">기록 백업</h2>' +
      '<p class="hint">기록은 이 브라우저에만 저장돼요. 기기를 바꾸기 전에 파일로 내려받아 두세요.</p>' +
      '<div class="btn-row"><button class="btn" type="button" id="exportBtn">파일로 내려받기</button>' +
      '<label class="btn"><input type="file" accept="application/json,.json" id="importInput" hidden>파일에서 불러오기</label></div></section>';

    view.innerHTML = html;

    function toggleIn(list, v) { return list.indexOf(v) === -1 ? list.concat([v]) : list.filter(function (x) { return x !== v; }); }
    on('[data-skin]', 'click', function () {
      var k = this.getAttribute('data-skin');
      Store.setProfile({ skinType: pr.skinType === k ? null : k });
      renderMe();
    });
    on('[data-concern]', 'click', function () { Store.setProfile({ concerns: toggleIn(pr.concerns, this.getAttribute('data-concern')) }); renderMe(); });
    on('[data-group]', 'click', function () { Store.setProfile({ avoidGroups: toggleIn(pr.avoidGroups, this.getAttribute('data-group')) }); renderMe(); });
    on('[data-remove]', 'click', function () {
      var i = Number(this.getAttribute('data-remove'));
      Store.setProfile({ avoid: pr.avoid.filter(function (_, j) { return j !== i; }) });
      renderMe();
    });
    var input = document.getElementById('avoidInput');
    var dl = document.getElementById('avoidSuggest');
    input.addEventListener('input', function () {
      var hits = input.value.trim() ? Matcher.search(input.value, index, 8) : [];
      dl.innerHTML = hits.map(function (e) { return '<option value="' + esc(e.name) + '">'; }).join('');
    });
    function addAvoid() {
      var v = input.value.trim();
      if (!v) { input.focus(); return; }
      var exact = Matcher.search(v, index, 1)[0];
      var name = exact && Matcher.normalize(exact.name) === Matcher.normalize(v) ? exact.name : v;
      if (pr.avoid.some(function (n) { return Matcher.normalize(n) === Matcher.normalize(name); })) { toast('이미 있어요.'); return; }
      Store.setProfile({ avoid: pr.avoid.concat([name]) });
      renderMe();
      toast('피할 성분에 추가했어요.');
    }
    document.getElementById('avoidAdd').addEventListener('click', addAvoid);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') addAvoid(); });

    document.getElementById('exportBtn').addEventListener('click', function () {
      var blob = new Blob([Store.exportJson()], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'hwaan-backup-' + UI.todayStr() + '.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    });
    document.getElementById('importInput').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      if (!confirm('지금 기록을 파일의 기록으로 바꿀까요? 지금 기록은 사라져요.')) return;
      f.text().then(function (t) {
        var n = Store.importJson(t);
        toast(n < 0 ? '불러오지 못했어요. 화안에서 내려받은 파일인지 확인해 주세요.' : '화장품 ' + n + '개를 불러왔어요.');
        renderMe();
      });
    });
  }

  // ---------- 트러블 성분 찾기 ----------
  function renderTrouble() {
    setChrome('트러블 성분 찾기', '#/me', 'me');
    if (needIndex()) return;
    var t = Insights.trouble(Store.list());
    var pr = Store.profile();
    var html = '<section class="block"><p class="hint">내 화장대에서 "트러블 났어요"로 표시한 화장품끼리 비교해, 두 개 이상에 함께 들어 있고 "잘 맞아요" 화장품에는 없는 성분을 찾아요. ' +
      '정제수·글리세린처럼 거의 모든 화장품에 드는 성분은 뺐어요.</p>' +
      '<p class="meta">트러블 났어요 ' + t.badCount + '개 · 잘 맞아요 ' + t.goodCount + '개</p></section>';
    if (t.badCount < 2) {
      html += '<div class="empty"><p class="empty-title">트러블 난 화장품이 두 개 이상 필요해요</p>' +
        '<p class="empty-desc">화장품 화면의 "써 보니"에서 "트러블 났어요"를 눌러 표시해 주세요. 잘 맞았던 화장품도 표시하면 더 정확해져요.</p>' +
        '<a class="btn" href="#/shelf">내 화장대로</a></div>';
    } else if (!t.list.length) {
      html += '<div class="empty"><p class="empty-title">공통 성분을 찾지 못했어요</p><p class="empty-desc">트러블 난 화장품들에 함께 든 성분이 없거나, 모두 잘 맞는 화장품에도 들어 있어요.</p></div>';
    } else {
      var avoid = UI.avoidMatcher(pr);
      html += '<section class="block"><ul class="ing-list">' + t.list.map(function (c) {
        var hit = analyzeText(c.name).items[0];
        var entry = hit && hit.hits[0];
        var avoiding = hit && avoid(hit);
        return '<li class="ing trouble-item"><div><p class="ing-name">' +
          (entry ? '<a href="' + UI.ingHref(entry.name) + '">' + esc(c.name) + '</a> ' + catTag(entry) : esc(c.name)) + '</p>' +
          '<p class="ing-desc">' + c.products.length + '개에 들어 있어요: ' + esc(c.products.join(', ')) + '</p></div>' +
          (avoiding ? '<span class="tag tag-neutral">피하는 중</span>' : '<button class="btn btn-small" type="button" data-avoid="' + esc(entry ? entry.name : c.name) + '">피하기</button>') +
          '</li>';
      }).join('') + '</ul><p class="note">함께 들어 있다고 원인이라는 뜻은 아니에요. 범위를 좁혀 보는 참고용이에요.</p></section>';
    }
    view.innerHTML = html;
    on('[data-avoid]', 'click', function () { toggleAvoid(this.getAttribute('data-avoid')); renderTrouble(); });
  }

  // ---------- 성분 상식 ----------
  function renderGuide(id) {
    var g = GUIDES.filter(function (x) { return x.id === id; })[0];
    if (!g) { location.replace('#/'); return; }
    setChrome('성분 상식', '#/', 'home');
    var others = GUIDES.filter(function (x) { return x.id !== id; });
    view.innerHTML = '<article class="block"><h2 class="lead">' + esc(g.title) + '</h2>' +
      g.body.map(function (p) { return '<p class="para">' + esc(p) + '</p>'; }).join('') + '</article>' +
      '<section class="block"><h2 class="block-title">다른 상식</h2><div class="rows">' +
      others.map(function (x) { return UI.row('#/guide/' + x.id, x.title, esc(x.summary)); }).join('') + '</div></section>';
  }

  // ---------- 라우터 ----------
  function route() {
    var h = location.hash || '#/';
    var m;
    var parts = h.replace(/^#\//, '').split('?')[0].split('/').map(function (s) {
      try { return decodeURIComponent(s); } catch (e) { return s; }
    });
    m = parts[0];
    if (m === 'shelf') renderShelf();
    else if (m === 'scan') renderScan(h.indexOf('?paste') !== -1);
    else if (m === 'p' && parts[1]) renderProduct(parts[1]);
    else if (m === 'compare' && parts[1]) renderCompare(parts[1], parts[2]);
    else if (m === 'dict') renderDict();
    else if (m === 'ing' && parts[1]) renderIngredient(parts.slice(1).join('/'));
    else if (m === 'me') renderMe();
    else if (m === 'trouble') renderTrouble();
    else if (m === 'guide' && parts[1]) renderGuide(parts[1]);
    else renderHome();
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', route);

  fetch('data/ingredients.json?v=2')
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (db) {
      index = Matcher.buildIndex(db);
      byName = new Map();
      index.entries.forEach(function (e) {
        if (!byName.has(e.name)) byName.set(e.name, []);
        byName.get(e.name).push(e);
      });
      route();
    })
    .catch(function () { indexError = true; route(); toast('성분 사전을 불러오지 못했어요.'); });

  route();
})();
