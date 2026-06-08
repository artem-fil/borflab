set -euxo pipefail
cd borflab
sudo mkdir -p /opt/borflab
sudo chown -R borflab:borflab /opt/borflab
sudo install -o borflab -g borflab /tmp/borflab /opt/borflab/borflab
sudo chown -R borflab:borflab /opt/borflab
sudo systemctl restart borflab