#!/usr/bin/env bash
# ==============================================================================
# JARVIS & N8N — INSTALADOR OFICIAL DE DEPENDÊNCIAS PARA ORACLE CLOUD VM
# Especificação Alvo: Instância Oracle Cloud (2 OCPU, 12GB RAM, Ubuntu 22.04/24.04 ou Oracle Linux)
# Arquitetura: Processamento Assíncrono (BullMQ/Redis), PGVector, Qdrant, n8n, Evolution API & Agentes
# ==============================================================================

set -euo pipefail

echo "=============================================================================="
echo "🚀 INICIANDO INSTALAÇÃO COMPLETA DO ECOSSISTEMA JARVIS + N8N (2 OCPU / 12GB RAM)"
echo "=============================================================================="

# 1. Atualização de pacotes do sistema operacional e dependências de compilação
sudo apt-get update -y && sudo apt-get upgrade -y
sudo apt-get install -y \
  curl wget git build-essential ca-certificates gnupg lsb-release \
  python3 python3-pip python3-venv python3-dev ffmpeg libsm6 libxext6 \
  ufw jq net-tools htop unzip

# 2. Configuração de Swap de Segurança (4GB) para proteger os 12GB de RAM contra picos
if [ ! -f /swapfile ]; then
  echo "💾 Criando arquivo de Swap de 4GB para estabilidade de memória..."
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

# 3. Instalação do Node.js 20 LTS + PM2 + tsx
if ! command -v node &> /dev/null; then
  echo "🟢 Instalando Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
sudo npm install -g pm2 tsx typescript

# 4. Instalação do Docker Engine & Docker Compose Plugin
if ! command -v docker &> /dev/null; then
  echo "🐳 Instalando Docker Engine..."
  curl -fsSL https://get.docker.com -o get-docker.sh
  sudo sh get-docker.sh
  sudo usermod -aG docker "$USER"
  rm -f get-docker.sh
fi
sudo apt-get install -y docker-compose-plugin

# 5. Abertura de Portas no Firewall (UFW & iptables Oracle Cloud)
echo "🛡️ Liberando portas 3000 (Jarvis Core), 5678 (n8n), 6333 (Qdrant) e 8080 (Evolution WhatsApp API)..."
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3000 -j ACCEPT || true
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 5678 -j ACCEPT || true
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 6333 -j ACCEPT || true
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 8080 -j ACCEPT || true
sudo netfilter-persistent save 2>/dev/null || true

# 6. Criação da Árvore de Diretórios do Ecossistema
mkdir -p ~/jarvis-oracle-vm/{workflows,scripts,sensory-agent,backups,postgres-init}
cd ~/jarvis-oracle-vm

# 7. Script de Inicialização do PostgreSQL 16 com extensão pgvector
cat << 'EOF' > ./postgres-init/01-init-pgvector.sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE DATABASE n8n_jarvis;
CREATE DATABASE evolution_whatsapp;
EOF

# 8. Ambiente Virtual Python para Camada Sensorial (Whisper Small + OpenCV/InsightFace + Captura JPEG q80)
echo "🐍 Configurando ambiente Python 3 para Camada Sensorial (STT Whisper + Biometria Facial + Screen Capture)..."
python3 -m venv ~/jarvis-oracle-vm/sensory-agent/venv
source ~/jarvis-oracle-vm/sensory-agent/venv/bin/activate
pip install --upgrade pip
pip install openai-whisper opencv-python-headless numpy Pillow mss requests websocket-client onnxruntime insightface
deactivate

echo "✅ Todas as dependências de Sistema, Docker, Node.js 20 e Python Sensorial foram instaladas!"
echo "👉 Agora execute: docker compose up -d"
