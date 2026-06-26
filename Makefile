# nginx-admin Makefile
BINARY := nginx-admin

.PHONY: proto build run vet tidy clean frontend

# 重新生成 protobuf 代码（需要 protoc + protoc-gen-go + protoc-gen-go-grpc）
proto:
	protoc --proto_path=api/proto \
		--go_out=internal/pb --go_opt=paths=source_relative \
		--go-grpc_out=internal/pb --go-grpc_opt=paths=source_relative \
		api/proto/agent.proto

# 构建前端（前端工程就绪后启用）：将产物输出到 web/dist
frontend:
	cd web && npm install && npm run build

build:
	go build -o bin/$(BINARY) ./cmd/nginx-admin

run:
	go run ./cmd/nginx-admin -config ./config.yaml

vet:
	go vet ./...

tidy:
	go mod tidy

clean:
	rm -rf bin
