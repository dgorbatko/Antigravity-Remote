#!/bin/bash
# Antigravity Remote — Setup Wizard
# Interactive installer using whiptail for GUI dialogs
set -e

# Detect script location or curl execution
if [ -n "$BASH_SOURCE" ]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
else
    SCRIPT_DIR="$PWD"
fi

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

# ═══════════════════════════════════════════════════════════
# Bootstrap for One-Liner Install from GitHub
# ═══════════════════════════════════════════════════════════
if [ ! -f "$SCRIPT_DIR/server.js" ]; then
    log_info "Running via network (curl/wget). Setting up local repository..."
    INSTALL_DIR="$HOME/.antigravity-remote"
    
    if command -v whiptail &>/dev/null; then
        USER_INPUT=$(whiptail --title "Installation Directory" --inputbox "Where should Antigravity Remote be installed?" 10 60 "$INSTALL_DIR" 3>&1 1>&2 2>&3) || exit 1
        INSTALL_DIR="${USER_INPUT:-$INSTALL_DIR}"
    fi
    
    if [ -d "$INSTALL_DIR/.git" ]; then
        log_info "Updating existing installation at $INSTALL_DIR..."
        cd "$INSTALL_DIR" && git pull || true
    else
        log_info "Cloning repository to $INSTALL_DIR..."
        if ! command -v git &>/dev/null; then
            log_err "Git is not installed. Please install git first."
            exit 1
        fi
        git clone https://github.com/dgorbatko/Antigravity-Remote.git "$INSTALL_DIR"
    fi
    
    log_info "Launching setup from $INSTALL_DIR..."
    exec bash "$INSTALL_DIR/setup.sh"
    exit 0
fi

CONFIG_FILE="$SCRIPT_DIR/config.json"
ENV_FILE="$SCRIPT_DIR/.env"
SERVICE_NAME="antigravity-remote"

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
    elif command -v dnf &>/dev/null; then
        sudo dnf install -y newt
    elif command -v pacman &>/dev/null; then
        sudo pacman -S --noconfirm libnewt
    else
        log_err "Cannot install whiptail. Please install it manually."
        exit 1
    fi
    DLG="whiptail"
fi

# Load existing defaults if re-running
DEFAULT_PROJECTS="$HOME/Projects"
DEFAULT_DOMAIN=""
DEFAULT_PORT="3001"
DEFAULT_PIN=""

if [ -f "$CONFIG_FILE" ]; then
    # Simple grep parsing for existing JSON config
    P=$(grep '"projectsDir"' "$CONFIG_FILE" | cut -d'"' -f4)
    [ -n "$P" ] && DEFAULT_PROJECTS="$P"
    
    D=$(grep '"domain"' "$CONFIG_FILE" | cut -d'"' -f4)
    [ -n "$D" ] && DEFAULT_DOMAIN="$D"
    
    PORT=$(grep '"port"' "$CONFIG_FILE" | awk -F': ' '{print $2}' | tr -d ',' | tr -d ' ')
    [ -n "$PORT" ] && DEFAULT_PORT="$PORT"
fi

if [ -f "$ENV_FILE" ]; then
    PIN=$(grep 'APP_PASSWORD=' "$ENV_FILE" | cut -d'=' -f2)
    [ -n "$PIN" ] && DEFAULT_PIN="$PIN"
fi

# ═══════════════════════════════════════════════════════════
# Step 0: Welcome Screen
# ═══════════════════════════════════════════════════════════
$DLG --title "Antigravity Remote — Setup Wizard" --msgbox "\
Welcome to the Antigravity Remote setup wizard!

This installer will configure or update:

  1. 📁 Projects directory — where your coding projects live
  2. 🌐 DDNS domain — for remote access from anywhere
  3. 🔒 Let's Encrypt SSL — free trusted HTTPS certificate
  4. 🔑 Web UI PIN Code — secure access password
  5. ⚙️  System service — auto-start on boot

Press OK to begin." 20 60

