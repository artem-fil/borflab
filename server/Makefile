dev:
	go run .


server = alexandria-dev
serv_user = borflab
dst = /opt/$(project)
services = borflab.service
project = borflab

build:
	go build -o /tmp/$(project)


## Setup
define setup_script
set -euxo pipefail
cd $(project)
sudo install -m644 $(services) /etc/systemd/system
sudo systemctl daemon-reload
sudo systemctl enable $(services)
endef

deploy-setup:
	ssh $(server) "mkdir -p $(project)"
	pushd ../ops/; scp $(services) $(server):$(project); popd
	$(file > /tmp/setup-$(project).sh,$(setup_script))
	ssh $(server) "bash -s" < /tmp/setup-$(project).sh

## Server

define deploy_server_script
set -euxo pipefail
cd $(project)
sudo mkdir -p $(dst)

sudo chown -R $(serv_user):$(serv_user) $(dst)
sudo install -o $(serv_user) -g $(serv_user) /tmp/$(project) $(dst)/$(project);

sudo chown -R $(serv_user):$(serv_user) $(dst)
sudo systemctl restart $(project)
endef

deploy-server: build
	scp /tmp/$(project) $(server):/tmp/
	$(file > /tmp/deploy-$(project).sh,$(deploy_server_script))
	ssh $(server) "bash -s" < /tmp/deploy-$(project).sh

## Client
define deploy_client_script
cd $(project)
tar xzf $(project)-client.tar.gz
sudo chown -R $(serv_user):$(serv_user) dist
sudo mkdir -p $(dst)/client
sudo mv $(dst)/client $(dst)/old_client || echo "mv: no old"
sudo mv dist $(dst)/client
sudo rm -rf $(dst)/old_client || echo "rm: no old"
endef

deploy-client:
	cd ../client && npm ci && npm run build
	pushd ../client; tar czf /tmp/$(project)-client.tar.gz ./dist; popd;
	scp -r /tmp/$(project)-client.tar.gz $(server):$(project)
	$(file > /tmp/deploy-client-$(project).sh,$(deploy_client_script))
	ssh $(server) "bash -s" < /tmp/deploy-client-$(project).sh

deploy: deploy-server deploy-client
