# 소리 라이선스

## 배경 음악과 효과음

`compose_audio.py`가 사인파, 감쇠하는 배음, 띠통과 잡음으로 직접 합성했습니다. 제3자의 녹음, 샘플 팩, 생성 음악 서비스를 쓰지 않았습니다.

이 스크립트로 만든 배경 음악과 효과음 줄기(stem)는 CC0 1.0으로 둡니다. 저작권을 주장하지 않으며, 출처를 밝히지 않고 상업 영상을 포함한 어디에나 실을 수 있습니다.

## 한국어 음성

모델: [akamotaco/ppaso-tts-v1](https://huggingface.co/akamotaco/ppaso-tts-v1)

- 라이선스: Apache License 2.0. 상업적 사용이 가능하고, NOTICE와 저작권 표시를 유지해야 합니다.
- 모델 카드의 설명: 학습 말뭉치는 Fun-CosyVoice 3.0(Apache-2.0)을 교사로 삼아 합성한 것이며, KSS처럼 비상업 데이터셋을 쓰지 않습니다. 보코더 설계는 Vocos(MIT)에서 힌트를 얻었고, Vocos 가중치는 포함하지 않습니다.
- 이 저장소는 모델 가중치를 다시 배포하지 않습니다. `tts_korean.py`가 필요할 때 Hugging Face에서 받습니다.
- 영상에 넣은 음성 파일(`audio/voices/*.wav`)은 그 모델로 만든 짧은 발음입니다. 배포할 때는 이 파일이 AI 음성이며 Ppaso-TTS(Apache-2.0, akamotaco)로 만들었다고 밝히는 것이 좋습니다.

읽은 문장:

| 파일 | 텍스트 |
| --- | --- |
| `teomineol.wav` | 터미널. |
| `jongjeom.wav` | 종점. |
| `jeongcha.wav` | 정차. |
| `gyeongyu.wav` | 경유. |
| `jeongryujang.wav` | 정류장. |
| `jeonggeojang.wav` | 정거장. |
| `sejeonggeo.wav` | 세 정거장만 더. |

전체 내레이션은 넣지 않았습니다.
