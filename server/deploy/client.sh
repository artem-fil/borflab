set -euxo pipefail
cd borflab
tar xzf borflab-client.tar.gz
sudo chown -R borflab:borflab dist
sudo mkdir -p /opt/borflab/client
sudo mv /opt/borflab/client /opt/borflab/old_client || echo "mv: no old"
sudo mv dist /opt/borflab/client
sudo rm -rf /opt/borflab/old_client || echo "rm: no old"