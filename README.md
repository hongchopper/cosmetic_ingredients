# 화안 (SwuMakeUpShot)

화장품 **전성분표를 사진으로 찍으면** 주의 성분, 알레르기 유발 성분, 좋은 성분을 자동으로 찾아 알려주는 서비스입니다.
졸업프로젝트로 만든 Android 앱을 **모바일 웹**(`web/`)으로 옮기고 있습니다. Android 원본 코드는 비교용으로 그대로 두었습니다.

## 모바일 웹 (`web/`)

설치 없이 휴대폰 브라우저에서 바로 씁니다. 홈 화면에 추가하면 앱처럼 열립니다.

**👉 바로 써 보기: https://hongchopper.github.io/cosmetic_ingredients/**

| 화면 | 하는 일 | 원본 앱 |
| --- | --- | --- |
| 내 화장품 `#/` | 저장한 화장품 목록, 성분 종류별 개수 | MainActivity |
| 성분 분석 `#/scan` | 사진 찍기·앨범에서 고르기 → 글자 인식 → 분석 → 이름 붙여 저장. 글자를 직접 붙여 넣어도 됨 | textDetector, SubActivity |
| 저장한 화장품 `#/item/…` | 분석 결과, 인식한 전성분 글자, 삭제 | DetailActivity |
| 성분 검색 `#/search` | 한글·영문 성분 이름으로 사전 검색 | (원본에선 버튼만 있고 미구현) |

### 원본 앱에서 고친 점

- **사진 방향**: 카메라 사진을 무조건 60도 돌리던 것을 없애고, 사진의 EXIF 방향을 따릅니다 (`web/js/ocr.js`).
- **성분 나누기**: `,` `.`만이 아니라 줄바꿈·가운뎃점·세미콜론으로도 나누고, `1,2-헥산다이올`처럼 숫자 사이 쉼표는 이름으로 남깁니다. `[전성분]` 머리말과 함량(%)도 지웁니다. 두 줄에 걸친 이름은 이어 붙이되, 붙인 이름이 사전에 없으면 줄마다 다시 찾습니다 (`web/js/matcher.js`).
- **성분 맞추기**: 띄어쓰기·하이픈·대소문자를 무시하고, 영문명과 `;`로 적힌 다른 표기(예: 다이메티콘/디메치콘)도 같은 성분으로 봅니다. 글자 인식 오타는 1~2글자까지 "비슷한 이름"으로 찾되(짧은 이름은 제외), 화면에 무엇으로 읽혔는지 함께 보여 줍니다. 원본은 좋은 성분의 영문명을 비교하지 않았는데 이제 비교합니다.
- **SQL 문자열 이어 붙이기**: 웹에서는 SQL을 쓰지 않으므로 따옴표가 든 이름 때문에 생기던 오류가 없습니다. 기록은 브라우저 저장소(localStorage)에 `schemaVersion`과 함께 저장합니다 (`web/js/store.js`).
- **성분 검색** 구현, **분석 결과 화면** 정리 (개수 요약, 성분별 설명, 영문명).
- 원본 앱의 `assets/cosmetic_file.db`는 영문명 열과 좋은 성분 표가 빠진 옛 버전이었습니다. 웹은 `caution_cosmetic/cosmetic_file.db`(최신본)를 씁니다.

### 동작 방식

