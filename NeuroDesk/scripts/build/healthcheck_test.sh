#!/bin/bash
# Regression test for scripts/build/healthcheck.sh, the image's HEALTHCHECK
# command.
#
# The bug this guards (issue #10987): the Dockerfile hardcoded
# http://localhost:8080/readyz, but the same image also runs `neurodesk worker`,
# which serves HTTP on the gRPC base port minus one (50050 by default) and never
# binds 8080. Every worker container was therefore permanently `unhealthy`,
# which made the health signal useless — a genuinely broken worker looked
# exactly like a working one.
#
# The same hardcoding also broke any frontend moved off port 8080 with
# NEURODESK_ADDRESS, which is why the derivation is tested for both modes.
#
# The script probes no network here: curl is stubbed with a script that records
# the URL it was asked for, so these assertions are about URL derivation and
# exit status only. Needs only bash.
set -euo pipefail

CURDIR=$(dirname "$(realpath "$0")")
SCRIPT="$CURDIR/healthcheck.sh"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# Stub curl: record the last URL argument, succeed or fail per STUB_CURL_EXIT.
mkdir -p "$WORK/bin"
cat > "$WORK/bin/curl" <<'EOF'
#!/bin/bash
for arg in "$@"; do
    case "$arg" in
        http*) echo "$arg" > "$CURL_URL_FILE" ;;
    esac
done
exit "${STUB_CURL_EXIT:-0}"
EOF
chmod +x "$WORK/bin/curl"

export CURL_URL_FILE="$WORK/url"
PATH="$WORK/bin:$PATH"
export PATH

FAILED=0

# run_hc <expected-exit> <argv-of-neurodesk> [env assignments...]
run_hc() {
    local want_exit="$1"; shift
    local argv="$1"; shift
    : > "$CURL_URL_FILE"
    local got_exit=0
    env "$@" NEURODESK_HEALTHCHECK_ARGV="$argv" bash "$SCRIPT" >/dev/null 2>&1 || got_exit=$?
    if [ "$got_exit" != "$want_exit" ]; then
        echo "FAIL: argv='$argv' env='$*' expected exit $want_exit, got $got_exit"
        FAILED=1
    fi
}

expect_url() {
    local want="$1"
    local got
    got=$(cat "$CURL_URL_FILE" 2>/dev/null || true)
    if [ "$got" != "$want" ]; then
        echo "FAIL: expected probe of '$want', got '$got'"
        FAILED=1
    fi
}

echo "== frontend defaults to 8080"
run_hc 0 "neurodesk run"
expect_url "http://localhost:8080/readyz"

echo "== frontend with no subcommand still probes the API port"
# `run` is the kong default command, so a bare `neurodesk` is a frontend too.
run_hc 0 "neurodesk"
expect_url "http://localhost:8080/readyz"

echo "== a bare model list is the frontend, not an unknown mode"
# `run` is declared default:"withargs", so `neurodesk gemma-4 whisper` is the
# frontend with two model arguments. Classifying "gemma-4" as an unknown mode
# would silently stop probing the most common invocation in the docs.
run_hc 0 "neurodesk gemma-4 whisper-1"
expect_url "http://localhost:8080/readyz"

echo "== leading flags do not hide the mode"
run_hc 0 "neurodesk --debug worker"
expect_url "http://localhost:50050/readyz"

echo "== frontend honours NEURODESK_ADDRESS"
run_hc 0 "neurodesk run" NEURODESK_ADDRESS=":9090"
expect_url "http://localhost:9090/readyz"

echo "== frontend honours the legacy ADDRESS alias"
run_hc 0 "neurodesk run" ADDRESS="0.0.0.0:7070"
expect_url "http://localhost:7070/readyz"

echo "== worker defaults to the file-transfer port (base 50051 - 1)"
run_hc 0 "neurodesk worker"
expect_url "http://localhost:50050/readyz"

echo "== worker derives the port from NEURODESK_SERVE_ADDR"
run_hc 0 "neurodesk worker" NEURODESK_SERVE_ADDR="0.0.0.0:60000"
expect_url "http://localhost:59999/readyz"

echo "== worker honours an explicit NEURODESK_HTTP_ADDR"
run_hc 0 "neurodesk worker" NEURODESK_HTTP_ADDR="0.0.0.0:18080"
expect_url "http://localhost:18080/readyz"

echo "== an explicit HEALTHCHECK_ENDPOINT overrides derivation"
# docker-compose.distributed.yaml has shipped this override as the workaround,
# so it must keep winning.
run_hc 0 "neurodesk worker" HEALTHCHECK_ENDPOINT="http://localhost:50050/readyz"
expect_url "http://localhost:50050/readyz"

echo "== a failing probe propagates a non-zero exit"
run_hc 1 "neurodesk run" STUB_CURL_EXIT=1

echo "== a 503 from a still-preloading frontend is unhealthy, not a crash"
# curl -f exits 22 on 503; the healthcheck must report failure (Docker only
# distinguishes 0 from non-zero) rather than masking it.
run_hc 1 "neurodesk run" STUB_CURL_EXIT=22

echo "== modes with no HTTP surface report healthy rather than false-unhealthy"
# agent-worker is NATS-only. Reporting `unhealthy` forever for a process that
# was never going to bind a port is the same bug as #10987, one mode over.
run_hc 0 "neurodesk agent-worker"
expect_url ""

echo "== an argv with no neurodesk in it falls back to the frontend endpoint"
# e.g. `init: true` puts docker-init at PID 1. Guessing the frontend is the
# safer default than skipping the probe entirely.
run_hc 0 "/sbin/docker-init"
expect_url "http://localhost:8080/readyz"

echo "== detects the mode from /proc when no argv override is given"
# The path that actually runs in the image. NEURODESK_HEALTHCHECK_ARGV is unset
# here, so this exercises detect_argv against a fixture /proc tree.
make_proc() {
    local root="$1"; shift
    rm -rf "$root"; mkdir -p "$root"
    while [ $# -gt 0 ]; do
        mkdir -p "$root/$1"
        printf '%s' "$2" | tr ' ' '\0' > "$root/$1/cmdline"
        shift 2
    done
}

probe_proc() {
    local root="$1"; shift
    : > "$CURL_URL_FILE"
    env "$@" NEURODESK_HEALTHCHECK_PROC="$root" bash "$SCRIPT" >/dev/null 2>&1 || true
}

# The normal container shape: neurodesk exec'd by entrypoint.sh, so it is PID 1.
make_proc "$WORK/proc-worker" 1 "./neurodesk worker"
probe_proc "$WORK/proc-worker" NEURODESK_SERVE_ADDR="0.0.0.0:50051"
expect_url "http://localhost:50050/readyz"

make_proc "$WORK/proc-frontend" 1 "./neurodesk run"
probe_proc "$WORK/proc-frontend"
expect_url "http://localhost:8080/readyz"

# `init: true`: docker-init holds PID 1, so the scan has to find neurodesk
# further down, and must prefer the lowest PID deterministically.
make_proc "$WORK/proc-init" \
    1 "/sbin/docker-init --" \
    7 "./neurodesk worker" \
    64 "./neurodesk run"
probe_proc "$WORK/proc-init" NEURODESK_SERVE_ADDR="0.0.0.0:50051"
expect_url "http://localhost:50050/readyz"

if [ "$FAILED" != 0 ]; then
    echo "FAILED"
    exit 1
fi
echo "OK"
