#!/usr/bin/env bash
# Source this file to prefer downloaded project-local SDKs over older system tools.
HOCKEY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -x "$HOCKEY_ROOT/.tools/dotnet/dotnet" ]; then
  export DOTNET_ROOT="$HOCKEY_ROOT/.tools/dotnet"
  export PATH="$DOTNET_ROOT:$PATH"
fi

if [ -x "$HOCKEY_ROOT/.tools/node/bin/node" ]; then
  export PATH="$HOCKEY_ROOT/.tools/node/bin:$PATH"
fi

export DOTNET_CLI_TELEMETRY_OPTOUT=1
export DOTNET_NOLOGO=1
