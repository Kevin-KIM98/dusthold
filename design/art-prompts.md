# 아트 생성 프롬프트 (Higgsfield 수작업용)

영주가 Higgsfield에서 직접 만들 때 그대로 복사해서 쓰는 프롬프트 모음.
각 칸의 영어 프롬프트를 통째로 복사해 붙여 넣으면 된다. **항목당 1장씩만** 만들고, 마음에 안 들 때만 다시 만든다.

- 이 게임은 **오리지널**이다. 프롬프트에 다른 게임 이름·제작사 이름을 절대 덧붙이지 않는다.
- 색은 지금 게임 화면(파란 지붕·금색 장식·초록 궁수·붉은 약탈단)에 맞춰 두었다.

---

## 0. 순서 한눈에

| 단계 | 할 일 | 도구(모델) | 비율 | 대략 비용 |
|---|---|---|---|---|
| ① | (선택) 완성 화면 컨셉 1장 | 이미지 — GPT Image (`gpt_image_2_6`) | 16:9 | 0.25 |
| ② | 바닥 텍스처 2장 (잔디·흙길) | 이미지 — GPT Image | 1:1 | 0.25 × 2 |
| ③ | 3D용 그림 11장 (성주·유닛·건물·나무·바위) | 이미지 — GPT Image | 1:1 | 0.25 × 11 |
| ④ | ③의 그림을 3D 모델로 변환 | 3D — **Meshy 7 Image to 3D** | - | 38 × 개수 |

- 크레딧이 모자라면 **② 텍스처만** 먼저 해도 화면이 크게 좋아진다 (0.5 크레딧).
- ④는 비싸므로 **성주 → 궁수 → 약탈자 → 성채** 순으로 필요한 만큼만.

---

## ① (선택) 완성 화면 컨셉 이미지 — 16:9

색감·분위기 참고용. 만들어서 보내 주면 화면 색·빛을 이 그림에 맞춰 다듬는다.

```
cozy stylized low-poly fantasy defense game, isometric three-quarter top-down view from 55 degrees,
a small stone castle with blue conical roofs and gold flags in the center of a green meadow,
wooden palisade wall with a gate, two wooden watchtowers with archers in green hoods,
a lord in a red cape riding a fluffy white ram with curled golden horns, a stack of silver coins on his back,
dirt road winding in from the edge, raiders in red hoods approaching, a large rock golem,
warm afternoon sunlight, soft shadows, bright saturated colors, clean readable shapes, mobile game concept art,
no text, no logo, no watermark, no UI
```

---

## ② 바닥 텍스처 — 1:1 (seamless 3대 조건 포함)

이어 붙여도 경계가 안 보여야 한다. 아래 프롬프트에는 **seamless tileable / top-down orthogonal view / no shadows** 세 가지가 꼭 들어 있다. 지우지 말 것.

### ②-1 잔디 (파일명: `grass.png`)
```
seamless tileable grass meadow ground texture, top-down orthogonal view,
short lush stylized grass in fresh spring green with subtle lighter and darker patches,
a few tiny clover leaves, hand-painted low-poly game style, soft color variation, low contrast,
even flat lighting, no shadows, no flowers, no stones, no paths,
no logos, no watermark, no text, 1:1 square, high detail base color
```

### ②-2 흙길 (파일명: `path.png`)
```
seamless tileable packed dirt road texture, top-down orthogonal view,
warm sandy beige and light brown earth with faint wheel ruts, a few tiny pebbles,
hand-painted low-poly game style, low contrast, soft color variation,
even flat lighting, no shadows, no grass, no puddles,
no logos, no watermark, no text, 1:1 square, high detail base color
```

> 만든 뒤 확인: 같은 그림 4장을 2×2로 붙였을 때 가운데 십자 경계선이 보이면 다시 만든다 (보내 주면 제가 확인해 드림).

---

## ③ 3D 모델용 그림 — 1:1

3D로 바꾸기 좋은 그림의 조건이 모든 프롬프트 끝에 공통으로 붙어 있다: **물체 하나만, 전체가 다 보이게, 하얀 배경, 그림자·글자 없음, 앞쪽을 보는 3/4 각도.**

### ③-1 성주 — 뿔양 기수 (파일명: `commander.glb`)
```
a single stylized low-poly game character: a small heroic lord riding a fluffy white ram with big curled golden horns,
the lord wears a blue tunic with a gold belt, a red cape, a round silver helmet with a red plume, a small blue round shield,
a red saddle blanket with gold trim, chunky cute proportions, clear readable silhouette, bright saturated colors,
full body visible, front three-quarter view, standing still, centered, isolated on a pure white background,
soft even lighting, no cast shadow, no ground, no text, no watermark
```

### ③-2 궁수 (파일명: `archer.glb`)
```
a single stylized low-poly game character: a young archer in a green hooded cloak with a brown leather quiver on the back,
holding a wooden longbow, brown boots, chunky cute proportions, clear readable silhouette, bright saturated colors,
full body visible, front three-quarter view, standing pose, centered, isolated on a pure white background,
soft even lighting, no cast shadow, no ground, no text, no watermark
```

### ③-3 약탈자 (파일명: `raider.glb`)
```
a single stylized low-poly game character: a scruffy bandit raider in a dark red hood and patched brown leather clothes,
holding a wooden club, a mischievous grin, chunky cute proportions, clear readable silhouette, bright saturated colors,
full body visible, front three-quarter view, standing pose, centered, isolated on a pure white background,
soft even lighting, no cast shadow, no ground, no text, no watermark
```

