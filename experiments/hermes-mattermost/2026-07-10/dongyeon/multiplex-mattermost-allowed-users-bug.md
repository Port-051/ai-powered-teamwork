# Hermes 멀티플렉싱(multiplex_profiles) 모드에서 Mattermost `MATTERMOST_ALLOWED_USERS`가 profile별로 적용되지 않는 버그

**결론: 버그 맞음.** 멀티플렉싱(게이트웨이 하나로 모든 profile 서빙) 모드에서는 secondary
profile의 `.env`에 적어둔 `MATTERMOST_ALLOWED_USERS`(및 다른 gateway-측 env 인증 변수)가
사용자 인증 체크에 **전혀 반영되지 않는다**. 이 인증 체크는 항상 프로세스 전역 `os.environ`
= **default profile의 `.env` 값 하나**만 본다.

로컬 Hermes 소스(`~/.hermes/hermes-agent`) 직접 추적으로 확인. 아래 파일:라인 인용은 모두
그 로컬 체크아웃 기준.

---

## 1. 증상 (실제 관측)

- second profile `.env`에 특정 계정만 허용하도록 `MATTERMOST_ALLOWED_USERS=<내 User ID>`
  설정 → 메인만 동작하고 secondory는 동작하지 않음.
- 게이트웨이 로그:
  ```
  WARNING gateway.run: Unauthorized user: jem1fmmaopb6ipr57hp54o6hor (rlaehddus302) on mattermost
  ```
  → **허용하려던 바로 그 계정**이 오히려 "Unauthorized"로 거부됨.

## 2. 근본 원인 — 코드 경로 추적

### (a) 시작 시 default profile의 `.env`만 전역 `os.environ`에 로드됨

`gateway/run.py:1279` — 게이트웨이 프로세스 시작 시 딱 한 번:

```python
load_hermes_dotenv(hermes_home=_hermes_home, project_env=...)   # _hermes_home = default(~/.hermes)
```

secondary profile(`second`)의 `.env`는 이 전역 환경에 **절대 실리지 않는다.**

### (b) 멀티플렉싱은 secondary profile 시크릿을 일부러 격리된 스코프에만 넣는다 (전역 오염 방지)

멀티플렉싱은 profile A의 키가 profile B로 새는 걸 막으려고, profile별 `.env`를
`os.environ`에 합치지 않고 contextvar 기반 "secret scope"에만 넣도록 설계돼 있다
(`agent/secret_scope.py`). 실제로 per-turn 재로드도 멀티플렉싱이면 전역 env를 안 건드린다:

`gateway/run.py:1290-1302` (`_reload_runtime_env_preserving_config_authority`):
```python
if is_multiplex_active():
    # Credentials are resolved from the active profile's secret scope, not os.environ.
    ... return   # .env를 전역 env로 reload하지 않음
```

profile 시크릿을 실제로 주입하는 `_profile_runtime_scope`도 `set_secret_scope`(격리 dict)와
`set_hermes_home_override`만 하고 **`os.environ`은 건드리지 않는다** (`gateway/run.py:1379-1409`,
docstring이 "Loading the profile's .env here does NOT mutate os.environ"라고 명시).

### (c) 그런데 사용자 인증 체크는 그 스코프를 안 읽고 전역 `os.getenv`를 직접 읽는다 ← 버그 지점

`_is_user_authorized()` (`gateway/authz_mixin.py`)는 허용목록을 전부 전역 env에서 읽는다:

- `gateway/authz_mixin.py:359` — 플랫폼→env 매핑: `Platform.MATTERMOST: "MATTERMOST_ALLOWED_USERS"`
- `gateway/authz_mixin.py:440`:
  ```python
  platform_allowlist = os.getenv(platform_env_map.get(source.platform, ""), "").strip()
  ```
- `:446` `os.getenv("GATEWAY_ALLOWED_USERS", ...)`, `:495` `os.getenv("GATEWAY_ALLOW_ALL_USERS", ...)`

`authz_mixin.py`에는 `agent.secret_scope.get_secret` import도, secret scope 참조도 **전혀 없다**
(grep 0건). 즉 secret scope로 마이그레이션되지 않은 채 옛 방식(`os.getenv`)에 머물러 있다.

### (d) 게다가 인증은 profile 스코프가 활성화되기 *전에* 실행된다

멀티플렉싱 인바운드 경로:

1. secondary profile 어댑터는 자기 메시지 핸들러로 `_make_profile_message_handler(profile_name)`를
   받는다 (`gateway/run.py:8404-8406`). 이 핸들러는 `event.source.profile`만 스탬핑하고
   곧바로 `_handle_message(event)`를 호출한다 (`:8429-8438`). **`_profile_runtime_scope`로
   감싸지 않는다.**
2. `_handle_message` 안에서 인증 실패 시 바로 그 로그가 찍힌다
   (`gateway/run.py:8753-8754`):
   ```python
   elif not self._is_user_authorized(source):
       logger.warning("Unauthorized user: %s (%s) on %s", ...)   # ← 관측된 그 로그
   ```
