# 外部 API 地址整理

这份文档只整理仓库里和“外部接口地址”相关的内容，重点是你当前依赖的上游微信协议接口地址，方便后面核对上游是否改了路径。

## 1. 基础配置入口

- Rails 侧统一通过 `BaseApiService#build_url` 拼接请求地址：`#{base_url}#{path}`。
- 默认本地配置在 `config/wechat_api.yml`。
- compose 配置在 `compose-config/config/wechat_api.yml`。

### 本地默认配置

- `base_url`: `http://127.0.0.1:8059/api`
- `callback_url`: `http://127.0.0.1:3000/message/callback/{0}`

### compose 配置

- `base_url`: `http://wechat-rails-app:8059/api`
- `callback_url`: `http://wechat-rails-app/message/callback/{0}`

说明：

- `callback_url` 不是 Rails 主动请求上游，而是上游微信服务回调 Rails 用的地址。
- compose 场景下，上游容器里的 `compose-config/config/app.conf` 也要把 `syncmessagebusinessuri` 配成同一个回调地址。
- 固定接口路径都集中定义在 `app/models/wechat_apis.rb`。
- 绝大多数上游请求都是 `POST`。
- 即使路径里带查询参数，例如 `?uuid=`、`?wxid=`，当前代码里仍然是 `POST`。

## 2. 当前代码里实际使用中的固定上游接口

下面这些是目前代码里真正会打到上游的接口。

### 登录相关

二维码登录接口根据协议不同会切换路径：

| 协议 | 路径 |
| --- | --- |
| `iPad` | `/Login/LoginGetQR` |
| `Car` | `/Login/LoginGetQRCar` |
| `APad` | `/Login/LoginGetQRPad` |
| `Mac` | `/Login/LoginGetQRMac` |
| `Windows` | `/Login/LoginGetQRWin` |
| `WindowsUwp` | `/Login/LoginGetQRWinUnified` |
| `iPadX` | `/Login/LoginGetQRx` |
| `APadX` | `/Login/LoginGetQRPadx` |
| `WindowsUwpX` | `/Login/LoginGetQRWinUwp` |

另外还实际使用了：

| 方法 | 路径 | 本地完整地址示例 | 用途 |
| --- | --- | --- | --- |
| `POST` | `/Login/LoginCheckQR?uuid={uuid}` | `http://127.0.0.1:8059/api/Login/LoginCheckQR?uuid={uuid}` | 检查扫码登录状态 |
| `POST` | `/Login/AutoHeartBeat` | `http://127.0.0.1:8059/api/Login/AutoHeartBeat` | 登录后自动心跳 |

对应代码：

- `app/services/wechat_login_service.rb`
- `app/controllers/login_controller.rb`

### 联系人相关

| 方法 | 路径 | 本地完整地址示例 | 用途 |
| --- | --- | --- | --- |
| `POST` | `/Friend/GetContractList` | `http://127.0.0.1:8059/api/Friend/GetContractList` | 拉取联系人列表 |
| `POST` | `/Friend/GetContractDetail` | `http://127.0.0.1:8059/api/Friend/GetContractDetail` | 拉取联系人详情、群成员详情 |

对应代码：

- `app/services/contact_api_service.rb`
- `app/jobs/sync_create_contacts_job.rb`
- `app/jobs/sync_chat_room_members_job.rb`
- `app/controllers/chat_room_controller.rb`
- `app/controllers/login_controller.rb`

### 消息发送相关

| 方法 | 路径 | 本地完整地址示例 | 用途 |
| --- | --- | --- | --- |
| `POST` | `/Msg/SendTxt` | `http://127.0.0.1:8059/api/Msg/SendTxt` | 发送文本消息 |
| `POST` | `/Msg/UploadImg` | `http://127.0.0.1:8059/api/Msg/UploadImg` | 发送图片消息 |
| `POST` | `/Msg/SendApp` | `http://127.0.0.1:8059/api/Msg/SendApp` | 发送 app/file 类消息 |

对应代码：

- `app/services/message_api_service.rb`
- `app/services/message_sender.rb`

### 多媒体/工具相关

| 方法 | 路径 | 本地完整地址示例 | 用途 |
| --- | --- | --- | --- |
| `POST` | `/Tools/DownloadVoice` | `http://127.0.0.1:8059/api/Tools/DownloadVoice` | 下载语音 |
| `POST multipart/form-data` | `/Tools/UploadFileBinary` | `http://127.0.0.1:8059/api/Tools/UploadFileBinary` | 上传文件二进制 |
| `POST` | `/Tools/CdnDownloadImage` | `http://127.0.0.1:8059/api/Tools/CdnDownloadImage` | 通过 CDN 信息取图片 |
| `POST` | `/Tools/DownloadImg` | `http://127.0.0.1:8059/api/Tools/DownloadImg` | 分片下载图片 |
| `POST` | `/Tools/DownloadVideo` | `http://127.0.0.1:8059/api/Tools/DownloadVideo` | 分片下载视频 |
| `POST` | `/Tools/DownloadFile` | `http://127.0.0.1:8059/api/Tools/DownloadFile` | 分片下载文件 |

