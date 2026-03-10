#!/bin/bash
# Antigravity Remote — Setup Wizard
# Interactive installer using whiptail for GUI dialogs
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/config.json"
SERVICE_NAME="antigravity-remote"

# Colors for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_err()   { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if whiptail is available, fall back to dialog
if command -v whiptail &>/dev/null; then
    DLG="whiptail"
elif command -v dialog &>/dev/null; then
    DLG="dialog"
else
    log_err "Neither whiptail nor dialog is installed."
    log_info "Installing whiptail..."
    if command -v apt-get &>/dev/null; then
        sudo apt-get install -y whiptail
        DLG="whiptail"
    elif command -v dnf &>/dev/null; then
        sudo dnf install -y newt
        DLG="whiptail"
    elif command -v pacman &>/dev/null; then
        sudo pacman -S --noconfirm libnewt
        DLG="whiptail"
    else
        log_err "Cannot install whiptail. Please install it manually."
        exit 1
    fi
fi

# ═══════════════════════════════════════════════════════════
# Step 0: Welcome Screen
# ═══════════════════════════════════════════════════════════
$DLG --title "Antigravity Remote — Setup Wizard" --msgbox "\
Welcome to the Antigravity Remote setup wizard!

This installer will configure:

  1. 📁 Projects directory — where your coding projects live
  2. 🌐 DDNS domain — for remote access from anywhere
  3. 🔒 Let's Encrypt SSL — free trusted HTTPS certificate
  4. 📦 Dependencies — Node.js, certbot, etc.
  5. ⚙️  System service — auto-start on boot
  6. 🔑 Access password — for remote authentication

Press OK to begin." 20 60

