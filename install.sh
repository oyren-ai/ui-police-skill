#!/usr/bin/env bash
set -euo pipefail

main() {
  local source_dir=${UI_POLICE_SOURCE_DIR:-}
  if [[ -z $source_dir && -f ${BASH_SOURCE[0]:-} ]]; then
    local candidate
    candidate=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
    if [[ -f $candidate/skills/ui-police/SKILL.md ]]; then source_dir=$candidate; fi
  fi

  local skill_data
  if [[ -n $source_dir ]]; then
    local skill=$source_dir/skills/ui-police/SKILL.md
    [[ -f $skill && ! -L $skill ]] || { echo 'ui-police: skill source is missing or unsafe' >&2; return 2; }
    skill_data=$(cat -- "$skill")
  else
    skill_data=$(curl -fsSL https://raw.githubusercontent.com/oyren-ai/ui-police-skill/main/skills/ui-police/SKILL.md)
  fi
  [[ $skill_data == *$'\nname: ui-police\n'* ]] || { echo 'ui-police: skill source has the wrong name' >&2; return 2; }
  [[ ${HOME:-} = /* && -d ${HOME:-} ]] || { echo 'ui-police: HOME must be an existing absolute directory' >&2; return 2; }

  install_skill() {
    local base=$1 name=$2
    local target=$base/ui-police temp cur=$base
    while [[ $cur != "$HOME" && $cur != / ]]; do
      [[ ! -L $cur ]] || { echo "ui-police: refusing symlink at $cur" >&2; return 2; }
      cur=$(dirname "$cur")
    done
    [[ $cur == "$HOME" && ! -L $target && ! -L $target/SKILL.md ]] || { echo "ui-police: refusing unsafe path at $target" >&2; return 2; }
    mkdir -p -- "$target"
    [[ -d $target && ! -L $target ]] || { echo "ui-police: unsafe skill directory $target" >&2; return 2; }
    temp=$(mktemp "$target/.SKILL.md.XXXXXX")
    printf '%s\n' "$skill_data" > "$temp"
    chmod 0644 "$temp"
    if [[ -f $target/SKILL.md ]] && cmp -s -- "$temp" "$target/SKILL.md"; then
      rm -- "$temp"
      echo "$name: up to date"
      return
    fi
    mv -f -- "$temp" "$target/SKILL.md"
    echo "$name: installed $target/SKILL.md"
  }

  local count=0
  if [[ ${UI_POLICE_INSTALL_ALL:-} = 1 ]] || command -v claude >/dev/null 2>&1; then
    install_skill "$HOME/.claude/skills" 'Claude Code'; count=$((count+1))
  fi
  if [[ ${UI_POLICE_INSTALL_ALL:-} = 1 ]] || command -v codex >/dev/null 2>&1; then
    install_skill "$HOME/.codex/skills" 'Codex'; count=$((count+1))
  fi
  if [[ ${UI_POLICE_INSTALL_ALL:-} = 1 ]] || command -v agy >/dev/null 2>&1; then
    install_skill "$HOME/.gemini/config/skills" 'Antigravity'; count=$((count+1))
  fi
  if [[ $count -eq 0 ]]; then echo 'ui-police: no supported CLI found'; fi
}

main "$@"
