#!/bin/bash

set -e
set -u

echo "*** current config.json on remote:"
ssh faucet@tau1.artis.network "cd ats-faucet && cat config.json"

echo "*** deploying new version (git pull && npm ci)..."
ssh faucet@tau1.artis.network "cd ats-faucet && git pull && npm ci"

echo "*** restarting systemd service..."
ssh root@tau1.artis.network "systemctl restart ats-faucet && sleep 3 && systemctl status ats-faucet"

echo "All done. cgroup related err msgs can be ignored as long as the process did start"
