# HANDOFF — Comfy Registry 등록 작업 인계

작성일: 2026-07-14
인계 사유: 이 레포(`ComfyUI-TJ_NODE_STUDIO_ONE`)는 별도 코드 챗에서 관리 →
`ComfyUI-TJ_NODE`(메인 팩)와 작업 분리.

---

## 1. 이미 완료된 것 (이 레포에 push 됨)

커밋 `ef74240` (origin/main)에 아래가 반영되어 있음:

- **`pyproject.toml`** 신설 — Comfy Registry 메타데이터
  ```toml
  [project]
  name = "comfyui-tj_node_studio_one"   # 레지스트리 고유 id
  version = "1.5.0"
  license = { file = "LICENSE" }
  requires-python = ">=3.9"

  [project.urls]
  Repository = "https://github.com/designloves2/ComfyUI-TJ_NODE_STUDIO_ONE"

  [tool.comfy]
  PublisherId = "designloves2"
  DisplayName = "ComfyUI-TJ_NODE_STUDIO_ONE"
  Icon = ""
  ```
- **`.github/workflows/publish.yml`** — `pyproject.toml` 변경 push 시 자동 퍼블리시
  (Action: `Comfy-Org/publish-node-action@v1`, secret `REGISTRY_ACCESS_TOKEN` 필요)
- **`.gitignore`** — `node.zip`(publish 산출물) 무시 추가
- Git 동기화: origin보다 1 커밋 뒤처졌던 것 stash→pull→pop 으로 최신화 완료
- `LICENSE` — 대문자 파일명 확인됨(Linux CI 문제 없음), MIT

## 2. 등록 상태 (2026-07-14 기준)

| 채널 | 상태 |
|------|------|
| ComfyUI-Manager (legacy `node_db/new/custom-node-list.json`) | ✅ 등록됨 |
| Comfy Registry (registry.comfy.org) | ✅ 최초 퍼블리시 완료 (수동) |

> Publisher: `designloves2` / API 키는 메인 팩과 동일 키 사용 가능.
> comfy-cli는 embedded python(`C:\AI\ComfyUI-Easy-Install\python_embeded\Scripts\comfy.exe`)에 설치돼 있음.

## 3. 남은 처리 (이 챗에서 결정/진행)

1. **`config_krea2.json` 로컬 수정분** — 아직 커밋 안 됨 (working tree에 `M config_krea2.json`).
   런타임 설정 파일이라 커밋/버리기/유지 중 선택 필요.
2. (선택) **GitHub secret `REGISTRY_ACCESS_TOKEN`** 을 이 레포에도 등록하면
   이후 `version` 올려 push 시 자동 재퍼블리시 (secret은 레포별 분리).
3. 새 버전 릴리스 방법: `pyproject.toml`의 `version` 상향 → push (또는 수동
   `comfy.exe node publish`).

## 4. 주의 — 겹침 방지

- 이 레포는 `ComfyUI-TJ_NODE`(메인 팩)와 **별개 레포**. 노드 등록/카테고리/문서를
  메인 팩과 섞지 말 것.
- 메인 팩 쪽 작업(예: Krea2 LoRA Analyzer 편입)은 이미 `ComfyUI-TJ_NODE`에서 완료됨.
