# iOS 런치 스크린(전면 스플래시) 이미지

홈 화면 아이콘 실행 시 뜨는 iOS 전용 전체화면 이미지입니다.
(안드로이드는 매니페스트 `background_color` + 아이콘으로 자동 구성 — 별도 이미지 불필요)

## 파일

- **`apple-splash.png`** — 1290 × 2796 px, 배경 `#191714`
  - 온볼 락업(공 + ONBALL + 밑줄)이 정중앙, 태그라인은 하단 9% 위치
  - 이 한 장이 `src/app/layout.tsx`의 `SPLASH_DEVICES` 모든 아이폰 해상도에 매핑되고,
    기기별 화면비 차이는 iOS가 스케일합니다

## 다시 굽는 법

**손으로 그리지 마세요.** `scripts/splash-master.html`이 원본이고, 크롬 헤드리스로 굽습니다
(새 의존성 없음 — PDF 생성에 쓰는 것과 같은 크롬):

```bash
chrome --headless=new --disable-gpu --hide-scrollbars \
       --force-device-scale-factor=3 --window-size=430,932 \
       --virtual-time-budget=4000 \
       --screenshot=public/splash/apple-splash.png \
       scripts/splash-master.html
```

`430 × 932 @3x = 1290 × 2796`. 윈도우에서는 두 경로 모두 절대경로여야 합니다.

## 왜 정지 이미지인가

웹·안드로이드에서는 `AppSplash.tsx`가 공이 튀어 들어오는 애니메이션을 코드로 그립니다.
iOS는 런치 스크린에 정지 PNG만 받으므로, **애니메이션의 착지 완료 상태**를 그대로 한 장으로 굽습니다.
그래서 `scripts/splash-master.html`의 `.lock` 수치는 `globals.css`의 `.splash-*`와 **같아야** 합니다.
한쪽만 바꾸면 OS 런치 이미지 → 앱 스플래시로 넘어갈 때 로고가 튑니다.

같은 이유로 iOS 설치형에서는 `layout.tsx`가 `<html>.splash-static`을 달아 바운스를 생략시킵니다.
(안 그러면 이미 자리잡은 로고가 다시 좌측으로 튕겨나갑니다)
