#!/usr/bin/env python3
"""Mattermost 읽기 전용(조회) MCP 서버 (프로토타입).

Hermes 소스도, Mattermost 소스도 건드리지 않는 별도 프로세스다. Mattermost의
공개 REST API 중 조회 계열만 여러 개의 작은 도구로 나눠 노출한다 — 검색어 하나로
뭉뚱그리는 대신, 어떤 조회가 필요한지는 Hermes(LLM)가 상황에 맞게 스스로
고르게 한다. 쓰기/관리 계열(채널 생성·삭제, 멤버 추방, 설정 변경 등)은 이
프로토타입 범위 밖이라 의도적으로 뺐다 — 아직 비밀정보 필터링/권한 브릿지
레이어가 없는 상태라 표면을 조회로만 좁혀둔다 (Hermes 공식 MCP 가이드의
"smallest useful surface" 원칙).

Hermes는 ~/.hermes/config.yaml의 mcp_servers 항목으로 이 프로세스를 띄워서
도구로 가져다 쓴다. 자세한 배경은 옆 폴더의 ../mattermost-db-search-검증.md
참고.

필요 환경변수 (이름을 Hermes 자신의 Mattermost 어댑터가 읽는 이름과 일부러
똑같이 맞췄다 — plugins/platforms/mattermost/adapter.py, gateway/config.py가
읽는 MATTERMOST_TOKEN/MATTERMOST_URL과 동일. 그래서 ~/.hermes/.env에 이미
있는 값을 config.yaml에서 ${MATTERMOST_TOKEN} 식으로 그대로 참조해 재사용할
수 있다 — 토큰을 두 곳에 따로 적을 필요가 없다. 자세한 건 README의
"Hermes에 등록" 참고):
  MATTERMOST_URL      예: https://team.example.com (끝에 / 없이)
  MATTERMOST_TOKEN     봇 계정의 Personal Access Token

선택 환경변수:
  MATTERMOST_TEAM_ID   기본 검색/조회 대상 팀 ID. 안 줘도 된다 — 비어 있으면
                       봇이 가입된 팀을 API로 자동 조회해서 쓴다(팀이 하나뿐일
                       때만 자동 성공, 여러 개면 도구 호출 시 에러 메시지로
                       list_my_teams를 먼저 부르라고 안내한다). 팀 가입 시점
                       전에는 어차피 알 수 없는 값이라 필수로 두지 않았다.

실행:
  uv pip install -r requirements.txt
  python mattermost_search_mcp.py
"""

from __future__ import annotations

import os
import sys

import requests
from mcp.server.fastmcp import FastMCP

MATTERMOST_URL = os.environ.get("MATTERMOST_URL", "").rstrip("/")
MATTERMOST_BOT_TOKEN = os.environ.get("MATTERMOST_TOKEN", "")
MATTERMOST_TEAM_ID = os.environ.get("MATTERMOST_TEAM_ID", "")

if not MATTERMOST_URL or not MATTERMOST_BOT_TOKEN:
    print(
        "[mattermost-search-mcp] MATTERMOST_URL / MATTERMOST_TOKEN 환경변수가 "
        "설정되지 않았습니다. config.yaml의 mcp_servers.<name>.env 아래에 넣어주세요.",
        file=sys.stderr,
    )

mcp = FastMCP("mattermost-search")


def _headers() -> dict:
    return {"Authorization": f"Bearer {MATTERMOST_BOT_TOKEN}"}


