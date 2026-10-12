// node tests/insights.test.js
const assert = require('assert');
const M = require('../web/js/matcher.js');
const I = require('../web/js/insights.js');
const index = M.buildIndex(require('../web/data/ingredients.json'));

let n = 0;
function test(name, fn) { fn(); n++; console.log('ok -', name); }

test('피할 성분 묶음과 직접 고른 성분을 찾는다', () => {
  const r = M.analyze('정제수, 향료, 메틸파라벤, 부틸렌글라이콜', index);
  const p = I.personal(r, { avoidGroups: ['fragrance', 'paraben'], avoid: ['부틸렌 글라이콜'] });
  assert.deepStrictEqual(p.avoidHits.map((h) => h.name).sort(), ['메틸파라벤', '부틸렌글라이콜', '향료'].sort());
  assert.strictEqual(p.level, 'warn');
});

test('알레르기 유발 성분 묶음', () => {
  const r = M.analyze('리날룰, 정제수', index);
  assert.strictEqual(I.personal(r, { avoidGroups: ['allergen'] }).avoidHits[0].name, '리날룰');
  assert.strictEqual(I.personal(r, { avoidGroups: [] }).avoidHits.length, 0);
});

test('피부 타입 안내와 고민 맞춤 성분', () => {
  const r = M.analyze('레티놀, 티타늄디옥사이드, 나이아신아마이드', index);
  const p = I.personal(r, { skinType: 'sensitive', concerns: ['whitening', 'wrinkle'] });
  assert.deepStrictEqual(p.skinAvoid, ['레티놀']);
  assert.deepStrictEqual(p.skinGood, ['티타늄디옥사이드']);
  assert.deepStrictEqual(p.concern.whitening, ['나이아신아마이드']);
  assert.deepStrictEqual(p.concern.wrinkle, ['레티놀']);
  assert.strictEqual(p.level, 'check');
});

test('사용기한: 개봉일 + 개월', () => {
  const e = I.expiry({ openedAt: '2026-01-15', paoMonths: 12 }, '2026-10-12T09:00:00');
  assert.strictEqual(e.until.getFullYear(), 2027);
  assert.strictEqual(e.daysLeft, 95);
  assert.strictEqual(I.expiry({ openedAt: null, paoMonths: 12 }), null);
});

test('트러블 공통 성분: 잘 맞는 화장품에 든 성분과 바탕 성분은 뺀다', () => {
  const items = [
    { name: 'A', rating: 'bad', text: '정제수, 코카미도프로필베타인, 향료, 알란토인' },
    { name: 'B', rating: 'bad', text: '정제수, 코카미도프로필베타인, 향료, 판테놀' },
    { name: 'C', rating: 'good', text: '정제수, 향료' }
  ];
  const t = I.trouble(items);
  assert.deepStrictEqual(t.list.map((x) => x.name), ['코카미도프로필베타인']);
  assert.strictEqual(I.trouble(items.slice(0, 1)).list.length, 0);
});

test('비교', () => {
  const c = I.compare('정제수, 글리세린, 향료', '정제수, 향 료, 판테놀');
  assert.deepStrictEqual(c.both, ['정제수', '향료']);
  assert.deepStrictEqual(c.onlyA, ['글리세린']);
  assert.deepStrictEqual(c.onlyB, ['판테놀']);
});

console.log(`\n${n} passed`);
