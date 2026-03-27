# 关于

本项目是学习 ruby 和 rails 练手的，目前仅有基础的聊天功能。
把该死的微信搬到网页。

# 环境

1. 微信协议（main 分支是 857，861 分支是 861）
2. PostgreSQL 数据库，存储数据

# 使用

## compose 方式

1. `git clone https://github.com/Nimbly8836/wechat_rails.git`
2. `cd compose-config`
3. 配置 config 下的配置项
4. build `docker compose build app`
5. 运行 `docker compose up -d`

### Docker 启动时自动跑数据库 merge 脚本

默认不会执行任何自定义 merge 脚本。

- 开关：`RUN_DB_MERGE_SCRIPT=0`
- 脚本路径：`DB_MERGE_SCRIPT_PATH=/rails/bin/db-merge`

只有当 `RUN_DB_MERGE_SCRIPT=1` 时，容器启动阶段才会在 `db:prepare` 之后执行这个脚本。

更推荐这样做，而不是默认总是执行，因为 merge 脚本通常有副作用，容器重启时重复执行可能带来重复写入、慢启动或脏状态。

## 关于微信服务端

1. 微信服务来源于互联网，修改了一点小问题，自己部署应该没有什么「安全性」的问题。

### 使用

镜像是这个；`docker pull finalpi/wx2tg-server:v4-latest`

compose 文件运行

```yaml

services:
    
  wx2tg-server:
    image: finalpi/wx2tg-server:v3-latest # Pull image
    container_name: wx2tg-server
    ports:
      - "8059:8058"

    # config 文件, 下面有说明 名称是 app.conf
    volumes:
      - ./conf:/usr/wic-go/conf
    restart: unless-stopped
    # 不需要 redis 可以删除
    depends_on:
      - wx2tg-redis

  # 这里你有 Redis 服务可以注释
  wx2tg-redis:
    image: redis:7.2
    container_name: wx2tg-redis
    # ports: 你需要访问可以放出来这个端口
    #  - "16379:6379"
    volumes:
      - ./redis-data:/data
    command: ["redis-server", "--appendonly", "yes"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped

```

```txt

appname = wxapi
httpaddr = "0.0.0.0"
httpport = 8058
runmode = prod
viewspath = "template"
autorender = false
copyrequestbody = true
EnableDocs = true

# redis 配置
redislink = 10.0.0.230:36379
redispass = ""
redisdbnum = 5


syncmessage = true
msgpush = false
# 需要能访问到的地址
syncmessagebusinessuri = "http://127.0.0.1:3000/message/callback/{0}"
logoutbusinessuri = ""

sessionon = true

SessionName = "wxapi"
ServerName = "wxapi"

longlinkenabled = true
longlinkconnecttimeout = "30m"

# mq 暂时没实现
rabbitmq = false
rabbitmqurl = "amqp://guest:guest@10.10.11.7:5672/"
rabbitmqexchange = "wxapi"

ocrurl = ""


```