对应代码：

- `app/services/tools_api_service.rb`
- `app/controllers/messages_controller.rb`
- `app/services/message_sender.rb`

## 3. 已定义但当前没有实际走到的接口

这些路径在 `app/models/wechat_apis.rb` 里已经定义了，但我没有在当前业务流程里找到有效调用，或者调用代码被注释掉了。

### 登录/消息

- `/Login/LoginTwiceAutoAuth?wxid={wxid}`
- `/Msg/Sync`
- `/Msg/Revoke`

说明：

- `re_login` 方法存在，但 `LoginController#reconnect_user` 里实际调用被注释掉了。
- `sync_messages` 方法存在，但 `MessagesController#callback` 里实际调用被注释掉了。

### Tools

- `/Tools/GeneratePayQCode`
- `/Tools/GetA8Key`
- `/Tools/GetBandCardList`
- `/Tools/GetBoundHardDevices`
- `/Tools/GetCdnDns`
- `/Tools/OauthSdkApp`
- `/Tools/ThirdAppGrant`
- `/Tools/UpdateStepNumberApi`
- `/Tools/UploadFile`
- `/Tools/setproxy`

### Group

- `/group/list/{protocol_path}`
- `/group/details/{protocol_path}`
- `/group/create/{protocol_path}`

### 可疑占位

- `WechatApis::Contact.add` 当前返回的是 `/`，看起来像占位实现，不像可直接用的真实接口。

## 4. 非固定 API 路径，但也属于外部地址访问

这些不是你写死的上游 API 路径，而是运行时会访问的外部 URL。

### 联系人头像直链

- 来源字段：`Contact#avatar_url`
- 实际来源：`big_head_img_url` 或 `small_head_img_url`
- 请求方式：`GET`
- 用途：创建聊天室时拉取头像

对应代码：

- `app/models/contact.rb`
- `app/controllers/chat_room_controller.rb`
- `app/jobs/save_chat_room_message_job.rb`

### 表情 CDN 直链

- 来源字段：`wx_message.parse_emoji[:cdn_url]`
- 请求方式：`GET`
- 用途：下载表情原图

对应代码：

- `app/controllers/messages_controller.rb`

说明：

- 这类地址不是固定配置，通常是上游接口返回的动态 URL。
- 如果你担心“接口路径变了”，优先盯固定上游接口。
- 如果你担心“资源下载地址失效”，再额外盯头像和表情 CDN。

## 5. 最应该优先关注的文件

如果后面要核对上游有没有改地址，先看这几个文件：

- `config/wechat_api.yml`
- `compose-config/config/wechat_api.yml`
- `app/models/wechat_apis.rb`
- `app/services/wechat_login_service.rb`
- `app/services/contact_api_service.rb`
- `app/services/message_api_service.rb`
- `app/services/tools_api_service.rb`

## 6. 一眼看完版

你当前真正依赖的固定上游接口，如果把不同协议的二维码路径分别计算，一共是 22 个：

1. `/Login/LoginGetQR`
2. `/Login/LoginGetQRCar`
3. `/Login/LoginGetQRPad`
4. `/Login/LoginGetQRMac`
5. `/Login/LoginGetQRWin`
6. `/Login/LoginGetQRWinUnified`
7. `/Login/LoginGetQRx`
8. `/Login/LoginGetQRPadx`
9. `/Login/LoginGetQRWinUwp`
10. `/Login/LoginCheckQR?uuid={uuid}`
11. `/Login/AutoHeartBeat`
12. `/Friend/GetContractList`
13. `/Friend/GetContractDetail`
14. `/Msg/SendTxt`
15. `/Msg/UploadImg`
16. `/Msg/SendApp`
17. `/Tools/DownloadVoice`
18. `/Tools/UploadFileBinary`
19. `/Tools/CdnDownloadImage`
20. `/Tools/DownloadImg`
21. `/Tools/DownloadVideo`
22. `/Tools/DownloadFile`

如果按“协议二维码接口算一组”，那就是 14 组核心上游地址：

1. `/Login/<不同协议的二维码路径>`
2. `/Login/LoginCheckQR?uuid={uuid}`
3. `/Login/AutoHeartBeat`
4. `/Friend/GetContractList`
5. `/Friend/GetContractDetail`
6. `/Msg/SendTxt`
7. `/Msg/UploadImg`
8. `/Msg/SendApp`
9. `/Tools/DownloadVoice`
10. `/Tools/UploadFileBinary`
11. `/Tools/CdnDownloadImage`
12. `/Tools/DownloadImg`
13. `/Tools/DownloadVideo`
14. `/Tools/DownloadFile`