3. profile 스코프(`_profile_runtime_scope` = secret scope + home override)는 인증을 **통과한 뒤**
   `_run_agent`에서야 진입한다 (`gateway/run.py:16465-16466`).

따라서 `_is_user_authorized`가 실행되는 시점엔 secret scope조차 활성화돼 있지 않고, 설령
활성화돼 있어도 이 함수는 그걸 안 읽는다. 결국 **오직 default `.env`가 로드된 전역
`os.environ` 값만** 본다.

### (e) Mattermost 어댑터 자체는 사용자 인증을 안 한다 (그래서 우회 여지도 없음)

Mattermost 어댑터(`plugins/platforms/mattermost/adapter.py`)는 채널 화이트리스트/멘션 게이팅만
`os.getenv`로 하고(`:816-847`), 사용자 허용목록 판단은 전적으로 게이트웨이 `_is_user_authorized`에
맡긴다. 또 어댑터가 `enforces_own_access_policy` / `authorization_is_upstream`를 설정하지 않는다
(grep 0건) → `authz_mixin.py:472,495`의 "어댑터 자체 정책" 우회 경로도 타지 않고 기본
거부(default-deny)로 떨어진다.

## 3. 그래서 실제로 무슨 일이 벌어지나 (경우별)

멀티플렉싱 ON일 때, **모든** profile의 Mattermost 봇에 대해 `os.getenv("MATTERMOST_ALLOWED_USERS")`
= **default profile `.env`의 값** 하나가 공통 적용된다:

- **default `.env`에 `MATTERMOST_ALLOWED_USERS`가 비어있음** → 허용목록 없음 → 기본 거부.
  `GATEWAY_ALLOW_ALL_USERS=true`가 아니면 **모든 사용자가 "Unauthorized"로 거부**됨.
  → 관측된 증상과 정확히 일치 (second `.env`에만 내 ID를 넣었고 default엔 없었기 때문에,
  내 계정이 거부됨).
- **default `.env`에 `MATTERMOST_ALLOWED_USERS`가 설정돼 있음** → 그 목록이 second 봇을 포함한
  모든 봇에 똑같이 적용됨. second `.env`에 뭘 적든 무시됨.

즉 secondary profile의 `MATTERMOST_ALLOWED_USERS`는 어떤 경우에도 참조되지 않는다.

("restart 전엔 됐다"는 관측은, 그 전에 second가 멀티플렉싱이 아니라 자기 독립 프로세스로
떠서 자기 `.env`가 그 프로세스의 `os.environ`에 실려 정상 동작했을 가능성이 높다. 멀티플렉싱
+ restart로 전환되면서 (a)~(d) 경로를 타게 되어 깨진 것.)

## 4. 영향 범위

- gateway-측 env 인증을 쓰는 다른 플랫폼도 동일 구조로 영향 가능:
  `SLACK_ALLOWED_USERS`, `TELEGRAM_ALLOWED_USERS`, `DISCORD_ALLOWED_USERS` 등
  (`authz_mixin.py:351-368`) — 모두 `os.getenv`로 읽으므로 멀티플렉싱 시 default 값만 적용됨.
- Provider API 키 등 "진짜 시크릿"은 secret scope로 올바르게 격리되어 profile별로 정상 동작한다.
  **인증(authorization) 체크만 예외적으로 마이그레이션이 안 된 상태**로 보인다.
  (`secret_scope.py` docstring이 경고하는 "un-migrated call site"에 해당하되, `get_secret`을
  아예 안 쓰기 때문에 fail-closed로 터지지도 않고 조용히 default 값을 읽는 더 나쁜 형태.)

## 5. 해결책

### 권장: 인증이 필요한 profile은 멀티플렉싱에서 빼고 독립 프로세스로 (방법 A)

```bash
# default profile에서 멀티플렉싱 끄기
hermes config set gateway.multiplex_profiles false
hermes gateway restart

# 각 profile을 독립 프로세스로 (WSL이면 start(systemd) 말고 run)
tmux new -s default 'hermes gateway run'
tmux new -s second  'second gateway run'
```

독립 프로세스는 자기 `.env`가 그 프로세스의 `os.environ`에 그대로 실리므로
`MATTERMOST_ALLOWED_USERS`가 정상 적용된다. 팀 규모(3명)에선 프로세스 3개 정도 자원 부담은 작다.

### 우회(멀티플렉싱 유지해야 할 때)

- **차선**: 팀 전체가 공유해도 되는 허용목록이라면 default `.env`의 `MATTERMOST_ALLOWED_USERS`에
  모든 팀원 ID를 넣는다(단, 그러면 모든 봇이 동일 목록을 쓰므로 profile별 차등 제한은 불가).
