dev:
	go run .

server = alexandria-dev
serv_user = borflab
dst = /opt/$(project)
services = borflab.service
project = borflab

build:
	GOOS=linux GOARCH=amd64 go build -o /tmp/$(project)

deploy-setup:
	ssh $(server) "mkdir -p $(project)"
	pushd ../ops/ && scp $(services) $(server):$(project) && popd
	ssh $(server) "bash -s" < deploy/setup.sh

deploy-server: build
	scp /tmp/$(project) $(server):/tmp/
	ssh $(server) "bash -s" < deploy/server.sh

deploy-client:
	cd ../client && npm ci && npm run build
	pushd ../client && tar czf /tmp/$(project)-client.tar.gz ./dist && popd
	scp /tmp/$(project)-client.tar.gz $(server):$(project)
	ssh $(server) "bash -s" < deploy/client.sh

deploy: deploy-server deploy-client