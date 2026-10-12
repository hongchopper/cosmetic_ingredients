// node tests/matcher.test.js
const assert = require('assert');
const path = require('path');
const M = require('../web/js/matcher.js');
const db = require('../web/data/ingredients.json');
const index = M.buildIndex(db);

let n = 0;
function test(name, fn) { fn(); n++; console.log('ok -', name); }
const names = (r, cat) => r[cat].map((x) => x.name);

test('머리말·함량을 지우고 쉼표로 나눈다', () => {
  assert.deepStrictEqual(
    M.splitIngredients('[전성분] 정제수, 글리세린(10%), 부틸렌글라이콜.'),
    ['정제수', '글리세린', '부틸렌글라이콜']);
});

test('숫자 사이 쉼표는 성분 이름의 일부', () => {
  assert.deepStrictEqual(M.splitIngredients('정제수, 1,2-헥산다이올, 향료'), ['정제수', '1,2-헥산다이올', '향료']);
});

test('줄 끝 쉼표 뒤 줄바꿈 / 두 줄로 나뉜 이름', () => {
  assert.deepStrictEqual(M.splitIngredients('정제수, 부틸렌\n글라이콜, 향\n료'), ['정제수', '부틸렌글라이콜', '향료']);
});

test('띄어쓰기·대소문자 무시, 영문명도 매칭', () => {
  const r = M.analyze('정제수, 디아졸리디닐 우레아, LINALOOL', index);
  assert.ok(names(r, 'caution').includes('디아졸리디닐우레아'));
  assert.ok(names(r, 'allergy').includes('리날룰'));
  assert.strictEqual(r.allergy.find((x) => x.name === '리날룰').match, 'exact');
});

test(';로 적힌 다른 표기도 같은 성분', () => {
  const r = M.analyze('피이지-10디메치콘', index);
  assert.deepStrictEqual(names(r, 'caution'), ['피이지-10다이메티콘']);
});

test('OCR 오타 한 글자는 비슷한 이름으로', () => {
  const r = M.analyze('디아졸리디닐유레아', index);
  assert.strictEqual(r.caution[0].name, '디아졸리디닐우레아');
  assert.strictEqual(r.caution[0].match, 'similar');
});

test('짧은 이름은 오타를 허용하지 않는다', () => {
  const r = M.analyze('향로', index);
  assert.strictEqual(r.caution.length + r.allergy.length + r.good.length, 0);
});

test('쉼표가 빠진 채 줄이 바뀌어도 줄마다 찾는다', () => {
  const r = M.analyze('리날룰\n쿠마린', index);
  assert.deepStrictEqual(names(r, 'allergy').sort(), ['리날룰', '쿠마린'].sort());
});

test('같은 성분은 한 번만', () => {
  const r = M.analyze('향료, 향료, 향 료', index);
  assert.strictEqual(r.caution.filter((x) => x.name === '향료').length, 1);
});

test('검색: 부분 일치, 정확히 같은 이름이 먼저', () => {
  const hits = M.search('리날', index);
  assert.strictEqual(hits[0].name, '리날룰');
  assert.ok(M.search('linal', index).some((e) => e.name === '리날룰'));
});

console.log(`\n${n} passed`);