# ═══════════════════════════════════════════════════════════
# Step 1: Projects Directory
# ═══════════════════════════════════════════════════════════
PROJECTS_DIR=$($DLG --title "Step 1/6: Projects Directory" \
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
# Step 2: Web UI PIN Code / Password
# ═══════════════════════════════════════════════════════════
APP_PASSWORD=$($DLG --title "Step 2/6: Web UI PIN Code" \
    --passwordbox "\
Set a PIN code or password for the Antigravity Remote Web UI.

This protects your AI sessions from unauthorized access from the internet.
(The server includes built-in brute-force protection to prevent hacking this PIN)

Leave blank to keep existing password, or enter a new one." \
    15 65 3>&1 1>&2 2>&3) || exit 1

if [ -z "$APP_PASSWORD" ]; then
    if [ -n "$DEFAULT_PIN" ]; then
        APP_PASSWORD="$DEFAULT_PIN"
        log_info "Keeping existing PIN code."
    else
        APP_PASSWORD="antigravity"
        log_warn "No PIN set, using default: antigravity"
    fi
fi

# ═══════════════════════════════════════════════════════════
# Step 3: DDNS Provider Recommendation & Domain
# ═══════════════════════════════════════════════════════════
if [ -z "$DEFAULT_DOMAIN" ]; then
    $DLG --title "Step 3/6: DDNS Setup" --msgbox "\
To access Antigravity Remote securely from outside your local network,
you need a Dynamic DNS (DDNS) hostname.

Recommended FREE DDNS providers:
  🦆 Duck DNS (duckdns.org)
  🌐 No-IP (noip.com)
  🔄 Dynu (dynu.com)

Press OK to enter your DDNS hostname." 16 65
fi

DDNS_DOMAIN=$($DLG --title "Step 3/6: DDNS Domain" \
    --inputbox "\
Enter your DDNS hostname (e.g. mypc.duckdns.org).

If you want to skip DDNS and use only local network (HTTP),
leave this empty and press OK." \
    12 60 "$DEFAULT_DOMAIN" 3>&1 1>&2 2>&3) || exit 1

USE_LETSENCRYPT=false
CERT_PATH=""
KEY_PATH=""

# ═══════════════════════════════════════════════════════════
# Step 4: SSL Certificate Setup (Let's Encrypt or Custom)
# ═══════════════════════════════════════════════════════════
LE_EMAIL=""
if [ -n "$DDNS_DOMAIN" ]; then
    if $DLG --title "Step 4/6: SSL Certificate" --yesno "\
Do you already have SSL certificate files (fullchain.pem / privkey.pem) on this machine that you want to use?

Choose YES to provide paths to existing certificates.
Choose NO to automatically generate new ones using Let's Encrypt." 12 70; then
        
        # User has existing certs
        USE_LETSENCRYPT=false
        
        CERT_PATH=$($DLG --title "Existing Certificate" \
            --inputbox "Enter the absolute path to your certificate file (e.g. fullchain.pem or .crt):" \
            10 70 "$CERT_PATH" 3>&1 1>&2 2>&3) || exit 1
            
        KEY_PATH=$($DLG --title "Existing Private Key" \
            --inputbox "Enter the absolute path to your private key file (e.g. privkey.pem or .key):" \
            10 70 "$KEY_PATH" 3>&1 1>&2 2>&3) || exit 1
            
        if [ ! -f "$CERT_PATH" ] || [ ! -f "$KEY_PATH" ]; then
            log_warn "One or both certificate files not found at specified paths. They will be saved in config, but HTTPS might fail to start if they remain missing."
        fi
        
    else
        # User wants to use certbot
        LE_EMAIL=$($DLG --title "Step 4/6: Let's Encrypt SSL" \
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
fi

# ═══════════════════════════════════════════════════════════
# Step 5: Server Port
# ═══════════════════════════════════════════════════════════
if [ "$USE_LETSENCRYPT" = true ] || [ -n "$CERT_PATH" ]; then
    DEFAULT_PORT="443"
fi

SERVER_PORT=$($DLG --title "Step 5/6: Server Port" \
    --inputbox "\
Enter the port for Antigravity Remote.

Default: 443 (standard HTTPS) if using Let's Encrypt
Default: 3001 if using local network only

Note: Ports below 1024 require root or a reverse proxy." \
    14 60 "$DEFAULT_PORT" 3>&1 1>&2 2>&3) || exit 1

# ═══════════════════════════════════════════════════════════
# Step 6: Install Dependencies
# ═══════════════════════════════════════════════════════════
$DLG --title "Step 6/6: Install Dependencies" --msgbox "\
The installer will now:

  1. ✅ Install Node.js (if not present)
  2. ✅ Install npm packages
  3. $(if [ "$USE_LETSENCRYPT" = true ]; then echo '✅ Install certbot and obtain SSL certificate'; elif [ -n "$CERT_PATH" ]; then echo '✅ Use existing custom SSL certificate'; else echo '⏭️  Skip SSL (no DDNS)'; fi)
  4. ✅ Write configuration
  5. ✅ Configure/Update systemd service

Press OK to proceed." 16 65

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
            log_err "  1. Port 80 is forwarded to this machine in your router"
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
else
    # Keep existing paths if they exist
    if [ -f "$CONFIG_FILE" ]; then
        C=$(grep '"sslCertPath"' "$CONFIG_FILE" | cut -d'"' -f4)
        [ -n "$C" ] && CERT_PATH="$C"
        K=$(grep '"sslKeyPath"' "$CONFIG_FILE" | cut -d'"' -f4)
        [ -n "$K" ] && KEY_PATH="$K"
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
# We don't overwrite SESSION_SECRET or AUTH_SALT if they exist
SESSION_SECRET=$(grep 'SESSION_SECRET=' "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 || true)
AUTH_SALT=$(grep 'AUTH_SALT=' "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 || true)

[ -z "$SESSION_SECRET" ] && SESSION_SECRET=$(head -c 32 /dev/urandom | base64 | tr -d '+/' | head -c 24)
[ -z "$AUTH_SALT" ] && AUTH_SALT=$(head -c 16 /dev/urandom | base64 | tr -d '+/' | head -c 12)

cat > "$ENV_FILE" << EOF
PORT=$SERVER_PORT
APP_PASSWORD=$APP_PASSWORD
SESSION_SECRET=$SESSION_SECRET
AUTH_SALT=$AUTH_SALT
EOF

log_ok ".env file updated with secure salts"

# ═══════════════════════════════════════════════════════════
# Install systemd service
# ═══════════════════════════════════════════════════════════
if command -v systemctl &>/dev/null; then
    log_info "Configuring systemd service..."

    CURRENT_USER=$(whoami)
    NODE_PATH=$(which node)

    # Use a temporary file to prevent empty sudo tee issues
    TMP_SERVICE=$(mktemp)
    cat > "$TMP_SERVICE" << EOF
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

    sudo mv "$TMP_SERVICE" /etc/systemd/system/${SERVICE_NAME}.service
    sudo systemctl daemon-reload
    sudo systemctl enable ${SERVICE_NAME}
    
    # Restart the service to apply changes
    sudo systemctl restart ${SERVICE_NAME}
    log_ok "systemd service installed, enabled, and restarted"
else
    log_warn "systemd not found, skipping service configuration"
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
PORTS_INFO+="CDP Port (9000) is used only locally and does NOT need to be forwarded."

$DLG --title "Setup Complete! 🎉" --msgbox "$PORTS_INFO\n\n\
Your Web UI PIN Code is active and protected against brute-force attacks.\n\n\
To check service status:\n\
  sudo systemctl status $SERVICE_NAME\n\n\
To view live logs:\n\
  journalctl -u $SERVICE_NAME -f" 24 68

log_ok "Antigravity Remote setup complete!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Configuration: $CONFIG_FILE"
echo "  Service name:  $SERVICE_NAME"
echo "  Projects dir:  $PROJECTS_DIR"
[ -n "$DDNS_DOMAIN" ] && echo "  Domain:        $DDNS_DOMAIN"
[ -n "$APP_PASSWORD" ] && echo "  Security:      PIN protection ACTIVE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