### ③-4 방패 약탈자 (파일명: `shield.glb`)
```
a single stylized low-poly game character: a stocky armored raider with a dented iron helmet and dark grey padded armor,
holding a big round wooden shield with an iron rim in front of the body, chunky sturdy proportions,
clear readable silhouette, bright saturated colors,
full body visible, front three-quarter view, standing pose, centered, isolated on a pure white background,
soft even lighting, no cast shadow, no ground, no text, no watermark
```

### ③-5 바위 거인 (파일명: `giant.glb`)
```
a single stylized low-poly game monster: a huge friendly-looking rock golem made of grey boulders,
green moss on the shoulders and back, small glowing yellow eyes, big heavy fists, short thick legs,
chunky proportions, clear readable silhouette, faceted low-poly rock surfaces,
full body visible, front three-quarter view, standing pose, centered, isolated on a pure white background,
soft even lighting, no cast shadow, no ground, no text, no watermark
```

### ③-6 성채 (파일명: `castle.glb`)
```
a single stylized low-poly game building: a small square stone castle keep on a stone plinth,
four round corner towers with blue conical roofs, a taller central tower with a blue roof and a gold flag,
battlements along the walls, small dark windows, an arched wooden gate on the front with two blue banners,
chunky cute proportions, clean readable shapes, bright saturated colors,
whole building visible, front three-quarter view from slightly above, centered, isolated on a pure white background,
soft even lighting, no cast shadow, no ground, no text, no watermark
```

### ③-7 궁수 막사 (파일명: `barracks.glb`)
```
a single stylized low-poly game building: a small timber-framed archer barracks with white plaster walls,
dark wooden beams, a red gabled roof, a wooden door, a green banner on a pole, a round archery target on a stand beside it,
chunky cute proportions, clean readable shapes, bright saturated colors,
whole building visible, front three-quarter view from slightly above, centered, isolated on a pure white background,
soft even lighting, no cast shadow, no ground, no text, no watermark
```

### ③-8 세금 탁자 (파일명: `taxTable.glb`)
```
a single stylized low-poly game prop: a small wooden market tax table with a blue cloth,
a red and cream striped canopy on two wooden posts, a small wooden chest with gold trim next to it,
chunky cute proportions, clean readable shapes, bright saturated colors,
whole object visible, front three-quarter view from slightly above, centered, isolated on a pure white background,
soft even lighting, no cast shadow, no ground, no coins, no people, no text, no watermark
```

### ③-9 망루 (파일명: `tower.glb`)
```
a single stylized low-poly game building: a wooden watchtower on a round stone base,
an open square wooden platform with railings at the top, four tall corner posts holding a small red pointed roof high above,
open sides so archers on the platform are visible, chunky proportions, clean readable shapes, bright saturated colors,
whole building visible, front three-quarter view from slightly above, centered, isolated on a pure white background,
soft even lighting, no cast shadow, no ground, no people, no text, no watermark
```

### ③-10 나무 (파일명: `tree.glb`)
```
a single stylized low-poly game tree: a chunky pine tree with three stacked faceted cone layers in fresh green,
a short brown trunk, clean readable shape, bright saturated colors,
whole tree visible, side view, centered, isolated on a pure white background,
soft even lighting, no cast shadow, no ground, no grass, no text, no watermark
```

### ③-11 바위 (파일명: `rock.glb`)
```
a single stylized low-poly game prop: a small cluster of three faceted grey boulders, one large and two small,
a little green moss on top, clean readable shape, soft colors,
whole object visible, front three-quarter view, centered, isolated on a pure white background,
soft even lighting, no cast shadow, no ground, no grass, no text, no watermark
```

---

## ④ 3D 변환 설정 (Meshy 7 Image to 3D)

③의 그림을 넣고 아래처럼 맞춘다. **삼각형 수가 상한을 넘으면 게임이 그 모델을 거절하고 도형을 쓴다** (폰이 느려지지 않게).

| 항목 | 모델 종류(model type) | 목표 폴리곤(target polycount) | 게임 상한 |
|---|---|---|---|
| 성주·궁수·약탈자·방패 약탈자·거인 | lowpoly | **1,200** | 1,500 |
| 나무·바위 | lowpoly | **2,000** | 3,000 |
| 성채·막사·세금 탁자·망루 | lowpoly | **8,000** | 20,000 |

- 텍스처 입히기(should texture): **켜기**
- PBR: 끄기 (필요 없음, 파일만 커짐)
- 리깅·애니메이션: 끄기 (게임이 직접 통통 튀는 움직임을 넣음)

---

## ⑤ 다 만든 뒤 넘겨주는 법

1. 만든 결과(텍스처 그림, GLB 파일)를 받아 위 표의 **파일명**으로 저장한다.
2. 대화에 "만들었어"라고 알려 주면서 파일이나 다운로드 링크를 보내 준다.
   - Higgsfield가 이 작업 세션에도 연결돼 있으니, 같은 계정에서 만들었다면 제가 결과를 찾아볼 수도 있다.
3. 제가 `assets/textures/`·`assets/models/`에 넣고 `assets/manifest.json`에 적은 뒤, 크기·방향을 맞추고 성능 상한(draw call 150·삼각형 20만)을 다시 확인한다.