- **글자 인식**: [Tesseract.js](https://github.com/naptha/tesseract.js) 5.1.1(한국어+영어)이 **브라우저 안에서** 돌아갑니다. 사진은 서버로 보내지 않습니다. 처음 한 번 인식 엔진과 한국어 데이터(수 MB)를 CDN에서 받아 오므로 시간이 걸리고, 그다음부터는 브라우저에 남아 빨라집니다.
- **성분 사전**: `web/data/ingredients.json` (주의 667 · 알레르기 34 · 좋은 58). DB를 고친 뒤에는 다시 내보냅니다.
  ```bash
  python3 tools/export-db.py
  ```
- **저장**: 화장품마다 이름, 인식한 전성분 글자, 작은 사진을 저장합니다. 판정 결과는 볼 때마다 지금의 사전으로 다시 계산하므로, 사전을 고치면 지난 기록에도 반영됩니다. 기록은 그 브라우저에만 남습니다.

### 실행·확인

```bash
python3 -m http.server -d web 8000   # http://localhost:8000
node tests/matcher.test.js           # 성분 나누기·맞추기 테스트
```

카메라 촬영은 HTTPS(또는 localhost)에서만 동작합니다. 같은 Wi-Fi의 휴대폰으로 시험할 때는 배포 주소를 쓰는 편이 쉽습니다.

### 배포

`master`에 `web/`이 바뀌어 올라가면 `.github/workflows/pages.yml`이 GitHub Pages로 배포합니다.
처음 한 번 저장소 **Settings → Pages → Source**를 **GitHub Actions**로 바꿔 주세요.

---

## Android 원본

### 주요 기능

- **전성분 촬영 / 불러오기**: CameraX로 바로 촬영하거나 갤러리에서 사진을 선택
- **한글 OCR**: Google ML Kit 한국어 텍스트 인식으로 성분 목록 추출
- **성분 분석**: 추출한 성분을 내장 DB와 대조해 세 가지로 분류
  - 🔴 **주의 성분** (671종)
  - 🟠 **알레르기 유발 성분** (34종)
  - 🔵 **좋은 성분** (58종)
  - 한글명뿐 아니라 영문명으로 적힌 성분도 매칭 (주의·알레르기 성분)
- **분석 결과 저장**: 화장품 이름을 입력해 결과와 사진을 함께 저장
- **내 화장품 목록**: 저장한 화장품을 목록으로 보고, 눌러서 상세 결과 확인 · 길게 눌러 삭제

### 사용 흐름

```
인트로(IntroActivity)
   └─▶ 내 화장품 목록(MainActivity)
          ├─ 항목 터치 ─▶ 상세 결과(DetailActivity)
          └─ 카메라 버튼 ─▶ 사진 선택/촬영(textDetector ─ cameraX)
                              └─ 분석 ─▶ 분석 결과·저장(SubActivity)
```

### 기술 스택

| 구분 | 사용 기술 |
| --- | --- |
| 언어 | Java 8 |
| 플랫폼 | Android (minSdk 23 / targetSdk 33) |
| 빌드 | Gradle, Android Gradle Plugin 7.3.1 |
| 카메라 | AndroidX CameraX |
| 텍스트 인식 | Google ML Kit Text Recognition (Korean) |
| 데이터 저장 | SQLite (assets에 포함된 DB를 기기로 복사해 사용) |
| UI | AppCompat, Material Components, RecyclerView |

### 프로젝트 구조

```
SwuMakeUpShot/
├── app/
│   └── src/main/
│       ├── java/com/example/swumakeupshot/
│       │   ├── IntroActivity.java      # 스플래시 화면
│       │   ├── MainActivity.java       # 저장된 화장품 목록
│       │   ├── textDetector.java       # 이미지 촬영/선택 화면
│       │   ├── cameraX.java            # CameraX 촬영 화면
│       │   ├── SubActivity.java        # OCR + 성분 분석 + 저장
│       │   ├── DetailActivity.java     # 저장된 화장품 상세 결과
│       │   ├── DataBaseHelper(2).java  # SQLite 헬퍼 (성분 DB / 분석 결과 DB)
│       │   ├── DataAdapter(2).java     # DB 조회 어댑터
│       │   ├── Adapter.java, ListItem.java  # 목록(RecyclerView) 어댑터·모델
│       │   └── PermissionSupport.java  # 런타임 권한 처리
│       ├── assets/
│       │   ├── cosmetic_file.db        # 성분 기준 DB
│       │   └── anal_cosmetic.db        # 분석 결과 저장 DB
│       └── res/                        # 레이아웃, 아이콘 등 리소스
└── caution_cosmetic/                   # DB 원본 파일 (DB Browser for SQLite 프로젝트 포함)
```

### 데이터베이스

**`cosmetic_file.db`** — 성분 기준 데이터 (컬럼: `name`, `comment`, `english`)

| 테이블 | 내용 | 개수 |
| --- | --- | --- |
| `caution_ingredients_table` | 주의 성분과 설명 | 671 |
| `allergy_ingredients_table` | 알레르기 유발 성분과 설명 | 34 |
| `good_ingredients_table` | 좋은 성분과 설명 | 58 |

**`anal_cosmetic.db`** — 사용자가 저장한 분석 결과

| 테이블 | 내용 |
| --- | --- |
| `anal_total` | 화장품 이름, 성분 종류별 개수, 사진 URI |
| `anal_cautious` / `anal_allergy` / `anal_good` | 화장품별로 검출된 성분 목록 |

### 실행 방법

1. 저장소를 클론합니다.
   ```bash
   git clone https://github.com/hongchopper/SwuMakeUpShot.git
   ```
2. Android Studio에서 프로젝트 폴더를 엽니다.
3. Gradle Sync가 끝나면 실제 기기(카메라 필요) 또는 에뮬레이터에서 `app`을 실행합니다.

> 앱은 카메라와 저장소 접근 권한을 요청합니다. 촬영한 사진은 `DCIM/swumakeupshot` 폴더에 저장됩니다.

### 참고

- 성분 판정은 앱에 포함된 DB와 OCR로 읽은 텍스트가 정확히 일치하는지로 이뤄지므로, 사진이 흐리거나 성분명이 잘려 인식되면 결과가 누락될 수 있습니다.
- 분석 결과는 참고용이며, 피부 상태에 대한 판단은 전문가와 상담하세요.
