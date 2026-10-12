/*
 * 사진 → 글자 (브라우저 안에서 Tesseract.js로 읽는다. 사진은 서버로 보내지 않는다.)
 *
 * 원본 앱(textDetector)은 카메라 사진을 무조건 60도 돌렸다.
 * 여기서는 createImageBitmap의 imageOrientation: 'from-image'로 사진의 EXIF 방향을 그대로 따른다.
 */
(function (root) {
  'use strict';

  var TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  var MAX_SIDE = 2200;  // 너무 크면 느리고, 너무 작으면 작은 글씨를 못 읽는다
  var THUMB_SIDE = 360; // 기록에 함께 저장할 미리보기 크기

  var scriptPromise = null;
  var workerPromise = null;

  function loadScript() {
    if (root.Tesseract) return Promise.resolve();
    if (!scriptPromise) {
      scriptPromise = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = TESSERACT_URL;
        s.onload = resolve;
        s.onerror = function () { scriptPromise = null; reject(new Error('script')); };
        document.head.appendChild(s);
      });
    }
    return scriptPromise;
  }

  var progressCb = null;
  function getWorker() {
    if (!workerPromise) {
      workerPromise = loadScript().then(function () {
        return root.Tesseract.createWorker('kor+eng', 1, {
          logger: function (m) { if (progressCb) progressCb(m); }
        });
      }).then(function (worker) {
        // 전성분표는 한 덩어리 글이므로 '단일 블록'으로 읽는다
        return worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' })
          .then(function () { return worker; });
      }).catch(function (e) { workerPromise = null; throw e; });
    }
    return workerPromise;
  }

  function decode(file) {
    if (root.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () {
        return decodeWithImg(file);
      });
    }
    return decodeWithImg(file);
  }

  // createImageBitmap이 없는 브라우저: <img>도 요즘 브라우저는 EXIF 방향을 적용한다
  function decodeWithImg(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode')); };
      img.src = url;
    });
  }

  function draw(src, maxSide) {
    var w = src.width;
    var h = src.height;
    var scale = Math.min(1, maxSide / Math.max(w, h));
    var c = document.createElement('canvas');
    c.width = Math.round(w * scale);
    c.height = Math.round(h * scale);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c;
  }

  // 흑백 + 대비 늘리기: 반사광·배경색이 있는 용기 사진에서 인식률이 오른다
  function enhance(canvas) {
    var ctx = canvas.getContext('2d');
    var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var d = img.data;
    var min = 255;
    var max = 0;
    var i;
    var gray = new Uint8ClampedArray(d.length / 4);
    for (i = 0; i < gray.length; i++) {
      var g = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
      gray[i] = g;
      if (g < min) min = g;
      if (g > max) max = g;
    }
    var range = Math.max(1, max - min);
    for (i = 0; i < gray.length; i++) {
      var v = ((gray[i] - min) * 255) / range;
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  var Ocr = {
    // 파일 → { canvas: 인식용, thumb: 저장용 dataURL, preview: 화면 표시용 objectURL }
    prepare: function (file) {
      return decode(file).then(function (bmp) {
        var canvas = enhance(draw(bmp, MAX_SIDE));
        var thumb = draw(bmp, THUMB_SIDE).toDataURL('image/jpeg', 0.72);
        if (bmp.close) bmp.close();
        return { canvas: canvas, thumb: thumb };
      });
    },
    // onProgress(0~1, 단계 문구)
    recognize: function (canvas, onProgress) {
      progressCb = function (m) {
        if (!onProgress) return;
        if (m.status === 'recognizing text') onProgress(0.3 + m.progress * 0.7, '글자 읽는 중');
        else if (/load|initializ/i.test(m.status)) onProgress(Math.min(0.3, (m.progress || 0) * 0.3), '글자 인식 준비 중 (처음 한 번은 오래 걸려요)');
      };
      return getWorker().then(function (worker) {
        return worker.recognize(canvas);
      }).then(function (res) {
        progressCb = null;
        return res.data.text || '';
      }, function (e) {
        progressCb = null;
        throw e;
      });
    }
  };

  root.Ocr = Ocr;
})(this);