# ═══════════════════════════════════════════════════════════
# Step 1: Projects Directory
# ═══════════════════════════════════════════════════════════
DEFAULT_PROJECTS="$HOME/Projects"
PROJECTS_DIR=$($DLG --title "Step 1/7: Projects Directory" \
    --inputbox "\
Enter the path to the directory containing all your coding projects.

Each subdirectory will appear in the Antigravity Remote project picker.

Example: /home/$USER/Projects" \
    14 60 "$DEFAULT_PROJECTS" 3>&1 1>&2 2>&3) || exit 1

# Validate path
if [ ! -d "$PROJECTS_DIR" ]; then
    if $DLG --title "Directory Not Found" --yesno \
        "The directory '$PROJECTS_DIR' does not exist.\n\nCreate it now?" 10 60; then
        mkdir -p "$PROJECTS_DIR"
        log_ok "Created $PROJECTS_DIR"
    else
        log_err "Projects directory is required. Aborting."
        exit 1
    fi
fi

# ═══════════════════════════════════════════════════════════
# Step 2: DDNS Provider Recommendation
# ═══════════════════════════════════════════════════════════
$DLG --title "Step 2/7: DDNS Setup — Info" --msgbox "\
To access Antigravity Remote from outside your local network,
you need a Dynamic DNS (DDNS) hostname.

Recommended FREE DDNS providers:

  🦆 Duck DNS        — https://duckdns.org
     Simple, free, works great with Let's Encrypt.
     Just sign in with GitHub/Google, create a subdomain.

  🌐 No-IP           — https://noip.com
     Popular, free tier (requires renewal every 30 days).

  🔄 Dynu            — https://dynu.com
     Free, supports many DNS record types.

  💡 Afraid.org       — https://freedns.afraid.org
     Massive selection of free domain suffixes.

Sign up with any provider, create a hostname, and configure
your router or a DDNS update client to keep it current.

Press OK when you have your DDNS hostname ready." 26 65

# ═══════════════════════════════════════════════════════════
# Step 3: DDNS Domain Input
# ═══════════════════════════════════════════════════════════
DDNS_DOMAIN=$($DLG --title "Step 3/7: DDNS Domain" \
    --inputbox "\
Enter your DDNS hostname (e.g. mypc.duckdns.org).

If you want to skip DDNS and use only local network,
leave this empty and press OK." \
    12 60 "" 3>&1 1>&2 2>&3) || exit 1

USE_LETSENCRYPT=false
CERT_PATH=""
KEY_PATH=""

# ═══════════════════════════════════════════════════════════
# Step 4: Let's Encrypt Email (only if DDNS configured)
# ═══════════════════════════════════════════════════════════
LE_EMAIL=""
if [ -n "$DDNS_DOMAIN" ]; then
    LE_EMAIL=$($DLG --title "Step 4/7: Let's Encrypt SSL" \
        --inputbox "\
Enter your email for Let's Encrypt certificate registration.

This is used for certificate expiry notifications only.
Let's Encrypt provides free, trusted HTTPS certificates.

Your domain: $DDNS_DOMAIN" \
        14 60 "" 3>&1 1>&2 2>&3) || exit 1

    if [ -n "$LE_EMAIL" ]; then
        USE_LETSENCRYPT=true
    fi
fi

# ═══════════════════════════════════════════════════════════
# Step 5: Server Port
# ═══════════════════════════════════════════════════════════
SERVER_PORT=$($DLG --title "Step 5/7: Server Port" \
    --inputbox "\
Enter the port for Antigravity Remote.

Default: 443 (standard HTTPS) if using Let's Encrypt
Default: 3000 if using local network only

Ports below 1024 require root or a reverse proxy." \
    14 60 "$([ "$USE_LETSENCRYPT" = true ] && echo '443' || echo '3000')" \
    3>&1 1>&2 2>&3) || exit 1

# ═══════════════════════════════════════════════════════════
# Step 6: Access Password
# ═══════════════════════════════════════════════════════════
APP_PASSWORD=$($DLG --title "Step 6/7: Access Password" \
    --passwordbox "\
Set a password for remote access to Antigravity Remote.

This protects your AI sessions from unauthorized access.
Local network devices will NOT need this password.

Minimum 6 characters recommended." \
    14 60 3>&1 1>&2 2>&3) || exit 1

if [ -z "$APP_PASSWORD" ]; then
    APP_PASSWORD="antigravity"
    log_warn "No password set, using default: antigravity"
fi

# ═══════════════════════════════════════════════════════════
# Step 7: Install Dependencies
# ═══════════════════════════════════════════════════════════
$DLG --title "Step 7/7: Install Dependencies" --msgbox "\
The installer will now:

  1. ✅ Install Node.js (if not present)
  2. ✅ Install npm packages
  3. $([ "$USE_LETSENCRYPT" = true ] && echo '✅ Install certbot and obtain SSL certificate' || echo '⏭️  Skip SSL (no DDNS configured)')
  4. ✅ Write configuration
  5. ✅ Install systemd service

Press OK to proceed." 16 60

# Install Node.js if not present
if ! command -v node &>/dev/null; then
    log_info "Installing Node.js..."
    if command -v apt-get &>/dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif command -v dnf &>/dev/null; then
        sudo dnf install -y nodejs npm
    elif command -v pacman &>/dev/null; then
        sudo pacman -S --noconfirm nodejs npm
    else
        log_err "Cannot auto-install Node.js. Please install it manually."
        exit 1
    fi
    log_ok "Node.js installed: $(node --version)"
else
    log_ok "Node.js found: $(node --version)"
fi

# Install npm packages
log_info "Installing npm packages..."
cd "$SCRIPT_DIR"
npm install --production
log_ok "npm packages installed"

# Let's Encrypt setup
if [ "$USE_LETSENCRYPT" = true ]; then
    log_info "Setting up Let's Encrypt..."

    # Install certbot
    if ! command -v certbot &>/dev/null; then
        log_info "Installing certbot..."
        if command -v apt-get &>/dev/null; then
            sudo apt-get install -y certbot
        elif command -v dnf &>/dev/null; then
            sudo dnf install -y certbot
        elif command -v pacman &>/dev/null; then
            sudo pacman -S --noconfirm certbot
        fi
    fi

    log_ok "certbot found: $(certbot --version 2>&1)"

    # Obtain certificate
    log_info "Obtaining SSL certificate for $DDNS_DOMAIN..."
    log_warn "Make sure port 80 is open and forwarded to this machine!"

    sudo certbot certonly --standalone \
        --agree-tos \
        --no-eff-email \
        --email "$LE_EMAIL" \
        -d "$DDNS_DOMAIN" \
        --non-interactive || {
            log_err "certbot failed. Make sure:"
            log_err "  1. Port 80 is open and forwarded to this machine"
            log_err "  2. Your DDNS domain ($DDNS_DOMAIN) points to your public IP"
            log_err "  3. No other service is using port 80"
            log_warn "You can retry later with: sudo certbot certonly --standalone -d $DDNS_DOMAIN"
        }

    CERT_PATH="/etc/letsencrypt/live/$DDNS_DOMAIN/fullchain.pem"
    KEY_PATH="/etc/letsencrypt/live/$DDNS_DOMAIN/privkey.pem"

    # Setup auto-renewal cron
    if [ -f "$CERT_PATH" ]; then
        log_info "Setting up certificate auto-renewal..."
        CRON_LINE="0 3 * * 1 certbot renew --quiet --post-hook 'systemctl restart $SERVICE_NAME'"
        (sudo crontab -l 2>/dev/null | grep -v certbot; echo "$CRON_LINE") | sudo crontab -
        log_ok "Auto-renewal cron installed (every Monday at 3 AM)"
    fi
fi

# ═══════════════════════════════════════════════════════════
# Write Configuration
# ═══════════════════════════════════════════════════════════
log_info "Writing configuration..."

cat > "$CONFIG_FILE" << EOF
{
    "projectsDir": "$PROJECTS_DIR",
    "domain": "$DDNS_DOMAIN",
    "sslCertPath": "$CERT_PATH",
    "sslKeyPath": "$KEY_PATH",
    "port": $SERVER_PORT,
    "cdpPort": 9000,
    "password": "$APP_PASSWORD"
}
EOF

log_ok "Configuration written to $CONFIG_FILE"

# Write .env file
cat > "$SCRIPT_DIR/.env" << EOF
PORT=$SERVER_PORT
APP_PASSWORD=$APP_PASSWORD
EOF

log_ok ".env file updated"

# ═══════════════════════════════════════════════════════════
# Install systemd service
# ═══════════════════════════════════════════════════════════
if command -v systemctl &>/dev/null; then
    log_info "Installing systemd service..."

    CURRENT_USER=$(whoami)
    NODE_PATH=$(which node)

    sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null << EOF
[Unit]
Description=Antigravity Remote — AI Session Remote Control
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=$CURRENT_USER
WorkingDirectory=$SCRIPT_DIR
ExecStart=$NODE_PATH $SCRIPT_DIR/server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable ${SERVICE_NAME}
    log_ok "systemd service installed and enabled"
else
    log_warn "systemd not found, skipping service installation"
fi

# ═══════════════════════════════════════════════════════════
# Port Information
# ═══════════════════════════════════════════════════════════
PORTS_INFO="Setup complete! Here are the ports you need to configure:\n\n"

if [ "$USE_LETSENCRYPT" = true ]; then
    PORTS_INFO+="  Port 80   — Let's Encrypt certificate renewal (TCP inbound)\n"
fi
PORTS_INFO+="  Port $SERVER_PORT — Antigravity Remote web interface (TCP inbound)\n"
PORTS_INFO+="  Port 9000 — Antigravity CDP debug port (local only, no forwarding needed)\n"
PORTS_INFO+="\nForward the above ports in your router to this machine's local IP.\n"
PORTS_INFO+="Port 9000 is used only locally and does NOT need to be forwarded."

$DLG --title "Setup Complete! 🎉" --msgbox "$PORTS_INFO\n\n\
To start the service now:\n\
  sudo systemctl start $SERVICE_NAME\n\n\
To check status:\n\
  sudo systemctl status $SERVICE_NAME\n\n\
To view logs:\n\
  journalctl -u $SERVICE_NAME -f\n\n\
Or run manually:\n\
  cd $SCRIPT_DIR && node server.js" 24 65

log_ok "Antigravity Remote setup complete!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Configuration: $CONFIG_FILE"
echo "  Service name:  $SERVICE_NAME"
echo "  Projects dir:  $PROJECTS_DIR"
[ -n "$DDNS_DOMAIN" ] && echo "  Domain:        $DDNS_DOMAIN"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
