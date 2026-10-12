/*
 * 저장한 화장품 기록 (브라우저 localStorage).
 * 원본 앱의 anal_cosmetic.db(anal_total / anal_* 테이블)를 대신한다.
 *
 * 성분 판정 결과는 저장하지 않고 전성분 글자(text)만 저장한다.
 * 볼 때마다 지금의 성분 DB로 다시 판정하므로, DB를 고치면 지난 기록에도 반영된다.
 * 구조를 바꿀 때는 SCHEMA_VERSION을 올리고 migrate()에 단계를 추가한다.
 */
(function (root) {
  'use strict';

  var KEY = 'hwaan.records';
  var SCHEMA_VERSION = 1;

  function empty() { return { schemaVersion: SCHEMA_VERSION, items: [] }; }

  function migrate(data) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.items)) return empty();
    // 예: if (data.schemaVersion === 1) { ...; data.schemaVersion = 2; }
    data.schemaVersion = SCHEMA_VERSION;
    return data;
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      return raw ? migrate(JSON.parse(raw)) : empty();
    } catch (e) {
      return empty();
    }
  }

  function save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      return false; // 저장 공간 부족 또는 저장소 사용 불가(사생활 보호 모드 등)
    }
  }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  var Store = {
    list: function () {
      return load().items.slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
    },
    get: function (id) {
      return load().items.filter(function (it) { return it.id === id; })[0] || null;
    },
    // item: { name, text, image(dataURL|null) } → 저장된 id, 실패하면 null
    add: function (item) {
      var data = load();
      var rec = {
        id: newId(),
        name: item.name,
        text: item.text,
        image: item.image || null,
        createdAt: Date.now()
      };
      data.items.push(rec);
      if (save(data)) return rec.id;
      // 사진 때문에 공간이 모자라면 사진 없이라도 저장한다
      if (rec.image) {
        rec.image = null;
        if (save(data)) return rec.id;
      }
      return null;
    },
    rename: function (id, name) {
      var data = load();
      data.items.forEach(function (it) { if (it.id === id) it.name = name; });
      return save(data);
    },
    remove: function (id) {
      var data = load();
      data.items = data.items.filter(function (it) { return it.id !== id; });
      return save(data);
    }
  };

  root.Store = Store;
})(this);
