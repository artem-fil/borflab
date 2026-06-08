set -euxo pipefail
cd borflab
sudo install -m644 borflab.service /etc/systemd/system
sudo systemctl daemon-reload
sudo systemctl enable borflab.service