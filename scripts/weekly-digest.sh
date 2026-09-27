#!/bin/bash
# One command for the weekly Reddit digest, so the scheduled task has a single
# permission surface. The task used to run `cd … && set -a; . env; set +a; node …`
# which matched no allow rule, so every run blocked on a prompt nobody was there
# to answer and sat "running" for hours.
#
# Exit codes: 0 = digest written, 2 = Reddit blocked us and any earlier good
# digest was preserved.
set -u
cd "$(dirname "$0")/.."
if [ -f "$HOME/.claude/apollo-stats.env" ]; then
  set -a; . "$HOME/.claude/apollo-stats.env"; set +a
fi
exec node scripts/community-digest.mjs "$@"
