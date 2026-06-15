# Claude Code 설치 및 연동 가이드

## 1. Claude Code 설치

```bash
# macOS / Linux / WSL
npm install -g @anthropic-ai/claude-code

# 설치 확인
claude --version
claude doctor
```

> ⚠️ `sudo npm install` 쓰지 말 것 — 권한 문제 생김

## 2. 인증

```bash
# Anthropic Console 계정으로 로그인 (기본)
claude
# → 브라우저 OAuth 자동 실행

# Pro/Max 플랜이면 Claude App으로도 가능
```

## 3. 프로젝트 폴더에서 시작

```bash
cd ~/your-path/hhfinance
claude
```

Claude Code가 자동으로 `CLAUDE.md`를 읽고 프로젝트 컨텍스트를 로드합니다.

## 4. 커스텀 슬래시 커맨드 확인

```
/help
```

아래 커맨드들이 보이면 연동 성공:
- `/compile` — 컨트랙트 컴파일
- `/test` — 전체 테스트 실행
- `/test-group` — 그룹 수명주기 시나리오 테스트
- `/deploy-testnet` — BSC Testnet 배포
- `/audit` — 보안 점검 (Slither)
- `/vrf-setup` — VRF Subscription 가이드
- `/roles` — Role 설정 스크립트 실행
- `/stage` — 현재 개발 스테이지 확인

## 5. 첫 세션에서 할 것

```
> /stage
> 지금 STAGE 1 환경 세팅 해줘
> GroupRegistry.sol 작성해줘
> /compile
> /test
```

## 6. 유용한 Claude Code 단축키

| 키 | 기능 |
|----|------|
| `Ctrl+C` | 현재 작업 중단 |
| `Ctrl+R` | 히스토리 검색 |
| `/clear` | 컨텍스트 초기화 |
| `/status` | 현재 설정 확인 |
| `/init` | CLAUDE.md 자동 개선 |
| `Esc Esc` | 멀티라인 입력 |

## 7. 자주 쓰는 자연어 명령 패턴

```bash
# 컨트랙트 분석
> TreasuryV2.sol에서 보안 취약점 찾아줘

# 테스트 작성
> CollateralVault 단위 테스트 전부 작성해줘

# 배포
> BSC Testnet에 HHUSD 먼저 배포하고 주소 알려줘

# 에러 디버깅
> [에러 메시지 붙여넣기] 이거 왜 났어?

# 가스 최적화
> PublicGroupVRF.sol 가스 최적화해줘

# 코드 리뷰
> GroupContracts.sol 전체 리뷰해줘 — 재진입 공격 위주로
```