def _get(path: str, params: dict | None = None) -> dict:
    resp = requests.get(
        f"{MATTERMOST_URL}/api/v4/{path.lstrip('/')}",
        headers=_headers(),
        params=params or {},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()


def _post(path: str, json_body: dict) -> dict:
    resp = requests.post(
        f"{MATTERMOST_URL}/api/v4/{path.lstrip('/')}",
        headers=_headers(),
        json=json_body,
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()


_auto_team_id_cache: str | None = None


def _fetch_my_teams() -> list[dict]:
    return _get("users/me/teams")


def _resolve_team_id(team_id: str) -> str:
    global _auto_team_id_cache

    if team_id:
        return team_id
    if MATTERMOST_TEAM_ID:
        return MATTERMOST_TEAM_ID
    if _auto_team_id_cache:
        return _auto_team_id_cache

    teams = _fetch_my_teams()
    if len(teams) == 1:
        _auto_team_id_cache = teams[0]["id"]
        return _auto_team_id_cache
    if not teams:
        raise ValueError(
            "봇 계정이 가입된 팀이 하나도 없습니다. Mattermost에서 봇을 팀에 초대하세요."
        )
    names = ", ".join(f"{t.get('display_name')}({t.get('id')})" for t in teams)
    raise ValueError(
        f"봇이 팀 {len(teams)}개에 가입되어 있어 자동으로 하나를 고를 수 없습니다: "
        f"{names}. list_my_teams로 목록을 확인한 뒤 team_id를 직접 지정하세요."
    )


def _flatten_post(post_id: str, post: dict) -> dict:
    return {
        "post_id": post_id,
        "channel_id": post.get("channel_id"),
        "user_id": post.get("user_id"),
        "message": post.get("message"),
        "create_at": post.get("create_at"),
        "root_id": post.get("root_id") or None,
    }


@mcp.tool()
def list_my_teams() -> list[dict]:
    """봇 계정이 가입된 Mattermost 팀 목록(team_id 포함)을 조회한다.

    다른 도구들의 team_id 인자는 대부분 생략 가능하다 — 봇이 팀 하나에만
    가입돼 있으면 자동으로 그 팀을 쓴다. 하지만 봇이 팀 여러 개에 가입돼
    있으면 자동으로 고를 수 없다며 에러가 나는데, 그때 이 도구로 목록을 보고
    맞는 team_id를 골라서 다른 도구 호출 시 명시적으로 넣어주면 된다.
    """
    teams = _fetch_my_teams()
    return [
        {"team_id": t.get("id"), "name": t.get("name"), "display_name": t.get("display_name")}
        for t in teams
    ]


@mcp.tool()
def search_mattermost(
    query: str,
    from_user: str = "",
    in_channel: str = "",
    team_id: str = "",
    is_or_search: bool = False,
) -> list[dict]:
    """Mattermost 팀 대화(봇이 속한 채널 한정)에서 키워드로 메시지를 검색한다.

    query: 검색어. 빈 문자열로 두고 from_user/in_channel만으로 필터링해도 된다.
    from_user: 특정 사람이 쓴 메시지만 찾을 때, 그 사람의 Mattermost username
        (user_id가 아니다 — user_id만 있으면 get_user_by_id로 먼저 username을 알아낼 것).
    in_channel: 특정 채널로 범위를 좁힐 때, 그 채널의 채널명(channel name, 표시 이름이 아님).
    team_id: 생략 가능. MATTERMOST_TEAM_ID 환경변수가 있으면 그 값을, 없으면
        봇이 가입된 팀을 자동 조회해서 쓴다(팀이 여러 개면 에러가 나니
        list_my_teams로 먼저 확인할 것).
    is_or_search: True면 검색어들을 OR로, False(기본)면 AND로 묶는다.

    결과의 root_id가 채워져 있으면 그 post는 스레드 답글이다 — 검색은 답글도
    원글과 동일하게 찾아내지만, 매치된 개별 post 하나만 반환하고 스레드 전체를
    묶어서 주지는 않는다. 스레드 전체 맥락이 필요하면 get_thread를 이어서 호출할 것.

    "키워드 없이 특정 채널의 최근 대화를 시간순으로 보고 싶다" 같은 요청에는
    이 도구 대신 get_channel_recent_posts가 더 적합하다.

    주의: 이 API는 봇 계정이 멤버로 속한 채널만 검색한다. 팀 전체를 보려면
    봇을 필요한 채널에 초대해야 한다 (시스템 관리자 권한을 줘도 이 제약은 그대로다 —
    ../mattermost-db-search-검증.md 참고).
    """
    tid = _resolve_team_id(team_id)

    terms = query
    if from_user:
        terms = f"from:{from_user} {terms}".strip()
    if in_channel:
        terms = f"in:{in_channel} {terms}".strip()
    if not terms:
        raise ValueError("query, from_user, in_channel 중 최소 하나는 채워야 한다.")

    data = _post(f"teams/{tid}/posts/search", {"terms": terms, "is_or_search": is_or_search})
    posts = data.get("posts", {})
    order = data.get("order", [])
    return [_flatten_post(pid, posts.get(pid, {})) for pid in order]


@mcp.tool()
def get_channel_recent_posts(channel_id: str, page: int = 0, per_page: int = 30) -> list[dict]:
    """특정 채널의 메시지를 키워드 없이 최신순으로 가져온다.

    channel_id: 대상 채널 ID (channel명이 아니라 ID. 모르면 list_channels_for_team로 먼저 찾을 것).
    page: 0부터 시작하는 페이지 번호. 더 과거로 가려면 1, 2, ... 늘려서 다시 호출.
    per_page: 한 번에 가져올 개수 (기본 30, 최대 200).

    "지난주에 무슨 얘기 오갔는지 쭉 훑어봐줘"처럼 검색어가 없는 요청에 적합하다.
    검색어가 있는 요청에는 search_mattermost를 쓸 것.
    """
    data = _get(f"channels/{channel_id}/posts", params={"page": page, "per_page": per_page})
    posts = data.get("posts", {})
    order = data.get("order", [])
    return [_flatten_post(pid, posts.get(pid, {})) for pid in order]


@mcp.tool()
def get_thread(post_id: str) -> list[dict]:
    """특정 post가 속한 스레드 전체(원글 + 모든 답글)를 시간순으로 가져온다.

    post_id: 스레드 안의 아무 post ID나 상관없다 (원글이든 답글이든). search_mattermost
        결과의 post_id, 또는 답글이었다면 그 root_id를 넣으면 된다.

    search_mattermost가 매치된 답글 하나만 돌려줬을 때, 그 앞뒤 맥락(원글이 뭐였는지,
    다른 사람이 뭐라고 답했는지)까지 보려면 이 도구를 이어서 호출한다.
    """
    data = _get(f"posts/{post_id}/thread")
    posts = data.get("posts", {})
    order = data.get("order", [])
    # order는 최신순이라 시간순으로 뒤집어서 반환 (원글 -> 답글 순으로 읽기 쉽게)
    return [_flatten_post(pid, posts.get(pid, {})) for pid in reversed(order)]


@mcp.tool()
def get_user_by_username(username: str) -> dict:
    """Mattermost username으로 사용자 정보(user_id 포함)를 조회한다.

    from_user 인자에 쓸 정확한 username 철자를 확인하고 싶거나, 반대로
    username -> user_id 변환이 필요할 때 쓴다.
    """
    user = _get(f"users/username/{username}")
    return {
        "user_id": user.get("id"),
        "username": user.get("username"),
        "nickname": user.get("nickname"),
        "email": user.get("email"),
    }


@mcp.tool()
def get_user_by_id(user_id: str) -> dict:
    """user_id로 사용자 정보(username 포함)를 조회한다.

    search_mattermost 결과의 user_id를 사람이 읽을 수 있는 이름으로 바꾸거나,
    user_id만 있고 username을 몰라서 from_user에 뭘 넣을지 모를 때 먼저 호출한다.
    """
    user = _get(f"users/{user_id}")
    return {
        "user_id": user.get("id"),
        "username": user.get("username"),
        "nickname": user.get("nickname"),
        "email": user.get("email"),
    }


@mcp.tool()
def list_channels_for_team(team_id: str = "") -> list[dict]:
    """봇 계정이 멤버로 속한 채널 목록을 가져온다 (팀 전체 채널이 아니라 봇이 접근 가능한 것만).

    team_id: 생략 가능. MATTERMOST_TEAM_ID 환경변수가 있으면 그 값을, 없으면
        봇이 가입된 팀을 자동 조회해서 쓴다(팀이 여러 개면 에러가 나니
        list_my_teams로 먼저 확인할 것).

    "어느 채널에서 찾아야 할지 모르겠다"거나, in_channel/channel_id 인자에 뭘
    넣을지 확인하고 싶을 때 가장 먼저 호출하기 좋은 도구다. 이 목록에 없는
    채널은 search_mattermost/get_channel_recent_posts로도 조회가 안 된다
    (봇이 그 채널의 멤버가 아니기 때문 — 시스템 관리자 권한과 무관).
    """
    tid = _resolve_team_id(team_id)
    channels = _get(f"users/me/teams/{tid}/channels")
    return [
        {
            "channel_id": c.get("id"),
            "name": c.get("name"),
            "display_name": c.get("display_name"),
            "type": c.get("type"),  # "O"=public, "P"=private, "D"=DM, "G"=group DM
        }
        for c in channels
    ]


if __name__ == "__main__":
    mcp.run()
