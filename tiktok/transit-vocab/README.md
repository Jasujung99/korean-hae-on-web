# 해온 틱톡 · 대중교통 단어 여섯

영어권 학습자를 위한 세로 영상입니다. 원고는 「Confusing Korean Public Transit Vocabulary Guide」이고, 화면은 지금 쓰는 해온 디자인 시스템(`src/design-system/`)을 따릅니다. 옛 디자인 시스템과 옛 사이트 파일은 쓰지 않습니다. 이 폴더는 누리집 빌드에 들어가지 않습니다.

- 화면: 1080×1920, 30fps, 66.4초
- 파일: `out/haeon-transit-vocab.mp4` (H.264 + AAC)
- 소리: 직접 합성한 배경 음악·효과음, 단어 발음만 한국어 TTS

## 다시 만들기

Chrome이 설치되어 있어야 합니다. 글꼴 파일은 `fonts/`에 있습니다.

```bash
cd tiktok/transit-vocab
npm install
python3 audio/tts_korean.py    # 이미 audio/voices/ 가 있으면 생략 가능
python3 audio/compose_audio.py
npm run render
```

장면만 보려면 `node render.mjs --at 2.0,10.2,63.2`.

TTS를 처음부터 받으려면 Hugging Face의 `akamotaco/ppaso-tts-v1`(Apache-2.0)을 `.cache/ppaso/`에 받습니다. `tts_korean.py`가 없을 때 받습니다. 모델 가중치는 저장소에 넣지 않습니다.

## 장면

| 시간 | 장면 | 화면 |
| --- | --- | --- |
| 0.0–3.5 | 훅 | 터미널 ≠ 종점. 건물이 아니라 마지막 정거장이라는 뜻도 아니라는 첫 문장 |
| 3.5–7.0 | 제목 | 영어권 학습자가 섞어 쓰는 여섯 단어 |
| 7.0–12.5 | 터미널 / 종점 | 큰 건물과 노선의 끝. 우리말샘은 둘을 같이 두기도 하지만, 길 위에서는 가른다는 말 |
| 12.5–15.8 | 확인 | 지하철 1호선 종점 O, 터미널 X |
| 15.8–19.2 | 확인 | 마을버스 종점 O. 길가 표지판뿐이어도 종점. 큰 건물이 없으면 터미널이 아님 |
| 19.2–22.6 | 확인 | 인천공항 터미널 O, 종점 X. 노선의 끝이 아님 |
| 22.6–27.3 | 정차 / 경유 | 차가 멈추는 동작, 중간 장소를 거치는 길 |
| 27.3–31.8 | 정차 문장 | 완전히 정차한 뒤에 일어나기. 무정차 통과. 급행은 이번 역에 정차하지 않음 |
| 31.8–36.2 | 경유 문장 | 시청을 경유해서 서울역. 도쿄 경유는 도쿄에서 갈아탐 |
| 36.2–41.0 | 정류장 / 정거장 | 길가의 작은 승차 자리, 그리고 남은 정거장을 세는 말 |
| 41.0–45.2 | 정류장 문장 | 집 앞 버스 정류장에서 143번. 택시 승차 자리는 보통 택시 승강장 |
| 45.2–49.8 | 정거장 문장 | 시청역까지 세 정거장. 버스 정거장이라고도 함 |
| 49.8–58.6 | 다시 보기 | 여섯 단어를 한 줄씩 |
| 58.6–66.4 | 끝 | 해온 로고, Your voice, in Korean. |

한국어 목소리는 각 단어가 처음 나올 때 한 번, 그리고 「세 정거장만 더」만 넣었습니다. 화면 글이 설명 전체를 맡습니다.

## 디자인 토큰

`web/video.css`가 `src/design-system/tokens.css`를 그대로 가져옵니다. 로고 경로도 `src/design-system/logos/logo-olive.svg`를 읽습니다. 1080×1920이라 글자 크기만 키웠고, 굵기·글꼴 가족·색·모서리는 토큰입니다.

| 토큰 | 쓴 곳 |
| --- | --- |
| `--paper` `#fefcf3` | 바탕 |
| `--wash-sage` `#eeefde` | 터미널·경유·정류장 칸, 장소 장면의 워시 |
| `--wash-lavender` `#eee6f0` | 종점·정차·정거장 칸, 경유 장면의 워시 |
| `--olive` `#4c4f2c` | 로고, 맞는 답 O, 가는 선, 저장 문구 |
| `--on-olive` | 채워진 정거장 숫자 |
| `--ink` `#262502` | 본문 |
| `--ink-muted` `#5a5956` | 로마자, 보조 문장, 구역 이름 |
| `--lavender-ink` `#564661` | 손글씨 메모, 경유 칩 |
| `--coral` `#ca8d75` | 같지 않음 표시, 틀린 답 X |
| `--leaf` `#a69e6e`, `--lavender` `#d3bae4` | 아래쪽 바람 곡선. 첫 화면의 잎·연보라 결 |
| `--line` `#b6b4b2` | 알약 테두리, 다시 보기 줄 |
| `--radius-md` `12px`, `--radius-pill` | 칸, 표지, 알약 |
| `--font-serif` Noto Serif KR | 한국어. 500 문장, 600 단어, 700 훅 |
| `--font-latin` EB Garamond | 영어, 로마자, 숫자, 태그라인 |
| `--font-sans` Noto Sans KR 300 | 구역 작은 제목 |
| `--font-hand` Nanum Pen Script | 우리말샘 메모 |

머리글의 새싹과 「해온 / haeon」은 사이트의 `HaeonLogo`와 같이 로고 SVG의 `mark`, `name-ko`, `name-en` 경로입니다. 끝 화면 태그라인은 사이트와 같은 “Your voice, in Korean.”과 “At ease. As yourself.”입니다.

## 글꼴

SIL Open Font License. 전문은 `fonts/OFL.txt`. Google Fonts에서 받은 원본을 이 영상에 나오는 글자만 남겨 `woff2`로 줄였습니다.

- Noto Serif KR — © 2017–2024 Adobe. Noto Sans KR — © 2014–2021 Adobe, Reserved Font Name ‘Source’
- EB Garamond — © 2017 The EB Garamond Project Authors
- Nanum Pen Script — © 2010 NHN Corporation. 글자 디자인 Sandoll Communications

저작권 표시는 `fonts/COPYRIGHT.txt`, 라이선스 본문은 `fonts/OFL.txt`입니다.

## 소리

자세한 라이선스는 `audio/LICENSES.md`.

- 배경 음악과 효과음: `audio/compose_audio.py`가 만든 원본 합성음. 별도 녹음이나 샘플 라이브러리를 쓰지 않았습니다. 이 합성 결과는 프로젝트 안에서 공개(CC0)로 둡니다.
- 한국어 TTS: [Ppaso-TTS v1](https://huggingface.co/akamotaco/ppaso-tts-v1) (Apache-2.0). 단어와 「세 정거장만 더」만 읽습니다. 만든 파일은 `audio/voices/`.
