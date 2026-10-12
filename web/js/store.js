/*
 * 내 화장대·내 피부 기록 (브라우저 localStorage).
 * 원본 앱의 anal_cosmetic.db(anal_total / anal_* 테이블)를 대신한다.
 *
 * 성분 판정 결과는 저장하지 않고 전성분 글자(text)만 저장한다.
 * 볼 때마다 지금의 성분 사전으로 다시 판정하므로, 사전을 고치면 지난 기록에도 반영된다.
 * 구조를 바꿀 때는 SCHEMA_VERSION을 올리고 migrate()에 단계를 추가한다.
 *
 * v1 → v2 (2026-10-12): 화장품에 종류·개봉일·사용기한·사용 후기·메모, 내 피부 프로필 추가
 */
(function (root) {
  'use strict';

  var KEY = 'hwaan.records';
  var SCHEMA_VERSION = 2;

  function emptyProfile() {
    return {
      skinType: null,   // 'dry' | 'oily' | 'combination' | 'sensitive' | 'unknown' | null(아직 안 정함)
      concerns: [],     // 'uv' | 'whitening' | 'wrinkle'
      avoidGroups: [],  // 성분 묶음 태그: 'fragrance' | 'allergen' | 'paraben' | 'tar' | 'peg' ...
      avoid: []         // 피할 성분 이름 (사전 이름 또는 직접 넣은 이름)
    };
  }

  function emptyItemFields() {
    return { category: null, openedAt: null, paoMonths: null, rating: null, memo: '' };
  }

  function empty() { return { schemaVersion: SCHEMA_VERSION, items: [], profile: emptyProfile() }; }

  function migrate(data) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.items)) return empty();
    var v = data.schemaVersion || 1;
    if (v < 2) {
      data.items.forEach(function (it) {
        var extra = emptyItemFields();
        Object.keys(extra).forEach(function (k) { if (!(k in it)) it[k] = extra[k]; });
      });
      data.profile = emptyProfile();
      v = 2;
    }
    if (!data.profile) data.profile = emptyProfile();
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
    SCHEMA_VERSION: SCHEMA_VERSION,
    migrate: migrate,

    list: function () {
      return load().items.slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
    },
    get: function (id) {
      return load().items.filter(function (it) { return it.id === id; })[0] || null;
    },
    // item: { name, text, image(dataURL|null), category } → 저장된 id, 실패하면 null
    add: function (item) {
      var data = load();
      var rec = emptyItemFields();
      rec.id = newId();
      rec.name = item.name;
      rec.text = item.text;
      rec.image = item.image || null;
      rec.category = item.category || null;
      rec.createdAt = Date.now();
      data.items.push(rec);
      if (save(data)) return rec.id;
      // 사진 때문에 공간이 모자라면 사진 없이라도 저장한다
      if (rec.image) {
        rec.image = null;
        if (save(data)) return rec.id;
      }
      return null;
    },
    // patch: 바꿀 필드만 { name, category, openedAt, paoMonths, rating, memo }
    update: function (id, patch) {
      var data = load();
      data.items.forEach(function (it) {
        if (it.id !== id) return;
        Object.keys(patch).forEach(function (k) { it[k] = patch[k]; });
      });
      return save(data);
    },
    remove: function (id) {
      var data = load();
      data.items = data.items.filter(function (it) { return it.id !== id; });
      return save(data);
    },

    profile: function () { return load().profile; },
    setProfile: function (patch) {
      var data = load();
      Object.keys(patch).forEach(function (k) { data.profile[k] = patch[k]; });
      return save(data);
    },

    // 백업: 기록 전체를 JSON 글자로
    exportJson: function () { return JSON.stringify(load(), null, 1); },
    // 복원: 성공하면 화장품 수, 실패하면 -1
    importJson: function (text) {
      try {
        var data = JSON.parse(text);
        if (!data || !Array.isArray(data.items)) return -1;
        data = migrate(data);
        return save(data) ? data.items.length : -1;
      } catch (e) {
        return -1;
      }
    }
  };

  root.Store = Store;
})(this);