- **채널 분리**: profile별 봇을 각자 전용 채널에만 초대하고 `MATTERMOST_ALLOWED_CHANNELS`로
  채널을 제한. 단 `ALLOWED_CHANNELS`도 `os.getenv`로 읽히므로(`adapter.py:818`, 그리고
  `_apply_yaml_config`가 `if not os.getenv`로 전역에 한 번만 세팅 —
  `adapter.py:1198-1209`) 멀티플렉싱에선 첫 profile 값이 전역을 선점할 수 있어 신뢰도가 낮다.
  검증 필요.

### 상류 수정 방향(참고)

`authz_mixin._is_user_authorized`가 허용목록을 `os.getenv` 대신
`agent.secret_scope.get_secret`로 읽고, 인증 호출을 `source.profile` 스코프 안에서 수행하도록
바꾸면 근본 해결. 우리 코드가 아니라 Hermes 상류 이슈이므로, 여기서는 위 운영 우회로 대응.

---

## 관련 파일:라인 (재확인용)

| 위치 | 내용 |
|---|---|
| `gateway/run.py:1279` | 시작 시 default `.env`만 전역 env 로드 |
| `gateway/run.py:1290-1302` | 멀티플렉싱이면 per-turn `.env`를 전역 env로 reload 안 함 |
| `gateway/run.py:1379-1409` | `_profile_runtime_scope`: secret scope+home만, os.environ 안 건드림 |
| `gateway/run.py:8404-8438` | profile 메시지 핸들러: profile 스탬핑 후 스코프 없이 `_handle_message` |
| `gateway/run.py:8753-8754` | `_handle_message`의 인증 실패 → "Unauthorized user" 로그 |
| `gateway/run.py:16465-16466` | 인증 통과 *후* `_run_agent`에서야 profile 스코프 진입 |
| `gateway/authz_mixin.py:359,440,446,495` | 허용목록을 `os.getenv`로 직접 읽음 (secret scope 미참조) |
| `agent/secret_scope.py` | profile 시크릿을 contextvar로 격리, os.environ 불변 |
| `plugins/platforms/mattermost/adapter.py` | 사용자 인증 안 함(멘션/채널 게이팅만), 인증은 게이트웨이 위임 |

원본(교차 참조): `experiments/hermes-mattermost/2026-07-10/dongyeon/mattermost-multi-user-mention-setup.md`
— 방법 A/B 및 Mattermost 멘션 필터링 동작 정리. 이 문서는 그중 "방법 B(멀티플렉싱) + profile별
사용자 제한"이 실제로는 깨진다는 점을 코드로 확인해 보완한다.

---

## 6. 재확인 (2026-07-10, `sandbox` 프로파일 + 2계정)

위 1~5절은 `second` 프로파일 + 단일 계정 관측이라, 증상이 "허용하려던 계정이 오히려 거부됨"
(3절 첫 번째 case) 한 방향만 실측돼 있었다. 이번에 **서로 다른 계정을 default와 sandbox에 각각
하나씩** 넣고 재현하여, 3절이 추론으로만 적어둔 **두 번째 case(default에 값이 설정된 경우)까지
로그로 확증**했다. 결론·원인은 1~5절과 동일하며 새로 틀린 점은 없다.

**설정 (양쪽 profile에 서로 다른 1계정씩):**

| profile | `MATTERMOST_ALLOWED_USERS` | 계정 |
|---|---|---|
| default `.env` | `jem1fmmaopb6ipr57hp54o6hor` | rlaehddus302 |
| sandbox `.env` | `9kyiq9woo3yojda7hz9xagdppc` | test2 |

멀티플렉서 하나가 두 봇을 동시 서빙(봇 토큰은 분리되어 충돌 없음), `gateway.log`:
```
✓ mattermost connected                          ← default 봇 @rlaehddus302bot
Mattermost: authenticated as @testbot           ← sandbox 봇 (다른 계정)
✓ mattermost connected (profile: sandbox)
```

**증상 ① — sandbox의 허용 계정(test2)이 오히려 거부됨 (로그로 확증):**
```
16:30:32 WARNING gateway.run: Unauthorized user: 9kyiq9woo3yojda7hz9xagdppc (test2) on mattermost
```
test2를 sandbox `.env`에 허용으로 넣었지만, authz는 default 목록 `[rlaehddus302]`로만 판정 →
test2가 없어 거부. **secondary profile의 허용목록이 무시된다**는 결론을 실측 재확인.

**증상 ② — default의 허용 계정(rlaehddus302)이 sandbox 봇에도 통과 (기존엔 추론, 이번에 실증):**
default 목록 `[rlaehddus302]`가 sandbox 봇에도 그대로 적용되므로, rlaehddus302는
`@testbot`(sandbox 봇)에도 통과한다. 즉 profile별 차등 제한이 붕괴하여 실제 동작은
**"default에 넣은 사람 = 모든 봇 통과 / 그 외 = 모든 봇 거부"**. 3절 case (b)를 2계정 실측으로 확인.

**결론:** 프로파일별 사용자 제한이 필요하면 멀티플렉싱을 쓰면 안 된다(5절 권장: 독립 프로세스
= 방법 A). 이번 재확인은 그 근거를 양방향 로그로 보강한다.
