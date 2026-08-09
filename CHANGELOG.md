# Changelog

## Fork: Personal Marble Roulette - 2026-08-09

이 아래 "원본 변경 이력" 은 원저작자 LazyGyu 의 기록이다. fork 이후 변경은 여기에 적는다.

- 2026-08-09:
    - **여러 명이 같은 화면을 본다.** 관리자가 seed 하나를 뿌리면 모든 접속자가
      자기 기기에서 같은 물리 시뮬레이션을 돌린다. 화면을 스트리밍하지 않는다.
    - **관리자 / 관전자 역할 분리.** 관리자만 참가자·맵·당첨 순위를 정하고 시작할 수 있다.
      서버가 관리자 키로 검증한다.
    - **호스팅 서버 추가** (`server.mjs`). 외부 의존성 없이 정적 서빙 + 방 상태 중계.
      방(`?room=`) 단위로 경기가 분리된다.
    - **관리자용 데스크톱 앱** (Electron). 서버 내장, 설치 과정 없는 portable exe.
      실행 시 '인터넷에 공개(도메인)' / '같은 와이파이만(IP)' 을 물어보고,
      공개를 고르면 Cloudflare 임시 터널로 도메인을 만들어 참가 주소로 쓴다.
    - **PWA 수정.** `start_url`/`scope` 를 상대경로로 바꿔 어디에 올려도 설치된다.
      서비스워커에 wasm/manifest 를 포함시켜 오프라인 실행이 가능해졌다.
    - **결정론 확보.** 시뮬레이션 난수를 시드 기반 PRNG 로 교체, 물리 진행을 프레임이 아닌
      공유 시각 기준으로 변경, 골인 구슬 제거를 시뮬레이션 시각 기준으로 변경.
    - **전송 방식을 폴링으로.** SSE 는 Cloudflare 터널에서 응답 본문이 막혀 사용 불가.
    - **수익화 요소 전부 제거.** 상점 버튼, 유료 상품 홍보 공지, 후원 링크, 상점 API 연동.
    - **외부 추적 제거.** umami, Google Analytics. 참가자 이름이 외부로 전송되던 경로도 사라졌다.
    - 보안: 관리자 키 128비트, 주소창에서 키 자동 제거, 방/본문 크기 상한,
      Electron 격리 옵션 및 외부 링크 차단.
    - 관전자 화면이 받은 경기를 자기 로컬 명단으로 덮어쓰던 문제 수정.
      페이지 초기화가 세션 적용보다 늦게 끝나면 setMarbles() 가 월드를 리셋해서
      진행자가 설정한 명단이 사라졌다.
    - 관전자가 시작 전에 링크를 열면 '진행자를 기다리는 중' 안내를 보여준다.
      예전에는 기본 이름이 채워진 룰렛만 보여서 링크가 고장난 것처럼 보였다.
    - 원본 버그 수정: 존재하지 않는 `#donate` 참조로 인한 `TypeError`.

## 원본 변경 이력 (lazygyu/roulette)

- 2025-11-13:
    - Optimized the rendering process.
- 2025-11-10:
    - Now it can be fast forwarded by mouse down or touch down the centural area of the canvas.
- 2025-11-01:
    - Support PWA
- 2024-05-22:
    - Replace the physics engine to [box2d-wasm](https://github.com/Birch-san/box2d-wasm) for improving the performance.
- 2024-02-19:
    - Improved the UI design
- 2024-02-16:
    - Add a feature for recording video
- 2024-02-14:
    - Add a map selector.
- 2024-01-18:
    - A new map has added.
- 2023-11-24:
    - Force move the marble randomly if it stays still over 1 second.
- 2023-10-08:
    - Save names in the local storage automatically.
- 2023-09-23:
    - You can move the viewport by dragging your cursor on the minimap.
- 2023-09-22:
    - Add a button that sets the last one to the winner.
- 2023-08-02:
    - Now the names will not cover the whole screen if there are many. You can scroll the names with your mouse wheel.
- 2023-07-29:
    - Adjusted the map to prevent a marble stays too long in a specific place.
- 2023-07-21:
    - Improve the performance when there are too many marbles in the game.
- 2023-07-21:
    - Fix the issue the slow-motion seems flickering
    - End the game immediately if only one marble survives and the winning rank is the last.
- 2023-07-16:
    - Now you can adjust the game speed.
- 2023-05-29:
    - Now you can shake the game if the marbles are being stuck for more than 3 seconds.

