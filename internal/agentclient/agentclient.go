package agentclient

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"os"
	"sync"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"

	"nginx-admin/internal/config"
	"nginx-admin/internal/pb"
)

// Client 管理到各 Agent 的 gRPC 连接（按地址缓存复用）。
type Client struct {
	cfg   config.AgentConfig
	mu    sync.Mutex
	conns map[string]*grpc.ClientConn
	creds credentials.TransportCredentials
}

func New(cfg config.AgentConfig) (*Client, error) {
	c := &Client{cfg: cfg, conns: make(map[string]*grpc.ClientConn)}
	if cfg.TLSEnabled {
		creds, err := buildClientTLS(cfg)
		if err != nil {
			return nil, err
		}
		c.creds = creds
	} else {
		c.creds = insecure.NewCredentials()
	}
	return c, nil
}

func buildClientTLS(cfg config.AgentConfig) (credentials.TransportCredentials, error) {
	cert, err := tls.LoadX509KeyPair(cfg.Cert, cfg.Key)
	if err != nil {
		return nil, fmt.Errorf("加载 admin 客户端证书失败: %w", err)
	}
	caPEM, err := os.ReadFile(cfg.CA)
	if err != nil {
		return nil, fmt.Errorf("读取 CA 失败: %w", err)
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(caPEM) {
		return nil, fmt.Errorf("解析 CA 失败")
	}
	return credentials.NewTLS(&tls.Config{
		Certificates: []tls.Certificate{cert},
		RootCAs:      pool,
		MinVersion:   tls.VersionTLS12,
	}), nil
}

func (c *Client) conn(address string) (*grpc.ClientConn, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if cc, ok := c.conns[address]; ok {
		return cc, nil
	}
	cc, err := grpc.NewClient(address, grpc.WithTransportCredentials(c.creds))
	if err != nil {
		return nil, fmt.Errorf("连接 Agent %s 失败: %w", address, err)
	}
	c.conns[address] = cc
	return cc, nil
}

func (c *Client) dialTimeout() time.Duration {
	if c.cfg.DialTimeoutSeconds <= 0 {
		return 15 * time.Second
	}
	return time.Duration(c.cfg.DialTimeoutSeconds) * time.Second
}

// withClient 取得 AgentServiceClient 与一个带超时的 ctx。
func (c *Client) withClient(ctx context.Context, address string) (pb.AgentServiceClient, context.Context, context.CancelFunc, error) {
	cc, err := c.conn(address)
	if err != nil {
		return nil, nil, nil, err
	}
	cctx, cancel := context.WithTimeout(ctx, c.dialTimeout())
	return pb.NewAgentServiceClient(cc), cctx, cancel, nil
}

// --- 以下为对各 RPC 的封装 ---

func (c *Client) Ping(ctx context.Context, address string) (*pb.PingReply, error) {
	cli, cctx, cancel, err := c.withClient(ctx, address)
	if err != nil {
		return nil, err
	}
	defer cancel()
	return cli.Ping(cctx, &pb.PingRequest{})
}

func (c *Client) GetStatus(ctx context.Context, address string) (*pb.StatusReply, error) {
	cli, cctx, cancel, err := c.withClient(ctx, address)
	if err != nil {
		return nil, err
	}
	defer cancel()
	return cli.GetStatus(cctx, &pb.StatusRequest{})
}

func (c *Client) Discover(ctx context.Context, address string) (*pb.DiscoverReply, error) {
	cli, cctx, cancel, err := c.withClient(ctx, address)
	if err != nil {
		return nil, err
	}
	defer cancel()
	return cli.DiscoverConfigs(cctx, &pb.DiscoverRequest{})
}

func (c *Client) ListConfigs(ctx context.Context, address string) (*pb.ListConfigsReply, error) {
	cli, cctx, cancel, err := c.withClient(ctx, address)
	if err != nil {
		return nil, err
	}
	defer cancel()
	return cli.ListConfigs(cctx, &pb.ListConfigsRequest{})
}

func (c *Client) ReadConfig(ctx context.Context, address, logicalPath string) (*pb.ReadConfigReply, error) {
	cli, cctx, cancel, err := c.withClient(ctx, address)
	if err != nil {
		return nil, err
	}
	defer cancel()
	return cli.ReadConfig(cctx, &pb.ReadConfigRequest{LogicalPath: logicalPath})
}

func (c *Client) WriteConfig(ctx context.Context, address string, req *pb.WriteConfigRequest) (*pb.WriteConfigReply, error) {
	cli, cctx, cancel, err := c.withClient(ctx, address)
	if err != nil {
		return nil, err
	}
	defer cancel()
	return cli.WriteConfig(cctx, req)
}

func (c *Client) DeleteConfig(ctx context.Context, address string, req *pb.DeleteConfigRequest) (*pb.DeleteConfigReply, error) {
	cli, cctx, cancel, err := c.withClient(ctx, address)
	if err != nil {
		return nil, err
	}
	defer cancel()
	return cli.DeleteConfig(cctx, req)
}

func (c *Client) TestConfig(ctx context.Context, address string) (*pb.TestConfigReply, error) {
	cli, cctx, cancel, err := c.withClient(ctx, address)
	if err != nil {
		return nil, err
	}
	defer cancel()
	return cli.TestConfig(cctx, &pb.TestConfigRequest{})
}

func (c *Client) Reload(ctx context.Context, address string) (*pb.ReloadReply, error) {
	cli, cctx, cancel, err := c.withClient(ctx, address)
	if err != nil {
		return nil, err
	}
	defer cancel()
	return cli.Reload(cctx, &pb.ReloadRequest{})
}

func (c *Client) ListBackups(ctx context.Context, address, logicalPath string) (*pb.ListBackupsReply, error) {
	cli, cctx, cancel, err := c.withClient(ctx, address)
	if err != nil {
		return nil, err
	}
	defer cancel()
	return cli.ListBackups(cctx, &pb.ListBackupsRequest{LogicalPath: logicalPath})
}

func (c *Client) Rollback(ctx context.Context, address string, req *pb.RollbackRequest) (*pb.RollbackReply, error) {
	cli, cctx, cancel, err := c.withClient(ctx, address)
	if err != nil {
		return nil, err
	}
	defer cancel()
	return cli.Rollback(cctx, req)
}

func (c *Client) GetAgentSettings(ctx context.Context, address string) (*pb.AgentSettingsReply, error) {
	cli, cctx, cancel, err := c.withClient(ctx, address)
	if err != nil {
		return nil, err
	}
	defer cancel()
	return cli.GetAgentSettings(cctx, &pb.GetAgentSettingsRequest{})
}

func (c *Client) UpdateAgentSettings(ctx context.Context, address string, req *pb.UpdateAgentSettingsRequest) (*pb.AgentSettingsReply, error) {
	cli, cctx, cancel, err := c.withClient(ctx, address)
	if err != nil {
		return nil, err
	}
	defer cancel()
	return cli.UpdateAgentSettings(cctx, req)
}

// Close 关闭所有连接。
func (c *Client) Close() {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, cc := range c.conns {
		_ = cc.Close()
	}
}
