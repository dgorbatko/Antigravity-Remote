#!/bin/bash
# Sync Let's Encrypt certificates from myserver for gorbatko.ddns.net
# This script pulls the latest certificate and restarts the server if changed.

CERT_DIR="/home/dgorbatko/antigravity_phone_chat/certs"
TEMP_CERT="/tmp/le_cert_sync_check.pem"

# Download current cert from myserver
ssh myserver "sudo cat /etc/letsencrypt/live/gorbatko.ddns.net/fullchain.pem" > "$TEMP_CERT" 2>/dev/null

if [ $? -ne 0 ]; then
    echo "$(date): Failed to fetch cert from myserver" >> /home/dgorbatko/antigravity_phone_chat/cert_sync.log
    rm -f "$TEMP_CERT"
    exit 1
fi

# Compare with current cert
if ! diff -q "$TEMP_CERT" "$CERT_DIR/server.cert" > /dev/null 2>&1; then
    echo "$(date): Certificate changed, updating..." >> /home/dgorbatko/antigravity_phone_chat/cert_sync.log
    
    ssh myserver "sudo cat /etc/letsencrypt/live/gorbatko.ddns.net/fullchain.pem" > "$CERT_DIR/server.cert"
    ssh myserver "sudo cat /etc/letsencrypt/live/gorbatko.ddns.net/privkey.pem" > "$CERT_DIR/server.key"
    chmod 600 "$CERT_DIR/server.key"
    
    sudo systemctl restart antigravity-phone-connect
    echo "$(date): Certificate updated and service restarted." >> /home/dgorbatko/antigravity_phone_chat/cert_sync.log
else
    echo "$(date): Certificate unchanged, skipping." >> /home/dgorbatko/antigravity_phone_chat/cert_sync.log
fi

rm -f "$TEMP_CERT"
